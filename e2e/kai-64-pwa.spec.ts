import { expect, test } from "@playwright/test";

/**
 * KAI-64 PWA E2E — runs against the production preview (npm run test:pwa).
 *
 * External requests (wikipedia images etc.) are blocked so the page load
 * event — and therefore SW registration — is deterministic; the service
 * worker itself only ever talks to the local origin.
 */
test.describe("KAI-64 PWA", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      process.env.PWA_E2E !== "1",
      "Run with npm run test:pwa against the production preview.",
    );
    // Determinism: never wait on third-party resources.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  });

  const waitForReady = async (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        Promise.race([
          navigator.serviceWorker.ready.then((reg) => ({
            scope: reg.scope,
            state: reg.active?.state ?? null,
          })),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("service worker never became ready")),
              30_000,
            ),
          ),
        ]),
      { timeout: 35_000 },
    );

  test("registers the worker and keeps dynamic data out of Cache Storage", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(1500); // allow the load handler to register

    const pwa = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheEntries = await Promise.all(
        (await caches.keys()).map(async (key) => ({
          key,
          urls: (await (await caches.open(key)).keys()).map(
            (request) => request.url,
          ),
        })),
      );
      const manifest = await fetch("/manifest.webmanifest").then((response) =>
        response.json(),
      );

      return {
        scope: registration.scope,
        scriptUrl: registration.active?.scriptURL ?? null,
        manifest,
        cacheEntries,
      };
    });

    expect(pwa.scope).toBe("http://127.0.0.1:4173/");
    expect(pwa.scriptUrl).toBe("http://127.0.0.1:4173/sw.js");
    expect(pwa.manifest).toMatchObject({
      name: "Meguruto",
      short_name: "Meguruto",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });

    const cachedUrls = pwa.cacheEntries.flatMap((cache) => cache.urls);
    expect(cachedUrls.some((url) => url.endsWith("/"))).toBe(true);
    expect(
      cachedUrls.some((url) =>
        /supabase\.co|\/(?:rest|auth|storage)\/v1\//i.test(url),
      ),
    ).toBe(false);
    expect(cachedUrls.some((url) => /\/data\//i.test(url))).toBe(false);
  });

  test("loads the app shell on an offline deep-route reload", async ({
    page,
    context,
  }) => {
    await page.goto("/settings");
    await expect(page.locator("main")).toBeVisible();
    await waitForReady(page);
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => navigator.serviceWorker.controller?.scriptURL ?? null,
        ),
      )
      .toContain("/sw.js");

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText("Meguruto");
    } finally {
      await context.setOffline(false);
    }
  });
});
