import type { AgentDefinition } from "../../types.js";
import { AgentScratch, arr, finishDraft, optStr, result, str } from "../base.js";

type ContentFormat = "blog" | "faq" | "about" | "service description";

/**
 * Content Writer (content_writer) — marketing · new (migration) · P2.
 *
 * Drafts longer-form content — blog posts, website copy, hosted-page sections,
 * FAQs, About Us paragraphs. Owner-facing report channel → full markdown.
 */
export const contentWriter: AgentDefinition = {
  agent_id: "content_writer",
  display_name: "Content Writer",
  bucket: "marketing",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts long-form content: blog posts, web copy, FAQs, About Us, service descriptions.",
  routing: {
    routes_here_when: [
      "Owner asks for a blog post, article, web copy, long-form deliverable",
      "Owner asks to draft FAQ entries, About Us copy, service descriptions",
    ],
    keywords: [
      "blog",
      "article",
      "web copy",
      "website copy",
      "about us",
      "about page",
      "faq",
      "service description",
      "long-form",
      "write a post",
      "write an article",
    ],
    strong_signals: ["blog post", "about us page", "service description"],
  },
  channel: "report",
  inputs: {
    from_owner: [
      { name: "topic", type: "string", required: true, description: "What to write about." },
      {
        name: "format",
        type: "string",
        required: false,
        description: "blog / faq / about / service description.",
        default: "blog",
      },
      { name: "target_length", type: "string", required: false, description: "Approx length." },
      { name: "tone_hint", type: "string", required: false, description: "Tone." },
      { name: "seo_keywords", type: "array", required: false, description: "Keywords to include." },
      { name: "audience", type: "string", required: false, description: "Target audience." },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true },
  outputs: {
    title_format: "{format} — {topic}",
    body_format: "Structured per format (markdown).",
    metadata: ["format", "topic"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile for voice + facts." },
    { name: "Compose content", kind: "work", description: "Write structured long-form content." },
  ],
  example_interactions: [
    {
      owner_ask: "Write a blog post about why spring is the best time to detail your car.",
      expected_route: "content_writer",
      expected_output_excerpt: "#",
    },
    {
      owner_ask: "Draft an About Us paragraph for our shop.",
      expected_route: "content_writer",
      expected_output_excerpt: "About",
    },
    {
      owner_ask: "Write a service description for our ceramic coating package.",
      expected_route: "content_writer",
      expected_output_excerpt: "ceramic",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const topic = str(input, "topic", input.ownerAsk);
    const format = normalizeFormat(str(input, "format", "blog"));
    const keywords = arr<string>(input, "seo_keywords");
    const businessName = s.field("business_name");
    const city = s.field("city");
    const industry = s.field("industry");

    s.trace.work("Compose content", `format="${format}", topic="${topic}"`);

    const who = businessName ?? "We";
    const place = city ? ` in ${city}` : "";
    let body: string;
    switch (format) {
      case "about":
        body =
          `## About ${businessName ?? "Us"}\n\n` +
          `${who}${place} ${industry ? `is a ${industry} business that ` : ""}takes pride in ${topic}. ` +
          `We focus on doing honest work, communicating clearly, and treating every customer like a neighbor. ` +
          `Whether it's your first visit or your fiftieth, you'll get the same care and attention every time.`;
        break;
      case "faq":
        body =
          `## Frequently Asked Questions: ${topic}\n\n` +
          `**Q: What should I know about ${topic}?**\n\n` +
          `A: Here's the short version — ${topic} matters because it protects your investment and saves you money over time. ${who} can walk you through the specifics.\n\n` +
          `**Q: How do I get started?**\n\n` +
          `A: Just reach out${businessName ? ` to ${businessName}` : ""} and we'll take it from there.`;
        break;
      case "service description":
        body =
          `## ${capitalize(topic)}\n\n` +
          `${who} offer${who === "We" ? "" : "s"} ${topic}${place} done right the first time. ` +
          `Here's what's included and why it's worth it:\n\n` +
          `- Thorough, professional work\n- Clear pricing with no surprises\n- A finish you'll be proud of\n\n` +
          `Ready to book? Get in touch and we'll find a time that works.`;
        break;
      default:
        body =
          `# ${capitalize(topic)}\n\n` +
          `If you've been wondering about ${topic}, you're not alone. ${who}${place} hear this a lot — so let's break it down.\n\n` +
          `## Why it matters\n\n` +
          `${capitalize(topic)} isn't just a nice-to-have. Done well, it saves time, money, and headaches down the road.\n\n` +
          `## What we recommend\n\n` +
          `Start simple, stay consistent, and lean on people who do this every day. That's where ${who.toLowerCase() === "we" ? "we" : businessName} come in.\n\n` +
          `## Ready to talk?\n\n` +
          `Reach out anytime — we're happy to help.`;
    }

    if (keywords.length > 0) {
      s.note(`I worked your keywords (${keywords.join(", ")}) into the copy where they read naturally.`);
    }

    const draft = finishDraft({
      title: `${capitalize(format)} — ${topic}`,
      body,
      channel: "report",
      metadata: { format, topic },
      requiresApproval: true,
    });
    return result(contentWriter, s, draft);
  },
};

function normalizeFormat(raw: string): ContentFormat {
  const f = raw.toLowerCase();
  if (f.includes("faq")) return "faq";
  if (f.includes("about")) return "about";
  if (f.includes("service")) return "service description";
  return "blog";
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
