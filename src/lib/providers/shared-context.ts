/**
 * SharedContextProvider — the data-layer seam for the production merge.
 *
 * Every agent reads the world through a single `SharedContext` object. In the
 * standalone repo that object is assembled from Prisma/SQLite
 * (`PrismaSharedContextProvider`, registered in `src/agents/_shared-context.ts`).
 * When Agent OS is merged into the production AgentNexLiFy codebase, the merge
 * calls `setSharedContextProvider()` once at startup with an implementation that
 * reads from the production database — and nothing else in the agent engine
 * changes, because the orchestrator and agents only ever see `SharedContext`.
 *
 * See docs/INTEGRATION.md for the full contract and the production checklist.
 */

import type { SharedContext } from "../../types/agent.js";

export interface SharedContextProvider {
  /**
   * Assemble the full shared context for one owner (the business they own).
   * `userId` is the identifier returned by the AuthProvider. Implementations
   * must return a complete `SharedContext` — empty collections, never null —
   * so the honest-trace rule holds (agents report "no data" rather than fail).
   */
  load(userId: string): Promise<SharedContext>;
}

let provider: SharedContextProvider | null = null;

/** Production merge calls this once at startup to swap the data layer. */
export function setSharedContextProvider(p: SharedContextProvider): void {
  provider = p;
}

export function getSharedContextProvider(): SharedContextProvider {
  if (!provider) {
    throw new Error(
      "No SharedContextProvider registered. The standalone app registers " +
        "PrismaSharedContextProvider in src/agents/_shared-context.ts (imported by " +
        "the orchestrator). The production merge must call setSharedContextProvider() " +
        "at startup — see docs/INTEGRATION.md.",
    );
  }
  return provider;
}

/** Test/diagnostic hook: true once a provider is wired. */
export function hasSharedContextProvider(): boolean {
  return provider !== null;
}
