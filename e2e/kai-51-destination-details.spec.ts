import { expect, test } from "./fixtures";

/**
 * KAI-51 J6/J9: destination detail (EN + JA) and collections.
 * Uses the public Abashiri record (canonical fixture used by kai-68).
 */

test("Destination details render hero, tabs and cost breakdown for sparse destinations", async ({
  page,
}) => {
  await page.goto("/destinations/abashiri-city");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "At a glance", level: 2 }),
  ).toBeVisible();
  await expect(page.getByTestId("destination-at-a-glance")).toBeVisible();
  // KAI-212 hub cost contract: unavailable on-site spend is compact and
  // explicitly transport-excluding instead of an expandable empty card.
  await expect(
    page.locator('[data-cost-state="unavailable-compact"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "View cost breakdown" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("trip-cost-breakdown")).toHaveCount(1);
  await expect(
    page.getByText("On-site budget (transport excluded)", { exact: true }),
  ).toHaveCount(0);
  // Sparse fail-closed destination has no discovery rails
  await expect(page.locator('section[data-section="top-sights"]')).toHaveCount(
    0,
  );
});

test("standard detail pages keep the planner and supporting details in a compact order", async ({
  page,
}) => {
  await page.goto("/destinations/ueno-park");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const sectionNames = await page
    .locator("[data-section]")
    .evaluateAll((sections) =>
      sections.map((section) => section.getAttribute("data-section")),
    );
  const indexOf = (name: string) => sectionNames.indexOf(name);
  expect(indexOf("overview")).toBeGreaterThanOrEqual(0);
  expect(indexOf("plan-this-trip")).toBeGreaterThan(indexOf("overview"));
  expect(indexOf("before-you-go")).toBeGreaterThan(indexOf("plan-this-trip"));
  expect(indexOf("related-places")).toBeGreaterThan(indexOf("before-you-go"));

  await expect(page.getByTestId("trip-cost-breakdown")).toHaveCount(1);
  await expect(
    page
      .locator('[data-section="overview"]')
      .getByText("Estimated visit cost", { exact: true }),
  ).toHaveCount(0);
  const supportingDetails = page
    .locator("details")
    .filter({ hasText: "More practical information" });
  await expect(supportingDetails).toHaveJSProperty("open", false);
  await supportingDetails.locator("summary").click();
  await expect(
    supportingDetails.getByRole("heading", {
      name: "Practical Information",
      exact: true,
    }),
  ).toBeVisible();
});

test("Rich destination details render discovery rails", async ({ page }) => {
  await page.goto("/destinations/kyoto-city");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-rail]").first()).toBeVisible();
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
