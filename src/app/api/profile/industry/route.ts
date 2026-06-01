/**
 * Save the owner's industry cluster + specific business type (v2 Decision 3,
 * the 2-step signup picker). Updates BusinessProfile.industryCluster/businessType
 * for the current owner.
 */

import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clusterById } from "@/lib/industries";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let cluster = "";
  let type = "";
  try {
    const body = (await req.json()) as { cluster?: unknown; businessType?: unknown };
    cluster = typeof body.cluster === "string" ? body.cluster : "";
    type = typeof body.businessType === "string" ? body.businessType : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const c = clusterById(cluster);
  if (!c) return new Response("Unknown cluster", { status: 400 });
  // The specific type must belong to the chosen cluster (or be empty).
  if (type && !c.types.includes(type)) return new Response("Type not in cluster", { status: 400 });

  await db.businessProfile.update({
    where: { userId },
    data: { industryCluster: cluster, businessType: type || null },
  });

  return Response.json({ industryCluster: cluster, businessType: type || null });
}
