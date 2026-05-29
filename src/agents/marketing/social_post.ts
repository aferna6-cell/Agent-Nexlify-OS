import type { AgentDefinition } from "../../types.js";
import { AgentScratch, bool, finishDraft, optStr, result, str } from "../base.js";

type Platform = "facebook" | "instagram" | "linkedin" | "x";

/**
 * Social Post (social_post) — marketing · new (migration) · P2.
 *
 * Drafts a single platform-aware social media post. Channel is `post` →
 * plain-text formatting (no markdown), with platform-appropriate length.
 */
export const socialPost: AgentDefinition = {
  agent_id: "social_post",
  display_name: "Social Post",
  bucket: "marketing",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts a single platform-aware social media post or short thread.",
  routing: {
    routes_here_when: [
      "Owner asks for a social post or caption",
      "Campaign agent delegates the social variant of a campaign here",
    ],
    keywords: [
      "social post",
      "social media",
      "caption",
      "facebook post",
      "instagram",
      "linkedin",
      "tweet",
      "post for",
      "ig post",
      "fb post",
    ],
    strong_signals: ["social post", "instagram caption", "facebook post"],
  },
  channel: "post",
  inputs: {
    from_owner: [
      { name: "topic", type: "string", required: true, description: "What the post is about." },
      { name: "platform", type: "string", required: false, description: "Platform.", default: "facebook" },
      { name: "tone_hint", type: "string", required: false, description: "Tone." },
      { name: "length_hint", type: "string", required: false, description: "Length." },
      { name: "hashtags_wanted", type: "boolean", required: false, description: "Add hashtags?", default: false },
      { name: "cta", type: "string", required: false, description: "Call to action." },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true },
  outputs: {
    title_format: "Social post ({platform}) — {topic}",
    body_format: "Platform-appropriate length, plain text. Hashtags only if requested.",
    metadata: ["platform", "topic"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile for voice + facts." },
    { name: "Compose post", kind: "work", description: "Write a platform-appropriate post." },
  ],
  example_interactions: [
    {
      owner_ask: "Write a Facebook post about our weekend detailing special.",
      expected_route: "social_post",
      expected_output_excerpt: "weekend",
    },
    {
      owner_ask: "Instagram caption for a before/after photo of a paint correction.",
      expected_route: "social_post",
      expected_output_excerpt: "before",
    },
    {
      owner_ask: "LinkedIn post announcing we're hiring a detailer.",
      expected_route: "social_post",
      expected_output_excerpt: "hiring",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const topic = str(input, "topic", input.ownerAsk);
    const platform = normalizePlatform(str(input, "platform", "facebook"));
    const wantHashtags = bool(input, "hashtags_wanted", false);
    const cta = optStr(input, "cta") ?? "Message us or call to book.";
    const businessName = s.field("business_name");
    const city = s.field("city");

    s.trace.work("Compose post", `platform=${platform}, topic="${topic}"`);

    const brand = businessName ? `${businessName}` : "";
    const place = city ? ` here in ${city}` : "";
    let body: string;
    switch (platform) {
      case "x":
        body = trimTo(`${capitalize(topic)}${place}. ${cta}`, 280);
        break;
      case "linkedin":
        body =
          `${capitalize(topic)}.\n\n` +
          `${brand ? `At ${brand}, we` : "We"} believe in doing this right${place}. ` +
          `If that resonates, let's connect.\n\n${cta}`;
        break;
      case "instagram":
      case "facebook":
      default:
        body =
          `${capitalize(topic)}! ${brand ? `${brand} has you covered${place}. ` : ""}${cta}`;
    }

    if (wantHashtags) {
      const tags = buildHashtags(topic, city);
      body += `\n\n${tags}`;
    }

    const draft = finishDraft({
      title: `Social post (${platform}) — ${topic}`,
      body,
      channel: "post",
      metadata: { platform, topic },
      requiresApproval: true,
    });
    return result(socialPost, s, draft);
  },
};

function normalizePlatform(raw: string): Platform {
  const p = raw.toLowerCase();
  if (p.includes("insta") || p === "ig") return "instagram";
  if (p.includes("linkedin")) return "linkedin";
  if (p === "x" || p.includes("twitter") || p.includes("tweet")) return "x";
  return "facebook";
}

function buildHashtags(topic: string, city?: string): string {
  const words = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 2)
    .map((w) => `#${w}`);
  if (city) words.push(`#${city.replace(/\s+/g, "")}`);
  return words.join(" ");
}

function trimTo(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
