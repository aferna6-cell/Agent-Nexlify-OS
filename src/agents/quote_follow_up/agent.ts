import { defineStub } from "../_stub.js";

export const quoteFollowUp = defineStub({
  agent_id: "quote_follow_up",
  display_name: "Quote Follow-up",
  bucket: "sales",
  status: "new",
  build_priority: "P2",
  purpose: "Follows up on a specific quote that hasn't been booked, with quote-specific framing.",
  channel: "sequence",
  routes_here_when: [
    "Owner asks to follow up on a specific quote that hasn't been booked",
    "(Phase 4) Event: quote sent → +3/+7/+14 days if no booking",
  ],
  keywords: ["quote", "estimate", "proposal", "didn't book", "hasn't booked", "chase the quote"],
  strong_signals: ["follow up on the quote", "quote follow-up", "chase the quote"],
  shared_context_needed: ["business_profile", "pipeline_state"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true, recipient_filter: "existing_customers_only" },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["quote_sent_no_booking"] },
  output_format: { title_template: "Quote follow-up — {customer}, ${amount}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Follow up with Dana on the $2,400 repaint quote — she hasn't booked.", expected_route: "quote_follow_up", expected_output_excerpt: "$2,400" },
    { owner_ask: "Chase the quote I sent Mike for $1,100 last week.", expected_route: "quote_follow_up", expected_output_excerpt: "quote" },
    { owner_ask: "Send a follow-up on the $850 detailing quote that didn't book.", expected_route: "quote_follow_up", expected_output_excerpt: "$850" },
  ],
});
