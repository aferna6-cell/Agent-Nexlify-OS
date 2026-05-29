/**
 * Wishlist capture. Records low-confidence asks so we can prioritise new agents
 * from real demand. De-duplicates by (user, request) and bumps a count.
 */

import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const items = await db.wishlistItem.findMany({
    where: { userId },
    orderBy: { count: "desc" },
  });
  return Response.json(items);
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let request = "";
  let consideredAgents: string[] = [];
  try {
    const body = (await req.json()) as { request?: unknown; consideredAgents?: unknown };
    request = typeof body.request === "string" ? body.request.trim() : "";
    if (Array.isArray(body.consideredAgents)) {
      consideredAgents = body.consideredAgents.filter((x): x is string => typeof x === "string");
    }
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!request) return new Response("Empty request", { status: 400 });

  const existing = await db.wishlistItem.findFirst({ where: { userId, request } });
  if (existing) {
    const updated = await db.wishlistItem.update({
      where: { id: existing.id },
      data: { count: existing.count + 1, lastSeen: new Date() },
    });
    return Response.json(updated);
  }
  const created = await db.wishlistItem.create({
    data: { userId, request, consideredAgents: consideredAgents.join(",") },
  });
  return Response.json(created);
}
