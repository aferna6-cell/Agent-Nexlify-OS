import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, result } from "../base.js";

/**
 * Appointment Reminder (appointment_reminder) — scheduling_ops · new · P4.
 *
 * Sends day-before SMS reminders for upcoming appointments. Reads tomorrow's
 * appointments from the Calendar (shared context) and produces one short SMS per
 * appointment. Honest trace: if there are no appointments tomorrow, it says so
 * and produces no reminders.
 */
export const appointmentReminder: AgentDefinition = {
  agent_id: "appointment_reminder",
  display_name: "Appointment Reminder",
  bucket: "scheduling_ops",
  status: "new",
  build_priority: "P4",
  purpose: "Sends day-before SMS reminders for upcoming appointments.",
  routing: {
    routes_here_when: [
      "Owner asks to send reminders for tomorrow's appointments",
      "(Phase 4) Scheduled trigger: daily at owner-configured time",
    ],
    keywords: ["reminder", "remind", "tomorrow's appointments", "day-before", "appointment reminder"],
    strong_signals: ["send reminders", "remind tomorrow's customers"],
  },
  channel: "sms",
  inputs: {
    from_owner: [],
    from_shared_context: ["business_profile", "calendar", "pipeline_state"],
  },
  tool_dependencies: ["google_calendar", "twilio_sms"],
  permission_scope: {
    default: "drafts_only",
    configurable_phase_4: {
      require_owner_approval: false,
      recipient_filter: "scheduled_appointments_only",
      send_caps: { notes: ["1 reminder per appointment (hardcoded)"] },
    },
  },
  triggers_supported: { manual: true, scheduled: ["0 17 * * *"] },
  outputs: {
    title_format: "Appointment reminders — {date}",
    body_format: "One short plain-text SMS per upcoming appointment.",
    metadata: ["reminder_count", "date"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Tomorrow's appointments", kind: "load", description: "Read tomorrow's scheduled appointments." },
    { name: "Compose reminders", kind: "work", description: "Write one reminder per appointment." },
  ],
  example_interactions: [
    {
      owner_ask: "Send reminders for tomorrow's appointments.",
      expected_route: "appointment_reminder",
      expected_output_excerpt: "reminder",
    },
    {
      owner_ask: "Remind everyone booked for tomorrow.",
      expected_route: "appointment_reminder",
      expected_output_excerpt: "tomorrow",
    },
    {
      owner_ask: "Text my tomorrow customers a heads up.",
      expected_route: "appointment_reminder",
      expected_output_excerpt: "appointment",
    },
  ],

  run(_input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const upcoming = ctx.pipeline_state.appointments.filter((a) => a.status === "scheduled");
    const hasAppts = s.trace.load(
      "Tomorrow's appointments",
      upcoming,
      (d) => `found ${(d as unknown[]).length} scheduled appointment(s)`,
      "no appointments scheduled — nothing to remind, no messages drafted",
    );

    const signoff = s.signoff();
    if (!hasAppts) {
      s.note("You have no upcoming appointments on the calendar, so there's nothing to remind. I didn't draft any messages.");
      return result(appointmentReminder, s, undefined, "no upcoming appointments");
    }

    s.trace.work("Compose reminders", `wrote ${upcoming.length} reminder(s)`);
    const sig = signoff ? ` — ${signoff}` : "";
    const body = upcoming
      .map((a) => {
        const svc = a.service ? ` ${a.service}` : " appointment";
        return `To ${a.customerName}: Hi ${a.customerName}, just a reminder about your${svc} on ${a.date}. Reply here if you need to change anything. See you then!${sig}`;
      })
      .join("\n\n");

    const draft = finishDraft({
      title: `Appointment reminders — ${upcoming.length} scheduled`,
      body,
      channel: "sms",
      metadata: { reminder_count: upcoming.length },
      requiresApproval: true,
    });
    return result(appointmentReminder, s, draft);
  },
};
