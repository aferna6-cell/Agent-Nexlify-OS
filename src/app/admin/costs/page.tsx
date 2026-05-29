/**
 * Internal cost tracking. Surfaces every model call's cost so credit
 * exhaustion is never silent. Basic Phase 0 version: totals + recent calls.
 */

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default async function CostsPage() {
  const calls = await db.modelCallLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold">Cost tracking</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every Anthropic call is logged. Routing → Haiku, drafts → Sonnet.
      </p>

      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat label="Total cost" value={usd(totalCost)} />
        <Stat label="Calls" value={String(calls.length)} />
        <Stat label="Tokens (in/out)" value={`${totalIn}/${totalOut}`} />
        <Stat label="Failures" value={String(failures)} />
      </div>

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
