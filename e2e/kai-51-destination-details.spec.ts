import { expect, test } from "@playwright/test";

/**
 * KAI-51 J6/J9: destination detail (EN + JA) and collections.
 * Uses the public Abashiri record (canonical fixture used by kai-68).
 */

test("Destination details render hero, tabs and cost breakdown", async ({
  page,
}) => {
  await page.goto("/destinations/abashiri-city");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Cost breakdown widget (kai-89 selector contract).
  await expect(
    page.getByRole("button", { name: "View cost breakdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View cost breakdown" }).click();
  await expect(page.getByText(/total|合計/i).first()).toBeVisible();
});

test("Japanese destination details render with the JA card", async ({
  page,
}) => {
  await page.goto("/ja/destinations/abashiri-city");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const h1 = await page
    .getByRole("heading", { level: 1 })
    .first()
    .textContent();
  // JA canonical name is present (網走市) or the EN name as fallback —
  // either way the page must not be a blank shell.
  expect(h1?.trim().length).toBeGreaterThan(0);
});

test("Collections directory lists collections", async ({ page }) => {
  await page.goto("/collections");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const cards = page.locator("a[href^='/collections/']");
  await expect(cards.first()).toBeVisible();
});

test("Collection detail renders member destinations", async ({ page }) => {
  await page.goto("/collections");
  const firstLink = page.locator("a[href^='/collections/']").first();
  await firstLink.click();
  await expect(page).toHaveURL(/\/collections\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
