import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // workers: 2 — files run in parallel across workers (tests within a file
  // stay serial via fullyParallel:false). Cuts the ~34 min serial suite to
  // roughly half on GH shared runners; per-test timeout (120s) is generous
  // enough for 2-way resource contention. See pr-checks.yml E2E history.
  workers: 2,
  timeout: 120_000,
  expect: {
    // 30s: with 2 workers sharing one runner the vite dev server can lag
    // behind single-worker timings; 10s produced contention flakes
    // (kai-49 html lang switch, kai-85 date selection) on slow runners.
    timeout: 30_000,
  },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "en-US",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
