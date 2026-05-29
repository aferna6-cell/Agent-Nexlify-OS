/**
 * Agent registry — the source of truth for which agents exist.
 *
 * Imports every agent module, validates each against the schema at load
 * (`defineAgent` throws on any violation), and exposes a typed registry to the
 * orchestrator. Phase 0 registers only the Generalist; later phases add one
 * agent folder at a time.
 */

import type { Agent, AgentBucket } from "./_schema.js";
import { generalist } from "./generalist/agent.js";

const AGENTS: Agent[] = [generalist];

class AgentRegistry {
  private readonly byId = new Map<string, Agent>();

  constructor(agents: Agent[]) {
    for (const a of agents) {
      if (this.byId.has(a.agent_id)) {
        throw new Error(`duplicate agent_id "${a.agent_id}"`);
      }
      this.byId.set(a.agent_id, a);
    }
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): Agent {
    const a = this.byId.get(id);
    if (!a) throw new Error(`unknown agent_id "${id}"`);
    return a;
  }

  all(): Agent[] {
    return [...this.byId.values()];
  }

  byBucket(bucket: AgentBucket): Agent[] {
    return this.all().filter((a) => a.bucket === bucket);
  }

  /** Agents eligible for owner-ask routing (internal agents fire on events). */
  routable(): Agent[] {
    return this.all().filter((a) => a.channel !== "internal");
  }
}

export const registry = new AgentRegistry(AGENTS);
export type { Agent };
