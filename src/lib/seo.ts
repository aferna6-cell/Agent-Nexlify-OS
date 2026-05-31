/**
 * seo_check — a lightweight on-page checker (not a full crawl).
 *
 * Fetches a URL with a 5-second timeout, parses the HTML with simple regexes,
 * and returns structured findings: title tag, meta description, H1 count,
 * viewport meta, and image alt-text coverage. On any failure (no network,
 * timeout, non-OK status) it returns `{ ok: false }` so the agent can fall back
 * to general recommendations honestly rather than inventing results.
 */

export interface SeoFindings {
  ok: true;
  url: string;
  title?: string;
  titleLength: number;
  metaDescription?: string;
  metaDescriptionLength: number;
  h1Count: number;
  hasViewport: boolean;
  imgTotal: number;
  imgWithAlt: number;
}

export interface SeoFailure {
  ok: false;
  url: string;
  error: string;
}

const TIMEOUT_MS = 5000;

export async function seoCheck(url: string): Promise<SeoFindings | SeoFailure> {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(normalized, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AgentOS-SEOCheck/0.1" },
    });
    if (!res.ok) return { ok: false, url: normalized, error: `HTTP ${res.status}` };
    const html = await res.text();
    return parseHtml(normalized, html);
  } catch (err) {
    const error = err instanceof Error ? (err.name === "AbortError" ? "timed out after 5s" : err.message) : "fetch failed";
    return { ok: false, url: normalized, error };
  } finally {
    clearTimeout(timer);
  }
}

export function parseHtml(url: string, html: string): SeoFindings {
  const head = html.slice(0, 200_000); // cap work on huge pages

  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const metaDescription = head
    .match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0]
    ?.match(/content=["']([^"']*)["']/i)?.[1]
    ?.trim();
  const h1Count = (head.match(/<h1[\s>]/gi) ?? []).length;
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(head);

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgWithAlt = imgTags.filter((t) => /\balt\s*=\s*["'][^"']*["']/i.test(t) && !/\balt\s*=\s*["']\s*["']/i.test(t)).length;

  return {
    ok: true,
    url,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    h1Count,
    hasViewport,
    imgTotal: imgTags.length,
    imgWithAlt,
  };
}
