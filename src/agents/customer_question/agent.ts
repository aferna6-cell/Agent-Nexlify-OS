import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields, firstName, greetingInstruction } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput, KbEntry, SharedContext } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  customer_question: z.string().optional(),
  customer_name: z.string().optional(),
  customer_context: z.string().optional(),
});

function searchKb(kb: KbEntry[], query: string): KbEntry[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  if (terms.length === 0) return [];
  return kb.filter((e) => {
    const hay = `${e.topic} ${e.answer}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}

function deriveTopic(q: string): string {
  const a = q.toLowerCase();
  if (a.includes("hour")) return "hours";
  if (a.includes("price") || a.includes("cost") || a.includes("how much")) return "pricing";
  if (a.includes("hybrid") || a.includes("battery")) return "hybrid service";
  if (a.includes("walk")) return "walk-ins";
  const words = q.trim().split(/\s+/).slice(0, 4).join(" ");
  return words.length ? words : "question";
}

export const customerQuestion = defineAgent(
  {
    agent_id: "customer_question",
    display_name: "Customer Question",
    bucket: "customer_service",
    status: "existing",
    build_priority: "P1",
    purpose: "Drafts written answers to customer questions about hours, services, pricing, policies, or products.",
    channel: "widget_reply",
    routes_here_when: [
      "Owner pastes a customer question and asks for a reply",
      "(Phase 4) new widget conversation classified as 'question' intent",
    ],
    keywords: ["question", "asked", "reply", "respond", "answer", "hours", "do you", "what time", "customer asked"],
    strong_signals: ["draft a response", "draft a reply", "how do i reply"],
    shared_context_needed: ["business_profile", "widget_history", "kb"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["widget_conversation_question"] },
    output_format: { title_template: "Reply to {customer} — {topic}", body_constraints: { no_markdown: true } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const question = (params.customer_question ?? "").trim() || ownerAsk;
    const customerName = params.customer_name?.trim();

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const kbHits = searchKb(context.kb, question);
    const kbHasAnswer = await emitTrace.emit("knowledge_base", {
      description: `Found ${kbHits.length} relevant knowledge-base entr${kbHits.length === 1 ? "y" : "ies"}`,
      data: kbHits,
    });

    const priorChats = searchWidget(context, question);
    await emitTrace.emit("prior_conversations", {
      description: `Found ${priorChats.length} related prior conversation(s)`,
      data: priorChats,
    });

    const businessName = a.field("businessName");
    const signoff = a.signoff();

    // QA fix: when the KB lacks the answer, draft a SAFE HOLDING REPLY (never an
    // internal "I need your business profile" message), and surface the gap to
    // the orchestrator chat separately.
    if (!kbHasAnswer) {
      a.note(
        `Heads up — I don't have anything in your knowledge base about this question, so I drafted a safe holding reply that promises a follow-up rather than inventing an answer. Want to add the details so I can answer directly next time?`,
      );
    }

    const greeting = firstName(customerName) ? `Hi ${firstName(customerName)}!` : "Hi!";
    const thanks = businessName ? `Thanks for reaching out to ${businessName}.` : "Thanks for reaching out.";

    const local = (): string => {
      if (kbHasAnswer) {
        return `${greeting} ${thanks} ${kbHits.map((e) => e.answer).join(" ")}${signoff ? ` — ${signoff}` : ""}`;
      }
      return (
        `${greeting} ${thanks} That's a great question — let me confirm the details on my end ` +
        `and get back to you shortly so I give you the right answer.${signoff ? ` — ${signoff}` : ""}`
      );
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a short, warm customer-facing reply (1–3 short paragraphs) on the WIDGET channel: ` +
      `plain text only, no markdown. ` +
      greetingInstruction(firstName(customerName)) +
      (kbHasAnswer
        ? `Answer the question using the knowledge-base facts provided; do not invent details.`
        : `You do NOT have the information needed to answer accurately. Write a SAFE HOLDING REPLY that ` +
          `acknowledges the customer, optionally asks one clarifying question, and promises a quick follow-up. ` +
          `Never invent facts. Never expose internal status (do not ask the owner for their profile/KB inside this reply).`) +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt =
      (kbHasAnswer ? `Knowledge base:\n${kbHits.map((e) => `- ${e.topic}: ${e.answer}`).join("\n")}\n\n` : "") +
      `Customer question: "${question}"`;

    await emitTrace.work("draft_reply", kbHasAnswer ? "Answered from the knowledge base" : "KB lacks this info — safe holding reply");
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    const topic = deriveTopic(question);
    return {
      draft: {
        title: `Reply to ${customerName ?? "lead"} — ${topic}`,
        body: finishBody("widget_reply", generated.text),
        channel: "widget_reply",
        metadata: { topic, kb_hit: kbHasAnswer, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);

function searchWidget(ctx: SharedContext, query: string) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  if (terms.length === 0) return [];
  return ctx.widgetHistory.filter((c) => {
    const hay = `${c.summary} ${c.topics.join(" ")} ${c.contactName ?? ""}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}
