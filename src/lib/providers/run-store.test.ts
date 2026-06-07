import { describe, it, expect } from "vitest";
import {
  getRunStore,
  setRunStore,
  hasRunStore,
  type RunStore,
} from "./run-store.js";

function fakeStore(): RunStore {
  return {
    async createRoutingDecision() { return { id: "rd" }; },
    async markRoutingDecisionOverridden() {},
    async createRun() { return { id: "run" }; },
    async setRunStatus() {},
    async createDraft() { return { id: "draft" }; },
    async captureWishlist() {},
    async recordTraceStep() {},
    async logModelCall() {},
  };
}

describe("RunStore seam", () => {
  it("throws when no store is registered (load-bearing, mirrors SharedContextProvider)", () => {
    expect(hasRunStore()).toBe(false);
    expect(() => getRunStore()).toThrow(/No RunStore registered/);
  });

  it("returns the registered store after setRunStore", async () => {
    const fake = fakeStore();
    setRunStore(fake);
    expect(hasRunStore()).toBe(true);
    expect(getRunStore()).toBe(fake);
    expect(await getRunStore().createRun({ userId: "u", agentId: "sales", ownerAsk: "x", params: {} })).toEqual({ id: "run" });
  });
});
