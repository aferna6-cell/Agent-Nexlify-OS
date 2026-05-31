# Agent OS — Production Integration Contract (Phase 6)

This document is the integration contract for merging the standalone **Agent OS**
into the production **AgentNexLiFy** codebase. It is written so a second engineer
(or coding agent) can write the migration code **without asking architectural
questions**. If you hit a question this doc doesn't answer, that's a bug in this
doc — file it.

The merge is designed to be **mechanical, not surgical**: Agent OS reads the
world through three swappable seams (data, auth, feature flags). Production
provides its own implementations of those seams at startup; **no agent code,
orchestrator code, or API route changes.**

- [1. Interface inventory](#1-interface-inventory)
- [2. Data-layer abstraction (`SharedContextProvider`)](#2-data-layer-abstraction-sharedcontextprovider)
- [3. Auth abstraction (`AuthProvider`)](#3-auth-abstraction-authprovider)
- [4. Feature-flag plan (`feature_agent_os`)](#4-feature-flag-plan-feature_agent_os)
- [5. Migration script outline](#5-migration-script-outline)
- [6. Production-only agents (Lead Triage, Appointment Reminder)](#6-production-only-agents)
- [7. Merge checklist](#7-merge-checklist)

---

## 1. Interface inventory

### 1a. What Agent OS **exposes** (the public surface production consumes)

| Surface | Location | Signature / shape | Notes |
|---|---|---|---|
| **Agent registry** | `src/agents/_registry.ts` → `registry` | `registry.get(id)`, `.has(id)`, `.all()`, `.routable()`, `.byBucket(b)` | Source of truth for which agents exist. 18 agents, all schema-validated at load by `defineAgent`/`defineStub` (`src/agents/_schema.ts`). Adding an agent = add a folder + register it. |
| **Orchestrator** | `src/agents/_orchestrator.ts` → `handle()` | `handle(userId: string, ask: string, opts?: HandleOptions): Promise<HandleResult>` | The single entry point. Classifies → applies confidence rules → runs the agent → streams a trace → persists the draft → logs the routing decision. `opts.onStep` streams `StreamedTraceStep`s; `opts.forceAgentId` re-routes on owner override. |
| **Chat / run API** | `src/app/api/chat/route.ts` | `POST /api/chat` `{ ask, forceAgentId?, overrodeDecisionId? }` → SSE | Events: `step`, `routed`, `clarify`, `notes`, `answer`, `draft`, `no_draft`, `done`, `error`. Auth-gated via the AuthProvider. |
| **Draft API** | `src/app/api/drafts/[id]/route.ts` | `GET` (fetch) / `POST { action: "approve" \| "reject" }` | Approve/reject sets `Draft.status`. **Sending is not implemented in standalone** (logs to console); production wires the real send here — see §6. |
| **Wishlist API** | `src/app/api/wishlist/route.ts` | `GET` (list) / `POST { request, consideredAgents? }` | Captures unsupported asks (low-confidence routes) for demand-driven agent prioritization. |
| **Shared types** | `src/types/agent.ts` | `SharedContext`, `BusinessProfileData`, `WidgetConversationData`, `PipelineLeadData`, `AppointmentData`, `InvoiceData`, `AgentRunHistoryItem`, `KbEntry`, `AgentOutput`, `DraftOutput`, `TraceEmitter` | **The contract.** Production must produce these shapes from its own data. This is the only data vocabulary the agent engine understands. |

### 1b. What Agent OS **consumes** (must be provided by production)

| Dependency | Consumed via | Standalone source | Production must provide |
|---|---|---|---|
| **Business profile** | `SharedContext.businessProfile` | `BusinessProfile` table (Prisma) | The customer's business record mapped to `BusinessProfileData`. **Substrate rule:** present fields must be real values; missing fields surface as orchestrator gap-notes, never as draft placeholders. |
| **Widget conversations** | `SharedContext.widgetHistory` | `WidgetConversation` table | Recent closed widget chats mapped to `WidgetConversationData` (id, contactName?, intent?, summary, topics[], closedAt ISO). |
| **Pipeline state** | `SharedContext.pipelineLeads` | `PipelineLead` table | Leads with `status` ∈ {new, contacted, quoted, booked, won, lost, stale} mapped to `PipelineLeadData`. |
| **Appointments** | `SharedContext.appointments` | `Appointment` table | Mapped to `AppointmentData` (status ∈ {scheduled, completed, no_show, cancelled}). Used by Appointment Reminder + Review Request. |
| **Invoices** | `SharedContext.invoices` | `Invoice` table | Mapped to `InvoiceData` (status ∈ {paid, unpaid, overdue}). Used by Invoice Reminder + Payment Follow-up. |
| **Agent-run history persistence** | `db.agentRun`, `db.draft`, `db.traceStep`, `db.routingDecision`, `db.modelCallLog` | Prisma writes in `_orchestrator.ts`, `_trace.ts`, `lib/draft.ts` | Persistence of runs/drafts/traces/decisions/cost. See §2c — production decides whether to reuse these tables or back them with its own store. |
| **Current identity** | `AuthProvider.getCurrentIdentity()` | Auth.js session + demo bypass | `{ userId, businessProfileId }` from the production session. See §3. |
| **LLM access** | `src/lib/anthropic.ts` → `complete()` | `ANTHROPIC_API_KEY` (degrades to a deterministic local composer + $0 cost log when absent) | Production wires its own key/budget. The cost log (`ModelCallLog`) must keep recording so credit exhaustion is never silent. |

---

## 2. Data-layer abstraction (`SharedContextProvider`)

**Seam:** `src/lib/providers/shared-context.ts`

```ts
export interface SharedContextProvider {
  load(userId: string): Promise<SharedContext>;
}
export function setSharedContextProvider(p: SharedContextProvider): void;
export function getSharedContextProvider(): SharedContextProvider;
```

- **Standalone implementation:** `PrismaSharedContextProvider` in
  `src/agents/_shared-context.ts`. It is registered **on import**
  (`setSharedContextProvider(new PrismaSharedContextProvider())`), and the
  orchestrator imports that module, so the seam is always wired before any agent
  runs. `loadSharedContext(userId)` is a thin wrapper over
  `getSharedContextProvider().load(userId)` — call sites never changed.

- **What production writes:** a `ProductionSharedContextProvider implements
  SharedContextProvider` that reads the production DB and returns the same
  `SharedContext` shape, then calls `setSharedContextProvider(new
  ProductionSharedContextProvider())` at startup (after the standalone import, so
  it wins). **That is the entire data-layer migration for reads.** See the
  field-by-field mapping in §5.

- **Invariant:** `load()` must return a complete `SharedContext` — empty arrays,
  never `null`/`undefined` collections. The honest-trace rule depends on this:
  agents report "no data" by seeing an empty array, and must never throw on a
  cold/empty business.

### 2c. Postgres datasource

The standalone build runs SQLite; production runs Postgres. A ready-to-use
Postgres schema ships at **`prisma/schema.postgres.prisma`** — identical to the
SQLite schema except `provider = "postgresql"` (Prisma 6 can't pick the provider
via `env()`, so it's a separate file; `tests/schema.sync.test.ts` fails CI if the
two drift). The models are provider-agnostic — **verified end-to-end**: `prisma
db push` + seed + the orchestrator/agents all run against real Postgres
(`npm run setup:pg` with a `postgresql://` `DATABASE_URL`). No schema edits are
required at merge time.

### 2d. Run/draft persistence

The orchestrator currently writes runs, drafts, traces, routing decisions, and
model-call logs directly via Prisma (`db.*`). For the first production rollout
**keep these tables** (port the models from `prisma/schema.postgres.prisma` into
the production schema, optionally with an `agentos_` table prefix via `@@map`). A
future cleanup can introduce a `RunStore` seam mirroring this one; it is **out of
scope for the first merge** and not required by the exit criterion. Decision:
reuse the tables behind the production datasource.

---

## 3. Auth abstraction (`AuthProvider`)

**Seam:** `src/lib/providers/auth.ts`

```ts
export interface AuthIdentity { userId: string; businessProfileId: string; }
export interface AuthProvider { getCurrentIdentity(): Promise<AuthIdentity | null>; }
export function setAuthProvider(p: AuthProvider): void;
export function getAuthProvider(): AuthProvider;
export async function currentUserId(): Promise<string | null>; // convenience
```

- **Standalone implementation:** `NextAuthProvider` in `src/lib/auth.ts`,
  registered on import. It resolves the Auth.js session, falling back to the
  seeded demo owner under `AUTH_DEMO_BYPASS`. Single-tenant, so
  `businessProfileId === userId`.

- **What production writes:** a `ProductionAuthProvider` that reads the
  production session/JWT and returns `{ userId, businessProfileId }` where
  `businessProfileId` is the **production business/account id**. Call
  `setAuthProvider(new ProductionAuthProvider())` at startup.

- **Key semantics for the migration:**
  - `userId` — owns `AgentRun` records and is used for owner tagging.
  - `businessProfileId` — **the key data is scoped by**. In production
    (multi-tenant) the `SharedContextProvider.load()` should scope on the
    business, so the production provider should treat the `userId` argument it
    receives as the business scope, or you pass `businessProfileId` through.
  - **Migration note:** in standalone these are equal, so existing call sites
    pass `userId` to `load()`. In production, where they differ, have
    `ProductionAuthProvider` return the `businessProfileId`, and have the chat
    route pass `identity.businessProfileId` into `handle()` as the scope key
    (one-line change in `src/app/api/chat/route.ts`, already flagged in §7).

---

## 3b. Write-side abstraction (`OwnerActions`)

**Seam:** `src/lib/providers/owner-actions.ts`

```ts
export interface OwnerActions {
  tagAiVisibilityInterest(userId: string): Promise<boolean>; // best-effort
}
export function setOwnerActions(a: OwnerActions): void;
export function getOwnerActions(): OwnerActions;
```

`SharedContext` is read-only, but a few agents need a small, well-defined
**write** (e.g. AI Visibility tags the owner record for the beta invite). Those
writes go through this seam — **no agent imports Prisma directly** (enforced by
review: `grep -rl lib/db src/agents/*/agent.ts` must be empty). The interface is
deliberately one-method-per-side-effect (never a generic `write`) so the
production surface stays auditable.

- **Standalone:** `PrismaOwnerActions` in `src/agents/_shared-context.ts`,
  registered on import alongside the data-layer provider.
- **Production:** implement `OwnerActions` against your store (set
  `aiVisibilityInterest` on the business/owner record) and call
  `setOwnerActions(...)` at startup. Best-effort contract: never throw; return
  `false` if the write fails and the agent still drafts.

---

## 4. Feature-flag plan (`feature_agent_os`)

**Seam:** `src/lib/feature-flags.ts`

```ts
type FeatureFlag =
  | "feature_agent_os"               // umbrella: is Agent OS visible at all
  | "feature_agent_os_autosend"      // allow approved drafts to actually send
  | "feature_agent_os_lead_triage"   // event-triggered Lead Triage
  | "feature_agent_os_appt_reminder";// scheduled Appointment Reminder
export function isFeatureEnabled(flag, ctx?): Promise<boolean>;
export function setFeatureFlagProvider(p): void;
```

- **Standalone:** `EnvFeatureFlagProvider` — `feature_agent_os` defaults **on**
  (demo works out of the box), sub-flags default **off** (standalone has no real
  send / no event triggers). Override with `FLAG_<UPPER_SNAKE>=true|false`.

- **Production:** call `setFeatureFlagProvider()` with an adapter over the real
  flag service (LaunchDarkly / Statsig / DB cohort table), keyed on
  `ctx.businessProfileId`.

**Rollout sequence:**

1. **Internal allow-list.** `feature_agent_os` OFF for all customers; ON only for
   internal staff business ids. Validate routing accuracy on real data via
   `/admin/routing`, cost via `/admin/costs`.
2. **Cohort ramp.** 1% → 5% → 25% → 50% of businesses, gated on: routing
   accuracy ≥ target, cost-per-run within budget, zero auto-send incidents
   (`feature_agent_os_autosend` stays OFF — everything is drafts-only).
3. **100% + retire.** Flip to 100%, bake, then delete the flag and make Agent OS
   the default surface.
4. **Sub-flags ramp independently** once the umbrella is stable: enable
   `feature_agent_os_appt_reminder` (scheduled trigger) and
   `feature_agent_os_lead_triage` (event trigger) per-cohort; enable
   `feature_agent_os_autosend` last and most cautiously (complaint/quote/payment
   agents are hardcoded `never_auto_send` regardless — see §6).

**Where to check the flag:** gate the **entry points**, not the engine — the
Agent OS nav entry / route guard checks `feature_agent_os`; the send action
checks `feature_agent_os_autosend`; the trigger wiring (§6) checks the
per-agent sub-flags. The orchestrator itself stays flag-free so behavior is
identical in and out of the cohort.

---

## 5. Migration script outline

Goal: migrate **one production customer's** data into the Agent OS context shape
so the agents can run against real data. This is a **read-mapping** problem — the
`SharedContextProvider` already defines the target shape; the migration just maps
production rows to it. Two delivery modes:

- **(A) Live provider mapping (preferred, no data copy):** the
  `ProductionSharedContextProvider` maps on read. No backfill needed for most
  entities; the "migration" is the mapping code below.
- **(B) Backfill (only where production has no equivalent table):** widget
  conversations may need a one-time backfill if production stores them
  differently.

### 5a. Business profile transform

Target: `BusinessProfileData` (`src/types/agent.ts`). Map production business →:

| Agent OS field | Production source (fill in per prod schema) | Rule |
|---|---|---|
| `businessName` | `business.name` | required-ish; if absent, agents omit it (never placeholder) |
| `ownerName` | `business.owner.displayName` | used for draft sign-off |
| `industry`, `city`, `state` | business profile fields | optional |
| `phone`, `email`, `website` | business contact fields | optional |
| `hoursSummary` | derive from `business.hours` → one-line summary | optional |
| `timezone` | `business.timezone` | **required for Appointment Reminder** date math |
| `reviewLinkGoogle/Yelp/Facebook` | business review links | used by Review Request |
| `paymentLink` | business payment/invoice link | used by Invoice Reminder / Payment Follow-up |

**Rule:** only map fields that have real values. Leave the rest `undefined` — the
`Authoring` helper turns absence into an orchestrator gap-note, never a bracketed
placeholder in a draft.

### 5b. Widget conversation backfill

Target: `WidgetConversationData[]`. Per production widget/chat record:

| Field | Source | Rule |
|---|---|---|
| `id` | prod conversation id | stable id |
| `contactName` | contact/lead name | optional |
| `intent` | prod intent label **OR** run **Lead Triage** (§6) to derive | normalize to {booking, question, complaint, lead, spam} |
| `summary` | last-message snippet or prod summary | required, non-empty |
| `topics` | tags → `string[]` | optional |
| `closedAt` | conversation closed timestamp → **ISO string** | required for "what came in yesterday" |

Backfill window: last 14–30 days is enough for the orchestrator's direct
widget-activity answers. If production has no intent label, pipe each
conversation's text through the Lead Triage agent (`registry.get("lead_triage")`)
to populate `intent` — that's exactly its job.

### 5c. Pipeline state mapping

Target: `PipelineLeadData[]`. Map production pipeline/opportunity →:

| Field | Source | Rule |
|---|---|---|
| `id`, `name` | lead id / contact name | required |
| `status` | map prod stage → {new, contacted, quoted, booked, won, lost, stale} | **mapping table below** |
| `subject` | what the lead is about | optional |
| `quoteAmount` | quoted $ (number) | optional; Quote Follow-up uses it |
| `lastContactDate` | last touch → ISO string | drives "stale" + nurture timing |

Stage mapping (adjust to prod's actual stages):
`lead/inbound → new`, `working/contacted → contacted`,
`quote_sent → quoted`, `scheduled → booked`, `closed_won → won`,
`closed_lost → lost`, and anything with no contact in N days → `stale`.

Appointments and invoices map analogously to `AppointmentData` / `InvoiceData`
(status enums in §1b). These power Appointment Reminder, Review Request, Invoice
Reminder, and Payment Follow-up.

### 5d. Validation

After mapping, validate the migration by calling
`getSharedContextProvider().load(businessId)` for the customer and asserting:
non-throwing, `businessProfile.businessName` present, and the 6 demo beats from
`DEMO.md` produce sensible routes. A migration smoke test mirroring
`scripts/verify-phase5.ts` against the production provider is the recommended
gate.

---

## 6. Production-only agents

Two agents were built in Phase 6 because they need production capabilities (the
product plan's Phase 4: real event triggers + the Google Calendar tool that
ships with the production merge). **Both are fully implemented and tested in the
standalone repo** (so routing/drafting is proven); production only needs to wire
their **triggers** and **tools**.

### Lead Triage — `src/agents/lead_triage/agent.ts`
- **Channel:** `internal`. **Trigger:** `widget_conversation_closed` event.
- **Does:** classifies a closed widget conversation's snippet into
  {booking, question, complaint, lead, spam} and suggests a pipeline status +
  next step. Produces an internal draft (no customer-facing send).
- **Production wiring:** on the `widget_conversation_closed` event (gated by
  `feature_agent_os_lead_triage`), call `handle(userId, "(internal) classify:
  '<snippet>'")` or invoke the agent directly. Use its output to set the lead's
  intent/stage (this is also the backfill tool in §5b).

### Appointment Reminder — `src/agents/appointment_reminder/agent.ts`
- **Channel:** `sms`. **Trigger:** scheduled daily (`0 17 * * *`).
- **Does:** finds appointments scheduled for **tomorrow** (from
  `SharedContext.appointments`, date math in the business `timezone`) and drafts
  day-before SMS reminders. No appointments tomorrow → no draft (honest).
- **Production wiring:** a daily scheduled job (gated by
  `feature_agent_os_appt_reminder`) runs the agent per business. Real send goes
  through Twilio behind `feature_agent_os_autosend`; until then it produces
  drafts for approval. **Google Calendar tool:** the production merge's calendar
  tool can replace/augment `SharedContext.appointments` as the source of
  truth — the agent only reads `context.appointments`, so point that at the
  calendar-backed data and the agent is unchanged.

> **Never-auto-send is hardcoded** in the schema for complaint / quote / payment
> agents (`permission_scope.never_auto_send`), independent of
> `feature_agent_os_autosend`. The reminder agent is `require_owner_approval:false`
> *as a spec*, but the standalone build still drafts-only; production must keep it
> behind the autosend flag for the initial rollout.

---

## 7. Merge checklist

A second engineer can complete the merge by doing exactly this:

1. **Port the schema.** Start from `prisma/schema.postgres.prisma` (already
   `provider = "postgresql"` and verified against real Postgres). Copy its data +
   run/draft/trace/decision/cost models into the production schema (optionally
   `@@map`-prefixed `agentos_`), pointed at the production datasource. (§2c)
2. **Write `ProductionSharedContextProvider`** implementing
   `SharedContextProvider`, using the §5 field mappings. Register it at startup
   with `setSharedContextProvider(...)`.
3. **Write `ProductionAuthProvider`** implementing `AuthProvider`, returning
   `{ userId, businessProfileId }` from the production session. Register with
   `setAuthProvider(...)`. **One-line follow-up:** in
   `src/app/api/chat/route.ts`, pass `identity.businessProfileId` as the scope
   key to `handle()` for multi-tenant data scoping. (§3)
4. **Write `ProductionOwnerActions`** implementing `OwnerActions` (set
   `aiVisibilityInterest` on the business/owner record) and register with
   `setOwnerActions(...)`. (§3b)
5. **Back feature flags** with the production service via
   `setFeatureFlagProvider(...)`; gate the Agent OS nav entry on
   `feature_agent_os`. (§4)
6. **Wire triggers/tools** for Lead Triage (event) and Appointment Reminder
   (schedule + calendar/Twilio), each behind its sub-flag. (§6)
7. **Wire real send** in `src/app/api/drafts/[id]/route.ts` (currently logs to
   console) behind `feature_agent_os_autosend`, respecting `never_auto_send`.
8. **Run the rollout** per §4: internal allow-list → cohort ramp → 100% → retire.

**No changes required** to: `src/agents/_orchestrator.ts`, any
`src/agents/*/agent.ts`, `src/types/agent.ts`, the classifier, or the trace
engine. That invariant is the whole point of Phase 6 — if a merge step forces a
change to one of those, treat it as a contract gap and update this document.

**Contract guards (CI-enforced, so the merge can't silently break):**
- `tests/no-direct-db-in-agents.test.ts` — fails if any `src/agents/*/agent.ts`
  imports the Prisma client. Agents read via `SharedContext` and write via
  `OwnerActions`; nothing else.
- `tests/schema.sync.test.ts` — SQLite and Postgres schemas differ only by the
  provider line.
- `src/lib/providers/providers.test.ts` — proves every seam
  (context / auth / owner-actions / flags) can be swapped at runtime.
