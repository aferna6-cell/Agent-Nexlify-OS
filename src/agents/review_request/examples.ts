export const examples = [
  {
    owner_ask: "Ask Maria for a Google review after her detail yesterday.",
    expected_route: "review_request",
    expected_output_excerpt: "review",
  },
  {
    owner_ask: "Send Jake a review request for his brake job.",
    expected_route: "review_request",
    expected_output_excerpt: "Jake",
  },
  {
    owner_ask: "Request a review from Dana for last week's service.",
    expected_route: "review_request",
    expected_output_excerpt: "review",
  },
];
