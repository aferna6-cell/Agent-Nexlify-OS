/**
 * Phase 5 check: run the 6 DEMO.md beats end-to-end through the orchestrator
 * against the seeded Sunset Auto Care data and confirm each behaves as scripted.
 *
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase5.ts
 */

import { handle } from "../src/agents/_orchestrator.js";
import { db } from "../src/lib/db.js";

interface Beat {
  n: number;
  ask: string;
  check: (r: Awaited<ReturnType<typeof handle>>) => string | null; // null = pass
}

const BEATS: Beat[] = [
  { n: 1, ask: "Mike Johnson called wanting a tire rotation Thursday at 10:30.", check: (r) => (r.agentId === "booking" && r.draft && /Thursday/.test(r.draft.body) ? null : `routed ${r.agentId}, body=${r.draft?.body?.slice(0, 60)}`) },
  { n: 2, ask: "What came in through the widget yesterday?", check: (r) => (r.status === "direct_answer" && /widget/i.test(r.answer ?? "") ? null : `status ${r.status}`) },
  { n: 3, ask: "Follow up with Sarah Chen on her brake quote.", check: (r) => (r.agentId === "quote_follow_up" && r.draft && /\$680/.test(r.draft.body) ? null : `routed ${r.agentId}, body=${r.draft?.body?.slice(0, 80)}`) },
  { n: 4, ask: "Draft an email blast for our June AC special, $59 instead of $89.", check: (r) => (r.agentId === "campaign" && r.draft && /\$59/.test(r.draft.body) && /Sunset Auto Care/.test(r.draft.body) ? null : `routed ${r.agentId}`) },
  { n: 5, ask: "Show me my weekly briefing.", check: (r) => (r.agentId === "weekly_briefing" && r.draft && /Weekly Briefing/.test(r.draft.body) && /## /.test(r.draft.body) ? null : `routed ${r.agentId}`) },
  { n: 6, ask: "Help me hire a part-time mechanic.", check: (r) => (r.status === "wishlist_fallback" ? null : `status ${r.status}, routed ${r.agentId}`) },
];

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "maya@sunsetauto.com" } });
  const wishBefore = await db.wishlistItem.count({ where: { userId: user.id } });
  let pass = 0;

  for (const beat of BEATS) {
    const r = await handle(user.id, beat.ask);
    const fail = beat.check(r);
    if (!fail) pass += 1;
    console.log(`${fail ? "❌" : "✅"} Beat ${beat.n}: ${beat.ask}`);
    if (fail) console.log(`     → ${fail}`);
    else if (r.status === "direct_answer") console.log(`     → direct answer: ${r.answer?.split("\n")[0]}`);
    else if (r.draft) console.log(`     → ${r.agentId} draft: ${r.draft.title}`);
    else console.log(`     → ${r.status} (${r.agentId ?? "—"})`);
  }

  const wishAfter = await db.wishlistItem.count({ where: { userId: user.id } });
  console.log(`\nWishlist captured Beat 6: ${wishAfter > wishBefore ? "✅" : "❌"}`);
  console.log(`\nEXIT: ${pass}/6 demo beats behave as scripted — ${pass === 6 ? "DEMO READY ✅" : "needs work ❌"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
