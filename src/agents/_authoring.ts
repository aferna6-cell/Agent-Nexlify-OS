/**
 * Agent authoring helpers — the substrate fix + rule 2 by construction.
 *
 * `Authoring` resolves business-profile fields to their real values and records
 * a *gap note for the orchestrator chat* (never the draft) when a field is
 * missing. It also builds the business-profile block that goes at the top of
 * every agent's system prompt, and tracks orchestrator notes.
 */

import type { BusinessProfileData } from "../types/agent.js";

/** Profile fields, in the order they appear in the system-prompt block. */
const PROFILE_FIELDS: { key: keyof BusinessProfileData; label: string }[] = [
  { key: "businessName", label: "Business name" },
  { key: "ownerName", label: "Owner name" },
  { key: "businessType", label: "Business type" },
  { key: "industry", label: "Industry" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "hoursSummary", label: "Hours" },
  { key: "paymentLink", label: "Payment link" },
  { key: "reviewLinkGoogle", label: "Google review link" },
  { key: "reviewLinkYelp", label: "Yelp review link" },
  { key: "reviewLinkFacebook", label: "Facebook review link" },
];

const FIELD_LABEL: Partial<Record<keyof BusinessProfileData, string>> = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, f.label.toLowerCase()]),
);

export function resolveField(profile: BusinessProfileData, key: keyof BusinessProfileData): string | undefined {
  const v = profile[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * First name for a casual greeting (B-11): "Sarah Chen" → "Sarah". Leaves
 * single-token names alone and trims punctuation. Returns undefined for empty.
 */
export function firstName(full: string | undefined): string | undefined {
  if (!full) return undefined;
  const first = full.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first.replace(/[^A-Za-z'-]/g, "") || undefined : undefined;
}

/** The names of the profile fields that actually have data (for the honest trace). */
export function presentProfileFields(profile: BusinessProfileData): string[] {
  return PROFILE_FIELDS.map((f) => f.key).filter((k) => resolveField(profile, k) !== undefined);
}

export class Authoring {
  readonly notes: string[] = [];
  private readonly gaps = new Set<keyof BusinessProfileData>();

  constructor(private readonly profile: BusinessProfileData) {}

  /** Real value, or undefined + a one-time orchestrator gap note. */
  field(key: keyof BusinessProfileData): string | undefined {
    const v = resolveField(this.profile, key);
    if (v !== undefined) return v;
    if (!this.gaps.has(key)) {
      this.gaps.add(key);
      const label = FIELD_LABEL[key] ?? String(key);
      this.notes.push(
        `Heads up — I don't have your ${label} on file, so I left it out of this draft. Add it to your profile and I'll include it next time.`,
      );
    }
    return undefined;
  }

  /** Owner name if present, else business name. */
  signoff(): string | undefined {
    return resolveField(this.profile, "ownerName") ?? this.field("businessName");
  }

  note(message: string): void {
    this.notes.push(message);
  }

  /** The business-profile block placed at the top of the system prompt. */
  promptBlock(): string {
    const lines = PROFILE_FIELDS.map((f) => {
      const v = resolveField(this.profile, f.key);
      return v ? `- ${f.label}: ${v}` : null;
    }).filter(Boolean);
    if (lines.length === 0) {
      return "Business profile: (none on file — do not invent details; never emit bracketed placeholders).";
    }
    return `Business profile (use these real values; never emit bracketed placeholders):\n${lines.join("\n")}`;
  }
}
