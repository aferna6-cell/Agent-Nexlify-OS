import { defineStub } from "../_stub.js";

export const complaintHandler = defineStub({
  agent_id: "complaint_handler",
  display_name: "Complaint Handler",
  bucket: "customer_service",
  status: "new",
  build_priority: "P3",
  purpose: "Drafts an empathetic complaint response and flags it for the owner; treats complaints as higher-stakes.",
  channel: "widget_reply",
  routes_here_when: [
    "Owner asks for help responding to a complaint",
    "(Phase 4) Lead Triage classifies a widget message as complaint intent",
  ],
  keywords: ["complaint", "complained", "upset", "angry", "unhappy", "refund", "terrible", "disappointed", "ruined", "furious", "scratch"],
  strong_signals: ["respond to a complaint", "angry customer", "wants a refund"],
  shared_context_needed: ["business_profile", "pipeline_state"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["widget_conversation_complaint"] },
  output_format: { title_template: "Complaint reply — {customer}, {topic}", body_constraints: { no_markdown: true } },
  examples: [
    { owner_ask: "A customer is furious we scratched their car. Help me respond.", expected_route: "complaint_handler", expected_output_excerpt: "sorry" },
    { owner_ask: "Angry customer says the detail was rushed. Draft a reply.", expected_route: "complaint_handler", expected_output_excerpt: "make this right" },
    { owner_ask: "Customer is unhappy we were 40 minutes late. Respond please.", expected_route: "complaint_handler", expected_output_excerpt: "sorry" },
  ],
});
