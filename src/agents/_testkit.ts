/**
 * Test helpers for agent unit tests: an in-memory trace emitter (no DB) and the
 * seeded business-profile contexts (full + empty).
 */

import { hasData } from "./_trace.js";
import { extractParams } from "./_extract.js";
import type { Agent } from "./_schema.js";
import type { AgentOutput, BusinessProfileData, SharedContext, StreamedTraceStep, TraceEmitter } from "../types/agent.js";

export function fakeEmitter(): { emitter: TraceEmitter; steps: StreamedTraceStep[] } {
  const steps: StreamedTraceStep[] = [];
  const emitter: TraceEmitter = {
    async emit(step, payload) {
      const present = !!payload && hasData(payload.data);
      steps.push({ step, status: present ? "completed" : "skipped_no_data", description: present ? payload!.description : `No ${step} data available` });
      return present;
    },
    async work(step, description) {
      steps.push({ step, status: "work", description });
    },
    async fallback(step, description) {
      steps.push({ step, status: "fallback", description });
    },
  };
  return { emitter, steps };
}

export const FULL_PROFILE: BusinessProfileData = {
  businessName: "Sunset Auto Care",
  ownerName: "Maya",
  industry: "auto repair",
  city: "Phoenix",
  state: "AZ",
  phone: "(602) 555-0148",
  email: "maya@sunsetauto.com",
  website: "https://sunsetauto.com",
  hoursSummary: "Mon–Sat 8am–6pm",
  reviewLinkGoogle: "https://g.page/r/sunset-detailing/review",
};

export function fullContext(overrides: Partial<SharedContext> = {}): SharedContext {
  return {
    businessProfile: FULL_PROFILE,
    widgetHistory: [],
    pipelineLeads: [],
    appointments: [],
    invoices: [],
    agentRunHistory: [],
    kb: [],
    ...overrides,
  };
}

export function emptyContext(): SharedContext {
  return { businessProfile: {}, widgetHistory: [], pipelineLeads: [], appointments: [], invoices: [], agentRunHistory: [], kb: [] };
}

export async function runAgent(
  agent: Agent,
  input: Record<string, unknown>,
  ctx: SharedContext,
  ownerAsk = "test ask",
): Promise<{ output: AgentOutput; steps: StreamedTraceStep[] }> {
  const { emitter, steps } = fakeEmitter();
  const output = await agent.run({ input, context: ctx, emitTrace: emitter, ownerAsk, runId: "" });
  return { output, steps };
}

/** Runs an agent exactly as the orchestrator would: extract params, then run. */
export async function runFromAsk(
  agent: Agent,
  ownerAsk: string,
  ctx: SharedContext,
): Promise<{ output: AgentOutput; steps: StreamedTraceStep[] }> {
  return runAgent(agent, extractParams(ownerAsk), ctx, ownerAsk);
}

/** Asserts the trace has no false-success load (rule 1) on an empty context. */
export function loadStepsOnEmpty(steps: StreamedTraceStep[]): StreamedTraceStep[] {
  return steps.filter((s) => s.step.startsWith("load") || s.step === "knowledge_base" || s.step === "prior_conversations");
}
