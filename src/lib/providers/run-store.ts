/**
 * RunStore — the persistence seam for the production merge.
 *
 * The agent engine WRITES its run bookkeeping (routing decisions, agent runs,
 * drafts, wishlist items, trace steps, model-call cost logs) through this single
 * interface. In the standalone repo the implementation is Prisma/SQLite
 * (`PrismaRunStore`, registered in `src/agents/_run-store.ts`, imported by the
 * orchestrator). When Agent OS runs inside the production AgentNexLiFy
 * `agent-service`, startup calls `setRunStore()` once with an implementation that
 * persists into the production data plane (FastAPI/Supabase `os_*` tables) — and
 * nothing else in the engine changes.
 *
 * This mirrors `SharedContextProvider` (the READ seam) and `OwnerActions`. Reads
 * go through SharedContext, writes go through RunStore: together they make the
 * engine datasource-agnostic.
 *
 * See docs/INTEGRATION.md for the full contract and the production checklist.
 */

export interface RoutingDecisionCreate {
  userId: string;
  runId?: string;
  ask: string;
  classifier: "haiku" | "heuristic";
  /** "routed" | "ambiguous" | "wishlist_fallback" | "owner_override" | "direct_answer" | "declined" */
  decision: string;
  chosenAgent: string;
  confidence: number;
  /** Structured candidate list; the store serializes it. */
  alternates?: unknown;
}

export interface AgentRunCreate {
  userId: string;
  agentId: string;
  ownerAsk: string;
  /** Structured params; the store serializes them. */
  params: unknown;
}

export type AgentRunStatus = "running" | "completed" | "failed" | "no_draft";

export interface DraftCreate {
  runId: string;
  agentId: string;
  channel: string;
  title: string;
  body: string;
  /** Structured metadata; the store serializes it. */
  metadata?: unknown;
  requiresApproval: boolean;
}

export interface TraceStepCreate {
  runId: string;
  ordinal: number;
  step: string;
  status: string;
  description: string;
  /** Structured snapshot; the store serializes it. */
  dataSnapshot?: unknown;
}

export interface ModelCallCreate {
  runId?: string;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  error?: string;
}

export interface RunStore {
  /** Log a routing decision (the fine-tuning + routing-accuracy dataset). */
  createRoutingDecision(input: RoutingDecisionCreate): Promise<{ id: string }>;
  /** Owner re-routed from the picker: mark the prior decision not-accepted. */
  markRoutingDecisionOverridden(decisionId: string, changedTo: string): Promise<void>;
  /** Open an agent run (status "running"); returns its id. */
  createRun(input: AgentRunCreate): Promise<{ id: string }>;
  /** Transition a run's status. */
  setRunStatus(runId: string, status: AgentRunStatus): Promise<void>;
  /** Persist a produced draft (the approval-gated deliverable); returns its id. */
  createDraft(input: DraftCreate): Promise<{ id: string }>;
  /** Capture an unmet-need signal (no-fit dataset). Upserts by (userId, request). */
  captureWishlist(input: { userId: string; request: string; consideredAgents: string }): Promise<void>;
  /** Persist one reasoning-trace step (best effort — must never break a run). */
  recordTraceStep(input: TraceStepCreate): Promise<void>;
  /** Persist one model-call cost log (best effort — exhaustion is never silent). */
  logModelCall(input: ModelCallCreate): Promise<void>;
}

let store: RunStore | null = null;

/** Production / agent-service calls this once at startup to swap the write layer. */
export function setRunStore(s: RunStore): void {
  store = s;
}

export function getRunStore(): RunStore {
  if (!store) {
    throw new Error(
      "No RunStore registered. The standalone app registers PrismaRunStore in " +
        "src/agents/_run-store.ts (imported by the orchestrator). The production " +
        "merge / agent-service must call setRunStore() at startup — see " +
        "docs/INTEGRATION.md.",
    );
  }
  return store;
}

/** Test/diagnostic hook: true once a store is wired. */
export function hasRunStore(): boolean {
  return store !== null;
}
