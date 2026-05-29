import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, money, num, optStr, result, str } from "../base.js";

/**
 * Quote Follow-up (quote_follow_up) — sales · new (migration) · P2.
 *
 * Specialised lead-nurture variant tuned for unresponded quotes. Carries the
 * quote amount + scope and uses quote-specific framing. The orchestrator routes
 * here (over Lead Nurture) only when the ask carries a dollar amount + "quote".
 */
export const quoteFollowUp: AgentDefinition = {
  agent_id: "quote_follow_up",
  display_name: "Quote Follow-up",
  bucket: "sales",
  status: "new",
  build_priority: "P2",
  purpose:
    "Follows up on a specific quote that hasn't been booked, with quote-specific framing.",
  routing: {
    routes_here_when: [
      "Owner asks to follow up on a specific quote that hasn't been booked",
      "(Phase 4) Event: quote sent → +3/+7/+14 days if no booking",
    ],
    keywords: ["quote", "estimate", "proposal", "follow up", "follow-up", "didn't book", "hasn't booked"],
    strong_signals: ["follow up on the quote", "quote follow-up", "chase the quote"],
  },
  channel: "sequence",
  alternate_channels: ["sms"],
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      { name: "quote_amount", type: "number", required: true, description: "Quoted dollar amount." },
      { name: "quote_scope", type: "string", required: false, description: "What the quote covers." },
      { name: "quote_date", type: "date", required: false, description: "When the quote was sent." },
      { name: "touch_count", type: "number", required: false, description: "Touches.", default: 3 },
      { name: "tone_hint", type: "string", required: false, description: "Tone.", default: "warm, not pushy" },
    ],
    from_shared_context: ["business_profile", "pipeline_state"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    configurable_phase_4: { require_owner_approval: true, recipient_filter: "existing_customers_only" },
  },
  triggers_supported: { manual: true, event_based: ["quote_sent_no_booking"] },
  outputs: {
    title_format: "Quote follow-up — {customer_name}, ${quote_amount} {quote_scope}",
    body_format: "Sequence structure with quote-specific framing in each touch.",
    metadata: ["quote_amount", "quote_scope", "touch_count"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Pipeline state", kind: "load", description: "Load the quote's pipeline record." },
    { name: "Compose sequence", kind: "work", description: "Write quote-specific follow-up touches." },
  ],
  example_interactions: [
    {
      owner_ask: "Follow up with Dana on the $2,400 full repaint quote — she hasn't booked.",
      expected_route: "quote_follow_up",
      expected_output_excerpt: "$2,400",
    },
    {
      owner_ask: "Chase the quote I sent Mike for $1,100 last week.",
      expected_route: "quote_follow_up",
      expected_output_excerpt: "quote",
    },
    {
      owner_ask: "Send a follow-up on the $850 detailing quote that didn't book.",
      expected_route: "quote_follow_up",
      expected_output_excerpt: "$850",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const amount = num(input, "quote_amount", 0);
    const scope = str(input, "quote_scope", "the work we discussed");
    const touchCount = Math.min(Math.max(num(input, "touch_count", 3), 1), 3);

    const leadRecords = customerName
      ? ctx.pipeline_state.leads.filter(
          (l) => l.name.toLowerCase().includes(customerName.toLowerCase()) && l.quoteAmount,
        )
      : [];
    s.trace.loadOrSkip(
      "Pipeline state",
      leadRecords,
      (d) => `found ${(d as unknown[]).length} matching quote record(s)`,
    );

    const signoff = s.signoff();
    const name = customerName ?? "there";
    const amt = money(amount);
    const sig = signoff ? `\n\n— ${signoff}` : "";

    const allTouches = [
      `**Touch 1 — Today (Email)**\nHi ${name}, just following up on the ${amt} quote for ${scope}. I wanted to make sure it reached you and answer any questions before it expires. Happy to walk through the details whenever works.${sig}`,
      `**Touch 2 — +7 days (Text)**\nHi ${name}, checking in on the ${amt} quote for ${scope}. If the timing or scope needs adjusting, just say the word — I'd rather tailor it than have it sit. Want to book a slot?${sig}`,
      `**Touch 3 — +14 days (Email)**\nHi ${name}, last note on the ${amt} quote for ${scope}. I'll keep it on file in case you'd like to move forward later — and if anything changed on your end, I'm glad to revise it.${sig}`,
    ];
    const touches = allTouches.slice(0, touchCount);
    s.trace.work("Compose sequence", `wrote ${touches.length}-touch quote follow-up`);

    const draft = finishDraft({
      title: `Quote follow-up — ${customerName ?? "customer"}, ${amt} ${scope}`,
      body: touches.join("\n\n---\n\n"),
      channel: "sequence",
      metadata: { quote_amount: amount, quote_scope: scope, touch_count: touches.length },
      requiresApproval: true,
    });
    return result(quoteFollowUp, s, draft);
  },
};
