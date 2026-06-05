import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields, firstName, greetingInstruction } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  customer_name: z.string().optional(),
  subject: z.string().optional(),
  touch_count: z.coerce.number().optional(),
  tone_hint: z.string().optional(),
});

export const leadNurture = defineAgent(
  {
    agent_id: "lead_nurture",
    display_name: "Lead Nurture",
    bucket: "sales",
    status: "existing",
    build_priority: "P1",
    purpose: "Drafts warm follow-up sequences to re-engage prospects who haven't moved forward.",
    channel: "sequence",
    routes_here_when: ["Owner asks for a follow-up sequence for a specific lead", "(Phase 4) Trigger: lead stale N days"],
    keywords: ["follow up", "follow-up", "nurture", "re-engage", "reengage", "stale lead", "hasn't responded", "went quiet", "check in"],
    strong_signals: ["follow-up sequence", "nurture sequence", "re-engage the lead", "touch follow-up", "follow-up for", "follow up for"],
    shared_context_needed: ["business_profile", "pipeline_state", "agent_run_history"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true, recipient_filter: "existing_customers_only" },
    triggers_supported: ["manual", "event_based"],
    trigger_detail: { events: ["lead_stale"] },
    output_format: { title_template: "{N}-touch follow-up — {customer}, {subject}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const customerName = params.customer_name?.trim();
    const subject = params.subject?.trim() || "your inquiry";
    const touchCount = Math.min(Math.max(params.touch_count ?? 3, 1), 3);
    const name = firstName(customerName) ?? "there";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const leadRecords = customerName
      ? context.pipelineLeads.filter((l) => l.name.toLowerCase().includes(customerName.toLowerCase()))
      : [];
    await emitTrace.emit("load_pipeline_state", {
      description: `Found ${leadRecords.length} matching lead record(s)`,
      data: leadRecords,
    });

    const priorRuns = context.agentRunHistory.filter((r) => r.agentId === "lead_nurture");
    await emitTrace.emit("load_prior_outreach", {
      description: `Found ${priorRuns.length} prior nurture run(s) — avoiding repeats`,
      data: priorRuns,
    });

    const signoff = a.signoff();
    const businessName = a.field("businessName");
    const sig = signoff ? `\n\n— ${signoff}${businessName && signoff !== businessName ? `, ${businessName}` : ""}` : "";

    // QA fix: relative dates (Today / +5 / +14); the section LABEL and the body's
    // timing language stay consistent.
    const allTouches = [
      { label: "Touch 1 — Today (Text)", body: `Hi ${name}, just circling back about ${subject}. No rush at all — happy to help whenever the timing's right. Want me to hold a spot for you?` },
      { label: "Touch 2 — +5 days (Email)", body: `Hi ${name}, following up on ${subject} from a few days ago. If you have any questions or want to talk options, just reply here.` },
      { label: "Touch 3 — +14 days (Text)", body: `Hi ${name}, last check-in on ${subject} — it's been a couple of weeks, so I wanted to make sure this didn't slip through. Still glad to help if you're interested.` },
    ].slice(0, touchCount);

    const local = (): string => allTouches.map((t) => `**${t.label}**\n${t.body}${sig}`).join("\n\n---\n\n");

    const system =
      `${a.promptBlock()}\n\n` +
      greetingInstruction(name === "there" ? undefined : name) +
      `You draft a ${touchCount}-touch follow-up sequence to re-engage a prospect, on the SEQUENCE channel ` +
      `(markdown allowed). Use RELATIVE dates as section labels — "Touch 1 — Today", "Touch 2 — +5 days", ` +
      `"Touch 3 — +14 days" — never "Day 1 / Day 5". The timing language inside each touch must match its label ` +
      `(e.g. the +14 touch may say "a couple of weeks"). Warm, not pushy.` +
      (signoff ? ` Sign off as ${signoff}.` : "");
    const prompt = `Lead: ${customerName ?? "(unknown)"}. Subject: ${subject}. Touches: ${touchCount}.`;

    await emitTrace.work("compose_sequence", `wrote ${touchCount}-touch sequence with relative dates`);
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `${touchCount}-touch follow-up — ${customerName ?? "lead"}, ${subject}`,
        body: finishBody("sequence", generated.text),
        channel: "sequence",
        metadata: { touch_count: touchCount, subject, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
