/**
 * Routing decision log. Every owner ask is recorded with the chosen agent,
 * confidence, alternates, and whether the owner accepted or re-routed — the
 * dataset we'll use to fine-tune the classifier after enough decisions accrue.
 */

import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Alt {
  agentId: string;
  confidence: number;
}

function parseAlts(json: string | null): Alt[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Alt[];
  } catch {
    return [];
  }
}

const BADGE: Record<string, string> = {
  routed: "bg-emerald-100 text-emerald-800",
  ambiguous: "bg-amber-100 text-amber-800",
  wishlist_fallback: "bg-blue-100 text-blue-800",
  owner_override: "bg-purple-100 text-purple-800",
};

export default async function RoutingPage() {
  const decisions = await db.routingDecision.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const total = decisions.length;
  const overrides = decisions.filter((d) => d.decision === "owner_override").length;
  const wishlist = decisions.filter((d) => d.decision === "wishlist_fallback").length;
  const ambiguousList = decisions.filter((d) => d.decision === "ambiguous");

  // Routing accuracy: of the decisions that resolved to a route, how many the
  // owner accepted (didn't re-route). Excludes ambiguous + direct answers.
  const resolved = decisions.filter((d) => d.decision !== "ambiguous" && d.decision !== "direct_answer");
  const acceptedCount = resolved.filter((d) => d.accepted).length;
  const accuracy = resolved.length ? Math.round((acceptedCount / resolved.length) * 100) : 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Routing decisions</h1>
        <Link href="/admin/costs" className="text-sm text-accent underline">
          cost tracking →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Input → chosen agent → confidence → accepted/changed. Fine-tuning data.
      </p>

      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat label="Decisions" value={String(total)} />
        <Stat label="Routing accuracy" value={`${accuracy}%`} />
        <Stat label="Owner overrides" value={String(overrides)} />
        <Stat label="Wishlist fallbacks" value={String(wishlist)} />
      </div>

      {ambiguousList.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-sm font-semibold text-amber-900">Needs review — ambiguous routings ({ambiguousList.length})</div>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {ambiguousList.slice(0, 8).map((d) => (
              <li key={d.id}>
                &ldquo;{d.ask}&rdquo; — {parseAlts(d.alternates).slice(0, 2).map((a) => a.agentId).join(" vs ") || d.chosenAgent}
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">When</th>
            <th>Ask</th>
            <th>Chosen</th>
            <th>Conf.</th>
            <th>Decision</th>
            <th>By</th>
            <th>Alternates</th>
          </tr>
        </thead>
        <tbody>
          {decisions.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-4 text-muted-foreground">
                No routing decisions logged yet.
              </td>
            </tr>
          ) : (
            decisions.map((d) => {
              const alts = parseAlts(d.alternates).slice(1, 4);
              return (
                <tr key={d.id} className="border-b border-border align-top">
                  <td className="py-2 text-xs">{d.createdAt.toISOString().slice(11, 19)}</td>
                  <td className="max-w-[16rem] truncate text-xs" title={d.ask}>
                    {d.ask}
                  </td>
                  <td className="text-xs font-medium">
                    {d.chosenAgent}
                    {d.changedTo ? <span className="text-muted-foreground"> → {d.changedTo}</span> : null}
                  </td>
                  <td className="text-xs">{Math.round(d.confidence * 100)}%</td>
                  <td className="text-xs">
                    <span className={`rounded px-1.5 py-0.5 ${BADGE[d.decision] ?? "bg-muted"}`}>{d.decision}</span>
                    {!d.accepted && <span className="ml-1 text-purple-700">changed</span>}
                  </td>
                  <td className="text-xs">{d.classifier}</td>
                  <td className="text-xs text-muted-foreground">
                    {alts.map((a) => `${a.agentId} ${Math.round(a.confidence * 100)}%`).join(", ") || "—"}
                  </td>
                </tr>
              );
            })
          )}
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
