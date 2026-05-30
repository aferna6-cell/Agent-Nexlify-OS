import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config.
 *
 * Drives the real app end-to-end against the seeded SQLite demo data, with the
 * magic-link login bypassed (AUTH_DEMO_BYPASS=true) so tests run headless with
 * no email provider. The webServer starts a production Next build on port 3100
 * (kept off 3000 so it doesn't collide with a dev server).
 *
 * Prerequisites (CI does these as separate steps before `playwright test`):
 *   npm run build && npm run setup     # build + push schema + seed dev.db
 *   npx playwright install chromium
 * Then: npm run test:e2e
 *
 * Set E2E_BASE_URL to point at an already-running server (e.g. a deployment) and
 * the webServer is skipped entirely.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start -- -p 3100",
        url: "http://127.0.0.1:3100/agent-os",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: { AUTH_DEMO_BYPASS: "true", DATABASE_URL: "file:./dev.db" },
      },
});
