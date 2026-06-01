/**
 * Usage/cap status endpoint — drives the credit-low banner and admin views.
 * Returns today's routing/draft call counts vs. their caps and a severity level.
 */

import { capStatus } from "@/lib/usage";
import { isModelAvailable } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await capStatus();
  return Response.json({ ...status, modelAvailable: isModelAvailable() });
}
