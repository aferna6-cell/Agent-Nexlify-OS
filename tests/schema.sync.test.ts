/**
 * Schema-sync guard.
 *
 * Prisma 6 can't choose the datasource provider via env(), so the production
 * Postgres datasource lives in its own file (`schema.postgres.prisma`). To keep
 * it from drifting from the standalone SQLite schema, this test asserts the two
 * files are IDENTICAL except for:
 *   - their leading comment block (header), and
 *   - the single datasource `provider` line.
 * If you add a model/field, add it to BOTH files — CI fails here otherwise.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function bodyWithoutComments(file: string): string[] {
  const text = readFileSync(join(process.cwd(), "prisma", file), "utf8");
  return text
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//")) // drop comment lines (headers differ by design)
    .map((l) => l.replace(/\s+$/, "")) // trim trailing whitespace
    .filter((l) => l.length > 0);
}

describe("prisma schema sync (sqlite vs postgres)", () => {
  const sqlite = bodyWithoutComments("schema.prisma");
  const postgres = bodyWithoutComments("schema.postgres.prisma");

  it("differ only by the datasource provider line", () => {
    const diff: { sqlite?: string; postgres?: string }[] = [];
    const max = Math.max(sqlite.length, postgres.length);
    for (let i = 0; i < max; i++) {
      if (sqlite[i] !== postgres[i]) diff.push({ sqlite: sqlite[i], postgres: postgres[i] });
    }
    // Exactly one differing line, and it must be the provider declaration.
    expect(diff).toHaveLength(1);
    expect(diff[0]!.sqlite).toContain('provider = "sqlite"');
    expect(diff[0]!.postgres).toContain('provider = "postgresql"');
  });

  it("postgres schema declares the postgresql provider", () => {
    expect(postgres.some((l) => l.includes('provider = "postgresql"'))).toBe(true);
  });
});
