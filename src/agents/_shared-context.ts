/**
 * Shared context — Prisma-backed provider for the standalone build.
 *
 * Centralises how every agent reads the data layer. The orchestrator and agents
 * never touch Prisma directly: they go through a `SharedContextProvider`
 * (src/lib/providers/shared-context.ts). This module provides the standalone
 * implementation (`PrismaSharedContextProvider`), registers it on import, and
 * keeps `loadSharedContext()` as a thin wrapper over the registered provider so
 * existing call sites are unchanged.
 *
 * The production merge swaps the implementation by calling
 * `setSharedContextProvider()` at startup with one that reads the production
 * database — no agent code changes. See docs/INTEGRATION.md.
 */

import { db } from "../lib/db.js";
import {
  setSharedContextProvider,
  getSharedContextProvider,
  type SharedContextProvider,
} from "../lib/providers/shared-context.js";
import { setOwnerActions, type OwnerActions } from "../lib/providers/owner-actions.js";
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

/** Standalone Prisma/SQLite implementation of the data-layer seam. */
export class PrismaSharedContextProvider implements SharedContextProvider {
  async load(userId: string): Promise<SharedContext> {
    const [profileRow, widget, leads, appts, invoices, runs] = await Promise.all([
      db.businessProfile.findUnique({ where: { userId } }),
      db.widgetConversation.findMany({ where: { userId }, orderBy: { closedAt: "desc" }, take: 50 }),
      db.pipelineLead.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.appointment.findMany({ where: { userId }, orderBy: { scheduledFor: "desc" }, take: 100 }),
      db.invoice.findMany({ where: { userId }, orderBy: { dueAt: "desc" }, take: 100 }),
      db.agentRun.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { draft: true } }),
    ]);

    // KB has no dedicated table in the standalone build; it stays empty so agents
    // honestly report "no KB yet" rather than faking a load.
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
      appointments: appts.map((ap) => ({
        id: ap.id,
        customerName: ap.customerName,
        service: ap.service ?? undefined,
        scheduledFor: ap.scheduledFor.toISOString(),
        status: ap.status,
        reviewRequested: ap.reviewRequested,
      })),
      invoices: invoices.map((iv) => ({
        id: iv.id,
        customerName: iv.customerName,
        number: iv.number,
        amount: iv.amount,
        issuedAt: iv.issuedAt.toISOString(),
        dueAt: iv.dueAt.toISOString(),
        status: iv.status,
      })),
      agentRunHistory: runs.map((r) => {
        // Detect a KB gap: a Customer Question run whose draft metadata recorded
        // kb_hit=false (the agent fell back to a safe holding reply).
        let kbGap = false;
        if (r.agentId === "customer_question" && r.draft?.metadata) {
          try {
            kbGap = (JSON.parse(r.draft.metadata) as { kb_hit?: boolean }).kb_hit === false;
          } catch {
            kbGap = false;
          }
        }
        return {
          agentId: r.agentId,
          title: r.draft?.title ?? r.ownerAsk,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          kbGap,
        };
      }),
      kb,
    };
  }
}

/** Standalone Prisma implementation of the write-side seam. */
export class PrismaOwnerActions implements OwnerActions {
  async tagAiVisibilityInterest(userId: string): Promise<boolean> {
    try {
      await db.user.update({ where: { id: userId }, data: { aiVisibilityInterest: true } });
      return true;
    } catch {
      // best-effort by contract — never throw
      return false;
    }
  }
}

// Register the standalone providers on import. The orchestrator imports this
// module, so the seams are wired before any agent runs. The production merge can
// override these by calling setSharedContextProvider()/setOwnerActions() after
// its own startup.
setSharedContextProvider(new PrismaSharedContextProvider());
setOwnerActions(new PrismaOwnerActions());

/**
 * Load the shared context for a user through the registered provider.
 * Kept as a stable function so existing call sites (the orchestrator) don't
 * change when the underlying provider is swapped.
 */
export async function loadSharedContext(userId: string): Promise<SharedContext> {
  return getSharedContextProvider().load(userId);
}
