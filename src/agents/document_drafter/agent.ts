import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  doc_type: z.string().optional(),
  subject: z.string().optional(),
});

type DocType = "service agreement" | "intake form" | "one-pager" | "contract" | "template";

function deriveType(ask: string): DocType {
  const a = ask.toLowerCase();
  if (a.includes("intake")) return "intake form";
  if (a.includes("one-pager") || a.includes("one pager")) return "one-pager";
  if (a.includes("service agreement") || a.includes("agreement")) return "service agreement";
  if (a.includes("contract")) return "contract";
  return "template";
}

function subjectFromAsk(ask: string): string | undefined {
  const m = ask.match(/\b(?:on|about|for|regarding)\s+(.+?)[.?!]?$/i);
  if (m) return m[1]!.replace(/^(a|an|the|our|my)\s+/i, "").replace(/\b(new customers?|the front desk)\b/i, "").trim() || undefined;
  return undefined;
}

function capitalize(t: string): string {
  return t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1);
}

export const documentDrafter = defineAgent(
  {
    agent_id: "document_drafter",
    display_name: "Document Drafter",
    bucket: "system",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts business documents: contracts, service agreements, intake forms, one-pagers, and templates.",
    channel: "report",
    routes_here_when: [
      "Owner asks for a contract, service agreement, or intake form",
      "Owner asks for a one-pager, template, or policy document",
    ],
    keywords: ["contract", "agreement", "intake form", "template", "one-pager", "policy", "document"],
    strong_signals: ["service agreement", "intake form", "one-pager"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "{docType} — {subject}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const docType = (params.doc_type?.trim() as DocType) || deriveType(ownerAsk);
    const subject = params.subject?.trim() || subjectFromAsk(ownerAsk);

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const who = businessName ?? "the business";
    const titleSubject = subject ? capitalize(subject) : capitalize(docType);
    const title = `${capitalize(docType)} — ${titleSubject}`;

    const local = (): string => {
      const header = `# ${title}\n\n`;
      switch (docType) {
        case "intake form":
          return (
            header +
            `New-Customer Intake Form for ${who}.\n\n` +
            `## Customer details\n\n` +
            `- Name:\n- Phone:\n- Email:\n- Vehicle / item (year, make, model):\n\n` +
            `## Service requested\n\n` +
            `- What can we help with today?\n- Any history or prior work we should know about?\n\n` +
            `## Consent\n\n` +
            `- I authorize ${who} to perform the agreed work and contact me about it.\n\n` +
            `Signature: ____________________   Date: __________`
          );
        case "one-pager":
          return (
            header +
            `${capitalize(subject ?? docType)} — a quick one-pager from ${who}.\n\n` +
            `## Overview\n\n` +
            `This page explains our ${subject ?? "policy"} in plain language so customers know what to expect.\n\n` +
            `## Key points\n\n` +
            `- The main terms of our ${subject ?? "policy"}\n` +
            `- What customers should do and when\n` +
            `- How to reach us with questions\n\n` +
            `## Questions?\n\n` +
            `Get in touch with ${who} and we'll walk you through it.`
          );
        default:
          return (
            header +
            `Service Agreement between ${who} ("Provider") and the Customer ("Client").\n\n` +
            `## Scope of work\n\n` +
            `Provider agrees to perform the agreed services for Client as described at booking.\n\n` +
            `## Payment\n\n` +
            `Client agrees to pay the quoted amount upon completion unless other terms are agreed in writing.\n\n` +
            `## Warranty\n\n` +
            `Provider stands behind its workmanship per the terms discussed.\n\n` +
            `## Acceptance\n\n` +
            `By signing, both parties agree to this Agreement.\n\n` +
            `Provider: ____________________   Date: __________\n` +
            `Client: ______________________   Date: __________`
          );
      }
    };

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a business ${docType} on the REPORT channel (markdown) for ${who}. ` +
      `Produce a clean, ready-to-use document using the real business name. Do not invent legal terms beyond plain business language; ` +
      `use blank fields the owner can complete rather than bracketed placeholders. Title it "${title}".`;
    const prompt =
      `Document type: ${docType}.\n` +
      (subject ? `Subject: ${subject}.\n` : "") +
      `Owner ask: ${ownerAsk}`;

    await emitTrace.work("draft_document", `type=${docType}${subject ? `, subject="${subject}"` : ""}`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 900 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { doc_type: docType, subject, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
