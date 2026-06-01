import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({
  role: z.string().optional(),
  schedule: z.string().optional(),
  requirements: z.string().optional(),
});

/** Best-effort role extraction from the ask. */
function roleFromAsk(ask: string): string | undefined {
  const m = ask.match(/\b(?:for|hiring|hire)\s+(?:a|an|our)?\s*((?:part[\s-]?time|full[\s-]?time)?\s*[a-z][a-z /-]+?)(?:[,.]|\s+(?:who|with|that|weekends?|must|to|—|-)|$)/i);
  if (m) {
    const r = m[1]!.trim().replace(/\s+/g, " ");
    if (r.length > 1) return r;
  }
  return undefined;
}

function capitalize(t: string): string {
  return t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1);
}

export const jobPost = defineAgent(
  {
    agent_id: "job_post",
    display_name: "Job Post",
    bucket: "system",
    status: "new",
    build_priority: "P2",
    purpose: "Drafts a job posting with title, responsibilities, requirements, and how to apply.",
    channel: "report",
    routes_here_when: [
      "Owner wants to write a hiring ad or job posting",
      "Owner asks for a Craigslist / job-board post for an open role",
    ],
    keywords: ["job post", "job posting", "craigslist", "hiring ad", "hire", "posting", "hiring"],
    strong_signals: ["job posting", "hiring ad", "craigslist post"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["none"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "Now Hiring — {role}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const role = params.role?.trim() || roleFromAsk(ownerAsk) || "team member";
    const schedule = params.schedule?.trim();
    const requirements = params.requirements?.trim();

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const businessName = a.field("businessName");
    const city = a.field("city");
    const phone = a.field("phone");
    const email = a.field("email");
    const where = city ? ` in ${city}` : "";
    const title = `Now Hiring — ${capitalize(role)}`;

    const applyLine = email
      ? `Email us at ${email}${phone ? ` or call ${phone}` : ""}.`
      : phone
        ? `Call us at ${phone}.`
        : `Reach out and tell us a bit about yourself.`;

    const local = (): string =>
      `# ${title}\n\n` +
      `${businessName ?? "We"}${where} ${businessName ? "is" : "are"} hiring a ${role}.\n\n` +
      `## About the role\n\n` +
      `Join a busy local team where good work and reliability are noticed. ${schedule ? `Schedule: ${schedule}.` : ""}\n\n` +
      `## Responsibilities\n\n` +
      `- Perform ${role} duties to a high standard\n` +
      `- Communicate clearly with customers and teammates\n` +
      `- Keep the workspace organized and safe\n\n` +
      `## Requirements\n\n` +
      `- Reliable, punctual, and team-oriented\n` +
      (requirements ? `- ${requirements}\n` : `- Relevant experience a plus; willingness to learn required\n`) +
      `\n## How to apply\n\n` +
      `${applyLine}`;

    const system =
      `${a.promptBlock()}\n\n` +
      `You draft a job posting on the REPORT channel (markdown) for ${businessName ?? "the business"}. ` +
      `Include a title, a short about-the-role blurb, responsibilities, requirements, and a clear how-to-apply using the real contact details. ` +
      `Do not invent contact info you don't have. Title it "${title}".`;
    const prompt =
      `Role: ${role}.\n` +
      (schedule ? `Schedule: ${schedule}.\n` : "") +
      (requirements ? `Requirements: ${requirements}.\n` : "") +
      `Owner ask: ${ownerAsk}`;

    await emitTrace.work("draft_posting", `role="${role}"`);
    const generated = await generateDraft({ system, prompt, runId, local, maxTokens: 800 });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { role, schedule, source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
