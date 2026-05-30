import { describe, expect, it } from "vitest";
import { weeklyBriefing } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import type { SharedContext } from "../../types/agent.js";

function busyContext(): SharedContext {
  return fullContext({
    widgetHistory: [
      { id: "w1", contactName: "Mike", intent: "question", summary: "hybrid battery", topics: ["hybrid"], closedAt: "2026-05-26" },
    ],
    pipelineLeads: [
      { id: "l1", name: "Sarah", status: "stale", subject: "consultation" },
      { id: "l2", name: "Dana", status: "quoted", subject: "repaint", quoteAmount: 2400 },
    ],
    agentRunHistory: [{ agentId: "campaign", title: "Spring blast", status: "approved", createdAt: "2026-05-20" }],
  });
}

describe("weekly_briefing", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(weeklyBriefing, ex.owner_ask, busyContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("includes only non-empty sections when there is activity", async () => {
    const { output } = await runFromAsk(weeklyBriefing, "Run my weekly briefing.", busyContext());
    expect(output.draft!.body).toMatch(/## Conversations/);
    expect(output.draft!.body).toMatch(/## Leads/);
    expect(output.draft!.metadata?.sections_included).toEqual(["Conversations", "Leads", "Drafts & sends"]);
  });

  it("CRITICAL — omits empty sections; never says 'none this week'", async () => {
    const { output } = await runFromAsk(weeklyBriefing, "Run my weekly briefing.", fullContext());
    const body = output.draft!.body;
    expect(body).not.toMatch(/Conversations:?\s*none/i);
    expect(body).not.toMatch(/## Conversations/);
    expect(body).toMatch(/Quiet week/i);
  });

  it("rule 1 — empty sources load as skipped, not false-success", async () => {
    const { steps } = await runFromAsk(weeklyBriefing, "weekly briefing", emptyContext());
    expect(steps.find((s) => s.step === "load_conversations")?.status).toBe("skipped_no_data");
    expect(steps.find((s) => s.step === "load_pipeline")?.status).toBe("skipped_no_data");
  });
});
