/**
 * Auth.js (NextAuth v5) configuration — email magic links.
 *
 * Single-user demo: no SMTP required. The magic link is printed to the server
 * console by `sendVerificationRequest`, so you can log in locally without an
 * email provider. Production sets EMAIL_SERVER and removes the console fallback.
 *
 * `getCurrentUserId` resolves the logged-in owner, falling back to the seeded
 * demo owner when AUTH_DEMO_BYPASS is on — this lets the API be exercised end to
 * end (e.g. via curl) without a browser session during the demo.
 */

import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db.js";
import { demoBypass, DEMO_OWNER_EMAIL } from "./demo.js";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  // Self-hosted (non-Vercel): trust the configured host. In production set
  // AUTH_URL/NEXTAUTH_URL to the real origin.
  trustHost: true,
  // A fallback keeps the self-contained demo from throwing when no env is set.
  // PRODUCTION MUST set a real AUTH_SECRET.
  secret: process.env.AUTH_SECRET ?? "agent-os-demo-secret-change-in-production",
  pages: { signIn: "/" },
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER ?? { host: "localhost", port: 587 },
      from: process.env.EMAIL_FROM ?? "Agent OS <login@agent-os.local>",
      async sendVerificationRequest({ identifier, url }) {
        if (process.env.EMAIL_SERVER) {
          // A real SMTP server is configured; let Nodemailer send normally.
          const { createTransport } = await import("nodemailer");
          const transport = createTransport(process.env.EMAIL_SERVER);
          await transport.sendMail({
            to: identifier,
            from: process.env.EMAIL_FROM,
            subject: "Sign in to Agent OS",
            text: `Sign in to Agent OS:\n${url}\n`,
          });
          return;
        }
        // Demo: print the magic link instead of emailing it.
        // eslint-disable-next-line no-console
        console.log(`\n🔑  Agent OS magic link for ${identifier}:\n    ${url}\n`);
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

/** Resolve the current owner's user id (or null). */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (email) {
    const user = await db.user.findUnique({ where: { email } });
    if (user) return user.id;
  }
  if (demoBypass()) {
    const demo = await db.user.findUnique({ where: { email: DEMO_OWNER_EMAIL } });
    if (demo) return demo.id;
  }
  return null;
}
