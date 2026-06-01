import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  subject: z.string().optional(),
  employee: z.string().optional(),
});

type MemoKind = "performance write-up" | "coaching note" | "schedule notice";

function deriveKind(ask: string): MemoKind {
  const a = ask.toLowerCase();
  if (a.includes("coaching")) return "coaching note";
  if (a.includes("schedule") || a.includes("time off") || a.includes("day off")) return "schedule notice";
  if (a.includes("write up") || a.includes("write-up") || a.includes("performance") || a.includes("late")) return "performance write-up";
  return "performance write-up";
}

function subjectFromAsk(ask: string): string | undefined {
  const m = ask.match(/\b(?:about|on|regarding)\s+(.+?)[.?!]?$/i);
  if (m) return m[1]!.trim();
  return undefined;
}

function capitalize(t: string): string {
  return t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1);
}

export const hrMemo = defineAgent(
  {
    agent_id: "hr_memo",
    display_name: "HR Memo",
    bucket: "system",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts sensitive HR communications — performance write-ups, coaching notes, and schedule notices — factually and professionally.",
    channel: "report",
    routes_here_when: [
      "Owner needs to write up or coach an employee",
      "Owner needs a schedule or time-off notice for the team",
    ],
    keywords: ["write up", "write-up", "coaching", "performance", "late", "hr memo", "schedule notice"],
    strong_signals: ["write up an employee", "coaching note", "schedule notice"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true, never_auto_send: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "{kind} — {subject}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const kind = deriveKind(ownerAsk);
    const employee = params.employee?.trim();
    const subject = params.subject?.trim() || subjectFromAsk(ownerAsk) || "this matter";

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const signoff = a.signoff();
    const title = `${capitalize(kind)} — ${capitalize(subject)}`;

    const local = (): string => {
      const who = employee ? employee : "the employee";
      switch (kind) {
        case "coaching note":
          return (
            `# ${title}\n\n` +
            `**To:** ${who}\n**From:** ${signoff ?? "Management"}${businessName ? ` (${businessName})` : ""}\n\n` +
            `This is a coaching note regarding ${subject}.\n\n` +
            `We're sharing this to help, not to penalize. Here's what we'd like to see going forward, and we're happy to support you in getting there.\n\n` +
            `## What we discussed\n\n` +
            `- The specific behavior around ${subject}\n` +
            `- The standard we're aiming for\n` +
            `- How we'll check in on progress\n\n` +
            `Let's talk if anything here isn't clear.`
          );
        case "schedule notice":
          return (
            `# ${title}\n\n` +
            `**From:** ${signoff ?? "Management"}${businessName ? ` (${businessName})` : ""}\n\n` +
            `A quick schedule notice regarding ${subject}.\n\n` +
            `Please review the schedule change below and let us know if it creates any conflicts.\n\n` +
            `## Details\n\n` +
            `- The change and who it affects\n` +
            `- The dates involved\n` +
            `- Any coverage we still need to confirm\n\n` +
            `Thanks for being flexible.`
          );
        default:
          return (
            `# ${title}\n\n` +
            `**To:** ${who}\n**From:** ${signoff ?? "Management"}${businessName ? ` (${businessName})` : ""}\n\n` +
            `This memo documents a performance concern regarding ${subject}.\n\n` +
            `## The facts\n\n` +
            `- A factual description of what occurred\n` +
            `- The dates and any relevant details\n` +
            `- The expectation that was not met\n\n` +
            `## Expectation going forward\n\n` +
            `- The standard we expect\n` +
            `- The support available to meet it\n` +
            `- How and when we'll follow up\n\n` +
            `This memo is a factual record. ${who === "the employee" ? "The employee" : who} may add their own comments.`
          );
      }
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a sensitive HR ${kind} on the REPORT channel (markdown) for ${businessName ?? "the business"}. ` +
      `Be professional, factual, and neutral in tone — describe behavior and expectations, not character. ` +
      `Do NOT make legal determinations or cite employment law. Do not invent facts; leave placeholders out and let the owner fill specifics. Title it "${title}".`;
    const prompt =
      `Memo kind: ${kind}.\n` +
      (employee ? `Employee: ${employee}.\n` : "") +
      `Subject: ${subject}.\n` +
      `Owner ask: ${ownerAsk}`;

    await emitTrace.work("draft_hr_memo", `kind=${kind}, subject="${subject}"`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 800 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }
    a.note("Please review this for accuracy and legal compliance before sending — I draft HR communications but can't make legal determinations.");

    return {
      draft: {
        title,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { kind, subject, employee, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
