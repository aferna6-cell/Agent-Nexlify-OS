import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seoRecommendations } from "./agent.js";
import { examples } from "./examples.js";
import { emptyContext, fullContext, runFromAsk } from "../_testkit.js";
import { parseHtml } from "../../lib/seo.js";

// Avoid real network in unit tests.
beforeAll(() => {
  process.env.AGENT_OS_DISABLE_FETCH = "1";
});
afterAll(() => {
  delete process.env.AGENT_OS_DISABLE_FETCH;
});

describe("seo_check tool (parseHtml)", () => {
  it("extracts title, meta description, H1 count, viewport, and alt coverage", () => {
    const html = `<html><head><title>Sunset Detailing — Phoenix</title>
      <meta name="description" content="Mobile detailing in Phoenix.">
      <meta name="viewport" content="width=device-width"></head>
      <body><h1>Welcome</h1><img src="a.jpg" alt="a clean car"><img src="b.jpg"></body></html>`;
    const f = parseHtml("https://x.test", html);
    expect(f.title).toBe("Sunset Detailing — Phoenix");
    expect(f.metaDescription).toBe("Mobile detailing in Phoenix.");
    expect(f.h1Count).toBe(1);
    expect(f.hasViewport).toBe(true);
    expect(f.imgTotal).toBe(2);
    expect(f.imgWithAlt).toBe(1);
  });
});

describe("seo_recommendations", () => {
  it("each example produces a draft with the expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(seoRecommendations, ex.owner_ask, fullContext());
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });

  it("always includes the honest 'Not checked yet' scope section", async () => {
    const { output } = await runFromAsk(seoRecommendations, "Run an SEO audit.", fullContext());
    expect(output.draft!.body).toMatch(/Not checked yet/);
    expect(output.draft!.body).toMatch(/[Bb]acklink/);
  });

  it("with no URL on file, gives general guidance and surfaces the gap", async () => {
    const { output } = await runFromAsk(seoRecommendations, "How can I improve my Google ranking?", emptyContext());
    expect(output.draft!.body).toMatch(/General best-practice/i);
    expect(output.orchestratorNotes.join("\n")).toMatch(/don't have a website/i);
  });
});
