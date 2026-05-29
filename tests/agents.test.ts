/**
 * Behavioural tests for specific agents — the QA-report fixes and key outputs.
 */

import { describe, expect, it } from "vitest";
import { createRegistry, createAgentOS } from "../src/index.js";
import { sampleContext, quietContext, SUNSET_PROFILE } from "../src/context/sampleData.js";
import { emptyContext } from "../src/context/sharedContext.js";
import { DeterministicProvider } from "../src/llm/index.js";

const deps = { llm: new DeterministicProvider() };

describe("customer_question — KB-empty fix", () => {
  it("produces a safe holding reply and never an internal back-channel ask in the draft", () => {
    const registry = createRegistry();
    const ctx = quietContext(); // profile present, KB empty
    const res = registry.run(
      "customer_question",
      { params: { customer_question: "Do you handle hybrids?" }, ownerAsk: "x" },
      ctx,
      deps,
    );
    const body = res.draft!.body;
    expect(body).toMatch(/Sunset Mobile Detailing/); // real business name
    expect(body).not.toMatch(/knowledge base|business profile|could you (please )?share/i);
    // The gap is surfaced to the orchestrator, not the customer.
    expect(res.orchestratorNotes.join("\n")).toMatch(/knowledge base/i);
  });

  it("answers directly when the KB has the info", () => {
    const registry = createRegistry();
    const res = registry.run(
      "customer_question",
      { params: { customer_question: "What are your hours?" }, ownerAsk: "x" },
      sampleContext(),
      deps,
    );
    expect(res.draft!.body).toMatch(/8am–6pm|Mon–Sat/);
  });
});

describe("booking — QA fixes", () => {
  it("does not fabricate scheduling state when no slot is given", () => {
    const registry = createRegistry();
    const res = registry.run(
      "booking",
      { params: { customer_name: "Sam", mode: "propose" }, ownerAsk: "book Sam" },
      sampleContext(),
      deps,
    );
    expect(res.draft!.body).not.toMatch(/fully booked|no availability/i);
    expect(res.draft!.body).toMatch(/what day|availability|work for you/i);
  });

  it("uses a single frame — confirm OR propose, not both", () => {
    const registry = createRegistry();
    const confirm = registry.run(
      "booking",
      { params: { customer_name: "Jake", offered_slot: "Saturday 10am", mode: "confirm" }, ownerAsk: "x" },
      sampleContext(),
      deps,
    ).draft!.body;
    expect(confirm).toMatch(/confirmation/i);
    expect(confirm).not.toMatch(/would that work/i);
  });

  it("SMS output is plain text", () => {
    const registry = createRegistry();
    const body = registry.run(
      "booking",
      { params: { customer_name: "Jake", offered_slot: "Saturday 10am" }, ownerAsk: "x" },
      sampleContext(),
      deps,
    ).draft!.body;
    expect(body).not.toMatch(/[*#`]/);
  });
});

describe("quote_generator", () => {
  it("totals line items correctly ($620 + $480 = $1,100)", () => {
    const registry = createRegistry();
    const res = registry.run(
      "quote_generator",
      {
        params: {
          customer_name: "Mike Johnson",
          service_items: [
            { description: "Parts", price: 620, quantity: 1 },
            { description: "Labor", price: 480, quantity: 1 },
          ],
        },
        ownerAsk: "x",
      },
      sampleContext(),
      deps,
    );
    expect(res.draft!.title).toMatch(/\$1,100/);
    expect(res.draft!.body).toMatch(/Total: \$1,100/);
  });
});

describe("lead_nurture — relative dates + consistency", () => {
  it("uses relative date framing, not Day 1/Day 5", () => {
    const registry = createRegistry();
    const body = registry.run(
      "lead_nurture",
      { params: { customer_name: "Sarah", subject: "consultation", touch_count: 3 }, ownerAsk: "x" },
      sampleContext(),
      deps,
    ).draft!.body;
    expect(body).toMatch(/Touch 1 — Today/);
    expect(body).toMatch(/\+5 days/);
    expect(body).not.toMatch(/Day 1|Day 5/);
  });
});

describe("weekly_briefing — omit empty sections", () => {
  it("omits sections with no data rather than printing 'none'", () => {
    const registry = createRegistry();
    const body = registry.run(
      "weekly_briefing",
      { params: {}, ownerAsk: "weekly briefing" },
      quietContext(),
      deps,
    ).draft!.body;
    expect(body).not.toMatch(/Conversations:?\s*none/i);
    expect(body).toMatch(/Quiet week/i);
  });

  it("includes only the non-empty sections when there is activity", () => {
    const registry = createRegistry();
    const res = registry.run("weekly_briefing", { params: {}, ownerAsk: "x" }, sampleContext(), deps);
    expect(res.draft!.body).toMatch(/## Conversations/);
    expect(res.draft!.metadata.sections_included).toBeTruthy();
  });
});

describe("appointment_reminder — honest empty handling", () => {
  it("produces no draft when there are no appointments", () => {
    const registry = createRegistry();
    const res = registry.run(
      "appointment_reminder",
      { params: {}, ownerAsk: "remind tomorrow" },
      emptyContext(SUNSET_PROFILE),
      deps,
    );
    expect(res.draft).toBeUndefined();
    expect(res.noDraftReason).toMatch(/no upcoming appointments/i);
  });
});

describe("review_request — no fabricated link", () => {
  it("includes a real configured Google link", () => {
    const registry = createRegistry();
    const body = registry.run(
      "review_request",
      { params: { customer_name: "Maria", platform_preference: "Google" }, ownerAsk: "x" },
      sampleContext(),
      deps,
    ).draft!.body;
    expect(body).toMatch(/g\.page/);
  });

  it("does not fabricate a Yelp link that isn't configured", () => {
    const registry = createRegistry();
    const res = registry.run(
      "review_request",
      { params: { customer_name: "Maria", platform_preference: "Yelp" }, ownerAsk: "x" },
      sampleContext(),
      deps,
    );
    expect(res.draft!.body).not.toMatch(/http/);
    expect(res.orchestratorNotes.join("\n")).toMatch(/yelp review link/i);
  });
});

describe("complaint_handler — always flags + never auto-send", () => {
  it("raises a red flag and requires approval", () => {
    const registry = createRegistry();
    const res = registry.run(
      "complaint_handler",
      { params: { complaint_text: "My car came back scratched" }, ownerAsk: "x" },
      sampleContext(),
      deps,
    );
    expect(res.draft!.requiresApproval).toBe(true);
    expect(res.orchestratorNotes.join("\n")).toMatch(/flag/i);
    expect(registry.get("complaint_handler").permission_scope.never_auto_send).toBe(true);
  });
});

describe("seo_recommendations — honest scope", () => {
  it("states what is NOT checked yet", () => {
    const registry = createRegistry();
    const body = registry.run(
      "seo_recommendations",
      { params: {}, ownerAsk: "seo audit" },
      sampleContext(),
      deps,
    ).draft!.body;
    expect(body).toMatch(/Not checked yet/i);
    expect(body).toMatch(/Backlink/i);
  });
});

describe("example interactions route correctly through the orchestrator", () => {
  const { orchestrator } = createAgentOS();
  const registry = createRegistry();
  for (const def of registry.all()) {
    if (def.channel === "internal") continue;
    // The first example is the canonical one for each agent.
    const ex = def.example_interactions[0]!;
    it(`${def.agent_id}: "${ex.owner_ask.slice(0, 40)}…"`, () => {
      const res = orchestrator.handle(ex.owner_ask, sampleContext());
      // Either it routed to the expected agent, or (acceptably) asked to clarify
      // between it and a close sibling.
      const ok =
        res.chosen === def.agent_id ||
        (res.status === "needs_clarification" &&
          res.clarifyBetween?.includes(def.agent_id));
      expect(ok, `routed to ${res.chosen ?? res.status}`).toBe(true);
    });
  }
});
