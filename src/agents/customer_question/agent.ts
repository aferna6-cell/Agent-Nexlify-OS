import { defineStub } from "../_stub.js";

export const customerQuestion = defineStub({
  agent_id: "customer_question",
  display_name: "Customer Question",
  bucket: "customer_service",
  status: "existing",
  build_priority: "P1",
  purpose: "Drafts written answers to customer questions about hours, services, pricing, policies, or products.",
  channel: "widget_reply",
  routes_here_when: [
    "Owner pastes a customer question and asks for a reply",
    "(Phase 4) new widget conversation classified as 'question' intent",
  ],
  keywords: ["question", "asked", "reply", "respond", "answer", "hours", "do you", "what time", "customer asked"],
  strong_signals: ["draft a response", "draft a reply", "how do i reply"],
  shared_context_needed: ["business_profile", "widget_history", "kb"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["widget_conversation_question"] },
  output_format: { title_template: "Reply to {customer} — {topic}", body_constraints: { no_markdown: true } },
  examples: [
    { owner_ask: "A lead asked: 'Do you handle hybrids?' Draft a response.", expected_route: "customer_question", expected_output_excerpt: "Thanks for reaching out" },
    { owner_ask: "Customer asks what our hours are — can you reply?", expected_route: "customer_question", expected_output_excerpt: "hours" },
    { owner_ask: "Someone asked if we take walk-ins. Draft a reply.", expected_route: "customer_question", expected_output_excerpt: "reply" },
  ],
});
