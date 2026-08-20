import { test as base } from "@playwright/test";

// KAI-132: the lite catalogue is a runtime fetch. Every spec that renders
// catalogue-dependent pages (Home rails, collections, search, destination
// details) must serve it deterministically — a 2.7 MB fetch over the CI
// network would otherwise race the assertions. Extend `test` so the route
// is installed automatically before each test: the response is fetched
// from the server once per worker (module-level cache, serialized) and
// fulfilled locally, so the payload never rides the assertion critical
// path and concurrent handlers never race a disposed response.
//
// The FULL catalogue (6.5 MB) is mocked the same way for destination
// details / full-data surfaces. This is safe for the CI bins: the kai-121
// spec that asserts the REAL runtime fetch contract only runs under
// PWA_E2E=1 (preview build), where these route mocks are not installed.
//
// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture
// API uses `use` as the continuation param; it is not a React hook.

let liteBodyPromise: Promise<Buffer> | null = null;
let fullBodyPromise: Promise<Buffer> | null = null;

export const test = base.extend({
  page: async ({ page }, usePage) => {
    await page.route("**/data/destinations-index.lite.json", async (route) => {
      if (!liteBodyPromise) {
        liteBodyPromise = page.request
          .get("/data/destinations-index.lite.json")
          .then((r) => r.body() as Promise<Buffer>);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await liteBodyPromise,
      });
    });
    await page.route("**/data/destinations-index.json", async (route) => {
      if (!fullBodyPromise) {
        fullBodyPromise = page.request
          .get("/data/destinations-index.json")
          .then((r) => r.body() as Promise<Buffer>);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await fullBodyPromise,
      });
    });
    await usePage(page);
  },
});
export { expect } from "@playwright/test";
