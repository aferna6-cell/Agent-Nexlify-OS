export const examples = [
  {
    owner_ask: "Run an SEO audit on my site.",
    expected_route: "seo_recommendations",
    expected_output_excerpt: "Not checked yet",
  },
  {
    owner_ask: "Give me SEO recommendations for example.com.",
    expected_route: "seo_recommendations",
    expected_output_excerpt: "On-page",
  },
  {
    owner_ask: "How can I improve my Google ranking?",
    expected_route: "seo_recommendations",
    expected_output_excerpt: "recommendations",
  },
];
