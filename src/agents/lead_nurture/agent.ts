import { defineStub } from "../_stub.js";

export const leadNurture = defineStub({
  agent_id: "lead_nurture",
  display_name: "Lead Nurture",
  bucket: "sales",
  status: "existing",
  build_priority: "P1",
  purpose: "Drafts warm follow-up sequences to re-engage prospects who haven't moved forward.",
  channel: "sequence",
  routes_here_when: [
    "Owner asks for a follow-up sequence for a specific lead",
    "(Phase 4) Trigger: lead stale N days",
  ],
  keywords: ["follow up", "follow-up", "nurture", "re-engage", "reengage", "stale lead", "hasn't responded", "went quiet", "check in"],
  strong_signals: ["follow-up sequence", "nurture sequence", "re-engage the lead", "touch follow-up", "follow-up for", "follow up for"],
  shared_context_needed: ["business_profile", "pipeline_state", "agent_run_history"],
  tool_dependencies: ["none"],
  permission_scope: { default: "drafts_only", require_owner_approval: true, recipient_filter: "existing_customers_only" },
  triggers_supported: ["manual", "event_based"],
  trigger_detail: { events: ["lead_stale"] },
  output_format: { title_template: "{N}-touch follow-up — {customer}, {subject}", body_constraints: { no_markdown: false } },
  examples: [
    { owner_ask: "Draft a 3-touch follow-up for Sarah who asked about a consultation.", expected_route: "lead_nurture", expected_output_excerpt: "Touch 1" },
    { owner_ask: "Write a warm follow-up sequence for a lead that went quiet.", expected_route: "lead_nurture", expected_output_excerpt: "+5 days" },
    { owner_ask: "Re-engage Mike — he hasn't responded since last month.", expected_route: "lead_nurture", expected_output_excerpt: "Touch" },
  ],
});
