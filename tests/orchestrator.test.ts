/**
 * Orchestrator routing rules (§11).
 */

import { describe, expect, it } from "vitest";
import { createAgentOS } from "../src/index.js";
import { sampleContext } from "../src/context/sampleData.js";
import { UnavailableProvider } from "../src/llm/index.js";

function os() {
  return createAgentOS();
}

describe("orchestrator routing", () => {
  it("routes a customer question to customer_question", () => {
    const { orchestrator } = os();
    const res = orchestrator.handle("Customer asked what our hours are — can you reply?", sampleContext());
    expect(res.chosen).toBe("customer_question");
    expect(res.status).toBe("routed");
  });

  it("rule 6 — complaint language short-circuits to complaint_handler", () => {
    const { orchestrator } = os();
    const res = orchestrator.handle(
      "A customer is furious that we scratched their car. Help me reply.",
      sampleContext(),
    );
    expect(res.chosen).toBe("complaint_handler");
  });

  it("rule 5 — $ amount + quote + follow-up routes to quote_follow_up over lead_nurture", () => {
    const { orchestrator } = os();
    const res = orchestrator.handle(
      "Follow up with Dana on the $2,400 repaint quote — she hasn't booked.",
      sampleContext(),
    );
    expect(res.chosen).toBe("quote_follow_up");
  });

  it("rule 1 — low confidence falls back to generalist and captures a wishlist item", () => {
    const { orchestrator } = os();
    const ctx = sampleContext();
    const res = orchestrator.handle("Help me reorganize my supply closet shelving system", ctx);
    expect(res.status).toBe("fallback_generalist");
    expect(res.chosen).toBe("generalist");
    expect(orchestrator.wishlist.all().length).toBeGreaterThan(0);
  });

  it("rule 7 — bucket awareness lists agents in a bucket", () => {
    const { orchestrator } = os();
    const res = orchestrator.handle("What marketing agents do you have?", sampleContext());
    expect(res.status).toBe("bucket_listing");
    const joined = res.messages.join("\n");
    expect(joined).toMatch(/Campaign/);
    expect(joined).toMatch(/Social Post/);
  });

  it("always surfaces the routing decision to the owner (rule 3 — visibility)", () => {
    const { orchestrator } = os();
    const res = orchestrator.handle("Run my weekly briefing.", sampleContext());
    expect(res.messages.some((m) => /routing this to/i.test(m))).toBe(true);
  });

  it("never routes owner asks to the internal lead_triage agent", () => {
    const { orchestrator } = os();
    const res = orchestrator.handle("triage classify this new widget lead", sampleContext());
    expect(res.chosen).not.toBe("lead_triage");
  });

  it("generalist with an unavailable LLM produces no draft and an honest notice", () => {
    const { orchestrator } = createAgentOS({ llm: new UnavailableProvider() });
    const res = orchestrator.handle("Write me a list of ideas to grow", sampleContext());
    expect(res.result?.draft).toBeUndefined();
    expect(res.messages.join("\n")).toMatch(/temporarily unavailable/i);
  });
});
