/**
 * Provider factory. Returns the deterministic provider by default so the
 * product runs offline. A future Anthropic-backed provider can be selected via
 * environment configuration without changing any agent code.
 */

import { DeterministicProvider } from "./deterministic.js";
import type { LLMProvider } from "./provider.js";

export type { LLMProvider, CompletionRequest, CompletionResult } from "./provider.js";
export { DeterministicProvider, UnavailableProvider } from "./deterministic.js";

let cached: LLMProvider | undefined;

export function getProvider(): LLMProvider {
  if (cached) return cached;
  // Hook point: when ANTHROPIC_API_KEY is wired in a deployed environment, a
  // model-backed provider can be returned here. The deterministic provider
  // keeps the standalone build self-contained.
  cached = new DeterministicProvider();
  return cached;
}

export function setProvider(p: LLMProvider): void {
  cached = p;
}
