import { defineAgent } from "../_schema.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

type Intent = "booking" | "question" | "complaint" | "lead" | "spam";

/** Pull the quoted conversation snippet out of the ownerAsk; else strip any "classify:" prefix. */
function extractSnippet(ownerAsk: string): string {
  // Prefer the outermost quotes (greedy) so apostrophes inside the snippet
  // (e.g. "I'd like to book") don't truncate the capture to a single char.
  const doubleQuoted = ownerAsk.match(/"([^"]+)"/);
  if (doubleQuoted && doubleQuoted[1]) return doubleQuoted[1].trim();
  const singleQuoted = ownerAsk.match(/'(.+)'/);
  if (singleQuoted && singleQuoted[1]) return singleQuoted[1].trim();
  const stripped = ownerAsk.replace(/^.*classify\s*:/i, "").trim();
  return stripped || ownerAsk.trim();
}

/** Transparent keyword heuristics; first match in priority order wins. */
function classifyIntent(snippet: string): Intent {
  if (/scratch|damage|broke|refund|terrible|awful|worst|ruined|angry|upset|unhappy|disappointed|complaint/i.test(snippet)) return "complaint";
  if (/\b(seo services|rank #1|crypto|loan|bitcoin|guest post|backlink|marketing services|increase your sales|click here|http)\b/i.test(snippet)) return "spam";
  if (
    /book|appointment|schedule|reschedule|slot|reserve|come in|saturday|sunday|monday|tuesday|wednesday|thursday|friday|tomorrow|next week|\bat \d/i.test(snippet) ||
    (/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(snippet) && /\b(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/i.test(snippet))
  ) {
    return "booking";
  }
  if (/quote|estimate|pricing|price|how much|interested|cost|looking to/i.test(snippet)) return "lead";
  return "question";
}

const SUGGESTED_STATUS: Record<Intent, string> = {
  booking: "booked-intent",
  lead: "new",
  question: "contacted",
  complaint: "escalate",
  spam: "ignore",
};

const NEXT_STEP: Record<Intent, string> = {
  booking: "Route to Booking to offer a slot.",
  complaint: "Route to Complaint Handler immediately; do not auto-send.",
  lead: "Add to pipeline as a new lead and consider Lead Nurture.",
  question: "Route to Customer Question for a reply.",
  spam: "Ignore; no action needed.",
};

export const leadTriage = defineAgent(
  {
    agent_id: "lead_triage",
    display_name: "Lead Triage",
    bucket: "system",
    status: "new",
    build_priority: "P4",
    purpose: "Internal: classifies a closed widget conversation's intent and slots it into the pipeline.",
    channel: "internal",
    routes_here_when: ["(internal) widget_conversation_closed event fires"],
    keywords: ["triage", "classify lead", "new widget lead"],
    strong_signals: [],
    shared_context_needed: ["widget_history", "pipeline_state"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["widget_conversation_closed"] },
    output_format: { title_template: "(internal) Triage — {intent}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ ownerAsk, context, emitTrace }): Promise<AgentOutput> => {
    const snippet = extractSnippet(ownerAsk);
    const intent = classifyIntent(snippet);
    const status = SUGGESTED_STATUS[intent];
    const nextStep = NEXT_STEP[intent];

    await emitTrace.work("classify_intent", `Classified snippet as "${intent}" (suggested pipeline status: ${status})`);

    // Honest trace: try to match a known pipeline lead whose name appears in the
    // snippet — usually none, which correctly marks the step skipped_no_data.
    const lower = snippet.toLowerCase();
    const matchingLeads = context.pipelineLeads.filter((l) => l.name && lower.includes(l.name.toLowerCase()));
    await emitTrace.emit("load_pipeline_state", {
      description: `Checked pipeline for related lead — ${matchingLeads.length} match(es)`,
      data: matchingLeads,
    });

    const body =
      `Intent: ${intent}\n` +
      `Suggested pipeline status: ${status}\n` +
      `Snippet: "${snippet}"\n` +
      `Recommended next step: ${nextStep}`;

    return {
      draft: {
        title: `(internal) Triage — ${intent}`,
        body,
        channel: "internal",
        metadata: { intent, suggested_status: status },
        requiresApproval: true,
      },
      orchestratorNotes: [`Classified this widget conversation as ${intent}.`],
    };
  },
);
