/**
 * Seeds the demo business — Sunset Auto Care (owner: Maya) — with a realistic
 * dataset for the 10-minute demo (see DEMO.md): widget conversations across
 * intents, a pipeline in mixed stages, completed appointments ready for review
 * requests, an unpaid invoice, and an overdue quote.
 *
 * Idempotent: clears and recreates the demo content on each run so the demo
 * always starts from a known state.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL ?? "maya@sunsetauto.com";
const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day);

async function main() {
  const user = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { name: "Maya", emailVerified: new Date() },
    create: { email: OWNER_EMAIL, name: "Maya", emailVerified: new Date() },
  });

  await db.businessProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      businessName: "Sunset Auto Care",
      ownerName: "Maya",
      industry: "auto repair",
      industryCluster: "automotive",
      businessType: "Auto repair shop",
      city: "Phoenix",
      state: "AZ",
      phone: "(602) 555-0148",
      email: OWNER_EMAIL,
      website: "https://sunsetauto.com",
      hoursSummary: "Mon–Sat 8am–6pm",
      timezone: "America/Phoenix",
      reviewLinkGoogle: "https://g.page/r/sunset-auto-care/review",
      paymentLink: "https://sunsetauto.com/pay",
    },
  });

  // Reset demo content for a known starting state.
  await db.widgetConversation.deleteMany({ where: { userId: user.id } });
  await db.pipelineLead.deleteMany({ where: { userId: user.id } });
  await db.appointment.deleteMany({ where: { userId: user.id } });
  await db.invoice.deleteMany({ where: { userId: user.id } });

  // 10 widget conversations across intents, over the last 14 days.
  await db.widgetConversation.createMany({
    data: [
      { userId: user.id, contactName: "Carlos M.", intent: "booking", summary: "Wants an oil change this week; asked about Saturday slots.", topics: "oil change,booking", closedAt: ago(1) },
      { userId: user.id, contactName: "Jenna R.", intent: "booking", summary: "Needs brake inspection before a road trip.", topics: "brakes,booking", closedAt: ago(2) },
      { userId: user.id, contactName: "Devon P.", intent: "booking", summary: "Asked to schedule a tire rotation + alignment.", topics: "tires,alignment", closedAt: ago(4) },
      { userId: user.id, contactName: "Aisha K.", intent: "question", summary: "Asked whether we service hybrid batteries on a 2018 Prius.", topics: "hybrid,battery", closedAt: ago(1) },
      { userId: user.id, contactName: "Greg T.", intent: "question", summary: "Asked about weekend hours and walk-ins.", topics: "hours,walk-in", closedAt: ago(3) },
      { userId: user.id, contactName: "Robert L.", intent: "complaint", summary: "Upset that an AC recharge didn't hold; wants it looked at again.", topics: "AC,complaint", closedAt: ago(2) },
      { userId: user.id, contactName: "Sarah Chen", intent: "qualified_lead", summary: "Got a brake-job quote; comparing options, hasn't booked.", topics: "brakes,quote", closedAt: ago(6) },
      { userId: user.id, contactName: "Dana Reyes", intent: "qualified_lead", summary: "Interested in a full repaint estimate.", topics: "repaint,quote", closedAt: ago(8) },
      { userId: user.id, contactName: "promo-bot", intent: "spam", summary: "Bulk marketing message offering SEO backlinks.", topics: "spam", closedAt: ago(5) },
      { userId: user.id, contactName: "FleetCo Sales", intent: "sales_pitch", summary: "Vendor pitching a parts-supply contract.", topics: "vendor,pitch", closedAt: ago(9) },
    ],
  });

  // 5 pipeline leads in mixed stages.
  await db.pipelineLead.createMany({
    data: [
      { userId: user.id, name: "Mike Johnson", status: "new", subject: "tire rotation", lastContactDate: ago(0) },
      { userId: user.id, name: "Sarah Chen", status: "quoted", subject: "brake job", quoteAmount: 680, lastContactDate: ago(9) }, // overdue quote
      { userId: user.id, name: "Dana Reyes", status: "quoted", subject: "full repaint", quoteAmount: 2400, lastContactDate: ago(8) },
      { userId: user.id, name: "Tom Wallace", status: "stale", subject: "oil change inquiry", lastContactDate: ago(21) },
      { userId: user.id, name: "Priya Patel", status: "lost", subject: "transmission flush", lastContactDate: ago(30) },
    ],
  });

  // 3 completed appointments, ready for a review request.
  await db.appointment.createMany({
    data: [
      { userId: user.id, customerName: "Lena Park", service: "oil change", scheduledFor: ago(1), status: "completed", reviewRequested: false },
      { userId: user.id, customerName: "Jake Sutter", service: "brake pads", scheduledFor: ago(3), status: "completed", reviewRequested: false },
      { userId: user.id, customerName: "Maria Gomez", service: "AC recharge", scheduledFor: ago(4), status: "completed", reviewRequested: false },
      { userId: user.id, customerName: "Devon P.", service: "tire rotation", scheduledFor: ago(-2), status: "scheduled", reviewRequested: false },
    ],
  });

  // 1 unpaid (overdue) invoice.
  await db.invoice.create({
    data: { userId: user.id, customerName: "Mike Johnson", number: "#1042", amount: 1100, issuedAt: ago(11), dueAt: ago(3), status: "overdue" },
  });

  // A little agent run history so the weekly briefing has a "Drafts & sends" section.
  const runCount = await db.agentRun.count({ where: { userId: user.id } });
  if (runCount === 0) {
    await db.agentRun.create({ data: { userId: user.id, agentId: "campaign", ownerAsk: "Spring AC special blast", status: "approved" } });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${user.email} — Sunset Auto Care: 10 widget chats, 5 leads, 4 appointments, 1 overdue invoice.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
