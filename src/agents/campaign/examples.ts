export const examples = [
  {
    owner_ask: "Email blast for $59 spring detail special, ends May 31. Keep it short.",
    expected_route: "campaign",
    expected_output_excerpt: "$59",
  },
  {
    owner_ask: "Write a promo announcement for 20% off oil changes this month.",
    expected_route: "campaign",
    expected_output_excerpt: "Subject",
  },
  {
    owner_ask: "Draft an email campaign announcing our new mobile service.",
    expected_route: "campaign",
    expected_output_excerpt: "Preheader",
  },
];
