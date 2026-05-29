import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, money, num, optStr, result } from "../base.js";

/**
 * Invoice Reminder (invoice_reminder) — finance · new · P2.
 *
 * Drafts a polite first-touch reminder for an unpaid invoice — assumes the
 * customer forgot, not that they're avoiding payment. No threatening language.
 * Always requires owner approval; hardcoded cap of 1 reminder per invoice / 7d.
 */
export const invoiceReminder: AgentDefinition = {
  agent_id: "invoice_reminder",
  display_name: "Invoice Reminder",
  bucket: "finance",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts a polite first-touch reminder for an unpaid invoice.",
  routing: {
    routes_here_when: ["Owner asks to follow up on an unpaid invoice (typically 1–14 days overdue)"],
    keywords: ["invoice", "unpaid", "overdue", "reminder", "bill", "outstanding", "balance due"],
    strong_signals: ["invoice reminder", "remind about the invoice", "unpaid invoice"],
  },
  channel: "email",
  alternate_channels: ["sms"],
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      { name: "invoice_amount", type: "number", required: true, description: "Invoice amount." },
      { name: "invoice_date", type: "date", required: false, description: "Invoice date." },
      { name: "invoice_number", type: "string", required: false, description: "Invoice number." },
      { name: "days_overdue", type: "number", required: false, description: "Days overdue." },
      {
        name: "payment_method_options",
        type: "string",
        required: false,
        description: "Accepted payment methods.",
      },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    never_auto_send: true,
    configurable_phase_4: {
      require_owner_approval: true,
      send_caps: { notes: ["1 reminder per invoice per 7 days (hardcoded)"] },
    },
  },
  triggers_supported: { manual: true },
  outputs: {
    title_format: "Invoice reminder — {customer_name}, ${amount}",
    body_format: "Friendly, brief; mentions date + amount; offers payment options. No threats.",
    metadata: ["amount", "days_overdue", "channel"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Compose reminder", kind: "work", description: "Write a friendly first-touch reminder." },
  ],
  example_interactions: [
    {
      owner_ask: "Send Mike Johnson a reminder for invoice #1042 — $1,100, 8 days overdue.",
      expected_route: "invoice_reminder",
      expected_output_excerpt: "#1042",
    },
    {
      owner_ask: "Remind Dana about her unpaid $450 invoice.",
      expected_route: "invoice_reminder",
      expected_output_excerpt: "$450",
    },
    {
      owner_ask: "Friendly nudge on the outstanding $200 balance for Sam.",
      expected_route: "invoice_reminder",
      expected_output_excerpt: "reminder",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const amount = num(input, "invoice_amount", 0);
    const invoiceNumber = optStr(input, "invoice_number");
    const invoiceDate = optStr(input, "invoice_date");
    const methods = optStr(input, "payment_method_options") ?? s.field("payment_link");

    s.trace.work("Compose reminder", `amount=${money(amount)}, first-touch friendly tone`);

    const signoff = s.signoff();
    const businessName = s.field("business_name");
    const name = customerName ?? "there";
    const invoiceRef = invoiceNumber ? `invoice ${invoiceNumber}` : "your invoice";
    const dateClause = invoiceDate ? ` from ${invoiceDate}` : "";

    let body =
      `Hi ${name}, hope you're doing well! Just a friendly reminder about ${invoiceRef}${dateClause} (${money(amount)}). ` +
      `If it's already on its way, please ignore this`;
    body += methods ? ` — otherwise you can pay via ${methods}. ` : " — otherwise just let me know if you have any questions. ";
    body += "Thanks so much!";
    if (signoff) body += ` — ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}`;

    if (!methods) {
      s.note("I don't have a payment link or accepted methods on file, so I kept the ask open-ended. Add a payment link to your profile and I'll include it next time.");
    }

    const draft = finishDraft({
      title: `Invoice reminder — ${customerName ?? "customer"}, ${money(amount)}`,
      body,
      channel: "email",
      metadata: { amount, days_overdue: num(input, "days_overdue", 0), channel: "email" },
      requiresApproval: true,
    });
    return result(invoiceReminder, s, draft);
  },
};
