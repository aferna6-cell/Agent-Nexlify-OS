import { afterEach, describe, expect, it } from "vitest";
import { generalist } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runAgent, runFromAsk } from "../_testkit.js";

afterEach(() => {
  delete process.env.AGENT_OS_DRAFTS_DISABLED;
});

describe("generalist", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(generalist, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("bug fix — when drafts are unavailable, produces NO draft and an honest notice", async () => {
    process.env.AGENT_OS_DRAFTS_DISABLED = "1";
    const { output } = await runFromAsk(generalist, "Write me a list of ideas.", fullContext());
    expect(output.draft).toBeUndefined();
    expect(output.noDraftReason).toMatch(/temporarily unavailable/i);
    expect(output.orchestratorNotes.join("\n")).toMatch(/temporarily unavailable/i);
  });

  it("bug fix — offers a near specialist (>0.4) before generating", async () => {
    const { output } = await runAgent(
      generalist,
      { request: "do something vague", nearest_specialist: "Booking", nearest_confidence: 0.45 },
      fullContext(),
    );
    expect(output.orchestratorNotes.join("\n")).toMatch(/close to the Booking agent/i);
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(generalist, "brainstorm ideas", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("rule 2 — emits no bracketed placeholders", async () => {
    const { output } = await runFromAsk(generalist, "Write me a list of ideas to grow.", fullContext());
    expect(output.draft!.body).not.toMatch(/\[[A-Z][^\]]*\]/);
  });
});
