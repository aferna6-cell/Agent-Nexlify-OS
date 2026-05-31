import { describe, expect, it } from "vitest";
import { paymentFollowUp } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runAgent, runFromAsk } from "../_testkit.js";

const THREAT = /lawsuit|lawyer|attorney|\bsue\b|\bcourt\b|lien|collections agency|legal action|or else/i;

describe("payment_follow_up", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(paymentFollowUp, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("three escalation levels with progressively firmer framing", async () => {
    const l1 = (await runAgent(paymentFollowUp, { customer_name: "Mike", invoice_amount: 200, escalation_level: 1 }, fullContext())).output.draft!.body;
    const l2 = (await runAgent(paymentFollowUp, { customer_name: "Mike", invoice_amount: 200, escalation_level: 2 }, fullContext())).output.draft!.body;
    const l3 = (await runAgent(paymentFollowUp, { customer_name: "Mike", invoice_amount: 200, escalation_level: 3 }, fullContext())).output.draft!.body;
    expect(l1).toMatch(/firm but friendly/i);
    expect(l2).toMatch(/formal/i);
    expect(l3).toMatch(/final notice/i);
  });

  it("HARD RULE — no threatening or specific-legal language at any level", async () => {
    for (const level of [1, 2, 3]) {
      const { output } = await runAgent(paymentFollowUp, { customer_name: "Mike", invoice_amount: 1100, escalation_level: level }, fullContext());
      expect(output.draft!.body, `level ${level}`).not.toMatch(THREAT);
      expect(output.draft!.body).toMatch(/reply|settle|payment plan|resolve/i); // always a way to resolve
    }
  });

  it("hardcodes never_auto_send + require_owner_approval", () => {
    expect(paymentFollowUp.permission_scope.never_auto_send).toBe(true);
    expect(paymentFollowUp.permission_scope.require_owner_approval).toBe(true);
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runAgent(paymentFollowUp, { invoice_amount: 100, escalation_level: 1 }, emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });
});
