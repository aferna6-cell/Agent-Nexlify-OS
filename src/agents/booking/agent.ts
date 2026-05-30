import { defineStub } from "../_stub.js";

export const booking = defineStub({
  agent_id: "booking",
  display_name: "Booking",
  bucket: "scheduling_ops",
  status: "existing",
  build_priority: "P1",
  purpose: "Drafts appointment booking, rescheduling, cancellation, and confirmation messages to a specific customer.",
  channel: "sms",
  routes_here_when: [
    "Owner asks to text/email a customer about an appointment slot",
    "Owner asks to confirm, reschedule, or cancel an existing appointment",
    "(Phase 4) new widget conversation expressing booking intent",
  ],
  keywords: ["book", "booking", "appointment", "schedule", "reschedule", "cancel", "confirm", "slot", "consultation", "offer her", "offer him", "availability"],
  strong_signals: ["book an appointment", "confirm the appointment", "reschedule", "offer a slot"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true, send_caps: { per_day: 30 } },
  triggers_supported: ["manual", "scheduled", "event_based"],
  trigger_detail: { events: ["widget_conversation_booking"] },
  output_format: { title_template: "SMS to {customer} — {slot} booking", body_constraints: { no_markdown: true, max_length: 280 } },
  examples: [
    { owner_ask: "Text Maria to offer her Thursday at 2pm for a consultation.", expected_route: "booking", expected_output_excerpt: "Thursday" },
    { owner_ask: "Confirm Jake's Saturday 10am detailing appointment.", expected_route: "booking", expected_output_excerpt: "confirmed" },
    { owner_ask: "Let Sam know we need to reschedule his Tuesday appointment.", expected_route: "booking", expected_output_excerpt: "reschedule" },
  ],
});
