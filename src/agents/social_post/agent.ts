import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  topic: z.string().optional(),
  platform: z.string().optional(),
  tone_hint: z.string().optional(),
  hashtags_wanted: z.boolean().optional(),
  cta: z.string().optional(),
});

type Platform = "facebook" | "instagram" | "linkedin" | "x";

function derivePlatform(ask: string): Platform {
  const a = ask.toLowerCase();
  if (a.includes("insta")) return "instagram";
  if (a.includes("linkedin")) return "linkedin";
  if (a.includes("twitter") || a.includes("tweet") || /\bx\b/.test(a)) return "x";
  return "facebook";
}

function topicOf(ask: string): string {
  return ask
    .replace(/^(write|draft|create|make|compose)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/^(facebook|instagram|linkedin|fb|ig|x|twitter)?\s*(post|caption|tweet|thread)\s*(about|for|on|announcing)?\s*/i, "")
    .trim();
}

function capitalize(t: string): string {
  return t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1);
}

export const socialPost = defineAgent(
  {
    agent_id: "social_post",
    display_name: "Social Post",
    bucket: "marketing",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a single platform-aware social media post or short thread.",
    channel: "post",
    routes_here_when: ["Owner asks for a social post or caption", "Campaign agent delegates the social variant of a campaign here"],
    keywords: ["social post", "social media", "caption", "facebook post", "instagram", "linkedin", "tweet", "post for", "ig post", "fb post"],
    strong_signals: ["social post", "instagram caption", "facebook post"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "Social post ({platform}) — {topic}", body_constraints: { no_markdown: true } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const platform = (params.platform as Platform) || derivePlatform(ownerAsk);
    const topic = params.topic?.trim() || topicOf(ownerAsk) || "what's new";
    const wantHashtags = params.hashtags_wanted ?? false;
    const cta = params.cta?.trim() || "Message us or call to book.";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const city = a.field("city");
    const brand = businessName ?? "";
    const place = city ? ` here in ${city}` : "";

    const local = (): string => {
      let body: string;
      switch (platform) {
        case "x":
          body = `${capitalize(topic)}${place}. ${cta}`.slice(0, 280);
          break;
        case "linkedin":
          body = `${capitalize(topic)}.\n\n${brand ? `At ${brand}, we` : "We"} believe in doing this right${place}. If that resonates, let's connect.\n\n${cta}`;
          break;
        default:
          body = `${capitalize(topic)}! ${brand ? `${brand} has you covered${place}. ` : ""}${cta}`;
      }
      if (wantHashtags) {
        const tags = topic.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 2).map((w) => `#${w}`);
        if (city) tags.push(`#${city.replace(/\s+/g, "")}`);
        body += `\n\n${tags.join(" ")}`;
      }
      return body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft ONE ${platform} post on the POST channel: plain text only, no markdown. ` +
      `Platform-appropriate length (FB/IG ~200–500 chars, LinkedIn 1–3 short paragraphs, X <=280). ` +
      `${wantHashtags ? "Include a few relevant hashtags." : "Do not add hashtags unless asked."} ` +
      `End with the call to action.`;
    const prompt = `Platform: ${platform}. Topic: ${topic}. CTA: ${cta}.`;

    await emitTrace.work("compose_post", `platform=${platform}, topic="${topic}"`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 300 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Social post (${platform}) — ${topic}`,
        body: finishBody("post", generated.text),
        channel: "post",
        metadata: { platform, topic, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
