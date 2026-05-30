import { defineStub } from "../_stub.js";

export const aiVisibilityStub = defineStub({
  agent_id: "ai_visibility_stub",
  display_name: "AI Visibility",
  bucket: "reputation",
  status: "stub",
  build_priority: "P3",
  purpose: "Returns an honest placeholder about AI search visibility and captures interest for the v2 beta.",
  channel: "report",
  routes_here_when: ["Owner asks about AI visibility / GEO score / how ChatGPT or LLMs see their business"],
  keywords: ["ai visibility", "geo score", "chatgpt", "llm", "ai search", "how does ai see", "generative search"],
  strong_signals: ["ai visibility", "geo score", "how does chatgpt see my business"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual"],
  output_format: { title_template: "AI Visibility — {business}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "What's my GEO score?", expected_route: "ai_visibility_stub", expected_output_excerpt: "early access" },
    { owner_ask: "How does ChatGPT describe my business?", expected_route: "ai_visibility_stub", expected_output_excerpt: "AI search" },
    { owner_ask: "Can you check my AI visibility?", expected_route: "ai_visibility_stub", expected_output_excerpt: "coming" },
  ],
});
