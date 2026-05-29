/**
 * Orchestrator.
 *
 * The conversational entry point. Classifies the owner ask to an agent, applies
 * the §11 routing rules (confidence threshold, confidence resolution, specialty
 * preference, complaint short-circuit, channel inference, bucket awareness),
 * extracts params, runs the chosen agent through the registry (which enforces
 * the rules), and surfaces the routing decision + agent notes to the owner.
 */

import type { SharedContext } from "../context/sharedContext.js";
import type { AgentRegistry } from "../registry/registry.js";
import type { AgentDeps, AgentRunResult, Bucket } from "../types.js";
import { getProvider } from "../llm/index.js";
import { classify, type Candidate } from "./router.js";
import { extractParams, inferChannel } from "./extract.js";
import { Wishlist } from "./wishlist.js";

const CONFIDENCE_FLOOR = 0.5;
const RESOLUTION_GAP = 0.1;
const NEAR_MATCH = 0.4;

const BUCKET_ALIASES: Record<string, Bucket> = {
  "customer service": "customer_service",
  support: "customer_service",
  sales: "sales",
  marketing: "marketing",
  scheduling: "scheduling_ops",
  operations: "scheduling_ops",
  finance: "finance",
  money: "finance",
  billing: "finance",
  reputation: "reputation",
  reviews: "reputation",
  reporting: "reporting",
  insight: "reporting",
};

export type DecisionStatus =
  | "routed"
  | "needs_clarification"
  | "fallback_generalist"
  | "bucket_listing";

export interface OrchestrationResult {
  status: DecisionStatus;
  /** The owner-visible routing decision (always surfaced — §11 rule 3). */
  messages: string[];
  chosen?: string;
  confidence?: number;
  candidates: Candidate[];
  /** Two near-tied options when clarification is needed. */
  clarifyBetween?: [string, string];
  params?: Record<string, unknown>;
  result?: AgentRunResult;
}

export class Orchestrator {
  readonly wishlist = new Wishlist();
  private readonly deps: AgentDeps;

  constructor(
    private readonly registry: AgentRegistry,
    deps?: Partial<AgentDeps>,
  ) {
    this.deps = { llm: deps?.llm ?? getProvider() };
  }

  handle(ask: string, ctx: SharedContext): OrchestrationResult {
    // §11 rule 7 — bucket awareness ("what marketing agents do you have?").
    const bucketListing = this.tryBucketListing(ask);
    if (bucketListing) return bucketListing;

    let candidates = classify(ask, this.registry);
    candidates = this.applySpecialtyPreference(ask, candidates);
    candidates = this.applyComplaintShortCircuit(ask, candidates);
    candidates = this.applyChannelInference(ask, candidates);

    const top = candidates[0];
    const second = candidates[1];

    // §11 rule 1 — low confidence across the board → generalist + wishlist.
    if (!top || top.confidence < CONFIDENCE_FLOOR) {
      return this.fallbackToGeneralist(ask, ctx, top, candidates);
    }

    // §11 rule 2 — top two within 0.1 → ask the owner which it is.
    if (second && top.confidence - second.confidence < RESOLUTION_GAP) {
      const a = this.registry.get(top.agent_id);
      const b = this.registry.get(second.agent_id);
      return {
        status: "needs_clarification",
        messages: [
          `Sounds like ${a.display_name.toLowerCase()} or ${b.display_name.toLowerCase()} — which is it?`,
        ],
        candidates,
        confidence: top.confidence,
        clarifyBetween: [top.agent_id, second.agent_id],
      };
    }

    return this.route(top.agent_id, ask, ctx, top.confidence, candidates);
  }

  /** Force-route to a specific agent (owner override — §11 rule 3). */
  route(
    agentId: string,
    ask: string,
    ctx: SharedContext,
    confidence: number,
    candidates: Candidate[],
  ): OrchestrationResult {
    const def = this.registry.get(agentId);
    const params = extractParams(def, ask);
    const result = this.registry.run(agentId, { params, ownerAsk: ask }, ctx, this.deps);

    const messages: string[] = [
      `I'm routing this to the ${def.display_name} agent (${Math.round(confidence * 100)}% confidence). You can re-route before approving.`,
      ...result.orchestratorNotes,
    ];
    if (!result.draft && result.noDraftReason) {
      messages.push(`No draft produced — ${result.noDraftReason}.`);
    }
    return {
      status: "routed",
      messages,
      chosen: agentId,
      confidence,
      candidates,
      params,
      result,
    };
  }

  private fallbackToGeneralist(
    ask: string,
    ctx: SharedContext,
    near: Candidate | undefined,
    candidates: Candidate[],
  ): OrchestrationResult {
    const considered = candidates.map((c) => c.agent_id);
    const entry = this.wishlist.capture(ask, considered, ctx.business_profile.industry);

    const params = extractParams(this.registry.get("generalist"), ask);
    if (near && near.confidence > NEAR_MATCH) {
      params.nearest_specialist = this.registry.get(near.agent_id).display_name;
      params.nearest_confidence = near.confidence;
    }
    const result = this.registry.run("generalist", { params, ownerAsk: ask }, ctx, this.deps);

    const messages: string[] = [
      `I don't have a template that fits this exactly, so I'm using the general assistant and saved it to the wishlist (seen ${entry.count}× so far).`,
      ...result.orchestratorNotes,
    ];
    if (!result.draft && result.noDraftReason) {
      messages.push(`No draft produced — ${result.noDraftReason}.`);
    }
    return {
      status: "fallback_generalist",
      messages,
      chosen: "generalist",
      confidence: near?.confidence ?? 0,
      candidates,
      params,
      result,
    };
  }

  // --- §11 routing rules -----------------------------------------------------

  /** Rule 5 — specialty preference: $ amount + "quote" → Quote Follow-up. */
  private applySpecialtyPreference(ask: string, candidates: Candidate[]): Candidate[] {
    const hasMoney = /\$\s?\d/.test(ask);
    const a = ask.toLowerCase();
    const mentionsQuote = a.includes("quote");
    const isFollowUp = /(follow up|follow-up|chase|didn't book|hasn't booked|unbooked)/.test(a);
    if (hasMoney && mentionsQuote && isFollowUp) {
      return promote(candidates, "quote_follow_up");
    }
    return candidates;
  }

  /** Rule 6 — complaint language short-circuits Customer Question. */
  private applyComplaintShortCircuit(ask: string, candidates: Candidate[]): Candidate[] {
    const a = ask.toLowerCase();
    const complaintLang = /(furious|angry|upset|unhappy|disappointed|terrible|worst|ruined|scratch|damaged|refund|complaint|complained)/.test(a);
    if (complaintLang && candidates.some((c) => c.agent_id === "complaint_handler")) {
      return promote(candidates, "complaint_handler");
    }
    return candidates;
  }

  /** Rule 4 — channel inference disambiguates between channels when tied. */
  private applyChannelInference(ask: string, candidates: Candidate[]): Candidate[] {
    const channel = inferChannel(ask);
    if (!channel || candidates.length < 2) return candidates;
    const top = candidates[0]!;
    const second = candidates[1]!;
    if (top.confidence - second.confidence >= RESOLUTION_GAP) return candidates;
    // Prefer the candidate whose default channel matches the inferred channel.
    const preferred = [top, second].find(
      (c) => this.registry.get(c.agent_id).channel === channel,
    );
    if (preferred && preferred.agent_id !== top.agent_id) {
      return promote(candidates, preferred.agent_id);
    }
    return candidates;
  }

  private tryBucketListing(ask: string): OrchestrationResult | undefined {
    const a = ask.toLowerCase();
    const isListing =
      /(what|which).*(agents?|can you do|do you have|are available)/.test(a) ||
      /list.*(agents?|capabilities)/.test(a);
    if (!isListing) return undefined;

    for (const [alias, bucket] of Object.entries(BUCKET_ALIASES)) {
      if (a.includes(alias)) {
        const agents = this.registry.byBucket(bucket).filter((d) => d.channel !== "internal");
        const lines = agents.map((d) => `• ${d.display_name} — ${d.purpose}`);
        return {
          status: "bucket_listing",
          messages: [`Here's what I can do in ${alias}:`, ...lines],
          candidates: [],
        };
      }
    }

    // Generic "what can you do?" → list buckets.
    const lines = this.registry
      .buckets()
      .map((b) => `• ${b.replace(/_/g, " ")}: ${this.registry.byBucket(b).filter((d) => d.channel !== "internal").length} agent(s)`);
    return {
      status: "bucket_listing",
      messages: ["Here's what I can help with, by area:", ...lines],
      candidates: [],
    };
  }
}

/** Move an agent to the front of the candidate list, keeping its confidence ≥ floor. */
function promote(candidates: Candidate[], agentId: string): Candidate[] {
  const idx = candidates.findIndex((c) => c.agent_id === agentId);
  if (idx === -1) return candidates;
  const promoted = candidates[idx]!;
  const rest = candidates.filter((_, i) => i !== idx);
  // Ensure the promoted specialist clears the routing floor.
  const boosted: Candidate = {
    ...promoted,
    confidence: Math.max(promoted.confidence, CONFIDENCE_FLOOR + RESOLUTION_GAP),
  };
  return [boosted, ...rest];
}
