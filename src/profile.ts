/**
 * Business profile — the signup data that must be wired into every agent.
 *
 * The single highest-leverage substrate fix (Phase 1 of the product plan) is
 * making this data available to every worker so drafts never contain
 * `[Shop Name]` / `[Your Name]` / `[Phone]` placeholders. This module models the
 * profile and provides the field-resolution helper that powers rule 2.
 */

export interface BusinessHours {
  /** e.g. "Mon–Fri 8am–6pm" */
  summary?: string;
  timezone?: string;
}

export interface BusinessProfile {
  business_name?: string;
  owner_name?: string;
  industry?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: BusinessHours;
  /** Owner-curated review links, configured later. */
  review_link_google?: string;
  review_link_yelp?: string;
  review_link_facebook?: string;
  /** Payment link used by finance agents when available. */
  payment_link?: string;
}

/**
 * Profile fields that, per rule 2, must never appear as a `[Bracketed]`
 * placeholder in a customer-facing draft when the field exists. Maps a
 * canonical field key to the placeholder tokens that would indicate the rule
 * was violated.
 */
export const PROFILE_PLACEHOLDER_TOKENS: Record<keyof BusinessProfile, string[]> = {
  business_name: ["[Shop Name]", "[Business Name]", "[Company]", "[Company Name]"],
  owner_name: ["[Your Name]", "[Owner Name]", "[Name]"],
  industry: ["[Industry]"],
  city: ["[City]", "[Location]"],
  state: ["[State]"],
  phone: ["[Phone]", "[Phone Number]"],
  email: ["[Email]"],
  website: ["[Website]", "[URL]"],
  hours: ["[Hours]", "[Business Hours]"],
  review_link_google: ["[Google Review Link]", "[Review Link]"],
  review_link_yelp: ["[Yelp Link]"],
  review_link_facebook: ["[Facebook Link]"],
  payment_link: ["[Payment Link]"],
};

export interface FieldResolution {
  present: boolean;
  value?: string;
}

/** Returns the real value of a profile field, or marks it missing. */
export function resolveField(
  profile: BusinessProfile,
  field: keyof BusinessProfile,
): FieldResolution {
  const raw = profile[field];
  if (raw == null) return { present: false };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? { present: true, value: trimmed } : { present: false };
  }
  if (field === "hours") {
    const hrs = raw as BusinessHours;
    if (hrs.summary && hrs.summary.trim().length > 0) {
      return { present: true, value: hrs.summary.trim() };
    }
    return { present: false };
  }
  return { present: false };
}

/** Owner-facing signoff name: owner name if present, else business name. */
export function signoffName(profile: BusinessProfile): FieldResolution {
  const owner = resolveField(profile, "owner_name");
  if (owner.present) return owner;
  return resolveField(profile, "business_name");
}
