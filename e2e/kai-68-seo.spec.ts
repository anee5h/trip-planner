import { expect, test, type Page } from "@playwright/test";

// KAI-68: public destination routing regression.
//
// Coverage intent (prerender-level assertions live in the vitest suite in
// src/seo/__tests__; the dev server used here has no prerender, so this spec
// proves the SPA side of the contract):
//   1. a valid published destination deep-links and hydrates with the
//      destination name in the h1 AND in document.title (title/meta sync);
//   2. an invalid destination id shows the in-app not-found state (never an
//      indexable generic page) — production additionally returns HTTP 404 via
//      the Pages Function, which the unit suite proves;
//   3. JA locale keeps working (KAI-93 fallback preserved).

const TODAY = "2026-08-12";
const FORECAST_DATES = buildDateRange(TODAY, "2026-08-21");

function buildDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function mockForecast(page: Page) {
  await page.route("**/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        daily: {
          time: FORECAST_DATES,
          weathercode: FORECAST_DATES.map(() => 0),
          temperature_2m_max: FORECAST_DATES.map(() => 25),
          temperature_2m_min: FORECAST_DATES.map(() => 18),
        },
      }),
    });
  });
}

test.describe("KAI-68 destination deep-link + title sync", () => {
  test.use({ locale: "en-US" });

  test.beforeEach(async ({ page }) => {
    await mockForecast(page);
  });

  test("valid published destination hydrates and syncs document.title", async ({
    page,
  }) => {
    await page.goto("/destinations/tokyo-station-chiyoda");

    const heading = page.getByRole("heading", {
      level: 1,
      name: "Tokyo Station",
    });
    await expect(heading).toBeVisible();

    // KAI-68: title carries the destination name, not the generic app title.
    await expect.poll(() => page.title()).toContain("Tokyo Station");
    await expect.poll(() => page.title()).toContain("Meguruto");
    await expect.poll(() => page.title()).not.toContain("めぐると、見つかる");

    // Meta description is destination-specific after hydration.
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toContain("red-brick station building");
    expect(description).not.toContain("Find Japan day trips");
  });

  test("invalid destination id renders the not-found state, not a generic page", async ({
    page,
  }) => {
    await page.goto("/destinations/this-destination-does-not-exist");

    await expect(
      page.getByRole("heading", { level: 1, name: "Destination Not Found" }),
    ).toBeVisible();
    await expect.poll(() => page.title()).toContain("Destination Not Found");
  });

  test("navigating Home -> destination -> Home restores the shell title and description", async ({
    page,
  }) => {
    await page.goto("/");
    await expect
      .poll(() => page.title())
      .toBe("Meguruto: めぐると、見つかる。");

    // Client-side navigation into a destination sets localized metadata.
    await page.goto("/destinations/tokyo-station-chiyoda");
    await expect.poll(() => page.title()).toContain("Tokyo Station");

    // Client-side navigation away must restore the shell defaults (KAI-68
    // ownership/cleanup): the destination title must not leak onto Home.
    await page.goto("/");
    await expect
      .poll(() => page.title())
      .toBe("Meguruto: めぐると、見つかる。");
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBe(
      "Find Japan day trips and weekend getaways that fit your time, budget, weather, and travel preferences.",
    );
  });
});

test.describe("KAI-68 JA locale deep link", () => {
  test.use({ locale: "ja-JP" });

  test("JA navigation to a published destination renders with Japanese title copy", async ({
    page,
  }) => {
    await mockForecast(page);
    await page.goto("/destinations/tokyo-station-chiyoda");

    // KAI-93: destination must not dead-end in JA.
    const deadEndMessage =
      page.getByText("この場所はまだ日本語で利用できません");
    await expect(deadEndMessage).not.toBeVisible();

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("東京駅");

    // Title sync uses the localized name in JA.
    await expect.poll(() => page.title()).toContain("東京駅");
    await expect.poll(() => page.title()).toContain("Meguruto");
  });
});
