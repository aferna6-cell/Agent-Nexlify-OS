import type { SharedContext } from "../../context/sharedContext.js";
import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, result, str } from "../base.js";

/**
 * Weekly Briefing (weekly_briefing) — reporting · new (replaces Analytics) · P2.
 *
 * Produces a written Monday summary of last week + what's coming. Critical rule:
 * if a section has no data, OMIT it entirely — never emit "Conversations: none
 * this week". The briefing should feel substantive when there's activity and
 * quiet when there isn't.
 */
export const weeklyBriefing: AgentDefinition = {
  agent_id: "weekly_briefing",
  display_name: "Weekly Briefing",
  bucket: "reporting",
  status: "new",
  build_priority: "P2",
  purpose: "Produces a written weekly summary of activity and what's coming up.",
  routing: {
    routes_here_when: [
      "Owner asks 'what happened last week' / 'give me a summary' / 'run my weekly briefing'",
      "Phase 4 scheduled trigger: every Monday 7am owner-local time",
    ],
    keywords: ["weekly briefing", "summary", "what happened", "last week", "recap", "how's business", "digest"],
    strong_signals: ["weekly briefing", "what happened last week", "give me a summary"],
  },
  channel: "report",
  inputs: {
    from_owner: [
      { name: "period", type: "string", required: false, description: "Period.", default: "last 7 days" },
      { name: "focus", type: "string", required: false, description: "Focus area.", default: "all" },
    ],
    from_shared_context: ["business_profile", "widget_history", "pipeline_state", "agent_run_history"],
  },
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true, scheduled: ["0 7 * * MON"] },
  outputs: {
    title_format: "Weekly Briefing — week of {date}",
    body_format: "Structured report; sections included ONLY if non-empty.",
    metadata: ["period", "sections_included"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile if present." },
    { name: "Conversations", kind: "load", description: "Load widget conversations for the period." },
    { name: "Pipeline", kind: "load", description: "Load leads + appointments." },
    { name: "Agent activity", kind: "load", description: "Load agent run history." },
    { name: "Assemble briefing", kind: "work", description: "Assemble only the non-empty sections." },
  ],
  example_interactions: [
    {
      owner_ask: "Run my weekly briefing.",
      expected_route: "weekly_briefing",
      expected_output_excerpt: "Weekly Briefing",
    },
    {
      owner_ask: "What happened last week?",
      expected_route: "weekly_briefing",
      expected_output_excerpt: "week of",
    },
    {
      owner_ask: "Give me a summary of business this week.",
      expected_route: "weekly_briefing",
      expected_output_excerpt: "Briefing",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const period = str(input, "period", "last 7 days");

    const convos = ctx.widget_history;
    s.trace.load(
      "Conversations",
      convos,
      (d) => `${(d as unknown[]).length} widget conversation(s)`,
      "no widget conversations this period",
    );

    const leads = ctx.pipeline_state.leads;
    const appts = ctx.pipeline_state.appointments;
    s.trace.load(
      "Pipeline",
      [...leads, ...appts],
      () => `${leads.length} lead(s), ${appts.length} appointment(s)`,
      "no pipeline activity this period",
    );

    const runs = ctx.agent_run_history;
    s.trace.load(
      "Agent activity",
      runs,
      (d) => `${(d as unknown[]).length} agent run(s)`,
      "no agent runs this period",
    );

    const sections = buildSections(ctx);
    s.trace.work(
      "Assemble briefing",
      sections.length > 0
        ? `included ${sections.length} non-empty section(s): ${sections.map((x) => x.heading).join(", ")}`
        : "no activity this period — produced a short quiet-week note",
    );

    const businessName = s.field("business_name");
    const header = `# Weekly Briefing — ${period}${businessName ? ` · ${businessName}` : ""}\n`;

    let body: string;
    if (sections.length === 0) {
      // Quiet week: do NOT fabricate "none this week" sections.
      body = `${header}\nQuiet week — no logged activity across conversations, pipeline, or agent runs. Nothing needs your attention right now.`;
    } else {
      body = `${header}\n` + sections.map((sec) => `## ${sec.heading}\n\n${sec.content}`).join("\n\n");
    }

    const draft = finishDraft({
      title: `Weekly Briefing — ${period}`,
      body,
      channel: "report",
      metadata: { period, sections_included: sections.map((x) => x.heading) },
      requiresApproval: true,
    });
    return result(weeklyBriefing, s, draft);
  },
};

interface Section {
  heading: string;
  content: string;
}

function buildSections(ctx: SharedContext): Section[] {
  const sections: Section[] = [];

  if (ctx.widget_history.length > 0) {
    const topics = [...new Set(ctx.widget_history.flatMap((c) => c.topics ?? []))].slice(0, 5);
    sections.push({
      heading: "Conversations",
      content:
        `${ctx.widget_history.length} widget chat(s).` +
        (topics.length ? ` Top topics: ${topics.join(", ")}.` : ""),
    });
  }

  const { leads, appointments } = ctx.pipeline_state;
  if (leads.length > 0) {
    const stale = leads.filter((l) => l.status === "stale");
    const lines = [`${leads.length} lead(s) in the pipeline.`];
    if (stale.length) lines.push(`${stale.length} stale lead(s) worth a follow-up: ${stale.map((l) => l.name).join(", ")}.`);
    sections.push({ heading: "Leads", content: lines.join(" ") });
  }

  if (appointments.length > 0) {
    const booked = appointments.filter((a) => a.status === "scheduled").length;
    const completed = appointments.filter((a) => a.status === "completed").length;
    const noShow = appointments.filter((a) => a.status === "no_show").length;
    const parts: string[] = [];
    if (booked) parts.push(`${booked} booked`);
    if (completed) parts.push(`${completed} completed`);
    if (noShow) parts.push(`${noShow} no-show(s)`);
    if (parts.length) sections.push({ heading: "Appointments", content: parts.join(", ") + "." });
  }

  if (ctx.agent_run_history.length > 0) {
    const approved = ctx.agent_run_history.filter((r) => r.outcome === "approved" || r.outcome === "sent").length;
    sections.push({
      heading: "Drafts & sends",
      content: `${ctx.agent_run_history.length} agent run(s); ${approved} approved/sent.`,
    });
  }

  return sections;
}
