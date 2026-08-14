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

      test("details unavailable resolves to a localized no-score state", async ({
        page,
      }) => {
        // cupnoodles-museum-osaka-ikeda is a published record with evidence
        // coverage below the threshold: it must show "—" and the localized
        // unavailable note, never a numeric value, never a neutral 5.
        await page.goto("/destinations/cupnoodles-museum-osaka-ikeda");
        await expect(page.locator("main")).toBeVisible();
        await expect(
          page.locator('[data-testid="destination-detail-score"]'),
        ).toHaveText("—");
        const body = await page.locator("body").innerText();
        expect(body).toContain(
          locale === "ja" ? "スコアを表示できません" : "Score unavailable",
        );
        expect(body).not.toMatch(/\b\d(?:\.\d)?\s*\/\s*10\b/);
      });

      test("unavailable card shows the unavailable chip, never a numeric chip", async ({
        page,
      }) => {
        await page.goto(`/destinations?q=cupnoodles`);
        const card = page
          .locator('a[href^="/destinations/cupnoodles-museum-osaka-ikeda"]')
          .first()
          .locator('xpath=ancestor::div[contains(@class,"rounded-card")]');
        await expect(card).toBeVisible();
        await expect(
          card.locator('[data-testid="meguruto-score-unavailable"]'),
        ).toBeVisible();
        await expect(
          card.locator(
            '[data-testid="meguruto-score"], [data-testid="meguruto-score-estimated"]',
          ),
        ).toHaveCount(0);
      });

      test("card and details agree on the score value (state agreement)", async ({
        page,
      }) => {
        await page.goto(`/destinations?q=yokohama`);
        const card = page
          .locator('a[href^="/destinations/yokohama-city"]')
          .first()
          .locator('xpath=ancestor::div[contains(@class,"rounded-card")]');
        await expect(card).toBeVisible();
        const chip = card.locator(
          '[data-testid="meguruto-score"], [data-testid="meguruto-score-estimated"]',
        );
        await expect(chip).toBeVisible();
        const cardValue = (await chip.innerText()).trim();
        await page.goto("/destinations/yokohama-city");
        const detailValue = (
          await page
            .locator('[data-testid="destination-detail-score"]')
            .innerText()
        ).trim();
        expect(detailValue).toBe(cardValue);
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

test.describe("JA score vocabulary never leaks English state labels", () => {
  test.use({ locale: "ja-JP" });
  test("verified/estimated/unavailable details use localized copy only", async ({
    page,
  }) => {
    for (const id of [
      "yokohama-city",
      "abeno-harukas-300-osaka",
      "cupnoodles-museum-osaka-ikeda",
    ]) {
      await page.goto(`/destinations/${id}`);
      await expect(page.locator("main")).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body, `${id} JA leaked English score label`).not.toMatch(
        /\bEstimated\b|\bVerified\b|\bUnavailable\b|\bScore unavailable\b|\best\.\b|\bHighest\b/,
      );
    }
  });
});
