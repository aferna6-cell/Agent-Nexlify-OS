import { searchKb, searchWidgetHistory } from "../../context/sharedContext.js";
import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, optStr, result, str } from "../base.js";

/**
 * Customer Question (customer_question) — customer_service · existing · P1.
 *
 * Drafts written answers to customer questions about hours, services, pricing,
 * policies, or products. Fixes the high-severity QA bug where an empty KB caused
 * the agent to put an *internal* request to the owner inside a customer-facing
 * draft. New behaviour: when the KB lacks the info, produce a safe holding reply
 * and surface the gap separately in the orchestrator chat.
 */
export const customerQuestion: AgentDefinition = {
  agent_id: "customer_question",
  display_name: "Customer Question",
  bucket: "customer_service",
  status: "existing",
  build_priority: "P1",
  purpose:
    "Drafts written answers to customer questions about hours, services, pricing, policies, or products.",
  routing: {
    routes_here_when: [
      "Owner pastes a customer question and asks for a reply",
      "(Phase 4) new widget conversation classified as 'question' intent",
    ],
    keywords: [
      "question",
      "asked",
      "reply",
      "respond",
      "answer",
      "customer asked",
      "hours",
      "do you",
      "what time",
    ],
    strong_signals: ["draft a response", "draft a reply", "how do i reply"],
  },
  channel: "widget_reply",
  alternate_channels: ["email", "sms"],
  inputs: {
    from_owner: [
      {
        name: "customer_question",
        type: "string",
        required: true,
        description: "The customer's verbatim question.",
      },
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      {
        name: "customer_context",
        type: "string",
        required: false,
        description: "Any extra context the owner provides.",
      },
    ],
    from_shared_context: ["business_profile", "widget_history", "kb"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true, event_based: ["widget_conversation_question"] },
  outputs: {
    title_format: 'Reply to {customer_name or "lead"} — {topic}',
    body_format: "1–3 short paragraphs, channel-appropriate. Never contains internal back-channel content.",
    metadata: ["topic", "kb_hit", "channel"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Knowledge base", kind: "load", description: "Search KB for the question topic." },
    { name: "Prior conversations", kind: "load", description: "Search widget history for context." },
    { name: "Draft reply", kind: "work", description: "Write the customer-facing answer." },
  ],
  example_interactions: [
    {
      owner_ask:
        "A new lead asked through the widget: 'Do you guys handle hybrids? I have a 2018 Prius and the battery feels weak.' Draft a response.",
      expected_route: "customer_question",
      expected_output_excerpt:
        "Hybrid battery work is something I want to confirm with our technician before quoting",
    },
    {
      owner_ask: "Customer asks what our hours are — can you reply?",
      expected_route: "customer_question",
      expected_output_excerpt: "Thanks for reaching out",
    },
    {
      owner_ask: "Someone asked if we take walk-ins. Draft a reply.",
      expected_route: "customer_question",
      expected_output_excerpt: "get back to you",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const question = str(input, "customer_question", input.ownerAsk);
    const customerName = optStr(input, "customer_name");

    const kbHits = searchKb(ctx, question);
    const kbHasAnswer = s.trace.loadOrSkip(
      "Knowledge base",
      kbHits,
      (d) => `found ${(d as unknown[]).length} relevant entr${(d as unknown[]).length === 1 ? "y" : "ies"}`,
    );

    const priorHits = searchWidgetHistory(ctx, question);
    s.trace.loadOrSkip(
      "Prior conversations",
      priorHits,
      (d) => `found ${(d as unknown[]).length} related prior chat(s)`,
    );

    const businessName = s.field("business_name");
    const signoff = s.signoff();
    const greeting = customerName ? `Hi ${customerName}!` : "Hi!";
    const thanks = businessName
      ? `Thanks for reaching out to ${businessName}.`
      : "Thanks for reaching out.";

    let body: string;
    if (kbHasAnswer) {
      s.trace.work("Draft reply", "answered directly from the knowledge base");
      const answer = kbHits.map((e) => e.answer).join(" ");
      body = `${greeting} ${thanks} ${answer}`;
    } else {
      // Critical QA fix: no internal back-channel text in the customer draft.
      // Produce a safe holding reply; surface the gap to the orchestrator only.
      s.trace.work(
        "Draft reply",
        "KB lacks this info — produced a safe holding reply (no invented facts)",
      );
      s.note(
        `Heads up — I don't have anything in your knowledge base about this question, so I drafted a safe holding reply that promises a follow-up rather than inventing an answer. Want to add the details so I can answer directly next time?`,
      );
      body =
        `${greeting} ${thanks} That's a great question — let me confirm the details on my end ` +
        `and get back to you shortly so I give you the right answer.`;
    }

    if (signoff) body += ` — ${signoff}`;

    const topic = deriveTopic(question);
    const draft = finishDraft({
      title: `Reply to ${customerName ?? "lead"} — ${topic}`,
      body,
      channel: "widget_reply",
      metadata: { topic, kb_hit: kbHasAnswer, channel: "widget_reply" },
      requiresApproval: true,
    });
    return result(customerQuestion, s, draft);
  },
};

function deriveTopic(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("hour")) return "hours";
  if (q.includes("price") || q.includes("cost") || q.includes("how much")) return "pricing";
  if (q.includes("hybrid") || q.includes("battery")) return "hybrid service";
  if (q.includes("walk")) return "walk-ins";
  if (q.includes("warranty")) return "warranty";
  const firstWords = question.trim().split(/\s+/).slice(0, 4).join(" ");
  return firstWords.length > 0 ? firstWords : "question";
}
