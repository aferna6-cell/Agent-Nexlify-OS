import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields, firstName } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput, AppointmentData } from "../../types/agent.js";
import { examples } from "./examples.js";

/** True when `iso` falls on the same calendar date as `day` (local time). */
function isSameDate(iso: string, day: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

function dateLabel(day: Date): string {
  return day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "your scheduled time";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export const appointmentReminder = defineAgent(
  {
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
    shared_context_needed: ["business_profile"],
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
    examples,
  },
  async ({ context, emitTrace, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateString = dateLabel(tomorrow);

    const tomorrowsAppointments: AppointmentData[] = context.appointments.filter(
      (apt) => apt.status === "scheduled" && isSameDate(apt.scheduledFor, tomorrow),
    );

    await emitTrace.emit("load_appointments", {
      description: `Found ${tomorrowsAppointments.length} appointment(s) scheduled for tomorrow`,
      data: tomorrowsAppointments,
    });

    if (tomorrowsAppointments.length === 0) {
      return {
        orchestratorNotes: [`No appointments are scheduled for tomorrow (${tomorrowDateString}), so there's nothing to remind anyone about.`],
        noDraftReason: "no appointments tomorrow",
      };
    }

    const signoff = a.signoff();
    const businessName = a.field("businessName");
    const first = tomorrowsAppointments[0]!;
    const name = firstName(first.customerName) ?? "there";
    const service = first.service?.trim() || "appointment";
    const time = timeLabel(first.scheduledFor);
    const withWho = businessName ?? "us";

    const local = (): string => {
      const body = `Hi ${name}, this is a reminder about your ${service} appointment tomorrow at ${time} with ${withWho}. Reply here if you need to reschedule.`;
      return signoff ? `${body} — ${signoff}` : body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft ONE short day-before SMS reminder (max 280 characters) to a customer about their appointment ` +
      `scheduled tomorrow, on the SMS channel: plain text only — no markdown, no asterisks, no headers. ` +
      `The message MUST contain the words "reminder", "tomorrow", and "appointment". ` +
      `Customer: ${name}. Service: ${service}. Time tomorrow: ${time}. ` +
      `Never invent appointment details beyond these. Offer a way to reschedule.` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Draft a reminder for ${name}'s ${service} appointment tomorrow at ${time}.`;

    await emitTrace.work("compose_reminder", `drafted reminder for ${name} (${tomorrowsAppointments.length} appointment(s) tomorrow)`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 200 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    const appointmentList = tomorrowsAppointments.map((apt) => ({
      name: apt.customerName,
      time: timeLabel(apt.scheduledFor),
      service: apt.service?.trim() || "appointment",
    }));

    a.note(
      `I drafted a reminder for ${name}; you have ${tomorrowsAppointments.length} appointment(s) tomorrow — approve to send each.`,
    );

    return {
      draft: {
        title: `Appointment reminders — ${tomorrowDateString}`,
        body: finishBody("sms", generated.text),
        channel: "sms",
        metadata: {
          date: tomorrowDateString,
          appointment_count: tomorrowsAppointments.length,
          appointments: appointmentList,
          source: generated.source,
          cost_usd: generated.costUsd,
        },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
