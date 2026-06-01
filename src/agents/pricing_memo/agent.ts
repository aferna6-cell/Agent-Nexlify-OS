import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody, money, parseMoney } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  current_price: z.preprocess(parseMoney, z.number().optional()),
  new_price: z.preprocess(parseMoney, z.number().optional()),
  item: z.string().optional(),
});

/** Pull two dollar-ish numbers from the ask, in order, when params don't carry them. */
function pricesFromAsk(ask: string): { current?: number; next?: number } {
  const nums = (ask.match(/\$?\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? [])
    .map((s) => parseMoney(s))
    .filter((n): n is number => typeof n === "number");
  return { current: nums[0], next: nums[1] };
}

/** Best-effort item/service the price applies to. */
function itemFromAsk(ask: string): string | undefined {
  const a = ask.toLowerCase();
  const known = ["oil change", "detail", "detailing", "brake", "alignment", "inspection", "tire rotation", "tune-up", "ac service", "battery"];
  for (const k of known) if (a.includes(k)) return k;
  const m = ask.match(/\b(?:my|our|the)\s+([a-z][a-z ]+?)\s+(?:price|pricing|rate|fee)\b/i);
  return m ? m[1]!.trim() : undefined;
}

export const pricingMemo = defineAgent(
  {
    agent_id: "pricing_memo",
    display_name: "Pricing Memo",
    bucket: "finance",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a short think-through memo for a pricing change, weighing margin, customer perception, and competitor framing.",
    channel: "report",
    routes_here_when: [
      "Owner is considering raising or changing a price",
      "Owner asks to think through or draft a pricing memo",
    ],
    keywords: ["pricing", "price", "raise", "increase", "charge more", "memo"],
    strong_signals: ["pricing memo", "raise my price"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "Pricing Memo — {item}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const asked = pricesFromAsk(ownerAsk);
    const current = params.current_price ?? asked.current;
    const next = params.new_price ?? asked.next;
    const item = params.item?.trim() || itemFromAsk(ownerAsk) || "this service";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const hasBoth = typeof current === "number" && typeof next === "number";
    const pct = hasBoth && current! > 0 ? Math.round(((next! - current!) / current!) * 100) : undefined;
    const title = `Pricing Memo — ${item}`;

    const local = (): string => {
      const change = hasBoth
        ? `from ${money(current!)} to ${money(next!)}${pct !== undefined ? ` (a ${pct >= 0 ? "+" : ""}${pct}% change)` : ""}`
        : typeof next === "number"
          ? `to ${money(next!)}`
          : `for ${item}`;
      return (
        `# ${title}\n\n` +
        `${businessName ? `${businessName} — ` : ""}this memo thinks through changing the ${item} price ${change}.\n\n` +
        `## Margin\n\n` +
        (hasBoth
          ? `Moving ${change} adds about ${money(Math.abs(next! - current!))} per job to the top line. Confirm your cost per job so the change is real margin, not just a higher sticker.`
          : `Confirm your cost per job and the dollars this change adds per ticket before committing.`) +
        `\n\n## Customer perception\n\n` +
        `Loyal customers notice price moves. A small, clearly-communicated increase tied to quality or rising costs lands better than a quiet jump. Consider grandfathering recent customers or pairing the change with a visible improvement.\n\n` +
        `## Competitor framing\n\n` +
        `Check what nearby shops charge for ${item}. If you'd still sit at or below the local norm, the change is easy to defend. If it pushes you above, lead with what makes your work worth it.\n\n` +
        `## Recommendation\n\n` +
        `${hasBoth && pct !== undefined && pct > 15 ? "That's a sizable jump — consider phasing it in." : "If the margin math holds and you're within the local range, this looks reasonable."} Review and adjust before you roll it out.`
      );
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You write a short internal pricing memo on the REPORT channel (markdown) for ${businessName ?? "the business"}. ` +
      `Weigh margin, customer perception, and competitor framing. Use the real numbers when given; do not invent costs or competitor prices. ` +
      `Title the memo "${title}".`;
    const prompt =
      `Item: ${item}.\n` +
      `Current price: ${typeof current === "number" ? money(current) : "(not given)"}.\n` +
      `New price: ${typeof next === "number" ? money(next) : "(not given)"}.\n` +
      (pct !== undefined ? `Change: ${pct}%.\n` : "") +
      `Owner ask: ${ownerAsk}`;

    await emitTrace.work("draft_memo", `item="${item}", current=${current ?? "?"}, new=${next ?? "?"}`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 800 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { item, current_price: current, new_price: next, pct_change: pct, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
