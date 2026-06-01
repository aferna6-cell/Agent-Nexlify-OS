export const examples = [
  {
    owner_ask: "Remind me what I need to gather for quarterly taxes.",
    expected_route: "tax_prep",
    expected_output_excerpt: "quarterly",
  },
  {
    owner_ask: "Help me prep for tax season.",
    expected_route: "tax_prep",
    expected_output_excerpt: "tax",
  },
  {
    owner_ask: "What forms do I need for payroll taxes?",
    expected_route: "tax_prep",
    expected_output_excerpt: "941",
  },
];
