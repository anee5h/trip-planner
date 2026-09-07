import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixtures";

function railSection(page: Page, heading: string) {
  return page
    .getByRole("heading", { name: heading, exact: true })
    .first()
    .locator("xpath=ancestor::section[1]");
}

async function canonicalIds(locator: Locator): Promise<string[]> {
  const hrefs = await locator
    .locator('a[href^="/destinations/"]')
    .evaluateAll((links) =>
      links.map((link) =>
        new URL(link.getAttribute("href")!, location.origin).pathname
          .split("/")
          .pop()!,
      ),
    );
  return hrefs;
}

function intersection(left: readonly string[], right: readonly string[]) {
  const rightIds = new Set(right);
  return left.filter((id) => rightIds.has(id));
}

test.describe("KAI-205 composition", () => {
  test("Home discovery rails do not repeat canonical IDs when alternatives exist", async ({
    page,
  }) => {
    await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
    await page.route("**/v1/forecast**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          daily: {
            time: ["2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"],
            weathercode: [0, 0, 0, 0],
            temperature_2m_max: [25, 25, 25, 25],
            temperature_2m_min: [18, 18, 18, 18],
          },
        }),
      });
    });
    await page.goto("/");
    await page.clock.runFor(10000);

    const top = railSection(page, "Top matches for you");
    const seasonal = railSection(page, "Best places to visit this summer");
    await expect(top).toBeVisible();
    await expect(seasonal).toBeVisible();

    const topIds = await canonicalIds(top);
    const seasonalIds = await canonicalIds(seasonal);
    expect(topIds.length).toBeGreaterThan(0);
    expect(seasonalIds.length).toBeGreaterThan(0);
    expect(intersection(topIds, seasonalIds)).toEqual([]);
  });

  test("Jindaiji-style Detail rails claim overlapping destinations only once", async ({
    page,
  }) => {
    await page.goto("/destinations/chofu-historic-jindaiji-district");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const related = page.locator('[data-section="related-places"]');
    await expect(related).toBeVisible();
    const additions = related.locator(
      '[data-testid="destination-combination-rail"]',
    );
    const nearby = related
      .locator('[data-testid="destination-detail-rail"]')
      .filter({ hasText: "Nearby places" });
    const halfDay = related
      .locator('[data-testid="destination-detail-rail"]')
      .filter({ hasText: "More half-day options" });
    await expect(additions).toHaveCount(0);
    await expect(nearby).toBeVisible();
    await expect(halfDay).toHaveCount(0);

    const renderedIds = await canonicalIds(related);
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    const nearbyIds = await canonicalIds(nearby);
    const halfDayIds = await canonicalIds(halfDay);
    expect(nearbyIds.length).toBeGreaterThan(0);
    expect(halfDayIds).toEqual([]);
  });

  test("Detail combination cards keep sibling bottoms aligned", async ({
    page,
  }) => {
    await page.route(
      "**/data/destinations/akiyoshido-cave-yamaguchi.json",
      (route) => route.fulfill({ status: 404, body: "" }),
    );
    await page.goto("/destinations/akiyoshido-cave-yamaguchi");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const rail = page
      .locator('[data-testid="destination-combination-rail"]')
      .first();
    await expect(rail).toBeVisible();
    const cards = rail.locator("article");
    await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(2);
    const bottoms = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().bottom),
    );
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(2);
  });
});
