# Agent OS — 10-minute demo script

Business: **Sunset Auto Care** (Phoenix auto shop). Owner: **Maya**.
Target time: **under 12 minutes**. Everything below works on the seeded demo data
with no API key (drafts come from the deterministic local composer; cost shows
$0). With `ANTHROPIC_API_KEY` set, the same beats produce model-written drafts.

**Live URL:** https://agent-nexlify-os.vercel.app (opens as Maya — demo bypass, no
login). To run locally instead, follow Setup below.

## Setup (≈1 min)

```bash
npm install
cp .env.example .env
npm run setup      # prisma generate + db push + seed Sunset Auto Care
npm run dev        # http://localhost:3000
```

**Log in as Maya:** on the landing page the email is pre-filled
(`maya@sunsetauto.com`) — click **Send magic link**. No SMTP is configured for the
demo, so the link is printed to the **server console (your terminal)**. Open it to
sign in; you land in Agent OS.

> Tip: the empty chat shows clickable starter prompts for Beats 1–5.

---

## The beats

### Beat 1 — Booking (≈1.5 min)
**Type:** `Mike Johnson called wanting a tire rotation Thursday at 10:30.`
- The orchestrator routes to **Booking** (shown: "I'm picking the Booking agent — sound right?").
- Watch the **reasoning trace** stream in (profile loaded → compose message).
- The right panel shows an SMS draft to Mike for **Thursday at 10:30** — plain text, signed "Maya".
- Click **Approve**. (Phase 4 will actually send; today it records the decision.)

### Beat 2 — Orchestrator answers directly (≈1 min)
**Type:** `What came in through the widget yesterday?`
- No worker agent runs — the **orchestrator answers directly** from widget history:
  10 conversations with an intent breakdown (booking, questions, a complaint, leads, spam…).
- Point out: the widget is a first-class data source, not a separate inbox.

### Beat 3 — Quote Follow-up (≈1.5 min)
**Type:** `Follow up with Sarah Chen on her brake quote.`
- Routes to **Quote Follow-up** even though you didn't type a dollar amount — it
  pulls Sarah's **$680 brake job** quote from the pipeline.
- Output: a 3-touch sequence with relative dates (Today / +7 / +14), quote-specific framing.

### Beat 4 — Campaign (≈1.5 min)
**Type:** `Draft an email blast for our June AC special, $59 instead of $89.`
- Routes to **Campaign**. The subject **front-loads "$59"** (mobile inboxes clip ~30 chars).
- Uses the real business name **Sunset Auto Care** — no `[Shop Name]` placeholders.

### Beat 5 — Weekly Briefing (≈1.5 min)
**Type:** `Show me my weekly briefing.`
- Routes to **Weekly Briefing** → a structured report: Conversations, Leads,
  Appointments, Finance, Drafts & sends.
- Point out: **empty sections are omitted** — it never pads with "nothing this week".

### Beat 6 — Graceful "no agent for that" (≈1 min)
**Type:** `Help me hire a part-time mechanic.`
- No specialist fits. The orchestrator falls back to the **Generalist**, takes a
  helpful general pass, **and captures the request to the wishlist** (product-demand signal).
- Point out: the long tail is handled gracefully, not with an error.

---

## Optional admin tour (≈1 min)
- **`/admin/routing`** — every routing decision, **routing-accuracy %**, and an
  "ambiguous routings to review" panel.
- **`/admin/costs`** — **cost-per-run per agent** with a >5×-median anomaly flag,
  plus by-model totals. (All $0 offline; real Sonnet cost when a key is set.)

## Reset between demos
```bash
npm run db:seed    # idempotent — restores the known Sunset Auto Care dataset
```

## Talk track (one sentence)
"A non-technical shop owner signs up, picks their industry, and within five
minutes asks their AI in plain English to do something useful — and it either
does it, drafts it for approval, or tells them honestly it doesn't have an agent
for that yet and saves the request for next time."
