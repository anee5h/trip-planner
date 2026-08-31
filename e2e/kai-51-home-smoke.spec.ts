import { expect, test } from "./fixtures";

/**
 * KAI-51 J1/J4: Home smoke — hero, trip planner, brand, and the EN⇄JA
 * locale switch, and global destination search on desktop and mobile
 * projects. Rail coverage lives in kai-74-homepage-rails.
 */

test("Home renders the hero with the product brand", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 }).first();
  await expect(h1).toBeVisible();
  const h1Text = (await h1.textContent()) ?? "";
  expect(h1Text.trim().length).toBeGreaterThan(0);
  // Brand is reachable (navbar home link).
  await expect(page.getByRole("link", { name: "Meguruto home" })).toBeVisible();
});

test("Home trip planner steppers are interactive", async ({ page }) => {
  await page.goto("/");
  const increaseParty = page
    .locator('button[aria-label="Increase party size"]:visible')
    .first();
  await expect(increaseParty).toBeVisible();
  await increaseParty.click();
  await expect(
    increaseParty.locator("xpath=../..").getByText("3", { exact: true }),
  ).toBeVisible();
});

test("Home search opens a destination result and navigates", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name.includes("mobile")) {
    await page
      .getByRole("navigation", { name: "Mobile Navigation" })
      .getByRole("button", { name: "Search" })
      .click();
  }
  const search = page.locator('input[placeholder*="Search"]:visible').first();
  await expect(search).toBeVisible();
  await search.fill("Abashiri");
  const result = page.getByRole("button", { name: /Abashiri/i }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/destinations\/abashiri-city$/);
});

test("Locale switch renders the Japanese Home", async ({ page }) => {
  await page.goto("/");
  const desktopLanguage = page.getByTestId("navbar-desktop-language-toggle");
  if (await desktopLanguage.isVisible()) {
    await desktopLanguage.click();
    await page.getByRole("button", { name: "日本語", exact: true }).click();
  } else {
    await page.goto("/ja/");
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
