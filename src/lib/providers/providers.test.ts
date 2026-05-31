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
import {
  setOwnerActions,
  getOwnerActions,
  hasOwnerActions,
  type OwnerActions,
} from "./owner-actions.js";
import { aiVisibilityStub } from "../../agents/ai_visibility_stub/agent.js";
import { fullContext, fakeEmitter } from "../../agents/_testkit.js";
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

describe("OwnerActions seam", () => {
  it("routes an agent's owner-tag write through a swapped provider (no direct db)", async () => {
    const tagged: string[] = [];
    const fake: OwnerActions = {
      async tagAiVisibilityInterest(userId) {
        tagged.push(userId);
        return true;
      },
    };
    setOwnerActions(fake);
    expect(hasOwnerActions()).toBe(true);

    // Run the AI Visibility agent WITH a userId — the write must go through the
    // seam, proving the agent no longer touches Prisma directly.
    const { emitter } = fakeEmitter();
    const out = await aiVisibilityStub.run({
      input: {},
      context: fullContext(),
      emitTrace: emitter,
      ownerAsk: "how does ChatGPT see my business?",
      runId: "",
      userId: "owner-42",
    });
    expect(tagged).toEqual(["owner-42"]);
    expect(out.draft?.metadata?.tagged).toBe(true);
  });

  it("a failing provider is best-effort (agent still drafts)", async () => {
    setOwnerActions({
      async tagAiVisibilityInterest() {
        return false;
      },
    });
    const { emitter } = fakeEmitter();
    const out = await aiVisibilityStub.run({
      input: {},
      context: fullContext(),
      emitTrace: emitter,
      ownerAsk: "ai visibility please",
      runId: "",
      userId: "owner-7",
    });
    expect(out.draft).toBeTruthy();
    expect(out.draft?.metadata?.tagged).toBe(false);
  });
});
