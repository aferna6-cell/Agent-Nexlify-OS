export const examples = [
  {
    owner_ask: "Follow up with Dana on the $2,400 full repaint quote — she hasn't booked.",
    expected_route: "quote_follow_up",
    expected_output_excerpt: "$2,400",
  },
  {
    owner_ask: "Chase the quote I sent Mike for $1,100 last week.",
    expected_route: "quote_follow_up",
    expected_output_excerpt: "quote",
  },
  {
    owner_ask: "Send a follow-up on the $850 detailing quote that didn't book.",
    expected_route: "quote_follow_up",
    expected_output_excerpt: "$850",
  },
];
