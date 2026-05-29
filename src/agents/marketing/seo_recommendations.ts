import type { AgentDefinition } from "../../types.js";
import { AgentScratch, finishDraft, optStr, result } from "../base.js";

/**
 * SEO Recommendations (seo_recommendations) — marketing · workaround · P3.
 *
 * Returns generic SEO best-practice recommendations for the owner's URL plus
 * basic on-page checks. Does NOT perform a full crawl. Marketing note: sell as
 * "SEO recommendations," not "SEO audit." The report is explicit about what is
 * NOT being checked yet, to set honest expectations.
 */
export const seoRecommendations: AgentDefinition = {
  agent_id: "seo_recommendations",
  display_name: "SEO Recommendations",
  bucket: "marketing",
  status: "workaround",
  build_priority: "P3",
  purpose:
    "Returns generic SEO best-practice recommendations + basic on-page checks for the owner's URL. Not a full crawl.",
  routing: {
    routes_here_when: ["Owner asks for an SEO audit / SEO check / SEO recommendations"],
    keywords: ["seo", "search engine", "rank", "ranking", "google ranking", "meta", "keywords", "audit"],
    strong_signals: ["seo audit", "seo check", "seo recommendations", "improve my seo"],
  },
  channel: "report",
  inputs: {
    from_owner: [
      {
        name: "url",
        type: "string",
        required: false,
        description: "URL to evaluate. Defaults to business_profile.website.",
      },
    ],
    from_shared_context: ["business_profile"],
  },
  tool_dependencies: ["seo_check"],
  permission_scope: { default: "drafts_only" },
  triggers_supported: { manual: true },
  outputs: {
    title_format: "SEO recommendations — {domain}",
    body_format:
      "On-page basics, content recommendations, and an explicit list of what's NOT checked yet.",
    metadata: ["domain", "checked_url"],
  },
  reasoning_trace_steps: [
    { name: "Business profile", kind: "load", description: "Load profile (for website fallback)." },
    { name: "Target URL", kind: "load", description: "Resolve which URL to evaluate." },
    { name: "On-page checks", kind: "work", description: "Run lightweight on-page best-practice checks." },
  ],
  example_interactions: [
    {
      owner_ask: "Run an SEO audit on my site.",
      expected_route: "seo_recommendations",
      expected_output_excerpt: "Not checked yet",
    },
    {
      owner_ask: "Give me SEO recommendations for example.com.",
      expected_route: "seo_recommendations",
      expected_output_excerpt: "On-page",
    },
    {
      owner_ask: "How can I improve my Google ranking?",
      expected_route: "seo_recommendations",
      expected_output_excerpt: "recommendations",
    },
  ],

  run(input, ctx, _deps) {
    const s = new AgentScratch(ctx.business_profile);
    s.loadProfile();

    const explicitUrl = optStr(input, "url");
    const profileUrl = s.field("website");
    const url = explicitUrl ?? profileUrl;

    // Honest trace: only report a resolved URL if we actually have one.
    s.trace.load(
      "Target URL",
      url,
      (d) => `evaluating ${String(d)}`,
      "no URL provided and no website on file — returning general recommendations only",
    );

    if (!url) {
      s.note(
        "I don't have a website on file and you didn't give me a URL, so this is general guidance. Add your website to your profile (or paste a URL) and I can tailor the on-page checks.",
      );
    }

    const domain = url ? toDomain(url) : "your site";
    s.trace.work("On-page checks", url ? `best-practice checklist for ${domain}` : "general best-practice checklist");

    const body =
      `# SEO recommendations — ${domain}\n\n` +
      (url
        ? `These are best-practice recommendations and on-page checks for **${url}**. This is not a full crawl.\n\n`
        : `These are general best-practice recommendations. Add your website to get checks specific to your pages.\n\n`) +
      `## On-page basics to verify\n\n` +
      `- **Title tag**: unique, ≤ 60 characters, includes your main service + city.\n` +
      `- **Meta description**: 140–160 characters, written to earn the click.\n` +
      `- **Heading structure**: exactly one H1; logical H2/H3 nesting.\n` +
      `- **Mobile viewport**: \`<meta name="viewport">\` present; tap targets large enough.\n` +
      `- **Image alt text**: descriptive alt on every meaningful image.\n\n` +
      `## Content recommendations\n\n` +
      `- Create one page per core service, each targeting a clear search intent.\n` +
      `- Add a location page or prominent NAP (name, address, phone) for local search.\n` +
      `- Publish a few helpful articles answering the questions customers actually ask.\n` +
      `- Make sure your Google Business Profile is claimed and consistent with your site.\n\n` +
      `## Not checked yet (honest scope)\n\n` +
      `This tool does **not** yet cover:\n\n` +
      `- Backlink profile / off-page authority\n` +
      `- Live keyword rankings\n` +
      `- Competitor analysis\n` +
      `- Full-site crawl & technical audit (broken links, crawl budget, Core Web Vitals)\n\n` +
      `Those land with the full crawler in a later release.`;

    const draft = finishDraft({
      title: `SEO recommendations — ${domain}`,
      body,
      channel: "report",
      metadata: { domain, checked_url: url ?? null },
      requiresApproval: true,
    });
    return result(seoRecommendations, s, draft);
  },
};

function toDomain(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]!;
}
