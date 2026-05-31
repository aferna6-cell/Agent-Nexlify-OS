/**
 * Usage-cap tests: cap status derives from today's real (claude-*) model calls,
 * the level escalates warn→critical→exceeded, and offline/local calls don't count.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db before importing the module under test.
const findMany = vi.fn();
vi.mock("./db.js", () => ({ db: { modelCallLog: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { capStatus, isCapExceeded, ROUTING_CAP, DRAFT_CAP } from "./usage.js";

function rows(model: string, n: number) {
  return Array.from({ length: n }, () => ({ model }));
}

describe("usage caps", () => {
  beforeEach(() => findMany.mockReset());

  it("ok level when usage is low", async () => {
    findMany.mockResolvedValue(rows("claude-haiku-4-5-20251001", 1));
    const s = await capStatus();
    expect(s.level).toBe("ok");
    expect(s.routing.used).toBe(1);
  });

  it("warn at >=80% of a cap", async () => {
    // routing tier queried first; return 80% of ROUTING_CAP for routing, 0 for draft.
    findMany
      .mockResolvedValueOnce(rows("claude-haiku-4-5-20251001", Math.ceil(ROUTING_CAP * 0.8)))
      .mockResolvedValueOnce([]);
    const s = await capStatus();
    expect(s.level).toBe("warn");
  });

  it("critical at >=95%", async () => {
    findMany
      .mockResolvedValueOnce(rows("claude-haiku-4-5-20251001", Math.ceil(ROUTING_CAP * 0.96)))
      .mockResolvedValueOnce([]);
    const s = await capStatus();
    expect(s.level).toBe("critical");
  });

  it("exceeded at >=100%, and isCapExceeded reports true", async () => {
    findMany.mockResolvedValue(rows("claude-sonnet-4-6", DRAFT_CAP));
    const s = await capStatus();
    expect(s.level).toBe("exceeded");
    expect(s.draft.exceeded).toBe(true);
    findMany.mockResolvedValue(rows("claude-sonnet-4-6", DRAFT_CAP));
    expect(await isCapExceeded("draft")).toBe(true);
  });

  it("offline/local-composer calls do NOT count toward the cap", async () => {
    findMany.mockResolvedValue([...rows("local-composer", 999), ...rows("down", 50)]);
    const s = await capStatus();
    expect(s.routing.used).toBe(0);
    expect(s.draft.used).toBe(0);
    expect(s.level).toBe("ok");
  });

  it("'other' purpose is never capped", async () => {
    expect(await isCapExceeded("other")).toBe(false);
  });
});
