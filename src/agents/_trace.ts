/**
 * Reasoning-trace emitter (rule 1, enforced architecturally).
 *
 * `emit` derives a load step's status from the data itself: a step can only be
 * marked "completed" when non-empty evidence is supplied. Empty data becomes a
 * "skipped_no_data" step (or an explicit honest "fallback" line). Agents
 * therefore cannot fake a successful load. Steps are persisted to TraceStep and,
 * when an `onStep` callback is provided, streamed to the client as they happen.
 */

import { getRunStore } from "../lib/providers/run-store.js";
import type { StreamedTraceStep, TraceEmitter } from "../types/agent.js";

/** True when loaded evidence is meaningfully non-empty. */
export function hasData(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export interface TraceEmitterOptions {
  /** Called with each step as it is emitted (used for SSE streaming). */
  onStep?: (step: StreamedTraceStep) => void;
  /** Skip DB writes (used in unit tests with no database). */
  persist?: boolean;
}

export function createTraceEmitter(runId: string, opts: TraceEmitterOptions = {}): TraceEmitter {
  const persist = opts.persist ?? true;
  let ordinal = 0;

  async function record(
    step: string,
    status: StreamedTraceStep["status"],
    description: string,
    dataSnapshot?: unknown,
  ): Promise<void> {
    const current = ordinal++;
    opts.onStep?.({ step, status, description });
    if (!persist) return;
    try {
      await getRunStore().recordTraceStep({
        runId,
        ordinal: current,
        step,
        status,
        description,
        dataSnapshot,
      });
    } catch {
      // Tracing must never break a run.
    }
  }

  return {
    async emit(step, payload) {
      if (!payload || !hasData(payload.data)) {
        await record(step, "skipped_no_data", `No ${step.replace(/_/g, " ")} data available`);
        return false;
      }
      await record(step, "completed", payload.description, payload.data);
      return true;
    },
    async work(step, description) {
      await record(step, "work", description);
    },
    async fallback(step, description) {
      await record(step, "fallback", description);
    },
  };
}
