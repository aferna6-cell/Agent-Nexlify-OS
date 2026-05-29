/**
 * The v1 worker agent library — all 18 agents across 8 buckets.
 *
 * Order here is the canonical library order (by bucket, as in the spec).
 */

import type { AgentDefinition } from "../types.js";

import { customerQuestion } from "./customer_service/customer_question.js";
import { complaintHandler } from "./customer_service/complaint_handler.js";
import { leadNurture } from "./sales/lead_nurture.js";
import { quoteFollowUp } from "./sales/quote_follow_up.js";
import { campaign } from "./marketing/campaign.js";
import { contentWriter } from "./marketing/content_writer.js";
import { socialPost } from "./marketing/social_post.js";
import { seoRecommendations } from "./marketing/seo_recommendations.js";
import { booking } from "./scheduling_ops/booking.js";
import { appointmentReminder } from "./scheduling_ops/appointment_reminder.js";
import { quoteGenerator } from "./finance/quote_generator.js";
import { invoiceReminder } from "./finance/invoice_reminder.js";
import { paymentFollowUp } from "./finance/payment_follow_up.js";
import { reviewRequest } from "./reputation/review_request.js";
import { aiVisibilityStub } from "./reputation/ai_visibility_stub.js";
import { weeklyBriefing } from "./reporting/weekly_briefing.js";
import { leadTriage } from "./system/lead_triage.js";
import { generalist } from "./system/generalist.js";

export const ALL_AGENTS: AgentDefinition[] = [
  // Customer Service
  customerQuestion,
  complaintHandler,
  // Sales
  leadNurture,
  quoteFollowUp,
  // Marketing
  campaign,
  contentWriter,
  socialPost,
  seoRecommendations,
  // Scheduling & Operations
  booking,
  appointmentReminder,
  // Finance
  quoteGenerator,
  invoiceReminder,
  paymentFollowUp,
  // Reputation
  reviewRequest,
  aiVisibilityStub,
  // Reporting & Insight
  weeklyBriefing,
  // System
  leadTriage,
  generalist,
];

export {
  customerQuestion,
  complaintHandler,
  leadNurture,
  quoteFollowUp,
  campaign,
  contentWriter,
  socialPost,
  seoRecommendations,
  booking,
  appointmentReminder,
  quoteGenerator,
  invoiceReminder,
  paymentFollowUp,
  reviewRequest,
  aiVisibilityStub,
  weeklyBriefing,
  leadTriage,
  generalist,
};
