import type { AgentDefinition } from "../../types.js";
import { AgentScratch, arr, finishDraft, money, num, optStr, result, str } from "../base.js";

interface ServiceItem {
  description: string;
  price: number;
  quantity?: number;
}

/**
 * Quote Generator (quote_generator) — finance · new · P2.
 *
 * Drafts a quote document/email: line items, prices, terms, validity. Uses the
 * real business name + contact info in the header/signoff (never [Shop Name]).
 * Always requires owner approval — a quote commits to a price.
 */
export const quoteGenerator: AgentDefinition = {
  agent_id: "quote_generator",
  display_name: "Quote Generator",
  bucket: "finance",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts an itemized quote/estimate for a service the owner is proposing.",
  routing: {
    routes_here_when: ["Owner asks to draft a quote / estimate / proposal for a customer"],
    keywords: ["quote", "estimate", "proposal", "draft a quote", "line items", "parts", "labor"],
    strong_signals: ["draft a quote", "write up an estimate", "make a proposal"],
  },
  channel: "email",
  alternate_channels: ["report"],
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      {
        name: "service_items",
        type: "array",
        required: true,
        description: "Array of {description, price, quantity}.",
      },
      { name: "terms", type: "string", required: false, description: "e.g. 'net 15, 50% deposit'." },
      { name: "validity_days", type: "number", required: false, description: "Validity window.", default: 30 },
      { name: "notes", type: "string", required: false, description: "Extra notes." },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    never_auto_send: true,
    configurable_phase_4: { require_owner_approval: true },
  },
  triggers_supported: { manual: true },
  outputs: {
    title_format: "Quote — {customer_name}, ${total}",
    body_format: "Header (business + customer), itemized table, total, terms, validity, signoff.",
    metadata: ["total", "validity_days", "item_count"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile for header + contact." },
    { name: "Line items", kind: "load", description: "Read the service items to quote." },
    { name: "Compose quote", kind: "work", description: "Build the itemized quote." },
  ],
  example_interactions: [
    {
      owner_ask:
        "Draft a quote for Mike Johnson — full brake job (pads + rotors) on his 2019 F-150, parts $620, labor $480, terms net 15.",
      expected_route: "quote_generator",
      expected_output_excerpt: "$1,100",
    },
    {
      owner_ask: "Write up an estimate for Dana: ceramic coating $1,200, paint correction $600.",
      expected_route: "quote_generator",
      expected_output_excerpt: "Total",
    },
    {
      owner_ask: "Make a proposal for a monthly detailing plan at $150/month.",
      expected_route: "quote_generator",
      expected_output_excerpt: "Quote",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const items = normalizeItems(arr(input, "service_items"));
    const validityDays = num(input, "validity_days", 30);
    const terms = optStr(input, "terms");
    const notes = optStr(input, "notes");

    s.trace.load(
      "Line items",
      items,
      (d) => `${(d as unknown[]).length} item(s) to quote`,
      "no line items provided — cannot itemize",
    );

    const total = items.reduce((sum, it) => sum + it.price * (it.quantity ?? 1), 0);
    s.trace.work("Compose quote", `total=${money(total)}, validity=${validityDays}d`);

    const businessName = s.field("business_name");
    const phone = s.field("phone");
    const email = s.field("email");
    const website = s.field("website");
    const signoff = s.signoff();

    const headerLines = [businessName ?? null, phone ? `Phone: ${phone}` : null, email ?? null, website ?? null]
      .filter(Boolean)
      .join("\n");

    const itemRows = items
      .map((it) => {
        const qty = it.quantity ?? 1;
        const line = it.price * qty;
        return `| ${it.description} | ${qty} | ${money(it.price)} | ${money(line)} |`;
      })
      .join("\n");

    const body =
      (headerLines ? `${headerLines}\n\n` : "") +
      `## Quote${customerName ? ` for ${customerName}` : ""}\n\n` +
      `| Item | Qty | Unit | Line total |\n| --- | --- | --- | --- |\n${itemRows}\n\n` +
      `**Total: ${money(total)}**\n\n` +
      (terms ? `**Terms:** ${terms}\n\n` : "") +
      `**Valid for ${validityDays} days** from the date of this quote.\n\n` +
      (notes ? `${notes}\n\n` : "") +
      (signoff ? `Thank you,\n${signoff}${businessName && signoff !== businessName ? `\n${businessName}` : ""}` : "");

    const draft = finishDraft({
      title: `Quote — ${customerName ?? "customer"}, ${money(total)}`,
      body,
      channel: "email",
      metadata: { total, validity_days: validityDays, item_count: items.length },
      requiresApproval: true,
    });
    return result(quoteGenerator, s, draft);
  },
};

function normalizeItems(raw: unknown[]): ServiceItem[] {
  const items: ServiceItem[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description : "Service";
    const price = typeof o.price === "number" ? o.price : Number(o.price) || 0;
    const quantity = typeof o.quantity === "number" ? o.quantity : 1;
    items.push({ description, price, quantity });
  }
  return items;
}
