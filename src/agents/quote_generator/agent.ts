import { defineStub } from "../_stub.js";

export const quoteGenerator = defineStub({
  agent_id: "quote_generator",
  display_name: "Quote Generator",
  bucket: "finance",
  status: "new",
  build_priority: "P2",
  purpose: "Drafts an itemized quote/estimate for a service the owner is proposing.",
  channel: "email",
  routes_here_when: ["Owner asks to draft a quote / estimate / proposal for a customer"],
  keywords: ["quote", "estimate", "proposal", "line items", "parts", "labor", "write up"],
  strong_signals: ["draft a quote", "write up an estimate", "make a proposal"],
  shared_context_needed: ["business_profile"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
  triggers_supported: ["manual"],
  output_format: { title_template: "Quote — {customer}, ${total}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Draft a quote for Mike — full brake job, parts $620, labor $480, net 15.", expected_route: "quote_generator", expected_output_excerpt: "$1,100" },
    { owner_ask: "Write up an estimate for Dana: ceramic coating $1,200, paint correction $600.", expected_route: "quote_generator", expected_output_excerpt: "Total" },
    { owner_ask: "Make a proposal for a monthly detailing plan at $150/month.", expected_route: "quote_generator", expected_output_excerpt: "Quote" },
  ],
});
