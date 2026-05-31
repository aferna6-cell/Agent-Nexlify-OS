/**
 * Get / approve / reject a draft.
 *
 * Phase 0: approve/reject just record the status and log to the server console
 * (no real send happens until Phase 4).
 */

import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const draft = await db.draft.findUnique({ where: { id }, include: { run: true } });
  if (!draft || draft.run.userId !== userId) return new Response("Not found", { status: 404 });
  return Response.json({
    id: draft.id,
    title: draft.title,
    body: draft.body,
    channel: draft.channel,
    requiresApproval: draft.requiresApproval,
    status: draft.status,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const draft = await db.draft.findUnique({ where: { id }, include: { run: true } });
  if (!draft || draft.run.userId !== userId) return new Response("Not found", { status: 404 });

  let action = "";
  try {
    const body = (await req.json()) as { action?: unknown };
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return new Response("Invalid action", { status: 400 });
  }

  const status = action === "approve" ? "approved" : "rejected";
  await db.draft.update({ where: { id }, data: { status } });
  // Phase 0: no real send. Log the decision.
  // eslint-disable-next-line no-console
  console.log(`[draft ${id}] ${status} (agent: ${draft.agentId})`);

  return Response.json({ id, status });
}
