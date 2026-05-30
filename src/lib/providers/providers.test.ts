/**
 * Provider-seam tests: prove the data-layer and auth abstractions can be swapped
 * (this is the mechanism the production merge relies on) and that flags resolve.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setSharedContextProvider,
  getSharedContextProvider,
  hasSharedContextProvider,
  type SharedContextProvider,
} from "./shared-context.js";
import {
  setAuthProvider,
  getAuthProvider,
  currentUserId,
  type AuthProvider,
  type AuthIdentity,
} from "./auth.js";
import {
  EnvFeatureFlagProvider,
  setFeatureFlagProvider,
  isFeatureEnabled,
  type FeatureFlagProvider,
  type FeatureFlag,
} from "../feature-flags.js";
import type { SharedContext } from "../../types/agent.js";

const emptyCtx: SharedContext = {
  businessProfile: {},
  widgetHistory: [],
  pipelineLeads: [],
  appointments: [],
  invoices: [],
  agentRunHistory: [],
  kb: [],
};

describe("SharedContextProvider seam", () => {
  it("can swap in a fake provider and route loads through it", async () => {
    const calls: string[] = [];
    const fake: SharedContextProvider = {
      async load(userId) {
        calls.push(userId);
        return { ...emptyCtx, businessProfile: { businessName: "Acme" } };
      },
    };
    setSharedContextProvider(fake);
    expect(hasSharedContextProvider()).toBe(true);
    const ctx = await getSharedContextProvider().load("user-123");
    expect(calls).toEqual(["user-123"]);
    expect(ctx.businessProfile.businessName).toBe("Acme");
  });
});

describe("AuthProvider seam", () => {
  it("resolves identity through a swapped provider", async () => {
    const fake: AuthProvider = {
      async getCurrentIdentity(): Promise<AuthIdentity | null> {
        return { userId: "u1", businessProfileId: "biz-9" };
      },
    };
    setAuthProvider(fake);
    const id = await getAuthProvider().getCurrentIdentity();
    expect(id).toEqual({ userId: "u1", businessProfileId: "biz-9" });
    expect(await currentUserId()).toBe("u1");
  });

  it("currentUserId is null when unauthenticated", async () => {
    setAuthProvider({ async getCurrentIdentity() { return null; } });
    expect(await currentUserId()).toBeNull();
  });
});

describe("FeatureFlagProvider", () => {
  beforeEach(() => setFeatureFlagProvider(new EnvFeatureFlagProvider()));

  it("defaults feature_agent_os on and sub-flags off", async () => {
    delete process.env.FLAG_FEATURE_AGENT_OS;
    delete process.env.FLAG_FEATURE_AGENT_OS_AUTOSEND;
    expect(await isFeatureEnabled("feature_agent_os")).toBe(true);
    expect(await isFeatureEnabled("feature_agent_os_autosend")).toBe(false);
  });

  it("honors env overrides", async () => {
    process.env.FLAG_FEATURE_AGENT_OS = "false";
    expect(await isFeatureEnabled("feature_agent_os")).toBe(false);
    delete process.env.FLAG_FEATURE_AGENT_OS;
  });

  it("can be backed by a production provider", async () => {
    const cohort = new Set(["biz-in-cohort"]);
    const prod: FeatureFlagProvider = {
      async isEnabled(flag: FeatureFlag, ctx) {
        return flag === "feature_agent_os" && !!ctx?.businessProfileId && cohort.has(ctx.businessProfileId);
      },
    };
    setFeatureFlagProvider(prod);
    expect(await isFeatureEnabled("feature_agent_os", { businessProfileId: "biz-in-cohort" })).toBe(true);
    expect(await isFeatureEnabled("feature_agent_os", { businessProfileId: "other" })).toBe(false);
  });
});
