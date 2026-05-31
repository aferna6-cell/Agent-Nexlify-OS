import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields, firstName } from "../_authoring.js";
import { finishBody, money, parseMoney } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Money = z.preprocess(parseMoney, z.number().optional());

const Input = z.object({
  customer_name: z.string().optional(),
  amount: Money,
  invoice_amount: Money,
  invoice_date: z.string().optional(),
  days_overdue: z.coerce.number().optional(),
  prior_touches: z.coerce.number().optional(),
  escalation_level: z.coerce.number().optional(),
});

function inferLevel(ask: string): number {
  const a = ask.toLowerCase();
  if (a.includes("final")) return 3;
  if (a.includes("second") || a.includes("formal") || a.includes("2nd")) return 2;
  return 1;
}

export const paymentFollowUp = defineAgent(
  {
    agent_id: "payment_follow_up",
    display_name: "Payment Follow-up",
    bucket: "finance",
    status: "new",
    build_priority: "P3",
    purpose: "Drafts an escalating (but professional) payment-chase sequence for overdue invoices.",
    channel: "sequence",
    routes_here_when: ["Owner asks for an escalation sequence on an overdue invoice", "(Phase 4) Trigger: invoice 14+ days overdue with no response"],
    keywords: ["payment", "escalate", "escalation", "final notice", "past due", "collections", "still unpaid"],
    strong_signals: ["escalation sequence", "final notice", "chase the payment", "past due"],
    shared_context_needed: ["business_profile", "pipeline_state"],
    tool_dependencies: ["none"],
    // Hardcoded: payment escalation is too high-stakes to ever auto-send.
    permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["invoice_overdue_no_response"] },
    output_format: { title_template: "Payment follow-up — {customer}, ${amount}, level {level}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const amount = params.invoice_amount ?? params.amount ?? 0;
    const level = Math.min(Math.max(params.escalation_level ?? inferLevel(ownerAsk), 1), 3);
    const name = firstName(customerName) ?? "there";
    const amt = money(amount);

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });
    const history = customerName ? context.pipelineLeads.filter((l) => l.name.toLowerCase().includes(customerName.toLowerCase())) : [];
    await emitTrace.emit("load_customer_history", { description: `Found ${history.length} prior record(s)`, data: history });

    const signoff = a.signoff();
    const businessName = a.field("businessName");
    const paymentLink = a.field("paymentLink");
    const resolve = paymentLink ? `You can settle it here: ${paymentLink}.` : `Just reply and we can sort out payment, including a payment plan if that helps.`;
    const sig = signoff ? `\n\n— ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}` : "";

    const local = (): string => {
      if (level === 1) {
        return `**Level 1 — firm but friendly**\nHi ${name}, following up on the outstanding balance of ${amt}. I know things slip — could you let me know when you're able to take care of it? ${resolve}${sig}`;
      }
      if (level === 2) {
        return `**Level 2 — formal notice**\nHi ${name}, this is a formal reminder that your balance of ${amt} is now past due. We'd appreciate prompt payment to keep your account in good standing. ${resolve}${sig}`;
      }
      return `**Level 3 — final notice**\nHi ${name}, this is a final notice regarding the past-due balance of ${amt}. If we don't hear from you, we'll need to consider next steps to resolve the account. We'd much rather settle this directly — ${resolve}${sig}`;
    };

    if (level === 3) {
      a.note("This is a final-notice draft. I kept the language general (no specific legal threats). If you want to reference specific next steps, tell me and I'll add them in your words.");
    }

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft ONE payment-reminder message at escalation level ${level} (1=firm friendly, 2=formal, 3=final notice) ` +
      `on the SEQUENCE channel. HARD RULES: never use threatening, accusatory, or aggressive language; never reference ` +
      `specific legal action (no lawyers, lawsuits, liens, or collections agencies by name) — only general "next steps will ` +
      `be considered" at level 3. Always include a clear, easy way to resolve. Stay professional and concise.` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Customer: ${customerName ?? "(unknown)"}. Balance: ${amt}. Days overdue: ${params.days_overdue ?? "(n/a)"}. Level: ${level}.`;

    await emitTrace.work("compose_escalation", `level ${level}, general language only`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 300 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Payment follow-up — ${customerName ?? "customer"}, ${amt}, level ${level}`,
        body: finishBody("sequence", generated.text),
        channel: "sequence",
        metadata: { amount, escalation_level: level, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
