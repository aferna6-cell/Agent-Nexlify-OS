/**
 * Routing classifier.
 *
 * Scores the owner's natural-language ask against every agent's routing spec and
 * returns a ranked list with confidences. In the target architecture this runs
 * on Haiku; here it's a transparent, deterministic keyword/signal scorer so
 * routing is inspectable and testable. The orchestrator layers the §11 rules on
 * top of these scores.
 */

import type { AgentRegistry } from "../registry/registry.js";
import type { AgentDefinition } from "../types.js";

export interface Candidate {
  agent_id: string;
  confidence: number;
  /** Raw weighted score before normalization (for debugging/trace). */
  score: number;
}

const KEYWORD_WEIGHT = 1;
const STRONG_SIGNAL_WEIGHT = 3;
/** Confidence smoothing: score/(score+SMOOTHING). */
const SMOOTHING = 2;

function scoreAgent(def: AgentDefinition, ask: string): number {
  const a = ask.toLowerCase();
  let score = 0;
  for (const kw of def.routing.keywords) {
    if (a.includes(kw.toLowerCase())) score += KEYWORD_WEIGHT;
  }
  for (const sig of def.routing.strong_signals ?? []) {
    if (a.includes(sig.toLowerCase())) score += STRONG_SIGNAL_WEIGHT;
  }
  return score;
}

function toConfidence(score: number): number {
  if (score <= 0) return 0;
  return Number((score / (score + SMOOTHING)).toFixed(3));
}

/**
 * Rank candidate agents for an ask. Internal-only agents (channel `internal`)
 * are excluded from owner-ask routing; they fire on events.
 */
export function classify(ask: string, registry: AgentRegistry): Candidate[] {
  const candidates: Candidate[] = registry
    .all()
    .filter((def) => def.channel !== "internal")
    .map((def) => {
      const score = scoreAgent(def, ask);
      return { agent_id: def.agent_id, score, confidence: toConfidence(score) };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.agent_id.localeCompare(b.agent_id));
  return candidates;
}
