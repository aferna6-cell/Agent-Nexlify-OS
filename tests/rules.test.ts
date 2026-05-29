/**
 * Direct tests of the three cross-cutting rules, including negative cases that
 * prove the enforcement actually fires.
 */

import { describe, expect, it } from "vitest";
import { TraceBuilder, hasData } from "../src/trace/trace.js";
import { findChannelViolations, stripMarkdown } from "../src/channels.js";
import {
  findChannelRuleViolations,
  findPlaceholderViolations,
} from "../src/registry/validate.js";
import { createRegistry } from "../src/index.js";
import { sampleContext } from "../src/context/sampleData.js";
import { DeterministicProvider } from "../src/llm/index.js";
import type { Draft } from "../src/types.js";

const deps = { llm: new DeterministicProvider() };

describe("rule 1 — honest reasoning trace", () => {
  it("hasData distinguishes empty from present", () => {
    expect(hasData([])).toBe(false);
    expect(hasData("")).toBe(false);
    expect(hasData({})).toBe(false);
    expect(hasData(["x"])).toBe(true);
    expect(hasData("hi")).toBe(true);
  });

  it("a load over empty data can never report success", () => {
    const t = new TraceBuilder();
    t.load("Knowledge base", [], () => "loaded!", "no KB yet");
    const entry = t.build()[0]!;
    expect(entry.status).toBe("empty");
    expect(entry.detail).toBe("no KB yet");
  });

  it("a load over present data reports success with the summary", () => {
    const t = new TraceBuilder();
    t.load("Knowledge base", ["a", "b"], (d) => `loaded ${(d as unknown[]).length}`, "no KB");
    const entry = t.build()[0]!;
    expect(entry.status).toBe("ok");
    expect(entry.detail).toBe("loaded 2");
  });

  it("loadOrSkip marks absent data as skipped", () => {
    const t = new TraceBuilder();
    t.loadOrSkip("Prior chats", [], () => "x");
    expect(t.build()[0]!.status).toBe("skipped");
  });
});

describe("rule 2 — no placeholders for present profile fields", () => {
  const profile = sampleContext().business_profile;

  it("flags a placeholder when the field is present", () => {
    const draft: Draft = {
      title: "x",
      body: "Thanks from [Shop Name]!",
      channel: "email",
      metadata: {},
      requiresApproval: true,
    };
    const v = findPlaceholderViolations(draft, profile);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe(2);
  });

  it("does NOT flag a placeholder when the field is genuinely missing", () => {
    const draft: Draft = {
      title: "x",
      body: "Pay via [Payment Link].",
      channel: "email",
      metadata: {},
      requiresApproval: true,
    };
    // payment_link is intentionally absent from the sample profile.
    expect(findPlaceholderViolations(draft, profile)).toEqual([]);
  });
});

describe("rule 3 — channel formatting", () => {
  it("detects markdown in a plain-text channel", () => {
    const v = findChannelViolations("sms", "Hi **Maria**, see you Thursday");
    expect(v.length).toBeGreaterThan(0);
  });

  it("permits markdown in email/report channels", () => {
    expect(findChannelViolations("email", "**Subject:** Hi")).toEqual([]);
    expect(findChannelViolations("report", "# Heading")).toEqual([]);
  });

  it("stripMarkdown produces a clean plain-text body", () => {
    const cleaned = stripMarkdown("Hi **Maria**, *here* are #notes\n- bullet");
    expect(findChannelViolations("sms", cleaned)).toEqual([]);
  });
});

describe("registry enforcement at run time", () => {
  it("rejects a draft that violates a rule before it reaches the owner", () => {
    const registry = createRegistry();
    // Wrap a real agent to corrupt its output, proving the registry catches it.
    const booking = registry.get("booking");
    const corrupt = {
      ...booking,
      agent_id: "booking",
      run: () => ({
        agent_id: "booking",
        draft: {
          title: "x",
          body: "Hi from [Shop Name] — **bold** in SMS",
          channel: "sms" as const,
          metadata: {},
          requiresApproval: true,
        },
        orchestratorNotes: [],
        trace: [],
      }),
    };
    // Swap the definition in a fresh registry.
    const r2 = createRegistry();
    (r2 as unknown as { agents: Map<string, unknown> }).agents.set("booking", corrupt);
    expect(() =>
      r2.run("booking", { params: {}, ownerAsk: "x" }, sampleContext(), deps),
    ).toThrow(/rule/i);
  });

  it("every library agent passes rule enforcement on a real run", () => {
    const registry = createRegistry();
    for (const def of registry.all()) {
      if (def.channel === "internal") continue;
      const res = def.run({ params: {}, ownerAsk: "test ask" }, sampleContext(), deps);
      if (res.draft) {
        expect(findPlaceholderViolations(res.draft, sampleContext().business_profile)).toEqual([]);
        expect(findChannelRuleViolations(res.draft)).toEqual([]);
      }
    }
  });
});
