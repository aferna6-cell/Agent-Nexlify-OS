export const examples = [
  {
    owner_ask: "What was our revenue last week?",
    expected_route: "financial_summary",
    expected_output_excerpt: "Summary",
  },
  {
    owner_ask: "Give me a financial summary",
    expected_route: "financial_summary",
    expected_output_excerpt: "Summary",
  },
  {
    owner_ask: "Summarize our outstanding receivables",
    expected_route: "financial_summary",
    expected_output_excerpt: "invoice",
  },
];
