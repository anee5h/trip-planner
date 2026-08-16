import { expect, test } from "@playwright/test";

/**
 * KAI-51 J1/J4: Home smoke — hero, trip planner, brand, and the EN⇄JA
 * locale switch, on desktop and mobile projects. Rail coverage lives in
 * kai-74-homepage-rails; search is exercised in kai-51-destinations-explore.
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
  const partyStep = page.getByRole("button", { name: /party size/i }).first();
  await expect(partyStep).toBeVisible();
  await partyStep.click();
  // Steppers stay functional (no crash) — planner section remains.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("Locale switch renders the Japanese Home", async ({ page }) => {
  await page.goto("/");
  const desktopLanguage = page.getByRole("button", {
    name: "Select language",
  });
  if (await desktopLanguage.isVisible()) {
    await desktopLanguage.click();
    await page.getByRole("button", { name: "日本語", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page
      .locator("#mobile-menu-drawer button")
      .filter({ hasText: "English" })
      .click();
    await page.keyboard.press("Escape");
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
