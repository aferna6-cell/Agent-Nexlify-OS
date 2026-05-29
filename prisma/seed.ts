/**
 * Seeds the demo business — Sunset Mobile Detailing — and its owner.
 *
 * Idempotent: safe to run repeatedly. The QA report and library examples are
 * anchored on this auto-detailing business, so the demo uses it as the
 * substrate. The payment link is intentionally omitted to exercise the honest
 * gap-surfacing behaviour in finance agents later.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL ?? "alex@sunsetdetailing.com";

async function main() {
  const user = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { name: "Alex", emailVerified: new Date() },
    create: { email: OWNER_EMAIL, name: "Alex", emailVerified: new Date() },
  });

  await db.businessProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      businessName: "Sunset Mobile Detailing",
      ownerName: "Alex",
      industry: "auto detailing",
      city: "Phoenix",
      state: "AZ",
      phone: "(602) 555-0148",
      email: OWNER_EMAIL,
      website: "https://sunsetdetailing.com",
      hoursSummary: "Mon–Sat 8am–6pm",
      timezone: "America/Phoenix",
      reviewLinkGoogle: "https://g.page/r/sunset-detailing/review",
      // paymentLink intentionally omitted.
    },
  });

  // A little widget + pipeline activity so later phases have data to read.
  const widgetCount = await db.widgetConversation.count({ where: { userId: user.id } });
  if (widgetCount === 0) {
    await db.widgetConversation.createMany({
      data: [
        {
          userId: user.id,
          contactName: "Mike",
          intent: "question",
          summary: "Asked about hybrid battery service on a 2018 Prius.",
          topics: "hybrid,battery",
        },
        {
          userId: user.id,
          contactName: "Dana",
          intent: "qualified_lead",
          summary: "Interested in a full repaint quote.",
          topics: "repaint,quote",
        },
      ],
    });
  }

  const leadCount = await db.pipelineLead.count({ where: { userId: user.id } });
  if (leadCount === 0) {
    await db.pipelineLead.createMany({
      data: [
        { userId: user.id, name: "Dana", status: "quoted", subject: "full repaint", quoteAmount: 2400 },
        { userId: user.id, name: "Sarah", status: "stale", subject: "consultation" },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${user.email} (Sunset Mobile Detailing).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
