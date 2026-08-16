import { expect, test } from "@playwright/test";

/**
 * KAI-51 J5: Explore — the destinations grid renders and the search filter
 * narrows it on both desktop and mobile. Sort remains a partial journey until
 * its observable ordering contract is covered.
 */

test("Explore grid renders destination cards", async ({ page }) => {
  await page.goto("/destinations");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.locator('[data-testid="destination-card-badges"]').first(),
  ).toBeVisible();
});

test("Search filter narrows the grid", async ({ page }) => {
  await page.goto("/destinations");
  const search = page.locator('input[type="search"]:visible').first();
  await expect(search).toBeVisible();
  await search.fill("kyoto");
  await expect(page).toHaveURL(/(?:\?|&)q=kyoto(?:&|$)/);
  await expect(
    page.locator("h3").filter({ hasText: /kyoto/i }).first(),
  ).toBeVisible();
  await expect(page.locator("h3").filter({ hasText: /abashiri/i })).toHaveCount(
    0,
  );
});
