/**
 * Agent OS — core type definitions.
 *
 * These types are a direct, enforceable encoding of the agent schema defined in
 * §2 of the v1 Worker Agent Library spec. Every agent in the registry conforms
 * to {@link AgentDefinition}; the registry validates conformance and enforces the
 * three cross-cutting rules from the QA report (see registry/validate.ts).
 */

/** Functional buckets that mirror how a small business owner thinks about work. */
export type Bucket =
  | "customer_service"
  | "sales"
  | "marketing"
  | "scheduling_ops"
  | "finance"
  | "reputation"
  | "reporting"
  | "system";

/** Lifecycle status of an agent within the migration. */
export type AgentStatus = "existing" | "new" | "workaround" | "stub";

/** Build priority from the library's prioritization key (P1 highest). */
export type BuildPriority = "P1" | "P2" | "P3" | "P4";

/**
 * Output channel. This is a first-class declaration (rule 3): the channel
 * determines which formatting rules the draft body must satisfy.
 *
 * - `sms` / `post` → plain text, no markdown.
 * - `email` / `sequence` → markdown allowed (converted at send time).
 * - `report` → full markdown allowed (owner-facing).
 * - `widget_reply` → plain text (rendered into a chat widget bubble).
 * - `internal` → no owner-facing draft at all.
 */
export type Channel =
  | "sms"
  | "email"
  | "sequence"
  | "report"
  | "post"
  | "widget_reply"
  | "internal";

/** A typed parameter the orchestrator extracts from the owner's natural-language ask. */
export interface OwnerInputField {
  name: string;
  type: "string" | "number" | "date" | "array" | "boolean";
  required: boolean;
  description: string;
  /** Optional default applied when the field is absent. */
  default?: unknown;
}

/** Named resources an agent reads from the shared context / data layer. */
export type SharedContextKey =
  | "business_profile"
  | "widget_history"
  | "pipeline_state"
  | "agent_run_history"
  | "kb"
  | "calendar";

/** External tools an agent may call. Drafts-only agents declare `["none"]`. */
export type ToolDependency =
  | "none"
  | "google_calendar"
  | "gmail_send"
  | "twilio_sms"
  | "seo_check"
  | "invoice_lookup";

export interface SendCaps {
  per_day?: number;
  per_month?: number;
  /** Free-form cap descriptions for hardcoded, per-resource caps. */
  notes?: string[];
}

export type RecipientFilter =
  | "existing_customers_only"
  | "any"
  | "custom_list"
  | "completed_service_only"
  | "scheduled_appointments_only";

export interface PermissionScope {
  /** v1 default. Every agent ships drafts-only. */
  default: "drafts_only";
  /** Phase 4 configuration surface. */
  configurable_phase_4?: {
    require_owner_approval?: boolean;
    send_caps?: SendCaps;
    recipient_filter?: RecipientFilter;
  };
  /**
   * When true, this agent must ALWAYS require owner approval and may never be
   * configured to auto-send, regardless of owner trust level. Hardcoded for
   * high-stakes agents (complaints, quotes, payment escalation).
   */
  never_auto_send?: boolean;
}

export type TriggerKind = "manual" | "scheduled" | "event_based";

export interface TriggersSupported {
  /** Always present. */
  manual: true;
  /** Cron expression(s) the agent supports, if any. */
  scheduled?: string[];
  /** Event names the agent can subscribe to. */
  event_based?: string[];
}

export interface OutputSpec {
  title_format: string;
  body_format: string;
  /** Keys the orchestrator captures with the draft. */
  metadata?: string[];
}

/**
 * Declarative description of a reasoning-trace step. The `kind` distinguishes a
 * data *load* (subject to the honest-trace rule) from ordinary `work` steps.
 */
export interface TraceStepSpec {
  name: string;
  description: string;
  /**
   * `load` steps may only render a success state when the underlying resource
   * actually returned data; otherwise they must render a fallback/skip. `work`
   * steps describe reasoning the agent always performs.
   */
  kind: "load" | "work";
}

export interface ExampleInteraction {
  owner_ask: string;
  expected_route: string;
  expected_output_excerpt: string;
}

/** Routing signals used by the orchestrator's classifier. */
export interface RoutingSpec {
  /** Human-readable owner-ask / event patterns this agent handles. */
  routes_here_when: string[];
  /** Keywords that increase routing confidence toward this agent. */
  keywords: string[];
  /**
   * Phrases that strongly indicate this agent (specialty triggers). Presence of
   * a strong signal lets a specialist outrank a generic agent (§11 rule 5).
   */
  strong_signals?: string[];
}

/** The full, schema-conformant definition of a worker agent. */
export interface AgentDefinition {
  agent_id: string;
  display_name: string;
  bucket: Bucket;
  status: AgentStatus;
  build_priority: BuildPriority;
  purpose: string;
  routing: RoutingSpec;
  channel: Channel;
  /** Channels the agent supports beyond its default, when the owner requests them. */
  alternate_channels?: Channel[];
  inputs: {
    from_owner: OwnerInputField[];
    from_shared_context: SharedContextKey[];
  };
  tool_dependencies: ToolDependency[];
  permission_scope: PermissionScope;
  triggers_supported: TriggersSupported;
  outputs: OutputSpec;
  reasoning_trace_steps: TraceStepSpec[];
  example_interactions: ExampleInteraction[];
  /** Produces the draft (or a no-draft result). Pure given its inputs + context. */
  run: AgentRunFn;
}

// ---------------------------------------------------------------------------
// Runtime types
// ---------------------------------------------------------------------------

export interface AgentRunInput {
  /** Structured params the orchestrator extracted from the owner ask. */
  params: Record<string, unknown>;
  /** The verbatim owner ask (some agents echo / reference it). */
  ownerAsk: string;
}

/**
 * The result of an agent run. Either a draft (possibly with orchestrator-chat
 * notes), or no draft at all (e.g. service unavailable — see Generalist).
 */
export interface AgentRunResult {
  agent_id: string;
  /** Present unless the agent declines to produce a draft. */
  draft?: Draft;
  /**
   * Messages surfaced to the owner in the orchestrator chat — NOT in the draft.
   * Used for profile gaps, KB gaps, flags, and service-unavailable notices.
   */
  orchestratorNotes: string[];
  /** The honest reasoning trace. */
  trace: TraceEntry[];
  /** Set when the agent intentionally produced no draft. */
  noDraftReason?: string;
}

export interface Draft {
  title: string;
  body: string;
  channel: Channel;
  metadata: Record<string, unknown>;
  /** When true the UI must not offer an auto-send / one-click-send path. */
  requiresApproval: boolean;
}

export interface TraceEntry {
  name: string;
  kind: "load" | "work";
  /**
   * - `ok` — completed; for a load this means data was actually returned.
   * - `empty` — a load returned nothing; rendered as an honest fallback note.
   * - `skipped` — the step did not run.
   */
  status: "ok" | "empty" | "skipped";
  detail: string;
}

export type AgentRunFn = (
  input: AgentRunInput,
  ctx: import("./context/sharedContext.js").SharedContext,
  deps: AgentDeps,
) => AgentRunResult;

/** Injected dependencies available to every agent run. */
export interface AgentDeps {
  llm: import("./llm/provider.js").LLMProvider;
}
