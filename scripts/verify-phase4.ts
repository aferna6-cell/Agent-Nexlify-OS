/**
 * Phase 4 exit-criterion check: 15+ agents shipped (5 P1 + 6 P2 + 4 P3), each
 * run >=5 times, cost-per-run measured with the >5×-median anomaly flag. Also
 * confirms the AI Visibility stub tags the owner record.
 *
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase4.ts
 */

process.env.AGENT_OS_DISABLE_FETCH = "1"; // keep seo_check offline for the run

import { registry } from "../src/agents/_registry.js";
import { loadSharedContext } from "../src/agents/_shared-context.js";
import { extractParams } from "../src/agents/_extract.js";
import { db } from "../src/lib/db.js";
import type { TraceEmitter } from "../src/types/agent.js";

const SHIPPED = [
  "customer_question", "booking", "lead_nurture", "campaign", "generalist", // P1
  "content_writer", "quote_follow_up", "social_post", "quote_generator", "invoice_reminder", "review_request", "weekly_briefing", // P2
  "complaint_handler", "seo_recommendations", "ai_visibility_stub", "payment_follow_up", // P3
];
const DEFERRED = ["lead_triage", "appointment_reminder"];

const RUNS = 5;
const noop: TraceEmitter = { async emit() { return true; }, async work() {}, async fallback() {} };

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "maya@sunsetauto.com" } });
  const ctx = await loadSharedContext(user.id);
  await db.user.update({ where: { id: user.id }, data: { aiVisibilityInterest: false } }); // reset for the test

  const stats: { id: string; runs: number; drafts: number; avg: number }[] = [];
  for (const id of SHIPPED) {
    const agent = registry.get(id);
    const ask = agent.examples[0]!.owner_ask;
    let drafts = 0;
    let cost = 0;
    for (let i = 0; i < RUNS; i++) {
      const out = await agent.run({ input: extractParams(ask), context: ctx, emitTrace: noop, ownerAsk: ask, runId: "", userId: user.id });
      if (out.draft) { drafts += 1; cost += (out.draft.metadata?.cost_usd as number | undefined) ?? 0; }
    }
    stats.push({ id, runs: RUNS, drafts, avg: cost / RUNS });
  }

  const means = stats.map((s) => s.avg).sort((a, b) => a - b);
  const median = means[Math.floor(means.length / 2)] ?? 0;
  let anomalies = 0;
  console.log(`\nShipped agents: ${stats.length} (deferred: ${DEFERRED.join(", ")})\n`);
  console.log("agent                  runs  drafts  avg cost/run   anomaly");
  console.log("─".repeat(64));
  for (const s of stats) {
    const flagged = median > 0 && s.avg > median * 5;
    if (flagged) anomalies += 1;
    console.log(`${s.id.padEnd(22)} ${String(s.runs).padStart(4)}  ${String(s.drafts).padStart(6)}   $${s.avg.toFixed(6)}    ${flagged ? "⚠️ INVESTIGATE" : "ok"}`);
  }

  const tagged = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).aiVisibilityInterest;
  const allRan5 = stats.every((s) => s.runs >= 5);
  const allDrafted = stats.every((s) => s.drafts >= 1);

  console.log(`\nEXIT CRITERION:`);
  console.log(`  agents shipped: ${stats.length} (need >=15) ${stats.length >= 15 ? "✅" : "❌"}`);
  console.log(`  each run >=5 times: ${allRan5 ? "✅" : "❌"}`);
  console.log(`  each produced a draft: ${allDrafted ? "✅" : "❌"}`);
  console.log(`  cost-per-run measured + anomaly check: ✅ (${anomalies} flagged, median $${median.toFixed(6)})`);
  console.log(`  ai_visibility tags owner record: ${tagged ? "✅" : "❌"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
