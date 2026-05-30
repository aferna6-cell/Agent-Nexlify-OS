import { defineStub } from "../_stub.js";

export const paymentFollowUp = defineStub({
  agent_id: "payment_follow_up",
  display_name: "Payment Follow-up",
  bucket: "finance",
  status: "new",
  build_priority: "P3",
  purpose: "Drafts an escalating (but professional) payment-chase sequence for overdue invoices.",
  channel: "sequence",
  routes_here_when: [
    "Owner asks for an escalation sequence on an overdue invoice",
    "(Phase 4) Trigger: invoice 14+ days overdue with no response",
  ],
  keywords: ["payment", "escalate", "escalation", "final notice", "past due", "collections", "still unpaid"],
  strong_signals: ["escalation sequence", "final notice", "chase the payment", "past due"],
  shared_context_needed: ["business_profile", "pipeline_state"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["invoice_overdue_no_response"] },
  output_format: { title_template: "Payment follow-up — {customer}, ${amount}, level {level}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Escalate the overdue $1,100 invoice for Mike — second notice.", expected_route: "payment_follow_up", expected_output_excerpt: "$1,100" },
    { owner_ask: "Final notice for Dana's $450 invoice, 30 days past due.", expected_route: "payment_follow_up", expected_output_excerpt: "final" },
    { owner_ask: "Firm payment reminder for Sam's still-unpaid $200 balance.", expected_route: "payment_follow_up", expected_output_excerpt: "payment" },
  ],
});
