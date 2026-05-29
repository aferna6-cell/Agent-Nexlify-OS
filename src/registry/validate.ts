/**
 * Schema conformance + the three cross-cutting rules.
 *
 * These checks are the enforcement layer the QA report demanded. They run at
 * registration time (static schema), at every run (rules 2 & 3 against produced
 * drafts), and as a CI conformance suite (rule 1, by running each agent against
 * an empty context and proving no load reports false success).
 */

import { findChannelViolations } from "../channels.js";
import type { SharedContext } from "../context/sharedContext.js";
import { emptyContext } from "../context/sharedContext.js";
import {
  PROFILE_PLACEHOLDER_TOKENS,
  resolveField,
  type BusinessProfile,
} from "../profile.js";
import type { AgentDefinition, AgentDeps, AgentRunResult, Draft } from "../types.js";

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const VALID_BUCKETS = new Set([
  "customer_service",
  "sales",
  "marketing",
  "scheduling_ops",
  "finance",
  "reputation",
  "reporting",
  "system",
]);

export class ValidationError extends Error {
  constructor(
    public readonly agentId: string,
    message: string,
  ) {
    super(`[${agentId}] ${message}`);
    this.name = "ValidationError";
  }
}

/** Static schema checks (§2). Throws on the first violation. */
export function validateDefinition(def: AgentDefinition): void {
  const fail = (msg: string): never => {
    throw new ValidationError(def.agent_id || "<unknown>", msg);
  };

  if (!SNAKE_CASE.test(def.agent_id)) fail(`agent_id must be snake_case`);
  if (!def.display_name?.trim()) fail("display_name is required");
  if (!VALID_BUCKETS.has(def.bucket)) fail(`invalid bucket "${def.bucket}"`);
  if (!def.purpose?.trim()) fail("purpose is required");

  // Permission scope: every agent ships drafts-only by default.
  if (def.permission_scope.default !== "drafts_only") {
    fail("permission_scope.default must be 'drafts_only' in v1");
  }

  // Triggers: manual is always supported.
  if (def.triggers_supported.manual !== true) {
    fail("triggers_supported.manual must be true");
  }

  // business_profile is always required for v1 (substrate dependency), except
  // for purely internal agents that produce no owner-facing draft.
  if (
    def.channel !== "internal" &&
    !def.inputs.from_shared_context.includes("business_profile")
  ) {
    fail("must declare business_profile in from_shared_context");
  }

  if (def.reasoning_trace_steps.length === 0) fail("must declare reasoning_trace_steps");

  // Build/verification checklist: at least 3 example interactions.
  if (def.example_interactions.length < 3) {
    fail(`requires at least 3 example_interactions (has ${def.example_interactions.length})`);
  }
  for (const ex of def.example_interactions) {
    if (ex.expected_route !== def.agent_id) {
      fail(`example_interaction routes to "${ex.expected_route}", expected "${def.agent_id}"`);
    }
  }

  if (def.tool_dependencies.length === 0) fail("must declare tool_dependencies (use ['none'])");
}

export interface RuleViolation {
  rule: 1 | 2 | 3;
  message: string;
}

/**
 * Rule 2 — no bracketed placeholders for fields that exist in the profile.
 * Scans the owner-facing draft (title + body). Returns a violation for each
 * present profile field whose placeholder token leaked into the draft.
 */
export function findPlaceholderViolations(
  draft: Draft,
  profile: BusinessProfile,
): RuleViolation[] {
  const haystack = `${draft.title}\n${draft.body}`;
  const violations: RuleViolation[] = [];
  for (const [field, tokens] of Object.entries(PROFILE_PLACEHOLDER_TOKENS)) {
    const resolution = resolveField(profile, field as keyof BusinessProfile);
    if (!resolution.present) continue; // missing field → placeholder is not a rule-2 violation
    for (const token of tokens) {
      if (haystack.toLowerCase().includes(token.toLowerCase())) {
        violations.push({
          rule: 2,
          message: `draft contains placeholder "${token}" for profile field "${field}" which IS present ("${resolution.value}")`,
        });
      }
    }
  }
  return violations;
}

/** Rule 3 — channel formatting. Plain-text channels must contain no markdown. */
export function findChannelRuleViolations(draft: Draft): RuleViolation[] {
  return findChannelViolations(draft.channel, draft.body).map((v) => ({
    rule: 3 as const,
    message: `${draft.channel} channel draft contains ${v.reason}: "${v.token}"`,
  }));
}

/** Runtime rule checks against a produced draft (rules 2 & 3). */
export function findRunResultViolations(
  result: AgentRunResult,
  profile: BusinessProfile,
): RuleViolation[] {
  if (!result.draft) return [];
  return [
    ...findPlaceholderViolations(result.draft, profile),
    ...findChannelRuleViolations(result.draft),
  ];
}

/**
 * Rule 1 — honest reasoning trace, enforced by execution. Runs the agent
 * against an empty context and asserts no load step reports success ("ok"). A
 * load over empty data must render `empty` or `skipped`.
 */
export function findHonestTraceViolations(
  def: AgentDefinition,
  deps: AgentDeps,
): RuleViolation[] {
  // Empty profile + empty collections: nothing should "load" successfully.
  const ctx: SharedContext = emptyContext({});
  const result = def.run(buildProbeInput(def), ctx, deps);
  const violations: RuleViolation[] = [];
  for (const step of result.trace) {
    if (step.kind === "load" && step.status === "ok") {
      violations.push({
        rule: 1,
        message: `load step "${step.name}" reported success on an empty context: "${step.detail}"`,
      });
    }
  }
  return violations;
}

/**
 * Builds a minimal but plausible param set from the agent's required inputs so a
 * conformance probe can run. Strings get a sentinel, numbers/dates get defaults.
 */
export function buildProbeInput(def: AgentDefinition): { params: Record<string, unknown>; ownerAsk: string } {
  const params: Record<string, unknown> = {};
  for (const field of def.inputs.from_owner) {
    if (field.default !== undefined) {
      params[field.name] = field.default;
      continue;
    }
    if (!field.required) continue;
    switch (field.type) {
      case "number":
        params[field.name] = 100;
        break;
      case "date":
        params[field.name] = "2026-05-20";
        break;
      case "array":
        params[field.name] = [];
        break;
      case "boolean":
        params[field.name] = false;
        break;
      default:
        params[field.name] = `sample ${field.name}`;
    }
  }
  return { params, ownerAsk: "conformance probe" };
}
