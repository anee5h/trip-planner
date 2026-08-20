import { test as base } from "@playwright/test";

// KAI-132: the lite catalogue is a runtime fetch. Every spec that renders
// catalogue-dependent pages (Home rails, collections, search, destination
// details) must serve it deterministically — a 2.7 MB fetch over the CI
// network would otherwise race the assertions. Extend `test` so the route
// is installed automatically before each test: the response is fetched
// from the server itself (works under both `vite preview` and `vite dev`)
// and fulfilled locally, avoiding network latency for the assertion race.
//
// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture
// API uses `use` as the continuation param; it is not a React hook.
export const test = base.extend({
  page: async ({ page }, usePage) => {
    await page.route("**/data/destinations-index.lite.json", async (route) => {
      const response = await page.request.get(
        "/data/destinations-index.lite.json",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: (await response.body()) as Buffer,
      });
    });
    await usePage(page);
  },
});
export { expect } from "@playwright/test";
