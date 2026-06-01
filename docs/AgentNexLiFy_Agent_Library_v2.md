# AgentNexLiFy — Agent Library v2 (8 Department Heads)

**Date:** 31 May 2026
**Status:** Authoritative agent spec. Supersedes the 18-agent count in `AgentNexLiFy_Agent_Library_v1.md` (now archived). Per *Agent OS Direction v2*.
**Scope of this doc:** the source-of-truth spec for the consolidation refactor. It does **not** authorize changing code yet — per Direction v2 §8.2, the in-flight post-QA sprint finishes first; the consolidation is a separate sprint after that.

> This is an internal document. The no-em-dash rule (§7) applies to the marketing
> website only, not to internal docs or agent draft outputs.

---

## 0. What carries over unchanged

Everything architectural from `AgentOS_ClaudeCode_BuildPlan.md` §0 and the v1 library stays:

- Orchestrator → worker → **drafts-only** loop; honest reasoning trace.
- Schema enforcement (`src/agents/_schema.ts`): channel rules, permission scope,
  `never_auto_send`, plain-text `no_markdown`, ≥3 examples, business-profile-required
  for non-internal channels.
- Data layer via the seams (`SharedContextProvider`, `AuthProvider`, `OwnerActions`,
  feature flags) and `SharedContext` shape.
- Wishlist mechanism, cost discipline (Haiku routing / Sonnet drafts + daily caps),
  admin pages, Sunset Auto Care seed, the merge contract (`docs/INTEGRATION.md`).

**Only the worker library is reshaped: 18 specialists → 8 department heads.** Each
department head is a single registry agent whose `run()` dispatches to internal
**skills** (the former v1 agents become internal capabilities, not separate registry
entries).

---

## 1. The internal "skill" pattern (how 8 agents keep 18 behaviors)

A department-head agent is one registry entry (`defineAgent`) that, inside `run()`,
selects a **skill** from the extracted params + ownerAsk and composes the matching
output. Skills reuse the existing per-capability composing logic verbatim — nothing
about trace honesty, Authoring (no-placeholder), `finishBody` channel formatting, or
`generateDraft` (Sonnet + offline fallback) changes.

```
DepartmentAgent.run(args)
  → resolveSkill(ownerAsk, params)         // which capability is this?
  → load shared context + honest trace
  → compose via the skill's logic (ported from the v1 agent)
  → return AgentOutput { draft, orchestratorNotes, noDraftReason }
```

Because a department spans multiple channels (e.g. Sales does `sequence` quotes and
`email`/`sms` outreach), the **draft's channel is set per-skill at runtime**, not
fixed on the agent. The schema's plain-text/`no_markdown` rule is enforced on the
produced draft's channel via `finishBody`, exactly as today.

Each department also exposes a **`briefing` skill** (Direction v2 Decision 1): a short
written report from that department's slice of the data layer.

---

## 2. The 8 department heads

For each: owned domain, internal skills (with the v1 agent each ports from), the
default channel(s), routing signals, ≥3 example asks, and any hardcoded safety.

### 2.1 Sales — `sales`
- **Bucket:** `sales` · **Channels:** `sequence`, `email`, `sms`
- **Owns:** bringing in new customers and closing business.
- **Skills:**
  - `lead_nurture` (← v1 Lead Nurture) — warm multi-touch re-engagement sequences.
  - `quote_follow_up` (← v1 Quote Follow-up) — quote-specific follow-up; pulls amount/scope from pipeline state.
  - `quote_generate` (← v1 Quote Generator) — quote documents (line items, totals, terms, validity).
  - `cold_outreach` (new) — prospect/lapsed-customer outreach, referral asks.
  - `briefing` — sales activity summary (open quotes, stale leads, follow-ups due).
- **Routes here when:** following up with a lead, drafting a quote, chasing a prospect, re-engaging lapsed customers, referral/outreach copy aimed at revenue.
- **Examples:**
  - "Follow up with Sarah Chen on her brake quote." → `quote_follow_up`
  - "Draft a quote for Mike Johnson, full brake job on his F-150, parts 620, labor 480, net 15 terms." → `quote_generate`
  - "Reach out to the three customers we haven't seen in 6+ months." → `cold_outreach`
  - "Write a referral-program SMS for our top 20 customers." → `cold_outreach`

### 2.2 Marketing — `marketing`
- **Bucket:** `marketing` · **Channels:** `email`, `post`, `report`
- **Owns:** advertising, social, email campaigns, referrals, brand, search visibility.
- **Skills:**
  - `campaign` (← v1 Campaign) — email/SMS campaigns (subject, preheader, body).
  - `content` (← v1 Content Writer) — blog, long-form, About Us.
  - `social_post` (← v1 Social Post) — single posts / threads per platform.
  - `review_request` (← v1 Review Request) — review asks (reviews drive brand/referrals).
  - `seo` (← v1 SEO Recommendations, uses `lib/seo.ts` `seo_check`) — on-page recommendations.
  - `ai_visibility` (← v1 AI Visibility stub) — placeholder report + capture beta interest (via `OwnerActions`).
  - `briefing` — marketing activity summary (campaigns sent, posts, review asks).
- **Routes here when:** campaign, social post, blog/content, SEO, review ask, or outbound marketing material.
- **Examples:**
  - "Draft an email blast for existing customers, June AC special, 59 instead of 89." → `campaign`
  - "Write a Facebook post about our weekend hours." → `social_post`
  - "Give me SEO recommendations for our website." → `seo`
  - "Draft a 100-word About Us paragraph." → `content`

### 2.3 Customer Service — `customer_service`
- **Bucket:** `customer_service` · **Channels:** `widget_reply`, `email`
- **Owns:** questions, complaints, issues, retention.
- **Skills:**
  - `customer_question` (← v1 Customer Question) — KB-grounded reply; **safe-holding-reply** when KB is short; surfaces KB gaps honestly.
  - `complaint` (← v1 Complaint Handler) — empathetic reply; **hardcoded `never_auto_send` + flag-red**; references the specific issue; never invents facts.
  - `retention` (new) — save-this-customer / cancellation-save messaging.
  - `briefing` — open complaints, unanswered questions, KB gaps.
- **Safety (hardcoded):** the `complaint` skill sets `never_auto_send` and flags red regardless of any owner setting.
- **Routes here when:** responding to an inbound question or complaint, or retention after a service issue.
- **Examples:**
  - "A customer named Aisha asked: do you handle hybrids? Draft a reply." → `customer_question`
  - "Robert L. is angry his AC recharge didn't hold. Draft a careful response." → `complaint`
  - "Write a save-this-customer message for someone asking to cancel." → `retention`

### 2.4 Operations — `operations`
- **Bucket:** `scheduling_ops` · **Channels:** `sms`, `email`
- **Owns:** delivering the service, schedules, inventory, day-to-day execution.
- **Skills:**
  - `booking` (← v1 Booking) — confirm/propose/reschedule/cancel; service+vehicle+constraints aware.
  - `appointment_reminder` (← v1 Appointment Reminder; P4 trigger) — day-before reminders.
  - `lead_triage` (← v1 Lead Triage; **system/internal**) — classify a closed widget conversation. Remains internal event infrastructure invoked by Operations, not owner-routable.
  - `ops_comms` (new) — closures, delays, "order ready", inventory-out notices.
  - `briefing` — upcoming appointments, no-shows, inventory mentions.
- **Routes here when:** appointments, deliveries, schedules, inventory, or doing the work.
- **Examples:**
  - "Mike Johnson called wanting a tire rotation Thursday at 10:30." → `booking`
  - "Send tomorrow's appointments their day-before reminders." → `appointment_reminder`
  - "Let everyone with a Friday booking know we're closing 2 hours early." → `ops_comms`
  - "Draft a message that we're out of the small dog food until next week." → `ops_comms`

### 2.5 Invoicing & Collections — `invoicing`
- **Bucket:** `finance` · **Channels:** `email`, `sms`
- **Owns:** invoices, payments, overdue accounts.
- **Skills:**
  - `invoice_reminder` (← v1 Invoice Reminder) — friendly first-touch; pulls payment link; references amount + days-overdue.
  - `payment_follow_up` (← v1 Payment Follow-up) — escalation levels (friendly → formal → final, general next-steps only).
  - `payment_plan` (new) — payment-plan offers.
  - `briefing` — outstanding receivables, aging.
- **Safety (hardcoded):** **always `never_auto_send` + require owner approval**, regardless of any other settings. No threatening/legal language without explicit owner direction.
- **Routes here when:** outstanding invoice, overdue payment, billing reminder.
- **Examples:**
  - "Send Mike Johnson a reminder about his outstanding invoice, 1100, 8 days overdue." → `invoice_reminder`
  - "Escalate the past-due notice for the Wallace account, second time." → `payment_follow_up`
  - "Draft a payment-plan offer for our biggest overdue customer." → `payment_plan`

### 2.6 Accounting & Finance — `accounting`
- **Bucket:** `finance` · **Channel:** `report`
- **Owns:** revenue, expenses, cash flow, budgeting, taxes.
- **Skills:**
  - `financial_summary` (new) — plain-English revenue/receivables/top-customers from the data layer; honest about what data is missing (no invented numbers).
  - `pricing_memo` (new) — think-through memos for pricing changes.
  - `tax_prep` (new) — tax-prep checklists/reminders (the kind of substantive answer the v1 Generalist gave for payroll).
  - `briefing` — financial snapshot.
- **Routes here when:** financial summary, pricing help, tax reminder, money analysis.
- **Examples:**
  - "What was our revenue last week?" → `financial_summary`
  - "Help me think through raising my oil change price from 39 to 49." → `pricing_memo`
  - "Remind me what I need to gather for quarterly taxes." → `tax_prep`

### 2.7 Customer Data & Administration — `admin_records`
- **Bucket:** `system` (owner-routable; non-internal) · **Channels:** `report`, `internal`
- **Owns:** customer records, contracts, CRM data, documents, organization.
- **Skills:**
  - `document` (new; absorbs v1 Generalist doc-drafting) — contracts, intake forms, agreements, templates, SOPs, one-pagers.
  - `record_update` (new) — update a customer record from owner-stated info (via `OwnerActions`-style write seam; **drafts the change for approval**, never silent writes).
  - `crm_cleanup` (new) — flag duplicate/incomplete records for owner review.
  - `briefing` — record-hygiene summary.
- **Routes here when:** a document, contract, intake form, or CRM update/organization.
- **Examples:**
  - "Draft a service agreement template for new customers." → `document`
  - "Mike Johnson said he prefers email going forward, update his record." → `record_update`
  - "Write up a one-pager on our refund policy." → `document`
  - "Generate a new-customer intake form for the front desk." → `document`

### 2.8 People Management — `people` (genuinely new)
- **Bucket:** `system` (owner-routable) · **Channels:** `report`, `email`
- **Owns:** hiring, training, scheduling, payroll, HR.
- **Skills:**
  - `job_post` (new) — job postings.
  - `hiring` (new) — interview questions, screening.
  - `training_doc` (new) — checklists, handbook entries, SOPs.
  - `staff_schedule` (new) — employee schedules.
  - `hr_memo` (new) — performance feedback, write-ups, hard-conversation drafts, policies.
  - `briefing` — staffing/HR snapshot.
- **Safety:** HR write-ups are sensitive — `require_owner_approval` always; no legal determinations.
- **Routes here when:** staff, hiring, training, scheduling employees, payroll, HR.
- **Examples:**
  - "Write a Craigslist post for a part-time mechanic, weekends, must have tools." → `job_post`
  - "Draft a training checklist for a new front-desk hire." → `training_doc`
  - "Write up an employee who's been late three times this month." → `hr_memo`
  - "Make a Mother's Day schedule that gives our two moms the day off." → `staff_schedule`

---

## 3. Weekly Briefing (Direction v2 Decision 1)

Two surfaces, no single owner:

1. **Per-department `briefing` skill.** "Show me the Sales briefing" → routes to `sales`,
   which summarizes its own slice of the data layer over the requested period.
2. **Orchestrator-direct aggregate.** "Show me my weekly briefing" (no department named)
   → the orchestrator answers directly (like the existing widget-summary direct-answer
   path), pulling highlights from all 8 departments' briefing skills. No department owns
   the aggregate.

Implementation note: the orchestrator gains an `isBriefingQuery` direct-answer branch
analogous to `isWidgetQuery`, which fan-collects each department's `briefing` output and
composes the cross-department summary (carrying forward the v1 Weekly Briefing's "Owner
attention needed" + "What's coming" sections, which already aggregate complaints, stale
leads, overdue invoices, KB gaps, no-shows).

---

## 4. Generalist elimination (Direction v2 Decision 2)

- **Delete** `src/agents/generalist/`. Remove from `_registry.ts`.
- **Orchestrator fallback** when confidence is low across all 8:
  - Still **capture the ask to the wishlist** (unmet-need signal).
  - Offer the **nearest-confidence department** as a fallback option (the existing
    pick-another UI), instead of routing to a generalist.
  - If the ask is clearly **personal / non-business**, the orchestrator **politely
    declines** (no draft): *"That looks like a personal task rather than a business one.
    Agent OS is built for your business work; for personal writing I'd recommend ChatGPT
    or Claude directly."* and still records it to the wishlist as a signal.
- A lightweight `isNonBusiness(ask)` heuristic (personal-writing/clearly-off-domain
  markers) gates the polite decline; everything else falls back to nearest department.

> Migration caveat: the v1 Generalist's *useful* behaviors (document drafting, internal
> memos, substantive informational answers like payroll) are **not lost** — they move to
> Customer Data & Administration (`document`) and Accounting & Finance (`tax_prep` /
> `financial_summary`). Only the catch-all routing target is removed.

---

## 5. Industries — 8 clusters + 2-step picker (Direction v2 Decision 3)

Clusters: Food & Beverage · Retail · Home & Trade Services · Automotive · Health &
Wellness · Professional Services · Personal Services · Childcare & Education.

- Signup: pick **cluster** (loads the vertical pack), then **specific type** from a
  dropdown (~6–8 per cluster, ~50 total). Both stored on `BusinessProfile`
  (`industryCluster`, `businessType`) and available to every agent prompt for tuning.
- Phase 5 vertical packs: **one pack per cluster (8 total)**, each tuning all 8
  department heads. First pack recommended: **Home & Trade Services** or **Automotive**
  (existing test scenarios lean automotive).
- **Schema add (additive, when the refactor runs):** `BusinessProfile.industryCluster`,
  `BusinessProfile.businessType`. No change to existing fields.

---

## 6. v1 → v2 mapping (registry impact)

| v2 department (registry id) | Absorbs v1 agents (as skills) |
|---|---|
| `sales` | Lead Nurture, Quote Follow-up, Quote Generator (+ cold_outreach) |
| `marketing` | Campaign, Content Writer, Social Post, Review Request, SEO Recommendations, AI Visibility |
| `customer_service` | Customer Question, Complaint Handler (+ retention) |
| `operations` | Booking, Appointment Reminder, Lead Triage (internal) (+ ops_comms) |
| `invoicing` | Invoice Reminder, Payment Follow-up (+ payment_plan) |
| `accounting` | (new) financial_summary, pricing_memo, tax_prep |
| `admin_records` | (new) document, record_update, crm_cleanup (absorbs Generalist doc-drafting) |
| `people` | (new) job_post, hiring, training_doc, staff_schedule, hr_memo |
| — | **Generalist: eliminated** (§4) |
| orchestrator-direct | Weekly Briefing aggregate (§3) |

Registry goes from 18 entries to **8 owner-routable department heads** (Lead Triage
stays as internal infra invoked by Operations, not a routable entry).

---

## 7. No-em-dash website rule (Direction v2 §4)

- **Target:** the marketing website (`agentnexlify.com` + vertical landing pages) — a
  **separate repo**, not this app repo. Not enforced on agent draft outputs, in-app copy,
  or internal docs (em dashes are fine there).
- **Action in the website repo:** add a CI lint that fails on `—`/`–` in source
  (HTML/MDX/JSON/copy strings); fix the H1 typos ("dosen't" → "doesn't", "buisness" →
  "business") in the same pass.
- **Action here (this app repo):** none required for the rule itself. (Optional, when
  Marketing's website-copy skill ships: a `website` output mode that avoids em dashes and
  the owner strips any before publishing.)

---

## 8. Consolidation refactor plan (the *next* sprint, not now)

Per Direction v2 §8.2, this runs **after** the post-QA sprint (PR #2) lands. ~1 week:

1. Introduce the skill-dispatch shape in one department first (Sales is the richest) to
   prove the pattern, keeping all existing skill logic and tests green by re-pointing
   them at the new entry.
2. Port the remaining departments; move each v1 agent's compose logic into its skill.
3. Add `accounting`, `admin_records`, `people` (net-new skills).
4. Delete Generalist; rewire orchestrator fallback (§4) + add the aggregate-briefing
   direct answer (§3).
5. Update the classifier catalogue (1-of-8), keep the heuristic + Haiku paths.
6. Re-run the QA scenarios (the post-QA `scripts/verify-llm-on.ts`) against the v2 shape;
   add per-skill tests so coverage doesn't drop.
7. Add `industryCluster` / `businessType` to the schema + the 2-step signup picker.
8. Update `docs/INTEGRATION.md` (registry now 8), the partner doc migration table, and
   re-record the demo.

**Exit:** orchestrator routes 1-of-8; every v1 behavior reachable as a skill; Generalist
gone; QA scenarios pass against v2; tests green.

---

*End of Agent Library v2 spec.*
