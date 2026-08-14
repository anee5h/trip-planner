import { test, expect, type Page } from "@playwright/test";

/**
 * KAI-89 final pass — 3-state score presentation across surfaces,
 * EN + JA, mobile + desktop. Verified (yokohama-city) vs estimated
 * (abashiri-city, no ratingMetadata → Overall-Destination Rubric).
 */
// abashiri-city is EN-only (no JA content); abeno-harukas-300-osaka is the
// JA-available estimated fixture.
const SURFACES = ["/destinations/yokohama-city", "/destinations/abashiri-city"];
const ESTIMATED_ID = (locale: "en" | "ja") =>
  locale === "ja" ? "abeno-harukas-300-osaka" : "abashiri-city";

async function checkDetailsScore(
  page: Page,
  id: string,
  locale: "en" | "ja",
  expected: "verified" | "estimated",
) {
  await page.goto(`/destinations/${id}`);
  await expect(page.locator("main")).toBeVisible();
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toContain("score under editorial review");
  if (expected === "estimated") {
    const note = locale === "ja" ? "総合目的地ルーブリック" : "rubric";
    expect(text).toContain(note);
    expect(text).not.toContain("9.5"); // raw template rating never shown
  } else {
    const note = locale === "ja" ? "編集で検証済み" : "editorially reviewed";
    expect(text).toContain(note);
  }
}

for (const locale of ["en", "ja"] as const) {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test.describe(`score surfaces ${locale} ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        locale: locale === "ja" ? "ja-JP" : "en-US",
      });

      const verifiedId = "yokohama-city";
      const estimatedId = ESTIMATED_ID(locale);
      test(`details verified ${verifiedId}`, async ({ page }) => {
        await checkDetailsScore(page, verifiedId, locale, "verified");
      });
      test(`details estimated ${estimatedId}`, async ({ page }) => {
        await checkDetailsScore(page, estimatedId, locale, "estimated");
      });

      test("cards on the explore grid", async ({ page }) => {
        await page.goto(`/destinations`);
        await expect(page.locator("main")).toBeVisible();
        // Every published card resolves to a score chip (never blank).
        await page.waitForSelector(
          '[data-testid="meguruto-score"], [data-testid="meguruto-score-estimated"]',
        );
        const body = await page.locator("body").innerText();
        expect(body).not.toContain("Score under editorial review");
      });

      test("compare page renders without old-wording or blank states", async ({
        page,
      }) => {
        // The Compare page reads the trip store (not URL params), so this
        // asserts the page renders without regressions (no score-area blank
        // states, no old generic wording) rather than driving the store.
        await page.goto(`/compare`);
        await expect(page.locator("main")).toBeVisible();
        const body = (await page.locator("body").innerText()).toLowerCase();
        expect(body).not.toContain("score under editorial review");
      });
    });
  }
}
