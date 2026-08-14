import { expect, test, type Page } from "@playwright/test";

const TODAY = "2026-08-12";
const FORECAST_DATES = [TODAY, "2026-08-13", "2026-08-14", "2026-08-15"];

function isMobile(projectName: string) {
  return projectName.includes("mobile");
}

async function mockHomeWeather(page: Page) {
  await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
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
    await expect(page.locator("#mobile-menu-drawer")).toHaveCount(0);
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
}

function railSection(page: Page, heading: string) {
  return page
    .getByRole("heading", { name: heading, exact: true })
    .first()
    .locator("xpath=ancestor::section[1]");
}

function railRegion(section: ReturnType<typeof railSection>, label: string) {
  return section.getByRole("region", { name: label, exact: true });
}

async function assertRailCardLimit(section: ReturnType<typeof railSection>) {
  const region = section.getByRole("region");
  await expect
    .poll(() => region.locator('a[href^="/destinations/"]').count())
    .toBeLessThanOrEqual(10);
}

test.beforeEach(async ({ page }) => {
  await mockHomeWeather(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "tabimap_recently_viewed_destinations",
      JSON.stringify(["himeji-castle"]),
    );
  });
});

test.describe("KAI-74 homepage rails", () => {
  test("keeps the day-trip hierarchy and shared desktop rail controls", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Top matches for you", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Continue exploring",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Best places to visit this summer",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Great escapes under 60 minutes",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Unexplored places near you",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Weekend getaways", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Good for today's weather", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Popular destinations/i }),
    ).toHaveCount(0);

    const top = railSection(page, "Top matches for you");
    await assertRailCardLimit(top);
    const region = railRegion(top, "Top matches for you");
    const rail = region.locator("..");
    const right = rail.getByRole("button", { name: "Scroll right" });
    const left = rail.getByRole("button", { name: "Scroll left" });
    await expect(region).toHaveClass(/scrollbar-hide/);
    await expect
      .poll(() =>
        region.evaluate((element) => ({
          scrollbarWidth: getComputedStyle(element).scrollbarWidth,
          webkitScrollbarDisplay: getComputedStyle(
            element,
            "::-webkit-scrollbar",
          ).display,
        })),
      )
      .toEqual({ scrollbarWidth: "none", webkitScrollbarDisplay: "none" });

    if (isMobile(testInfo.project.name)) {
      await expect(right).toBeHidden();
      await expect(left).toBeHidden();
      await expect(region).toHaveClass(/overflow-x-auto/);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
      await region.evaluate((element) => {
        element.scrollLeft = element.clientWidth;
        element.dispatchEvent(new Event("scroll"));
      });
      await expect
        .poll(() => region.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
      return;
    }

    await expect(right).toBeVisible();
    await expect(left).toBeHidden();
    await right.click();
    await expect
      .poll(() => region.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    await expect(left).toBeVisible();

    await region.evaluate((element) => {
      element.scrollLeft = element.scrollWidth - element.clientWidth;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(right).toBeHidden();
  });

  test("uses the weekend-only hierarchy after applying 2D1N", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: /Weekend/i }).click();
    await page
      .getByRole("button", { name: /Find matches|View matches|Update matches/ })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { name: "Top matches for you", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Weekend getaways", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Worth the longer journey",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Great escapes under 60 minutes",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Unexplored places near you",
        exact: true,
      }),
    ).toHaveCount(0);

    await assertRailCardLimit(railSection(page, "Weekend getaways"));
    await assertRailCardLimit(railSection(page, "Worth the longer journey"));
  });

  test("renders the KAI-74 homepage without Japanese key or English leakage", async ({
    page,
  }) => {
    await page.clock.setFixedTime("2026-08-15T12:00:00+09:00");
    await page.goto("/?date=2026-08-15");
    await switchToJapanese(page);

    for (const heading of [
      "あなたへのおすすめ",
      "続きを見る",
      "この夏に訪れたい場所",
      "60分以内の小さな旅",
      "近くの未訪問スポット",
      "おすすめコレクション",
    ]) {
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }

    await expect(
      page.locator('[role="region"][aria-label="あなたへのおすすめ"]'),
    ).toBeVisible();
    await expect(
      page.getByText("混雑する可能性があります").first(),
    ).toBeVisible();

    await page
      .getByRole("radio", { name: "週末・2日間1泊" })
      .click({ force: true });
    await expect(
      page.getByRole("radio", { name: "週末・2日間1泊" }),
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("button", { name: /旅先を探す|おすすめを見る|条件で更新/ })
      .first()
      .click({ force: true });

    await expect(
      page.getByRole("heading", { name: "週末のおすすめ", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "遠くても行く価値のある旅",
        exact: true,
      }),
    ).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\bhome\.[A-Za-z0-9_.-]+/);
    for (const forbidden of [
      "Top matches for you",
      "Continue exploring",
      "Weekend getaways",
      "Best places to visit this summer",
      "Great escapes under 60 minutes",
      "Unexplored places near you",
      "Worth the longer journey",
      "Scrollable content",
      "Scroll left",
      "Scroll right",
    ]) {
      expect(body).not.toContain(forbidden);
    }

    const regionLabels = await page
      .locator('[role="region"]')
      .evaluateAll((regions) =>
        regions.map((region) => region.getAttribute("aria-label")),
      );
    expect(regionLabels).toContain("あなたへのおすすめ");
    expect(regionLabels).not.toContain("Scrollable content");
    expect(
      await page.locator('[aria-label="右へスクロール"]').count(),
    ).toBeGreaterThan(0);

    const cue = page
      .locator('[aria-label*="混雑する可能性があります"]')
      .first();
    await expect(cue).toHaveAttribute("aria-label", /根拠/);
    await expect(cue).toHaveAttribute("aria-label", /情報源/);
  });
});
