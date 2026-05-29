/**
 * Parameter-extraction layer.
 *
 * Turns a natural-language ask into typed params for a chosen agent. This is
 * what separates a template platform from "prompts with a router." The
 * extraction is heuristic and deterministic; agents tolerate missing params by
 * falling back to the verbatim ask, so extraction need not be perfect.
 */

import type { AgentDefinition } from "../types.js";

const PREPOSITIONS = ["for", "to", "with", "from"];
/** Verbs whose direct object is often the customer ("text Maria", "remind Jake"). */
const NAME_VERBS = [
  "text", "email", "call", "remind", "ask", "tell", "send", "message", "contact",
];
const STOPWORDS = new Set([
  "the","a","an","my","our","your","his","her","their","this","that","me","us","them",
  "everyone","everybody","customer","customers","client","clients","lead","leads","tomorrow",
  "today","please","review","reminder","quote","invoice","appointment","i","we",
]);

/** Find a likely person name following a preposition or an addressing verb. */
function extractName(ask: string): string | undefined {
  const tokens = ask.split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i++) {
    const word = tokens[i]!.toLowerCase().replace(/[^a-z]/g, "");
    if (!PREPOSITIONS.includes(word) && !NAME_VERBS.includes(word)) continue;
    // collect up to two following Capitalized tokens
    const name: string[] = [];
    for (let j = i + 1; j < tokens.length && name.length < 2; j++) {
      const raw = tokens[j]!.replace(/[^A-Za-z'-]/g, "");
      if (/^[A-Z][a-zA-Z'-]+$/.test(raw) && !STOPWORDS.has(raw.toLowerCase())) {
        name.push(raw);
      } else break;
    }
    if (name.length > 0) return name.join(" ");
  }
  return undefined;
}

function extractMoney(ask: string): number | undefined {
  const m = ask.match(/\$\s?(\d[\d,]*(?:\.\d{2})?)/);
  if (m) return Number(m[1]!.replace(/,/g, ""));
  return undefined;
}

function extractPlatform(ask: string): string | undefined {
  const a = ask.toLowerCase();
  if (a.includes("yelp")) return "Yelp";
  if (a.includes("facebook") || a.includes("fb")) return "Facebook";
  if (a.includes("instagram") || a.includes(" ig ")) return "Instagram";
  if (a.includes("linkedin")) return "LinkedIn";
  if (a.includes("twitter") || a.includes(" x ") || a.includes("tweet")) return "X";
  if (a.includes("google")) return "Google";
  return undefined;
}

function extractDaysOverdue(ask: string): number | undefined {
  const m = ask.match(/(\d+)\s*days?\s*(?:over\s?due|past\s?due|late)/i);
  return m ? Number(m[1]) : undefined;
}

function extractInvoiceNumber(ask: string): string | undefined {
  const m = ask.match(/(?:invoice|inv)\s*#?\s*(\d{2,})/i);
  return m ? `#${m[1]}` : undefined;
}

function extractSlot(ask: string): string | undefined {
  const dayMatch = ask.match(/\b((?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow)\b/i);
  const timeMatch = ask.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (!dayMatch && !timeMatch) return undefined;
  const day = dayMatch ? capitalize(dayMatch[1]!.toLowerCase()) : undefined;
  const time = timeMatch ? timeMatch[1]!.replace(/\s+/g, "").toLowerCase() : undefined;
  if (day && time) return `${day} at ${time}`;
  return day ?? time;
}

function extractServiceItems(ask: string): { description: string; price: number; quantity: number }[] {
  // Pattern: "<label> $<amount>" repeated, e.g. "parts $620, labor $480"
  const items: { description: string; price: number; quantity: number }[] = [];
  const re = /([A-Za-z][A-Za-z \-/]{1,40}?)\s*\$\s?(\d[\d,]*(?:\.\d{2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ask)) !== null) {
    const description = m[1]!.replace(/\b(for|terms|net|the|a|an|of|on|his|her|their)\b/gi, "").trim();
    const price = Number(m[2]!.replace(/,/g, ""));
    if (description.length > 1 && price > 0) {
      items.push({ description: capitalize(description), price, quantity: 1 });
    }
  }
  return items;
}

function extractFormatHint(ask: string): string | undefined {
  const a = ask.toLowerCase();
  if (a.includes("list") || a.includes("ideas")) return "list";
  if (a.includes("memo")) return "memo";
  if (a.includes("paragraph")) return "paragraph";
  return undefined;
}

function extractLengthHint(ask: string): string | undefined {
  return /\b(short|brief|concise|quick|keep it short)\b/i.test(ask) ? "keep it short" : undefined;
}

/** The offer body for a campaign — the ask minus framing verbs and length hints. */
function extractOffer(ask: string): string | undefined {
  const cleaned = ask
    .replace(
      /^\s*(?:write|draft|create|send|make)?\s*(?:me\s+)?(?:an?\s+)?(?:email\s+)?(?:blast|campaign|promo(?:tion)?|announcement|email)\s*(?:for|about|announcing)?\s*/i,
      "",
    )
    .replace(/\.?\s*keep it (short|brief|concise).*/i, "")
    .trim();
  return cleaned.length > 3 ? cleaned : undefined;
}

/** The scope of a quote — text immediately before/after the word "quote". */
function extractQuoteScope(ask: string): string | undefined {
  const m = ask.match(/(?:the\s+)?\$?[\d,]*\s*([a-z][a-z \-]+?)\s+quote/i);
  if (m && m[1] && m[1].trim().length > 2) return m[1].trim();
  return undefined;
}

/** The completed service for a review request — after "for"/"her"/"his". */
function extractServiceCompleted(ask: string): string | undefined {
  const m = ask.match(/(?:after|for)\s+(?:his|her|their|the)?\s*([a-z][a-z \-]+?)(?:\.|$)/i);
  if (m && m[1]) {
    const svc = m[1].replace(/\b(review|service|yesterday|today|last week)\b/gi, "").trim();
    if (svc.length > 2) return svc;
  }
  return undefined;
}

/** Channel inference (§11 rule 4). */
export function inferChannel(ask: string): "sms" | "email" | undefined {
  const a = ask.toLowerCase();
  if (/\btext\b|\bsms\b|\btext\s+(?:her|him|them|message)/.test(a)) return "sms";
  if (/\bemail\b/.test(a)) return "email";
  return undefined;
}

/** Extract typed params for a chosen agent from the ask. */
export function extractParams(def: AgentDefinition, ask: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const name = extractName(ask);
  const amount = extractMoney(ask);
  const platform = extractPlatform(ask);

  // Apply defaults declared on the agent's owner inputs.
  for (const f of def.inputs.from_owner) {
    if (f.default !== undefined) params[f.name] = f.default;
  }

  const setIf = (field: string, value: unknown): void => {
    if (value === undefined) return;
    if (def.inputs.from_owner.some((f) => f.name === field)) params[field] = value;
  };

  setIf("customer_name", name);
  setIf("quote_amount", amount);
  setIf("invoice_amount", amount);
  setIf("platform_preference", platform);
  setIf("platform", platform?.toLowerCase());
  setIf("days_overdue", extractDaysOverdue(ask));
  setIf("invoice_number", extractInvoiceNumber(ask));
  setIf("offered_slot", extractSlot(ask));
  setIf("format_hint", extractFormatHint(ask));
  setIf("length_hint", extractLengthHint(ask));
  setIf("offer_details", extractOffer(ask));
  setIf("quote_scope", extractQuoteScope(ask));
  setIf("service_completed", extractServiceCompleted(ask));

  if (def.agent_id === "quote_generator") {
    const items = extractServiceItems(ask);
    if (items.length > 0) params.service_items = items;
  }

  // Verbatim-ask fields each agent expects.
  setIf("customer_question", ask);
  setIf("complaint_text", ask);
  setIf("request", ask);
  setIf("topic", stripLeadingVerb(ask));
  setIf("transcript", ask);

  return params;
}

function stripLeadingVerb(ask: string): string {
  return ask.replace(/^(write|draft|create|make|compose|give me)\s+(me\s+)?(a|an|the)?\s*/i, "").trim();
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
