import { describe, expect, it } from "vitest";
import { leadNurture } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("lead_nurture", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(leadNurture, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("QA fix — uses relative dates (Today / +5 / +14), not Day 1 / Day 5", async () => {
    const { output } = await runFromAsk(leadNurture, "Draft a 3-touch follow-up for Sarah.", fullContext());
    const body = output.draft!.body;
    expect(body).toMatch(/Touch 1 — Today/);
    expect(body).toMatch(/\+5 days/);
    expect(body).toMatch(/\+14 days/);
    expect(body).not.toMatch(/Day 1|Day 5/);
  });

  it("rule 1 — no false-success loads on an empty context", async () => {
    const { steps } = await runFromAsk(leadNurture, "Follow up with Sarah", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
    expect(steps.find((s) => s.step === "load_pipeline_state")?.status).toBe("skipped_no_data");
  });

  it("rule 2 — real business name in signoff, no [Shop Name]", async () => {
    const { output } = await runFromAsk(leadNurture, "Follow up with Sarah about a consultation.", fullContext());
    expect(output.draft!.body).not.toMatch(/\[Shop Name\]|\[Your Name\]/);
    expect(output.draft!.body).toContain("Sunset Mobile Detailing");
  });
});
