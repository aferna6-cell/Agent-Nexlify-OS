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
    const out = await run(sales, "Follow up with Sarah on the $680 brake quote she hasn't booked.");
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
