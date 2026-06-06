/**
 * Anthropic SDK wrapper with cost tracking.
 *
 * Every model call is logged to ModelCallLog (model, tokens, cost) so credit
 * exhaustion is never silent — the failure mode the previous product had. Per
 * the cost-discipline plan, routing/classification uses Haiku and owner-facing
 * drafts use Sonnet. When ANTHROPIC_API_KEY is unset the client is unavailable
 * and `complete()` throws ModelUnavailableError, which agents translate into an
 * honest "service temporarily unavailable" message (never a silent empty draft).
 */

import Anthropic from "@anthropic-ai/sdk";
import { getRunStore } from "./providers/run-store.js";
import { isCapExceeded } from "./usage.js";

export type ModelPurpose = "routing" | "draft" | "other";

const ROUTING_MODEL = process.env.ANTHROPIC_MODEL_ROUTING ?? "claude-haiku-4-5-20251001";
const DRAFT_MODEL = process.env.ANTHROPIC_MODEL_DRAFT ?? "claude-sonnet-4-6";

/** USD per million tokens. Update as pricing changes. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
};

function priceFor(model: string): { input: number; output: number } {
  return PRICING[model] ?? { input: 3.0, output: 15.0 };
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export class ModelUnavailableError extends Error {
  constructor(message = "Anthropic API key not configured") {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** Thrown when the daily usage cap for a purpose is hit (offline fallback then applies). */
export class UsageCapExceededError extends Error {
  readonly purpose: "routing" | "draft";
  constructor(purpose: "routing" | "draft", message = `Daily ${purpose} usage cap reached`) {
    super(message);
    this.purpose = purpose;
    this.name = "UsageCapExceededError";
  }
}

let client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  client = apiKey ? new Anthropic({ apiKey }) : null;
  return client;
}

export function isModelAvailable(): boolean {
  return getClient() !== null;
}

export interface CompleteArgs {
  purpose: ModelPurpose;
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Associates the cost log with an agent run. */
  runId?: string;
  /** Override the model; defaults to the per-purpose model. */
  model?: string;
}

export interface CompleteResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Run a completion, logging cost. Throws ModelUnavailableError when no key. */
export async function complete(args: CompleteArgs): Promise<CompleteResult> {
  const model =
    args.model ?? (args.purpose === "routing" ? ROUTING_MODEL : DRAFT_MODEL);
  const anthropic = getClient();

  if (!anthropic) {
    await logCall({ runId: args.runId, purpose: args.purpose, model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false, error: "no_api_key" });
    throw new ModelUnavailableError();
  }

  // Hard daily cap (demo spend protection). When hit, refuse BEFORE calling
  // Anthropic so the agent falls back to the offline composer honestly.
  if ((args.purpose === "routing" || args.purpose === "draft") && (await isCapExceeded(args.purpose))) {
    await logCall({ runId: args.runId, purpose: args.purpose, model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false, error: "usage_cap_exceeded" });
    throw new UsageCapExceededError(args.purpose);
  }

  try {
    const res = await anthropic.messages.create({
      model,
      max_tokens: args.maxTokens ?? 1024,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
    });
    const inputTokens = res.usage.input_tokens;
    const outputTokens = res.usage.output_tokens;
    const costUsd = estimateCostUsd(model, inputTokens, outputTokens);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    await logCall({ runId: args.runId, purpose: args.purpose, model, inputTokens, outputTokens, costUsd, ok: true });
    return { text, model, inputTokens, outputTokens, costUsd };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logCall({ runId: args.runId, purpose: args.purpose, model, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false, error: message });
    throw err;
  }
}

async function logCall(args: {
  runId?: string;
  purpose: ModelPurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  error?: string;
}): Promise<void> {
  try {
    await getRunStore().logModelCall({
      runId: args.runId,
      purpose: args.purpose,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      ok: args.ok,
      error: args.error,
    });
  } catch {
    // Never let cost logging break a request.
  }
}

export { ROUTING_MODEL, DRAFT_MODEL };
