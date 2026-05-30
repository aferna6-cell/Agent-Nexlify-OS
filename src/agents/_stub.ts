/**
 * Stub agent helper.
 *
 * Phase 1 registers all 18 agents so the orchestrator can classify against the
 * full library, but only the Generalist is implemented. Every other agent is a
 * stub: full, schema-valid metadata (so routing and the schema enforcer work)
 * with a run function that honestly reports it isn't implemented yet — no draft.
 *
 * Phase 2 replaces these stubs with real implementations, one folder at a time.
 */

import { defineAgent, type Agent } from "./_schema.js";

export function defineStub(spec: unknown): Agent {
  const agent = defineAgent(spec, async () => ({
    orchestratorNotes: [
      `The ${agent.display_name} agent is on the roadmap but isn't implemented yet — I routed your ask to it correctly, and it'll start drafting once it's built. For now, want me to take a general pass at this instead?`,
    ],
    noDraftReason: "agent not implemented yet",
  }));
  return agent;
}
