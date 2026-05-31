/**
 * Heuristic parameter extraction.
 *
 * Used by the heuristic classifier and as a fallback when Haiku doesn't return
 * params. Turns the ask into a small bag of typed params (customer name, dollar
 * amount, platform, slot, etc.). Agents tolerate missing params.
 */

const NAME_TRIGGERS = [
  "for", "to", "with", "from", "text", "email", "call", "remind", "ask", "tell", "send", "contact",
  // imperative booking/finance verbs that precede a customer name (B-08):
  "confirm", "book", "schedule", "reschedule", "cancel", "follow", "chase", "invoice", "quote", "thank",
];
const STOPWORDS = new Set([
  "the", "a", "an", "my", "our", "your", "me", "us", "them", "everyone", "customer",
  "customers", "client", "lead", "leads", "tomorrow", "today", "please", "review", "him", "her", "their",
]);

function extractName(ask: string): string | undefined {
  // Leading "Firstname [Lastname] <action-verb>" (e.g. "Mike Johnson called …").
  const lead = ask.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(?:called|wants?|wanted|needs?|asked|emailed|texted|reached out|stopped by)/);
  if (lead) return lead[1];

  // Possessive: "<name>'s <thing>" (e.g. "Confirm Mike Johnson's tire rotation").
  const poss = ask.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)'s\b/);
  if (poss && !STOPWORDS.has(poss[1]!.toLowerCase())) return poss[1];

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

/** Common auto-shop services, matched verbatim from the ask (B-04). */
function extractServiceType(ask: string): string | undefined {
  const a = ask.toLowerCase();
  const services: [RegExp, string][] = [
    [/\btire rotation(?:s)?\b/, "tire rotation"],
    [/\boil change\b/, "oil change"],
    [/\bbrake(?:\s+(?:pad|job|service|inspection|repair))?\b/, "brake service"],
    [/\b(?:ac|a\/c|air con(?:ditioning)?)\s*(?:recharge|service|repair|check)?\b/, "AC service"],
    [/\balignment\b/, "alignment"],
    [/\binspection\b/, "inspection"],
    [/\bdetail(?:ing)?\b/, "detailing"],
    [/\bbattery\b/, "battery service"],
    [/\btune[\s-]?up\b/, "tune-up"],
    [/\btransmission\b/, "transmission service"],
  ];
  for (const [re, label] of services) if (re.test(a)) return label;
  return undefined;
}

/** Vehicle reference like "2019 F-150" / "2018 Prius" / "Honda Civic" (B-04). */
function extractVehicle(ask: string): string | undefined {
  // Year + ONE model token (optionally hyphenated, e.g. "F-150"). Bounded so it
  // doesn't swallow trailing words like "for Thursday".
  const yearModel = ask.match(/\b(?:19|20)\d{2}\s+([A-Z][A-Za-z]*(?:-?\d+[A-Za-z]*)?|[A-Z][a-z]+)\b/);
  if (yearModel) return yearModel[0].trim();
  // Known make + optional model token, e.g. "Honda Civic", "Ford F-150".
  const make = ask.match(
    /\b(Toyota|Honda|Ford|Chevy|Chevrolet|Nissan|BMW|Audi|Tesla|Subaru|Jeep|Dodge|Ram|GMC|Kia|Hyundai|Mazda|Volkswagen|VW|Lexus|Prius)\b(?:\s+([A-Z][A-Za-z]*(?:-?\d+[A-Za-z]*)?))?/i,
  );
  if (make) return make[0].trim();
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
  const serviceType = extractServiceType(ask);
  const vehicle = extractVehicle(ask);
  if (name) params.customer_name = name;
  if (amount !== undefined) params.amount = amount;
  if (platform) params.platform = platform;
  if (slot) params.offered_slot = slot;
  if (serviceType) params.service_type = serviceType;
  if (vehicle) params.vehicle = vehicle;
  params.request = ask;
  return params;
}
