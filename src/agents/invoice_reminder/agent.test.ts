import { describe, expect, it } from "vitest";
import { invoiceReminder } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("invoice_reminder", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(invoiceReminder, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("first-touch tone — friendly, no threats", async () => {
    const { output } = await runFromAsk(invoiceReminder, "Remind Mike about invoice #1042 — $1,100.", fullContext());
    expect(output.draft!.body).toMatch(/friendly reminder/i);
    expect(output.draft!.body).not.toMatch(/legal|collections|final notice|or else/i);
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(invoiceReminder, "Remind about a $200 invoice", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("never_auto_send is hardcoded for this finance agent", () => {
    expect(invoiceReminder.permission_scope.never_auto_send).toBe(true);
  });
});
