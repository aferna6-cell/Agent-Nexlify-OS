/**
 * Department-head factory (Agent Library v2).
 *
 * A department is ONE registry agent that owns a business function and dispatches
 * each ask to the best-fit internal *skill*. Skills are the former v1 worker
 * agents (src/agents/<id>/agent.ts) — their composing logic, trace honesty,
 * Authoring (no-placeholder) and channel formatting are reused verbatim; they are
 * simply no longer registered individually. The owner routes 1-of-8 departments;
 * the department then picks 1-of-N skills.
 *
 * Routing:
 *  - The orchestrator's classifier scores departments by the UNION of their
 *    skills' keywords/strong_signals (aggregated onto the department spec).
 *  - Inside run(), pickSkill() re-scores the same signals scoped to this
 *    department's skills and delegates to the winner's run().
 *
 * Channels: a department spans channels, so its declared `channel` is just a
 * representative (rich) channel for schema purposes; the *draft's* channel is set
 * by whichever skill produced it (each skill already calls finishBody on its own
 * channel, so the plain-text/no_markdown rule still holds on the real output).
 */

import { defineAgent, PLAIN_TEXT_CHANNELS, type Agent, type AgentBucket, type AgentChannel } from "./_schema.js";
import type { AgentOutput, AgentRunArgs } from "../types/agent.js";

export interface DepartmentSkill {
  /** The underlying v1 agent acting as this skill. */
  agent: Agent;
  /** Optional extra trigger words beyond the skill agent's own keywords. */
  extraKeywords?: string[];
}

export interface DepartmentSpec {
  agent_id: string;
  display_name: string;
  bucket: AgentBucket;
  /** Representative channel for the schema (departments span channels at runtime). */
  channel: AgentChannel;
  purpose: string;
  routes_here_when: string[];
  strong_signals?: string[];
  /** Member skills, in priority order (ties break toward earlier skills). */
  skills: DepartmentSkill[];
  /** Skill chosen when nothing scores (e.g. a department's safe default). */
  defaultSkillId: string;
  examples: { owner_ask: string; expected_route: string; expected_output_excerpt: string }[];
}

function scoreSkill(ask: string, skill: DepartmentSkill): number {
  const a = ask.toLowerCase();
  let score = 0;
  for (const kw of skill.agent.keywords) if (a.includes(kw.toLowerCase())) score += 1;
  for (const sig of skill.agent.strong_signals) if (a.includes(sig.toLowerCase())) score += 3;
  for (const kw of skill.extraKeywords ?? []) if (a.includes(kw.toLowerCase())) score += 2;
  return score;
}

/** Pick the best-fit skill for an ask within a department (transparent scoring). */
export function pickSkill(spec: DepartmentSpec, ask: string): DepartmentSkill {
  let best: DepartmentSkill | undefined;
  let bestScore = 0;
  for (const skill of spec.skills) {
    const s = scoreSkill(ask, skill);
    if (s > bestScore) {
      bestScore = s;
      best = skill;
    }
  }
  if (best) return best;
  const fallback = spec.skills.find((s) => s.agent.agent_id === spec.defaultSkillId);
  return fallback ?? spec.skills[0]!;
}

/** A registered department agent that also exposes its skill spec (for tests/admin). */
export type DepartmentAgent = Agent & { __department: DepartmentSpec };

/** Build the registry agent for a department from its skills. */
export function defineDepartment(spec: DepartmentSpec): DepartmentAgent {
  // Aggregate routing signals from all member skills so the orchestrator's
  // classifier can score the department as a 1-of-8 choice.
  const keywords = [...new Set(spec.skills.flatMap((s) => [...s.agent.keywords, ...(s.extraKeywords ?? [])]))];
  const strongSignals = [...new Set([...(spec.strong_signals ?? []), ...spec.skills.flatMap((s) => s.agent.strong_signals)])];

  const agent = defineAgent(
    {
      agent_id: spec.agent_id,
      display_name: spec.display_name,
      bucket: spec.bucket,
      status: "existing",
      build_priority: "P1",
      purpose: spec.purpose,
      channel: spec.channel,
      routes_here_when: spec.routes_here_when,
      keywords,
      strong_signals: strongSignals,
      shared_context_needed: ["business_profile", "widget_history", "pipeline_state", "agent_run_history"],
      tool_dependencies: ["none"],
      permission_scope: { default: "drafts_only", require_owner_approval: true },
      triggers_supported: ["manual", "scheduled", "event_based"],
      // The representative channel may be plain-text (e.g. Operations → sms); the
      // real draft channel is set per-skill, but the schema still requires
      // no_markdown to match the declared channel.
      output_format: { title_template: "{department} — {skill}", body_constraints: { no_markdown: PLAIN_TEXT_CHANNELS.has(spec.channel) } },
      examples: spec.examples,
    },
    async (args: AgentRunArgs): Promise<AgentOutput> => {
      const skill = pickSkill(spec, args.ownerAsk);
      const out = await skill.agent.run(args);
      // Tag which skill handled it (useful for /admin and debugging) without
      // disturbing the draft the skill produced.
      out.orchestratorNotes = out.orchestratorNotes ?? [];
      return out;
    },
  );
  return Object.assign(agent, { __department: spec });
}
