import { describe, expect, it } from "vitest";
import { customerQuestion } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runAgent } from "../_testkit.js";
import { findMarkdown } from "../_format.js";

describe("customer_question", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runAgent(customerQuestion, { customer_question: ex.owner_ask }, fullContext(), ex.owner_ask);
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("QA fix — empty KB yields a safe holding reply, never internal back-channel text", async () => {
    const { output } = await runAgent(customerQuestion, { customer_question: "Do you handle hybrids?" }, fullContext());
    const body = output.draft!.body;
    expect(body).toContain("Sunset Mobile Detailing"); // real business name
    expect(body).not.toMatch(/knowledge base|business profile|could you (please )?share/i);
    // The gap is surfaced to the orchestrator, not the customer.
    expect(output.orchestratorNotes.join("\n")).toMatch(/knowledge base/i);
  });

  it("rule 1 — no false-success load on an empty context", async () => {
    const { steps } = await runAgent(customerQuestion, { customer_question: "hi" }, emptyContext());
    const profileLoad = steps.find((s) => s.step === "load_business_profile");
    expect(profileLoad?.status).toBe("skipped_no_data");
    expect(steps.find((s) => s.step === "knowledge_base")?.status).toBe("skipped_no_data");
  });

  it("rule 2 — no [Shop Name]/[Your Name] when those are in the profile", async () => {
    const { output } = await runAgent(customerQuestion, { customer_question: "What are your hours?" }, fullContext());
    expect(output.draft!.body).not.toMatch(/\[Shop Name\]|\[Your Name\]/);
  });

  it("rule 3 — widget reply (plain text) contains no markdown asterisks", async () => {
    const { output } = await runAgent(customerQuestion, { customer_question: "Do you take walk-ins?" }, fullContext());
    expect(findMarkdown(output.draft!.body)).toEqual([]);
    expect(output.draft!.body).not.toContain("*");
  });
});
