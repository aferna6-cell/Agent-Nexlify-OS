/**
 * Orchestrator.
 *
 * Classifies the owner ask to an agent, creates the AgentRun, loads shared
 * context, runs the agent with a streaming trace emitter, and persists the
 * draft. Phase 0 has a single agent (Generalist), so routing trivially resolves
 * to it; the classifier scaffold is real so later phases plug in Haiku.
 */

import { db } from "../lib/db.js";
import { loadSharedContext } from "./_shared-context.js";
import { createTraceEmitter } from "./_trace.js";
import { registry } from "./_registry.js";
import type { StreamedTraceStep, AgentOutput } from "../types/agent.js";

export interface Candidate {
  agentId: string;
  confidence: number;
}

/** Transparent keyword scorer. Stands in for the Haiku classifier. */
export function classify(ask: string): Candidate[] {
  const a = ask.toLowerCase();
  const scored = registry
    .routable()
    .map((agent) => {
      let score = 0;
      for (const kw of agent.keywords) if (a.includes(kw.toLowerCase())) score += 1;
      for (const sig of agent.strong_signals) if (a.includes(sig.toLowerCase())) score += 3;
      return { agentId: agent.agent_id, score };
    })
    .filter((c) => c.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((c) => ({ agentId: c.agentId, confidence: Number((c.score / (c.score + 2)).toFixed(3)) }));
  return scored;
}

export interface HandleResult {
  runId: string;
  agentId: string;
  confidence: number;
  draftId?: string;
  draft?: AgentOutput["draft"];
  orchestratorNotes: string[];
  noDraftReason?: string;
}

export interface HandleOptions {
  onStep?: (step: StreamedTraceStep) => void;
}

export async function handle(
  userId: string,
  ask: string,
  opts: HandleOptions = {},
): Promise<HandleResult> {
  const candidates = classify(ask);
  // Phase 0 fallback: everything that doesn't match routes to the Generalist.
  const top = candidates[0];
  const agentId = top?.agentId ?? "generalist";
  const confidence = top?.confidence ?? 0;
  const agent = registry.get(agentId);

  const run = await db.agentRun.create({
    data: { userId, agentId, ownerAsk: ask, status: "running" },
  });

  const emit = createTraceEmitter(run.id, { onStep: opts.onStep });
  await emit.work("route", `Routing to the ${agent.display_name} agent`);

  const context = await loadSharedContext(userId);

  let output: AgentOutput;
  try {
    output = await agent.run({ input: {}, context, emitTrace: emit, ownerAsk: ask, runId: run.id });
  } catch (err) {
    await db.agentRun.update({ where: { id: run.id }, data: { status: "failed" } });
    const message = err instanceof Error ? err.message : String(err);
    return { runId: run.id, agentId, confidence, orchestratorNotes: [`Run failed: ${message}`] };
  }

  let draftId: string | undefined;
  if (output.draft) {
    const created = await db.draft.create({
      data: {
        runId: run.id,
        agentId,
        channel: output.draft.channel,
        title: output.draft.title,
        body: output.draft.body,
        metadata: output.draft.metadata ? JSON.stringify(output.draft.metadata) : null,
        requiresApproval: output.draft.requiresApproval,
      },
    });
    draftId = created.id;
    await db.agentRun.update({ where: { id: run.id }, data: { status: "completed" } });
  } else {
    await db.agentRun.update({ where: { id: run.id }, data: { status: "no_draft" } });
  }

  return {
    runId: run.id,
    agentId,
    confidence,
    draftId,
    draft: output.draft,
    orchestratorNotes: output.orchestratorNotes,
    noDraftReason: output.noDraftReason,
  };
}
