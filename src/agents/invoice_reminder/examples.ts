export const examples = [
  {
    owner_ask: "Send Mike a reminder for invoice #1042 — $1,100, 8 days overdue.",
    expected_route: "invoice_reminder",
    expected_output_excerpt: "#1042",
  },
  {
    owner_ask: "Remind Dana about her unpaid $450 invoice.",
    expected_route: "invoice_reminder",
    expected_output_excerpt: "$450",
  },
  {
    owner_ask: "Friendly nudge on the outstanding $200 balance for Sam.",
    expected_route: "invoice_reminder",
    expected_output_excerpt: "reminder",
  },
];
