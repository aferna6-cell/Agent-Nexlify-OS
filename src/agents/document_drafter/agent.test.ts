import { describe, expect, it } from "vitest";
import { documentDrafter } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("document_drafter", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(documentDrafter, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(documentDrafter, "Draft a service agreement template for new customers.", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("uses the real business name in the document", async () => {
    const { output } = await runFromAsk(documentDrafter, "Generate a new-customer intake form.", fullContext());
    expect(output.draft!.body).toContain("Sunset Auto Care");
    expect(output.draft!.body).toContain("Intake");
  });
});
