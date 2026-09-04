import { expect, test, type Page } from "./fixtures";

/**
 * KAI-275: the exact production Personal-Car-only flow.
 *
 * Home → Personal Car only → Top Matches → View more → Explore → Destination
 *
 * Asserts, end to end (mobile + desktop):
 *   1. Home "Personal Car only" serializes to car=my_car&mode=none.
 *   2. Explore under that state renders car-only cards (no Train/Bus/Plane
 *      travel rows; Car icons; zero MapPin transport icons).
 *   3. Opening a destination preserves car-only: the travel-time card shows
 *      the Personal Car row and NO Train/Shinkansen/Bus rows.
 */

const COPY = {
  viewAll: "View all top matches",
  personalCar: "Personal Car",
  train: "Train",
  shinkansen: "Shinkansen",
  bus: "Bus",
  rentalCar: "Rental Car",
  travelTime: "Travel time",
  logistics: "Logistics",
} as const;

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

async function selectPersonalCarOnly(page: Page) {
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
  // Start from public transport on (the default), then Personal Car only.
  await expect(page.getByTestId("transport-option-public")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("transport-option-my_car").click();
  await page.getByTestId("transport-option-public").click();
  await expect(page.getByTestId("transport-option-public")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByTestId("transport-option-my_car")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (mobile) {
    await page.getByRole("button", { name: "Close", exact: true }).click();
  } else {
    await page.getByTestId("transport-trigger").click();
  }
}

async function selectFlexibleBudget(page: Page) {
  // A strict budget tier legitimately empties car-only Explore (partial car
  // budgets cannot satisfy a tier cap). Flexible removes the cap so the
  // regression exercises the car-only transport state with cards present.
  const mobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (mobile) {
    await page
      .locator("[data-testid=home-planner-row]")
      .filter({ hasText: "Budget" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Flexible/ })
      .click();
  } else {
    await page.getByRole("combobox", { name: /Budget/i }).click();
    await page.getByRole("option", { name: /Flexible/ }).click();
  }
}

async function applyPlanner(page: Page) {
  // The planner keeps a draft until the user applies it (Find matches).
  await page
    .getByRole("button", { name: /Find matches/i })
    .first()
    .click();
}

async function viewAllFromTopMatches(page: Page) {
  const section = page
    .getByRole("heading", { name: "Top matches for you", exact: true })
    .first()
    .locator("xpath=ancestor::section[1]");
  await expect(section).toBeVisible();
  const viewAll = section.getByRole("link", {
    name: COPY.viewAll,
    exact: true,
  });
  await expect(viewAll).toBeVisible();
  // The serializer must emit the explicit none state before we click.
  const href = (await viewAll.getAttribute("href")) ?? "";
  expect(href).toContain("car=my_car");
  expect(href).toContain("mode=none");
  await viewAll.click();
  await page.waitForURL(/\/destinations\?/);
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

test("KAI-275 Personal-Car-only survives Home → View more → Explore → Destination", async ({
  page,
}) => {
  // 1. Home planner → Personal Car only → apply → Top Matches.
  await page.goto("/");
  await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
  await selectPersonalCarOnly(page);
  await selectFlexibleBudget(page);
  await applyPlanner(page);
  await expect(
    page
      .getByRole("heading", { name: "Top matches for you", exact: true })
      .first(),
  ).toBeVisible();

  // 2. View more serializes the explicit none state (never a missing mode).
  await viewAllFromTopMatches(page);
  const url = new URL(page.url());
  expect(url.searchParams.get("car")).toBe("my_car");
  expect(url.searchParams.get("mode")).toBe("none");

  // 3. Explore cards under car-only: Car icons, never Train/Bus/Plane/MapPin.
  await expect
    .poll(() =>
      page.locator('[data-testid="destination-card-travel-time"]').count(),
    )
    .toBeGreaterThan(0);
  const rowIcons = page
    .locator('[data-testid="destination-card-travel-time"] svg')
    .evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute("class") ?? ""));
  const classes = await rowIcons;
  expect(classes.some((c) => c.includes("lucide-car"))).toBe(true);
  for (const forbidden of [
    "lucide-train-front",
    "lucide-bus",
    "lucide-plane",
    "lucide-map-pin",
  ]) {
    expect(classes.some((c) => c.includes(forbidden))).toBe(false);
  }

  // 4. Open the first destination (guaranteed car-eligible under car-only).
  await page
    .locator('a[href^="/destinations/"]')
    .filter({ hasText: "Explore" })
    .first()
    .click();
  await page.waitForURL(/\/destinations\/[^?]/);

  // 5. The Logistics travel-time panel preserves the Personal-Car-only
  //    universe: Personal Car row present (rough estimate), and no
  //    Train/Shinkansen/Bus/Rental Car rows.
  const logisticsPanel = page.getByRole("tabpanel", {
    name: COPY.logistics,
    exact: true,
  });
  await expect(
    logisticsPanel.getByText(COPY.personalCar, { exact: true }),
  ).toBeVisible();
  for (const absent of [
    COPY.train,
    COPY.shinkansen,
    COPY.bus,
    COPY.rentalCar,
  ]) {
    await expect(logisticsPanel.getByText(absent, { exact: true })).toHaveCount(
      0,
    );
  }
});
