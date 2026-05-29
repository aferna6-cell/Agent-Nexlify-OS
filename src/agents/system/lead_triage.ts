import type { AgentDefinition } from "../../types.js";
import { AgentScratch, result, str } from "../base.js";

type Intent = "booking" | "question" | "complaint" | "spam" | "sales_pitch" | "qualified_lead";

/**
 * Lead Triage (lead_triage) — system · new · P4.
 *
 * Internal meta-agent. Fires when a new widget conversation closes; classifies
 * intent and slots the conversation into the pipeline. Produces NO owner-facing
 * draft, but may recommend firing the matching specialist (in draft-only mode).
 */
export const leadTriage: AgentDefinition = {
  agent_id: "lead_triage",
  display_name: "Lead Triage",
  bucket: "system",
  status: "new",
  build_priority: "P4",
  purpose:
    "Internal: classifies a closed widget conversation's intent and slots it into the pipeline; optionally fires the matching specialist.",
  routing: {
    routes_here_when: ["(internal) widget_conversation_closed event fires"],
    keywords: ["triage", "classify lead", "new widget lead"],
  },
  channel: "internal",
  inputs: {
    from_owner: [
      { name: "transcript", type: "string", required: true, description: "Widget conversation transcript." },
      { name: "contact_info", type: "string", required: false, description: "Contact info captured." },
    ],
    from_shared_context: ["widget_history", "pipeline_state"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true, event_based: ["widget_conversation_closed"] },
  outputs: {
    title_format: "(internal) Triage — {intent}",
    body_format: "No owner-facing draft. Produces classification + routing recommendation.",
    metadata: ["intent", "fired_agent"],
  },
  reasoning_trace_steps: [
    { name: "Read transcript", kind: "work", description: "Read the conversation transcript." },
    { name: "Classify intent", kind: "work", description: "Classify the conversation intent." },
    { name: "Route", kind: "work", description: "Recommend the matching specialist." },
  ],
  example_interactions: [
    {
      owner_ask: "(internal) classify: 'Do you have any openings Saturday? I'd like to book.'",
      expected_route: "lead_triage",
      expected_output_excerpt: "booking",
    },
    {
      owner_ask: "(internal) classify: 'My car came back scratched and I'm furious.'",
      expected_route: "lead_triage",
      expected_output_excerpt: "complaint",
    },
    {
      owner_ask: "(internal) classify: 'What are your hours on weekends?'",
      expected_route: "lead_triage",
      expected_output_excerpt: "question",
    },
  ],

  run(input, _ctx, _deps) {
    const s = new AgentScratch({});
    const transcript = str(input, "transcript", input.ownerAsk);
    s.trace.work("Read transcript", `read ${transcript.length} chars`);

    const intent = classify(transcript);
    s.trace.work("Classify intent", `classified as "${intent}"`);

    const firedAgent = specialistFor(intent);
    if (firedAgent) {
      s.trace.work("Route", `would fire ${firedAgent} in draft-only mode`);
      s.note(`Triage classified this widget conversation as "${intent}". Recommended specialist: ${firedAgent} (draft-only).`);
    } else {
      s.trace.work("Route", `no specialist fired for "${intent}"`);
      s.note(`Triage classified this widget conversation as "${intent}". No specialist fired.`);
    }

    // Internal agent: no owner-facing draft.
    const r = result(leadTriage, s, undefined, "internal agent — no owner-facing draft");
    r.draft = undefined;
    (r as { intent?: string }).intent = intent;
    return r;
  },
};

function classify(text: string): Intent {
  const t = text.toLowerCase();
  if (/(furious|angry|upset|scratch|damage|refund|terrible|worst|complaint)/.test(t)) return "complaint";
  if (/(book|appointment|opening|schedule|slot|reserve)/.test(t)) return "booking";
  if (/(seo agency|marketing services|guest post|partnership opportunity|increase your sales)/.test(t)) return "sales_pitch";
  if (/(viagra|crypto|free money|click here|loan offer)/.test(t)) return "spam";
  if (/(quote|estimate|price|interested in|looking for)/.test(t)) return "qualified_lead";
  if (/(hours|do you|what time|how much|question|policy)/.test(t)) return "question";
  return "question";
}

function specialistFor(intent: Intent): string | undefined {
  switch (intent) {
    case "booking":
      return "booking";
    case "question":
      return "customer_question";
    case "complaint":
      return "complaint_handler";
    case "qualified_lead":
      return "lead_nurture";
    default:
      return undefined;
  }
}
