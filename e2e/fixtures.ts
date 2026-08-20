import { test as base } from "@playwright/test";

// KAI-132: the lite catalogue is a runtime fetch. Every spec that renders
// catalogue-dependent pages (Home rails, collections, search, destination
// details) must serve it deterministically — a 2.7 MB fetch over the CI
// network would otherwise race the assertions. Extend `test` so the route
// is installed automatically before each test.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/data/destinations-index.lite.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        path: "dist/data/destinations-index.lite.json",
      });
    });
    await use(page);
  },
});
export { expect } from "@playwright/test";
