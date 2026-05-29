/**
 * Library-wide conformance suite.
 *
 * Every agent must conform to the §2 schema and satisfy the three rules. These
 * tests run the full library; any new agent is held to the same bar, and a
 * violation fails CI.
 */

import { describe, expect, it } from "vitest";
import { ALL_AGENTS } from "../src/agents/index.js";
import { createRegistry } from "../src/index.js";
import { DeterministicProvider } from "../src/llm/index.js";
import { sampleContext } from "../src/context/sampleData.js";
import {
  buildProbeInput,
  findChannelRuleViolations,
  findHonestTraceViolations,
  findPlaceholderViolations,
  validateDefinition,
} from "../src/registry/validate.js";

const deps = { llm: new DeterministicProvider() };

describe("library", () => {
  it("contains all 18 v1 agents", () => {
    expect(ALL_AGENTS).toHaveLength(18);
  });

  it("registers without validation errors", () => {
    expect(() => createRegistry()).not.toThrow();
  });

  it("has unique agent ids", () => {
    const ids = ALL_AGENTS.map((a) => a.agent_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(ALL_AGENTS.map((a) => [a.agent_id, a] as const))(
  "agent %s",
  (_id, def) => {
    it("conforms to the schema (§2)", () => {
      expect(() => validateDefinition(def)).not.toThrow();
    });

    it("declares at least 3 example interactions that route to itself", () => {
      expect(def.example_interactions.length).toBeGreaterThanOrEqual(3);
      for (const ex of def.example_interactions) {
        expect(ex.expected_route).toBe(def.agent_id);
      }
    });

    it("rule 1 — no false-success load step on an empty context", () => {
      expect(findHonestTraceViolations(def, deps)).toEqual([]);
    });

    it("rule 2 — emits no placeholder for a field present in the profile", () => {
      const ctx = sampleContext();
      const res = def.run(buildProbeInput(def), ctx, deps);
      if (res.draft) {
        expect(findPlaceholderViolations(res.draft, ctx.business_profile)).toEqual([]);
      }
    });

    it("rule 3 — plain-text channel drafts contain no markdown", () => {
      const ctx = sampleContext();
      const res = def.run(buildProbeInput(def), ctx, deps);
      if (res.draft) {
        expect(findChannelRuleViolations(res.draft)).toEqual([]);
      }
    });

    it("reads business_profile from shared context (unless internal)", () => {
      if (def.channel !== "internal") {
        expect(def.inputs.from_shared_context).toContain("business_profile");
      }
    });
  },
);
