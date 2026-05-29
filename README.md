# Agent OS

A standalone, demoable build of **Agent OS** — the conversational surface for
AgentNexLiFy. A small-business owner talks to one **orchestrator** in plain
English; the orchestrator routes the ask to the best-fit **worker agent**, which
produces a draft for approval. This repository implements the full **v1 worker
agent library** (18 agents across 8 buckets), the agent registry that enforces
the architectural rules, the shared-context data layer, and an orchestrator with
the §11 routing rules.

It ships as a self-contained product that runs and tests **offline** (no API keys
required), with a pluggable LLM provider so a model-backed provider can be wired
in for a deployed environment. The eventual goal is to merge it into the main
AgentNexLiFy codebase once it's production-ready.

> Source specs live in [`docs/`](docs/): the Worker Agent Library v1 and the
> Product Plan.

---

## Quick start

```bash
npm install
npm run demo        # scripted showcase against "Sunset Mobile Detailing"
npm run demo -- "Text Maria to offer her Thursday at 2pm for a consultation."
npm test            # 168 tests — also the rule-enforcement / CI gate
npm run typecheck
```

## The three rules (enforced, not aspirational)

These come straight from the QA report on the existing Agent OS and are built in
at the architectural level. The registry enforces them and **CI fails any agent
that violates them** (`tests/conformance.test.ts` runs every agent against all
three).

1. **No false-success reasoning-trace steps.** A "loaded" step may only render
   success when the resource actually returned data. Enforced *structurally* by
   [`TraceBuilder`](src/trace/trace.ts): a load step's status is derived from the
   data, never asserted by the caller. Verified by running every agent against an
   empty context and asserting no load reports `ok`
   ([`findHonestTraceViolations`](src/registry/validate.ts)).
2. **No `[bracketed placeholders]` for fields that exist in the profile.** Agents
   resolve fields via [`AgentScratch.field`](src/agents/base.ts), which returns
   the real value or records a *gap note for the orchestrator chat* — never a
   placeholder in the customer-facing draft. The registry scans every produced
   draft ([`findPlaceholderViolations`](src/registry/validate.ts)).
3. **Every agent declares its channel and respects its formatting.** SMS / post /
   widget-reply channels must be plain text; email / sequence / report may use
   markdown. Enforced by [`findChannelViolations`](src/channels.ts) on every run.

The substrate dependency the spec calls out — wiring signup data into every
worker's prompt — is modelled by the [shared context](src/context/sharedContext.ts)
and [business profile](src/profile.ts), which every agent reads.

## Architecture

```
owner ask ─▶ Orchestrator ─▶ Router (classify + §11 rules) ─▶ Agent Registry ─▶ Worker Agent ─▶ Draft
                  │                                               │ (validates rules 2 & 3)
                  └── Wishlist capture (low-confidence asks)      └── reads Shared Context (profile, widget, pipeline, runs, KB)
```

- **Orchestrator** ([src/orchestrator/orchestrator.ts](src/orchestrator/orchestrator.ts)) —
  applies the §11 routing rules: confidence threshold (→ generalist + wishlist),
  confidence resolution (→ ask the owner), specialty preference (`$` + "quote" →
  Quote Follow-up), complaint short-circuit, channel inference, and bucket
  awareness ("what marketing agents do you have?"). The routing decision is always
  surfaced to the owner.
- **Router** ([src/orchestrator/router.ts](src/orchestrator/router.ts)) — a
  transparent, deterministic keyword/signal scorer (stands in for the Haiku
  classifier; swappable).
- **Parameter extraction** ([src/orchestrator/extract.ts](src/orchestrator/extract.ts)) —
  turns the natural-language ask into typed params for the chosen agent.
- **Registry** ([src/registry](src/registry)) — validates the §2 schema at
  registration and enforces rules 2 & 3 on every run.
- **Shared context** ([src/context](src/context)) — business profile, widget
  history, pipeline state, agent run history, KB.
- **LLM provider** ([src/llm](src/llm)) — deterministic by default (offline,
  reproducible); the Generalist uses `available()` to honor the
  "service temporarily unavailable → no draft" rule.

## The v1 agent library (18 agents)

| Bucket | Agent | Channel | Status | Priority |
| --- | --- | --- | --- | --- |
| Customer Service | Customer Question | widget_reply | existing | P1 |
| Customer Service | Complaint Handler | widget_reply | new | P3 |
| Sales | Lead Nurture | sequence | existing | P1 |
| Sales | Quote Follow-up | sequence | new | P2 |
| Marketing | Campaign | email | existing | P1 |
| Marketing | Content Writer | report | new | P2 |
| Marketing | Social Post | post | new | P2 |
| Marketing | SEO Recommendations | report | workaround | P3 |
| Scheduling & Ops | Booking | sms | existing | P1 |
| Scheduling & Ops | Appointment Reminder | sms | new | P4 |
| Finance | Quote Generator | email | new | P2 |
| Finance | Invoice Reminder | email | new | P2 |
| Finance | Payment Follow-up | sequence | new | P3 |
| Reputation | Review Request | sms | new | P2 |
| Reputation | AI Visibility (stub) | report | stub | P3 |
| Reporting | Weekly Briefing | report | new | P2 |
| System | Lead Triage | internal | new | P4 |
| System | Generalist | report | existing | P1 |

### QA-report fixes baked into the agents

- **Customer Question** — empty KB no longer leaks an internal owner-request into
  the customer draft; it produces a safe holding reply and surfaces the gap to the
  orchestrator.
- **Lead Nurture** — relative dates (`Today / +5 / +14`), date-label consistency,
  real business name in signoffs.
- **Campaign** — price front-loaded in the subject (≤ 30 chars), respects
  "keep it short", emoji density is a parameter (default low).
- **Booking** — markdown stripped from SMS, single frame (propose *or* confirm),
  never fabricates scheduling state.
- **Weekly Briefing** — empty sections are omitted entirely, never "none this week".
- **Generalist** — never produces a silent empty draft; on an unavailable model it
  produces no draft and an honest notice, and it captures wishlist signal.

## Project layout

```
src/
  types.ts            # the §2 agent schema, as enforceable types
  profile.ts          # business profile + field resolution (rule 2)
  channels.ts         # channel formatting rules (rule 3)
  trace/              # honest reasoning trace (rule 1)
  context/            # shared data layer + sample data
  registry/           # registry + validation (the rule-enforcement layer)
  llm/                # pluggable provider (deterministic default)
  agents/             # the 18 worker agents, one file each, by bucket
  orchestrator/       # router, param extraction, §11 rules, wishlist
cli/demo.ts           # runnable demo
tests/                # conformance + rules + orchestrator + behaviour
```

## Extending the library

Add an `AgentDefinition` under `src/agents/<bucket>/`, register it in
`src/agents/index.ts`, and the conformance suite holds it to the same bar
automatically. If it doesn't conform to the schema or violates a rule, CI fails.
