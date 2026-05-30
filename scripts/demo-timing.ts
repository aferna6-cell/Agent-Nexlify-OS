/**
 * Times the system's contribution to the demo: runs each of the 6 DEMO.md beats
 * through the orchestrator and reports per-beat + total processing time. This
 * shows the app is never the bottleneck for the "under 12 minutes" budget — the
 * remainder is human narration.
 *
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/demo-timing.ts
 */

process.env.AGENT_OS_DISABLE_FETCH = "1";

import { handle } from "../src/agents/_orchestrator.js";
import { db } from "../src/lib/db.js";

const BEATS = [
  "Mike Johnson called wanting a tire rotation Thursday at 10:30.",
  "What came in through the widget yesterday?",
  "Follow up with Sarah Chen on her brake quote.",
  "Draft an email blast for our June AC special, $59 instead of $89.",
  "Show me my weekly briefing.",
  "Help me hire a part-time mechanic.",
];

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "maya@sunsetauto.com" } });
  // Warm the connection so the first beat isn't penalised by cold start.
  await handle(user.id, "warm up");

  let total = 0;
  console.log("\nbeat  ms     ask");
  console.log("─".repeat(60));
  for (let i = 0; i < BEATS.length; i++) {
    const t0 = performance.now();
    await handle(user.id, BEATS[i]!);
    const ms = performance.now() - t0;
    total += ms;
    console.log(`${String(i + 1).padStart(2)}    ${ms.toFixed(0).padStart(5)}  ${BEATS[i]}`);
  }
  console.log("─".repeat(60));
  console.log(`Total system processing for all 6 beats: ${(total / 1000).toFixed(2)}s`);
  console.log(`Budget: 12 min (720s). System uses ${((total / 720000) * 100).toFixed(2)}% of it — the rest is narration.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
