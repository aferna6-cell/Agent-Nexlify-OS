/**
 * The 8 department heads (Agent Library v2). Each bundles v1 worker agents as
 * internal skills; see docs/AgentNexLiFy_Agent_Library_v2.md.
 */

import { defineDepartment } from "./_department.js";

// v1 worker agents, now used as internal skills.
import { booking } from "./booking/agent.js";
import { appointmentReminder } from "./appointment_reminder/agent.js";
import { customerQuestion } from "./customer_question/agent.js";
import { complaintHandler } from "./complaint_handler/agent.js";
import { leadNurture } from "./lead_nurture/agent.js";
import { quoteFollowUp } from "./quote_follow_up/agent.js";
import { quoteGenerator } from "./quote_generator/agent.js";
import { campaign } from "./campaign/agent.js";
import { contentWriter } from "./content_writer/agent.js";
import { socialPost } from "./social_post/agent.js";
import { reviewRequest } from "./review_request/agent.js";
import { seoRecommendations } from "./seo_recommendations/agent.js";
import { aiVisibilityStub } from "./ai_visibility_stub/agent.js";
import { invoiceReminder } from "./invoice_reminder/agent.js";
import { paymentFollowUp } from "./payment_follow_up/agent.js";
import { weeklyBriefing } from "./weekly_briefing/agent.js";

// v2 department-head skills (new).
import { financialSummary } from "./financial_summary/agent.js";
import { pricingMemo } from "./pricing_memo/agent.js";
import { taxPrep } from "./tax_prep/agent.js";
import { jobPost } from "./job_post/agent.js";
import { trainingDoc } from "./training_doc/agent.js";
import { hrMemo } from "./hr_memo/agent.js";
import { documentDrafter } from "./document_drafter/agent.js";

export const sales = defineDepartment({
  agent_id: "sales",
  display_name: "Sales",
  bucket: "sales",
  channel: "sequence",
  purpose: "Brings in new customers and closes business: outreach, follow-ups, quote follow-ups, and quote documents.",
  routes_here_when: [
    "Owner follows up with a lead or prospect",
    "Owner asks to draft a quote or chase an unbooked quote",
    "Owner asks for outreach to win or re-engage customers",
  ],
  strong_signals: ["follow up", "quote", "reach out"],
  skills: [
    { agent: quoteGenerator, extraKeywords: ["draft a quote", "write up a quote", "estimate for", "parts", "labor"] },
    { agent: quoteFollowUp, extraKeywords: ["chase", "hasn't booked", "didn't book"] },
    { agent: leadNurture, extraKeywords: ["re-engage", "reach out", "lapsed", "haven't seen", "referral"] },
  ],
  defaultSkillId: "lead_nurture",
  // V-02: pipeline-aware skill selection. "Follow up with X on her quote" must
  // pull X's existing quote and run quote-followup, NOT quote-generation (which
  // would ask for line items the owner didn't give). New line items in the ask
  // → quote-generation; a named customer with an open quote + follow-up intent
  // → quote-followup; a named customer with no quote → lead nurture.
  resolveSkill: ({ ownerAsk, params, context }) => {
    const a = ownerAsk.toLowerCase();
    // Explicit new-quote drafting with line items always generates.
    const hasLineItems = /\$\s?\d/.test(ownerAsk) && /(parts|labor|part|materials|each|qty|x\d)/i.test(ownerAsk);
    if (/\b(draft|write up|create|generate|make)\b.*\bquote\b/.test(a) || hasLineItems) return "quote_generator";

    const followUpIntent = /\b(follow up|follow-up|check in|chase|circle back|nudge|touch base)\b/.test(a);
    if (!followUpIntent) return undefined; // keyword scoring handles the rest

    const name = typeof params.customer_name === "string" ? params.customer_name.trim().toLowerCase() : "";
    const lead = name
      ? context.pipelineLeads.find(
          (l) => l.name.toLowerCase().includes(name) && l.quoteAmount && !["won", "lost", "accepted", "cancelled"].includes(l.status.toLowerCase()),
        )
      : undefined;
    if (lead) return "quote_follow_up"; // existing open quote → follow up on it
    // Follow-up intent but no open quote on file → warm nurture, never a fabricated
    // quote. (Covers "follow up with a lead I haven't quoted yet".)
    return "lead_nurture";
  },
  examples: [
    { owner_ask: "Follow up with Sarah Chen on her brake quote.", expected_route: "sales", expected_output_excerpt: "quote" },
    { owner_ask: "Draft a quote for Mike Johnson, parts $620, labor $480, net 15 terms.", expected_route: "sales", expected_output_excerpt: "Total" },
    { owner_ask: "Reach out to the three customers we haven't seen in 6+ months.", expected_route: "sales", expected_output_excerpt: "Hi" },
  ],
});

export const marketing = defineDepartment({
  agent_id: "marketing",
  display_name: "Marketing",
  bucket: "marketing",
  channel: "email",
  purpose: "Advertising, social, email campaigns, content, SEO, reviews, and brand awareness.",
  routes_here_when: [
    "Owner asks for a campaign, social post, blog, or content piece",
    "Owner asks for SEO recommendations or review requests",
  ],
  strong_signals: ["campaign", "post", "blog"],
  skills: [
    { agent: campaign, extraKeywords: ["email blast", "promo", "special", "announce"] },
    { agent: socialPost, extraKeywords: ["facebook", "instagram", "social"] },
    { agent: contentWriter, extraKeywords: ["about us", "blog", "article", "paragraph", "write up"] },
    { agent: reviewRequest, extraKeywords: ["review", "google review", "testimonial"] },
    { agent: seoRecommendations, extraKeywords: ["seo", "search", "rank", "website"] },
    { agent: aiVisibilityStub, extraKeywords: ["ai visibility", "geo score", "chatgpt see"] },
  ],
  defaultSkillId: "campaign",
  examples: [
    { owner_ask: "Draft an email blast for our June AC special, $59 instead of $89.", expected_route: "marketing", expected_output_excerpt: "59" },
    { owner_ask: "Write a Facebook post about our weekend hours.", expected_route: "marketing", expected_output_excerpt: "weekend" },
    { owner_ask: "Give me SEO recommendations for our website.", expected_route: "marketing", expected_output_excerpt: "SEO" },
  ],
});

export const customerService = defineDepartment({
  agent_id: "customer_service",
  display_name: "Customer Service",
  bucket: "customer_service",
  channel: "widget_reply",
  purpose: "Handles customer questions, complaints, and retention with the hardcoded complaint-safety rules.",
  routes_here_when: [
    "Owner is responding to an inbound customer question",
    "Owner is responding to a complaint or service issue",
  ],
  strong_signals: ["respond to a complaint", "customer asked", "reply to"],
  skills: [
    { agent: complaintHandler, extraKeywords: ["angry", "upset", "complaint", "refund", "unhappy"] },
    { agent: customerQuestion, extraKeywords: ["asked", "question", "do you", "reply", "respond"] },
  ],
  defaultSkillId: "customer_question",
  examples: [
    { owner_ask: "A customer named Aisha asked: do you handle hybrids? Draft a reply.", expected_route: "customer_service", expected_output_excerpt: "Hi" },
    { owner_ask: "Robert L. is angry his AC recharge didn't hold. Draft a careful response.", expected_route: "customer_service", expected_output_excerpt: "sorry" },
    { owner_ask: "Reply to the customer asking about our weekend hours.", expected_route: "customer_service", expected_output_excerpt: "Hi" },
  ],
});

export const operations = defineDepartment({
  agent_id: "operations",
  display_name: "Operations",
  bucket: "scheduling_ops",
  channel: "sms",
  purpose: "Delivering the service: bookings, reschedules, cancellations, reminders, and day-to-day operational comms.",
  routes_here_when: [
    "Owner is communicating about appointments or scheduling",
    "Owner sends operational updates (closures, delays, order ready)",
  ],
  strong_signals: ["book", "appointment", "reschedule", "reminder"],
  skills: [
    { agent: appointmentReminder, extraKeywords: ["reminders", "tomorrow's appointments", "day-before"] },
    { agent: booking, extraKeywords: ["book", "confirm", "reschedule", "cancel", "slot"] },
  ],
  defaultSkillId: "booking",
  examples: [
    { owner_ask: "Mike Johnson called wanting a tire rotation Thursday at 10:30.", expected_route: "operations", expected_output_excerpt: "Thursday" },
    { owner_ask: "Send tomorrow's appointments their day-before reminders.", expected_route: "operations", expected_output_excerpt: "reminder" },
    { owner_ask: "Confirm Maria's Saturday 10am appointment.", expected_route: "operations", expected_output_excerpt: "confirm" },
  ],
});

export const invoicing = defineDepartment({
  agent_id: "invoicing",
  display_name: "Invoicing & Collections",
  bucket: "finance",
  channel: "email",
  purpose: "Sends invoice reminders and follows up on overdue accounts. Always owner-approved; never threatening.",
  routes_here_when: [
    "Owner mentions an outstanding or overdue invoice",
    "Owner wants to send a billing reminder or escalate a past-due notice",
  ],
  strong_signals: ["invoice", "overdue", "past due", "payment"],
  skills: [
    { agent: paymentFollowUp, extraKeywords: ["escalate", "past due", "second notice", "final notice", "payment plan"] },
    { agent: invoiceReminder, extraKeywords: ["invoice", "reminder", "outstanding", "unpaid"] },
  ],
  defaultSkillId: "invoice_reminder",
  examples: [
    { owner_ask: "Send Mike Johnson a reminder about his outstanding invoice, $1,100, 8 days overdue.", expected_route: "invoicing", expected_output_excerpt: "invoice" },
    { owner_ask: "Escalate the past-due notice for the Wallace account, this is the second time.", expected_route: "invoicing", expected_output_excerpt: "payment" },
    { owner_ask: "Draft a payment-plan offer for our biggest overdue customer.", expected_route: "invoicing", expected_output_excerpt: "payment" },
  ],
});

export const accounting = defineDepartment({
  agent_id: "accounting",
  display_name: "Accounting & Finance",
  bucket: "finance",
  channel: "report",
  purpose: "Plain-English financial summaries, pricing memos, and tax-prep checklists from the data layer.",
  routes_here_when: [
    "Owner asks for a financial summary or revenue figure",
    "Owner asks for pricing help or a tax-prep reminder",
  ],
  strong_signals: ["revenue", "financial", "pricing", "taxes"],
  skills: [
    { agent: financialSummary, extraKeywords: ["revenue", "financial", "summary", "receivables", "cash", "income"] },
    { agent: pricingMemo, extraKeywords: ["pricing", "price", "raise", "increase", "charge more"] },
    { agent: taxPrep, extraKeywords: ["tax", "taxes", "quarterly", "941", "irs", "deductions"] },
    // Weekly Briefing remains as a general fallback for broad "how's business" asks.
    { agent: weeklyBriefing },
  ],
  defaultSkillId: "financial_summary",
  examples: [
    { owner_ask: "What was our revenue last week?", expected_route: "accounting", expected_output_excerpt: "Briefing" },
    { owner_ask: "Give me a financial summary for the month.", expected_route: "accounting", expected_output_excerpt: "Briefing" },
    { owner_ask: "Summarize our outstanding receivables.", expected_route: "accounting", expected_output_excerpt: "Briefing" },
  ],
});

export const adminRecords = defineDepartment({
  agent_id: "admin_records",
  display_name: "Customer Data & Administration",
  bucket: "system",
  channel: "report",
  purpose: "Documents, contracts, intake forms, SOPs, and CRM record organization.",
  routes_here_when: [
    "Owner asks for a document, contract, or intake form",
    "Owner asks to update or organize customer records",
  ],
  strong_signals: ["contract", "intake form", "document", "agreement"],
  skills: [
    { agent: documentDrafter, extraKeywords: ["contract", "agreement", "intake form", "template", "one-pager", "policy", "sop", "document"] },
    // Content Writer remains as a general fallback for broader copy requests.
    { agent: contentWriter, extraKeywords: ["about us", "blog", "article", "paragraph"] },
  ],
  defaultSkillId: "document_drafter",
  examples: [
    { owner_ask: "Draft a service agreement template for new customers.", expected_route: "admin_records", expected_output_excerpt: "agreement" },
    { owner_ask: "Write up a one-pager on our refund policy.", expected_route: "admin_records", expected_output_excerpt: "refund" },
    { owner_ask: "Generate a new-customer intake form for the front desk.", expected_route: "admin_records", expected_output_excerpt: "intake" },
  ],
});

export const people = defineDepartment({
  agent_id: "people",
  display_name: "People Management",
  bucket: "system",
  channel: "report",
  purpose: "Hiring, training, scheduling, payroll communications, and HR memos.",
  routes_here_when: [
    "Owner is hiring, training, or scheduling employees",
    "Owner needs an HR memo, policy, or payroll communication",
  ],
  strong_signals: ["hire", "job post", "training", "employee", "payroll", "schedule the team"],
  skills: [
    { agent: jobPost, extraKeywords: ["job post", "craigslist", "hiring ad", "hire", "posting"] },
    { agent: trainingDoc, extraKeywords: ["training", "checklist", "sop", "handbook", "onboarding"] },
    { agent: hrMemo, extraKeywords: ["write up", "write-up", "coaching", "performance", "late", "schedule the team", "mother's day"] },
    // Content Writer remains as a general fallback for broader copy requests.
    { agent: contentWriter, extraKeywords: ["about us", "blog", "article", "paragraph"] },
  ],
  defaultSkillId: "job_post",
  examples: [
    { owner_ask: "Write a Craigslist post for a part-time mechanic, weekends, must have tools.", expected_route: "people", expected_output_excerpt: "mechanic" },
    { owner_ask: "Draft a training checklist for a new front-desk hire.", expected_route: "people", expected_output_excerpt: "training" },
    { owner_ask: "Help me write up an employee who's been late three times this month.", expected_route: "people", expected_output_excerpt: "employee" },
  ],
});

export const DEPARTMENTS = [
  sales,
  marketing,
  customerService,
  operations,
  invoicing,
  accounting,
  adminRecords,
  people,
] as const;
