import { describe, expect, it } from "vitest";
import { jobPost } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("job_post", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(jobPost, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(jobPost, "Draft a job posting for a front desk receptionist.", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("uses the real business name and a how-to-apply section", async () => {
    const { output } = await runFromAsk(jobPost, "Post a hiring ad for a detailer.", fullContext());
    expect(output.draft!.body).toContain("Sunset Auto Care");
    expect(output.draft!.body.toLowerCase()).toContain("how to apply");
  });
});
