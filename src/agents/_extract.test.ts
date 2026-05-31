/**
 * Parameter-extraction tests — the heuristic param bag that feeds every agent.
 * Covers the QA-report fixes: named-entity capture (B-04), name across more verb
 * forms incl. possessive (B-08).
 */

import { describe, it, expect } from "vitest";
import { extractParams } from "./_extract.js";

describe("extractParams — named entities", () => {
  it("captures a leading name + action verb", () => {
    expect(extractParams("Mike Johnson called about a tire rotation.").customer_name).toBe("Mike Johnson");
  });

  it("captures a possessive name (B-08)", () => {
    expect(extractParams("Confirm Mike Johnson's appointment for Thursday.").customer_name).toBe("Mike Johnson");
  });

  it("captures names after imperative verbs (B-08)", () => {
    expect(extractParams("Follow up with Sarah Chen on her quote.").customer_name).toBe("Sarah Chen");
    expect(extractParams("Text Maria about Thursday.").customer_name).toBe("Maria");
  });

  it("captures service type (B-04)", () => {
    expect(extractParams("Book a tire rotation for Monday.").service_type).toBe("tire rotation");
    expect(extractParams("Schedule an oil change.").service_type).toBe("oil change");
    expect(extractParams("Reply about the AC recharge.").service_type).toBe("AC service");
  });

  it("captures vehicle, bounded (B-04)", () => {
    expect(extractParams("Confirm the tire rotation on his 2019 F-150 for Thursday at 10:30.").vehicle).toBe("2019 F-150");
    expect(extractParams("Aisha asked about her 2018 Prius battery.").vehicle).toBe("2018 Prius");
    expect(extractParams("A Honda Civic needs an oil change.").vehicle).toBe("Honda Civic");
  });

  it("vehicle does not swallow trailing words", () => {
    const v = extractParams("tire rotation on a 2019 F-150 for Thursday at 10:30").vehicle as string;
    expect(v).toBe("2019 F-150");
    expect(v).not.toMatch(/Thursday/);
  });

  it("still captures money, platform, slot", () => {
    const p = extractParams("Follow up with Dana on the $2,400 repaint quote for Saturday at 9am.");
    expect(p.amount).toBe(2400);
    expect(p.offered_slot).toBe("Saturday at 9am");
  });
});
