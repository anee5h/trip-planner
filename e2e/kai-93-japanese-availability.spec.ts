import { expect, test, type Page } from "./fixtures";

// KAI-93: Parity verification that Japanese locale can access previously gated
// destinations (such as abashiri-city) directly without dead-ending or blocking.

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

test.describe("KAI-93 Japanese destination availability", () => {
  test.use({ locale: "ja-JP" });

  test.beforeEach(async ({ page }) => {
    await mockForecast(page);
  });

  test("direct Japanese navigation to abashiri-city renders detail content and no dead-end", async ({
    page,
  }) => {
    await page.goto("/destinations/abashiri-city");

    // The destination detail header must be visible with the destination name
    const heading = page.getByRole("heading", {
      level: 1,
      name: "網走市",
    });
    await expect(heading).toBeVisible();

    // No Japanese-unavailable dead-end state should appear
    const deadEndMessage =
      page.getByText("この場所はまだ日本語で利用できません");
    await expect(deadEndMessage).not.toBeVisible();

    // Overview content should be present via fallback
    await expect(
      page.getByText(/Okhotsk coastal city famous for winter/i),
    ).toBeVisible();
  });
});
