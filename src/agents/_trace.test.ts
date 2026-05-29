import { describe, expect, it } from "vitest";
import { createTraceEmitter, hasData } from "./_trace.js";
import type { StreamedTraceStep } from "../types/agent.js";
import { registry } from "./_registry.js";

describe("hasData", () => {
  it("treats empty arrays/strings/objects as no data", () => {
    expect(hasData([])).toBe(false);
    expect(hasData("")).toBe(false);
    expect(hasData({})).toBe(false);
    expect(hasData(["x"])).toBe(true);
    expect(hasData("hi")).toBe(true);
  });
});

describe("trace emitter (rule 1)", () => {
  it("never marks an empty load completed; marks a present load completed", async () => {
    const steps: StreamedTraceStep[] = [];
    const emit = createTraceEmitter("run", { persist: false, onStep: (s) => steps.push(s) });
    await emit.emit("knowledge_base", { description: "Loaded KB", data: [] });
    await emit.emit("widget_history", { description: "Loaded 2 chats", data: [1, 2] });
    expect(steps[0]!.status).toBe("skipped_no_data");
    expect(steps[1]!.status).toBe("completed");
  });
});

describe("registry", () => {
  it("registers the generalist and exposes it for routing", () => {
    expect(registry.has("generalist")).toBe(true);
    expect(registry.routable().map((a) => a.agent_id)).toContain("generalist");
  });
});
