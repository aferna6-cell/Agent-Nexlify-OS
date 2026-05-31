/**
 * Formatting helpers — money parsing (the LLM-returns-"$1,100" bug) + display.
 */

import { describe, it, expect } from "vitest";
import { parseMoney, money, finishBody, findMarkdown } from "./_format.js";

describe("parseMoney", () => {
  it("passes through finite numbers", () => {
    expect(parseMoney(1100)).toBe(1100);
    expect(parseMoney(0)).toBe(0);
  });

  it("parses currency-formatted strings the classifier returns", () => {
    expect(parseMoney("$1,100")).toBe(1100);
    expect(parseMoney("1,100.00")).toBe(1100);
    expect(parseMoney("$680")).toBe(680);
    expect(parseMoney(" $2,400 ")).toBe(2400);
  });

  it("handles k/m multipliers", () => {
    expect(parseMoney("$2.4k")).toBe(2400);
    expect(parseMoney("1.5m")).toBe(1_500_000);
  });

  it("returns undefined for unparseable input", () => {
    expect(parseMoney("")).toBeUndefined();
    expect(parseMoney("n/a")).toBeUndefined();
    expect(parseMoney(undefined)).toBeUndefined();
    expect(parseMoney(null)).toBeUndefined();
    expect(parseMoney(NaN)).toBeUndefined();
  });
});

describe("money", () => {
  it("formats whole dollars without cents", () => {
    expect(money(1100)).toBe("$1,100");
    expect(money(680)).toBe("$680");
  });
  it("shows cents when present", () => {
    expect(money(1100.5)).toBe("$1,100.50");
  });
});

describe("finishBody / findMarkdown", () => {
  it("strips markdown on plain-text channels", () => {
    expect(findMarkdown(finishBody("sms", "**bold** text"))).toEqual([]);
  });
  it("keeps markdown on rich channels", () => {
    expect(finishBody("email", "**bold**")).toContain("**bold**");
  });
});
