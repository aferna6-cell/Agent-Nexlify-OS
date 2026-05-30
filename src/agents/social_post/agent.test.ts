import { describe, expect, it } from "vitest";
import { socialPost } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import { findMarkdown } from "../_format.js";

describe("social_post", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(socialPost, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 3 — post channel is plain text (no markdown asterisks)", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(socialPost, ex.owner_ask, fullContext());
      expect(findMarkdown(output.draft!.body)).toEqual([]);
      expect(output.draft!.body).not.toContain("*");
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(socialPost, "Facebook post about a special", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });
});
