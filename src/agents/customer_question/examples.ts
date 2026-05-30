export const examples = [
  {
    owner_ask:
      "A new lead asked through the widget: 'Do you guys handle hybrids? I have a 2018 Prius and the battery feels weak.' Draft a response.",
    expected_route: "customer_question",
    expected_output_excerpt: "Thanks for reaching out",
  },
  {
    owner_ask: "A customer asked what our hours are — can you reply?",
    expected_route: "customer_question",
    expected_output_excerpt: "Thanks for reaching out",
  },
  {
    owner_ask: "Someone asked if we take walk-ins. Draft a reply.",
    expected_route: "customer_question",
    expected_output_excerpt: "get back to you",
  },
];
