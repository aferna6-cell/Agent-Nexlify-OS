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

export type DecisionStatus = "routed" | "needs_clarification" | "wishlist_fallback" | "owner_override" | "direct_answer";

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

  // --- Complaint detection short-circuits Customer Question (§11 rule 6) ------
  // Runs regardless of which classifier was used, so an angry message always
  // reaches the (hardcoded never-auto-send) Complaint Handler.
  if (detectComplaint(ask)) {
    const conf = candidates.find((c) => c.agentId === "complaint_handler")?.confidence ?? 0.9;
    const res = await runAndLog(userId, ask, "complaint_handler", conf, candidates, cls.classifier, cls.params, "routed", opts.onStep);
    res.orchestratorNotes = ["Detected complaint language, so I routed this straight to the Complaint Handler.", ...res.orchestratorNotes];
    return res;
  }

  const top = candidates[0];
  const second = candidates[1];

  // --- Low confidence → wishlist fallback to the Generalist ------------------
  if (!top || top.confidence < CONFIDENCE_FLOOR) {
    await captureWishlist(userId, ask, candidates);
    // Pass the closest specialist to the Generalist so it can offer it (>0.4).
    const fallbackParams = { ...cls.params };
    if (top && top.confidence > 0.4) {
      fallbackParams.nearest_specialist = registry.get(top.agentId).display_name;
      fallbackParams.nearest_confidence = top.confidence;
    }
    const res = await runAndLog(userId, ask, "generalist", top?.confidence ?? 0, candidates, cls.classifier, fallbackParams, "wishlist_fallback", opts.onStep);
    const closest = alternates.length
      ? ` The closest specialists I considered were ${alternates.map((a) => registry.get(a.agentId).display_name).join(" and ")}.`
      : "";
    res.orchestratorNotes = [
      `I don't have a confident match for this, so I saved it to your wishlist and took a general pass.${closest} Want me to try one of those instead?`,
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
    orchestratorNotes: output.orchestratorNotes,
    noDraftReason: output.noDraftReason,
  };
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
