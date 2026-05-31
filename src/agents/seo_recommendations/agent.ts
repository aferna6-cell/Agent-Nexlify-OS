import { z } from "zod";
import { defineAgent } from "../_schema.js";
import { Authoring, presentProfileFields } from "../_authoring.js";
import { finishBody } from "../_format.js";
import { generateDraft } from "../../lib/draft.js";
import { seoCheck, type SeoFindings } from "../../lib/seo.js";
import type { AgentOutput } from "../../types/agent.js";
import { examples } from "./examples.js";

const Input = z.object({ url: z.string().optional() });

function urlFromAsk(ask: string): string | undefined {
  const m = ask.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i);
  if (m && !/\b(seo|audit)\b/i.test(m[1]!)) return m[1];
  return undefined;
}

function toDomain(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0]!;
}

function onPageSection(f: SeoFindings): string {
  const checks: string[] = [];
  checks.push(
    f.title
      ? `- **Title tag**: "${f.title}" (${f.titleLength} chars)${f.titleLength > 60 ? " — over 60, consider trimming" : f.titleLength < 15 ? " — quite short" : " — good length"}`
      : `- **Title tag**: missing — add a unique title with your main service + city`,
  );
  checks.push(
    f.metaDescription
      ? `- **Meta description**: present (${f.metaDescriptionLength} chars)${f.metaDescriptionLength > 160 ? " — over 160, will be clipped" : ""}`
      : `- **Meta description**: missing — add a 140–160 char description`,
  );
  checks.push(`- **H1**: ${f.h1Count} found${f.h1Count === 1 ? " — good (exactly one)" : f.h1Count === 0 ? " — add one H1" : " — use exactly one H1"}`);
  checks.push(`- **Mobile viewport**: ${f.hasViewport ? "present" : "missing — add a viewport meta tag"}`);
  const altPct = f.imgTotal ? Math.round((f.imgWithAlt / f.imgTotal) * 100) : 100;
  checks.push(`- **Image alt text**: ${f.imgWithAlt}/${f.imgTotal} images have alt text (${altPct}%)${altPct < 100 ? " — add alt text to the rest" : ""}`);
  return `## On-page checks (live)\n\n${checks.join("\n")}`;
}

export const seoRecommendations = defineAgent(
  {
    agent_id: "seo_recommendations",
    display_name: "SEO Recommendations",
    bucket: "marketing",
    status: "workaround",
    build_priority: "P3",
    purpose: "Returns generic SEO best-practice recommendations + basic on-page checks for the owner's URL. Not a full crawl.",
    channel: "report",
    routes_here_when: ["Owner asks for an SEO audit / SEO check / SEO recommendations"],
    keywords: ["seo", "search engine", "rank", "ranking", "google ranking", "meta tags", "keywords", "audit"],
    strong_signals: ["seo audit", "seo check", "seo recommendations", "improve my seo"],
    shared_context_needed: ["business_profile"],
    tool_dependencies: ["seo_check"],
    permission_scope: { default: "drafts_only", require_owner_approval: true },
    triggers_supported: ["manual"],
    output_format: { title_template: "SEO recommendations — {domain}", body_constraints: { no_markdown: false } },
    examples,
  },
  async ({ input, context, emitTrace, ownerAsk, runId }): Promise<AgentOutput> => {
    const a = new Authoring(context.businessProfile);
    const p = Input.safeParse(input);
    const params = p.success ? p.data : {};
    const url = params.url?.trim() || urlFromAsk(ownerAsk) || a.field("website");

    await emitTrace.emit("load_business_profile", {
      description: `Loaded business profile (${presentProfileFields(context.businessProfile).join(", ")})`,
      data: presentProfileFields(context.businessProfile),
    });

    const hasUrl = await emitTrace.emit("resolve_target_url", { description: `Evaluating ${url}`, data: url ?? null });
    if (!hasUrl) {
      a.note("I don't have a website on file and you didn't give me a URL, so this is general guidance. Add your website (or paste a URL) and I can run live on-page checks.");
    }

    // Run the lightweight on-page checker (skipped in offline test mode).
    let findings: SeoFindings | undefined;
    if (url && process.env.AGENT_OS_DISABLE_FETCH !== "1") {
      const result = await seoCheck(url);
      if (result.ok) {
        findings = result;
        await emitTrace.emit("seo_check", { description: `Checked ${result.url}`, data: result });
      } else {
        await emitTrace.emit("seo_check", { description: "", data: null });
        a.note(`I couldn't fetch ${url} for live checks (${result.error}), so this report is best-practice guidance only.`);
      }
    } else if (url) {
      await emitTrace.emit("seo_check", { description: "", data: null });
    }

    const domain = url ? toDomain(url) : "your site";

    const local = (): string =>
      `# SEO recommendations — ${domain}\n\n` +
      (url ? `Best-practice recommendations${findings ? " and live on-page checks" : ""} for **${url}**. This is not a full crawl.\n\n` : `General best-practice recommendations. Add your website for live on-page checks.\n\n`) +
      (findings ? `${onPageSection(findings)}\n\n` : "") +
      `## On-page basics to verify\n\n` +
      `- **Title tag**: unique, ≤ 60 characters, includes your main service + city.\n` +
      `- **Meta description**: 140–160 characters, written to earn the click.\n` +
      `- **Heading structure**: exactly one H1; logical H2/H3 nesting.\n` +
      `- **Mobile viewport**: viewport meta present; tap targets large enough.\n` +
      `- **Image alt text**: descriptive alt on every meaningful image.\n\n` +
      `## Content recommendations\n\n` +
      `- One page per core service, each targeting a clear search intent.\n` +
      `- A location page or prominent NAP (name, address, phone) for local search.\n` +
      `- A few helpful articles answering the questions customers actually ask.\n` +
      `- A claimed, consistent Google Business Profile.\n\n` +
      `## Not checked yet (honest scope)\n\n` +
      `This tool does **not** yet cover: backlink profile / off-page authority, live keyword rankings, ` +
      `competitor analysis, or a full-site technical crawl (broken links, Core Web Vitals). Those land with the full crawler later.`;

    const system =
      `${a.promptBlock()}\n\n` +
      `You write an SEO RECOMMENDATIONS report (not an "audit") on the REPORT channel (markdown). ` +
      `${findings ? "Incorporate the live on-page findings provided; do not invent metrics beyond them." : "You have no live page data — give best-practice guidance only; do not invent metrics."} ` +
      `Always include an honest "Not checked yet" section (backlinks, rankings, competitors, full crawl).`;
    const prompt = `Domain: ${domain}. ${findings ? `Live findings: ${JSON.stringify(findings)}` : "No live findings."}`;

    await emitTrace.work("compose_report", url ? `recommendations for ${domain}${findings ? " + live checks" : ""}` : "general recommendations");
    const generated = await generateDraft({ system, prompt, runId, local });
    if (!generated) {
      a.note("Service is temporarily unavailable — please try again in a few minutes.");
      return { orchestratorNotes: a.notes, noDraftReason: "service temporarily unavailable" };
    }

    return {
      draft: {
        title: `SEO recommendations — ${domain}`,
        body: finishBody("report", generated.text),
        channel: "report",
        metadata: { domain, checked_url: url ?? null, live: Boolean(findings), source: generated.source, cost_usd: generated.costUsd },
        requiresApproval: true,
      },
      orchestratorNotes: a.notes,
    };
  },
);
