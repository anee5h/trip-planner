import { test, expect } from "@playwright/test";

/**
 * KAI-89 beta product decision — the Overall-Destination score is HIDDEN
 * from every user-facing surface. scoreMetadata stays internal (rubric v2,
 * provenance, validation gates); no surface renders a numeric score, a
 * score-state note, or a Best/Highest/Top score treatment. The raw
 * template rating (9.5) must never appear either.
 */
const SCORE_LABELS =
  /Overall Score|総合評価|Editorially reviewed|Estimated score from the overall-destination rubric|Score unavailable|overall-destination rubric|Meguruto score|メグルートスコア/i;

// verified (ledger provenance), estimated (model rubric) and unavailable
// (evidence coverage below threshold) fixtures across the three states.
const DETAIL_FIXTURES = [
  "yokohama-city", // verified
  "abashiri-city", // estimated
  "cupnoodles-museum-osaka-ikeda", // unavailable
];

for (const locale of ["en", "ja"] as const) {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test.describe(`score hidden ${locale} ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        locale: locale === "ja" ? "ja-JP" : "en-US",
      });

      test("details never show an overall score or score-state note", async ({
        page,
      }) => {
        for (const id of DETAIL_FIXTURES) {
          await page.goto(`/destinations/${id}`);
          await expect(page.locator("main")).toBeVisible();
          await expect(
            page.locator('[data-testid="destination-detail-score"]'),
          ).toHaveCount(0);
          const body = await page.locator("body").innerText();
          expect(body, `${id} leaked score label`).not.toMatch(SCORE_LABELS);
          expect(body).not.toContain("9.5"); // raw template rating never shown
        }
      });

      test("explore cards show no score chips", async ({ page }) => {
        for (const q of ["yokohama", "abashiri", "otsu", "cupnoodles"]) {
          await page.goto(`/destinations?q=${encodeURIComponent(q)}`);
          await expect(page.locator("main")).toBeVisible();
          await expect(
            page.locator(
              '[data-testid="meguruto-score"], [data-testid="meguruto-score-estimated"], [data-testid="meguruto-score-unavailable"]',
            ),
          ).toHaveCount(0);
        }
      });

      test("compare page renders without score labels", async ({ page }) => {
        // The Compare page reads the trip store (not URL params); assert it
        // renders without any overall-score label or treatment.
        await page.goto(`/compare`);
        await expect(page.locator("main")).toBeVisible();
        const body = (await page.locator("body").innerText()).toLowerCase();
        expect(body).not.toContain("overall score");
        expect(body).not.toContain("editorially reviewed");
        expect(body).not.toContain("score unavailable");
      });
    });
  }
}
