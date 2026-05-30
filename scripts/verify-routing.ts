/**
 * Phase 1 exit-criterion check: route 10 bucket asks through the live
 * orchestrator (writing AgentRun + RoutingDecision rows), plus an ambiguous and
 * a wishlist ask. Prints a pass/fail summary.
 *
 * Run: DATABASE_URL="file:./dev.db" tsx scripts/verify-routing.ts
 */

import { handle } from "../src/agents/_orchestrator.js";
import { db } from "../src/lib/db.js";

const ASKS: { ask: string; expected: string }[] = [
  { ask: "A customer asked what our hours are — can you reply?", expected: "customer_question" },
  { ask: "A customer is furious we scratched their car. Help me respond.", expected: "complaint_handler" },
  { ask: "Draft a 3-touch follow-up for Sarah who went quiet.", expected: "lead_nurture" },
  { ask: "Follow up with Dana on the $2,400 repaint quote — she hasn't booked.", expected: "quote_follow_up" },
  { ask: "Email blast for $59 spring detail special, keep it short.", expected: "campaign" },
  { ask: "Write a Facebook post about our weekend detailing special.", expected: "social_post" },
  { ask: "Text Maria to confirm her Saturday 10am appointment.", expected: "booking" },
  { ask: "Draft a quote for Mike — parts $620, labor $480.", expected: "quote_generator" },
  { ask: "Ask Maria for a Google review after her detail.", expected: "review_request" },
  { ask: "Run my weekly briefing.", expected: "weekly_briefing" },
];

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "alex@sunsetdetailing.com" } });
  let correct = 0;
  console.log("\n— 10 bucket asks —");
  for (const { ask, expected } of ASKS) {
    const r = await handle(user.id, ask);
    const got = r.status === "needs_clarification" ? `ambiguous(${r.clarifyBetween?.map((c) => c.agentId).join("/")})` : r.agentId;
    const ok = r.agentId === expected;
    if (ok) correct += 1;
    console.log(`${ok ? "✅" : "▫︎"} ${String(got).padEnd(22)} conf=${r.confidence.toFixed(2)} [${r.classifier}]  <= ${ask}`);
  }
  console.log(`\nRouting accuracy: ${correct}/10`);

  console.log("\n— ambiguous ask —");
  const amb = await handle(user.id, "Draft a reply, and book an appointment for them.");
  console.log(`status=${amb.status} between=${amb.clarifyBetween?.map((c) => `${c.agentId} ${c.confidence.toFixed(2)}`).join(" / ")}`);

  console.log("\n— wishlist ask —");
  const wish = await handle(user.id, "Help me reorganize my supply closet shelving system.");
  console.log(`status=${wish.status} chosen=${wish.agentId} note="${wish.orchestratorNotes[0]?.slice(0, 80)}…"`);

  const decisions = await db.routingDecision.count();
  const wishlist = await db.wishlistItem.count();
  console.log(`\nRoutingDecision rows logged: ${decisions}`);
  console.log(`WishlistItem rows: ${wishlist}`);
  console.log(`\nEXIT CRITERION: accuracy ${correct}/10 (need >=8), ambiguous=${amb.status === "needs_clarification"}, wishlist=${wish.status === "wishlist_fallback"}, logs populated=${decisions > 0}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
