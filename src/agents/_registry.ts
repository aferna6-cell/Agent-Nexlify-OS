/**
 * Agent registry — the source of truth for which agents exist.
 *
 * Agent Library v2: the owner routes to ONE OF 8 DEPARTMENT HEADS (see
 * docs/AgentNexLiFy_Agent_Library_v2.md). Each department bundles the former v1
 * worker agents as internal skills. `lead_triage` stays registered as internal
 * event infrastructure (channel "internal", not owner-routable). The v1
 * Generalist is eliminated — low-confidence asks fall back to the nearest
 * department or a polite non-business decline (see _orchestrator.ts).
 */

import type { Agent, AgentBucket } from "./_schema.js";
import { DEPARTMENTS } from "./departments.js";
import { leadTriage } from "./lead_triage/agent.js";

const AGENTS: Agent[] = [...DEPARTMENTS, leadTriage];

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
