# Agent OS

The conversational surface for AgentNexLiFy, built as a standalone, demoable
product. A small-business owner talks to one **orchestrator** in plain English;
it routes the ask to the best-fit **worker agent**, which runs, streams an honest
reasoning trace, and produces a draft for approval. The eventual goal is to merge
it into the main codebase once it's production-ready.

> Source specs live in [`docs/`](docs/): the Worker Agent Library v1 and the
> Product Plan. The build follows the phased plan. **16 of 18 agents are live**
> and the app is demo-ready — see [`DEMO.md`](DEMO.md) for the 10-minute walkthrough.

> **Live demo:** https://agent-nexlify-os.vercel.app — opens straight into the
> orchestrator as Maya (demo bypass; no login). All 6 demo beats run against the
> seeded Sunset Auto Care data.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind + shadcn-style UI ·
Prisma · `@anthropic-ai/sdk` (Haiku routing / Sonnet drafts) · Auth.js v5 (email
magic links) · React Query · Zod · Vitest.

The standalone build uses **SQLite** (no DB server needed) and a **deterministic
local composer** for drafts, so everything runs and tests **offline with no API
key**. Production swaps the Prisma datasource to Neon/Postgres and sets
`ANTHROPIC_API_KEY` to use real Haiku/Sonnet — the same code path, with cost
logged per call.

## Quick start (clone → running in ~10 minutes)

```bash
git clone <repo> && cd agent-os
npm install
cp .env.example .env          # SQLite + demo settings; no SMTP/API key required
npm run setup                 # prisma generate + db push + seed Sunset Auto Care
npm run dev                   # http://localhost:3000
```

**Log in (demo, no SMTP):** the email is pre-filled (`maya@sunsetauto.com`) — click
*Send magic link*. The link is printed to the **server console** — open it to sign
in. Then follow [`DEMO.md`](DEMO.md), or try a starter prompt like
*"Show me my weekly briefing."*

Scripts: `npm run dev` · `build` · `start` · `typecheck` · `test` · `db:seed` ·
`setup`. End-to-end checks: `DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase5.ts`.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | SQLite (`file:./dev.db`) locally; a Postgres/Neon URL in prod (also change the datasource `provider` to `postgresql` in `prisma/schema.prisma`). |
| `AUTH_SECRET` | yes | Auth.js session secret (`openssl rand -base64 32`). |
| `NEXTAUTH_URL` / `AUTH_URL` | prod | The deployed origin. |
| `EMAIL_SERVER` | prod | SMTP URL for real magic-link email. Unset → link prints to the server console (demo). |
| `EMAIL_FROM` | prod | From-address for magic links. |
| `ANTHROPIC_API_KEY` | optional | Enables real Haiku routing + Sonnet drafts. Unset → deterministic local composer ($0). |
| `ANTHROPIC_MODEL_ROUTING` / `ANTHROPIC_MODEL_DRAFT` | optional | Model overrides (default Haiku 4.5 / Sonnet 4.6). |
| `AUTH_DEMO_BYPASS` | demo only | `true` lets the API resolve the seeded owner without a browser session. Set `false`/unset in prod. |
| `DEMO_OWNER_EMAIL` | demo only | The seeded owner (default `maya@sunsetauto.com`). |

## Deploy

The app is **self-contained on Vercel**: it ships a pre-seeded SQLite database
(`prisma/demo.db`), copies it to the writable `/tmp` on boot, and enables demo
bypass (no login) automatically when it detects the Vercel runtime — so a working
private demo needs **no database and no environment variables**.

**Fastest path — deploy this repo as-is (no DB, no env):**
```bash
npx vercel deploy --prod --yes --token=$VERCEL_TOKEN   # creates/links a project, returns a URL
```
or connect the GitHub repo to a Vercel project in the dashboard — every push then
deploys. Either way, protect the project with Vercel Password Protection / SSO for
a private demo. (No env vars required for the demo; `ANTHROPIC_API_KEY` is optional
and only upgrades drafts from the local composer to Sonnet.)

**Production path (real auth + shared Postgres):** swap the Prisma datasource to
`postgresql`, push the schema to Neon (`DATABASE_URL=<neon-url> npx prisma db push`
then `npm run db:seed`), and set the env vars below in Vercel (and set
`AUTH_DEMO_BYPASS=false` to require real magic-link login).

## The three rules (enforced architecturally)

From the QA report, built in at the architecture level — see `docs/`.

1. **No false-success trace steps.** The trace emitter (`src/agents/_trace.ts`)
   derives a load step's status from the data itself: a step is only `completed`
   when non-empty evidence is supplied, otherwise `skipped_no_data` / `fallback`.
   Faking a successful load is structurally impossible.
2. **No `[bracketed placeholders]` for present profile fields.** Agents read the
   business profile from the shared context (the substrate fix) and use real
   values; gaps are surfaced to the orchestrator chat, never the draft.
3. **Every agent declares its channel and formatting.** Plain-text channels
   (sms/post/widget_reply) must set `no_markdown`; the schema enforcer
   (`src/agents/_schema.ts`) rejects violations at load — so a bad agent fails CI.

## Layout (per the build plan §3)

```
prisma/schema.prisma        # data layer: User, BusinessProfile, AgentRun, TraceStep,
prisma/seed.ts              #   Draft, WidgetConversation, PipelineLead, WishlistItem, ModelCallLog
src/lib/{db,anthropic,auth,utils}.ts
src/agents/
  _schema.ts                # Zod agent schema + the three-rule enforcer
  _registry.ts              # loads + validates every agent
  _orchestrator.ts          # routing (Haiku-bound later) + run persistence
  _shared-context.ts        # loads business_profile, widget history, pipeline…
  _trace.ts                 # honest reasoning-trace emitter
  generalist/               # one folder per agent: agent.ts, examples.ts, agent.test.ts
src/app/
  page.tsx                  # landing / magic-link login
  (dashboard)/agent-os/     # the orchestrator chat (task list · chat · draft panel)
  api/chat/route.ts         # streaming SSE orchestrator endpoint
  api/drafts/[id]/route.ts  # get / approve / reject
  api/wishlist/route.ts
  admin/costs/              # internal cost tracking (every model call logged)
src/components/{chat,reasoning-trace,draft-panel,ui,auth,dashboard}
```

## Roadmap status

- **Phase 0 — Skeleton** ✅ running app, DB schema, registry skeleton, hard-coded
  Generalist routing end-to-end with a streaming trace + draft, cost-logging
  Anthropic wrapper, `/admin/costs`, seeded demo business.
- **Phase 1 — Orchestrator + registry** ✅ all 18 agents registered (Generalist
  implemented, the other 17 are "not implemented yet" stubs); the orchestrator
  classifies with Haiku (structured JSON output) and falls back to a transparent
  heuristic scorer offline; confidence rules (`<0.5` → wishlist + Generalist;
  top-two within `0.1` → ask the owner); the routing-decision picker in chat
  ("I'm picking the X agent — sound right? pick another"); every decision logged
  to `RoutingDecision`; `/admin/routing` shows the log.
  Verify with `DATABASE_URL="file:./dev.db" npx tsx scripts/verify-routing.ts`
  (10/10 on the bucket test set; ambiguous + wishlist demonstrated).
- **Phase 2 — P1 agents** ✅ the five P1 agents are real implementations with
  their QA fixes: **Customer Question** (empty-KB safe holding reply, gap surfaced
  to the orchestrator — never internal text in the draft), **Booking** (single
  frame per mode, never invents scheduling state, markdown-free SMS), **Lead
  Nurture** (relative `Today / +5 / +14` dates, consistent labels), **Campaign**
  (price front-loaded in a ≤30-char subject, respects "keep it short", emoji low
  by default), and **Generalist** (real fallback — no draft + "service
  temporarily unavailable" when drafts are down; offers a near specialist `>0.4`).
  Each has a Zod input schema, a business-profile system prompt, honest traces,
  channel-correct output, `examples.ts`, and `agent.test.ts`. Drafts use Sonnet
  when `ANTHROPIC_API_KEY` is set and a deterministic local composer otherwise;
  cost is logged per run either way.
  Verify with `DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase2.ts`
  (5/5 quality drafts: no placeholders, no SMS markdown, honest traces, cost logged).
- **Phase 3 — P2 agents** ✅ seven more real agents: **Content Writer**, **Social
  Post**, **Review Request** (no fabricated review link), **Invoice Reminder**,
  **Quote Generator** (itemized `quote_data` → email/report, never auto-send),
  **Quote Follow-up**, and **Weekly Briefing** (multi-source report that **omits
  empty sections** — never "none this week"). Routing rule enforced + tested:
  `$` amount **and** "quote" → Quote Follow-up, else Lead Nurture; "draft a
  quote" with prices → Quote Generator. **12 agents now implemented** (5 P1 + 7
  P2); 6 remain as routed stubs.
  Verify with `DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase3.ts`
  (each shipped agent runs 5×, cost-per-run measured, >5×-median anomaly check).
- **Phase 4 — P3 agents** ✅ four more, with extra design care: **Complaint
  Handler** (hardcoded `never_auto_send` + always flags red; the orchestrator's
  complaint detection short-circuits Customer Question for angry messages),
  **SEO Recommendations** (backed by a real `seo_check` tool — fetch with a 5s
  timeout, parse title/meta/H1/viewport/alt coverage; honest "Not checked yet"
  scope), **AI Visibility** (honest early-access stub that tags the owner
  record `aiVisibilityInterest` for the beta), and **Payment Follow-up** (three
  escalation levels, hardcoded no-threats / no specific-legal language,
  `never_auto_send`). **16 agents now implemented** (5 P1 + 7 P2 + 4 P3); the two
  System/P4 agents (Lead Triage, Appointment Reminder) are deferred — they depend
  on triggers/tools that land at production merge.
  Verify with `DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase4.ts`.
- **Phase 5 — Demo polish + seeding** ✅ demo-ready. Rich seeded dataset (Sunset
  Auto Care / owner Maya: 10 widget conversations across intents, 5 pipeline
  leads, 4 appointments, an overdue invoice and an overdue quote); the
  orchestrator answers **widget-activity questions directly** (no agent); the
  10-minute [`DEMO.md`](DEMO.md) walkthrough (6 beats); UX polish (animated
  reasoning trace, draft-panel slide-in, starter prompts); `/admin/costs`
  (per-agent cost/run + anomaly flag) and `/admin/routing` (accuracy % +
  ambiguous-cases panel); Vercel/Neon deploy docs.
  Verify with `DATABASE_URL="file:./dev.db" npx tsx scripts/verify-phase5.ts`
  (6/6 demo beats behave as scripted).
- Phase 6+ — production merge: the deferred trigger/tool agents (Lead Triage,
  Appointment Reminder), real actions (calendar/email/SMS send) behind permission
  scopes, and the live Anthropic/Postgres backends.
