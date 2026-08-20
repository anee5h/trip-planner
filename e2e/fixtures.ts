import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "@playwright/test";

// KAI-132: the lite catalogue is a runtime fetch. Every spec that renders
// catalogue-dependent pages (Home rails, collections, search, destination
// details) must serve it deterministically. The fixture fulfills the
// route from the SOURCE JSON on disk — no dev-server round-trip, so the
// 2.7 MB payload never contends with the server under CI's 8-way E2E
// parallelism (fetching it through vite dev per worker was the bottleneck:
// the same tests failed at full local parallelism, passed at 2-4 workers).
//
// The FULL catalogue (6.5 MB) is mocked the same way for destination
// details / full-data surfaces. Safe for the CI bins: the kai-121 spec
// that asserts the REAL runtime fetch contract only runs under PWA_E2E=1
// (preview build) and does NOT use this fixture.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LITE_JSON = readFileSync(
  path.join(ROOT, "src/shared/data/destinations-index.lite.json"),
);
const FULL_JSON = readFileSync(
  path.join(ROOT, "src/shared/data/destinations-index.json"),
);

export const test = base.extend({
  page: async ({ page }, pg) => {
    await page.route("**/data/destinations-index.lite.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: LITE_JSON,
      });
    });
    await page.route("**/data/destinations-index.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: FULL_JSON,
      });
    });
    await pg(page);
  },
});
export { expect } from "@playwright/test";
