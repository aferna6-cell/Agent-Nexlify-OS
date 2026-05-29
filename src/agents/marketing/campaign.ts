import type { AgentDefinition } from "../../types.js";
import { AgentScratch, bool, finishDraft, optStr, result, str } from "../base.js";

/**
 * Campaign (campaign) — marketing · existing · P1.
 *
 * Drafts marketing campaigns — promotions, announcements, seasonal offers, email
 * blasts, short SMS campaigns. QA fixes: front-load price/$ in the subject line
 * (mobile inboxes clip ~30 chars), respect "keep it short" (no unrequested
 * deliverables), emoji density is a parameter defaulting low, and real business
 * name in the signoff.
 */
export const campaign: AgentDefinition = {
  agent_id: "campaign",
  display_name: "Campaign",
  bucket: "marketing",
  status: "existing",
  build_priority: "P1",
  purpose:
    "Drafts marketing campaigns — promotions, announcements, seasonal offers, email blasts and short SMS campaigns.",
  routing: {
    routes_here_when: [
      "Owner asks for a campaign / email blast / promo announcement",
      "Owner asks for subject line + body for a marketing send",
    ],
    keywords: [
      "campaign",
      "email blast",
      "blast",
      "promo",
      "promotion",
      "announcement",
      "special",
      "offer",
      "sale",
      "subject line",
      "marketing email",
    ],
    strong_signals: ["email blast", "marketing campaign", "promo announcement"],
  },
  channel: "email",
  alternate_channels: ["sms"],
  inputs: {
    from_owner: [
      { name: "campaign_name", type: "string", required: false, description: "Name of the campaign." },
      { name: "audience", type: "string", required: false, description: "existing / new / all.", default: "existing customers" },
      { name: "offer_details", type: "string", required: false, description: "Price, dates, eligibility." },
      { name: "tone_hint", type: "string", required: false, description: "Tone." },
      { name: "length_hint", type: "string", required: false, description: "e.g. 'keep it short'." },
      {
        name: "emoji_density",
        type: "string",
        required: false,
        description: "none / low / high.",
        default: "low",
      },
      {
        name: "want_social_variant",
        type: "boolean",
        required: false,
        description: "Only add a social variant if requested.",
        default: false,
      },
    ],
    from_shared_context: ["business_profile", "pipeline_state"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    configurable_phase_4: {
      require_owner_approval: true,
      recipient_filter: "existing_customers_only",
      send_caps: { notes: ["hard cap on broadcast sends per day"] },
    },
  },
  triggers_supported: { manual: true, scheduled: [] },
  outputs: {
    title_format: "Email blast — {campaign_name} ({offer_summary})",
    body_format:
      "Subject (≤30 chars, price front-loaded), preheader, email body. Social variant only if requested.",
    metadata: ["campaign_name", "audience", "channel"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Audience sizing", kind: "load", description: "Size the audience from pipeline state." },
    { name: "Compose campaign", kind: "work", description: "Write subject, preheader, body." },
  ],
  example_interactions: [
    {
      owner_ask: "Email blast for $59 spring detail special, ends May 31. Keep it short.",
      expected_route: "campaign",
      expected_output_excerpt: "$59",
    },
    {
      owner_ask: "Write a promo announcement for 20% off oil changes this month.",
      expected_route: "campaign",
      expected_output_excerpt: "Subject",
    },
    {
      owner_ask: "Draft an email campaign announcing our new mobile service.",
      expected_route: "campaign",
      expected_output_excerpt: "Preheader",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const audience = str(input, "audience", "existing customers");
    const offer = optStr(input, "offer_details");
    const lengthHint = optStr(input, "length_hint")?.toLowerCase() ?? "";
    const keepShort = /short|brief|quick|concise/.test(lengthHint);
    const emojiDensity = str(input, "emoji_density", "low");
    const wantSocial = bool(input, "want_social_variant", false);
    const campaignName = str(input, "campaign_name", offer ?? "our latest offer");

    // Audience sizing from pipeline state (honest: only if we have leads).
    const audienceLeads = ctx.pipeline_state.leads;
    s.trace.loadOrSkip(
      "Audience sizing",
      audienceLeads,
      (d) => `${(d as unknown[]).length} contacts available for "${audience}"`,
    );

    const businessName = s.field("business_name");
    const signoff = s.signoff();
    const price = offer ? extractPrice(offer) : undefined;
    const emoji = emojiDensity === "high" ? "🎉 " : emojiDensity === "low" ? "" : "";

    // QA fix: front-load the price/$ in the subject; keep it ≤ ~30 chars.
    const subject = buildSubject(price, campaignName);
    const preheader = offer ? truncate(offer, 80) : "A little something for our customers";

    s.trace.work(
      "Compose campaign",
      `email draft, audience="${audience}", short=${keepShort}, emoji=${emojiDensity}`,
    );

    const opener = businessName ? `Hi from ${businessName}!` : "Hi there!";
    const offerLine = offer ? offer : "We've got something we think you'll like.";
    const cta = "Reply or give us a call to claim it.";
    const sig = signoff ? `\n\n— ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}` : "";

    let body = keepShort
      ? `**Subject:** ${emoji}${subject}\n**Preheader:** ${preheader}\n\n${opener} ${offerLine} ${cta}${sig}`
      : `**Subject:** ${emoji}${subject}\n**Preheader:** ${preheader}\n\n${opener}\n\n${offerLine}\n\n${cta}${sig}`;

    // QA fix: only add the social variant when the owner explicitly asked.
    if (wantSocial) {
      body += `\n\n---\n\n**Social variant:**\n${offerLine} ${cta}`;
    }

    const draft = finishDraft({
      title: `Email blast — ${campaignName}${price ? ` (${price})` : ""}`,
      body,
      channel: "email",
      metadata: { campaign_name: campaignName, audience, channel: "email" },
      requiresApproval: true,
    });
    return result(campaign, s, draft);
  },
};

function extractPrice(text: string): string | undefined {
  const m = text.match(/\$\s?\d[\d,]*(\.\d{2})?/);
  if (m) return m[0].replace(/\s/g, "");
  const pct = text.match(/\d+%/);
  return pct ? pct[0] : undefined;
}

function buildSubject(price: string | undefined, name: string): string {
  const base = price ? `${price}: ${name}` : name;
  return truncate(base, 30);
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}
