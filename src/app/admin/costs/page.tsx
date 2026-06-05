/**
 * Internal cost tracking. Surfaces every model call's cost so credit
 * exhaustion is never silent. Basic Phase 0 version: totals + recent calls.
 */

import Link from "next/link";
import { db } from "@/lib/db";
import { capStatus } from "@/lib/usage";
import { isModelAvailable } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default async function CostsPage() {
  const calls = await db.modelCallLog.findMany({ orderBy: { createdAt: "desc" }, take: 500, include: { run: true } });
  const totalCost = calls.reduce((s, c) => s + c.costUsd, 0);
  const totalIn = calls.reduce((s, c) => s + c.inputTokens, 0);
  const totalOut = calls.reduce((s, c) => s + c.outputTokens, 0);
  const failures = calls.filter((c) => !c.ok).length;

  const byModel = new Map<string, { count: number; cost: number }>();
  for (const c of calls) {
    const m = byModel.get(c.model) ?? { count: 0, cost: 0 };
    m.count += 1;
    m.cost += c.costUsd;
    byModel.set(c.model, m);
  }

  // Per-agent cost-per-run: group draft calls by the run's agent.
  const byAgent = new Map<string, { runs: Set<string>; cost: number }>();
  for (const c of calls) {
    const agentId = c.run?.agentId;
    if (!agentId) continue;
    const a = byAgent.get(agentId) ?? { runs: new Set<string>(), cost: 0 };
    if (c.runId) a.runs.add(c.runId);
    a.cost += c.costUsd;
    byAgent.set(agentId, a);
  }
  const agentRows = [...byAgent.entries()]
    .map(([agentId, a]) => ({ agentId, runs: a.runs.size, cost: a.cost, perRun: a.runs.size ? a.cost / a.runs.size : 0 }))
    .sort((x, y) => y.perRun - x.perRun);
  const perRunValues = agentRows.map((r) => r.perRun).sort((a, b) => a - b);
  const medianPerRun = perRunValues[Math.floor(perRunValues.length / 2)] ?? 0;

  const caps = await capStatus();
  const modelOn = isModelAvailable();
  // Cross-request cost tracking only works on a shared DB. A non-"file:" URL
  // (Postgres) means totals aggregate correctly across serverless instances.
  const hasSharedDb = !(process.env.DATABASE_URL ?? "").startsWith("file:");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cost tracking</h1>
        <Link href="/admin/routing" className="text-sm text-accent underline">routing →</Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every model call is logged to the database. Routing → Haiku, drafts → Sonnet ($0 when the offline
        composer is used). Totals aggregate across all requests when a shared database (Postgres) is configured.
      </p>
      {!hasSharedDb && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Note: this deployment uses per-instance SQLite, so each serverless function has its own copy of the
          log — totals here reflect only this instance and will read low. Set a Postgres <code>DATABASE_URL</code>
          for accurate cross-request cost tracking (see README → Production cost tracking).
        </p>
      )}

      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat label="Total cost" value={usd(totalCost)} />
        <Stat label="Calls" value={String(calls.length)} />
        <Stat label="Tokens (in/out)" value={`${totalIn}/${totalOut}`} />
        <Stat label="Failures" value={String(failures)} />
      </div>

      <h2 className="mt-8 text-sm font-semibold">Daily usage caps</h2>
      <p className="text-xs text-muted-foreground">
        Hard per-day limits protect the demo key. At the cap, drafts fall back to the offline composer.
        {modelOn ? "" : " (Live AI is not currently configured — running offline.)"}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <CapCard label="Routing (Haiku)" used={caps.routing.used} cap={caps.routing.cap} ratio={caps.routing.ratio} />
        <CapCard label="Drafts (Sonnet)" used={caps.draft.used} cap={caps.draft.cap} ratio={caps.draft.ratio} />
      </div>

      <h2 className="mt-8 text-sm font-semibold">By agent (cost per run)</h2>
      <p className="text-xs text-muted-foreground">Flagged when an agent&rsquo;s cost/run exceeds 5× the median.</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">Agent</th>
            <th>Runs</th>
            <th>Total</th>
            <th>Cost / run</th>
            <th>Anomaly</th>
          </tr>
        </thead>
        <tbody>
          {agentRows.length === 0 ? (
            <tr><td colSpan={5} className="py-3 text-muted-foreground">No agent runs logged yet.</td></tr>
          ) : (
            agentRows.map((r) => {
              const flagged = medianPerRun > 0 && r.perRun > medianPerRun * 5;
              return (
                <tr key={r.agentId} className="border-b border-border">
                  <td className="py-2 font-medium">{r.agentId}</td>
                  <td>{r.runs}</td>
                  <td>{usd(r.cost)}</td>
                  <td>{usd(r.perRun)}</td>
                  <td className={flagged ? "text-destructive" : "text-muted-foreground"}>{flagged ? "⚠️ investigate" : "ok"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <h2 className="mt-8 text-sm font-semibold">By model</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">Model</th>
            <th>Calls</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {byModel.size === 0 ? (
            <tr>
              <td colSpan={3} className="py-3 text-muted-foreground">
                No model calls logged yet.
              </td>
            </tr>
          ) : (
            [...byModel.entries()].map(([model, m]) => (
              <tr key={model} className="border-b border-border">
                <td className="py-2 font-mono text-xs">{model}</td>
                <td>{m.count}</td>
                <td>{usd(m.cost)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 className="mt-8 text-sm font-semibold">Recent calls</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">When</th>
            <th>Purpose</th>
            <th>Model</th>
            <th>In/Out</th>
            <th>Cost</th>
            <th>OK</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} className="border-b border-border">
              <td className="py-2 text-xs">{c.createdAt.toISOString().slice(11, 19)}</td>
              <td className="text-xs">{c.purpose}</td>
              <td className="font-mono text-xs">{c.model}</td>
              <td className="text-xs">
                {c.inputTokens}/{c.outputTokens}
              </td>
              <td className="text-xs">{usd(c.costUsd)}</td>
              <td className="text-xs">{c.ok ? "✓" : `✕ ${c.error ?? ""}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function CapCard({ label, used, cap, ratio }: { label: string; used: number; cap: number; ratio: number }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  const bar = ratio >= 0.95 ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold">{used} / {cap}</div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{pct}% of today&rsquo;s cap</div>
    </div>
  );
}
