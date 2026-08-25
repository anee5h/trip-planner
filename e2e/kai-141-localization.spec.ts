import { expect, test, type Page } from "@playwright/test";

const JAPANESE_ROUTES = [
  "/ja/",
  "/ja/destinations",
  "/ja/collections",
  "/ja/collections/unesco-japan",
  "/ja/destinations/ueno-park",
  "/ja/destinations/ueno-taito",
  "/ja/my-trips",
  "/ja/passport",
  "/ja/settings",
  "/ja/help",
];

const FORBIDDEN_JA_UI_TEXT = [
  "ARCHITECTURE & HISTORY",
  "WORLD HERITAGE",
  "NATURE & PARKS",
  "Architecture & History",
  "World Heritage",
  "Nature & Parks",
  "Hub Local Tour",
  "POI Itinerary",
  "Tokyo City",
  "Taito City",
  "Hakone Onsen",
];

async function switchLocale(page: Page, target: "en" | "ja") {
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    const menu = page.getByRole("button", { name: "Toggle menu" });
    await menu.click();
    await page.getByRole("button", { name: /^(?:言語|Language)/ }).click();
    return;
  }

  await page.getByRole("button", { name: "Select language" }).click();
  await page
    .getByRole("button", { name: target === "en" ? "English" : "日本語" })
    .click();
}

async function assertJapaneseSurface(page: Page) {
  const body = await page.locator("body").innerText();
  for (const text of FORBIDDEN_JA_UI_TEXT) {
    expect(body, `Japanese UI leaked ${text}`).not.toContain(text);
  }
  expect(body).not.toMatch(/\b(?:ui|navigation|recommendation)\.[A-Za-z]/);
  expect(body).not.toMatch(/Missing translation key|i18next::translator/i);
}

test.describe("KAI-141 Japanese locale regression guard", () => {
  test("keeps major Japanese production surfaces free of known English leakage", async ({
    page,
  }) => {
    for (const route of JAPANESE_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);
      await assertJapaneseSurface(page);
    }
  });

  test("locale switch replaces destination editorial content without stale text", async ({
    page,
  }) => {
    await page.goto("/ja/destinations/ueno-park");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("Tokyo City");
    await expect(page.locator("body")).not.toContainText("POI Itinerary");

    await switchLocale(page, "en");
    await expect(page).toHaveURL(/\/destinations\/ueno-park$/);
    await expect(page.locator("body")).toContainText("Overview");

    await switchLocale(page, "ja");
    await expect(page).toHaveURL(/\/ja\/destinations\/ueno-park$/);
    await assertJapaneseSurface(page);
    await expect(page.locator("body")).not.toContainText("Overview");
  });
});
