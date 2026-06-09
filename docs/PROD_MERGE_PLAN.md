# Agent OS — Merge to Production Plan (v2, reconciled against live prod)

> **STATUS (2026-06-09): MERGED AND LIVE IN PRODUCTION.** The v2 engine was
> vendored into `agentnexlify/agent-service/src/agent-os/` (PRs #203–#208) and
> the Phase 4 cutover shipped in agentnexlify PR #219: legacy Python agent
> layer deleted, channel→action real send wired, plan-tier caps enforced,
> Agent OS conversation is the dashboard front door. **The canonical engine
> now lives in the `agentnexlify` repo; this repo is the spec + standalone
> demo.** Engine changes land in `agentnexlify/agent-service/` first — do not
> evolve `src/agents/` here expecting a future re-vendor. M1/M2 sections
> below are kept for historical context.

**Owner:** Aidan
**Reconciled:** by Claude Code against the **live production Supabase** (`pxserpybmajixqrmzaly`) and the standalone repo.
**Supersedes:** the original `Agent OS — Merge to Production Plan` (v1, 30 May), which predated knowledge of production's existing `os_*` Agent OS.

---

## 0. The one correction that changes the whole plan

The v1 doc assumed **production has no Agent OS** — so it planned to copy `src/agents/` in, create new `AgentRun`/`Draft`/`TraceStep` tables, and build providers from scratch.

**That assumption is false.** Production already runs an Agent OS, persisted in `os_*` tables. Reading a live `os_agent_runs` row shows it is the **same lineage as the standalone, at an earlier (≈Phase 2) stage**:

- Agents in use: `booking, campaign, customer_question, generalist, lead_nurture, orchestrator` — i.e. **v1 individual agents + the (now-eliminated) Generalist**, not the v2 8 departments.
- `os_agent_runs.thought_process` (jsonb) = the **honest reasoning trace** (`"Routed to generalist"`, `"Fallback routing — orchestrator LLM unavailable"`, `"Draft prepared"`).
- `os_agent_runs.deliverable` (jsonb) = `{title, body, format}` — the standalone's `Draft` shape.
- `deliverable_status = pending_approval` — the drafts-only approval gate already exists.
- `os_action_runs.action_type` only has `echo` — **real send is stubbed**, so prod is effectively drafts-only today, same as standalone.
- `tenants.os_auto_send_enabled` — a per-tenant Agent OS flag **already exists**.

**Therefore the merge is NOT "stand up a new Agent OS beside the data layer." It is "upgrade production's existing Agent OS brain from v1 → v2,"** reusing prod's `os_*` persistence, multi-tenancy, approval flow, and usage metering. This is dramatically lower-risk and lower-effort than v1 implied — and it means **no new agent-runtime tables** (they already exist as `os_*`).

---

## 1. Ground truth: production schema (from the live DB)

Postgres on Supabase, **pgvector enabled**. Multi-tenant, scoped by `tenant_id` / `client_id` (uuid). Key tables:

**Business identity — `tenants`** (70 cols). Relevant: `id, business_name, owner_name, owner_email, business_type, city, business_state, phone, business_phone, business_address, business_hours_display, website_url, google_review_link, google_place_id, stripe_customer_id, plan, plan_status, autopilot_enabled, os_auto_send_enabled, ai_monthly_token_alert_threshold, ai_monthly_token_hard_limit`.

**Auth/team — `team_members`** (`tenant_id, email, name, role, password_hash, invite_*`). Password + team model; `tenant_id` is the account scope.

**Conversations — `os_threads` + `os_messages`** (uuid, `client_id`, `source`/`source_thread_id` multi-channel, `role`, `content`, `agent_run_id`). Legacy widget chat also in `conversations` (788 rows) / `chat_messages` (2148 rows).

**Agent runtime (existing Agent OS):**
- `os_agent_runs` — `client_id, thread_id, agent_name, status (succeeded|completed), thought_process jsonb, deliverable jsonb, deliverable_status (pending_approval|…), action_type, action_run_id, *_at`.
- `os_messages`, `os_threads` — conversation surface.
- `os_memory_entries` — `client_id, kind, content, embedding (pgvector), is_pinned` — semantic memory (standalone has none).
- `os_action_runs` + `os_outbound_log` — real-send substrate (currently `echo` stub).
- `os_tenant_usage` — `client_id, cycle_start, agent_runs, messages, input_tokens, output_tokens` — usage/cost metering.
- `os_backlog_requests` — no-fit requests = **the wishlist**, already exists.
- `os_sync_state` — multi-channel ingest cursors.

**Leads/CRM — `leads`** (39 cols, `client_id`, `status`, `stage_changed_at`, `deal_value`, `conversation_summary`). **Pipeline — `pipeline_stages`** (`tenant_id`, `is_won`, `is_lost`). **Invoices — `invoices`** (27 cols, Stripe). **KB — `kb_articles`** (+embeddings) and `faq_entries`.

---

## 2. Standalone ↔ production mapping (the real mapping)

The standalone's data concepts already have homes in `os_*`. The merge maps onto them rather than creating new tables.

| Standalone concept | Production home | Notes |
|---|---|---|
| `AgentRun` | `os_agent_runs` | already exists; add v2 fields if needed via jsonb, no new table |
| `TraceStep[]` (honest trace) | `os_agent_runs.thought_process` (jsonb array) | already the same shape (`step,label,detail,status,at`) |
| `Draft` (`title/body/channel`) | `os_agent_runs.deliverable` (jsonb) + `deliverable_status` | `channel` → add to deliverable jsonb |
| Draft approval (`pending/approved/rejected`) | `deliverable_status` (`pending_approval`…) | gate already exists |
| `WidgetConversation` / widget history | `os_threads` + `os_messages` (and legacy `conversations`) | scope by `client_id`, last-30d cap |
| `PipelineLead` | `leads` + `pipeline_stages` | map `leads.status`/stage → standalone stages |
| `ModelCallLog` (cost) | `os_tenant_usage` (+ token columns) | per-tenant metering already exists |
| `WishlistItem` | `os_backlog_requests` | already exists |
| KB | `kb_articles` + `faq_entries` | real KB with embeddings exists |
| `BusinessProfile` | `tenants` columns | direct (see §3) |
| Memory (none in standalone) | `os_memory_entries` | prod capability the standalone can start using |
| Auth `userId`/`accountId` | `team_members.id` / `tenant_id`==`client_id` | scope key is `tenant_id` (uuid) |

**Implication:** the standalone's provider seams (`SharedContextProvider`, `AuthProvider`, `OwnerActions`) get production implementations that read/write `tenants`/`leads`/`os_*` scoped by `tenant_id`. The **agent code (8 departments, orchestrator, classifier, trace/safety) ports unchanged.**

---

## 3. Business-profile field mapping (`tenants` → standalone `BusinessProfileData`)

| Standalone field | `tenants` column | Notes |
|---|---|---|
| businessName | `business_name` | direct |
| ownerName | `owner_name` | direct |
| businessType | `business_type` | **already free-text-ish, not a 27-enum** — cluster mapping easier than v1 feared |
| industryCluster | derive from `business_type` | mapping table (v1 §4.2) still useful; confirm against real distinct values |
| city / state | `city` / `business_state` | direct |
| phone | `business_phone` ?? `phone` | direct |
| email | `owner_email` | direct |
| website | `website_url` | direct |
| hoursSummary | `business_hours_display` | direct string |
| paymentLink | Stripe link (`invoices.stripe_payment_link` pattern / tenant Stripe) | may be null; agents handle |
| reviewLinkGoogle | `google_review_link` | direct (often set!) |

Most fields are **direct from `tenants`** — the substrate/no-placeholder rule will work well on real data.

---

## 4. The merge, restated as a brain-upgrade (replaces v1 §3 phases)

### M0 — Interface prep in the standalone repo (≈1 wk) — *unchanged & largely DONE*
The standalone already has `SharedContextProvider`, `AuthProvider`, `OwnerActions`, feature-flag seam, and the provider-aware Prisma build (shipped in prior sprints). M0 is mostly verifying the seam surface matches what production needs (see §2/§3). **Net-new vs. v1: trivial.**

### M1 — Port v2 brain onto prod's `os_*` runtime (≈2 wks) — *the real work*
In the **production repo**:
1. Bring over the v2 **agent library** (`src/agents/` — 8 departments + skills), **orchestrator**, **classifier**, **_schema/_trace/_authoring** (safety + honest-trace enforcement). This *replaces* prod's current v1 agent set (`booking/campaign/customer_question/generalist/lead_nurture`).
2. Write `ProductionSharedContextProvider` mapping `tenants`/`leads`/`os_threads`/`os_messages`/`kb_articles` → `SharedContext`, scoped by `tenant_id`. (§2/§3)
3. Write `ProductionAuthProvider` from the existing session/`team_members` model → `{ userId, accountId=tenant_id, ownerName }`.
4. Persist runs the way prod already does: write the orchestrator's trace to `os_agent_runs.thought_process`, the agent draft to `deliverable` + `deliverable_status`, usage to `os_tenant_usage`, wishlist to `os_backlog_requests`. **No new tables.**
5. **Eliminate Generalist** in prod too (v2 decision): the brain already declines/﻿wishlists; ensure prod's `generalist` agent_name is retired and routing uses the 8 departments.
6. Reuse/extend the existing `os_auto_send_enabled` pattern for the cohort flag (`feature_agent_os` per tenant).

**Exit:** internal tenants flip the flag and get **v2 routing/8 departments** persisted in the existing `os_*` runtime; old surfaces untouched.

### M2 — Internal dogfood + 1 friendly tenant (≈1 wk) — *as v1, but lower risk*
Because the persistence/tenancy already exist and are battle-tested, M2 focuses on **brain quality on real data** (routing accuracy, department dispatch, no cross-tenant leakage — `client_id` scoping is already enforced in `os_*`).

### M3 — Beta cohort (≈3–4 wks), M4 — GA, M5 — classic-view sunset
**Unchanged from v1 §3.** The cohort comms, classic-view toggle, 27→8 industry mapping, and sunset sequencing all still apply. (The industry mapping table and §4.2 "expand dropdowns for Pest Control/Veterinary/Cleaning/Photography" decision carry over verbatim.)

---

## 5. What got *easier* vs. the v1 doc

- **No new agent-runtime tables** — `os_agent_runs`/`os_threads`/`os_messages`/`os_tenant_usage`/`os_backlog_requests` already exist and match the standalone's shapes.
- **No new approval flow** — `deliverable_status = pending_approval` is the drafts-only gate.
- **No new cost table** — `os_tenant_usage` already meters tokens per tenant (this also moots the standalone's V-01 SQLite-isolation problem in prod).
- **No new wishlist** — `os_backlog_requests`.
- **A per-tenant Agent OS flag already exists** (`os_auto_send_enabled`) to model the cohort flag on.
- **Memory is a free upgrade** — `os_memory_entries` (pgvector) is something the standalone brain can start leveraging.

## 6. What's genuinely still hard / needs the prod repo

These need the **production codebase** (DB read access isn't enough), and are the real M1 unknowns:
1. **How prod currently invokes its Agent OS** — where `orchestrator`/`os_agent_runs` get written today (the code that produces those rows). The port must replace that call path with the v2 brain.
2. **Auth/session code** — to implement `ProductionAuthProvider` precisely.
3. **API layer vs. direct DB** — how routes read/write `os_*`.
4. **Webhooks/MCP** (`tenants.mcp_*`) consumers to preserve.
5. **Hosting/branch/deploy** for the prod app.

## 7. Decisions still open (from v1 §10, still valid)
- Industry 27→8 dropdown gaps (recommend expand for Pest Control/Veterinary/Cleaning/Photography + "tell us more").
- Beta cohort selection (5–10 friendly tenants, one per cluster).
- Agent OS domain/path in prod (cookie scoping).

## 8. Suggested first move (revised)
1. **Grant Claude access to the production repo** — then I can read the current `os_*` invocation path + auth and turn §6 unknowns into exact steps, and do the port.
2. M0 in standalone is essentially done; M1 (brain port onto `os_*`) is the heavy phase — but **smaller than v1 estimated** because persistence/tenancy/approval already exist.
3. Keep the v1 doc's cohort comms, classic-view, and sunset plan (M3–M5) verbatim.

---

*Reconciled v2. The substance change from v1: production already has an (earlier) Agent OS in `os_*`; the merge upgrades that brain to v2 rather than building a parallel one. Finalizes once prod-repo access lands.*
