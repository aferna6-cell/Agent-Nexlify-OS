import { defineStub } from "../_stub.js";

export const contentWriter = defineStub({
  agent_id: "content_writer",
  display_name: "Content Writer",
  bucket: "marketing",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts long-form content: blog posts, web copy, FAQs, About Us, service descriptions.",
  channel: "report",
  routes_here_when: [
    "Owner asks for a blog post, article, web copy, long-form deliverable",
    "Owner asks to draft FAQ entries, About Us copy, service descriptions",
  ],
  keywords: ["blog", "article", "web copy", "website copy", "about us", "about page", "faq", "service description", "long-form", "write a post"],
  strong_signals: ["blog post", "about us page", "service description"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual"],
  output_format: { title_template: "{format} — {topic}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Write a blog post about why spring is the best time to detail your car.", expected_route: "content_writer", expected_output_excerpt: "spring" },
    { owner_ask: "Draft an About Us paragraph for our shop.", expected_route: "content_writer", expected_output_excerpt: "About" },
    { owner_ask: "Write a service description for our ceramic coating package.", expected_route: "content_writer", expected_output_excerpt: "ceramic" },
  ],
});
