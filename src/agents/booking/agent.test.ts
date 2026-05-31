import { describe, expect, it } from "vitest";
import { booking } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import { findMarkdown } from "../_format.js";

describe("booking", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(booking, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("QA fix — SMS output contains no markdown asterisks", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(booking, ex.owner_ask, fullContext());
      expect(findMarkdown(output.draft!.body)).toEqual([]);
      expect(output.draft!.body).not.toContain("*");
    }
  });

  it("QA fix — single frame: confirm doesn't also ask 'would that work?'", async () => {
    const { output } = await runFromAsk(booking, "Confirm Jake's Saturday 10am appointment.", fullContext());
    expect(output.draft!.body).toMatch(/confirmation/i);
    expect(output.draft!.body).not.toMatch(/would that work/i);
  });

  it("QA fix — never invents scheduling state when no slot is given", async () => {
    const { output } = await runFromAsk(booking, "Book Sam for a detail.", fullContext());
    expect(output.draft!.body).not.toMatch(/fully booked|no availability/i);
    expect(output.draft!.body).toMatch(/what day|availability|work for you/i);
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(booking, "Text Maria about Thursday", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("rule 2 — no [Shop Name]/[Your Name] when those are in the profile", async () => {
    const { output } = await runFromAsk(booking, "Confirm Jake's Saturday 10am appointment.", fullContext());
    expect(output.draft!.body).not.toMatch(/\[Shop Name\]|\[Your Name\]/);
    expect(output.draft!.body).toContain("Maya"); // real signoff name
  });

  it("acknowledges an owner-stated scheduling constraint (B-04)", async () => {
    const { output } = await runFromAsk(
      booking,
      "Offer Mike a tire rotation Thursday at 10:30. Tomorrow is fully booked.",
      fullContext(),
    );
    // The draft references the constraint the owner gave (not invented state).
    expect(output.draft!.body).toMatch(/fully booked/i);
    expect(output.draft!.body).toMatch(/Thursday at 10:30/);
  });
});
