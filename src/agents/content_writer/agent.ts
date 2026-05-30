import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  topic: z.string().optional(),
  format: z.string().optional(),
  target_length: z.string().optional(),
  tone_hint: z.string().optional(),
  seo_keywords: z.array(z.string()).optional(),
  audience: z.string().optional(),
});

type ContentFormat = "blog" | "faq" | "about" | "service description";

function deriveFormat(ask: string): ContentFormat {
  const a = ask.toLowerCase();
  if (a.includes("faq")) return "faq";
  if (a.includes("about")) return "about";
  if (a.includes("service description") || a.includes("service for") || a.includes("package")) return "service description";
  return "blog";
}

function topicOf(ask: string): string {
  return ask
    .replace(/^(write|draft|create|make|compose)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/^(blog post|article|about us( page)?|faq|service description|web ?copy)\s*(about|for|on)?\s*/i, "")
    .replace(/\bfor (our|my|the)\b/i, "")
    .trim();
}

function capitalize(t: string): string {
  return t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1);
}

export const contentWriter = defineAgent(
  {
    agent_id: "content_writer",
    display_name: "Content Writer",
    bucket: "marketing",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts long-form content: blog posts, web copy, FAQs, About Us, service descriptions.",
    channel: "report",
    routes_here_when: ["Owner asks for a blog post, article, web copy, long-form deliverable", "Owner asks to draft FAQ entries, About Us copy, service descriptions"],
    keywords: ["blog", "article", "web copy", "website copy", "about us", "about page", "faq", "service description", "long-form", "write a post"],
    strong_signals: ["blog post", "about us page", "service description"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "{format} — {topic}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const format = (params.format as ContentFormat) || deriveFormat(ownerAsk);
    const topic = params.topic?.trim() || topicOf(ownerAsk) || "your business";
    const keywords = params.seo_keywords ?? [];

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const city = a.field("city");
    const industry = a.field("industry");
    const who = businessName ?? "We";
    const place = city ? ` in ${city}` : "";

    const local = (): string => {
      switch (format) {
        case "about":
          return (
            `## About ${businessName ?? "Us"}\n\n` +
            `${who}${place} ${industry ? `is a ${industry} business that ` : ""}takes pride in ${topic}. ` +
            `We focus on honest work, clear communication, and treating every customer like a neighbor. ` +
            `Whether it's your first visit or your fiftieth, you get the same care every time.`
          );
        case "faq":
          return (
            `## Frequently Asked Questions: ${topic}\n\n` +
            `**Q: What should I know about ${topic}?**\n\n` +
            `A: The short version — ${topic} protects your investment and saves money over time. ${who} can walk you through the specifics.\n\n` +
            `**Q: How do I get started?**\n\nA: Reach out${businessName ? ` to ${businessName}` : ""} and we'll take it from there.`
          );
        case "service description":
          return (
            `## ${capitalize(topic)}\n\n` +
            `${who} offer${who === "We" ? "" : "s"} ${topic}${place}, done right the first time. What's included:\n\n` +
            `- Thorough, professional work\n- Clear pricing with no surprises\n- A finish you'll be proud of\n\n` +
            `Ready to book? Get in touch and we'll find a time that works.`
          );
        default:
          return (
            `# ${capitalize(topic)}\n\n` +
            `If you've been wondering about ${topic}, you're not alone. ${who}${place} hear this a lot — so let's break it down.\n\n` +
            `## Why it matters\n\n${capitalize(topic)} isn't just a nice-to-have. Done well, it saves time, money, and headaches.\n\n` +
            `## What we recommend\n\nStart simple, stay consistent, and lean on people who do this every day.\n\n` +
            `## Ready to talk?\n\nReach out anytime — we're happy to help.`
          );
      }
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft long-form ${format} content on the REPORT channel (full markdown allowed) for ${businessName ?? "the business"}. ` +
      `Be helpful and specific; write in the business's voice. Do not invent facts you don't have.` +
      (keywords.length ? ` Work these keywords in naturally: ${keywords.join(", ")}.` : "");
    const prompt = `Format: ${format}. Topic: ${topic}. ${params.audience ? `Audience: ${params.audience}.` : ""}`;

    await emitTrace.work("compose_content", `format=${format}, topic="${topic}"`);
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }
    if (keywords.length) a.note(`I worked your keywords (${keywords.join(", ")}) in where they read naturally.`);

    return {
      draft: {
        title: `${capitalize(format)} — ${topic}`,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { format, topic, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
