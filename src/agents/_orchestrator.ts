/**
 * Orchestrator.
 *
 * Classifies the owner ask (Haiku when available, heuristic otherwise), applies
 * the confidence rules, runs the chosen agent with a streaming trace, persists
 * the draft, and logs the routing decision for later fine-tuning.
 *
 * Confidence rules:
 *  - top < 0.5            → fall back to Generalist + capture a wishlist item.
 *  - second within 0.1    → ambiguous: surface both to the owner, run nothing yet.
 *  - otherwise            → route to the top agent.
 *  - forceAgentId         → owner override (re-route after seeing the decision).
 */

import { db } from "../lib/db.js";
import { loadSharedContext } from "./_shared-context.js";
import { createTraceEmitter } from "./_trace.js";
import { registry } from "./_registry.js";
import { classify, type Candidate } from "./_classifier.js";
import type { AgentOutput, StreamedTraceStep } from "../types/agent.js";

const CONFIDENCE_FLOOR = 0.5;
const RESOLUTION_GAP = 0.1;

export type DecisionStatus = "routed" | "needs_clarification" | "wishlist_fallback" | "owner_override" | "direct_answer" | "declined";

export interface HandleResult {
  status: DecisionStatus;
  classifier: "haiku" | "heuristic";
  decisionId: string;
  runId?: string;
  agentId?: string;
  confidence: number;
  alternates: Candidate[];
  /** Present for needs_clarification: the two near-tied options. */
  clarifyBetween?: Candidate[];
  params: Record<string, unknown>;
  draftId?: string;
  draft?: AgentOutput["draft"];
  orchestratorNotes: string[];
  noDraftReason?: string;
  /** Set for direct_answer: the orchestrator's own answer (no agent involved). */
  answer?: string;
}

export interface HandleOptions {
  onStep?: (step: StreamedTraceStep) => void;
  /** Owner override: force routing to this agent (re-route from the picker). */
  forceAgentId?: string;
  /** When re-routing, mark this prior decision as not accepted. */
  overrodeDecisionId?: string;
}

export async function handle(userId: string, ask: string, opts: HandleOptions = {}): Promise<HandleResult> {
  // --- Direct answer: widget-activity questions the orchestrator answers itself
  // (no worker agent), per the product plan's "what came in through the widget?".
  if (!opts.forceAgentId && isWidgetQuery(ask)) {
    const ctx = await loadSharedContext(userId);
    const answer = summarizeWidget(ctx);
    const decision = await db.routingDecision.create({
      data: { userId, ask, classifier: "heuristic", decision: "direct_answer", chosenAgent: "orchestrator", confidence: 1 },
    });
    return { status: "direct_answer", classifier: "heuristic", decisionId: decision.id, confidence: 1, alternates: [], params: {}, orchestratorNotes: [], answer };
  }

  // --- Direct answer: a cross-department "weekly briefing" the orchestrator
  // aggregates from all 8 departments (v2 Decision 1). A department-specific
  // briefing ("the Sales briefing") falls through to normal routing.
  if (!opts.forceAgentId && isAggregateBriefingQuery(ask)) {
    const ctx = await loadSharedContext(userId);
    const answer = aggregateBriefing(ctx);
    const decision = await db.routingDecision.create({
      data: { userId, ask, classifier: "heuristic", decision: "direct_answer", chosenAgent: "orchestrator", confidence: 1 },
    });
    return { status: "direct_answer", classifier: "heuristic", decisionId: decision.id, confidence: 1, alternates: [], params: {}, orchestratorNotes: [], answer };
  }

  // --- Non-business asks → polite decline (v2 Decision 2: no Generalist) -------
  if (!opts.forceAgentId && isNonBusiness(ask)) {
    await captureWishlist(userId, ask, []);
    const decision = await db.routingDecision.create({
      data: { userId, ask, classifier: "heuristic", decision: "declined", chosenAgent: "none", confidence: 0 },
    });
    return {
      status: "declined",
      classifier: "heuristic",
      decisionId: decision.id,
      confidence: 0,
      alternates: [],
      params: {},
      orchestratorNotes: [
        "That looks like a personal task rather than a business one. Agent OS is built for your business work; for personal writing I'd recommend ChatGPT or Claude directly.",
      ],
    };
  }

  const cls = await classify(ask);
  const candidates = cls.candidates;
  const alternates = candidates.slice(1, 4);

  // --- Owner override -------------------------------------------------------
  if (opts.forceAgentId && registry.has(opts.forceAgentId)) {
    if (opts.overrodeDecisionId) {
      await db.routingDecision
        .update({ where: { id: opts.overrodeDecisionId }, data: { accepted: false, changedTo: opts.forceAgentId } })
        .catch(() => undefined);
    }
    const chosen = candidates.find((c) => c.agentId === opts.forceAgentId)?.confidence ?? 0;
    return runAndLog(userId, ask, opts.forceAgentId, chosen, candidates, cls.classifier, cls.params, "owner_override", opts.onStep);
  }

  // --- Complaint detection short-circuits to Customer Service (§11 rule 6) ----
  // Runs regardless of which classifier was used, so an angry message always
  // reaches Customer Service, which dispatches to its (hardcoded never-auto-send)
  // complaint skill.
  if (detectComplaint(ask)) {
    const conf = candidates.find((c) => c.agentId === "customer_service")?.confidence ?? 0.9;
    const res = await runAndLog(userId, ask, "customer_service", conf, candidates, cls.classifier, cls.params, "routed", opts.onStep);
    res.orchestratorNotes = ["Detected complaint language, so I routed this straight to Customer Service.", ...res.orchestratorNotes];
    return res;
  }

  const top = candidates[0];
  const second = candidates[1];

  // --- Low confidence → wishlist + nearest department (v2: no Generalist) -----
  // The 8 departments cover the genuine-business surface, so there's no catch-all
  // worker. We capture the unmet-need signal and run the NEAREST department,
  // telling the owner it was the closest match (and to pick another if wrong).
  if (!top || top.confidence < CONFIDENCE_FLOOR) {
    await captureWishlist(userId, ask, candidates);
    if (!top) {
      // Nothing scored at all — decline gracefully rather than guess.
      const decision = await db.routingDecision.create({
        data: { userId, ask, classifier: cls.classifier, decision: "wishlist_fallback", chosenAgent: "none", confidence: 0 },
      });
      return {
        status: "wishlist_fallback",
        classifier: cls.classifier,
        decisionId: decision.id,
        confidence: 0,
        alternates: [],
        params: cls.params,
        orchestratorNotes: [
          "I couldn't confidently match that to one of your departments, so I saved it to your wishlist. Could you rephrase it, or tell me which department should handle it?",
        ],
      };
    }
    const res = await runAndLog(userId, ask, top.agentId, top.confidence, candidates, cls.classifier, cls.params, "wishlist_fallback", opts.onStep);
    const nearest = registry.get(top.agentId).display_name;
    const otherAlts = alternates.filter((c) => c.agentId !== top.agentId);
    const others = otherAlts.length
      ? ` Other options I considered: ${otherAlts.map((a) => registry.get(a.agentId).display_name).join(" and ")}.`
      : "";
    res.orchestratorNotes = [
      `I wasn't fully sure which department fits, so I saved it to your wishlist and ran the closest match, ${nearest}.${others} Pick another above if that's not right.`,
      ...res.orchestratorNotes,
    ];
    return res;
  }

  // --- Ambiguous (top two within 0.1) → ask the owner ------------------------
  // Round the gap to avoid float artefacts (0.6 - 0.5 = 0.0999…).
  const gap = second ? Math.round((top.confidence - second.confidence) * 100) / 100 : 1;
  if (second && gap < RESOLUTION_GAP) {
    const a = registry.get(top.agentId);
    const b = registry.get(second.agentId);
    const decision = await db.routingDecision.create({
      data: {
        userId,
        ask,
        classifier: cls.classifier,
        decision: "ambiguous",
        chosenAgent: top.agentId,
        confidence: top.confidence,
        alternates: JSON.stringify(candidates),
      },
    });
    return {
      status: "needs_clarification",
      classifier: cls.classifier,
      decisionId: decision.id,
      confidence: top.confidence,
      alternates,
      clarifyBetween: [candidates[0]!, candidates[1]!],
      params: cls.params,
      orchestratorNotes: [
        `This could be ${a.display_name.toLowerCase()} or ${b.display_name.toLowerCase()} — which did you mean?`,
      ],
    };
  }

  // --- Confident route -------------------------------------------------------
  // A confident route to the Generalist still means no specialist matched — that
  // is an unmet-need signal, so capture it to the wishlist (the classifier may
  // be sure it's "general", but the backlog should still see the demand).
  if (top.agentId === "generalist") {
    await captureWishlist(userId, ask, candidates);
  }
  return runAndLog(userId, ask, top.agentId, top.confidence, candidates, cls.classifier, cls.params, "routed", opts.onStep);
}

async function runAndLog(
  userId: string,
  ask: string,
  agentId: string,
  confidence: number,
  candidates: Candidate[],
  classifier: "haiku" | "heuristic",
  params: Record<string, unknown>,
  decisionType: DecisionStatus | "wishlist_fallback",
  onStep?: (step: StreamedTraceStep) => void,
): Promise<HandleResult> {
  const agent = registry.get(agentId);

  const run = await db.agentRun.create({
    data: { userId, agentId, ownerAsk: ask, params: JSON.stringify(params), status: "running" },
  });

  const decision = await db.routingDecision.create({
    data: {
      userId,
      runId: run.id,
      ask,
      classifier,
      decision: decisionType,
      chosenAgent: agentId,
      confidence,
      alternates: JSON.stringify(candidates),
    },
  });

  const emit = createTraceEmitter(run.id, { onStep });
  await emit.work("route", `Routing to the ${agent.display_name} agent`);
  const context = await loadSharedContext(userId);

  let output: AgentOutput;
  try {
    output = await agent.run({ input: params, context, emitTrace: emit, ownerAsk: ask, runId: run.id, userId });
  } catch (err) {
    await db.agentRun.update({ where: { id: run.id }, data: { status: "failed" } });
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: decisionType === "owner_override" ? "owner_override" : "routed",
      classifier,
      decisionId: decision.id,
      runId: run.id,
      agentId,
      confidence,
      alternates: candidates.slice(1, 4),
      params,
      orchestratorNotes: [`Run failed: ${message}`],
    };
  }

  let draftId: string | undefined;
  if (output.draft) {
    const created = await db.draft.create({
      data: {
        runId: run.id,
        agentId,
        channel: output.draft.channel,
        title: output.draft.title,
        body: output.draft.body,
        metadata: output.draft.metadata ? JSON.stringify(output.draft.metadata) : null,
        requiresApproval: output.draft.requiresApproval,
      },
    });
    draftId = created.id;
    await db.agentRun.update({ where: { id: run.id }, data: { status: "completed" } });
  } else {
    await db.agentRun.update({ where: { id: run.id }, data: { status: "no_draft" } });
  }

  const status: DecisionStatus =
    decisionType === "owner_override"
      ? "owner_override"
      : decisionType === "wishlist_fallback"
        ? "wishlist_fallback"
        : "routed";

  // Honest offline-mode surfacing (Phase A task 6): when a draft was produced by
  // the local composer (no key, cap hit, or model error) say so — never present
  // a template-composed draft as if it were AI-generated.
  const notes = [...output.orchestratorNotes];
  if (output.draft && (output.draft.metadata as Record<string, unknown> | undefined)?.source === "local") {
    notes.unshift(
      "Heads up — I'm running in offline mode right now, so this draft came from the built-in composer rather than live AI. It's a safe starting point, but real AI generation is currently unavailable.",
    );
  }

  return {
    status,
    classifier,
    decisionId: decision.id,
    runId: run.id,
    agentId,
    confidence,
    alternates: candidates.slice(1, 4),
    params,
    draftId,
    draft: output.draft,
    orchestratorNotes: notes,
    noDraftReason: output.noDraftReason,
  };
}

/**
 * A cross-department "weekly briefing" the orchestrator aggregates itself (v2
 * Decision 1). A department-named briefing ("the Sales briefing", "marketing
 * recap") is NOT intercepted — it routes to that department's briefing skill.
 */
export function isAggregateBriefingQuery(ask: string): boolean {
  const a = ask.toLowerCase();
  const wantsBriefing = /\b(weekly briefing|my briefing|briefing|recap|summary of (the )?(week|business)|how'?s business|what happened (this|last) week)\b/.test(a);
  if (!wantsBriefing) return false;
  // If a specific department is named, let it route there instead.
  const dept = /\b(sales|marketing|customer service|operations|invoicing|collections|accounting|finance|admin|records|people|hr|hiring)\b/.test(a);
  return !dept;
}

const NON_BUSINESS_RE =
  /\b(my (mom|mother|dad|father|wife|husband|kid|kids|son|daughter|friend|girlfriend|boyfriend|partner)|thank-?you note|birthday (card|message|poem)|wedding (toast|speech|vows)|love letter|personal (essay|statement)|my homework|dinner recipe|grocery list|vacation itinerary|dating profile)\b/i;

/**
 * Heuristic for clearly personal / non-business asks (v2 Decision 2). When true,
 * the orchestrator politely declines instead of routing to a department.
 */
export function isNonBusiness(ask: string): boolean {
  return NON_BUSINESS_RE.test(ask);
}

/** Detects questions about widget activity that the orchestrator answers directly. */
export function isWidgetQuery(ask: string): boolean {
  const a = ask.toLowerCase();
  if (!/\bwidget\b/.test(a)) return false;
  // An ask that wants something *drafted* in response to a forwarded widget
  // message is a worker-agent task (e.g. Customer Question), not a question
  // about widget activity — don't intercept it for a direct answer.
  if (/\b(draft|write|compose|respond|reply|answer this|send|create)\b/.test(a)) return false;
  return /(came in|come in|yesterday|today|this week|recent|capture|happened|new|leads?|chats?|conversations?|messages?)/.test(a);
}

/** Summarises recent widget conversations for a direct orchestrator answer. */
function summarizeWidget(ctx: import("../types/agent.js").SharedContext): string {
  const convos = ctx.widgetHistory;
  if (convos.length === 0) {
    return "Nothing came in through the widget recently — no captured conversations yet.";
  }
  const byIntent = new Map<string, number>();
  for (const c of convos) byIntent.set(c.intent ?? "other", (byIntent.get(c.intent ?? "other") ?? 0) + 1);
  const breakdown = [...byIntent.entries()].map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ");
  const lines = convos
    .slice(0, 6)
    .map((c) => `• ${c.contactName ?? "Someone"}${c.intent ? ` (${c.intent.replace(/_/g, " ")})` : ""}: ${c.summary}`);
  return `Here's what came in through the widget — ${convos.length} conversation(s) [${breakdown}]:\n${lines.join("\n")}`;
}

/**
 * Cross-department weekly briefing (v2 Decision 1): the orchestrator aggregates
 * highlights across all departments from the shared data layer. Leads with an
 * "Owner attention needed" block (complaints, overdue invoices, stale leads, KB
 * gaps, no-shows), then a per-department snapshot, then "What's coming".
 */
export function aggregateBriefing(ctx: import("../types/agent.js").SharedContext): string {
  const out: string[] = ["Weekly briefing — across all departments:"];

  const attention: string[] = [];
  for (const c of ctx.widgetHistory.filter((w) => (w.intent ?? "").toLowerCase().includes("complaint"))) {
    attention.push(`Complaint from ${c.contactName ?? "a customer"}: ${c.summary} (Customer Service)`);
  }
  for (const iv of ctx.invoices.filter((i) => i.status === "overdue")) {
    attention.push(`Overdue invoice ${iv.number} for ${iv.customerName} — $${iv.amount.toLocaleString("en-US")} (Invoicing & Collections)`);
  }
  for (const l of ctx.pipelineLeads.filter((p) => p.status === "stale")) {
    attention.push(`Stale lead ${l.name}${l.subject ? ` (${l.subject})` : ""} (Sales)`);
  }
  for (const r of ctx.agentRunHistory.filter((h) => h.kbGap)) {
    attention.push(`Knowledge-base gap from a customer question — add an FAQ entry (Customer Service): ${r.title}`);
  }
  for (const ap of ctx.appointments.filter((a) => a.status === "no_show")) {
    attention.push(`No-show: ${ap.customerName}${ap.service ? ` (${ap.service})` : ""} (Operations)`);
  }
  if (attention.length) out.push("\nOwner attention needed:\n" + attention.map((a) => `• ${a}`).join("\n"));

  const dept: string[] = [];
  if (ctx.widgetHistory.length) dept.push(`Customer Service: ${ctx.widgetHistory.length} widget conversation(s).`);
  if (ctx.pipelineLeads.length) dept.push(`Sales: ${ctx.pipelineLeads.length} lead(s) in the pipeline.`);
  const openInv = ctx.invoices.filter((i) => i.status === "overdue" || i.status === "unpaid");
  if (openInv.length) dept.push(`Invoicing: ${openInv.length} outstanding invoice(s) totaling $${openInv.reduce((s, i) => s + i.amount, 0).toLocaleString("en-US")}.`);
  const completed = ctx.appointments.filter((a) => a.status === "completed").length;
  if (completed) dept.push(`Operations: ${completed} completed appointment(s).`);
  if (dept.length) out.push("\nBy department:\n" + dept.map((d) => `• ${d}`).join("\n"));

  const upcoming = ctx.appointments
    .filter((a) => a.status === "scheduled")
    .sort((x, y) => x.scheduledFor.localeCompare(y.scheduledFor))
    .slice(0, 3);
  if (upcoming.length) {
    out.push("\nWhat's coming:\n" + upcoming.map((a) => {
      const w = new Date(a.scheduledFor);
      const label = Number.isNaN(w.getTime()) ? a.scheduledFor : w.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return `• ${a.customerName}${a.service ? ` — ${a.service}` : ""} (${label})`;
    }).join("\n"));
  }

  if (out.length === 1) return "Quiet week — no logged activity across your departments yet. Nothing needs your attention right now.";
  return out.join("\n");
}

/** Complaint-language detection (short-circuits routing to the Complaint Handler). */
export function detectComplaint(ask: string): boolean {
  return /(furious|angry|upset|unhappy|disappointed|terrible|awful|worst|ruined|scratch(ed)?|damaged|broke|refund|complaint|complained|unacceptable|fed up|never again)/i.test(ask);
}

async function captureWishlist(userId: string, ask: string, candidates: Candidate[]): Promise<void> {
  const request = ask.trim();
  const considered = candidates.map((c) => c.agentId).join(",");
  const existing = await db.wishlistItem.findFirst({ where: { userId, request } });
  if (existing) {
    await db.wishlistItem.update({
      where: { id: existing.id },
      data: { count: existing.count + 1, lastSeen: new Date(), consideredAgents: considered || existing.consideredAgents },
    });
  } else {
    await db.wishlistItem.create({ data: { userId, request, consideredAgents: considered } });
  }
}

export { classify } from "./_classifier.js";
export type { Candidate } from "./_classifier.js";
