# Partner Onboarding — v2 Update (8 Department Heads + 8 Industries)

**Date:** 31 May 2026
**Status:** Drop-in update for `AgentNexLiFy_Partner_Onboarding` (Google Doc). Per *Agent OS Direction v2* §5. Replaces the "Where today's features land inside Agent OS" migration table and fixes the worker count throughout (we route 1-of-8, not 1-of-18/25).

> Paste the sections below into the partner doc, replacing the matching existing
> sections. Internal doc — the no-em-dash website rule does not apply here.

---

## Replace: "What Agent OS becomes" → the agent-count framing

The partner doc currently says "Today we have five worker agents... over time we end up with twenty-five or so." Replace that mental model with the **8 department heads**:

> **Eight AI employees, one per part of the business.** Instead of dozens of
> narrow tools, the owner gets eight specialist agents, each owning a functional
> department the way a real employee would: **Sales, Marketing, Customer Service,
> Operations, Invoicing & Collections, Accounting & Finance, Customer Data &
> Administration, and People Management.** The owner's mental model is simple — "I
> have eight AI employees, each runs a part of my business." Each agent internally
> composes whatever output the moment calls for (a draft, a sequence, a report, a
> document), but to the owner it reads as one specialist who knows their whole
> department. The orchestrator routes each plain-English ask to the right one of
> the eight.

---

## Replace: "Where today's features land inside Agent OS" (migration table)

Every feature still migrates cleanly — it now lands as a **capability inside one of
the eight department heads** rather than its own standalone agent.

| Feature in the product today | Which department head owns it (capability) |
| :-- | :-- |
| Appointment booking | **Operations** — booking confirmations (real Google Calendar booking in month 6) |
| Auto follow-up email & SMS | **Sales** — lead-nurture sequences + scheduled triggers |
| Quote follow-ups | **Sales** — quote-specific follow-up (pulls amount/scope from pipeline) |
| Quote documents | **Sales** — line items, totals, terms, validity |
| AI content writer | **Marketing** — blog, long-form, About Us |
| Email & SMS marketing campaigns | **Marketing** — campaigns (real send via Gmail/Twilio in month 6) |
| Social media content & scheduling | **Marketing** — social posts (scheduling later) |
| Review request automation | **Marketing** — review asks + post-service trigger |
| SEO audit & suite | **Marketing** — SEO recommendations (stub now, full crawler later) |
| AI visibility tracking (GEO score) | **Marketing** — stub now; real version needs infrastructure |
| Customer questions / FAQ knowledge base | **Customer Service** — KB-grounded replies + safe-holding-reply pattern |
| Complaint handling | **Customer Service** — empathetic reply, hardcoded never-auto-send + flag for review |
| Day-before appointment reminders | **Operations** — reminders (trigger-driven) |
| Operational comms (closures, delays, "order ready") | **Operations** — general day-to-day messaging |
| Invoice reminders | **Invoicing & Collections** — friendly first-touch, pulls payment link |
| Overdue payment follow-up | **Invoicing & Collections** — escalation levels, always owner-approved |
| Analytics & reporting dashboard | **Accounting & Finance** — plain-English financial summaries + the weekly briefing |
| Customer pipeline | Structured data every department reads/writes — no separate page |
| Documents, contracts, intake forms, CRM updates | **Customer Data & Administration** (new) |
| Hiring, training, scheduling, payroll, HR | **People Management** (new) |
| Chat widget (customer-facing) | Stays where it is — now feeds conversation data to every department |
| Team accounts, webhooks, white-label, billing | Stay as platform features — not agents |

**Two genuinely new departments** (the v1 library didn't have them): **Customer Data
& Administration** (documents, contracts, CRM hygiene — also absorbs the document-
drafting the old Generalist did) and **People Management** (hiring/training/scheduling/
payroll/HR — real daily SMB work that was an obvious gap).

**The Generalist is gone.** The eight departments cover every genuine business ask.
When nothing matches confidently, the orchestrator captures the request to the
wishlist and offers the nearest department. A clearly personal, non-business request
("write a thank-you note to my mom") gets a polite decline pointing the owner to
ChatGPT/Claude for personal writing — Agent OS stays focused on the business.

---

## Add: "The weekly briefing" note

> The weekly briefing works two ways. Ask a department for its own ("show me the
> Sales briefing") and that department summarizes its slice. Ask for the whole
> picture ("show me my weekly briefing") and the orchestrator answers directly,
> pulling highlights across all eight departments — including an "owner attention
> needed" section (open complaints, overdue invoices, stale leads, knowledge-base
> gaps, no-shows) and a "what's coming" look ahead.

---

## Replace: industry framing → the 8 locked clusters

The signup industry picker locks to **eight clusters**, each a group of related SMB
types that share a vertical pack. The owner picks their cluster, then their specific
business type from a dropdown (e.g. Food & Beverage → "Coffee shop"). The cluster
loads the vertical pack; the specific type tunes copy and example asks.

| # | Industry cluster | Example business types |
| :-- | :-- | :-- |
| 1 | **Food & Beverage** | restaurants, pizza shops, diners, coffee shops, bakeries, ice cream shops, bars & pubs |
| 2 | **Retail** | convenience stores, liquor stores, boutiques, gift shops, hardware stores, pet stores, pharmacies |
| 3 | **Home & Trade Services** | plumbers, electricians, HVAC, landscapers, roofers, painters, handymen |
| 4 | **Automotive** | auto repair, tire shops, car washes, auto body, gas stations |
| 5 | **Health & Wellness** | doctors, dentists, chiropractors, physical therapy, gyms, yoga studios |
| 6 | **Professional Services** | accountants, lawyers, insurance agencies, real estate, financial advisors |
| 7 | **Personal Services** | hair salons, barber shops, nail salons, day spas, dry cleaners |
| 8 | **Childcare & Education** | daycare, tutoring centers, dance studios, music schools |

**What this changes downstream:** vertical-pack curation produces **one pack per
cluster (8 total)**, each tuning all eight department heads for that trade's language.
The marketing rewrite gets eight vertical landing pages. First pack recommended:
**Automotive** or **Home & Trade Services** (the existing demo and test scenarios lean
automotive).

---

## Update: "The decisions I need from you" → Decision 2 (first vertical pack)

The five-decision section still stands, with one resolved by Direction v2: the
industry list is **locked to the eight clusters above** (no longer an open "which
industries" question). The first-vertical-pack recommendation is unchanged
(Automotive, for the existing groundwork).

---

## Re-record the demo

Per Direction v2 §5, the partner-facing demo video should be re-recorded **after** the
consolidation refactor (the separate sprint scheduled after the in-flight post-QA
work), so the partner artifacts show the eight-department shape rather than the v1
agents. Until then, the current demo remains accurate to the shipped v1 baseline.
