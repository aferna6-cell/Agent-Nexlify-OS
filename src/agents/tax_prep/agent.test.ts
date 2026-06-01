import { describe, expect, it } from "vitest";
import { taxPrep } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("tax_prep", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(taxPrep, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(taxPrep, "Help me prep for tax season", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("references payroll Form 941 and notes it is not tax advice", async () => {
    const { output } = await runFromAsk(taxPrep, "What forms do I need for payroll taxes?", fullContext());
    expect(output.draft!.body).toContain("941");
    expect(output.draft!.body.toLowerCase()).toContain("not tax advice");
  });
});
