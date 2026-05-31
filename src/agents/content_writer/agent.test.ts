import { describe, expect, it } from "vitest";
import { contentWriter } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("content_writer", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(contentWriter, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(contentWriter, "Write a blog post about detailing", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("rule 2 — no bracketed placeholders", async () => {
    const { output } = await runFromAsk(contentWriter, "Draft an About Us paragraph for our shop.", fullContext());
    expect(output.draft!.body).not.toMatch(/\[[A-Z][^\]]*\]/);
    expect(output.draft!.body).toContain("Sunset Auto Care");
  });
});
