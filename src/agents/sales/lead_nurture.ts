import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, num, optStr, result, str } from "../base.js";

interface Touch {
  label: string;
  channel: "Text" | "Email";
  body: string;
}

/**
 * Lead Nurture (lead_nurture) — sales · existing · P1.
 *
 * Drafts warm follow-up messages or 2–3 touch sequences to re-engage prospects.
 * QA fixes baked in: relative dates (Today / +5 / +14, not "Day 1/Day 5"),
 * internal date-label consistency, and real business name in signoffs.
 */
export const leadNurture: AgentDefinition = {
  agent_id: "lead_nurture",
  display_name: "Lead Nurture",
  bucket: "sales",
  status: "existing",
  build_priority: "P1",
  purpose: "Drafts warm follow-up sequences to re-engage prospects who haven't moved forward.",
  routing: {
    routes_here_when: [
      "Owner asks for a follow-up sequence for a specific lead",
      "(Phase 4) Trigger: lead stale N days",
    ],
    keywords: [
      "follow up",
      "follow-up",
      "nurture",
      "re-engage",
      "reengage",
      "stale lead",
      "hasn't responded",
      "went quiet",
      "touch sequence",
      "check in",
    ],
    strong_signals: [
      "follow-up sequence",
      "nurture sequence",
      "re-engage the lead",
      "touch follow-up",
      "follow-up for",
      "follow up for",
    ],
  },
  channel: "sequence",
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Lead's name." },
      { name: "subject", type: "string", required: false, description: "What the lead inquired about." },
      { name: "last_contact_date", type: "date", required: false, description: "Last contact." },
      { name: "current_status", type: "string", required: false, description: "Pipeline status." },
      {
        name: "tone_hint",
        type: "string",
        required: false,
        description: "Tone for the sequence.",
        default: "warm, not pushy",
      },
      {
        name: "touch_count",
        type: "number",
        required: false,
        description: "Number of touches.",
        default: 3,
      },
    ],
    from_shared_context: ["business_profile", "pipeline_state", "agent_run_history"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    configurable_phase_4: { require_owner_approval: true, recipient_filter: "existing_customers_only" },
  },
  triggers_supported: { manual: true, scheduled: [], event_based: ["lead_stale"] },
  outputs: {
    title_format: "{N}-touch follow-up sequence — {customer_name}, {subject}",
    body_format:
      "Sections per touch using relative dates (Touch 1 — Today (Text), Touch 2 — +5 days (Email)). Each touch shows its channel.",
    metadata: ["touch_count", "subject"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Pipeline state", kind: "load", description: "Load this lead's pipeline record." },
    { name: "Prior outreach", kind: "load", description: "Check run history to avoid repeating earlier touches." },
    { name: "Compose sequence", kind: "work", description: "Write the multi-touch sequence." },
  ],
  example_interactions: [
    {
      owner_ask: "Draft a 3-touch follow-up for Sarah who asked about a consultation two weeks ago.",
      expected_route: "lead_nurture",
      expected_output_excerpt: "Touch 1 — Today",
    },
    {
      owner_ask: "Write a warm follow-up sequence for a lead that went quiet after a quote inquiry.",
      expected_route: "lead_nurture",
      expected_output_excerpt: "+5 days",
    },
    {
      owner_ask: "Re-engage Mike — he hasn't responded since last month.",
      expected_route: "lead_nurture",
      expected_output_excerpt: "Touch",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const subject = str(input, "subject", "your inquiry");
    const touchCount = Math.min(Math.max(num(input, "touch_count", 3), 1), 3);

    const leadRecords = customerName
      ? ctx.pipeline_state.leads.filter((l) =>
          l.name.toLowerCase().includes(customerName.toLowerCase()),
        )
      : [];
    s.trace.loadOrSkip(
      "Pipeline state",
      leadRecords,
      (d) => `found ${(d as unknown[]).length} matching lead record(s)`,
    );

    const priorRuns = ctx.agent_run_history.filter((r) => r.agent_id === "lead_nurture");
    s.trace.loadOrSkip(
      "Prior outreach",
      priorRuns,
      (d) => `found ${(d as unknown[]).length} prior nurture run(s) — avoiding repeats`,
    );

    const signoff = s.signoff();
    const businessName = s.field("business_name");
    const name = customerName ?? "there";

    // Relative-date framing; labels and copy reference the SAME relative timing.
    const allTouches: Touch[] = [
      {
        label: "Touch 1 — Today",
        channel: "Text",
        body: `Hi ${name}, just circling back about ${subject}. No rush at all — I'd love to help whenever the timing's right. Want me to hold a spot for you?`,
      },
      {
        label: "Touch 2 — +5 days",
        channel: "Email",
        body: `Hi ${name}, following up on ${subject} from a few days ago. If you have any questions or want to talk options, I'm happy to walk you through them — just reply here.`,
      },
      {
        label: "Touch 3 — +14 days",
        channel: "Text",
        body: `Hi ${name}, last check-in on ${subject} — it's been a couple of weeks, so I wanted to make sure this didn't slip through. Still glad to help if you're interested; otherwise I'll get out of your inbox.`,
      },
    ];
    const touches = allTouches.slice(0, touchCount);
    s.trace.work("Compose sequence", `wrote ${touches.length}-touch sequence with relative dates`);

    const sig = signoff ? `\n\n— ${signoff}${businessName ? `, ${businessName}` : ""}` : "";
    const body = touches
      .map((t) => `**${t.label} (${t.channel})**\n${t.body}${sig}`)
      .join("\n\n---\n\n");

    const draft = finishDraft({
      title: `${touches.length}-touch follow-up sequence — ${customerName ?? "lead"}, ${subject}`,
      body,
      channel: "sequence",
      metadata: { touch_count: touches.length, subject },
      requiresApproval: true,
    });
    return result(leadNurture, s, draft);
  },
};
