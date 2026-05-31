import { z } from "zod";
import { defineAgent, type AgentChannel } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody, money, parseMoney } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const MoneyRequired = z.preprocess(parseMoney, z.number());

export interface LineItem {
  description: string;
  price: number;
  quantity: number;
}
export interface QuoteData {
  line_items: LineItem[];
  total: number;
  terms?: string;
  validity_days: number;
}

const Input = z.object({
  customer_name: z.string().optional(),
  service_items: z
    .array(z.object({ description: z.string(), price: MoneyRequired, quantity: z.coerce.number().optional() }))
    .optional(),
  terms: z.string().optional(),
  validity_days: z.coerce.number().optional(),
  notes: z.string().optional(),
});

/** Parse "<label> $<amount>" pairs from a natural-language ask. */
function parseLineItems(ask: string): LineItem[] {
  const items: LineItem[] = [];
  const re = /([A-Za-z][A-Za-z \-/]{1,40}?)\s*\$\s?(\d[\d,]*(?:\.\d{2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ask)) !== null) {
    const description = m[1]!.replace(/\b(for|terms|net|the|a|an|of|on|his|her|their|and|with|quote|estimate|monthly)\b/gi, "").trim();
    const price = Number(m[2]!.replace(/,/g, ""));
    if (description.length > 1 && price > 0) {
      items.push({ description: description[0]!.toUpperCase() + description.slice(1), price, quantity: 1 });
    }
  }
  return items;
}

function parseTerms(ask: string): string | undefined {
  const m = ask.match(/\b(net\s*\d+|\d+%\s*deposit|due on receipt)\b/i);
  return m ? m[0] : undefined;
}

function buildQuote(items: LineItem[], terms: string | undefined, validityDays: number): QuoteData {
  const total = items.reduce((s, it) => s + it.price * (it.quantity ?? 1), 0);
  return { line_items: items, total, terms, validity_days: validityDays };
}

function renderQuote(quote: QuoteData, channel: AgentChannel, customerName: string | undefined, header: string, signoff: string | undefined, businessName: string | undefined, notes: string | undefined): string {
  const rows = quote.line_items
    .map((it) => `| ${it.description} | ${it.quantity} | ${money(it.price)} | ${money(it.price * it.quantity)} |`)
    .join("\n");
  return (
    (header ? `${header}\n\n` : "") +
    `## Quote${customerName ? ` for ${customerName}` : ""}\n\n` +
    `| Item | Qty | Unit | Line total |\n| --- | --- | --- | --- |\n${rows}\n\n` +
    `**Total: ${money(quote.total)}**\n\n` +
    (quote.terms ? `**Terms:** ${quote.terms}\n\n` : "") +
    `**Valid for ${quote.validity_days} days** from the date of this quote.\n\n` +
    (notes ? `${notes}\n\n` : "") +
    (signoff ? `Thank you,\n${signoff}${businessName && signoff !== businessName ? `\n${businessName}` : ""}` : "")
  );
}

export const quoteGenerator = defineAgent(
  {
    agent_id: "quote_generator",
    display_name: "Quote Generator",
    bucket: "finance",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts an itemized quote/estimate for a service the owner is proposing.",
    channel: "email",
    routes_here_when: ["Owner asks to draft a quote / estimate / proposal for a customer"],
    keywords: ["quote", "estimate", "proposal", "line items", "parts", "labor", "write up"],
    strong_signals: ["draft a quote", "write up an estimate", "make a proposal"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "Quote — {customer}, ${total}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const items: LineItem[] = (params.service_items ?? parseLineItems(ownerAsk)).map((it) => ({
      description: it.description,
      price: it.price,
      quantity: it.quantity ?? 1,
    }));
    const validityDays = params.validity_days ?? 30;
    const terms = params.terms?.trim() || parseTerms(ownerAsk);
    const notes = params.notes?.trim();

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });
    const hasItems = await emitTrace.emit("load_line_items", {
      description: `${items.length} line item(s) to quote`,
      data: items,
    });

    if (!hasItems) {
      a.note("I couldn't find any line items (descriptions + prices) in your request, so I can't itemize a quote yet. Give me the items and prices (e.g. 'parts $620, labor $480') and I'll build it.");
      return { orchestratorNotes: a.notes, noDraftReason: "no line items provided" };
    }

    const quote = buildQuote(items, terms, validityDays);
    const businessName = a.field("businessName");
    const phone = a.field("phone");
    const email = a.field("email");
    const website = a.field("website");
    const signoff = a.signoff();
    const header = [businessName ?? null, phone ? `Phone: ${phone}` : null, email ?? null, website ?? null].filter(Boolean).join("\n");

    const local = (): string => renderQuote(quote, "email", customerName, header, signoff, businessName, notes);

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft an itemized quote on the EMAIL channel (markdown allowed). Use the EXACT line items, quantities, ` +
      `and prices provided — do not change numbers. Show a header with the business + customer, an itemized table, ` +
      `the total (${money(quote.total)}), terms${terms ? ` (${terms})` : ""}, and a ${validityDays}-day validity. ` +
      `Use the real business name and contact info; never emit bracketed placeholders.` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt =
      `Customer: ${customerName ?? "(unknown)"}.\nLine items:\n` +
      quote.line_items.map((it) => `- ${it.description} x${it.quantity} @ ${money(it.price)}`).join("\n") +
      `\nTotal: ${money(quote.total)}. Terms: ${terms ?? "(none)"}. Validity: ${validityDays} days.`;

    await emitTrace.work("compose_quote", `total=${money(quote.total)}, ${items.length} item(s), validity=${validityDays}d`);
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Quote — ${customerName ?? "customer"}, ${money(quote.total)}`,
        body: finishBody("email", generated.text),
        channel: "email",
        metadata: { quote_data: quote, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
