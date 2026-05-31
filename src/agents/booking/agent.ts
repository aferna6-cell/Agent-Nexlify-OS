import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields, firstName } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  customer_name: z.string().optional(),
  subject: z.string().optional(),
  offered_slot: z.string().optional(),
  requested_day: z.string().optional(),
  service_type: z.string().optional(),
  vehicle: z.string().optional(),
  scheduling_constraints: z.array(z.string()).optional(),
  mode: z.string().optional(),
  notes: z.string().optional(),
});

type Mode = "propose" | "confirm" | "reschedule" | "cancel";

function resolveMode(raw: string | undefined, ownerAsk: string): Mode {
  const m = `${raw ?? ""} ${ownerAsk}`.toLowerCase();
  if (m.includes("cancel")) return "cancel";
  if (m.includes("reschedul")) return "reschedule";
  if (m.includes("confirm")) return "confirm";
  return "propose";
}

export const booking = defineAgent(
  {
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
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const serviceType = params.service_type?.trim();
    const vehicle = params.vehicle?.trim();
    // Subject prefers the concrete service (+ vehicle) the owner gave us (B-04),
    // e.g. "tire rotation on your 2019 F-150", falling back to a generic phrase.
    const servicePhrase = serviceType
      ? vehicle
        ? `${serviceType} on your ${vehicle}`
        : serviceType
      : undefined;
    const subject = params.subject?.trim() || servicePhrase || "your appointment";
    const slot = params.offered_slot?.trim() || params.requested_day?.trim();
    const constraints = (params.scheduling_constraints ?? []).map((c) => c.trim()).filter(Boolean);
    const mode = resolveMode(params.mode, ownerAsk);

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    // B-05: include the business name in the signoff when we have both names.
    const ownerSign = a.signoff();
    const businessName = a.field("businessName");
    const signoff = ownerSign && businessName && ownerSign !== businessName
      ? `${ownerSign}, ${businessName}`
      : ownerSign ?? businessName;
    // B-11: greet by first name only ("Hi Mike", not "Hi Mike Johnson").
    const name = firstName(customerName) ?? "there";

    // QA fix: never invent scheduling state — if no slot was provided, ask for
    // availability instead of fabricating times or "fully booked".
    if (mode === "propose" && !slot) {
      a.note(
        "You didn't give me a specific slot, so I asked the customer for their availability rather than inventing a time. Tell me the slot to offer and I'll propose it directly.",
      );
    }

    // QA fix: pick ONE frame per mode (no "would that work?" + "consider this confirmed").
    const local = (): string => {
      let body: string;
      switch (mode) {
        case "confirm":
          body = slot
            ? `Hi ${name}, you're all set for ${subject} on ${slot} — consider this your confirmation. Reply here if anything changes.`
            : `Hi ${name}, you're all set for ${subject} — consider this your confirmation. Reply here if anything changes.`;
          break;
        case "reschedule":
          body = slot
            ? `Hi ${name}, I need to reschedule ${subject}. Could we do ${slot} instead? Let me know and I'll lock it in.`
            : `Hi ${name}, I need to reschedule ${subject}. What day works best this week? Send a couple of options and I'll confirm.`;
          break;
        case "cancel":
          body = `Hi ${name}, I'm sorry but I need to cancel ${subject}. I'd love to find you a new time whenever you're ready — just reply and we'll sort it out.`;
          break;
        default: {
          // Acknowledge an owner-stated constraint (e.g. "tomorrow is fully
          // booked") before offering the slot — but only what the owner said.
          const lead = constraints.length && slot ? `${constraints[0]!.replace(/^./, (c) => c.toUpperCase())}, but ` : "";
          body = slot
            ? `Hi ${name}, ${lead}I can offer you ${slot} for ${subject} — would that work for you? Reply yes and I'll hold it.`
            : `Hi ${name}, I'd love to get ${subject} on the calendar. What day and time generally work for you? Send a couple of options and I'll confirm one.`;
          break;
        }
      }
      return signoff ? `${body} — ${signoff}` : body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft ONE short SMS (max 280 characters) to a customer about an appointment, on the SMS channel: ` +
      `plain text only — no markdown, no asterisks, no headers. Use exactly ONE frame for this message: ` +
      `${mode === "confirm" ? "a clear confirmation (do NOT also ask 'would that work?')." : mode === "propose" ? "a proposal that asks if the slot works (do NOT say 'consider this confirmed')." : `a ${mode} message.`} ` +
      `Never INVENT scheduling state, but DO acknowledge any scheduling constraint the owner explicitly stated. ` +
      (constraints.length ? `Owner-stated constraints (acknowledge naturally, don't contradict): ${constraints.join("; ")}. ` : `No constraints were stated — don't mention availability you don't know. `) +
      (slot ? `Slot: ${slot}.` : `No specific slot was given — ask the customer for their availability.`) +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt =
      `Customer: ${customerName ?? "(unknown)"} (greet by first name: ${name}). ` +
      `Subject: ${subject}.${serviceType ? ` Service: ${serviceType}.` : ""}${vehicle ? ` Vehicle: ${vehicle}.` : ""} ` +
      `${constraints.length ? `Constraints: ${constraints.join("; ")}. ` : ""}Mode: ${mode}. Owner request: "${ownerAsk}"`;

    await emitTrace.work("compose_message", `mode=${mode}, slot=${slot ?? "none provided"}`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 200 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `SMS to ${customerName ?? "customer"} — ${slot ?? subject}`,
        body: finishBody("sms", generated.text),
        channel: "sms",
        metadata: { mode, offered_slot: slot ?? null, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
