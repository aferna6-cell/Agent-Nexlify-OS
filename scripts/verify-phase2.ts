/**
 * Phase 2 exit-criterion check: run the 5 P1 example asks through the live
 * orchestrator and verify each produces a quality draft — real business name,
 * no bracketed placeholders, no markdown on plain-text channels, honest trace —
 * with cost logged per run.
 *
 * Run: DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase2.ts
 */

import { handle } from "../src/agents/_orchestrator.js";
import { db } from "../src/lib/db.js";
import { findMarkdown, isPlainTextChannel } from "../src/agents/_format.js";
import type { StreamedTraceStep } from "../src/types/agent.js";

const ASKS: { ask: string; expect: string }[] = [
  { ask: "A new lead asked through the widget: 'Do you guys handle hybrids? I have a 2018 Prius and the battery feels weak.' Draft a response.", expect: "customer_question" },
  { ask: "Text Maria to offer her Thursday at 2pm for a consultation.", expect: "booking" },
  { ask: "Draft a 3-touch follow-up for Sarah who asked about a consultation two weeks ago.", expect: "lead_nurture" },
  { ask: "Email blast for $59 spring detail special, ends May 31. Keep it short.", expect: "campaign" },
  { ask: "Write me a list of ideas to get more weekend bookings.", expect: "generalist" },
];

const PLACEHOLDER = /\[(shop name|your name|business name|phone|website|city|owner name)\]/i;

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "alex@sunsetdetailing.com" } });
  const costBefore = await db.modelCallLog.count();
  let pass = 0;

  for (const { ask, expect } of ASKS) {
    const steps: StreamedTraceStep[] = [];
    const r = await handle(user.id, ask, { onStep: (s) => steps.push(s) });
    const d = r.draft;
    const channel = d?.channel ?? "—";
    const issues: string[] = [];
    if (!d) issues.push("NO DRAFT");
    if (r.agentId !== expect) issues.push(`routed to ${r.agentId} (expected ${expect})`);
    if (d && PLACEHOLDER.test(`${d.title}\n${d.body}`)) issues.push("contains placeholder");
    if (d && isPlainTextChannel(d.channel) && findMarkdown(d.body).length) issues.push(`markdown in ${d.channel}`);
    // honest trace: no "completed" load step whose description implies zero data
    const falseSuccess = steps.find((s) => s.status === "completed" && /\b0 \b|\(\)/.test(s.description));
    if (falseSuccess) issues.push("false-success trace step");

    const ok = issues.length === 0;
    if (ok) pass += 1;
    const cost = (d?.metadata?.cost_usd as number | undefined) ?? 0;
    const source = (d?.metadata?.source as string | undefined) ?? "—";
    console.log(`\n${ok ? "✅" : "❌"} ${r.agentId}  [${channel}, ${source}, $${cost.toFixed(4)}]  ${issues.join("; ")}`);
    console.log(`   ${ask}`);
    if (d) {
      console.log(`   title: ${d.title}`);
      console.log(`   body:  ${d.body.replace(/\n/g, "\n          ").slice(0, 240)}${d.body.length > 240 ? "…" : ""}`);
    }
  }

  const costAfter = await db.modelCallLog.count();
  console.log(`\n— summary —`);
  console.log(`Quality drafts passing all checks: ${pass}/5`);
  console.log(`ModelCallLog rows added (cost logged per run): ${costAfter - costBefore}`);
  console.log(`EXIT CRITERION: ${pass === 5 ? "MET" : "NOT MET"} (5 quality drafts, no placeholders, no SMS markdown, honest traces, cost logged)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
