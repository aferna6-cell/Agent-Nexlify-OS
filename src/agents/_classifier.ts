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
  const scored = registry
    .routable()
    .map((agent) => {
      let score = 0;
      for (const kw of agent.keywords) if (a.includes(kw.toLowerCase())) score += 1;
      for (const sig of agent.strong_signals) if (a.includes(sig.toLowerCase())) score += 3;
      return { agentId: agent.agent_id, score };
    })
    .filter((c) => c.score > 0);

  // §11 rule 6 — complaint language short-circuits Customer Question.
  if (complaintLanguage(ask)) {
    const ch = scored.find((c) => c.agentId === "complaint_handler");
    if (ch) ch.score += 5;
  }
  // §11 rule 5 — $ amount + "quote" + follow-up wording → Quote Follow-up.
  if (/\$\s?\d/.test(ask) && a.includes("quote") && /(follow up|follow-up|chase|didn'?t book|hasn'?t booked)/.test(a)) {
    const qf = scored.find((c) => c.agentId === "quote_follow_up");
    if (qf) qf.score += 5;
  }

  const candidates = scored
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

export async function classifyWithHaiku(ask: string, runId?: string): Promise<Classification | null> {
  if (!isModelAvailable()) return null;
  const { system, prompt } = buildRoutingPrompt(ask);
  try {
    const res = await complete({ purpose: "routing", system, prompt, maxTokens: 400, runId });
    const parsed = parseHaiku(res.text);
    if (!parsed?.routed_to || !registry.has(parsed.routed_to)) return null;

    const candidates: Candidate[] = [
      { agentId: parsed.routed_to, confidence: clamp(parsed.confidence ?? 0.5) },
      ...(parsed.alternates ?? [])
        .filter((x): x is { agent_id: string; confidence?: number } => !!x.agent_id && registry.has(x.agent_id))
        .map((x) => ({ agentId: x.agent_id, confidence: clamp(x.confidence ?? 0) })),
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

/** Classify an ask: Haiku when available, else the heuristic fallback. */
export async function classify(ask: string, runId?: string): Promise<Classification> {
  const viaHaiku = await classifyWithHaiku(ask, runId);
  if (viaHaiku && viaHaiku.candidates.length > 0) return viaHaiku;
  return classifyHeuristic(ask);
}
