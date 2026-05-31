/**
 * Self-contained demo mode (for the Vercel deploy).
 *
 * The available deploy tooling can't set Vercel env vars or hand us a Postgres
 * URL, so on Vercel the app runs fully self-contained: it ships a pre-seeded
 * SQLite database (prisma/demo.db), copies it to the writable /tmp on first use,
 * and bypasses the magic-link login (which can't span ephemeral instances).
 *
 * Locally this is inert: DATABASE_URL from .env is used and there's no bypass
 * unless AUTH_DEMO_BYPASS=true.
 */

import fs from "node:fs";
import path from "node:path";

export const onVercel = !!process.env.VERCEL;

/** Whether to resolve the seeded demo owner without a logged-in session. */
export function demoBypass(): boolean {
  if (process.env.AUTH_DEMO_BYPASS === "true") return true;
  if (process.env.AUTH_DEMO_BYPASS === "false") return false;
  return onVercel; // default on for the Vercel demo, off everywhere else
}

export const DEMO_OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL ?? "maya@sunsetauto.com";

/**
 * Resolves the SQLite DATABASE_URL. On Vercel, a bundled `file:` database is
 * read-only, so the shipped seed DB is copied to /tmp (writable) on first use.
 */
export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (configured && !(onVercel && configured.startsWith("file:"))) return configured;
  if (onVercel) return ensureTmpDb();
  return configured ?? "file:./dev.db";
}

function ensureTmpDb(): string {
  const tmp = "/tmp/agentos.db";
  try {
    if (!fs.existsSync(tmp)) {
      const seed = path.join(process.cwd(), "prisma", "demo.db");
      if (fs.existsSync(seed)) fs.copyFileSync(seed, tmp);
    }
  } catch {
    // If the copy fails, Prisma will surface a clear error at query time.
  }
  return `file:${tmp}`;
}
