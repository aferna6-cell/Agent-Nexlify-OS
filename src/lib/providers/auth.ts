/**
 * AuthProvider — the identity seam for the production merge.
 *
 * The agent engine and API routes never call NextAuth directly; they ask the
 * registered AuthProvider "who is the current owner?" and get back a stable
 * identity: `{ userId, businessProfileId }`. In the standalone repo this is
 * backed by Auth.js + the demo bypass (`NextAuthProvider`, registered in
 * `src/lib/auth.ts`). The production merge calls `setAuthProvider()` once with
 * an implementation that reads the production session/JWT and resolves the
 * customer's business — without touching any agent code.
 *
 * `userId` is the key the SharedContextProvider loads against. In the standalone
 * single-tenant model userId === the owner and `businessProfileId` mirrors it;
 * production is multi-tenant, where one user may own a business and the
 * `businessProfileId` is what scopes the data load. Agents that tag the owner
 * record use `userId`; data scoping should prefer `businessProfileId`.
 *
 * See docs/INTEGRATION.md for the full contract.
 */

export interface AuthIdentity {
  /** Stable user/owner id. Key for AgentRun ownership and tagging. */
  userId: string;
  /**
   * The business whose data the SharedContextProvider should load. In the
   * standalone app this equals userId (single business per owner). In production
   * it is the production business/account id.
   */
  businessProfileId: string;
}

export interface AuthProvider {
  /**
   * Resolve the current request's owner identity, or null when unauthenticated.
   * Implementations read whatever the host framework exposes (session, JWT,
   * headers) — the agent engine does not care how.
   */
  getCurrentIdentity(): Promise<AuthIdentity | null>;
}

let provider: AuthProvider | null = null;

/** Production merge calls this once at startup to swap identity resolution. */
export function setAuthProvider(p: AuthProvider): void {
  provider = p;
}

export function getAuthProvider(): AuthProvider {
  if (!provider) {
    throw new Error(
      "No AuthProvider registered. The standalone app registers NextAuthProvider " +
        "in src/lib/auth.ts. The production merge must call setAuthProvider() at " +
        "startup — see docs/INTEGRATION.md.",
    );
  }
  return provider;
}

export function hasAuthProvider(): boolean {
  return provider !== null;
}

/**
 * Convenience used across API routes: the current owner's userId, or null.
 * Preserves the existing `getCurrentUserId()` call sites unchanged in spirit.
 */
export async function currentUserId(): Promise<string | null> {
  const id = await getAuthProvider().getCurrentIdentity();
  return id?.userId ?? null;
}
