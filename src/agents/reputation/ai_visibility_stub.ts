import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, optStr, result } from "../base.js";

/**
 * AI Visibility (ai_visibility_stub) — reputation · stub · P3.
 *
 * Acknowledges the feature exists, returns an honest placeholder report
 * explaining we're tracking how AI search engines describe the business, and
 * notes full results come later. Captures interested-owner signal for the v2
 * beta. Marketing note: do not price upgrade tiers on this feature until the
 * real version ships.
 */
export const aiVisibilityStub: AgentDefinition = {
  agent_id: "ai_visibility_stub",
  display_name: "AI Visibility",
  bucket: "reputation",
  status: "stub",
  build_priority: "P3",
  purpose:
    "Returns an honest placeholder report about AI search visibility and captures interest for the v2 beta.",
  routing: {
    routes_here_when: [
      "Owner asks about AI visibility / GEO score / how ChatGPT or LLMs see their business",
    ],
    keywords: ["ai visibility", "geo score", "chatgpt", "llm", "ai search", "how does ai see", "generative search"],
    strong_signals: ["ai visibility", "geo score", "how does chatgpt see my business"],
  },
  channel: "report",
  inputs: {
    from_owner: [{ name: "query", type: "string", required: false, description: "Optional question." }],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true },
  outputs: {
    title_format: "AI Visibility — {business_name}",
    body_format: "Short placeholder honestly explaining state. Tags interested owner for v2 beta.",
    metadata: ["beta_interest", "business_name"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Capture beta interest", kind: "work", description: "Tag the owner as interested in the v2 beta." },
  ],
  example_interactions: [
    {
      owner_ask: "What's my GEO score?",
      expected_route: "ai_visibility_stub",
      expected_output_excerpt: "early access",
    },
    {
      owner_ask: "How does ChatGPT describe my business?",
      expected_route: "ai_visibility_stub",
      expected_output_excerpt: "AI search",
    },
    {
      owner_ask: "Can you check my AI visibility?",
      expected_route: "ai_visibility_stub",
      expected_output_excerpt: "coming",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const businessName = s.field("business_name");
    s.trace.work("Capture beta interest", "tagged owner as interested in the AI Visibility v2 beta");
    s.note("I've noted your interest in AI Visibility — you'll be first in line when the full version ships.");

    const who = businessName ?? "your business";
    const body =
      `# AI Visibility — ${who}\n\n` +
      `**This feature is in early access.** We're building the ability to track how AI search engines ` +
      `(ChatGPT, Gemini, Perplexity, and others) describe ${who} when customers ask about businesses like yours.\n\n` +
      `Right now there's no score to report yet — and I won't invent one. Here's the honest state:\n\n` +
      `- ✅ Your interest is logged for the v2 beta.\n` +
      `- 🚧 Full GEO-score tracking is coming in a later release.\n` +
      `- 📋 In the meantime, the strongest signal you can build is a complete, consistent profile across the web ` +
      `(Google Business Profile, your website, and reviews) — that's what these AI engines read from.\n\n` +
      `I'll let you know the moment full results are available.`;

    const draft = finishDraft({
      title: `AI Visibility — ${who}`,
      body,
      channel: "report",
      metadata: { beta_interest: true, business_name: businessName ?? null },
      requiresApproval: true,
    });
    return result(aiVisibilityStub, s, draft);
  },
};
