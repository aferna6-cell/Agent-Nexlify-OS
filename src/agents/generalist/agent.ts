/**
 * Generalist — system · existing · P1.
 *
 * Phase 0: the only registered agent. Returns a hard-coded response to prove the
 * loop owner ask → orchestrator → registry → agent → trace → draft. Even hard-
 * coded, it honors the substrate fix (uses the real business name when present)
 * and the honest-trace rule (the profile load reports its real state).
 *
 * Later phases replace the hard-coded body with a Sonnet draft and add the
 * "service temporarily unavailable → no draft" failure mode.
 */

import { defineAgent } from "../_schema.js";
import { examples } from "./examples.js";

export const generalist = defineAgent(
  {
    agent_id: "generalist",
    display_name: "Generalist",
    bucket: "system",
    status: "existing",
    build_priority: "P1",
    purpose:
      "Handles open-ended requests that don't fit a specialist; honest about availability and never produces empty placeholder drafts.",
    channel: "report",
    routes_here_when: [
      "Orchestrator's classifier returns low confidence on all other specialists",
      "Owner explicitly asks for something open-ended",
    ],
    keywords: ["ideas", "brainstorm", "write me", "draft a", "list of", "help me", "plan", "hello", "hi"],
    strong_signals: [],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: {
      title_template: "Draft — {summary}",
      body_constraints: { no_markdown: false },
    },
    examples,
  },
  async ({ ownerAsk, context, emitTrace }) => {
    // Honest profile load: "completed" only if the profile actually has data.
    const profile = context.businessProfile;
    const presentFields = Object.entries(profile)
      .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
      .map(([k]) => k);
    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentFields.join(", ")})`,
      data: presentFields,
    });

    await emitTrace.work("draft_response", "Drafting a general response");

    const businessName = profile.businessName;
    const ownerName = profile.ownerName;
    const who = businessName ? ` for ${businessName}` : "";
    const sign = ownerName ? `\n\n— ${ownerName}` : "";

    const body =
      `Hi! I'm your Agent OS assistant${who}. The plumbing is working end to end: ` +
      `you asked me something, I routed it, ran an agent, streamed an honest reasoning trace, ` +
      `and produced this draft for your review.\n\n` +
      `Your message: "${ownerAsk.trim()}"\n\n` +
      `In the next phases I'll hand requests like this to the right specialist agent — ` +
      `booking, campaigns, quotes, reviews, and more.${sign}`;

    return {
      draft: {
        title: `Draft — ${truncate(ownerAsk, 50)}`,
        body,
        channel: "report",
        metadata: { phase: 0, hard_coded: true },
        requiresApproval: true,
      },
      orchestratorNotes: [],
    };
  },
);

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}
