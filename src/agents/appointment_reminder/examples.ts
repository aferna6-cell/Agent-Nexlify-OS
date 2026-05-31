export const examples = [
  { owner_ask: "Send reminders for tomorrow's appointments.", expected_route: "appointment_reminder", expected_output_excerpt: "reminder" },
  { owner_ask: "Remind everyone booked for tomorrow.", expected_route: "appointment_reminder", expected_output_excerpt: "tomorrow" },
  { owner_ask: "Text my tomorrow customers a heads up.", expected_route: "appointment_reminder", expected_output_excerpt: "appointment" },
];
