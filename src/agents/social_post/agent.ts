import { defineStub } from "../_stub.js";

export const socialPost = defineStub({
  agent_id: "social_post",
  display_name: "Social Post",
  bucket: "marketing",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts a single platform-aware social media post or short thread.",
  channel: "post",
  routes_here_when: [
    "Owner asks for a social post or caption",
    "Campaign agent delegates the social variant of a campaign here",
  ],
  keywords: ["social post", "social media", "caption", "facebook post", "instagram", "linkedin", "tweet", "post for", "ig post", "fb post"],
  strong_signals: ["social post", "instagram caption", "facebook post"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual"],
  output_format: { title_template: "Social post ({platform}) — {topic}", body_constraints: { no_markdown: true } },
  examples: [
    { owner_ask: "Write a Facebook post about our weekend detailing special.", expected_route: "social_post", expected_output_excerpt: "weekend" },
    { owner_ask: "Instagram caption for a before/after paint correction photo.", expected_route: "social_post", expected_output_excerpt: "before" },
    { owner_ask: "LinkedIn post announcing we're hiring a detailer.", expected_route: "social_post", expected_output_excerpt: "hiring" },
  ],
});
