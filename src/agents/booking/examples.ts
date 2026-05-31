export const examples = [
  {
    owner_ask: "Text Maria to offer her Thursday at 2pm for a consultation.",
    expected_route: "booking",
    expected_output_excerpt: "Thursday",
  },
  {
    owner_ask: "Confirm Jake's Saturday 10am detailing appointment.",
    expected_route: "booking",
    expected_output_excerpt: "confirmation",
  },
  {
    owner_ask: "Let Sam know we need to reschedule his Tuesday appointment.",
    expected_route: "booking",
    expected_output_excerpt: "reschedule",
  },
];
