/**
 * Shared context loader.
 *
 * Centralises how every agent reads the data layer. When a new data source is
 * added, it changes here once. Loads the business profile (the substrate fix),
 * widget history, pipeline state, and recent agent run history for a user.
 */

import { db } from "../lib/db.js";
import type {
  BusinessProfileData,
  KbEntry,
  SharedContext,
} from "../types/agent.js";

function toProfile(row: Awaited<ReturnType<typeof db.businessProfile.findUnique>>): BusinessProfileData {
  if (!row) return {};
  return {
    businessName: row.businessName ?? undefined,
    ownerName: row.ownerName ?? undefined,
    industry: row.industry ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    hoursSummary: row.hoursSummary ?? undefined,
    timezone: row.timezone ?? undefined,
    reviewLinkGoogle: row.reviewLinkGoogle ?? undefined,
    reviewLinkYelp: row.reviewLinkYelp ?? undefined,
    reviewLinkFacebook: row.reviewLinkFacebook ?? undefined,
    paymentLink: row.paymentLink ?? undefined,
  };
}

export async function loadSharedContext(userId: string): Promise<SharedContext> {
  const [profileRow, widget, leads, runs] = await Promise.all([
    db.businessProfile.findUnique({ where: { userId } }),
    db.widgetConversation.findMany({ where: { userId }, orderBy: { closedAt: "desc" }, take: 50 }),
    db.pipelineLead.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.agentRun.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { draft: true } }),
  ]);

  // KB has no dedicated table in Phase 0; it stays empty so agents honestly
  // report "no KB yet" rather than faking a load.
  const kb: KbEntry[] = [];

  return {
    businessProfile: toProfile(profileRow),
    widgetHistory: widget.map((w) => ({
      id: w.id,
      contactName: w.contactName ?? undefined,
      intent: w.intent ?? undefined,
      summary: w.summary,
      topics: w.topics ? w.topics.split(",").map((t) => t.trim()).filter(Boolean) : [],
      closedAt: w.closedAt.toISOString(),
    })),
    pipelineLeads: leads.map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      subject: l.subject ?? undefined,
      quoteAmount: l.quoteAmount ?? undefined,
      lastContactDate: l.lastContactDate?.toISOString(),
    })),
    agentRunHistory: runs.map((r) => ({
      agentId: r.agentId,
      title: r.draft?.title ?? r.ownerAsk,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    kb,
  };
}
