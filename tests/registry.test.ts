/**
 * Registry behaviour + schema validation guardrails.
 */

import { describe, expect, it } from "vitest";
import { AgentRegistry, createRegistry } from "../src/index.js";
import { ValidationError } from "../src/registry/validate.js";
import type { AgentDefinition } from "../src/types.js";

function minimalAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    agent_id: "test_agent",
    display_name: "Test Agent",
    bucket: "system",
    status: "new",
    build_priority: "P3",
    purpose: "test",
    routing: { routes_here_when: ["x"], keywords: ["test"] },
    channel: "report",
    inputs: { from_owner: [], from_shared_context: ["business_profile"] },
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only" },
    triggers_supported: { manual: true },
    outputs: { title_format: "t", body_format: "b" },
    reasoning_trace_steps: [{ name: "s", kind: "work", description: "d" }],
    example_interactions: [
      { owner_ask: "a", expected_route: "test_agent", expected_output_excerpt: "x" },
      { owner_ask: "b", expected_route: "test_agent", expected_output_excerpt: "x" },
      { owner_ask: "c", expected_route: "test_agent", expected_output_excerpt: "x" },
    ],
    run: () => ({ agent_id: "test_agent", orchestratorNotes: [], trace: [] }),
    ...overrides,
  };
}

describe("registry", () => {
  it("registers the full library (18 agents across 8 buckets)", () => {
    const r = createRegistry();
    expect(r.all()).toHaveLength(18);
    expect(r.buckets().sort()).toEqual(
      [
        "customer_service",
        "finance",
        "marketing",
        "reporting",
        "reputation",
        "sales",
        "scheduling_ops",
        "system",
      ].sort(),
    );
  });

  it("byBucket returns the right agents", () => {
    const r = createRegistry();
    expect(r.byBucket("customer_service").map((a) => a.agent_id).sort()).toEqual([
      "complaint_handler",
      "customer_question",
    ]);
  });

  it("rejects a duplicate agent_id", () => {
    const r = new AgentRegistry();
    r.register(minimalAgent());
    expect(() => r.register(minimalAgent())).toThrow(ValidationError);
  });

  it("rejects a non-snake_case agent_id", () => {
    const r = new AgentRegistry();
    expect(() => r.register(minimalAgent({ agent_id: "TestAgent" }))).toThrow(/snake_case/);
  });

  it("rejects an agent without drafts_only default", () => {
    const r = new AgentRegistry();
    expect(() =>
      r.register(
        minimalAgent({ permission_scope: { default: "auto_send" as unknown as "drafts_only" } }),
      ),
    ).toThrow(/drafts_only/);
  });

  it("rejects fewer than 3 example interactions", () => {
    const r = new AgentRegistry();
    expect(() =>
      r.register(
        minimalAgent({
          example_interactions: [
            { owner_ask: "a", expected_route: "test_agent", expected_output_excerpt: "x" },
          ],
        }),
      ),
    ).toThrow(/3 example/);
  });

  it("rejects a non-internal agent that omits business_profile", () => {
    const r = new AgentRegistry();
    expect(() =>
      r.register(minimalAgent({ inputs: { from_owner: [], from_shared_context: [] } })),
    ).toThrow(/business_profile/);
  });
});
