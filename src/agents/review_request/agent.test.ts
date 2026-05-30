import { describe, expect, it } from "vitest";
import { reviewRequest } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import { findMarkdown } from "../_format.js";

describe("review_request", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(reviewRequest, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 3 — SMS is plain text (no markdown)", async () => {
    const { output } = await runFromAsk(reviewRequest, "Ask Maria for a Google review.", fullContext());
    expect(findMarkdown(output.draft!.body)).toEqual([]);
  });

  it("includes the configured Google review link", async () => {
    const { output } = await runFromAsk(reviewRequest, "Ask Maria for a Google review.", fullContext());
    expect(output.draft!.body).toMatch(/g\.page/);
  });

  it("does NOT fabricate a Yelp link that isn't configured; surfaces the gap", async () => {
    const { output } = await runFromAsk(reviewRequest, "Ask Maria for a Yelp review.", fullContext());
    expect(output.draft!.body).not.toMatch(/http/);
    expect(output.orchestratorNotes.join("\n")).toMatch(/yelp review link/i);
  });

  it("rule 1 — no false-success review-link load when none is configured", async () => {
    const { steps } = await runFromAsk(reviewRequest, "Ask Maria for a Yelp review.", fullContext());
    expect(steps.find((s) => s.step === "load_review_link")?.status).toBe("skipped_no_data");
  });
});
