/**
 * PrismaRunStore — the standalone implementation of the RunStore write seam.
 *
 * Holds the exact Prisma/SQLite persistence the orchestrator, trace emitter, and
 * anthropic cost logger used to do inline. Registered on import (the orchestrator
 * imports this module for its side effect), mirroring how `_shared-context.ts`
 * registers `PrismaSharedContextProvider`. The production agent-service registers
 * its own RunStore instead via `setRunStore()` and never imports this file.
 */

import { db } from "../lib/db.js";
import {
  setRunStore,
  type RunStore,
  type RoutingDecisionCreate,
  type AgentRunCreate,
  type AgentRunStatus,
  type DraftCreate,
  type TraceStepCreate,
  type ModelCallCreate,
} from "../lib/providers/run-store.js";

export class PrismaRunStore implements RunStore {
  async createRoutingDecision(input: RoutingDecisionCreate): Promise<{ id: string }> {
    const row = await db.routingDecision.create({
      data: {
        userId: input.userId,
        runId: input.runId,
        ask: input.ask,
        classifier: input.classifier,
        decision: input.decision,
        chosenAgent: input.chosenAgent,
        confidence: input.confidence,
        alternates: input.alternates === undefined ? undefined : JSON.stringify(input.alternates),
      },
    });
    return { id: row.id };
  }

  async markRoutingDecisionOverridden(decisionId: string, changedTo: string): Promise<void> {
    await db.routingDecision
      .update({ where: { id: decisionId }, data: { accepted: false, changedTo } })
      .catch(() => undefined);
  }

  async createRun(input: AgentRunCreate): Promise<{ id: string }> {
    const row = await db.agentRun.create({
      data: {
        userId: input.userId,
        agentId: input.agentId,
        ownerAsk: input.ownerAsk,
        params: JSON.stringify(input.params),
        status: "running",
      },
    });
    return { id: row.id };
  }

  async setRunStatus(runId: string, status: AgentRunStatus): Promise<void> {
    await db.agentRun.update({ where: { id: runId }, data: { status } });
  }

  async createDraft(input: DraftCreate): Promise<{ id: string }> {
    const row = await db.draft.create({
      data: {
        runId: input.runId,
        agentId: input.agentId,
        channel: input.channel,
        title: input.title,
        body: input.body,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        requiresApproval: input.requiresApproval,
      },
    });
    return { id: row.id };
  }

  async captureWishlist(input: { userId: string; request: string; consideredAgents: string }): Promise<void> {
    const { userId, request, consideredAgents } = input;
    const existing = await db.wishlistItem.findFirst({ where: { userId, request } });
    if (existing) {
      await db.wishlistItem.update({
        where: { id: existing.id },
        data: { count: existing.count + 1, lastSeen: new Date(), consideredAgents: consideredAgents || existing.consideredAgents },
      });
    } else {
      await db.wishlistItem.create({ data: { userId, request, consideredAgents } });
    }
  }

  async recordTraceStep(input: TraceStepCreate): Promise<void> {
    await db.traceStep.create({
      data: {
        runId: input.runId,
        ordinal: input.ordinal,
        step: input.step,
        status: input.status,
        description: input.description,
        dataSnapshot: input.dataSnapshot === undefined ? null : JSON.stringify(input.dataSnapshot),
      },
    });
  }

  async logModelCall(input: ModelCallCreate): Promise<void> {
    await db.modelCallLog.create({
      data: {
        runId: input.runId && input.runId.length > 0 ? input.runId : null,
        purpose: input.purpose,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsd: input.costUsd,
        ok: input.ok,
        error: input.error ?? null,
      },
    });
  }
}

setRunStore(new PrismaRunStore());
