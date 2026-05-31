import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  campaign_name: z.string().optional(),
  audience: z.string().optional(),
  offer_details: z.string().optional(),
  length_hint: z.string().optional(),
  emoji_density: z.string().optional(),
  want_social_variant: z.boolean().optional(),
});

function extractPrice(text: string): string | undefined {
  const m = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?/);
  if (m) return m[0].replace(/\s/g, "");
  const pct = text.match(/\d+%/);
  return pct ? pct[0] : undefined;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function cleanOffer(ask: string): string {
  return ask
    .replace(/^\s*(?:write|draft|create|send|make)?\s*(?:me\s+)?(?:an?\s+)?(?:email\s+)?(?:blast|campaign|promo(?:tion)?|announcement|email)\s*(?:for|about|announcing)?\s*/i, "")
    .replace(/\.?\s*keep it (short|brief|concise).*/i, "")
    .trim();
}

export const campaign = defineAgent(
  {
    agent_id: "campaign",
    display_name: "Campaign",
    bucket: "marketing",
    status: "existing",
    build_priority: "P1",
    purpose: "Drafts marketing campaigns — promotions, announcements, seasonal offers, email blasts, short SMS campaigns.",
    channel: "email",
    routes_here_when: ["Owner asks for a campaign / email blast / promo announcement", "Owner asks for subject line + body for a marketing send"],
    keywords: ["campaign", "email blast", "blast", "promo", "promotion", "announcement", "special", "offer", "sale", "subject line"],
    strong_signals: ["email blast", "marketing campaign", "promo announcement"],
    shared_context_needed: ["business_profile", "pipeline_state"],
    tool_dependencies: ["none"],
    permission_scope: {
      default: "drafts_only",
      require_owner_approval: true,
      recipient_filter: "existing_customers_only",
      send_caps: { notes: ["hard cap on broadcast sends per day"] },
    },
    triggers_supported: ["manual", "scheduled"],
    output_format: { title_template: "Email blast — {campaign}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};

    const offer = params.offer_details?.trim() || cleanOffer(ownerAsk);
    const lengthHint = (params.length_hint ?? "").toLowerCase() || ownerAsk.toLowerCase();
    const keepShort = /\b(short|brief|concise|quick)\b/.test(lengthHint);
    const emojiDensity = (params.emoji_density ?? "low").toLowerCase(); // QA: default low
    const wantSocial = params.want_social_variant ?? /\bsocial\b/.test(ownerAsk.toLowerCase()); // QA: only if asked
    const price = extractPrice(offer || ownerAsk);
    const campaignName = params.campaign_name?.trim() || offer || "our latest offer";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });
    await emitTrace.emit("load_audience", {
      description: `${context.pipelineLeads.length} contacts available for sizing`,
      data: context.pipelineLeads,
    });

    const businessName = a.field("businessName");
    const signoff = a.signoff();
    const emoji = emojiDensity === "high" ? "🎉 " : ""; // QA: low/none default → no emoji
    // QA: front-load price, <=30 chars (don't repeat the price if the name already leads with it)
    const subject = truncate(
      price && !campaignName.toLowerCase().startsWith(price.toLowerCase()) ? `${price}: ${campaignName}` : campaignName,
      30,
    );
    const preheader = truncate(offer || "A little something for our customers", 80);

    const local = (): string => {
      const opener = businessName ? `Hi from ${businessName}!` : "Hi there!";
      const offerLine = offer || "We've got something we think you'll like.";
      const cta = "Reply or give us a call to claim it.";
      const sig = signoff ? `\n\n— ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}` : "";
      let body = keepShort
        ? `**Subject:** ${emoji}${subject}\n**Preheader:** ${preheader}\n\n${opener} ${offerLine} ${cta}${sig}`
        : `**Subject:** ${emoji}${subject}\n**Preheader:** ${preheader}\n\n${opener}\n\n${offerLine}\n\n${cta}${sig}`;
      if (wantSocial) body += `\n\n---\n\n**Social variant:**\n${offerLine} ${cta}`;
      return body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a marketing email campaign on the EMAIL channel (markdown allowed). Output a subject line, a ` +
      `preheader, and the body. FRONT-LOAD the price/offer in the subject and keep the subject <= 30 characters ` +
      `(mobile inboxes clip after ~30). Emoji density: ${emojiDensity} (default low — do not over-use emoji). ` +
      `${keepShort ? "Keep it SHORT — do not add unrequested deliverables." : ""} ` +
      `${wantSocial ? "Include a short social variant." : "Do NOT include a social variant unless asked."}` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Offer: ${offer || ownerAsk}. Audience: ${params.audience ?? "existing customers"}.`;

    await emitTrace.work("compose_campaign", `email draft, short=${keepShort}, emoji=${emojiDensity}, social=${wantSocial}`);
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Email blast — ${campaignName}${price ? ` (${price})` : ""}`,
        body: finishBody("email", generated.text),
        channel: "email",
        metadata: { campaign_name: campaignName, keep_short: keepShort, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
