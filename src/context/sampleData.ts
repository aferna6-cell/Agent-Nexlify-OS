/**
 * Demo data — Sunset Mobile Detailing.
 *
 * The QA report and library examples are anchored on this auto-detailing
 * business, so the demo and tests use it as the substrate. The profile is
 * deliberately complete (so drafts use real values) except for a couple of
 * fields left blank to exercise the honest gap-surfacing behaviour.
 */

import type { BusinessProfile } from "../profile.js";
import type { SharedContext } from "./sharedContext.js";

export const SUNSET_PROFILE: BusinessProfile = {
  business_name: "Sunset Mobile Detailing",
  owner_name: "Alex",
  industry: "auto detailing",
  city: "Phoenix",
  state: "AZ",
  phone: "(602) 555-0148",
  email: "alex@sunsetdetailing.com",
  website: "https://sunsetdetailing.com",
  hours: { summary: "Mon–Sat 8am–6pm", timezone: "America/Phoenix" },
  review_link_google: "https://g.page/r/sunset-detailing/review",
  // payment_link intentionally omitted to demonstrate the finance gap note.
};

/** A populated context for the demo: some widget chats, leads, appointments. */
export function sampleContext(): SharedContext {
  return {
    business_profile: SUNSET_PROFILE,
    widget_history: [
      {
        id: "w1",
        contactName: "Mike",
        date: "2026-05-26",
        intent: "question",
        summary: "Asked about hybrid battery service on a 2018 Prius.",
        topics: ["hybrid", "battery"],
      },
      {
        id: "w2",
        contactName: "Dana",
        date: "2026-05-27",
        intent: "qualified_lead",
        summary: "Interested in a full repaint quote.",
        topics: ["repaint", "quote"],
      },
    ],
    pipeline_state: {
      leads: [
        { id: "l1", name: "Dana", status: "quoted", subject: "full repaint", quoteAmount: 2400, lastContactDate: "2026-05-22" },
        { id: "l2", name: "Sarah", status: "stale", subject: "consultation", lastContactDate: "2026-05-12" },
      ],
      appointments: [
        { id: "a1", customerName: "Jake", date: "Saturday 10am", service: "detailing", status: "scheduled" },
        { id: "a2", customerName: "Maria", date: "2026-05-25", service: "interior detail", status: "completed" },
      ],
    },
    agent_run_history: [
      { agent_id: "campaign", date: "2026-05-20", title: "Email blast — Spring special", outcome: "approved" },
    ],
    kb: [
      {
        topic: "hours",
        answer: "We're open Mon–Sat 8am–6pm and we come to you anywhere in the Phoenix metro area.",
      },
    ],
  };
}

/** A near-empty context (only the profile) for demonstrating honest fallbacks. */
export function quietContext(profile: BusinessProfile = SUNSET_PROFILE): SharedContext {
  return {
    business_profile: profile,
    widget_history: [],
    pipeline_state: { leads: [], appointments: [] },
    agent_run_history: [],
    kb: [],
  };
}
