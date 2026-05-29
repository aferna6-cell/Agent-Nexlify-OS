/**
 * Agent OS — public API.
 *
 * `createAgentOS()` wires the full v1 library into a validated registry and an
 * orchestrator, ready to handle owner asks against a shared context.
 */

import { ALL_AGENTS } from "./agents/index.js";
import { AgentRegistry } from "./registry/registry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import type { AgentDeps } from "./types.js";

export interface AgentOS {
  registry: AgentRegistry;
  orchestrator: Orchestrator;
}

/** Build a registry populated (and validated) with the full agent library. */
export function createRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.registerAll(ALL_AGENTS);
  return registry;
}

/** Build a ready-to-use Agent OS instance. */
export function createAgentOS(deps?: Partial<AgentDeps>): AgentOS {
  const registry = createRegistry();
  const orchestrator = new Orchestrator(registry, deps);
  return { registry, orchestrator };
}

export { ALL_AGENTS } from "./agents/index.js";
export { AgentRegistry } from "./registry/registry.js";
export { Orchestrator } from "./orchestrator/orchestrator.js";
export { Wishlist } from "./orchestrator/wishlist.js";
export * from "./types.js";
export type { BusinessProfile } from "./profile.js";
export type { SharedContext } from "./context/sharedContext.js";
export { emptyContext } from "./context/sharedContext.js";
export { sampleContext, quietContext, SUNSET_PROFILE } from "./context/sampleData.js";
export { renderTrace } from "./trace/trace.js";
export {
  DeterministicProvider,
  UnavailableProvider,
  getProvider,
  setProvider,
} from "./llm/index.js";
