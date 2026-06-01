import { describe, expect, it } from "vitest";
import { pricingMemo } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("pricing_memo", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(pricingMemo, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(pricingMemo, "Should I raise my detail price to 200?", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("uses the real numbers from the ask", async () => {
    const { output } = await runFromAsk(pricingMemo, "Help me think through raising my oil change price from 39 to 49.", fullContext());
    expect(output.draft!.body).toContain("$39");
    expect(output.draft!.body).toContain("$49");
    expect(output.draft!.metadata?.current_price).toBe(39);
    expect(output.draft!.metadata?.new_price).toBe(49);
  });
});
