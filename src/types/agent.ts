/**
 * Shared types for the agent engine.
 */

export interface BusinessProfileData {
  businessName?: string;
  ownerName?: string;
  industry?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  hoursSummary?: string;
  timezone?: string;
  reviewLinkGoogle?: string;
  reviewLinkYelp?: string;
  reviewLinkFacebook?: string;
  paymentLink?: string;
}

export interface WidgetConversationData {
  id: string;
  contactName?: string;
  intent?: string;
  summary: string;
  topics: string[];
  closedAt: string;
}

export interface PipelineLeadData {
  id: string;
  name: string;
  status: string;
  subject?: string;
  quoteAmount?: number;
  lastContactDate?: string;
}

export interface AgentRunHistoryItem {
  agentId: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface KbEntry {
  topic: string;
  answer: string;
}

/** Everything an agent may read. Mirrors the production data layer. */
export interface SharedContext {
  businessProfile: BusinessProfileData;
  widgetHistory: WidgetConversationData[];
  pipelineLeads: PipelineLeadData[];
  agentRunHistory: AgentRunHistoryItem[];
  kb: KbEntry[];
}

export type Channel =
  | "sms"
  | "email"
  | "sequence"
  | "report"
  | "post"
  | "widget_reply"
  | "internal";

export interface DraftOutput {
  title: string;
  body: string;
  channel: Channel;
  metadata?: Record<string, unknown>;
  requiresApproval: boolean;
}

export interface AgentOutput {
  draft?: DraftOutput;
  /** Surfaced in the orchestrator chat — never inside the draft. */
  orchestratorNotes: string[];
  /** Set when the agent intentionally produced no draft. */
  noDraftReason?: string;
}

/** A trace step as streamed to the client and persisted. */
export interface StreamedTraceStep {
  step: string;
  status: "completed" | "skipped_no_data" | "fallback" | "work";
  description: string;
}

/**
 * The trace emitter. `emit` is the honest-load primitive: it refuses to mark a
 * step "completed" unless the caller supplies non-empty `data`. This makes the
 * QA "false success" bug architecturally impossible to reintroduce.
 */
export interface TraceEmitter {
  /** Returns true when data was present (and the step marked completed). */
  emit(step: string, payload?: { description: string; data: unknown }): Promise<boolean>;
  /** An ordinary reasoning step the agent always performs. */
  work(step: string, description: string): Promise<void>;
  /** An explicit honest fallback line (e.g. "no KB yet — using a safe reply"). */
  fallback(step: string, description: string): Promise<void>;
}

export interface AgentRunArgs {
  input: Record<string, unknown>;
  context: SharedContext;
  emitTrace: TraceEmitter;
  /** Verbatim owner ask. */
  ownerAsk: string;
  /** The current agent run id (for model-call cost association). */
  runId: string;
  /** The owner's user id, when available (for agents that tag the owner record). */
  userId?: string;
}
