import { defineStub } from "../_stub.js";

export const reviewRequest = defineStub({
  agent_id: "review_request",
  display_name: "Review Request",
  bucket: "reputation",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts a short, warm post-service review-request message.",
  channel: "sms",
  routes_here_when: [
    "Owner asks to send a review request to a specific recent customer",
    "(Phase 4) Event: appointment marked complete → fires 24h later",
  ],
  keywords: ["review", "leave a review", "google review", "yelp", "rating", "feedback", "testimonial"],
  strong_signals: ["ask for a review", "review request", "request a review"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    require_owner_approval: true,
    recipient_filter: "completed_service_only",
    send_caps: { notes: ["1 per customer per 90 days (hardcoded)"] },
  },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["appointment_completed"] },
  output_format: { title_template: "SMS to {customer} — review request", body_constraints: { no_markdown: true } },
  examples: [
    { owner_ask: "Ask Maria for a Google review after her detail yesterday.", expected_route: "review_request", expected_output_excerpt: "review" },
    { owner_ask: "Send Jake a review request for his brake job.", expected_route: "review_request", expected_output_excerpt: "Jake" },
    { owner_ask: "Request a review from Dana for last week's service.", expected_route: "review_request", expected_output_excerpt: "review" },
  ],
});
