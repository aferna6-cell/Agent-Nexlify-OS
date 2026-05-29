/**
 * Agent authoring helpers.
 *
 * Every agent uses these helpers so the three rules are satisfied by
 * construction rather than by remembering to check:
 *  - {@link AgentScratch.field} resolves a profile field to its real value, and
 *    records a *gap note* (for the orchestrator chat, never the draft) when the
 *    field is missing — implementing rule 2.
 *  - {@link AgentScratch.trace} is a {@link TraceBuilder}, which can only report
 *    a successful load over non-empty data — implementing rule 1.
 *  - {@link finishDraft} routes SMS-class bodies through markdown stripping and
 *    asserts plain text — implementing rule 3.
 */

import { isPlainTextChannel, stripMarkdown } from "../channels.js";
import type { SharedContext } from "../context/sharedContext.js";
import {
  resolveField,
  signoffName,
  type BusinessProfile,
} from "../profile.js";
import { TraceBuilder } from "../trace/trace.js";
import type {
  AgentDefinition,
  AgentRunInput,
  AgentRunResult,
  Channel,
  Draft,
} from "../types.js";

/** Human-readable labels for profile fields used in gap notes. */
const FIELD_LABEL: Partial<Record<keyof BusinessProfile, string>> = {
  business_name: "business name",
  owner_name: "your name",
  industry: "industry",
  city: "city",
  state: "state",
  phone: "phone number",
  email: "email",
  website: "website",
  hours: "business hours",
  review_link_google: "Google review link",
  review_link_yelp: "Yelp review link",
  review_link_facebook: "Facebook review link",
  payment_link: "payment link",
};

export class AgentScratch {
  readonly trace = new TraceBuilder();
  /** Notes surfaced in the orchestrator chat — never placed in the draft. */
  readonly notes: string[] = [];
  private readonly gaps = new Set<keyof BusinessProfile>();

  constructor(private readonly profile: BusinessProfile) {}

  /**
   * Resolve a profile field to its real value. On a miss, records an
   * orchestrator gap note once and returns undefined — the caller decides how to
   * keep the draft safe (omit, or use neutral phrasing). Never returns a
   * bracketed placeholder.
   */
  field(name: keyof BusinessProfile): string | undefined {
    const res = resolveField(this.profile, name);
    if (res.present) return res.value;
    if (!this.gaps.has(name)) {
      this.gaps.add(name);
      const label = FIELD_LABEL[name] ?? String(name);
      this.notes.push(
        `Heads up — I don't have your ${label} on file, so I left it out of this draft. Want to add it to your profile so I can include it next time?`,
      );
    }
    return undefined;
  }

  /** The signoff name (owner name, else business name, else undefined). */
  signoff(): string | undefined {
    const res = signoffName(this.profile);
    if (res.present) return res.value;
    // Record both possible gaps so the owner knows what's missing.
    this.field("owner_name");
    return undefined;
  }

  /** Record an arbitrary orchestrator-chat note (flags, KB gaps, etc.). */
  note(message: string): void {
    this.notes.push(message);
  }

  /**
   * Honestly loads the business profile into the trace, summarising the fields
   * that are actually present. Reports `empty` when the profile has nothing.
   */
  loadProfile(): void {
    const present = (
      [
        "business_name",
        "owner_name",
        "industry",
        "city",
        "phone",
        "website",
      ] as (keyof BusinessProfile)[]
    ).filter((f) => resolveField(this.profile, f).present);
    this.trace.load(
      "Business profile",
      present,
      (d) => `loaded ${(d as string[]).join(", ")}`,
      "no business profile on file yet — drafting without it and flagging the gap",
    );
  }
}

/**
 * Finalises a draft, enforcing channel formatting. For plain-text channels the
 * body is stripped of any stray markdown before return (rule 3 belt-and-braces;
 * the registry still validates the result).
 */
export function finishDraft(args: {
  title: string;
  body: string;
  channel: Channel;
  metadata?: Record<string, unknown>;
  requiresApproval: boolean;
}): Draft {
  const body = isPlainTextChannel(args.channel) ? stripMarkdown(args.body) : args.body;
  return {
    title: args.title,
    body: body.trim(),
    channel: args.channel,
    metadata: args.metadata ?? {},
    requiresApproval: args.requiresApproval,
  };
}

/** Assemble an AgentRunResult from a scratch + optional draft. */
export function result(
  def: AgentDefinition,
  scratch: AgentScratch,
  draft: Draft | undefined,
  noDraftReason?: string,
): AgentRunResult {
  return {
    agent_id: def.agent_id,
    draft,
    orchestratorNotes: scratch.notes,
    trace: scratch.trace.build(),
    noDraftReason,
  };
}

// --- typed param accessors -------------------------------------------------

export function str(input: AgentRunInput, name: string, fallback = ""): string {
  const v = input.params[name];
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

export function optStr(input: AgentRunInput, name: string): string | undefined {
  const v = input.params[name];
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

export function num(input: AgentRunInput, name: string, fallback = 0): number {
  const v = input.params[name];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/[$,]/g, ""));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function arr<T = unknown>(input: AgentRunInput, name: string): T[] {
  const v = input.params[name];
  return Array.isArray(v) ? (v as T[]) : [];
}

export function bool(input: AgentRunInput, name: string, fallback = false): boolean {
  const v = input.params[name];
  return typeof v === "boolean" ? v : fallback;
}

/** Formats a currency amount as `$1,100` (no decimals when whole). */
export function money(amount: number): string {
  const whole = Math.round(amount * 100) / 100;
  const hasCents = whole % 1 !== 0;
  return `$${whole.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export { SharedContext };
