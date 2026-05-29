/**
 * Streaming orchestrator endpoint.
 *
 * Server-Sent Events: each reasoning-trace step is pushed as it happens, then a
 * `routed` event, optional `notes`, the `draft`, and a terminal `done`. This is
 * what powers the live reasoning-trace UX.
 */

import { getCurrentUserId } from "@/lib/auth";
import { handle } from "@/agents/_orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let ask = "";
  try {
    const body = (await req.json()) as { ask?: unknown };
    ask = typeof body.ask === "string" ? body.ask.trim() : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!ask) return new Response("Empty ask", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const result = await handle(userId, ask, { onStep: (s) => send("step", s) });
        send("routed", { agentId: result.agentId, confidence: result.confidence });
        if (result.orchestratorNotes.length > 0) send("notes", { notes: result.orchestratorNotes });
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
