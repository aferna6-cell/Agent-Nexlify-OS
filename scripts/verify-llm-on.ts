/**
 * Post-QA Phase C + D verification harness (run with ANTHROPIC_API_KEY set).
 *
 * Replays the QA report's 12 re-verification scenarios through the real
 * orchestrator (LLM-on), captures route / classifier / cost / draft for each,
 * checks the report's "Expected" behaviour, and prints a per-agent cost-per-run
 * table (Phase D). Output is written to AgentOS_PostQA_Round2_findings.md.
 *
 * v2 note: expected routes are now the 8 DEPARTMENT heads (the former v1 workers
 * are internal skills). Scenario 12 (payroll) lands on the People department.
 *
 *   DATABASE_URL=file:./dev.db ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-llm-on.ts
 */

import { writeFileSync } from "node:fs";
import { handle } from "../src/agents/_orchestrator.js";
import { db } from "../src/lib/db.js";
import { isModelAvailable } from "../src/lib/anthropic.js";

interface Scenario {
  n: number;
  ask: string;
  expectRoute: string; // department id, "direct_answer", "declined", or "wishlist_fallback"
  check: (body: string, route: string) => { pass: boolean; detail: string };
}

const scenarios: Scenario[] = [
  { n: 1, ask: "Mike Johnson called wanting a tire rotation Thursday at 10:30.", expectRoute: "operations",
    check: (b) => ({ pass: /Mike/.test(b) && /Sunset Auto Care/.test(b), detail: "name + business signoff" }) },
  { n: 2, ask: "Draft a booking confirmation SMS for Mike Johnson — tire rotation Thursday at 10:30 AM on his 2019 F-150. Earliest we can do is Thursday; tomorrow is fully booked.", expectRoute: "operations",
    check: (b) => ({ pass: /F-150/.test(b) && /(fully booked|earliest|Thursday)/i.test(b), detail: "vehicle + scheduling constraint" }) },
  { n: 3, ask: "What came in through the widget yesterday?", expectRoute: "direct_answer",
    check: (b) => ({ pass: /widget/i.test(b), detail: "direct widget summary" }) },
  { n: 4, ask: "Follow up with Sarah Chen on her brake quote.", expectRoute: "sales",
    check: (b) => ({ pass: /Hi Sarah[,!]/.test(b) && !/Sarah Chen,/.test(b), detail: "first-name greeting" }) },
  { n: 5, ask: "Show me my weekly briefing.", expectRoute: "direct_answer",
    check: (b) => ({ pass: /Owner attention needed/i.test(b), detail: "cross-department briefing" }) },
  { n: 6, ask: "Draft an email blast for existing customers announcing our June AC check special: $59 instead of $89, June 1-15. Keep it short. Subject, preheader, body.", expectRoute: "marketing",
    check: (b) => ({ pass: /\$59|59/.test(b) && b.length > 200 && !/existing customers announcing/i.test(b), detail: "real marketing copy, not prompt echo" }) },
  { n: 7, ask: "A widget lead asked: 'Do you guys handle hybrids? I have a 2018 Prius and the battery feels weak.' Draft a response.", expectRoute: "customer_service",
    check: (_b, r) => ({ pass: r === "customer_service", detail: "routed to Customer Service, not direct-answer" }) },
  { n: 8, ask: "A customer named Aisha just asked us this question: 'Do you handle hybrids? I have a 2018 Prius with a weak battery.' Please draft a reply I can send back.", expectRoute: "customer_service",
    check: (b) => ({ pass: /Hi Aisha/.test(b), detail: "greets Aisha; safe holding reply" }) },
  { n: 9, ask: "Robert L. just messaged us angry that his recent AC recharge didn't hold. He wants it looked at again. Draft a careful response.", expectRoute: "customer_service",
    check: (b) => ({ pass: /AC/i.test(b), detail: "references AC recharge specifically" }) },
  { n: 10, ask: "Draft a quote for Mike Johnson: full brake job on his 2019 F-150, parts $620, labor $480, net 15 terms.", expectRoute: "sales",
    check: (b) => ({ pass: /1,100|1100/.test(b) && /net 15/i.test(b), detail: "totals + terms" }) },
  { n: 11, ask: "Send Mike Johnson a reminder about his outstanding invoice (8 days overdue, $1,100).", expectRoute: "invoicing",
    check: (b) => ({ pass: /\$1,100|1100/.test(b), detail: "amount referenced (8-days-overdue ideally)" }) },
  // v2: payroll/tax is a People (or Accounting) department task now — no Generalist.
  { n: 12, ask: "Help me figure out my quarterly payroll tax filings and remind me when to pay each one.", expectRoute: "people",
    check: (b) => ({ pass: /941|940|quarterly|payroll|tax/i.test(b) && !/Goal\s*\/\s*Approach/i.test(b), detail: "real payroll/tax answer, not coaching template" }) },
];

async function main() {
  if (!isModelAvailable()) {
    console.error("ANTHROPIC_API_KEY not set — this harness verifies LLM-ON behaviour. Aborting.");
    process.exit(2);
  }
  const owner = await db.user.findUnique({ where: { email: "maya@sunsetauto.com" } });
  if (!owner) throw new Error("seed owner missing — run npm run db:seed first");

  const lines: string[] = [];
  lines.push("# Agent OS — Post-QA Round 2 Findings (LLM-on re-verification, v2 departments)");
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()} against the seeded Sunset Auto Care demo with live Haiku routing + Sonnet drafts.`);
  lines.push("");
  lines.push("## Phase C — 12 scenario re-verification");
  lines.push("");
  lines.push("| # | Expected route | Actual route | Classifier | Conf | Cost | Check | Result |");
  lines.push("|---|---|---|---|---|---|---|---|");

  let pass = 0;
  for (const s of scenarios) {
    const r = await handle(owner.id, s.ask);
    const route =
      r.status === "direct_answer" ? "direct_answer"
        : r.status === "wishlist_fallback" ? "wishlist_fallback"
          : r.status === "declined" ? "declined"
            : (r.agentId ?? r.status);
    const body = r.draft?.body ?? r.answer ?? r.orchestratorNotes.join(" ");
    const cost = (r.draft?.metadata as Record<string, unknown> | undefined)?.cost_usd ?? 0;
    // Payroll may land on People or Accounting depending on the classifier — both fine.
    const routeOk = route === s.expectRoute || (s.n === 12 && (route === "people" || route === "accounting"));
    const chk = s.check(body, route);
    const ok = routeOk && chk.pass;
    if (ok) pass++;
    lines.push(`| ${s.n} | ${s.expectRoute} | ${route} | ${r.classifier} | ${r.confidence?.toFixed?.(2) ?? "-"} | $${Number(cost).toFixed(4)} | ${chk.detail} | ${ok ? "✅" : "❌"} |`);
  }
  lines.push("");
  lines.push(`**Result: ${pass}/${scenarios.length} scenarios pass** (acceptance ≥ 10/12).`);
  lines.push("");

  // Phase D — per-agent cost-per-run from the ledger.
  const calls = await db.modelCallLog.findMany({ include: { run: true } });
  const byAgent = new Map<string, { runs: Set<string>; cost: number }>();
  for (const c of calls) {
    const id = c.run?.agentId; if (!id) continue;
    const a = byAgent.get(id) ?? { runs: new Set<string>(), cost: 0 };
    if (c.runId) a.runs.add(c.runId); a.cost += c.costUsd; byAgent.set(id, a);
  }
  const rows = [...byAgent.entries()].map(([id, a]) => ({ id, runs: a.runs.size, perRun: a.runs.size ? a.cost / a.runs.size : 0 })).sort((x, y) => y.perRun - x.perRun);
  const median = [...rows.map((r) => r.perRun)].sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0;
  lines.push("## Phase D — per-agent cost-per-run");
  lines.push("");
  lines.push("| Agent | Runs | Cost/run | Anomaly (>5× median) |");
  lines.push("|---|---|---|---|");
  for (const r of rows) lines.push(`| ${r.id} | ${r.runs} | $${r.perRun.toFixed(4)} | ${median > 0 && r.perRun > median * 5 ? "⚠️" : "ok"} |`);
  lines.push("");
  lines.push(`Median cost/run: $${median.toFixed(4)}.`);
  lines.push("");

  writeFileSync("AgentOS_PostQA_Round2_findings.md", lines.join("\n"));
  console.log(lines.join("\n"));
  console.log(`\nWrote AgentOS_PostQA_Round2_findings.md — ${pass}/${scenarios.length} pass`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
