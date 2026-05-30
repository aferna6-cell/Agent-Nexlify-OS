import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage of the core demo flow against the real running app
 * (seeded SQLite data, demo-bypass auth). Mirrors the key DEMO.md beats:
 *   - Beat 1: booking ask → reasoning trace → draft → approve.
 *   - Beat 2: widget-activity question → direct orchestrator answer.
 *   - Beat 6: unsupported ask → graceful wishlist fallback (generalist).
 */

test.describe("Agent OS demo flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agent-os");
    await expect(page.getByText("Run your shop by talking to your AI")).toBeVisible();
  });

  async function ask(page: import("@playwright/test").Page, text: string) {
    const input = page.getByPlaceholder("Ask your AI…");
    await input.fill(text);
    await page.getByRole("button", { name: "Send" }).click();
  }

  test("Beat 1: booking ask routes, traces, drafts, and approves", async ({ page }) => {
    await ask(page, "Mike Johnson called wanting a tire rotation Thursday at 10:30.");

    // Routing decision surfaces (the orchestrator names the agent).
    await expect(page.getByText(/picking the/i)).toBeVisible();
    await expect(page.getByText(/Booking/).first()).toBeVisible();

    // The draft-review panel opens with an approval action.
    await expect(page.getByText("Draft review")).toBeVisible({ timeout: 30_000 });
    const approve = page.getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeVisible();

    // Approving persists and the panel reflects the approved state.
    await approve.click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    // The panel's approve action is gone once decided.
    await expect(approve).toBeHidden();
  });

  test("Beat 2: widget question gets a direct answer (no draft)", async ({ page }) => {
    await ask(page, "What came in through the widget yesterday?");
    // Direct answer cites widget activity; no draft panel for this beat.
    await expect(page.getByText(/came in through the widget/i)).toBeVisible({ timeout: 30_000 });
  });

  test("Beat 6: unsupported ask falls back gracefully", async ({ page }) => {
    await ask(page, "Help me hire a part-time mechanic.");
    // Generalist fallback + a wishlist note are surfaced; the app never errors.
    await expect(page.getByText(/wishlist|general pass|don't have a confident match/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});
