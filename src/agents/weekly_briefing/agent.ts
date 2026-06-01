import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput, SharedContext } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  period: z.string().optional(),
  focus: z.string().optional(),
});

interface Section {
  heading: string;
  content: string;
}

/** Build ONLY the non-empty sections. Critical rule: never emit "none this week". */
function buildSections(ctx: SharedContext): Section[] {
  const sections: Section[] = [];

  // Owner attention needed — surfaced FIRST so the most actionable items lead
  // (B-06). Complaints from the widget + stale leads + overdue invoices.
  const attention: string[] = [];
  const complaints = ctx.widgetHistory.filter((c) => (c.intent ?? "").toLowerCase().includes("complaint"));
  for (const c of complaints) {
    attention.push(`Complaint from ${c.contactName ?? "a customer"}: ${c.summary}`);
  }
  const staleLeads = ctx.pipelineLeads.filter((l) => l.status === "stale");
  for (const l of staleLeads) {
    attention.push(`Stale lead: ${l.name}${l.subject ? ` (${l.subject})` : ""} — worth a follow-up.`);
  }
  const overdueInv = ctx.invoices.filter((iv) => iv.status === "overdue");
  for (const iv of overdueInv) {
    attention.push(`Overdue invoice ${iv.number} for ${iv.customerName} — $${iv.amount.toLocaleString("en-US")}.`);
  }
  // KB gaps: Customer Question runs that fell back to a holding reply because the
  // knowledge base didn't cover the question (B-06). Suggest adding a FAQ entry.
  const kbGaps = ctx.agentRunHistory.filter((r) => r.kbGap);
  if (kbGaps.length) {
    const noun = kbGaps.length === 1 ? "customer question" : "customer questions";
    attention.push(`${kbGaps.length} ${noun} your knowledge base didn't cover — consider adding an FAQ entry so the AI can answer directly next time.`);
  }
  // No-shows in recent appointments with no follow-up logged.
  const noShows = ctx.appointments.filter((ap) => ap.status === "no_show");
  for (const ap of noShows) {
    attention.push(`No-show: ${ap.customerName}${ap.service ? ` (${ap.service})` : ""} — worth a follow-up.`);
  }
  if (attention.length) {
    sections.push({ heading: "Owner attention needed", content: attention.map((a) => `- ${a}`).join("\n") });
  }

  if (ctx.widgetHistory.length > 0) {
    const topics = [...new Set(ctx.widgetHistory.flatMap((c) => c.topics))].slice(0, 5);
    sections.push({
      heading: "Conversations",
      content: `${ctx.widgetHistory.length} widget chat(s).` + (topics.length ? ` Top topics: ${topics.join(", ")}.` : ""),
    });
  }

  if (ctx.pipelineLeads.length > 0) {
    const stale = ctx.pipelineLeads.filter((l) => l.status === "stale");
    const lines = [`${ctx.pipelineLeads.length} lead(s) in the pipeline.`];
    if (stale.length) lines.push(`${stale.length} stale lead(s) worth a follow-up: ${stale.map((l) => l.name).join(", ")}.`);
    sections.push({ heading: "Leads", content: lines.join(" ") });
  }

  if (ctx.appointments.length > 0) {
    const booked = ctx.appointments.filter((ap) => ap.status === "scheduled").length;
    const completed = ctx.appointments.filter((ap) => ap.status === "completed").length;
    const noShow = ctx.appointments.filter((ap) => ap.status === "no_show").length;
    const parts: string[] = [];
    if (booked) parts.push(`${booked} upcoming`);
    if (completed) parts.push(`${completed} completed`);
    if (noShow) parts.push(`${noShow} no-show(s)`);
    if (parts.length) sections.push({ heading: "Appointments", content: parts.join(", ") + "." });
  }

  if (ctx.invoices.length > 0) {
    const overdue = ctx.invoices.filter((iv) => iv.status === "overdue" || iv.status === "unpaid");
    if (overdue.length) {
      const total = overdue.reduce((s, iv) => s + iv.amount, 0);
      sections.push({ heading: "Finance", content: `${overdue.length} outstanding invoice(s) totaling $${total.toLocaleString("en-US")}.` });
    }
  }

  if (ctx.agentRunHistory.length > 0) {
    const approved = ctx.agentRunHistory.filter((r) => r.status === "approved" || r.status === "sent").length;
    sections.push({ heading: "Drafts & sends", content: `${ctx.agentRunHistory.length} agent run(s); ${approved} approved/sent.` });
  }

  // What's coming — upcoming appointments give a forward look (B-06 companion).
  const upcoming = ctx.appointments
    .filter((ap) => ap.status === "scheduled")
    .sort((x, y) => x.scheduledFor.localeCompare(y.scheduledFor))
    .slice(0, 3);
  if (upcoming.length) {
    const items = upcoming.map((ap) => {
      const when = new Date(ap.scheduledFor);
      const label = Number.isNaN(when.getTime())
        ? ap.scheduledFor
        : when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return `- ${ap.customerName}${ap.service ? ` — ${ap.service}` : ""} (${label})`;
    });
    sections.push({ heading: "What's coming", content: items.join("\n") });
  }

  return sections;
}

export const weeklyBriefing = defineAgent(
  {
    agent_id: "weekly_briefing",
    display_name: "Weekly Briefing",
    bucket: "reporting",
    status: "new",
    build_priority: "P2",
    purpose: "Produces a written weekly summary of activity and what's coming up.",
    channel: "report",
    routes_here_when: ["Owner asks 'what happened last week' / 'give me a summary' / 'run my weekly briefing'", "Phase 4 scheduled trigger: every Monday 7am owner-local time"],
    keywords: ["weekly briefing", "summary", "what happened", "last week", "recap", "how's business", "digest"],
    strong_signals: ["weekly briefing", "what happened last week", "give me a summary"],
    shared_context_needed: ["business_profile", "widget_history", "pipeline_state", "agent_run_history"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual", "scheduled"],
    trigger_detail: { scheduled_cron: ["0 7 * * MON"] },
    output_format: { title_template: "Weekly Briefing — week of {date}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const period = params.period?.trim() || "last 7 days";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });
    await emitTrace.emit("load_conversations", { description: `${context.widgetHistory.length} widget conversation(s)`, data: context.widgetHistory });
    await emitTrace.emit("load_pipeline", { description: `${context.pipelineLeads.length} lead(s)`, data: context.pipelineLeads });
    await emitTrace.emit("load_agent_activity", { description: `${context.agentRunHistory.length} agent run(s)`, data: context.agentRunHistory });

    const sections = buildSections(context);
    const businessName = a.field("businessName");
    const header = `# Weekly Briefing — ${period}${businessName ? ` · ${businessName}` : ""}`;

    const local = (): string => {
      if (sections.length === 0) {
        return `${header}\n\nQuiet week — no logged activity across conversations, pipeline, or agent runs. Nothing needs your attention right now.`;
      }
      return `${header}\n\n` + sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n");
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You write a Monday weekly briefing on the REPORT channel (markdown). CRITICAL: include a section ONLY if it ` +
      `has data — never write "Conversations: none this week" or any empty-section line. If there's no activity at ` +
      `all, write one short "quiet week" line. Use only the data provided below; do not invent numbers.`;
    const prompt =
      `Period: ${period}.\n` +
      `Available sections (already filtered to non-empty):\n` +
      (sections.length ? sections.map((s) => `## ${s.heading}\n${s.content}`).join("\n\n") : "(no activity this period)");

    await emitTrace.work("assemble_briefing", sections.length ? `included sections: ${sections.map((s) => s.heading).join(", ")}` : "no activity — short quiet-week note");
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Weekly Briefing — ${period}`,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { period, sections_included: sections.map((s) => s.heading), source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
