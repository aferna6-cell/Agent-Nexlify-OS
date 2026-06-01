/**
 * Streaming orchestrator endpoint.
 *
 * SSE events:
 *  - step      : a reasoning-trace step, pushed as it happens
 *  - routed    : the routing decision (agent, confidence, alternates, decisionId)
 *  - clarify   : ambiguous — two near-tied options for the owner to choose
 *  - notes     : orchestrator-chat notes
 *  - draft     : the produced draft
 *  - no_draft  : the agent produced no draft (e.g. a stub) + reason
 *  - done / error
 *
 * Accepts `forceAgentId` + `overrodeDecisionId` to re-route after the owner
 * picks a different agent from the decision UI.
 */

import { getCurrentUserId } from "@/lib/auth";
import { handle } from "@/agents/_orchestrator";
import { registry } from "@/agents/_registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let ask = "";
  let forceAgentId: string | undefined;
  let overrodeDecisionId: string | undefined;
  try {
    const body = (await req.json()) as { ask?: unknown; forceAgentId?: unknown; overrodeDecisionId?: unknown };
    ask = typeof body.ask === "string" ? body.ask.trim() : "";
    forceAgentId = typeof body.forceAgentId === "string" ? body.forceAgentId : undefined;
    overrodeDecisionId = typeof body.overrodeDecisionId === "string" ? body.overrodeDecisionId : undefined;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!ask) return new Response("Empty ask", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const label = (id: string) => registry.get(id).display_name;
      try {
        const result = await handle(userId, ask, { forceAgentId, overrodeDecisionId, onStep: (s) => send("step", s) });

        if (result.status === "direct_answer") {
          send("answer", { text: result.answer ?? "" });
          send("done", {});
          return;
        }

        if (result.status === "declined") {
          // Non-business ask — polite decline, no draft (v2 Decision 2).
          if (result.orchestratorNotes.length) send("notes", { notes: result.orchestratorNotes });
          send("done", {});
          return;
        }

        if (result.status === "needs_clarification") {
          send("clarify", {
            decisionId: result.decisionId,
            options: (result.clarifyBetween ?? []).map((c) => ({
              agentId: c.agentId,
              displayName: label(c.agentId),
              confidence: c.confidence,
            })),
          });
          if (result.orchestratorNotes.length) send("notes", { notes: result.orchestratorNotes });
          send("done", {});
          return;
        }

        send("routed", {
          status: result.status,
          decisionId: result.decisionId,
          classifier: result.classifier,
          agentId: result.agentId,
          displayName: result.agentId ? label(result.agentId) : undefined,
          confidence: result.confidence,
          alternates: result.alternates.map((c) => ({
            agentId: c.agentId,
            displayName: label(c.agentId),
            confidence: c.confidence,
          })),
        });
        if (result.orchestratorNotes.length) send("notes", { notes: result.orchestratorNotes });
        if (result.draft && result.draftId) {
          send("draft", {
            id: result.draftId,
            title: result.draft.title,
            body: result.draft.body,
            channel: result.draft.channel,
            requiresApproval: result.draft.requiresApproval,
          });
        } else if (result.noDraftReason) {
          send("no_draft", { reason: result.noDraftReason });
        }
        send("done", { runId: result.runId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
