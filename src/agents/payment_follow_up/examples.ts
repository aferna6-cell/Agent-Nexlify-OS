export const examples = [
  {
    owner_ask: "Escalate the overdue $1,100 invoice for Mike — second notice.",
    expected_route: "payment_follow_up",
    expected_output_excerpt: "$1,100",
  },
  {
    owner_ask: "Final notice for Dana's $450 invoice, 30 days past due.",
    expected_route: "payment_follow_up",
    expected_output_excerpt: "final notice",
  },
  {
    owner_ask: "Firm payment reminder for Sam's still-unpaid $200 balance.",
    expected_route: "payment_follow_up",
    expected_output_excerpt: "payment",
  },
];
