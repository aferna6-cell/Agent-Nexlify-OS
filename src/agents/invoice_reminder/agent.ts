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
  invoice_number: z.string().optional(),
  invoice_date: z.string().optional(),
  days_overdue: z.coerce.number().optional(),
  payment_method_options: z.string().optional(),
});

function invoiceNumberOf(ask: string): string | undefined {
  const m = ask.match(/(?:invoice|inv)\s*#?\s*(\d{2,})/i);
  return m ? `#${m[1]}` : undefined;
}

export const invoiceReminder = defineAgent(
  {
    agent_id: "invoice_reminder",
    display_name: "Invoice Reminder",
    bucket: "finance",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a polite first-touch reminder for an unpaid invoice.",
    channel: "email",
    routes_here_when: ["Owner asks to follow up on an unpaid invoice (typically 1–14 days overdue)"],
    keywords: ["invoice", "unpaid", "overdue", "bill", "outstanding", "balance due", "reminder"],
    strong_signals: ["invoice reminder", "remind about the invoice", "unpaid invoice"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: {
      default: "drafts_only",
      require_owner_approval: true,
      never_auto_send: true,
      send_caps: { notes: ["1 reminder per invoice per 7 days (hardcoded)"] },
    },
    triggers_supported: ["manual"],
    output_format: { title_template: "Invoice reminder — {customer}, ${amount}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const amount = params.invoice_amount ?? params.amount ?? 0;
    const invoiceNumber = params.invoice_number?.trim() || invoiceNumberOf(ownerAsk);
    const invoiceDate = params.invoice_date?.trim();
    const methods = params.payment_method_options?.trim() || a.field("paymentLink");

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const signoff = a.signoff();
    const businessName = a.field("businessName");
    const name = firstName(customerName) ?? "there";
    const invoiceRef = invoiceNumber ? `invoice ${invoiceNumber}` : "your invoice";
    const dateClause = invoiceDate ? ` from ${invoiceDate}` : "";
    const daysOverdue = params.days_overdue;
    const overdueClause = typeof daysOverdue === "number" && daysOverdue > 0 ? ` (now ${daysOverdue} days past due)` : "";

    if (!methods) {
      a.note("I don't have a payment link or accepted methods on file, so I kept the ask open-ended. Add a payment link to your profile and I'll include it next time.");
    }

    const local = (): string => {
      let body = `Hi ${name}, hope you're doing well! Just a friendly reminder about ${invoiceRef}${dateClause} (${money(amount)})${overdueClause}. If it's already on its way, please ignore this`;
      body += methods ? ` — otherwise you can pay via ${methods}. ` : " — otherwise just let me know if you have any questions. ";
      body += "Thanks so much!";
      if (signoff) body += ` — ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}`;
      return body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a polite FIRST-TOUCH invoice reminder on the EMAIL channel (markdown allowed, but keep it brief). ` +
      `Assume the customer simply forgot — warm, not accusatory; no threats. Mention the invoice ${invoiceNumber ?? ""} and amount ${money(amount)}${overdueClause ? `, which is ${daysOverdue} days past due` : ""}. ` +
      `Do NOT add any meta notes, bracketed placeholders, or "[unknown]" text — use only the real values given. ` +
      (methods ? `Offer payment via: ${methods}.` : `You have no payment link — keep the payment ask open-ended; do not invent a link.`) +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Customer: ${customerName ?? "(unknown)"}. Invoice: ${invoiceNumber ?? "(n/a)"} ${money(amount)}. Days overdue: ${params.days_overdue ?? "(n/a)"}.`;

    await emitTrace.work("compose_reminder", `amount=${money(amount)}, first-touch friendly tone`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 300 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Invoice reminder — ${customerName ?? "customer"}, ${money(amount)}`,
        body: finishBody("email", generated.text),
        channel: "email",
        metadata: { amount, days_overdue: params.days_overdue ?? null, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
