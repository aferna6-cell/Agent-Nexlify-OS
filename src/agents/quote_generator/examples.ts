export const examples = [
  {
    owner_ask: "Draft a quote for Mike — full brake job, parts $620, labor $480, net 15.",
    expected_route: "quote_generator",
    expected_output_excerpt: "$1,100",
  },
  {
    owner_ask: "Write up an estimate for Dana: ceramic coating $1,200, paint correction $600.",
    expected_route: "quote_generator",
    expected_output_excerpt: "Total",
  },
  {
    owner_ask: "Make a proposal for Sam: monthly detailing plan $150, wax add-on $40.",
    expected_route: "quote_generator",
    expected_output_excerpt: "Quote",
  },
];
