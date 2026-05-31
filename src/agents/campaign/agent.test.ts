import { describe, expect, it } from "vitest";
import { campaign } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("campaign", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(campaign, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("QA fix — front-loads the price in the subject (<= 30 chars)", async () => {
    const { output } = await runFromAsk(campaign, "Email blast for $59 spring detail special. Keep it short.", fullContext());
    const subjectLine = output.draft!.body.split("\n").find((l) => /subject/i.test(l)) ?? "";
    const subject = subjectLine.replace(/\*\*Subject:\*\*\s*/i, "").trim();
    expect(subject.startsWith("$59")).toBe(true);
    expect(subject.length).toBeLessThanOrEqual(31); // 30 + ellipsis tolerance
  });

  it("QA fix — 'keep it short' does not add an unrequested social variant", async () => {
    const { output } = await runFromAsk(campaign, "Email blast for $59 spring special. Keep it short.", fullContext());
    expect(output.draft!.body).not.toMatch(/Social variant/i);
  });

  it("QA fix — default emoji density is low (no emoji by default)", async () => {
    const { output } = await runFromAsk(campaign, "Write a promo announcement for 20% off oil changes.", fullContext());
    expect(output.draft!.body).not.toMatch(/🎉|🔥|😀/);
  });

  it("rule 1 — no false-success loads on an empty context", async () => {
    const { steps } = await runFromAsk(campaign, "Email blast for a spring special", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
    expect(steps.find((s) => s.step === "load_audience")?.status).toBe("skipped_no_data");
  });

  it("rule 2 — real business name in signoff", async () => {
    const { output } = await runFromAsk(campaign, "Email blast for $59 spring special.", fullContext());
    expect(output.draft!.body).not.toMatch(/\[Shop Name\]/);
    expect(output.draft!.body).toContain("Sunset Auto Care");
  });
});
