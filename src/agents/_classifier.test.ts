import { describe, expect, it } from "vitest";
import { classifyHeuristic } from "./_classifier.js";
import { registry } from "./_registry.js";
import { isWidgetQuery } from "./_orchestrator.js";

/** One representative ask per bucket (the Phase 1 exit-criterion test set). */
const BUCKET_ASKS: { ask: string; expected: string }[] = [
  { ask: "A customer asked what our hours are — can you reply?", expected: "customer_question" },
  { ask: "A customer is furious we scratched their car. Help me respond.", expected: "complaint_handler" },
  { ask: "Draft a 3-touch follow-up for Sarah who went quiet.", expected: "lead_nurture" },
  { ask: "Follow up with Dana on the $2,400 repaint quote — she hasn't booked.", expected: "quote_follow_up" },
  { ask: "Email blast for $59 spring detail special, keep it short.", expected: "campaign" },
  { ask: "Write a Facebook post about our weekend detailing special.", expected: "social_post" },
  { ask: "Text Maria to confirm her Saturday 10am appointment.", expected: "booking" },
  { ask: "Draft a quote for Mike — parts $620, labor $480.", expected: "quote_generator" },
  { ask: "Ask Maria for a Google review after her detail.", expected: "review_request" },
  { ask: "Run my weekly briefing.", expected: "weekly_briefing" },
];

describe("registry", () => {
  it("holds all 18 agents", () => {
    expect(registry.all()).toHaveLength(18);
  });
  it("excludes the internal agent from routing", () => {
    expect(registry.routable().map((a) => a.agent_id)).not.toContain("lead_triage");
    expect(registry.routable()).toHaveLength(17);
  });
});

describe("heuristic routing — exit criterion (≥8/10)", () => {
  it("routes at least 8 of 10 bucket asks to the right agent", () => {
    let correct = 0;
    const misses: string[] = [];
    for (const { ask, expected } of BUCKET_ASKS) {
      const top = classifyHeuristic(ask).candidates[0];
      if (top?.agentId === expected) correct += 1;
      else misses.push(`"${ask}" → ${top?.agentId ?? "none"} (expected ${expected})`);
    }
    expect(correct, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(8);
  });

  it("each confident top match clears the 0.5 routing floor", () => {
    for (const { ask, expected } of BUCKET_ASKS) {
      const top = classifyHeuristic(ask).candidates[0];
      if (top?.agentId === expected) expect(top.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe("ambiguity + wishlist mechanisms", () => {
  it("surfaces a confident near-tie as ambiguous (top two within 0.1, top >= 0.5)", () => {
    const c = classifyHeuristic("Draft a reply, and book an appointment for them.").candidates;
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[0]!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(c[0]!.confidence - c[1]!.confidence).toBeLessThan(0.1);
    const ids = [c[0]!.agentId, c[1]!.agentId];
    expect(ids).toContain("booking");
    expect(ids).toContain("customer_question");
  });

  it("returns no candidate for an out-of-scope ask (→ wishlist fallback)", () => {
    const c = classifyHeuristic("Help me reorganize my supply closet shelving system.").candidates;
    expect(c[0]?.confidence ?? 0).toBeLessThan(0.5);
  });
});

describe("routing rule — quote_follow_up vs lead_nurture vs quote_generator", () => {
  const top = (ask: string) => classifyHeuristic(ask).candidates[0]?.agentId;

  it("$ amount + 'quote' + follow-up wording → quote_follow_up", () => {
    expect(top("Follow up with Dana on the $2,400 quote she hasn't booked.")).toBe("quote_follow_up");
  });

  it("follow-up with no $ and no 'quote' → lead_nurture", () => {
    expect(top("Follow up with Sarah who went quiet.")).toBe("lead_nurture");
  });

  it("'draft a quote' with prices (no follow-up wording) → quote_generator, not quote_follow_up", () => {
    expect(top("Draft a quote for Mike — parts $620, labor $480.")).toBe("quote_generator");
  });

  it("follow up on a named quote without a $ amount → quote_follow_up (Beat 3)", () => {
    expect(top("Follow up with Sarah Chen on her brake quote.")).toBe("quote_follow_up");
  });
});

describe("orchestrator direct-answer detection (Beat 2)", () => {
  it("recognises widget-activity questions", () => {
    expect(isWidgetQuery("What came in through the widget yesterday?")).toBe(true);
    expect(isWidgetQuery("show me the widget conversations this week")).toBe(true);
  });
  it("does not hijack ordinary asks", () => {
    expect(isWidgetQuery("Draft a quote for Mike")).toBe(false);
    expect(isWidgetQuery("Run my weekly briefing")).toBe(false);
  });
});

