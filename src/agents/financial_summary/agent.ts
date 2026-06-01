import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody, money } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput, SharedContext } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  period: z.string().optional(),
});

interface FinanceFacts {
  outstanding: { count: number; total: number; lines: string[] };
  pipelineValue: number;
  pipelineCount: number;
  completedAppointments: number;
}

/** Read ONLY what's in context — never invent numbers. */
function gatherFacts(ctx: SharedContext): FinanceFacts {
  const outstandingInvoices = ctx.invoices.filter((iv) => iv.status === "overdue" || iv.status === "unpaid");
  const total = outstandingInvoices.reduce((s, iv) => s + iv.amount, 0);
  const lines = outstandingInvoices.map(
    (iv) => `- Invoice ${iv.number} for ${iv.customerName} — ${money(iv.amount)} (${iv.status})`,
  );
  const pipelineValue = ctx.pipelineLeads.reduce((s, l) => s + (l.quoteAmount ?? 0), 0);
  const completedAppointments = ctx.appointments.filter((ap) => ap.status === "completed").length;
  return {
    outstanding: { count: outstandingInvoices.length, total, lines },
    pipelineValue,
    pipelineCount: ctx.pipelineLeads.length,
    completedAppointments,
  };
}

export const financialSummary = defineAgent(
  {
    agent_id: "financial_summary",
    display_name: "Financial Summary",
    bucket: "finance",
    status: "new",
    build_priority: "P2",
    purpose: "Produces a plain-English financial snapshot from the data layer: outstanding invoices, pipeline value, and completed work.",
    channel: "report",
    routes_here_when: [
      "Owner asks for a financial summary, revenue figure, or cash snapshot",
      "Owner asks to summarize outstanding receivables",
    ],
    keywords: ["financial summary", "revenue", "financial", "summary", "receivables", "cash", "income", "outstanding"],
    strong_signals: ["financial summary", "outstanding receivables"],
    shared_context_needed: ["business_profile", "pipeline_state"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual", "scheduled"],
    output_format: { title_template: "Financial Summary — {businessName}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const period = params.period?.trim() || "current snapshot";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });
    await emitTrace.emit("load_invoices", { description: `${context.invoices.length} invoice(s)`, data: context.invoices });
    await emitTrace.emit("load_pipeline", { description: `${context.pipelineLeads.length} lead(s)`, data: context.pipelineLeads });

    const facts = gatherFacts(context);
    const businessName = a.field("businessName");
    const header = `# Financial Summary — ${businessName ?? "Your Business"}`;

    const local = (): string => {
      const parts: string[] = [`${header}\n\n_Period: ${period}._`];

      if (facts.outstanding.count > 0) {
        parts.push(
          `## Outstanding invoices\n\n` +
            `${facts.outstanding.count} outstanding invoice(s) totaling ${money(facts.outstanding.total)}.\n\n` +
            facts.outstanding.lines.join("\n"),
        );
      } else {
        parts.push(`## Outstanding invoices\n\nNo outstanding invoices on file right now.`);
      }

      if (facts.pipelineCount > 0) {
        parts.push(
          `## Pipeline\n\n` +
            `${facts.pipelineCount} lead(s) in the pipeline` +
            (facts.pipelineValue > 0 ? `, with quoted value totaling ${money(facts.pipelineValue)}.` : `.`),
        );
      }

      if (facts.completedAppointments > 0) {
        parts.push(`## Completed work\n\n${facts.completedAppointments} completed appointment(s) on record.`);
      }

      return parts.join("\n\n");
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You write a plain-English financial summary on the REPORT channel (markdown). ` +
      `CRITICAL: report ONLY the numbers provided below — never invent or estimate figures. ` +
      `If a category has no data, say so plainly rather than guessing.`;
    const prompt =
      `Period: ${period}.\n` +
      `Outstanding invoices: ${facts.outstanding.count} totaling ${money(facts.outstanding.total)}.\n` +
      (facts.outstanding.lines.length ? `${facts.outstanding.lines.join("\n")}\n` : "") +
      `Pipeline: ${facts.pipelineCount} lead(s), quoted value ${money(facts.pipelineValue)}.\n` +
      `Completed appointments: ${facts.completedAppointments}.`;

    await emitTrace.work("assemble_financials", `invoices=${facts.outstanding.count}, pipeline=${facts.pipelineCount}, completed=${facts.completedAppointments}`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 900 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `Financial Summary — ${businessName ?? "Your Business"}`,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: {
          period,
          outstanding_count: facts.outstanding.count,
          outstanding_total: facts.outstanding.total,
          pipeline_value: facts.pipelineValue,
          source: generated.source,
          cost_usd: generated.costUsd,
        },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
