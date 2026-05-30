/**
 * Heuristic parameter extraction.
 *
 * Used by the heuristic classifier and as a fallback when Haiku doesn't return
 * params. Turns the ask into a small bag of typed params (customer name, dollar
 * amount, platform, slot, etc.). Agents tolerate missing params.
 */

const NAME_TRIGGERS = ["for", "to", "with", "from", "text", "email", "call", "remind", "ask", "tell", "send", "contact"];
const STOPWORDS = new Set([
  "the", "a", "an", "my", "our", "your", "me", "us", "them", "everyone", "customer",
  "customers", "client", "lead", "leads", "tomorrow", "today", "please", "review", "him", "her", "their",
]);

function extractName(ask: string): string | undefined {
  // Leading "Firstname [Lastname] <action-verb>" (e.g. "Mike Johnson called …").
  const lead = ask.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(?:called|wants?|wanted|needs?|asked|emailed|texted|reached out|stopped by)/);
  if (lead) return lead[1];

  const tokens = ask.split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i++) {
    const w = tokens[i]!.toLowerCase().replace(/[^a-z]/g, "");
    if (!NAME_TRIGGERS.includes(w)) continue;
    const name: string[] = [];
    for (let j = i + 1; j < tokens.length && name.length < 2; j++) {
      const raw = tokens[j]!.replace(/[^A-Za-z'-]/g, "");
      if (/^[A-Z][a-zA-Z'-]+$/.test(raw) && !STOPWORDS.has(raw.toLowerCase())) name.push(raw);
      else break;
    }
    if (name.length > 0) return name.join(" ");
  }
  return undefined;
}

function extractMoney(ask: string): number | undefined {
  const m = ask.match(/\$\s?(\d[\d,]*(?:\.\d{2})?)/);
  return m ? Number(m[1]!.replace(/,/g, "")) : undefined;
}

function extractPlatform(ask: string): string | undefined {
  const a = ask.toLowerCase();
  if (a.includes("yelp")) return "Yelp";
  if (a.includes("facebook") || a.includes(" fb")) return "Facebook";
  if (a.includes("instagram") || a.includes(" ig")) return "Instagram";
  if (a.includes("linkedin")) return "LinkedIn";
  if (a.includes("google")) return "Google";
  return undefined;
}

function extractSlot(ask: string): string | undefined {
  const day = ask.match(/\b((?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow)\b/i);
  const time = ask.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
  const d = day ? day[1]![0]!.toUpperCase() + day[1]!.slice(1).toLowerCase() : undefined;
  const t = time ? time[1]!.replace(/\s+/g, "").toLowerCase() : undefined;
  if (d && t) return `${d} at ${t}`;
  return d ?? t;
}

export function extractParams(ask: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const name = extractName(ask);
  const amount = extractMoney(ask);
  const platform = extractPlatform(ask);
  const slot = extractSlot(ask);
  if (name) params.customer_name = name;
  if (amount !== undefined) params.amount = amount;
  if (platform) params.platform = platform;
  if (slot) params.offered_slot = slot;
  params.request = ask;
  return params;
}
