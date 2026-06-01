import { describe, expect, it } from "vitest";
import { trainingDoc } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("training_doc", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(trainingDoc, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(trainingDoc, "Draft a training checklist for a new front-desk hire.", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("produces an SOP when asked for one", async () => {
    const { output } = await runFromAsk(trainingDoc, "Write an SOP for opening the shop.", fullContext());
    expect(output.draft!.body).toContain("SOP");
    expect(output.draft!.metadata?.kind).toBe("SOP");
  });
});
