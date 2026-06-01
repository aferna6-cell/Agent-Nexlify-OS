import { describe, expect, it } from "vitest";
import { classifyHeuristic } from "./_classifier.js";
import { registry } from "./_registry.js";
import { isWidgetQuery, isAggregateBriefingQuery, isNonBusiness } from "./_orchestrator.js";
import { sales, customerService } from "./departments.js";
import { pickSkill } from "./_department.js";

/** One representative ask per department (the v2 routing exit-criterion set). */
const DEPT_ASKS: { ask: string; expected: string }[] = [
  { ask: "A customer asked what our hours are — can you reply?", expected: "customer_service" },
  { ask: "A customer is furious we scratched their car. Help me respond.", expected: "customer_service" },
  { ask: "Draft a 3-touch follow-up for Sarah who went quiet.", expected: "sales" },
  { ask: "Follow up with Dana on the $2,400 repaint quote — she hasn't booked.", expected: "sales" },
  { ask: "Email blast for $59 spring detail special, keep it short.", expected: "marketing" },
  { ask: "Write a Facebook post about our weekend detailing special.", expected: "marketing" },
  { ask: "Text Maria to confirm her Saturday 10am appointment.", expected: "operations" },
  { ask: "Draft a quote for Mike — parts $620, labor $480.", expected: "sales" },
  { ask: "Ask Maria for a Google review after her detail.", expected: "marketing" },
  { ask: "Send Mike a reminder about his overdue invoice, $1,100.", expected: "invoicing" },
];

describe("registry (v2 — 8 department heads)", () => {
  it("registers 8 owner-routable departments + the internal lead_triage", () => {
    expect(registry.routable()).toHaveLength(8);
    expect(registry.all()).toHaveLength(9);
  });
  it("excludes lead_triage from routing and has no generalist", () => {
    const routable = registry.routable().map((a) => a.agent_id).sort();
    expect(routable).not.toContain("lead_triage");
    expect(routable).not.toContain("generalist");
    expect(routable).toEqual(
      ["accounting", "admin_records", "customer_service", "invoicing", "marketing", "operations", "people", "sales"],
    );
  });
});

describe("heuristic routing to departments — exit criterion (≥8/10)", () => {
  it("routes at least 8 of 10 asks to the right department", () => {
    let correct = 0;
    const misses: string[] = [];
    for (const { ask, expected } of DEPT_ASKS) {
      const top = classifyHeuristic(ask).candidates[0];
      if (top?.agentId === expected) correct += 1;
      else misses.push(`"${ask}" → ${top?.agentId ?? "none"} (expected ${expected})`);
    }
    expect(correct, `misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(8);
  });
});

describe("intra-department skill dispatch (Sales)", () => {
  const pick = (ask: string) => pickSkill(sales.__department, ask).agent.agent_id;
  it("$ amount + 'quote' + follow-up wording → quote_follow_up skill", () => {
    expect(pick("Follow up with Dana on the $2,400 quote she hasn't booked.")).toBe("quote_follow_up");
  });
  it("'draft a quote' with prices → quote_generator skill", () => {
    expect(pick("Draft a quote for Mike — parts $620, labor $480.")).toBe("quote_generator");
  });
  it("follow-up with no $ and no 'quote' → lead_nurture skill", () => {
    expect(pick("Re-engage Sarah who went quiet, no quote involved.")).toBe("lead_nurture");
  });
});

describe("intra-department skill dispatch (Customer Service)", () => {
  const pick = (ask: string) => pickSkill(customerService.__department, ask).agent.agent_id;
  it("an angry/refund message → complaint skill", () => {
    expect(pick("Robert is angry and wants a refund.")).toBe("complaint_handler");
  });
  it("a plain question → customer_question skill", () => {
    expect(pick("A customer asked if we service hybrids, please reply.")).toBe("customer_question");
  });
});

describe("orchestrator direct-answer + decline detection", () => {
  it("recognises widget-activity questions", () => {
    expect(isWidgetQuery("What came in through the widget yesterday?")).toBe(true);
    expect(isWidgetQuery("Draft a quote for Mike")).toBe(false);
  });
  it("recognises the cross-department weekly briefing (but not a department-specific one)", () => {
    expect(isAggregateBriefingQuery("Show me my weekly briefing.")).toBe(true);
    expect(isAggregateBriefingQuery("Show me the Sales briefing.")).toBe(false);
  });
  it("declines clearly personal asks", () => {
    expect(isNonBusiness("Write a thank-you note to my mom.")).toBe(true);
    expect(isNonBusiness("Draft a quote for Mike.")).toBe(false);
  });
});
