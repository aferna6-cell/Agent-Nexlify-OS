/**
 * Honest reasoning trace (rule 1).
 *
 * No agent may emit a "loaded" trace step for a resource that returned empty
 * data. The {@link TraceBuilder} makes the honest behaviour the *only* behaviour:
 * a load step's status is derived from the data itself, never asserted by the
 * caller. When a load returns nothing, the trace says "no X yet — using
 * fallback" (or the step is skipped) — never a green check over empty data.
 */

import type { TraceEntry } from "../types.js";

/** Returns true when a loaded value is meaningfully non-empty. */
export function hasData(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export class TraceBuilder {
  private readonly entries: TraceEntry[] = [];

  /**
   * Record a data-load step. The status is derived from `data`:
   * - non-empty → `ok`, rendered with the provided `summary`.
   * - empty → `empty`, rendered with the honest `fallback` note.
   *
   * It is structurally impossible to mark an empty load as `ok`.
   */
  load(
    name: string,
    data: unknown,
    summary: (data: unknown) => string,
    fallback: string,
  ): boolean {
    const present = hasData(data);
    this.entries.push({
      name,
      kind: "load",
      status: present ? "ok" : "empty",
      detail: present ? summary(data) : fallback,
    });
    return present;
  }

  /**
   * Record a load step that is simply skipped when there's no data (no fallback
   * line emitted at all — used when an absent resource needs no mention).
   */
  loadOrSkip(name: string, data: unknown, summary: (data: unknown) => string): boolean {
    const present = hasData(data);
    if (!present) {
      this.entries.push({ name, kind: "load", status: "skipped", detail: "not used" });
      return false;
    }
    this.entries.push({ name, kind: "load", status: "ok", detail: summary(data) });
    return true;
  }

  /** Record an ordinary reasoning step the agent always performs. */
  work(name: string, detail: string): void {
    this.entries.push({ name, kind: "work", status: "ok", detail });
  }

  build(): TraceEntry[] {
    return [...this.entries];
  }
}

/** Renders a trace as human-readable lines for the CLI / orchestrator chat. */
export function renderTrace(entries: TraceEntry[]): string {
  const icon = (e: TraceEntry): string => {
    if (e.kind === "load" && e.status === "empty") return "○";
    if (e.status === "skipped") return "·";
    return "✓";
  };
  return entries.map((e) => `  ${icon(e)} ${e.name}: ${e.detail}`).join("\n");
}
