import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, optStr, result, str } from "../base.js";

type BookingMode = "propose" | "confirm" | "reschedule" | "cancel";

/**
 * Booking (booking) — scheduling_ops · existing · P1.
 *
 * Drafts appointment booking, rescheduling, cancellation, and confirmation
 * messages to a specific customer. SMS channel → plain text, ≤ 280 chars.
 * QA fixes: strip markdown from SMS; resolve the "would that work?" vs
 * "consider this confirmed" contradiction by picking ONE frame per mode; never
 * fabricate scheduling state (only reference slots the owner actually gave).
 */
export const booking: AgentDefinition = {
  agent_id: "booking",
  display_name: "Booking",
  bucket: "scheduling_ops",
  status: "existing",
  build_priority: "P1",
  purpose:
    "Drafts appointment booking, rescheduling, cancellation, and confirmation messages to a specific customer.",
  routing: {
    routes_here_when: [
      "Owner asks to text/email a customer about an appointment slot",
      "Owner asks to confirm, reschedule, or cancel an existing appointment",
      "(Phase 4) new widget conversation expressing booking intent",
    ],
    keywords: [
      "book",
      "booking",
      "appointment",
      "schedule",
      "reschedule",
      "cancel",
      "confirm",
      "slot",
      "consultation",
      "offer her",
      "offer him",
      "offer them",
      "availability",
      "set up an appointment",
    ],
    strong_signals: ["book an appointment", "confirm the appointment", "reschedule", "offer a slot"],
  },
  channel: "sms",
  alternate_channels: ["email"],
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      { name: "subject", type: "string", required: false, description: "e.g. 'consultation'.", default: "your appointment" },
      { name: "requested_day", type: "string", required: false, description: "Day the customer asked for." },
      { name: "offered_slot", type: "string", required: false, description: "Specific slot to offer/confirm." },
      { name: "service_type", type: "string", required: false, description: "Service." },
      {
        name: "mode",
        type: "string",
        required: false,
        description: "propose / confirm / reschedule / cancel.",
        default: "propose",
      },
      { name: "notes", type: "string", required: false, description: "Extra notes." },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    configurable_phase_4: { require_owner_approval: true, send_caps: { per_day: 30 } },
  },
  triggers_supported: { manual: true, scheduled: [], event_based: ["widget_conversation_booking"] },
  outputs: {
    title_format: "SMS to {customer_name} — {day} {time} booking",
    body_format: "Plain text, ≤ 280 chars. No markdown. One clear frame (propose OR confirm).",
    metadata: ["mode", "offered_slot", "channel"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Compose message", kind: "work", description: "Write a single-frame booking message." },
  ],
  example_interactions: [
    {
      owner_ask: "Text Maria to offer her Thursday at 2pm for a consultation.",
      expected_route: "booking",
      expected_output_excerpt: "Thursday",
    },
    {
      owner_ask: "Confirm Jake's Saturday 10am detailing appointment.",
      expected_route: "booking",
      expected_output_excerpt: "confirmed",
    },
    {
      owner_ask: "Let Sam know we need to reschedule his Tuesday appointment.",
      expected_route: "booking",
      expected_output_excerpt: "reschedule",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const subject = str(input, "subject", "your appointment");
    const slot = optStr(input, "offered_slot") ?? optStr(input, "requested_day");
    const mode = normalizeMode(str(input, "mode", "propose"), input.ownerAsk);
    const signoff = s.signoff();
    const name = customerName ?? "there";

    s.trace.work("Compose message", `mode=${mode}, slot=${slot ?? "none provided"}`);

    // Never fabricate a slot. If none was provided, ask for availability instead
    // of inventing "fully booked"/specific times.
    let body: string;
    switch (mode) {
      case "confirm":
        body = slot
          ? `Hi ${name}, you're all set for ${subject} on ${slot} — consider this your confirmation. Reply here if anything changes.`
          : `Hi ${name}, you're all set for ${subject} — consider this your confirmation. Reply here if anything changes.`;
        break;
      case "reschedule":
        body = slot
          ? `Hi ${name}, I need to move ${subject}. Could we do ${slot} instead? Let me know if that works and I'll lock it in.`
          : `Hi ${name}, I need to reschedule ${subject}. What day works best for you this week? Send me a couple of options and I'll confirm.`;
        break;
      case "cancel":
        body = `Hi ${name}, I'm sorry but I need to cancel ${subject}. I'd love to find you a new time whenever you're ready — just reply and we'll sort it out.`;
        break;
      case "propose":
      default:
        body = slot
          ? `Hi ${name}, I can offer you ${slot} for ${subject} — would that work for you? Reply yes and I'll hold it.`
          : `Hi ${name}, I'd love to get ${subject} on the calendar. What day and time generally work for you? Send a couple of options and I'll confirm one.`;
        if (!slot) {
          s.note(
            "You didn't give me a specific slot, so I asked the customer for their availability rather than inventing a time. Tell me the slot you want to offer and I'll propose it directly.",
          );
        }
    }

    if (signoff) body += ` — ${signoff}`;

    const draft = finishDraft({
      title: `SMS to ${customerName ?? "customer"} — ${slot ?? subject}`,
      body,
      channel: "sms",
      metadata: { mode, offered_slot: slot ?? null, channel: "sms" },
      requiresApproval: true,
    });
    return result(booking, s, draft);
  },
};

function normalizeMode(raw: string, ownerAsk: string): BookingMode {
  const m = `${raw} ${ownerAsk}`.toLowerCase();
  if (m.includes("cancel")) return "cancel";
  if (m.includes("reschedul")) return "reschedule";
  if (m.includes("confirm")) return "confirm";
  return "propose";
}
