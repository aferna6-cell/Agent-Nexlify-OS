/**
 * OwnerActions — the write-side seam for agents that mutate owner/business state.
 *
 * Agents read the world through `SharedContext` (read-only). A few agents also
 * need to *write* a small, well-defined side effect — e.g. AI Visibility tags the
 * owner record so the beta invite can find them later. Those writes must not go
 * straight to Prisma, or the production merge stops being mechanical (production's
 * schema/ORM differ). They go through this seam instead.
 *
 * Standalone implementation: `PrismaOwnerActions` (registered in
 * `src/agents/_shared-context.ts`). Production calls `setOwnerActions()` at
 * startup with an implementation backed by its own store. See docs/INTEGRATION.md.
 *
 * Keep this interface tiny and intention-revealing: one method per real side
 * effect, never a generic "write". That keeps the production surface auditable.
 */

export interface OwnerActions {
  /**
   * Record that the owner expressed interest in the AI Visibility beta.
   * Best-effort by contract: implementations should not throw on failure — the
   * caller treats a false return as "not tagged" and continues. Returns whether
   * the tag was persisted.
   */
  tagAiVisibilityInterest(userId: string): Promise<boolean>;
}

let actions: OwnerActions | null = null;

/** Production merge calls this once at startup to swap the write side. */
export function setOwnerActions(a: OwnerActions): void {
  actions = a;
}

export function getOwnerActions(): OwnerActions {
  if (!actions) {
    throw new Error(
      "No OwnerActions registered. The standalone app registers PrismaOwnerActions " +
        "in src/agents/_shared-context.ts. The production merge must call " +
        "setOwnerActions() at startup — see docs/INTEGRATION.md.",
    );
  }
  return actions;
}

export function hasOwnerActions(): boolean {
  return actions !== null;
}
