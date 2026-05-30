import { describe, expect, it } from "vitest";
import { quoteGenerator } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";

describe("quote_generator", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(quoteGenerator, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("totals line items correctly ($620 + $480 = $1,100) and itemizes", async () => {
    const { output } = await runFromAsk(quoteGenerator, "Draft a quote for Mike — parts $620, labor $480, net 15.", fullContext());
    expect(output.draft!.title).toMatch(/\$1,100/);
    expect(output.draft!.body).toMatch(/Total: \$1,100/);
    expect(output.draft!.body).toMatch(/\| Item \| Qty \| Unit \| Line total \|/);
    const quote = output.draft!.metadata?.quote_data as { total: number; line_items: unknown[] };
    expect(quote.total).toBe(1100);
    expect(quote.line_items).toHaveLength(2);
  });

  it("uses real business contact info, no placeholders", async () => {
    const { output } = await runFromAsk(quoteGenerator, "Draft a quote for Mike — parts $620, labor $480.", fullContext());
    expect(output.draft!.body).toContain("Sunset Mobile Detailing");
    expect(output.draft!.body).not.toMatch(/\[Shop Name\]|\[Phone\]/);
  });

  it("produces no draft when there are no line items", async () => {
    const { output } = await runFromAsk(quoteGenerator, "Draft a quote for Mike for a brake job.", fullContext());
    expect(output.draft).toBeUndefined();
    expect(output.noDraftReason).toMatch(/line items/i);
  });

  it("never_auto_send is hardcoded (a quote commits to a price)", () => {
    expect(quoteGenerator.permission_scope.never_auto_send).toBe(true);
  });
});
