import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, money, num, optStr, result } from "../base.js";

/**
 * Payment Follow-up (payment_follow_up) — finance · new · P3.
 *
 * Drafts an escalating payment-chase sequence for invoices that didn't respond
 * to the first reminder. Firmer tone by level, but: never threatening/accusatory
 * without owner direction; never specific legal threats (only general "next
 * steps"); always offers a fast way to resolve. Always requires approval.
 */
export const paymentFollowUp: AgentDefinition = {
  agent_id: "payment_follow_up",
  display_name: "Payment Follow-up",
  bucket: "finance",
  status: "new",
  build_priority: "P3",
  purpose: "Drafts an escalating (but professional) payment-chase sequence for overdue invoices.",
  routing: {
    routes_here_when: [
      "Owner asks for an escalation sequence on an overdue invoice",
      "(Phase 4) Trigger: invoice 14+ days overdue with no response to first reminder",
    ],
    keywords: ["payment", "escalate", "escalation", "overdue", "final notice", "past due", "collections", "still unpaid"],
    strong_signals: ["escalation sequence", "final notice", "chase the payment", "past due"],
  },
  channel: "sequence",
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      { name: "invoice_amount", type: "number", required: true, description: "Invoice amount." },
      { name: "invoice_date", type: "date", required: false, description: "Invoice date." },
      { name: "days_overdue", type: "number", required: false, description: "Days overdue." },
      { name: "prior_touches", type: "number", required: false, description: "Touches already sent." },
      {
        name: "escalation_level",
        type: "number",
        required: false,
        description: "1=firm friendly, 2=formal, 3=final notice.",
        default: 1,
      },
    ],
    from_shared_context: ["business_profile", "pipeline_state"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    never_auto_send: true,
    configurable_phase_4: { require_owner_approval: true },
  },
  triggers_supported: { manual: true, event_based: ["invoice_overdue_no_response"] },
  outputs: {
    title_format: "Payment follow-up — {customer_name}, ${amount}, level {escalation_level}",
    body_format: "Structured per level (1 warm, 2 formal, 3 final). General language only; no legal specifics.",
    metadata: ["amount", "escalation_level", "channel"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Customer history", kind: "load", description: "Load pipeline history for this customer." },
    { name: "Compose escalation", kind: "work", description: "Write the level-appropriate message." },
  ],
  example_interactions: [
    {
      owner_ask: "Escalate the overdue $1,100 invoice for Mike — second notice.",
      expected_route: "payment_follow_up",
      expected_output_excerpt: "$1,100",
    },
    {
      owner_ask: "Final notice for Dana's $450 invoice, 30 days past due.",
      expected_route: "payment_follow_up",
      expected_output_excerpt: "final",
    },
    {
      owner_ask: "Firm payment reminder for Sam's still-unpaid $200 balance.",
      expected_route: "payment_follow_up",
      expected_output_excerpt: "payment",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const amount = num(input, "invoice_amount", 0);
    const level = Math.min(Math.max(num(input, "escalation_level", inferLevel(input.ownerAsk)), 1), 3);

    const history = customerName
      ? ctx.pipeline_state.leads.filter((l) => l.name.toLowerCase().includes(customerName.toLowerCase()))
      : [];
    s.trace.loadOrSkip("Customer history", history, (d) => `${(d as unknown[]).length} prior record(s)`);

    const signoff = s.signoff();
    const businessName = s.field("business_name");
    const paymentLink = s.field("payment_link");
    const name = customerName ?? "there";
    const amt = money(amount);
    const resolve = paymentLink
      ? `You can settle it here: ${paymentLink}.`
      : `Just reply and we can sort out payment, including a payment plan if that helps.`;
    const sig = signoff ? `\n\n— ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}` : "";

    s.trace.work("Compose escalation", `level ${level}, general language only`);

    let body: string;
    if (level === 1) {
      body =
        `**Level 1 — firm but friendly**\n` +
        `Hi ${name}, following up on the outstanding balance of ${amt}. I know things slip — could you let me know when you're able to take care of it? ${resolve}${sig}`;
    } else if (level === 2) {
      body =
        `**Level 2 — formal notice**\n` +
        `Hi ${name}, this is a formal reminder that your balance of ${amt} is now past due. We'd appreciate prompt payment to keep your account in good standing. ${resolve}${sig}`;
    } else {
      body =
        `**Level 3 — final notice**\n` +
        `Hi ${name}, this is a final notice regarding the past-due balance of ${amt}. If we don't hear from you, we'll need to consider next steps to resolve the account. We'd much rather settle this directly — ${resolve}${sig}`;
      s.note("This is a final-notice draft. I've kept the language general (no specific legal threats). If you want to reference specific next steps, tell me and I'll add them with your wording.");
    }

    const draft = finishDraft({
      title: `Payment follow-up — ${customerName ?? "customer"}, ${amt}, level ${level}`,
      body,
      channel: "sequence",
      metadata: { amount, escalation_level: level, channel: "sequence" },
      requiresApproval: true,
    });
    return result(paymentFollowUp, s, draft);
  },
};

function inferLevel(ask: string): number {
  const a = ask.toLowerCase();
  if (a.includes("final")) return 3;
  if (a.includes("second") || a.includes("formal") || a.includes("2nd")) return 2;
  return 1;
}
