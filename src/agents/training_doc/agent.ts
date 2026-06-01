import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  topic: z.string().optional(),
  role: z.string().optional(),
});

type DocKind = "training checklist" | "SOP" | "handbook entry";

function deriveKind(ask: string): DocKind {
  const a = ask.toLowerCase();
  if (a.includes("sop") || a.includes("standard operating")) return "SOP";
  if (a.includes("handbook")) return "handbook entry";
  return "training checklist";
}

function topicFromAsk(ask: string): string | undefined {
  const m = ask.match(/\b(?:for|on|about)\s+(.+?)[.?!]?$/i);
  if (m) return m[1]!.replace(/^(a|an|the|our|my)\s+/i, "").trim();
  return undefined;
}

function capitalize(t: string): string {
  return t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1);
}

export const trainingDoc = defineAgent(
  {
    agent_id: "training_doc",
    display_name: "Training Doc",
    bucket: "system",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a training checklist, SOP, or handbook entry for staff onboarding and operations.",
    channel: "report",
    routes_here_when: [
      "Owner asks for a training checklist or onboarding doc",
      "Owner asks for an SOP or a handbook entry",
    ],
    keywords: ["training", "checklist", "sop", "handbook", "onboarding"],
    strong_signals: ["training checklist", "handbook entry"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "{kind} — {topic}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const kind = deriveKind(ownerAsk);
    const topic = params.topic?.trim() || topicFromAsk(ownerAsk) || "your shop";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const title = `${capitalize(kind)} — ${capitalize(topic)}`;

    const local = (): string => {
      const header = `# ${title}\n\n${businessName ? `For ${businessName}. ` : ""}`;
      switch (kind) {
        case "SOP":
          return (
            header +
            `Standard Operating Procedure (SOP) for ${topic}.\n\n` +
            `## Steps\n\n` +
            `1. Arrive and unlock; turn on lights and equipment.\n` +
            `2. Check messages, the schedule, and any overnight notes.\n` +
            `3. Prep the workspace and confirm supplies for the day.\n` +
            `4. Open for customers and greet the first arrivals.\n\n` +
            `## Notes\n\n` +
            `- Follow this SOP every time so the process stays consistent.\n` +
            `- Flag anything broken or missing to the owner right away.`
          );
        case "handbook entry":
          return (
            header +
            `Handbook entry covering our ${topic}.\n\n` +
            `## Policy\n\n` +
            `This section explains our ${topic} so every team member handles it the same way.\n\n` +
            `## What to do\n\n` +
            `- Follow the ${topic} consistently with every customer.\n` +
            `- When unsure, ask the owner before making an exception.\n\n` +
            `## Why it matters\n\n` +
            `A clear, consistent policy protects customers and the business.`
          );
        default:
          return (
            header +
            `Onboarding training checklist for ${topic}.\n\n` +
            `## Day one\n\n` +
            `- [ ] Tour the workspace and meet the team\n` +
            `- [ ] Review safety basics and where things live\n` +
            `- [ ] Walk through the daily schedule and tools\n\n` +
            `## First week\n\n` +
            `- [ ] Shadow an experienced team member\n` +
            `- [ ] Learn our customer-greeting and phone process\n` +
            `- [ ] Practice the core tasks for this role\n\n` +
            `## Sign-off\n\n` +
            `- [ ] Trainee and owner confirm the checklist is complete`
          );
      }
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a ${kind} on the REPORT channel (markdown) for ${businessName ?? "the business"}. ` +
      `Be practical and specific to a small service business. Do not invent facts you don't have. Title it "${title}".`;
    const prompt = `Document kind: ${kind}. Topic: ${topic}. Owner ask: ${ownerAsk}`;

    await emitTrace.work("draft_doc", `kind=${kind}, topic="${topic}"`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 800 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { kind, topic, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
