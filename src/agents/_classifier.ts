/**
 * Routing classifier.
 *
 * Two strategies behind one interface:
 *  - Haiku (`classifyWithHaiku`): a structured-output prompt returns JSON
 *    { routed_to, confidence, extracted_params, alternates }. Used in production.
 *  - Heuristic (`classifyHeuristic`): a transparent keyword/signal scorer with
 *    the §11 special rules. Used as the offline/CI fallback and when Haiku is
 *    unavailable or returns unparseable output.
 *
 * `classify()` prefers Haiku when an API key is present, else the heuristic — so
 * the routing layer is solid and inspectable in every environment.
 */

import { registry } from "./_registry.js";
import { extractParams } from "./_extract.js";
import { complete, isModelAvailable, ModelUnavailableError } from "../lib/anthropic.js";

export interface Candidate {
  agentId: string;
  confidence: number;
}

export interface Classification {
  classifier: "haiku" | "heuristic";
  candidates: Candidate[];
  params: Record<string, unknown>;
}

// --- Heuristic -------------------------------------------------------------

function complaintLanguage(ask: string): boolean {
  return /(furious|angry|upset|unhappy|disappointed|terrible|worst|ruined|scratch|damaged|refund|complaint|complained)/i.test(ask);
}

export function classifyHeuristic(ask: string): Classification {
  const a = ask.toLowerCase();
  // Score every routable agent first (boosts may apply even to a 0-score agent),
  // then filter to positives.
  const scored = registry.routable().map((agent) => {
    let score = 0;
    for (const kw of agent.keywords) if (a.includes(kw.toLowerCase())) score += 1;
    for (const sig of agent.strong_signals) if (a.includes(sig.toLowerCase())) score += 3;
    return { agentId: agent.agent_id, score };
  });

  // v2 department-level routing boosts. Intra-department skill choice (e.g.
  // quote_follow_up vs quote_generator) is handled later by pickSkill, so these
  // only need to land the ask in the right DEPARTMENT.

  // A day-of-week + clock time strongly implies scheduling → Operations, even
  // without an explicit booking keyword ("Mike called wanting a tire rotation
  // Thursday at 10:30").
  const dayTime =
    /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(ask) && /\b(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/i.test(ask);
  if (dayTime) {
    const b = scored.find((c) => c.agentId === "operations");
    if (b) b.score += 4;
  }

  // Complaint language → Customer Service (the orchestrator also short-circuits
  // here; this keeps the heuristic candidate ordering sensible).
  if (complaintLanguage(ask)) {
    const ch = scored.find((c) => c.agentId === "customer_service");
    if (ch) ch.score += 5;
  }

  // Tax / financial language → Accounting. Checked BEFORE People so "payroll
  // TAX / quarterly filings" (a finance task) doesn't get grabbed by the People
  // "payroll" keyword (which is about paying/managing staff).
  const taxFinance = /\b(tax|taxes|quarterly|941|940|irs|deduction|filing|revenue|receivables|cash flow|profit|expenses?|bookkeep)\b/i.test(ask);
  if (taxFinance) {
    const ac = scored.find((c) => c.agentId === "accounting");
    if (ac) ac.score += 7;
  }

  // Hiring / HR / staff language → People (disambiguates from Marketing, since a
  // "Craigslist post" for an employee is a People task, not a marketing post).
  // Exclude tax/finance asks so "payroll taxes" stays with Accounting above.
  if (!taxFinance && /\b(hire|hiring|job post|craigslist|interview|employee|payroll|staff|new hire|training (doc|checklist)|handbook|write[- ]?up)\b/i.test(ask)) {
    const p = scored.find((c) => c.agentId === "people");
    if (p) p.score += 8; // decisive: a job/HR post is People, not Marketing
  }

  // Document / contract / CRM language → Customer Data & Administration.
  if (/\b(contract|agreement|intake form|service agreement|refund policy|one[- ]?pager|sop|template|update (his|her|their|the) record)\b/i.test(ask)) {
    const ar = scored.find((c) => c.agentId === "admin_records");
    if (ar) ar.score += 4;
  }

  const candidates = scored
    .filter((c) => c.score > 0)
    .sort((x, y) => y.score - x.score || x.agentId.localeCompare(y.agentId))
    .map((c) => ({ agentId: c.agentId, confidence: Number((c.score / (c.score + 2)).toFixed(3)) }));

  return { classifier: "heuristic", candidates, params: extractParams(ask) };
}

// --- Haiku -----------------------------------------------------------------

function buildRoutingPrompt(ask: string): { system: string; prompt: string } {
  const catalogue = registry
    .routable()
    .map((a) => `- ${a.agent_id} (${a.bucket}): ${a.purpose} Routes here when: ${a.routes_here_when.join("; ")}`)
    .join("\n");

  const system =
    "You are the routing classifier for Agent OS. Given an owner's natural-language " +
    "request, pick the single best-fit agent from the catalogue. Respond with ONLY a " +
    "JSON object, no prose, of the form:\n" +
    '{"routed_to": "agent_id", "confidence": 0.0-1.0, ' +
    '"extracted_params": {..}, "alternates": [{"agent_id": "..", "confidence": 0.0-1.0}]}\n' +
    "confidence is your calibrated probability that routed_to is correct. If nothing " +
    "fits well, return your best guess with a low confidence (<0.5).\n\n" +
    `Agent catalogue:\n${catalogue}`;

  return { system, prompt: `Owner request: "${ask}"` };
}

interface HaikuRouting {
  routed_to?: string;
  confidence?: number;
  extracted_params?: Record<string, unknown>;
  alternates?: { agent_id?: string; confidence?: number }[];
}

function parseHaiku(text: string): HaikuRouting | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as HaikuRouting;
  } catch {
    return null;
  }
}

/**
 * Map a model-returned id to a registered DEPARTMENT id. Haiku is prompted with
 * the 8 departments, but it occasionally returns a known SKILL name (e.g.
 * "booking" instead of "operations"). Rather than discard that and fall back to
 * the heuristic (which is why Operations sometimes showed up labeled
 * "heuristic"), map the skill back to its owning department so Haiku routing
 * holds. Returns the id if it's already a routable department.
 */
function toRoutableId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (registry.has(id) && registry.get(id).channel !== "internal") return id;
  const dept = registry.routable().find((d) => {
    const spec = (d as { __department?: { skills: { agent: { agent_id: string } }[] } }).__department;
    return spec?.skills.some((s) => s.agent.agent_id === id);
  });
  return dept?.agent_id;
}

export async function classifyWithHaiku(ask: string, runId?: string): Promise<Classification | null> {
  if (!isModelAvailable()) return null;
  const { system, prompt } = buildRoutingPrompt(ask);
  try {
    const res = await complete({ purpose: "routing", system, prompt, maxTokens: 400, runId });
    const parsed = parseHaiku(res.text);
    if (!parsed) return null;
    const routedTo = toRoutableId(parsed.routed_to);
    if (!routedTo) return null;

    const altCandidates: Candidate[] = [];
    for (const x of parsed.alternates ?? []) {
      const id = toRoutableId(x.agent_id);
      if (id && id !== routedTo) altCandidates.push({ agentId: id, confidence: clamp(x.confidence ?? 0) });
    }
    const candidates: Candidate[] = [
      { agentId: routedTo, confidence: clamp(parsed.confidence ?? 0.5) },
      ...altCandidates,
    ];
    const params = parsed.extracted_params ?? extractParams(ask);
    return { classifier: "haiku", candidates, params };
  } catch (err) {
    if (err instanceof ModelUnavailableError) return null;
    return null; // any model/parse failure → caller falls back to heuristic
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

/**
 * Classify an ask: Haiku when available, else the heuristic fallback.
 *
 * V-04: there is NO confidence "fast-path" that skips Haiku — every department,
 * including Operations/booking, goes through the same path. Haiku is always
 * attempted first when a key is present; the heuristic only runs as a genuine
 * fallback when Haiku is unavailable, errors, or returns an unmappable result
 * (see toRoutableId). So a "heuristic" label in the UI always means
 * fallback-was-used, never a deliberate shortcut.
 */
export async function classify(ask: string, runId?: string): Promise<Classification> {
  const viaHaiku = await classifyWithHaiku(ask, runId);
  if (viaHaiku && viaHaiku.candidates.length > 0) return viaHaiku;
  return classifyHeuristic(ask);
}
