import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { db } from "../../lib/db.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({ query: z.string().optional() });

export const aiVisibilityStub = defineAgent(
  {
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
    examples,
  },
  async ({ context, emitTrace, userId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    // Tag the owner record for the future beta invite.
    let tagged = false;
    if (userId) {
      try {
        await db.user.update({ where: { id: userId }, data: { aiVisibilityInterest: true } });
        tagged = true;
      } catch {
        // tagging is best-effort; never block the draft
      }
    }
    await emitTrace.work("capture_beta_interest", tagged ? "Tagged owner record: ai_visibility_interest = true" : "Noted interest in the AI Visibility v2 beta");
    a.note("I've noted your interest in AI Visibility — you'll be first in line when the full version ships.");

    const businessName = a.field("businessName");
    const who = businessName ?? "your business";

    // This is a stub: a fixed, honest placeholder. No model call — no invented score.
    const body =
      `# AI Visibility — ${who}\n\n` +
      `**This feature is in early access.** We're building the ability to track how AI search engines ` +
      `(ChatGPT, Gemini, Perplexity, and others) describe ${who} when customers ask about businesses like yours.\n\n` +
      `There's no score to report yet — and I won't invent one. The honest state:\n\n` +
      `- ✅ Your interest is logged for the v2 beta.\n` +
      `- 🚧 Full GEO-score tracking is coming in a later release.\n` +
      `- 📋 In the meantime, the strongest signal you can build is a complete, consistent presence across the web ` +
      `(Google Business Profile, your website, and reviews) — that's what these AI engines read from.\n\n` +
      `I'll let you know the moment full results are available.`;

    return {
      draft: {
        title: `AI Visibility — ${who}`,
        body: finishBody("report", body),
        channel: "report",
        metadata: { beta_interest: true, tagged, business_name: businessName ?? null, cost_usd: 0 },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
