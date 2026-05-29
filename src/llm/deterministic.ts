/**
 * Deterministic LLM provider.
 *
 * The default provider for the standalone build. It produces structured,
 * profile-aware prose without calling an external model, so the whole product
 * is demoable and every test is reproducible offline. Agents build the
 * substance of their drafts deterministically; this provider exists so the
 * Generalist and any free-form path have a content source whose availability we
 * can model honestly.
 */

import type { CompletionRequest, CompletionResult, LLMProvider } from "./provider.js";

export class DeterministicProvider implements LLMProvider {
  readonly name = "deterministic";

  available(): boolean {
    return true;
  }

  complete(req: CompletionRequest): CompletionResult {
    return { text: req.prompt.trim(), model: "deterministic-1" };
  }
}

/**
 * A provider that is always unavailable. Used to exercise the
 * "service temporarily unavailable" failure mode (Generalist rule 2) in demos
 * and tests.
 */
export class UnavailableProvider implements LLMProvider {
  readonly name = "unavailable";

  available(): boolean {
    return false;
  }

  complete(): CompletionResult {
    throw new Error("LLM provider unavailable");
  }
}
