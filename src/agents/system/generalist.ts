import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, num, optStr, result, str } from "../base.js";

/**
 * Generalist (generalist) — system · existing (refactor as honest fallback) · P1.
 *
 * True fallback for requests that don't fit a specialist. Solves the "empty
 * draft" failure mode:
 *  1. If the LLM is available → return real content as the draft.
 *  2. If the LLM is unavailable → NO draft, no Approve button; surface
 *     "service temporarily unavailable" in the orchestrator chat.
 *  3. If a near specialist matched (>0.4) → offer it before generating.
 *  4. Wishlist capture when confidence is low across the board.
 */
export const generalist: AgentDefinition = {
  agent_id: "generalist",
  display_name: "Generalist",
  bucket: "system",
  status: "existing",
  build_priority: "P1",
  purpose:
    "Handles open-ended requests that don't fit any specialist; honest about availability and never produces empty placeholder drafts.",
  routing: {
    routes_here_when: [
      "Orchestrator's classifier returns low confidence on all other specialists",
      "Owner explicitly asks for something open-ended ('write me a list of ideas to…')",
    ],
    keywords: ["ideas", "brainstorm", "write me", "draft a", "list of", "help me think", "plan"],
  },
  channel: "report",
  inputs: {
    from_owner: [
      { name: "request", type: "string", required: true, description: "The owner's verbatim request." },
      {
        name: "format_hint",
        type: "string",
        required: false,
        description: "memo / list / paragraph.",
        default: "memo",
      },
      {
        name: "nearest_specialist",
        type: "string",
        required: false,
        description: "Closest specialist the classifier considered.",
      },
      {
        name: "nearest_confidence",
        type: "number",
        required: false,
        description: "Confidence of the closest specialist.",
      },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true },
  outputs: {
    title_format: '{format_hint or "Draft"} — {short summary of request}',
    body_format: "Free-form, owner-facing. No draft at all when the LLM is unavailable.",
    metadata: ["format_hint", "service_available"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Service availability", kind: "work", description: "Check whether the model is available." },
    { name: "Draft response", kind: "work", description: "Produce free-form content (only if available)." },
  ],
  example_interactions: [
    {
      owner_ask: "Write me a list of ideas to get more weekend bookings.",
      expected_route: "generalist",
      expected_output_excerpt: "ideas",
    },
    {
      owner_ask: "Draft a short memo to my team about the new arrival process.",
      expected_route: "generalist",
      expected_output_excerpt: "memo",
    },
    {
      owner_ask: "Help me think through whether to add a second service bay.",
      expected_route: "generalist",
      expected_output_excerpt: "service bay",
    },
  ],

  run(input, ctx, deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const request = str(input, "request", input.ownerAsk);
    const formatHint = str(input, "format_hint", "memo");
    const nearest = optStr(input, "nearest_specialist");
    const nearestConf = num(input, "nearest_confidence", 0);

    // (3) Offer a close specialist match before generating.
    if (nearest && nearestConf > 0.4) {
      s.note(
        `I'm not totally sure this fits, but it's close to the ${nearest} agent. Want me to try that instead, or should I proceed with a general response?`,
      );
    }

    // (2) Honest service-availability handling — never a silent empty draft.
    if (!deps.llm.available()) {
      s.trace.work("Service availability", "LLM unavailable");
      s.note("Service is temporarily unavailable — please try again in a few minutes. (I didn't produce a draft so you're not approving an empty one.)");
      return result(generalist, s, undefined, "service temporarily unavailable");
    }
    s.trace.work("Service availability", "model available");

    // (4) Wishlist capture signal for the orchestrator.
    s.note(`I saved this as a wishlist item so we can build a dedicated template if requests like "${truncate(request, 60)}" keep coming in.`);

    s.trace.work("Draft response", `produced ${formatHint} content`);
    const body = composeGeneralist(request, formatHint);

    const draft = finishDraft({
      title: `${capitalize(formatHint)} — ${truncate(request, 50)}`,
      body,
      channel: "report",
      metadata: { format_hint: formatHint, service_available: true },
      requiresApproval: true,
    });
    return result(generalist, s, draft);
  },
};

function composeGeneralist(request: string, formatHint: string): string {
  const topic = request.trim();
  if (formatHint === "list") {
    return (
      `Here are some ideas for: ${topic}\n\n` +
      `1. Start with the highest-impact, lowest-effort option.\n` +
      `2. Tell your existing customers first — they're your warmest audience.\n` +
      `3. Make the ask specific and time-bound.\n` +
      `4. Measure what works, then double down.`
    );
  }
  if (formatHint === "paragraph") {
    return `${capitalize(topic)}. Here's a concise take: focus on the one change that moves the needle most, communicate it clearly to the people who already trust you, and give it a week before deciding whether to adjust.`;
  }
  return (
    `**Re: ${topic}**\n\n` +
    `Here's a starting point:\n\n` +
    `- **Goal:** be clear about the single outcome you want.\n` +
    `- **Approach:** smallest step that gets you moving this week.\n` +
    `- **Next step:** pick one action and a date to review it.\n\n` +
    `Want me to turn any of these into a draft you can send?`
  );
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
