/**
 * Agent registry — the source of truth for which agents exist.
 *
 * Imports every agent module and validates each against the schema at load
 * (`defineAgent`/`defineStub` throw on any violation), then exposes a typed
 * registry to the orchestrator. Phase 1 registers all 18 agents; the Generalist
 * is implemented, the other 17 are stubs (metadata only) until Phase 2.
 */

import type { Agent, AgentBucket } from "./_schema.js";

import { generalist } from "./generalist/agent.js";
import { customerQuestion } from "./customer_question/agent.js";
import { complaintHandler } from "./complaint_handler/agent.js";
import { leadNurture } from "./lead_nurture/agent.js";
import { quoteFollowUp } from "./quote_follow_up/agent.js";
import { campaign } from "./campaign/agent.js";
import { contentWriter } from "./content_writer/agent.js";
import { socialPost } from "./social_post/agent.js";
import { seoRecommendations } from "./seo_recommendations/agent.js";
import { booking } from "./booking/agent.js";
import { appointmentReminder } from "./appointment_reminder/agent.js";
import { quoteGenerator } from "./quote_generator/agent.js";
import { invoiceReminder } from "./invoice_reminder/agent.js";
import { paymentFollowUp } from "./payment_follow_up/agent.js";
import { reviewRequest } from "./review_request/agent.js";
import { aiVisibilityStub } from "./ai_visibility_stub/agent.js";
import { weeklyBriefing } from "./weekly_briefing/agent.js";
import { leadTriage } from "./lead_triage/agent.js";

const AGENTS: Agent[] = [
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
];

class AgentRegistry {
  private readonly byId = new Map<string, Agent>();

  constructor(agents: Agent[]) {
    for (const a of agents) {
      if (this.byId.has(a.agent_id)) {
        throw new Error(`duplicate agent_id "${a.agent_id}"`);
      }
      this.byId.set(a.agent_id, a);
    }
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): Agent {
    const a = this.byId.get(id);
    if (!a) throw new Error(`unknown agent_id "${id}"`);
    return a;
  }

  all(): Agent[] {
    return [...this.byId.values()];
  }

  byBucket(bucket: AgentBucket): Agent[] {
    return this.all().filter((a) => a.bucket === bucket);
  }

  /** Agents eligible for owner-ask routing (internal agents fire on events). */
  routable(): Agent[] {
    return this.all().filter((a) => a.channel !== "internal");
  }
}

export const registry = new AgentRegistry(AGENTS);
export type { Agent };
