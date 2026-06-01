import { describe, it, expect } from "vitest";
import { INDUSTRY_CLUSTERS, clusterById, clusterLabel } from "./industries.js";

describe("industry clusters (v2 Decision 3)", () => {
  it("has exactly the 8 clusters", () => {
    expect(INDUSTRY_CLUSTERS).toHaveLength(8);
    expect(INDUSTRY_CLUSTERS.map((c) => c.id)).toEqual([
      "food_beverage",
      "retail",
      "home_trade",
      "automotive",
      "health_wellness",
      "professional_services",
      "personal_services",
      "childcare_education",
    ]);
  });

  it("every cluster has at least 4 specific types", () => {
    for (const c of INDUSTRY_CLUSTERS) expect(c.types.length).toBeGreaterThanOrEqual(4);
  });

  it("resolves clusters by id", () => {
    expect(clusterLabel("automotive")).toBe("Automotive");
    expect(clusterById("automotive")?.types).toContain("Tire shop");
    expect(clusterById("nope")).toBeUndefined();
    expect(clusterLabel(null)).toBeUndefined();
  });

  it("roughly 50 business types total", () => {
    const total = INDUSTRY_CLUSTERS.reduce((s, c) => s + c.types.length, 0);
    expect(total).toBeGreaterThanOrEqual(40);
    expect(total).toBeLessThanOrEqual(60);
  });
});
