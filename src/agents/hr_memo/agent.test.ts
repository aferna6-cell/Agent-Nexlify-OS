import { describe, expect, it } from "vitest";
import { hrMemo } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("hr_memo", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(hrMemo, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(hrMemo, "Draft a coaching note about phone etiquette.", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("always requires approval and notes a legal/accuracy review", async () => {
    const { output } = await runFromAsk(hrMemo, "Help me write up an employee who's been late three times this month.", fullContext());
    expect(output.draft!.requiresApproval).toBe(true);
    expect(output.orchestratorNotes.join(" ").toLowerCase()).toContain("legal");
  });
});
