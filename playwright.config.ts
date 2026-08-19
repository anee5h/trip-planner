import { defineConfig, devices } from "@playwright/test";

const pwaE2e = process.env.PWA_E2E === "1";
// KAI-80: the a11y gate runs against the production preview build (never
// the dev server) so theme/reduced-motion/reflow results reflect what
// ships. Scoped to the a11y job only — normal E2E keeps the dev server.
const a11yE2e = process.env.A11Y_E2E === "1";
// KAI-80: CI builds dist ONCE (a11y-build job) and downloads it; the a11y
// matrix jobs set A11Y_PREBUILT=1 so the webServer runs preview ONLY and
// never rebuilds. Locally (no A11Y_PREBUILT) the a11y webServer builds
// with the fake a11y-test Supabase env so the auth fixture works.
const a11yPrebuilt = process.env.A11Y_PREBUILT === "1";

// KAI-126: CI context attached to every Allure result (project + shard bin
// + commit + workflow run) so the dashboard is self-describing.
const project = process.env.PLAYWRIGHT_PROJECT ?? "";
const bin = process.env.CI_BIN ?? "";

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
  reporter: [
    ["list"],
    [
      "allure-playwright",
      {
        outputFolder: "allure-results",
        // KAI-126: per-test globalLabels (NOT environmentInfo — that is
        // report-level and the LAST run wins when shards are aggregated;
        // globalLabels attach to each test result so every shard/project
        // combination keeps its identity in the merged dashboard).
        globalLabels: {
          playwrightProject: project || "local",
          ...(bin ? { ciBin: bin } : {}),
          // Use the PR HEAD sha (not GITHUB_SHA, which on PR workflows is
          // the temporary merge ref). Same convention for normal + PWA.
          ...(process.env.PR_HEAD_SHA
            ? { commit: process.env.PR_HEAD_SHA.slice(0, 8) }
            : {}),
          ...(process.env.PR_NUMBER ? { prNumber: process.env.PR_NUMBER } : {}),
          ...(process.env.PR_HEAD_REF
            ? { branch: process.env.PR_HEAD_REF }
            : {}),
          ...(process.env.GITHUB_RUN_ID
            ? { workflowRun: process.env.GITHUB_RUN_ID }
            : {}),
        },
      },
    ],
  ],
  // KAI-99: one CI retry absorbs residual runner-contention flakes so a PR
  // does not need a manual rerun for nondeterministic failures. Local runs
  // keep retries off. Unstable tests should still be redesigned, not hidden.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "en-US",
    timezoneId: "Asia/Tokyo",
    screenshot: "only-on-failure",
    // KAI-126: keep traces for Allure diagnostics (retain-on-failure
    // preserves the last run's trace for failure analysis).
    trace: "retain-on-failure",
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
    command: pwaE2e
      ? // KAI-99/PWA: normal production build + preview (pre-KAI-80
        // behavior — no fake Supabase env injected).
        "npm run build && npm run preview -- --host 127.0.0.1 --port 4173"
      : a11yE2e && a11yPrebuilt
        ? // KAI-80 CI: dist was built once in a11y-build and downloaded —
          // run preview ONLY, do not rebuild.
          "npm run preview -- --host 127.0.0.1 --port 4173"
        : a11yE2e
          ? // KAI-80 local: build with the NON-PRODUCTION fake Supabase
            // project so the authenticated-state fixture can populate
            // useAuth().user via page.route interception (no production
            // Supabase is touched).
            "VITE_SUPABASE_URL=https://a11y-test.supabase.co VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.a11y-test-anon-key npm run build && npm run preview -- --host 127.0.0.1 --port 4173"
          : "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
