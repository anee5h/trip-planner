import { expect, test, type Page } from "./fixtures";

const durationCases = [
  ["2D1N personal car", "2 days / 1 night", "my_car"],
  ["2D1N rental car", "2 days / 1 night", "rental"],
  ["3D2N personal car", "3 days / 2 nights", "my_car"],
] as const;

async function mockWeather(page: Page) {
  await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
  await page.route("**/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        daily: {
          time: ["2026-08-12", "2026-08-13", "2026-08-14"],
          weathercode: [0, 0, 0],
          temperature_2m_max: [25, 25, 25],
          temperature_2m_min: [18, 18, 18],
        },
      }),
    });
  });
}

async function selectDuration(page: Page, label: string) {
  const mobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (mobile) {
    await page
      .getByRole("button", { name: /Duration/ })
      .first()
      .click();
    await page.getByRole("dialog").getByRole("button", { name: label }).click();
  } else {
    await page.getByRole("combobox", { name: /Duration/ }).click();
    await page.getByRole("option", { name: label }).click();
  }
}

async function selectCarOnly(page: Page, carOption: "my_car" | "rental") {
  const mobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (mobile) {
    await page
      .locator("button:visible")
      .filter({ hasText: "Getting around" })
      .first()
      .click();
  } else {
    await page.getByTestId("transport-trigger").click();
  }

  await expect(page.getByTestId("transport-option-public")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId(`transport-option-${carOption}`).click();
  await page.getByTestId("transport-option-public").click();
  await expect(page.getByTestId("transport-option-public")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    page.getByTestId(`transport-option-${carOption}`),
  ).toHaveAttribute("aria-pressed", "true");

  if (mobile) {
    await page.getByRole("button", { name: "Close", exact: true }).click();
  } else {
    await page.getByTestId("transport-trigger").click();
  }
}

async function assertRecommendations(page: Page) {
  const section = page
    .getByRole("heading", { name: "Top matches for you", exact: true })
    .first()
    .locator("xpath=ancestor::section[1]");
  await expect(section).toBeVisible();
  await expect
    .poll(() => section.locator('a[href^="/destinations/"]').count())
    .toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "meguruto-guest-origin",
      JSON.stringify({
        label: "Tokyo Station",
        coordinates: { lat: 35.6812, lng: 139.7671 },
        source: "station",
        transportZoneId: "mainland-honshu",
      }),
    );
  });
  await mockWeather(page);
});

test.describe("KAI-262 overnight car recommendations", () => {
  for (const [name, duration, carOption] of durationCases) {
    test(`real planner UI returns recommendations for ${name}`, async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
      await page.clock.runFor(10_000);

      await selectDuration(page, duration);
      await selectCarOnly(page, carOption);
      await page
        .getByRole("button", {
          name: /Find matches|View matches|Update matches/,
        })
        .first()
        .click();

      await assertRecommendations(page);
    });
  }
});
