/**
 * Orchestrator interceptor tests — guard the boundary between "answer directly"
 * and "route to a worker agent".
 */

import { describe, it, expect } from "vitest";
import { isWidgetQuery, detectComplaint } from "./_orchestrator.js";

describe("isWidgetQuery", () => {
  it("intercepts genuine widget-activity questions", () => {
    expect(isWidgetQuery("What came in through the widget yesterday?")).toBe(true);
    expect(isWidgetQuery("Show me the widget conversations from this week")).toBe(true);
    expect(isWidgetQuery("any new widget leads today?")).toBe(true);
  });

  it("does NOT intercept asks that forward a widget message for a drafted reply", () => {
    // Regression: this used to be answered directly instead of routing to
    // Customer Question because it contains "widget" + "new"/"lead".
    expect(
      isWidgetQuery(
        "A new lead asked through the widget: 'Do you handle hybrids?' Draft a response.",
      ),
    ).toBe(false);
    expect(isWidgetQuery("Reply to the widget message from Sam")).toBe(false);
    expect(isWidgetQuery("Write a response to this widget question")).toBe(false);
  });

  it("ignores asks with no widget mention", () => {
    expect(isWidgetQuery("What came in yesterday?")).toBe(false);
  });
});

describe("detectComplaint", () => {
  it("flags complaint language", () => {
    expect(detectComplaint("My car came back scratched and I'm furious")).toBe(true);
    expect(detectComplaint("I want a refund, this is unacceptable")).toBe(true);
  });
  it("does not flag neutral asks", () => {
    expect(detectComplaint("Can you book me for Thursday?")).toBe(false);
  });
});
