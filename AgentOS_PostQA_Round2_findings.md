# Agent OS — Post-QA Round 2 Findings (LLM-on re-verification)

Generated 2026-05-31T20:01:10.691Z against the seeded Sunset Auto Care demo with live Haiku routing + Sonnet drafts.

## Phase C — 12 scenario re-verification

| # | Expected route | Actual route | Classifier | Conf | Cost | Check | Result |
|---|---|---|---|---|---|---|---|
| 1 | booking | booking | haiku | 0.95 | $0.0018 | name + business signoff | ✅ |
| 2 | booking | booking | haiku | 0.95 | $0.0019 | vehicle + scheduling constraint | ✅ |
| 3 | direct_answer | direct_answer | heuristic | 1.00 | $0.0000 | direct widget summary | ✅ |
| 4 | quote_follow_up | quote_follow_up | haiku | 0.95 | $0.0144 | first-name greeting | ✅ |
| 5 | weekly_briefing | weekly_briefing | haiku | 0.98 | $0.0098 | attention section present | ✅ |
| 6 | campaign | campaign | haiku | 0.95 | $0.0049 | real marketing copy, not prompt echo | ✅ |
| 7 | customer_question | customer_question | haiku | 0.92 | $0.0031 | routed to Customer Question, not direct-answer | ✅ |
| 8 | customer_question | customer_question | haiku | 0.95 | $0.0039 | greets Aisha; safe holding reply | ✅ |
| 9 | complaint_handler | complaint_handler | haiku | 0.95 | $0.0040 | references AC recharge specifically | ✅ |
| 10 | quote_generator | quote_generator | haiku | 0.98 | $0.0079 | totals + terms | ✅ |
| 11 | invoice_reminder | invoice_reminder | haiku | 0.92 | $0.0048 | amount referenced (8-days-overdue ideally) | ✅ |
| 12 | generalist | generalist | haiku | 0.75 | $0.0144 | real payroll answer, not coaching template | ✅ |

**Result: 12/12 scenarios pass** (acceptance ≥ 10/12).

## Phase D — per-agent cost-per-run

| Agent | Runs | Cost/run | Anomaly (>5× median) |
|---|---|---|---|
| quote_follow_up | 1 | $0.0144 | ok |
| generalist | 1 | $0.0144 | ok |
| weekly_briefing | 1 | $0.0098 | ok |
| quote_generator | 1 | $0.0079 | ok |
| campaign | 1 | $0.0049 | ok |
| invoice_reminder | 1 | $0.0048 | ok |
| complaint_handler | 1 | $0.0040 | ok |
| customer_question | 2 | $0.0035 | ok |
| booking | 2 | $0.0019 | ok |

Median cost/run: $0.0049.
