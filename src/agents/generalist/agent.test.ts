import { describe, expect, it } from "vitest";
import { generalist } from "./agent.js";
import { examples } from "./examples.js";
import type { SharedContext, StreamedTraceStep, TraceEmitter } from "../../types/agent.js";
import { hasData } from "../_trace.js";

/** A persist-free trace emitter that records steps in memory for assertions. */
function fakeEmitter(): { emitter: TraceEmitter; steps: StreamedTraceStep[] } {
  const steps: StreamedTraceStep[] = [];
  const emitter: TraceEmitter = {
    async emit(step, payload) {
      const present = !!payload && hasData(payload.data);
      steps.push({
        step,
        status: present ? "completed" : "skipped_no_data",
        description: present ? payload!.description : `No ${step} data available`,
      });
      return present;
    },
    async work(step, description) {
      steps.push({ step, status: "work", description });
    },
    async fallback(step, description) {
      steps.push({ step, status: "fallback", description });
    },
  };
  return { emitter, steps };
}

const fullContext: SharedContext = {
  businessProfile: { businessName: "Sunset Mobile Detailing", ownerName: "Alex" },
  widgetHistory: [],
  pipelineLeads: [],
  agentRunHistory: [],
  kb: [],
};

const emptyContext: SharedContext = {
  businessProfile: {},
  widgetHistory: [],
  pipelineLeads: [],
  agentRunHistory: [],
  kb: [],
};

describe("generalist agent", () => {
  it("conforms to the schema (validated at import via defineAgent)", () => {
    expect(generalist.agent_id).toBe("generalist");
    expect(generalist.examples.length).toBeGreaterThanOrEqual(3);
    expect(generalist.shared_context_needed).toContain("business_profile");
  });

  it("produces a draft using the real business name", async () => {
    const { emitter } = fakeEmitter();
    const out = await generalist.run({ input: {}, context: fullContext, emitTrace: emitter, ownerAsk: "hello", runId: "r1" });
    expect(out.draft).toBeDefined();
    expect(out.draft!.body).toMatch(/Sunset Mobile Detailing/);
    expect(out.draft!.channel).toBe("report");
  });

  it("rule 1 — does not report a successful profile load when the profile is empty", async () => {
    const { emitter, steps } = fakeEmitter();
    await generalist.run({ input: {}, context: emptyContext, emitTrace: emitter, ownerAsk: "hello", runId: "r2" });
    const load = steps.find((s) => s.step === "load_business_profile");
    expect(load?.status).toBe("skipped_no_data");
  });

  it("every example routes to itself", () => {
    for (const ex of examples) expect(ex.expected_route).toBe("generalist");
  });
});
