# Agent OS

The conversational surface for AgentNexLiFy, built as a standalone, demoable
product. A small-business owner talks to one **orchestrator** in plain English;
it routes the ask to the best-fit **worker agent**, which runs, streams an honest
reasoning trace, and produces a draft for approval. The eventual goal is to merge
it into the main codebase once it's production-ready.

> Source specs live in [`docs/`](docs/): the Worker Agent Library v1 and the
> Product Plan. The build follows the phased plan; this commit completes
> **Phase 0 — Skeleton**.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind + shadcn-style UI ·
Prisma · `@anthropic-ai/sdk` (Haiku routing / Sonnet drafts) · Auth.js v5 (email
magic links) · React Query · Zod · Vitest.

The standalone build uses **SQLite** (no DB server needed); production swaps the
Prisma datasource to Neon/Postgres. When `ANTHROPIC_API_KEY` is unset the model
client is unavailable and agents degrade honestly (Phase 0's Generalist is
hard-coded and needs no model).

## Quick start

```bash
npm install
cp .env.example .env          # SQLite + demo settings; no SMTP/API key required
npm run setup                 # prisma generate + db push + seed Sunset Mobile Detailing
npm run dev                   # http://localhost:3000
```

**Log in (demo, no SMTP):** enter `alex@sunsetdetailing.com` and click *Send magic
link*. The link is printed to the **server console** — open it to sign in. Then in
the Agent OS chat, type `hello`: you'll see the reasoning trace stream in
(`route` → `load_business_profile` → `draft_response`) and a draft appear in the
right panel with Approve/Reject (which log to the console in Phase 0).

Other scripts: `npm run build`, `npm run typecheck`, `npm test`,
`npm run db:seed`.

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
- Phase 4+ — the remaining agents, then real actions (calendar/email/SMS send)
  behind permission scopes, and the live Anthropic/Postgres backends.
