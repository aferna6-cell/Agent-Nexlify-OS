import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  period: z.string().optional(),
});

export const taxPrep = defineAgent(
  {
    agent_id: "tax_prep",
    display_name: "Tax Prep",
    bucket: "finance",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a general tax-prep checklist and reminder: quarterly estimates, forms, documents, and deadlines.",
    channel: "report",
    routes_here_when: [
      "Owner asks what to gather for quarterly or annual taxes",
      "Owner asks for help prepping for tax season or payroll-tax forms",
    ],
    keywords: ["tax", "taxes", "quarterly", "941", "irs", "deductions", "tax season"],
    strong_signals: ["tax prep", "quarterly taxes"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual", "scheduled"],
    output_format: { title_template: "Tax Prep Checklist — {period}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const period = params.period?.trim() || "this quarter";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const title = `Tax Prep Checklist — ${period}`;

    const local = (): string =>
      `# ${title}\n\n` +
      `${businessName ? `For ${businessName}. ` : ""}A general checklist to help you prep — this is not tax advice; confirm everything with your accountant.\n\n` +
      `## Quarterly estimated taxes\n\n` +
      `- Set aside and pay quarterly estimated taxes (Form 1040-ES) to avoid underpayment penalties.\n` +
      `- Quarterly due dates are generally April 15, June 15, September 15, and January 15.\n\n` +
      `## Forms to know\n\n` +
      `- Schedule C — report business income and expenses (sole proprietor / single-member LLC).\n` +
      `- Form 941 — quarterly payroll tax return if you have employees.\n` +
      `- Form 940 — annual federal unemployment (FUTA) return.\n` +
      `- W-2 / W-3 for employees and 1099-NEC for contractors paid $600+.\n\n` +
      `## Documents to gather\n\n` +
      `- Income records: invoices, bank deposits, merchant/processor statements.\n` +
      `- Expense receipts: parts, supplies, rent, utilities, insurance, software.\n` +
      `- Mileage log and vehicle expenses.\n` +
      `- Payroll records and prior-year return.\n\n` +
      `## Deadlines\n\n` +
      `- Quarterly estimates as above.\n` +
      `- Annual return typically due April 15 (or the next business day).\n` +
      `- Payroll (941) filed quarterly; W-2s to employees by January 31.\n\n` +
      `Note: This is general guidance, not tax advice. Confirm with your accountant before filing.`;

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a general tax-prep checklist on the REPORT channel (markdown) for ${businessName ?? "the business"}. ` +
      `Cover quarterly estimated taxes, common forms (e.g. 941, Schedule C), documents to gather, and deadlines. ` +
      `Keep it general — do NOT give specific tax advice — and include a clear line that this is not tax advice and to confirm with their accountant. ` +
      `Title it "${title}".`;
    const prompt = `Period: ${period}. Produce a practical, general tax-prep checklist for a small service business.`;

    await emitTrace.work("draft_checklist", `period="${period}"`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 900 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }
    a.note("This is general guidance, not tax advice — confirm the details with your accountant.");

    return {
      draft: {
        title,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { period, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
