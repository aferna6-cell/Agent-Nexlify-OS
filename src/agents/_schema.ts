/**
 * Agent schema enforcer — the architectural enforcement of the three rules.
 *
 * Every agent is validated against this Zod schema at registry load. Anything
 * that doesn't conform fails CI. The schema extends the §3.2 sketch with two
 * fields the library spec depends on: `never_auto_send` (hardcoded for
 * complaints, quotes, payment escalation) and structured trigger detail (cron
 * expressions + event names) alongside the supported-trigger enums.
 */

import { z } from "zod";
import type { AgentOutput, AgentRunArgs } from "../types/agent.js";

export const AgentBucket = z.enum([
  "customer_service",
  "sales",
  "marketing",
  "scheduling_ops",
  "finance",
  "reputation",
  "reporting",
  "system",
]);
export type AgentBucket = z.infer<typeof AgentBucket>;

export const AgentChannel = z.enum([
  "sms",
  "email",
  "sequence",
  "report",
  "post",
  "widget_reply",
  "internal",
]);
export type AgentChannel = z.infer<typeof AgentChannel>;

/** Channels that must be plain text (rule 3). */
export const PLAIN_TEXT_CHANNELS: ReadonlySet<AgentChannel> = new Set([
  "sms",
  "post",
  "widget_reply",
]);

export const SharedContextKey = z.enum([
  "business_profile",
  "widget_history",
  "pipeline_state",
  "agent_run_history",
  "kb",
]);

export const AgentSchema = z.object({
  agent_id: z.string().regex(/^[a-z][a-z0-9_]*$/, "agent_id must be snake_case"),
  display_name: z.string().min(1),
  bucket: AgentBucket,
  status: z.enum(["existing", "new", "workaround", "stub"]),
  build_priority: z.enum(["P1", "P2", "P3", "P4"]),
  purpose: z.string().min(1),
  channel: AgentChannel,
  routes_here_when: z.array(z.string()),
  /** Routing signals for the classifier. */
  keywords: z.array(z.string()).default([]),
  strong_signals: z.array(z.string()).default([]),
  shared_context_needed: z.array(SharedContextKey),
  tool_dependencies: z.array(z.string()),
  permission_scope: z.object({
    default: z.literal("drafts_only"), // v1 hardcoded
    require_owner_approval: z.boolean().default(true),
    // Hardcoded: complaint / quote / payment escalation may never auto-send.
    never_auto_send: z.boolean().default(false),
    send_caps: z
      .object({
        per_day: z.number().optional(),
        per_month: z.number().optional(),
        notes: z.array(z.string()).optional(),
      })
      .optional(),
    recipient_filter: z
      .enum([
        "existing_customers_only",
        "any",
        "custom_list",
        "completed_service_only",
        "scheduled_appointments_only",
      ])
      .optional(),
  }),
  triggers_supported: z.array(z.enum(["manual", "scheduled", "event_based"])),
  trigger_detail: z
    .object({
      scheduled_cron: z.array(z.string()).optional(),
      events: z.array(z.string()).optional(),
    })
    .optional(),
  output_format: z.object({
    title_template: z.string(),
    body_constraints: z.object({
      max_length: z.number().optional(),
      no_markdown: z.boolean().default(false),
    }),
  }),
  examples: z
    .array(
      z.object({
        owner_ask: z.string(),
        expected_route: z.string(),
        expected_output_excerpt: z.string(),
      }),
    )
    .min(3, "Every agent must have at least 3 example interactions"),
});

export type AgentSpec = z.infer<typeof AgentSchema>;

/** A registered agent: the validated spec plus its run function. */
export type Agent = AgentSpec & {
  run: (args: AgentRunArgs) => Promise<AgentOutput>;
};

/**
 * Validates a spec and returns the typed Agent. Cross-checks the §0 rules that
 * are statically decidable:
 *  - business_profile is required for every non-internal agent (substrate).
 *  - plain-text channels must declare no_markdown.
 *  - every example must route to this agent.
 */
export function defineAgent(
  spec: unknown,
  run: Agent["run"],
): Agent {
  const parsed = AgentSchema.parse(spec);

  if (parsed.channel !== "internal" && !parsed.shared_context_needed.includes("business_profile")) {
    throw new Error(`[${parsed.agent_id}] must declare business_profile in shared_context_needed`);
  }
  if (PLAIN_TEXT_CHANNELS.has(parsed.channel) && !parsed.output_format.body_constraints.no_markdown) {
    throw new Error(`[${parsed.agent_id}] plain-text channel "${parsed.channel}" must set body_constraints.no_markdown = true`);
  }
  for (const ex of parsed.examples) {
    if (ex.expected_route !== parsed.agent_id) {
      throw new Error(`[${parsed.agent_id}] example expected_route "${ex.expected_route}" must equal agent_id`);
    }
  }

  return { ...parsed, run };
}
