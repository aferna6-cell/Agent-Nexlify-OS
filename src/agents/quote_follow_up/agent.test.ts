import { describe, expect, it } from "vitest";
import { quoteFollowUp } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("quote_follow_up", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(quoteFollowUp, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("carries the quote amount + scope and uses relative dates", async () => {
    const { output } = await runFromAsk(quoteFollowUp, "Follow up with Dana on the $2,400 repaint quote she hasn't booked.", fullContext());
    expect(output.draft!.body).toMatch(/\$2,400/);
    expect(output.draft!.body).toMatch(/Today|\+7 days|\+14 days/);
  });

  it("rule 1 — no false-success loads on an empty context", async () => {
    const { steps } = await runFromAsk(quoteFollowUp, "Follow up on the $850 quote", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });
});
