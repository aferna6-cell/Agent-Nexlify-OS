import { defineStub } from "../_stub.js";

export const seoRecommendations = defineStub({
  agent_id: "seo_recommendations",
  display_name: "SEO Recommendations",
  bucket: "marketing",
  status: "workaround",
  build_priority: "P3",
  purpose: "Returns generic SEO best-practice recommendations + basic on-page checks for the owner's URL. Not a full crawl.",
  channel: "report",
  routes_here_when: ["Owner asks for an SEO audit / SEO check / SEO recommendations"],
  keywords: ["seo", "search engine", "rank", "ranking", "google ranking", "meta tags", "keywords", "audit"],
  strong_signals: ["seo audit", "seo check", "seo recommendations", "improve my seo"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["seo_check"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual"],
  output_format: { title_template: "SEO recommendations — {domain}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Run an SEO audit on my site.", expected_route: "seo_recommendations", expected_output_excerpt: "Not checked yet" },
    { owner_ask: "Give me SEO recommendations for example.com.", expected_route: "seo_recommendations", expected_output_excerpt: "On-page" },
    { owner_ask: "How can I improve my Google ranking?", expected_route: "seo_recommendations", expected_output_excerpt: "recommendations" },
  ],
});
