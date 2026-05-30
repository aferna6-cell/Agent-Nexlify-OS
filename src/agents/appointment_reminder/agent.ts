import { defineStub } from "../_stub.js";

export const appointmentReminder = defineStub({
  agent_id: "appointment_reminder",
  display_name: "Appointment Reminder",
  bucket: "scheduling_ops",
  status: "new",
  build_priority: "P4",
  purpose: "Sends day-before SMS reminders for upcoming appointments.",
  channel: "sms",
  routes_here_when: [
    "Owner asks to send reminders for tomorrow's appointments",
    "(Phase 4) Scheduled trigger: daily at owner-configured time",
  ],
  keywords: ["reminder", "remind", "tomorrow's appointments", "day-before", "appointment reminder", "heads up"],
  strong_signals: ["send reminders", "remind tomorrow's customers"],
  shared_context_needed: ["business_profile", "pipeline_state"],
  tool_dependencies: ["google_calendar", "twilio_sms"],
  permission_scope: {
    default: "drafts_only",
    require_owner_approval: false,
    recipient_filter: "scheduled_appointments_only",
    send_caps: { notes: ["1 reminder per appointment (hardcoded)"] },
  },
  triggers_supported: ["manual", "scheduled"],
  trigger_detail: { scheduled_cron: ["0 17 * * *"] },
  output_format: { title_template: "Appointment reminders — {date}", body_constraints: { no_markdown: true } },
  examples: [
    { owner_ask: "Send reminders for tomorrow's appointments.", expected_route: "appointment_reminder", expected_output_excerpt: "reminder" },
    { owner_ask: "Remind everyone booked for tomorrow.", expected_route: "appointment_reminder", expected_output_excerpt: "tomorrow" },
    { owner_ask: "Text my tomorrow customers a heads up.", expected_route: "appointment_reminder", expected_output_excerpt: "appointment" },
  ],
});
