/**
 * LLM provider abstraction.
 *
 * Per the target architecture, routing/classification runs on Haiku and final
 * drafts on Sonnet. To keep Agent OS demoable and CI-testable without API keys,
 * the default provider is deterministic (see deterministic.ts) and the registry
 * never depends on a live model to satisfy the three rules. A real provider
 * (anthropic.ts) is used automatically when ANTHROPIC_API_KEY is present.
 */

export interface CompletionRequest {
  /** System / scaffolding prompt. */
  system: string;
  /** The owner ask or task content. */
  prompt: string;
  /** Hint at which tier this call belongs to. */
  role?: "routing" | "draft";
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  /** Provider-reported model id, for cost/trace bookkeeping. */
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  /**
   * Whether the provider can currently serve requests. The Generalist relies on
   * this to honor the "service temporarily unavailable → no draft" rule rather
   * than emitting a silent empty draft.
   */
  available(): boolean;
  complete(req: CompletionRequest): CompletionResult;
}
