import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test.describe("KAI-379 chunk-load recovery", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      process.env.PWA_E2E !== "1",
      "Run with npm run test:pwa against the production preview.",
    );
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  });

  test("recovers after the initial lazy destination chunk load fails", async ({
    page,
  }) => {
    let chunkRequests = 0;
    const documentNavigations: string[] = [];
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        documentNavigations.push(request.url());
      }
    });
    await page.route("**/assets/DestinationDetails-*.js", async (route) => {
      chunkRequests += 1;
      if (documentNavigations.length === 1) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto("/destinations/ueno-park");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Ueno Park",
    );
    await expect.poll(() => documentNavigations.length).toBe(2);
    expect(chunkRequests).toBeGreaterThanOrEqual(2);
    expect(documentNavigations).toEqual([
      "http://127.0.0.1:4173/destinations/ueno-park",
      "http://127.0.0.1:4173/destinations/ueno-park",
    ]);
  });

  test("shows the error UI after repeated chunk aborts without a reload loop", async ({
    page,
  }) => {
    let chunkRequests = 0;
    const documentNavigations: string[] = [];
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        documentNavigations.push(request.url());
      }
    });
    await page.route("**/assets/DestinationDetails-*.js", async (route) => {
      chunkRequests += 1;
      await route.abort();
    });

    await page.goto("/destinations/ueno-park");
    await expect(
      page.getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();
    expect(chunkRequests).toBeGreaterThanOrEqual(2);
    expect(documentNavigations).toEqual([
      "http://127.0.0.1:4173/destinations/ueno-park",
      "http://127.0.0.1:4173/destinations/ueno-park",
    ]);
    await page.waitForTimeout(300);
    expect(documentNavigations).toHaveLength(2);
  });
});
