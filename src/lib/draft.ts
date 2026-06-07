/**
 * Draft generation service.
 *
 * Owner-facing drafts use Sonnet when ANTHROPIC_API_KEY is set (logged to
 * ModelCallLog with real cost). In the standalone build (no key) a deterministic
 * local composer produces the draft so the product is demoable and CI-testable
 * offline — still logged (cost $0) so cost-per-run is always recorded.
 *
 * The Generalist relies on `status` to honor the "service temporarily
 * unavailable → no draft" rule: when drafts are genuinely down (the real model
 * errors with no local fallback, or AGENT_OS_DRAFTS_DISABLED=1) this returns
 * null and the agent surfaces the outage instead of a silent empty draft.
 */

import { getRunStore } from "./providers/run-store.js";
import { complete, isModelAvailable } from "./anthropic.js";

export type DraftSource = "model" | "local";

export interface GenerateDraftOpts {
  system: string;
  prompt: string;
  runId?: string;
  /** Deterministic fallback used when the model is unavailable. */
  local?: () => string;
  maxTokens?: number;
}

export interface GeneratedDraft {
  text: string;
  source: DraftSource;
  model: string;
  costUsd: number;
}

function draftsDisabled(): boolean {
  return process.env.AGENT_OS_DRAFTS_DISABLED === "1";
}

/** True when a draft can be produced (real model, or a local fallback exists). */
export function draftServiceAvailable(hasLocal: boolean): boolean {
  if (draftsDisabled()) return false;
  return isModelAvailable() || hasLocal;
}

export async function generateDraft(opts: GenerateDraftOpts): Promise<GeneratedDraft | null> {
  if (draftsDisabled()) {
    await logLocalCall(opts.runId, "down", false, "drafts_disabled");
    return null;
  }

  if (isModelAvailable()) {
    try {
      const r = await complete({
        purpose: "draft",
        system: opts.system,
        prompt: opts.prompt,
        runId: opts.runId,
        maxTokens: opts.maxTokens ?? 1024,
      });
      return { text: r.text, source: "model", model: r.model, costUsd: r.costUsd };
    } catch {
      // Real model failed. Fall back to local if we have one; else it's an outage.
      if (!opts.local) return null;
    }
  }

  if (opts.local) {
    const text = opts.local();
    await logLocalCall(opts.runId, "local-composer", true);
    return { text, source: "local", model: "local-composer", costUsd: 0 };
  }
  return null;
}

async function logLocalCall(runId: string | undefined, model: string, ok: boolean, error?: string): Promise<void> {
  try {
    await getRunStore().logModelCall({ runId, purpose: "draft", model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok, error });
  } catch {
    // cost logging must never break a run
  }
}
