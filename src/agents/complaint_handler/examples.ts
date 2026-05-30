export const examples = [
  {
    owner_ask: "A customer wrote: 'I'm furious — my car came back with a scratch on the door.' Help me respond.",
    expected_route: "complaint_handler",
    expected_output_excerpt: "really sorry",
  },
  {
    owner_ask: "Angry customer says the detail job was rushed and streaky. Draft a reply.",
    expected_route: "complaint_handler",
    expected_output_excerpt: "making it right",
  },
  {
    owner_ask: "Customer is unhappy we were 40 minutes late. Respond please.",
    expected_route: "complaint_handler",
    expected_output_excerpt: "sorry",
  },
];
