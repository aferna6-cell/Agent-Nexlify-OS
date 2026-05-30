import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody, money } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  customer_name: z.string().optional(),
  amount: z.coerce.number().optional(),
  quote_amount: z.coerce.number().optional(),
  quote_scope: z.string().optional(),
  quote_date: z.string().optional(),
  touch_count: z.coerce.number().optional(),
});

function scopeOf(ask: string): string | undefined {
  // The one or two words immediately before "quote" (e.g. "brake quote" → "brake").
  const m = ask.match(/\b([a-z]+(?:\s[a-z]+)?)\s+quote\b/i);
  const stop = new Set(["the", "her", "his", "their", "on", "a", "an", "this", "that", "your", "our"]);
  if (m && m[1]) {
    const words = m[1].trim().split(/\s+/).filter((w) => !stop.has(w.toLowerCase()));
    if (words.length) return words.join(" ");
  }
  return undefined;
}

export const quoteFollowUp = defineAgent(
  {
    agent_id: "quote_follow_up",
    display_name: "Quote Follow-up",
    bucket: "sales",
    status: "new",
    build_priority: "P2",
    purpose: "Follows up on a specific quote that hasn't been booked, with quote-specific framing.",
    channel: "sequence",
    routes_here_when: ["Owner asks to follow up on a specific quote that hasn't been booked", "(Phase 4) Event: quote sent → +3/+7/+14 days if no booking"],
    keywords: ["quote", "estimate", "proposal", "didn't book", "hasn't booked", "chase the quote"],
    strong_signals: ["follow up on the quote", "quote follow-up", "chase the quote"],
    shared_context_needed: ["business_profile", "pipeline_state"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true, recipient_filter: "existing_customers_only" },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["quote_sent_no_booking"] },
    output_format: { title_template: "Quote follow-up — {customer}, ${amount}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    // Look up the quote in pipeline state when the ask doesn't carry a $ amount.
    const lead = customerName
      ? context.pipelineLeads.find((l) => l.name.toLowerCase().includes(customerName.toLowerCase()) && l.quoteAmount)
      : undefined;
    const amount = params.quote_amount ?? params.amount ?? lead?.quoteAmount ?? 0;
    const scope = params.quote_scope?.trim() || lead?.subject || scopeOf(ownerAsk) || "the work we discussed";
    const touchCount = Math.min(Math.max(params.touch_count ?? 3, 1), 3);
    const name = customerName ?? "there";
    const amt = money(amount);

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });
    const leads = customerName ? context.pipelineLeads.filter((l) => l.name.toLowerCase().includes(customerName.toLowerCase()) && l.quoteAmount) : [];
    await emitTrace.emit("load_pipeline_state", { description: `Found ${leads.length} matching quote record(s)`, data: leads });

    const signoff = a.signoff();
    const sig = signoff ? `\n\n— ${signoff}` : "";

    const local = (): string => {
      const touches = [
        `**Touch 1 — Today (Email)**\nHi ${name}, just following up on the ${amt} quote for ${scope}. I wanted to make sure it reached you and answer any questions before it expires. Happy to walk through the details whenever works.${sig}`,
        `**Touch 2 — +7 days (Text)**\nHi ${name}, checking in on the ${amt} quote for ${scope}. If the timing or scope needs adjusting, just say the word — I'd rather tailor it than have it sit. Want to book a slot?${sig}`,
        `**Touch 3 — +14 days (Email)**\nHi ${name}, last note on the ${amt} quote for ${scope}. I'll keep it on file in case you'd like to move forward later — and if anything changed on your end, I'm glad to revise it.${sig}`,
      ].slice(0, touchCount);
      return touches.join("\n\n---\n\n");
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a ${touchCount}-touch follow-up SEQUENCE (markdown allowed) for an unresponded QUOTE of ${amt} for ${scope}. ` +
      `Use relative dates (Today / +7 days / +14 days). Quote-specific framing: softer than chasing payment, sharper than generic nurture. ` +
      `Reference the amount and scope in each touch.` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Customer: ${customerName ?? "(unknown)"}. Quote: ${amt} for ${scope}. Touches: ${touchCount}.`;

    await emitTrace.work("compose_sequence", `wrote ${touchCount}-touch quote follow-up`);
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Quote follow-up — ${customerName ?? "customer"}, ${amt} ${scope}`,
        body: finishBody("sequence", generated.text),
        channel: "sequence",
        metadata: { quote_amount: amount, quote_scope: scope, touch_count: touchCount, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
