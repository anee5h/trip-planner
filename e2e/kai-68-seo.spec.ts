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

    // Client-side navigation (React Router) into a destination sets
    // localized metadata.
    const destinationLink = page.locator('a[href^="/destinations/"]').first();
    await expect(destinationLink).toBeVisible();
    await destinationLink.click();
    await expect(page).toHaveURL(/\/destinations\/.+/);
    await expect
      .poll(() => page.title())
      .not.toBe("Meguruto: めぐると、見つかる。");
    await expect.poll(() => page.title()).toContain("| Meguruto");
    const destinationDescription = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(destinationDescription).not.toBe(
      "Discover day trips and weekend getaways that fit your time, budget, weather, and travel style.",
    );

    // Client-side navigation back home must restore the shell defaults
    // (KAI-68 ownership/cleanup): the destination title must not leak.
    await page.getByRole("link", { name: "Meguruto home" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect
      .poll(() => page.title())
      .toBe("Meguruto: めぐると、見つかる。");
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBe(
      "Discover day trips and weekend getaways that fit your time, budget, weather, and travel style.",
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

test.describe("KAI-101 localized share URLs", () => {
  test.use({ locale: "en-US" });

  async function switchToJapanese(page: Page) {
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
  }

  test("the /ja URL version renders Japanese even for an English browser", async ({
    page,
  }) => {
    await mockForecast(page);
    await page.goto("/ja/destinations/tokyo-station-chiyoda");

    // The URL prefix, not browser state, drives the locale.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("東京駅");

    // Internal navigation keeps the /ja prefix so every shared URL stays
    // locale-resolvable for crawlers.
    await page.getByRole("link", { name: "Meguruto home" }).first().click();
    await expect(page).toHaveURL(/\/ja$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });

  test("the canonical (English) URL stays unprefixed and English", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("a stored Japanese preference redirects unprefixed URLs to /ja even for an English browser", async ({
    page,
  }) => {
    // Simulates a returning user who chose Japanese (stored preference) and
    // lands on a canonical English URL: the UI must not stay Japanese at an
    // unprefixed URL whose crawler metadata is English.
    await page.addInitScript(() => localStorage.setItem("meguruto-lang", "ja"));
    await mockForecast(page);
    await page.goto("/destinations/tokyo-station-chiyoda");

    await expect(page).toHaveURL(/\/ja\/destinations\/tokyo-station-chiyoda/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "東京駅",
    );
  });

  test("locale switch preserves router state without adding a history entry", async ({
    page,
  }) => {
    await mockForecast(page);
    await page.goto("/");

    // Real React Router navigation: click a Home destination card. The
    // router maintains its internal key/idx on the entry.
    const destinationLink = page.locator('a[href^="/destinations/"]').first();
    await expect(destinationLink).toBeVisible();
    await destinationLink.click();
    await expect(page).toHaveURL(/\/destinations\//);

    // Attach the planning payload to the current entry the way the
    // recommendation flow does, keeping React Router's own key/idx intact.
    const planningState = {
      carMode: "driving",
      publicModes: ["car"],
      partySize: 4,
      tripMode: "weekend_2d1n",
    };
    const { key: entryKey, idx: entryIdx } = await page.evaluate((state) => {
      const current = window.history.state || {};
      window.history.replaceState(
        { ...current, usr: state },
        "",
        window.location.pathname,
      );
      return { key: current.key, idx: current.idx };
    }, planningState);
    expect(entryKey).toBeTruthy();
    const lengthBefore = await page.evaluate(() => window.history.length);

    await switchToJapanese(page);

    // The locale switch replaced the current entry (no new Back-stack
    // entry) and landed on the /ja version with the router state intact.
    await expect(page).toHaveURL(/\/ja\/destinations\//);
    expect(await page.evaluate(() => window.history.length)).toBe(lengthBefore);
    const preserved = await page.evaluate(() => window.history.state);
    expect(preserved.usr).toEqual(planningState);
    expect(preserved.key).toBe(entryKey);
    expect(preserved.idx).toBe(entryIdx);
    // The destination page consumed the preserved state: the plan reflects
    // partySize 4 from the router state instead of the default (2).
    await expect(page.getByText(/グループ.*4名/)).toBeVisible();

    // Back returns to the actual previous route (Home) — not a ghost
    // "destination in English" entry — and the boundary sync lands it on
    // the locale version of that route.
    await page.goBack().catch(() => {});
    await expect(page).not.toHaveURL(/destinations/);
    await expect(page).toHaveURL(/\/ja\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });
});
