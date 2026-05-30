import { describe, expect, it } from "vitest";
import { complaintHandler } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import { findMarkdown } from "../_format.js";
import { detectComplaint } from "../_orchestrator.js";

describe("complaint_handler", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(complaintHandler, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("hardcodes require_owner_approval + never_auto_send and always flags red", async () => {
    expect(complaintHandler.permission_scope.never_auto_send).toBe(true);
    expect(complaintHandler.permission_scope.require_owner_approval).toBe(true);
    const { output } = await runFromAsk(complaintHandler, "Customer is furious about a scratch.", fullContext());
    expect(output.draft!.requiresApproval).toBe(true);
    expect(output.draft!.title).toMatch(/flagged red/i);
    expect(output.orchestratorNotes.join("\n")).toMatch(/flag/i);
  });

  it("rule 3 — widget reply is plain text", async () => {
    const { output } = await runFromAsk(complaintHandler, "Angry customer, rushed detail.", fullContext());
    expect(findMarkdown(output.draft!.body)).toEqual([]);
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(complaintHandler, "furious customer", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("orchestrator complaint detection short-circuits Customer Question", () => {
    expect(detectComplaint("I'm furious, my car came back scratched")).toBe(true);
    expect(detectComplaint("they want a refund")).toBe(true);
    expect(detectComplaint("What are your hours?")).toBe(false);
  });
});
