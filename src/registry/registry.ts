/**
 * Agent registry.
 *
 * Holds the schema-conformant agent definitions, validates them at registration
 * time, and enforces rules 2 & 3 on every run. The registry is the single place
 * agents are looked up, run, and listed by bucket — so the orchestrator never
 * touches an unvalidated agent.
 */

import type { SharedContext } from "../context/sharedContext.js";
import type {
  AgentDefinition,
  AgentDeps,
  AgentRunInput,
  AgentRunResult,
  Bucket,
} from "../types.js";
import {
  findRunResultViolations,
  validateDefinition,
  ValidationError,
} from "./validate.js";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition>();

  register(def: AgentDefinition): void {
    validateDefinition(def);
    if (this.agents.has(def.agent_id)) {
      throw new ValidationError(def.agent_id, "duplicate agent_id");
    }
    this.agents.set(def.agent_id, def);
  }

  registerAll(defs: AgentDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  get(id: string): AgentDefinition {
    const def = this.agents.get(id);
    if (!def) throw new Error(`unknown agent_id "${id}"`);
    return def;
  }

  all(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  byBucket(bucket: Bucket): AgentDefinition[] {
    return this.all().filter((a) => a.bucket === bucket);
  }

  buckets(): Bucket[] {
    return [...new Set(this.all().map((a) => a.bucket))];
  }

  /**
   * Runs an agent and enforces rules 2 & 3 on its output. A rule violation is a
   * hard failure — it must never reach an owner — so this throws. (Rule 1 is
   * enforced structurally by the trace builder and verified in CI.)
   */
  run(id: string, input: AgentRunInput, ctx: SharedContext, deps: AgentDeps): AgentRunResult {
    const def = this.get(id);
    const result = def.run(input, ctx, deps);
    const violations = findRunResultViolations(result, ctx.business_profile);
    if (violations.length > 0) {
      const detail = violations.map((v) => `rule ${v.rule}: ${v.message}`).join("; ");
      throw new ValidationError(id, `output failed rule enforcement — ${detail}`);
    }
    return result;
  }
}
