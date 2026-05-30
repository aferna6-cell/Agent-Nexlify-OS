import { defineStub } from "../_stub.js";

export const leadTriage = defineStub({
  agent_id: "lead_triage",
  display_name: "Lead Triage",
  bucket: "system",
  status: "new",
  build_priority: "P4",
  purpose: "Internal: classifies a closed widget conversation's intent and slots it into the pipeline.",
  channel: "internal",
  routes_here_when: ["(internal) widget_conversation_closed event fires"],
  keywords: ["triage", "classify lead", "new widget lead"],
  strong_signals: [],
  shared_context_needed: ["widget_history", "pipeline_state"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["widget_conversation_closed"] },
  output_format: { title_template: "(internal) Triage — {intent}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "(internal) classify: 'I'd like to book Saturday.'", expected_route: "lead_triage", expected_output_excerpt: "booking" },
    { owner_ask: "(internal) classify: 'My car came back scratched.'", expected_route: "lead_triage", expected_output_excerpt: "complaint" },
    { owner_ask: "(internal) classify: 'What are your weekend hours?'", expected_route: "lead_triage", expected_output_excerpt: "question" },
  ],
});
