import { describe, expect, it } from "vitest";
import { aiVisibilityStub } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("ai_visibility_stub", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(aiVisibilityStub, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("is honest — early access, no invented score; captures interest", async () => {
    const { output } = await runFromAsk(aiVisibilityStub, "What's my GEO score?", fullContext());
    expect(output.draft!.body).toMatch(/early access/i);
    expect(output.draft!.body).not.toMatch(/score (is|of) \d|\d+\/100/i); // no fabricated number
    expect(output.draft!.metadata?.beta_interest).toBe(true);
    expect(output.orchestratorNotes.join("\n")).toMatch(/noted your interest/i);
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(aiVisibilityStub, "ai visibility", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });
});
