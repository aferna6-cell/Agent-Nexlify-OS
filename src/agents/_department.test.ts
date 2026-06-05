/**
 * Department-head tests (v2): each of the 8 departments dispatches to the right
 * skill and produces a draft, and the two genuinely-new departments (Accounting,
 * People, Customer Data & Admin) work end-to-end.
 */

import { describe, it, expect } from "vitest";
import { DEPARTMENTS, sales, marketing, operations, customerService, invoicing, accounting, adminRecords, people } from "./departments.js";
import { fullContext, fakeEmitter } from "./_testkit.js";
import { extractParams } from "./_extract.js";

async function run(dept: { run: typeof sales.run }, ask: string) {
  const { emitter } = fakeEmitter();
  return dept.run({ input: extractParams(ask), context: fullContext(), emitTrace: emitter, ownerAsk: ask, runId: "" });
}

describe("departments registry shape", () => {
  it("exposes exactly 8 department heads", () => {
    expect(DEPARTMENTS).toHaveLength(8);
    expect(DEPARTMENTS.map((d) => d.agent_id).sort()).toEqual(
      ["accounting", "admin_records", "customer_service", "invoicing", "marketing", "operations", "people", "sales"],
    );
  });

  it("every department example routes to itself (schema rule)", () => {
    for (const d of DEPARTMENTS) {
      for (const ex of d.examples) expect(ex.expected_route).toBe(d.agent_id);
    }
  });
});

describe("department dispatch produces drafts", () => {
  it("Sales drafts a quote follow-up", async () => {
    // Pipeline-aware (V-02): Sarah has an open $680 quote, so a follow-up ask
    // runs the quote-followup skill and references the amount.
    const ctx = fullContext({
      pipelineLeads: [{ id: "l1", name: "Sarah Chen", status: "quoted", subject: "brake job", quoteAmount: 680 }],
    });
    const { emitter } = fakeEmitter();
    const out = await sales.run({
      input: extractParams("Follow up with Sarah Chen on her brake quote."),
      context: ctx,
      emitTrace: emitter,
      ownerAsk: "Follow up with Sarah Chen on her brake quote.",
      runId: "",
    });
    expect(out.draft?.body ?? "").toMatch(/\$680|quote/i);
  });

  it("Operations drafts a booking", async () => {
    const out = await run(operations, "Confirm Mike's tire rotation Thursday at 10:30.");
    expect(out.draft?.channel).toBe("sms");
  });

  it("Marketing drafts a campaign", async () => {
    const out = await run(marketing, "Draft an email blast for our June AC special, $59 instead of $89.");
    expect(out.draft?.body ?? "").toMatch(/59/);
  });

  it("Customer Service complaint skill keeps never-auto-send safety", async () => {
    const out = await run(customerService, "Robert is angry his AC recharge didn't hold and wants a refund.");
    expect(out.draft?.requiresApproval).toBe(true);
    expect(out.draft?.channel).toBe("widget_reply");
  });

  it("Invoicing drafts a reminder", async () => {
    const out = await run(invoicing, "Send Mike a reminder about his outstanding invoice, $1,100, 8 days overdue.");
    expect(out.draft?.body ?? "").toMatch(/1,100|invoice/i);
  });

  it("Accounting produces a financial briefing", async () => {
    const out = await run(accounting, "What was our revenue last week?");
    expect(out.draft?.channel).toBe("report");
  });

  it("Customer Data & Admin drafts a document", async () => {
    const out = await run(adminRecords, "Draft a service agreement template for new customers.");
    expect(out.draft).toBeTruthy();
  });

  it("People drafts a job post", async () => {
    const out = await run(people, "Write a Craigslist post for a part-time mechanic, weekends, must have tools.");
    expect(out.draft).toBeTruthy();
  });
});

describe("V-03 — first-name greeting consistency", () => {
  // The local composer drives these deterministically; each customer-facing
  // department should greet by first name when the orchestrator extracts one.
  it("Customer Service greets by first name", async () => {
    const out = await run(customerService, "A customer named Aisha asked: do you service hybrids? Draft a reply.");
    expect(out.draft!.body).toMatch(/\bAisha\b/);
    expect(out.draft!.body).not.toMatch(/Hi there/i);
  });

  it("Operations greets by first name", async () => {
    const out = await run(operations, "Confirm Mike Johnson's tire rotation Thursday at 10:30.");
    expect(out.draft!.body).toMatch(/Hi Mike\b/);
    expect(out.draft!.body).not.toMatch(/Mike Johnson,/);
  });

  it("Invoicing greets by first name", async () => {
    const ctx = fullContext();
    const { emitter } = fakeEmitter();
    const out = await invoicing.run({
      input: extractParams("Send Mike Johnson a reminder about his $1,100 invoice, 8 days overdue."),
      context: ctx, emitTrace: emitter, ownerAsk: "Send Mike Johnson a reminder about his $1,100 invoice, 8 days overdue.", runId: "",
    });
    expect(out.draft!.body).toMatch(/\bMike\b/);
    expect(out.draft!.body).not.toMatch(/Mike Johnson,/);
  });

  it("Sales (nurture) greets by first name", async () => {
    const out = await run(sales, "Reach out to a lapsed customer named Tom Wallace.");
    expect(out.draft?.body ?? "").toMatch(/\bTom\b/);
  });
});

describe("V-02 — Sales pipeline-aware skill selection", () => {
  // Context with Sarah's existing open quote (the regression scenario).
  const ctxWithQuote = fullContext({
    pipelineLeads: [
      { id: "l1", name: "Sarah Chen", status: "quoted", subject: "brake job", quoteAmount: 680, lastContactDate: "2026-05-25" },
    ],
  });

  async function runSales(ask: string, ctx = ctxWithQuote) {
    const { emitter } = fakeEmitter();
    return sales.run({ input: extractParams(ask), context: ctx, emitTrace: emitter, ownerAsk: ask, runId: "" });
  }

  it("follows up on an existing quote → 3-touch sequence referencing the amount", async () => {
    const out = await runSales("Follow up with Sarah Chen on her brake quote.");
    const body = out.draft!.body;
    expect(body).toMatch(/Touch 1/); // a follow-up sequence, not a quote doc
    expect(body).toMatch(/\$?680/); // references her existing quote
    expect(body).not.toMatch(/no line items/i);
  });

  it("explicit new-quote drafting still itemizes (quote generation unchanged)", async () => {
    const out = await runSales("Draft a quote for Mike Johnson: full brake job, parts $620, labor $480, net 15 terms.");
    expect(out.draft!.body).toMatch(/Total/);
    expect(out.draft!.body).not.toMatch(/Touch 1/);
  });

  it("follow-up on a customer with NO quote → nurture, never a fabricated quote", async () => {
    const out = await runSales("Follow up with a lead I haven't quoted yet, named Tom Wallace, about engine work.");
    // Must not crash and must not produce a quote doc asking for line items.
    expect(out.draft?.body ?? "").not.toMatch(/no line items/i);
    if (out.draft) expect(out.draft.body).not.toMatch(/^Sunset Auto Care/);
  });
});
