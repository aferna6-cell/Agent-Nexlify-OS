/**
 * Contract guard: agents must never import the Prisma client directly.
 *
 * The whole "mechanical, not surgical" merge promise (docs/INTEGRATION.md) rests
 * on the agent layer being datasource-agnostic: agents READ through
 * `SharedContext` and WRITE through `OwnerActions`. If an agent imports `lib/db`
 * it couples to Prisma and the production swap stops being mechanical — so this
 * test fails CI the moment that happens.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const AGENTS_DIR = join(process.cwd(), "src", "agents");

/** All `<agent>/agent.ts` files (the runtime entry points). */
function agentEntryFiles(): string[] {
  return readdirSync(AGENTS_DIR)
    .map((name) => join(AGENTS_DIR, name))
    .filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .map((dir) => join(dir, "agent.ts"))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });
}

describe("agents are datasource-agnostic", () => {
  const files = agentEntryFiles();

  it("found the agent entry files", () => {
    // v2: 17 skill agents (the 18 v1 workers minus the eliminated Generalist).
    expect(files.length).toBeGreaterThanOrEqual(17);
  });

  it("no agent imports the Prisma db client", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Match an import of the db client from lib/db (any relative depth).
      if (/from\s+["'][^"']*lib\/db(\.js)?["']/.test(src) || /import\s+["'][^"']*lib\/db/.test(src)) {
        offenders.push(f.replace(process.cwd() + "/", ""));
      }
    }
    expect(offenders, `these agents import lib/db directly: ${offenders.join(", ")}`).toEqual([]);
  });
});

/**
 * The portable engine — everything that gets vendored into the production
 * agent-service — must also be Prisma-free, reading through SharedContext and
 * writing through RunStore. Only the three environment-specific wiring files
 * (`_shared-context.ts`, `_run-store.ts`, `lib/usage.ts`) and `lib/db.ts` itself
 * may touch Prisma; the agent-service ships its own versions of those. This guard
 * is what would have caught `lib/draft.ts` writing ModelCallLog directly.
 */
describe("portable engine is datasource-agnostic", () => {
  const LIB = join(process.cwd(), "src", "lib");
  const AGENTS = join(process.cwd(), "src", "agents");

  /** Engine modules that the agent-service vendors verbatim (must be db-free). */
  function portableEngineFiles(): string[] {
    const wiring = new Set(["_shared-context.ts", "_run-store.ts"]);
    const agentTop = readdirSync(AGENTS)
      .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && !wiring.has(n))
      .map((n) => join(AGENTS, n));
    const lib = ["anthropic.ts", "draft.ts", "seo.ts"].map((n) => join(LIB, n));
    return [...agentTop, ...lib];
  }

  it("no portable engine module imports lib/db", () => {
    const offenders: string[] = [];
    for (const f of portableEngineFiles()) {
      const src = readFileSync(f, "utf8");
      if (/from\s+["'][^"']*lib\/db(\.js)?["']/.test(src) || /import\s+["'][^"']*\/db\.js["']/.test(src)) {
        offenders.push(f.replace(process.cwd() + "/", ""));
      }
    }
    expect(offenders, `these engine modules import the db client directly: ${offenders.join(", ")}`).toEqual([]);
  });
});
