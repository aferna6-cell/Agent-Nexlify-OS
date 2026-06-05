#!/usr/bin/env node
/**
 * Provider-aware `prisma generate` for the build (V-01 production path).
 *
 * The self-contained demo uses SQLite (prisma/schema.prisma). Production sets a
 * `postgresql://` DATABASE_URL — but the generated Prisma client bakes in the
 * datasource provider at generate time, so we must generate against the matching
 * schema. This picks schema.postgres.prisma when DATABASE_URL is Postgres, else
 * the SQLite schema. Used by the `build`/`postinstall` step.
 */
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
const isPg = /^postgres(ql)?:\/\//.test(url);
const schema = isPg ? "prisma/schema.postgres.prisma" : "prisma/schema.prisma";

console.log(`[prisma-generate] DATABASE_URL is ${isPg ? "Postgres" : "SQLite/unset"} → ${schema}`);
execSync(`npx prisma generate --schema ${schema}`, { stdio: "inherit" });
