import { describe, expect, it } from "vitest";
import { financialSummary } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import type { InvoiceData } from "../../types/agent.js";

describe("financial_summary", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    const invoices: InvoiceData[] = [
      { id: "i1", customerName: "Mike Johnson", number: "INV-1001", amount: 1100, issuedAt: "2026-05-01", dueAt: "2026-05-15", status: "overdue" },
    ];
    for (const ex of examples) {
      const { output } = await runFromAsk(financialSummary, ex.owner_ask, fullContext({ invoices }));
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("rule 1 — no false-success profile load on an empty context", async () => {
    const { steps } = await runFromAsk(financialSummary, "Give me a financial summary", emptyContext());
    expect(steps.find((s) => s.step === "load_business_profile")?.status).toBe("skipped_no_data");
  });

  it("references invoice totals from context and never invents numbers", async () => {
    const invoices: InvoiceData[] = [
      { id: "i1", customerName: "Mike Johnson", number: "INV-1001", amount: 1100, issuedAt: "2026-05-01", dueAt: "2026-05-15", status: "overdue" },
    ];
    const { output } = await runFromAsk(financialSummary, "Summarize our outstanding receivables", fullContext({ invoices }));
    expect(output.draft!.body).toContain("invoice");
    expect(output.draft!.body).toContain("$1,100");
  });
});
