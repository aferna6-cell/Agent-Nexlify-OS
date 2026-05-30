import { defineStub } from "../_stub.js";

export const campaign = defineStub({
  agent_id: "campaign",
  display_name: "Campaign",
  bucket: "marketing",
  status: "existing",
  build_priority: "P1",
  purpose: "Drafts marketing campaigns — promotions, announcements, seasonal offers, email blasts, short SMS campaigns.",
  channel: "email",
  routes_here_when: [
    "Owner asks for a campaign / email blast / promo announcement",
    "Owner asks for subject line + body for a marketing send",
  ],
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
  examples: [
    { owner_ask: "Email blast for $59 spring detail special, ends May 31. Keep it short.", expected_route: "campaign", expected_output_excerpt: "Subject" },
    { owner_ask: "Write a promo announcement for 20% off oil changes this month.", expected_route: "campaign", expected_output_excerpt: "Subject" },
    { owner_ask: "Draft an email campaign announcing our new mobile service.", expected_route: "campaign", expected_output_excerpt: "Preheader" },
  ],
});
