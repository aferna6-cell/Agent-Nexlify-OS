import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields, resolveField, firstName } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput, BusinessProfileData } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  customer_name: z.string().optional(),
  service_completed: z.string().optional(),
  service_date: z.string().optional(),
  platform: z.string().optional(),
  platform_preference: z.string().optional(),
});

function reviewLinkKey(platform: string): keyof BusinessProfileData {
  const p = platform.toLowerCase();
  if (p.includes("yelp")) return "reviewLinkYelp";
  if (p.includes("face")) return "reviewLinkFacebook";
  return "reviewLinkGoogle";
}

export const reviewRequest = defineAgent(
  {
    agent_id: "review_request",
    display_name: "Review Request",
    bucket: "reputation",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a short, warm post-service review-request message.",
    channel: "sms",
    routes_here_when: ["Owner asks to send a review request to a specific recent customer", "(Phase 4) Event: appointment marked complete → fires 24h later"],
    keywords: ["review", "leave a review", "google review", "yelp", "rating", "feedback", "testimonial"],
    strong_signals: ["ask for a review", "review request", "request a review"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: {
      default: "drafts_only",
      require_owner_approval: true,
      recipient_filter: "completed_service_only",
      send_caps: { notes: ["1 per customer per 90 days (hardcoded)"] },
    },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["appointment_completed"] },
    output_format: { title_template: "SMS to {customer} — review request", body_constraints: { no_markdown: true } },
    examples,
  },
  async ({ input, context, emitTrace, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const service = params.service_completed?.trim();
    const platform = params.platform_preference?.trim() || params.platform?.trim() || "Google";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const link = resolveField(context.businessProfile, reviewLinkKey(platform));
    const hasLink = await emitTrace.emit("load_review_link", {
      description: `${platform} review link on file`,
      data: link ?? null,
    });

    const businessName = a.field("businessName");
    const signoff = a.signoff();
    const name = firstName(customerName) ?? "there";
    const serviceClause = service ? ` with your ${service}` : "";

    if (!hasLink) {
      a.note(`I don't have your ${platform} review link saved, so I drafted a version that promises the link rather than inventing one. Add your ${platform} review link to your profile and I'll drop it right in.`);
    }

    const local = (): string => {
      let body = `Hi ${name}, thanks so much for choosing ${businessName ?? "us"}! If you were happy${serviceClause}, a quick ${platform} review would mean the world to us`;
      body += link ? `: ${link}` : `. I'll send over the link to make it easy.`;
      body += " Thanks again!";
      if (signoff) body += ` — ${signoff}`;
      return body;
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft ONE short, warm review-request SMS on the SMS channel: plain text only, no markdown. ` +
      (hasLink ? `Include the ${platform} review link exactly: ${link}.` : `You do NOT have a ${platform} review link — do NOT invent one; promise to send it.`) +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Customer: ${customerName ?? "(unknown)"}. Service: ${service ?? "(unspecified)"}. Platform: ${platform}.`;

    await emitTrace.work("compose_request", `platform=${platform}, has_link=${hasLink}`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 200 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `SMS to ${customerName ?? "customer"} — review request${service ? ` for ${service}` : ""}`,
        body: finishBody("sms", generated.text),
        channel: "sms",
        metadata: { platform, has_link: hasLink, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
