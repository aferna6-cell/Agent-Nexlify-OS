import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  request: z.string().optional(),
  format_hint: z.string().optional(),
  nearest_specialist: z.string().optional(),
  nearest_confidence: z.coerce.number().optional(),
});

function deriveFormat(ask: string): "list" | "memo" | "paragraph" {
  const a = ask.toLowerCase();
  if (a.includes("list") || a.includes("ideas")) return "list";
  if (a.includes("paragraph")) return "paragraph";
  return "memo";
}

function topicOf(ask: string): string {
  return ask
    .replace(/^(write|draft|create|make|compose|give me|help me)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/^(short\s+)?(list of\s+)?(ideas?\s+(to|for|on|about)\s+|ways?\s+to\s+)/i, "")
    .trim();
}

export const generalist = defineAgent(
  {
    agent_id: "generalist",
    display_name: "Generalist",
    bucket: "system",
    status: "existing",
    build_priority: "P1",
    purpose: "Handles open-ended requests that don't fit a specialist; honest about availability and never produces empty placeholder drafts.",
    channel: "report",
    routes_here_when: [
      "Orchestrator's classifier returns low confidence on all other specialists",
      "Owner explicitly asks for something open-ended ('write me a list of ideas to…')",
    ],
    keywords: ["ideas", "brainstorm", "write me", "draft a", "list of", "help me", "plan", "memo"],
    strong_signals: [],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "{format} — {summary}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const request = (params.request ?? "").trim() || ownerAsk;
    const formatHint = params.format_hint?.trim() || deriveFormat(request);
    const topic = topicOf(request);

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    // QA fix (rule 3): if a near specialist (>0.4) was considered, offer it first.
    if (params.nearest_specialist && (params.nearest_confidence ?? 0) > 0.4) {
      a.note(
        `I'm not totally sure this fits, but it's close to the ${params.nearest_specialist} agent. Want me to try that instead, or proceed with a general response?`,
      );
    }

    const local = (): string => {
      if (formatHint === "list") {
        return (
          `Here are some ideas for: ${topic}\n\n` +
          `1. Start with the highest-impact, lowest-effort option.\n` +
          `2. Tell your existing customers first — they're your warmest audience.\n` +
          `3. Make the ask specific and time-bound.\n` +
          `4. Measure what works, then double down.`
        );
      }
      if (formatHint === "paragraph") {
        return `${capitalize(topic)}. Here's a concise take: focus on the one change that moves the needle most, tell the people who already trust you, and give it a week before deciding whether to adjust.`;
      }
      return (
        `**Re: ${topic}**\n\n` +
        `Here's a starting point:\n\n` +
        `- **Goal:** be clear about the single outcome you want.\n` +
        `- **Approach:** the smallest step that gets you moving this week.\n` +
        `- **Next step:** pick one action and a date to review it.\n\n` +
        `Want me to turn any of these into a draft you can send?`
      );
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You are the general fallback assistant. Produce a helpful, owner-facing ${formatHint} on the REPORT channel ` +
      `(markdown allowed) for the request below. Be concrete and concise. Do not invent business facts you don't have.`;
    const prompt = `Owner request: "${request}"`;

    await emitTrace.work("draft_response", `format=${formatHint}`);

    // Bug fix (rule 2): if drafts are genuinely unavailable, do NOT produce an
    // empty draft — surface the outage in the orchestrator chat instead.
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes. (I didn't produce a draft so you're not approving an empty one.)");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `${capitalize(formatHint)} — ${truncate(topic, 50)}`,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { format_hint: formatHint, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
