import { expect, test } from "@playwright/test";

// KAI-94: Beta version badge and canonical public contact email must render
// consistently in both locales without leaking stale addresses or raw keys.

const STALE = "text=/kaihatsu\\.studio|@meguruto\\.jp/";

for (const locale of ["en-US", "ja-JP"]) {
  test.describe(`KAI-94 beta version and contact email (${locale})`, () => {
    test.use({ locale });

    test("visible version badge reads v2.0.0 Beta 1 on desktop and mobile surfaces", async ({
      page,
    }) => {
      await page.goto("/");

      const { width } = page.viewportSize() ?? { width: 1280, height: 720 };
      if (width >= 768) {
        // Desktop: version badge lives in the footer.
        await expect(page.getByText("v2.0.0 Beta 1")).toBeVisible();
      } else {
        // Mobile: version badge lives in the navbar drawer.
        await page.click('button[aria-label="Toggle menu"]');
        await expect(page.getByText("Meguruto v2.0.0 Beta 1")).toBeVisible();
      }
    });

    test("footer contact link uses the canonical mailto", async ({ page }) => {
      await page.goto("/");

      const contactLink = page.locator(
        'footer a[href="mailto:info@meguruto.app"]',
      );
      await expect(contactLink).toBeVisible();
      await expect(contactLink).not.toContainText("legal.");

      await expect(page.locator(STALE)).toHaveCount(0);
    });

    test("legal pages show the canonical contact email without stale addresses", async ({
      page,
    }) => {
      for (const route of ["/privacy", "/terms", "/cookies"]) {
        await page.goto(route);
        await expect(page.getByText("info@meguruto.app")).toBeVisible();
        await expect(page.locator(STALE)).toHaveCount(0);
      }
    });
  });
}
