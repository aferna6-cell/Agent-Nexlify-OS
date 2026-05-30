import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  customer_name: z.string().optional(),
  complaint_text: z.string().optional(),
  incident_date: z.string().optional(),
  prior_history: z.string().optional(),
});

function deriveTopic(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("scratch") || t.includes("damage") || t.includes("dent")) return "vehicle damage";
  if (t.includes("late") || t.includes("wait")) return "lateness";
  if (t.includes("streak") || t.includes("rushed") || t.includes("quality")) return "service quality";
  if (t.includes("refund") || t.includes("charge")) return "billing";
  return "service issue";
}

export const complaintHandler = defineAgent(
  {
    agent_id: "complaint_handler",
    display_name: "Complaint Handler",
    bucket: "customer_service",
    status: "new",
    build_priority: "P3",
    purpose: "Drafts an empathetic complaint response and flags it for the owner; treats complaints as higher-stakes.",
    channel: "widget_reply",
    routes_here_when: ["Owner asks for help responding to a complaint", "(Phase 4) Lead Triage classifies a widget message as complaint intent"],
    keywords: ["complaint", "complained", "upset", "angry", "unhappy", "refund", "terrible", "disappointed", "ruined", "furious", "scratch"],
    strong_signals: ["respond to a complaint", "angry customer", "wants a refund"],
    shared_context_needed: ["business_profile", "pipeline_state"],
    tool_dependencies: ["none"],
    // Hardcoded: complaints ALWAYS require owner approval and may never auto-send,
    // regardless of any other settings — even after Phase 4 trust ramps.
    permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["widget_conversation_complaint"] },
    output_format: { title_template: "Complaint reply — {customer}, {topic}", body_constraints: { no_markdown: true } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const complaint = params.complaint_text?.trim() || ownerAsk;

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const history = customerName ? context.pipelineLeads.filter((l) => l.name.toLowerCase().includes(customerName.toLowerCase())) : [];
    await emitTrace.emit("load_customer_history", { description: `Found ${history.length} prior pipeline record(s)`, data: history });

    // Defining behaviour: always flag red for personal owner review.
    await emitTrace.work("flag_for_owner", "Raised a red flag for personal owner review");
    a.note("⚠️ This is a complaint and I've flagged it red for you. I drafted an empathetic reply, but it will ALWAYS need your approval before anything goes out — I never auto-send complaint responses.");

    const signoff = a.signoff();
    const name = customerName ?? "";
    const greeting = name ? `Hi ${name},` : "Hi,";

    const local = (): string => {
      let body =
        `${greeting} I'm really sorry about this — that's not the experience we want you to have, and I take full responsibility for making it right. ` +
        `Here's what I'd like to do: let me look into exactly what happened and follow up with you directly so we can resolve it as quickly as possible.`;
      if (signoff) body += ` Thank you for telling me — ${signoff}.`;
      return body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a sensitive reply to a CUSTOMER COMPLAINT on the WIDGET channel: plain text only, no markdown. ` +
      `Structure: (1) empathetic acknowledgment, (2) ownership of the issue, (3) ONE concrete next step. ` +
      `Never minimise the problem. Never make promises the business can't keep. Never be defensive.` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Customer: ${customerName ?? "(unknown)"}. Complaint: "${complaint}"`;

    await emitTrace.work("draft_empathetic_reply", "Wrote acknowledgment + ownership + one next step");
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 300 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Complaint reply — ${customerName ?? "customer"}, ${deriveTopic(complaint)} (flagged red)`,
        body: finishBody("widget_reply", generated.text),
        channel: "widget_reply",
        metadata: { flagged: "red", topic: deriveTopic(complaint), source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
