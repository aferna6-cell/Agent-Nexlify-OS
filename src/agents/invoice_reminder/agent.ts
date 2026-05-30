import { defineStub } from "../_stub.js";

export const invoiceReminder = defineStub({
  agent_id: "invoice_reminder",
  display_name: "Invoice Reminder",
  bucket: "finance",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts a polite first-touch reminder for an unpaid invoice.",
  channel: "email",
  routes_here_when: ["Owner asks to follow up on an unpaid invoice (typically 1–14 days overdue)"],
  keywords: ["invoice", "unpaid", "overdue", "bill", "outstanding", "balance due", "reminder"],
  strong_signals: ["invoice reminder", "remind about the invoice", "unpaid invoice"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    require_owner_approval: true,
    never_auto_send: true,
    send_caps: { notes: ["1 reminder per invoice per 7 days (hardcoded)"] },
  },
  triggers_supported: ["manual"],
  output_format: { title_template: "Invoice reminder — {customer}, ${amount}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Send Mike a reminder for invoice #1042 — $1,100, 8 days overdue.", expected_route: "invoice_reminder", expected_output_excerpt: "#1042" },
    { owner_ask: "Remind Dana about her unpaid $450 invoice.", expected_route: "invoice_reminder", expected_output_excerpt: "$450" },
    { owner_ask: "Friendly nudge on the outstanding $200 balance for Sam.", expected_route: "invoice_reminder", expected_output_excerpt: "reminder" },
  ],
});
