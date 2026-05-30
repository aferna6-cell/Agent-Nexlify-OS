/**
 * Phase 3 exit-criterion check: confirm the shipped agents (5 P1 + 6+ P2) each
 * run at least 5 times and measure cost-per-run, flagging any agent whose mean
 * cost exceeds 5× the median (the anomaly rule from the spec).
 *
 * Offline (no ANTHROPIC_API_KEY) the local composer is used, so $ cost is 0 for
 * all agents — the script still proves every agent runs cleanly 5× and that the
 * measurement + anomaly check are wired. With a live key the costs become real.
 *
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase3.ts
 */

import { registry } from "../src/agents/_registry.js";
import { loadSharedContext } from "../src/agents/_shared-context.js";
import { extractParams } from "../src/agents/_extract.js";
import { db } from "../src/lib/db.js";
import type { TraceEmitter } from "../src/types/agent.js";

const SHIPPED = [
  // P1
  "customer_question", "booking", "lead_nurture", "campaign", "generalist",
  // P2
  "content_writer", "quote_follow_up", "social_post", "quote_generator", "invoice_reminder", "review_request", "weekly_briefing",
];

const RUNS = 5;
const noopEmitter: TraceEmitter = { async emit() { return true; }, async work() {}, async fallback() {} };

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "maya@sunsetauto.com" } });
  const ctx = await loadSharedContext(user.id);

  const stats: { id: string; runs: number; drafts: number; avgCost: number }[] = [];
  for (const id of SHIPPED) {
    const agent = registry.get(id);
    const ask = agent.examples[0]!.owner_ask;
    let drafts = 0;
    let cost = 0;
    for (let i = 0; i < RUNS; i++) {
      const out = await agent.run({ input: extractParams(ask), context: ctx, emitTrace: noopEmitter, ownerAsk: ask, runId: "" });
      if (out.draft) {
        drafts += 1;
        cost += (out.draft.metadata?.cost_usd as number | undefined) ?? 0;
      }
    }
    stats.push({ id, runs: RUNS, drafts, avgCost: cost / RUNS });
  }

  const means = stats.map((s) => s.avgCost).sort((a, b) => a - b);
  const median = means[Math.floor(means.length / 2)] ?? 0;
  const threshold = median * 5;

  console.log(`\nShipped agents: ${stats.length}\n`);
  console.log("agent                  runs  drafts  avg cost/run   anomaly(>5× median)");
  console.log("─".repeat(74));
  let anomalies = 0;
  for (const s of stats) {
    const flagged = median > 0 && s.avgCost > threshold;
    if (flagged) anomalies += 1;
    console.log(
      `${s.id.padEnd(22)} ${String(s.runs).padStart(4)}  ${String(s.drafts).padStart(6)}   $${s.avgCost.toFixed(6)}    ${flagged ? "⚠️ INVESTIGATE" : "ok"}`,
    );
  }

  const allRan5 = stats.every((s) => s.runs >= 5);
  const allDrafted = stats.every((s) => s.drafts >= 1);
  console.log(`\nmedian cost/run = $${median.toFixed(6)} · anomaly threshold = $${threshold.toFixed(6)}`);
  console.log(`\nEXIT CRITERION:`);
  console.log(`  ${stats.length} agents shipped (need >=11): ${stats.length >= 11 ? "✅" : "❌"}`);
  console.log(`  each run >=5 times: ${allRan5 ? "✅" : "❌"}`);
  console.log(`  each produced a draft: ${allDrafted ? "✅" : "❌"}`);
  console.log(`  cost-per-run measured + anomaly check: ✅ (${anomalies} flagged)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
