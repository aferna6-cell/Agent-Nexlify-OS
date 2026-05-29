/**
 * Shared Context / Data Layer.
 *
 * Single source of truth for everything an agent might reference: the business
 * profile (from signup), widget conversation history, lead/pipeline state, agent
 * run history, and the owner-curated knowledge base. The reasoning-trace UI
 * reads from here and shows the owner what data was *actually* used — never a
 * theatrical "Loaded" indicator (the honest-trace rule).
 */

import type { BusinessProfile } from "../profile.js";

export interface WidgetConversation {
  id: string;
  contactName?: string;
  /** When the conversation closed. */
  date: string;
  /** Classified intent, if triage has run. */
  intent?: "question" | "booking" | "complaint" | "spam" | "sales_pitch" | "qualified_lead";
  /** One-line summary captured at ingestion. */
  summary: string;
  topics?: string[];
}

export interface KnowledgeBaseEntry {
  topic: string;
  answer: string;
}

export interface Lead {
  id: string;
  name: string;
  status: "new" | "contacted" | "quoted" | "booked" | "won" | "lost" | "stale";
  subject?: string;
  lastContactDate?: string;
  quoteAmount?: number;
}

export interface Appointment {
  id: string;
  customerName: string;
  date: string;
  service?: string;
  status: "scheduled" | "completed" | "no_show" | "cancelled";
}

export interface AgentRun {
  agent_id: string;
  date: string;
  title: string;
  outcome: "drafted" | "approved" | "sent" | "rejected";
}

export interface PipelineState {
  leads: Lead[];
  appointments: Appointment[];
}

/**
 * The shared context passed to every agent run. Collections default to empty so
 * agents can honestly report "no X yet" rather than fabricating a load.
 */
export interface SharedContext {
  business_profile: BusinessProfile;
  widget_history: WidgetConversation[];
  pipeline_state: PipelineState;
  agent_run_history: AgentRun[];
  kb: KnowledgeBaseEntry[];
}

export function emptyContext(profile: BusinessProfile): SharedContext {
  return {
    business_profile: profile,
    widget_history: [],
    pipeline_state: { leads: [], appointments: [] },
    agent_run_history: [],
    kb: [],
  };
}

/** Case-insensitive KB lookup. Returns matching entries by topic/answer text. */
export function searchKb(ctx: SharedContext, query: string): KnowledgeBaseEntry[] {
  const q = query.toLowerCase();
  const terms = q.split(/\W+/).filter((t) => t.length > 3);
  return ctx.kb.filter((e) => {
    const hay = `${e.topic} ${e.answer}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}

/** Search ingested widget conversations by free text. */
export function searchWidgetHistory(
  ctx: SharedContext,
  query: string,
): WidgetConversation[] {
  const q = query.toLowerCase();
  const terms = q.split(/\W+/).filter((t) => t.length > 3);
  if (terms.length === 0) return [];
  return ctx.widget_history.filter((c) => {
    const hay = `${c.summary} ${(c.topics ?? []).join(" ")} ${c.contactName ?? ""}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}
