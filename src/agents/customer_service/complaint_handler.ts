import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, optStr, result, str } from "../base.js";

/**
 * Complaint Handler (complaint_handler) — customer_service · new · P3.
 *
 * Drafts a sensitive, empathetic response to complaint language AND raises a
 * flag in the orchestrator chat so the owner sees it personally. Permission
 * scope is hardcoded never-auto-send: complaints always require owner approval,
 * even after Phase 4, even if auto-send is enabled elsewhere.
 */
export const complaintHandler: AgentDefinition = {
  agent_id: "complaint_handler",
  display_name: "Complaint Handler",
  bucket: "customer_service",
  status: "new",
  build_priority: "P3",
  purpose:
    "Drafts an empathetic complaint response and flags it for the owner, treating complaints as higher-stakes than generic questions.",
  routing: {
    routes_here_when: [
      "Owner asks for help responding to a complaint",
      "(Phase 4) Lead Triage classifies a widget message as complaint intent",
    ],
    keywords: [
      "complaint",
      "complained",
      "upset",
      "angry",
      "unhappy",
      "refund",
      "terrible",
      "disappointed",
      "ruined",
      "worst",
      "furious",
    ],
    strong_signals: ["respond to a complaint", "angry customer", "wants a refund"],
  },
  channel: "widget_reply",
  alternate_channels: ["email"],
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      {
        name: "complaint_text",
        type: "string",
        required: true,
        description: "The customer's complaint, verbatim.",
      },
      { name: "incident_date", type: "date", required: false, description: "When it happened." },
      {
        name: "prior_history",
        type: "string",
        required: false,
        description: "Any prior history with this customer.",
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
  triggers_supported: { manual: true, event_based: ["widget_conversation_complaint"] },
  outputs: {
    title_format: "Complaint reply — {customer_name}, {topic} (flagged red)",
    body_format:
      "Empathetic acknowledgment, ownership of the issue, one concrete next step. Never minimises; never overpromises.",
    metadata: ["flagged", "topic", "channel"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Customer history", kind: "load", description: "Load pipeline history for this customer." },
    { name: "Flag for owner", kind: "work", description: "Raise a red flag in the orchestrator chat." },
    { name: "Draft empathetic reply", kind: "work", description: "Write the response." },
  ],
  example_interactions: [
    {
      owner_ask:
        "A customer wrote: 'I'm furious — my car came back with a scratch on the door.' Help me respond.",
      expected_route: "complaint_handler",
      expected_output_excerpt: "I'm really sorry",
    },
    {
      owner_ask: "Angry customer says the detail job was rushed and streaky. Draft a reply.",
      expected_route: "complaint_handler",
      expected_output_excerpt: "make this right",
    },
    {
      owner_ask: "Customer is unhappy we were 40 minutes late. Respond please.",
      expected_route: "complaint_handler",
      expected_output_excerpt: "sorry",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const complaint = str(input, "complaint_text", input.ownerAsk);

    const history = customerName
      ? ctx.pipeline_state.leads.filter((l) =>
          l.name.toLowerCase().includes(customerName.toLowerCase()),
        )
      : [];
    s.trace.loadOrSkip(
      "Customer history",
      history,
      (d) => `found ${(d as unknown[]).length} prior pipeline record(s)`,
    );

    // Always flag — this is the agent's defining behaviour.
    s.trace.work("Flag for owner", "raised a red flag for personal owner review");
    s.note(
      `⚠️ This is a complaint and I've flagged it red for you. I drafted an empathetic reply, but it will always need your approval before anything goes out — I never auto-send complaint responses.`,
    );

    const signoff = s.signoff();
    const greeting = customerName ? `Hi ${customerName},` : "Hi,";
    s.trace.work("Draft empathetic reply", "wrote acknowledgment + ownership + one next step");

    let body =
      `${greeting} I'm really sorry about this — that's not the experience we want you to have, ` +
      `and I take full responsibility for making it right. ` +
      `Here's what I'd like to do: let me look into exactly what happened and follow up with you directly ` +
      `so we can resolve it as quickly as possible.`;
    if (signoff) body += ` Thank you for telling me — ${signoff}.`;

    const topic = deriveComplaintTopic(complaint);
    const draft = finishDraft({
      title: `Complaint reply — ${customerName ?? "customer"}, ${topic}`,
      body,
      channel: "widget_reply",
      metadata: { flagged: "red", topic, channel: "widget_reply" },
      requiresApproval: true,
    });
    return result(complaintHandler, s, draft);
  },
};

function deriveComplaintTopic(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("scratch") || t.includes("damage") || t.includes("dent")) return "vehicle damage";
  if (t.includes("late") || t.includes("wait")) return "lateness";
  if (t.includes("streak") || t.includes("rushed") || t.includes("quality")) return "service quality";
  if (t.includes("refund") || t.includes("charge")) return "billing";
  return "service issue";
}
