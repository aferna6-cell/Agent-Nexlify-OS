import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, optStr, result, str } from "../base.js";
import { resolveField, type BusinessProfile } from "../../profile.js";

/**
 * Review Request (review_request) — reputation · new (migration) · P2.
 *
 * Drafts a short, warm post-service review-request message with a link. SMS
 * channel → plain text. Honest behaviour: if no review link is configured, it
 * does NOT fabricate one — it surfaces the gap to the orchestrator and asks the
 * owner to add it.
 */
export const reviewRequest: AgentDefinition = {
  agent_id: "review_request",
  display_name: "Review Request",
  bucket: "reputation",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts a short, warm post-service review-request message.",
  routing: {
    routes_here_when: [
      "Owner asks to send a review request to a specific recent customer",
      "(Phase 4) Event: appointment marked complete → fires 24h later",
    ],
    keywords: ["review", "leave a review", "google review", "yelp", "rating", "feedback", "testimonial"],
    strong_signals: ["ask for a review", "review request", "request a review"],
  },
  channel: "sms",
  alternate_channels: ["email"],
  inputs: {
    from_owner: [
      { name: "customer_name", type: "string", required: false, description: "Customer's name." },
      { name: "service_completed", type: "string", required: false, description: "Service performed." },
      { name: "service_date", type: "date", required: false, description: "When service was done." },
      {
        name: "platform_preference",
        type: "string",
        required: false,
        description: "Google / Yelp / Facebook.",
        default: "Google",
      },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: {
    default: "drafts_only",
    configurable_phase_4: {
      require_owner_approval: true,
      recipient_filter: "completed_service_only",
      send_caps: { notes: ["1 per customer per 90 days (hardcoded)"] },
    },
  },
  triggers_supported: { manual: true, event_based: ["appointment_completed"] },
  outputs: {
    title_format: "SMS to {customer_name} — review request for {service}",
    body_format: "Short, warm, asks for the review with a link. Plain text.",
    metadata: ["platform", "has_link"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile (incl. review links)." },
    { name: "Review link", kind: "load", description: "Resolve the configured review link." },
    { name: "Compose request", kind: "work", description: "Write the review request." },
  ],
  example_interactions: [
    {
      owner_ask: "Ask Maria for a Google review after her detail yesterday.",
      expected_route: "review_request",
      expected_output_excerpt: "review",
    },
    {
      owner_ask: "Send Jake a review request for his brake job.",
      expected_route: "review_request",
      expected_output_excerpt: "Jake",
    },
    {
      owner_ask: "Request a review from Dana for last week's service.",
      expected_route: "review_request",
      expected_output_excerpt: "review",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const customerName = optStr(input, "customer_name");
    const service = optStr(input, "service_completed");
    const platform = str(input, "platform_preference", "Google");

    const linkField = reviewLinkField(platform);
    const link = resolveField(ctx.business_profile, linkField).value;
    s.trace.load(
      "Review link",
      link,
      (d) => `${platform} review link on file`,
      `no ${platform} review link configured — asking owner to add one rather than inventing it`,
    );

    const signoff = s.signoff();
    const businessName = s.field("business_name");
    const name = customerName ?? "there";
    const serviceClause = service ? ` with your ${service}` : "";

    let body =
      `Hi ${name}, thanks so much for choosing ${businessName ?? "us"}! If you were happy${serviceClause}, ` +
      `a quick ${platform} review would mean the world to us`;
    if (link) {
      body += `: ${link}`;
    } else {
      body += `. I'll send over the link to make it easy.`;
      s.note(
        `I don't have your ${platform} review link saved, so I left a placeholder-free version that promises the link. Add your ${platform} review link to your profile and I'll drop it right into the message.`,
      );
    }
    body += " Thanks again!";
    if (signoff) body += ` — ${signoff}`;

    const draft = finishDraft({
      title: `SMS to ${customerName ?? "customer"} — review request${service ? ` for ${service}` : ""}`,
      body,
      channel: "sms",
      metadata: { platform, has_link: Boolean(link) },
      requiresApproval: true,
    });
    return result(reviewRequest, s, draft);
  },
};

function reviewLinkField(platform: string): keyof BusinessProfile {
  const p = platform.toLowerCase();
  if (p.includes("yelp")) return "review_link_yelp";
  if (p.includes("face")) return "review_link_facebook";
  return "review_link_google";
}
