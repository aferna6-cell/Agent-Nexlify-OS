import { describe, expect, it } from "vitest";
import { leadTriage } from "./agent.js";
import { examples } from "./examples.js";
import { fullContext, runFromAsk } from "../_testkit.js";

describe("lead_triage", () => {
  it("is a schema-valid agent with the expected id", () => {
    expect(leadTriage.agent_id).toBe("lead_triage");
    expect(leadTriage.channel).toBe("internal");
    expect(leadTriage.examples.length).toBeGreaterThanOrEqual(3);
  });

  it("classifies a booking snippet as booking", async () => {
    const { output } = await runFromAsk(leadTriage, "(internal) classify: 'I'd like to book Saturday.'", fullContext());
    expect(output.draft).toBeDefined();
    expect(output.draft!.metadata!.intent).toBe("booking");
    expect(output.draft!.body).toContain("booking");
  });

  it("classifies a complaint snippet and recommends not auto-sending", async () => {
    const { output } = await runFromAsk(leadTriage, "(internal) classify: 'My car came back scratched.'", fullContext());
    expect(output.draft!.metadata!.intent).toBe("complaint");
    expect(output.draft!.body).toContain("complaint");
    expect(output.draft!.body).toMatch(/do not auto-send/i);
  });

  it("classifies a general inquiry as question", async () => {
    const { output } = await runFromAsk(leadTriage, "(internal) classify: 'What are your weekend hours?'", fullContext());
    expect(output.draft!.metadata!.intent).toBe("question");
    expect(output.draft!.body).toContain("question");
  });

  it("each example produces a draft containing its expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(leadTriage, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });
});
