import { expect, test } from "@playwright/test";

/**
 * KAI-51 J5: Explore — the destinations grid renders and the search filter
 * narrows it (desktop; mobile hides the filter behind a toggle). Card →
 * detail navigation is covered by kai-51-destination-details via direct URL.
 */

function isMobile(projectName: string) {
  return projectName.includes("mobile");
}

test("Explore grid renders destination cards", async ({ page }) => {
  await page.goto("/destinations");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.locator('[data-testid="destination-card-badges"]').first(),
  ).toBeVisible();
});

test("Search filter narrows the grid (desktop)", async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo.project.name), "mobile hides the filter UI");
  await page.goto("/destinations");
  const search = page.getByLabel("Search", { exact: true }).first();
  await expect(search).toBeVisible();
  await search.fill("kyoto");
  await expect(
    page.locator('[data-testid="destination-card-badges"]').first(),
  ).toBeVisible();
});
