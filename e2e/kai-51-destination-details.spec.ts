import { expect, test } from "./fixtures";

/**
 * KAI-51 J6/J9: destination detail (EN + JA) and collections.
 * Uses the public Abashiri record (canonical fixture used by kai-68).
 */

test("Destination details render hero, tabs and cost breakdown", async ({
  page,
}) => {
  await page.goto("/destinations/abashiri-city");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "At a glance", level: 2 }),
  ).toBeVisible();
  await expect(page.getByTestId("destination-at-a-glance")).toBeVisible();
  // Cost breakdown widget (kai-89 selector contract).
  await expect(
    page.getByRole("button", { name: "View cost breakdown" }),
  ).toBeVisible();
  await expect(page.getByTestId("trip-cost-breakdown")).toHaveCount(1);
  await expect(
    page.getByText("On-site budget (transport excluded)", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("[data-rail]").first()).toBeVisible();
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
  expect(h1?.trim().length).toBeGreaterThan(0);
  await expect(page.getByText(/合計|交通|概要/).first()).toBeVisible();
  await expect(page.getByTestId("destination-at-a-glance")).toBeVisible();
  await expect(page.getByTestId("trip-cost-breakdown")).toHaveCount(1);
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
  await expect(page.locator("a[href^='/destinations/']").first()).toBeVisible();
});
