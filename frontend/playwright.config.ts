import { defineConfig, devices } from "@playwright/test";

// Canvas behaviour cannot be asserted from unit tests: a Konva.Stage needs a
// real 2D context, which jsdom does not provide (getContext("2d") returns null
// and Konva throws). These specs drive the running app instead, and are the
// only automated cover for Board.tsx and NodePanel.tsx.
export default defineConfig({
  testDir: "./e2e",
  // Konva drags are timing-sensitive and all specs share one dev server, so
  // running them in parallel made them flaky.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1500, height: 840 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuses an already-running `npm run dev`; starts one otherwise.
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
