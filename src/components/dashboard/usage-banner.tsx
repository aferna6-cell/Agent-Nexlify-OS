/**
 * Credit-low / offline banner (Phase A tasks 5 + 6).
 *
 * Server component: reads the cap status directly. Shows nothing in the normal
 * (<80%) case. Escalates yellow at 80%, red at 95%, and a distinct red "offline"
 * state when a cap is exceeded or no API key is configured — so the owner always
 * knows when drafts are coming from the offline composer rather than live AI.
 */

import { capStatus } from "@/lib/usage";
import { isModelAvailable } from "@/lib/anthropic";

export async function UsageBanner() {
  const status = await capStatus();
  const modelAvailable = isModelAvailable();
  const pct = Math.round(status.peakRatio * 100);

  // Offline: no key, or a cap is exhausted → drafts come from the local composer.
  if (!modelAvailable || status.level === "exceeded") {
    const reason = !modelAvailable
      ? "Live AI is not configured"
      : "You've hit today's AI usage cap";
    return (
      <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-center text-sm text-red-800">
        <span className="font-medium">Offline mode.</span> {reason} — drafts are
        coming from the built-in composer and will be lower quality. Real AI
        generation is unavailable{modelAvailable ? " until tomorrow" : ""}.
      </div>
    );
  }

  if (status.level === "critical") {
    return (
      <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-center text-sm text-red-800">
        <span className="font-medium">You're at {pct}% of today's AI usage cap.</span>{" "}
        Drafts will switch to offline mode when the cap is reached.
      </div>
    );
  }

  if (status.level === "warn") {
    return (
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
        You're at {pct}% of today's AI usage cap.
      </div>
    );
  }

  return null;
}
