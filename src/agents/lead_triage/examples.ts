export const examples = [
  { owner_ask: "(internal) classify: 'I'd like to book Saturday.'", expected_route: "lead_triage", expected_output_excerpt: "booking" },
  { owner_ask: "(internal) classify: 'My car came back scratched.'", expected_route: "lead_triage", expected_output_excerpt: "complaint" },
  { owner_ask: "(internal) classify: 'What are your weekend hours?'", expected_route: "lead_triage", expected_output_excerpt: "question" },
];
