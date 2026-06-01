/**
 * Daily usage caps for the demo (post-QA sprint Phase A).
 *
 * Protects the shared demo key from runaway spend: a hard per-day cap on routing
 * (Haiku) and draft (Sonnet) calls. Counts come from ModelCallLog (ok=true, real
 * models only — the offline local-composer and failed calls don't count), so the
 * cap is derived from the same ledger /admin/costs renders. No extra state.
 *
 * When a cap is hit, `complete()` refuses BEFORE calling Anthropic and the agent
 * layer falls back to the offline composer — surfaced honestly to the owner
 * (see capStatus().offline + the orchestrator's offline note).
 */

import { db } from "./db.js";

const ROUTING_CAP = Number(process.env.USAGE_CAP_ROUTING ?? 500);
const DRAFT_CAP = Number(process.env.USAGE_CAP_DRAFT ?? 200);

/** Real (billable) model names — offline composer / "down" markers don't count. */
function isRealModel(model: string): boolean {
  return model.startsWith("claude-");
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface CapTier {
  used: number;
  cap: number;
  /** 0..1 fraction of the cap consumed. */
  ratio: number;
  /** true once used >= cap. */
  exceeded: boolean;
}

export interface CapStatus {
  routing: CapTier;
  draft: CapTier;
  /** Highest ratio across tiers — drives the banner severity. */
  peakRatio: number;
  /** "ok" | "warn" (>=80%) | "critical" (>=95%) | "exceeded" (>=100%). */
  level: "ok" | "warn" | "critical" | "exceeded";
}

async function tier(purpose: "routing" | "draft", cap: number): Promise<CapTier> {
  const since = startOfTodayUtc();
  let used = 0;
  try {
    const rows = await db.modelCallLog.findMany({
      where: { purpose, ok: true, createdAt: { gte: since } },
      select: { model: true },
    });
    used = rows.filter((r) => isRealModel(r.model)).length;
  } catch {
    // If the ledger is unreadable, fail OPEN (used=0) — never block on a count error.
    used = 0;
  }
  const ratio = cap > 0 ? used / cap : 0;
  return { used, cap, ratio, exceeded: used >= cap };
}

function levelFor(peak: number, exceeded: boolean): CapStatus["level"] {
  if (exceeded || peak >= 1) return "exceeded";
  if (peak >= 0.95) return "critical";
  if (peak >= 0.8) return "warn";
  return "ok";
}

export async function capStatus(): Promise<CapStatus> {
  const [routing, draft] = await Promise.all([
    tier("routing", ROUTING_CAP),
    tier("draft", DRAFT_CAP),
  ]);
  const peakRatio = Math.max(routing.ratio, draft.ratio);
  return {
    routing,
    draft,
    peakRatio,
    level: levelFor(peakRatio, routing.exceeded || draft.exceeded),
  };
}

/** Cheap gate used by complete(): is this purpose's daily cap already hit? */
export async function isCapExceeded(purpose: "routing" | "draft" | "other"): Promise<boolean> {
  if (purpose === "other") return false;
  const cap = purpose === "routing" ? ROUTING_CAP : DRAFT_CAP;
  return (await tier(purpose, cap)).exceeded;
}

export { ROUTING_CAP, DRAFT_CAP };
