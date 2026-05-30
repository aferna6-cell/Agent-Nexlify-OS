import { defineStub } from "../_stub.js";

export const weeklyBriefing = defineStub({
  agent_id: "weekly_briefing",
  display_name: "Weekly Briefing",
  bucket: "reporting",
  status: "new",
  build_priority: "P2",
  purpose: "Produces a written weekly summary of activity and what's coming up.",
  channel: "report",
  routes_here_when: [
    "Owner asks 'what happened last week' / 'give me a summary' / 'run my weekly briefing'",
    "Phase 4 scheduled trigger: every Monday 7am owner-local time",
  ],
  keywords: ["weekly briefing", "summary", "what happened", "last week", "recap", "how's business", "digest"],
  strong_signals: ["weekly briefing", "what happened last week", "give me a summary"],
  shared_context_needed: ["business_profile", "widget_history", "pipeline_state", "agent_run_history"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true },
  triggers_supported: ["manual", "scheduled"],
  trigger_detail: { scheduled_cron: ["0 7 * * MON"] },
  output_format: { title_template: "Weekly Briefing — week of {date}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Run my weekly briefing.", expected_route: "weekly_briefing", expected_output_excerpt: "Weekly Briefing" },
    { owner_ask: "What happened last week?", expected_route: "weekly_briefing", expected_output_excerpt: "week of" },
    { owner_ask: "Give me a summary of business this week.", expected_route: "weekly_briefing", expected_output_excerpt: "Briefing" },
  ],
});
