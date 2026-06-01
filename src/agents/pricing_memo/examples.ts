export const examples = [
  {
    owner_ask: "Help me think through raising my oil change price from 39 to 49.",
    expected_route: "pricing_memo",
    expected_output_excerpt: "oil change",
  },
  {
    owner_ask: "Should I raise my detail price to 200?",
    expected_route: "pricing_memo",
    expected_output_excerpt: "price",
  },
  {
    owner_ask: "Draft a pricing memo for a 10% increase.",
    expected_route: "pricing_memo",
    expected_output_excerpt: "memo",
  },
];
