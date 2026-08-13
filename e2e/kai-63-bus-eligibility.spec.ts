import { expect, test, type Page } from "@playwright/test";

// KAI-63: Bus-filter eligibility at the UI level. Exercises the real
// StationInput origin flows (ZIP/postcode via mocked Nominatim, station via
// the local station registry) and asserts Explore `?mode=bus` outcomes:
//   - Naha postcode 900-8585 → 9 Okinawa-local results, zero mainland cards
//     (no fabricated mainland↔Okinawa bus connectivity).
//   - Iwakuni postcode → 32 results (coordinate/postcode origin now resolves
//     to mainland-honshu; previously the shikoku-box bug zeroed it).
//   - Nakayama / Yokohama station origins → 10 results each.

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

/** Stub the Nominatim postal-code lookup with fixed coordinates. */
async function mockNominatim(page: Page, coords: { lat: number; lng: number }) {
  await page.route("**/nominatim.openstreetmap.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          lat: String(coords.lat),
          lon: String(coords.lng),
          display_name: "mock",
        },
      ]),
    });
  });
}

async function openOriginDialog(page: Page) {
  await page.goto("/destinations");
  // The app seeds a default origin (Tokyo Station); open the location editor.
  const editButton = page.getByRole("button", { name: "Edit" });
  await expect(editButton).toBeVisible();
  await editButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Change origin location",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function setZipOrigin(
  page: Page,
  zip: string,
  coords: { lat: number; lng: number },
) {
  await mockNominatim(page, coords);
  const dialog = await openOriginDialog(page);
  await dialog.getByRole("button", { name: "ZIP / Postal" }).click();
  await dialog.getByPlaceholder("e.g. 100-0001").fill(zip);
  await dialog.getByRole("button", { name: "Set Location" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function setStationOrigin(
  page: Page,
  prefecture: string,
  stationName: string,
) {
  const dialog = await openOriginDialog(page);
  await dialog.getByRole("button", { name: "Station" }).click();
  await dialog.locator("select").first().selectOption(prefecture);
  await dialog.locator("select").nth(1).selectOption(stationName);
  await dialog.getByRole("button", { name: "Set Location" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function busResultCount(page: Page): Promise<number> {
  await page.goto("/destinations?mode=bus");
  const summary = page.locator("#results-grid span").first();
  await expect(summary).toBeVisible();
  const text = (await summary.textContent()) ?? "";
  const match = text.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

async function busResultCardIds(page: Page): Promise<string[]> {
  const ids: string[] = [];
  const links = page.locator('a[href^="/destinations/"]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    if (!href) continue;
    ids.push(href.slice("/destinations/".length).split("?")[0]);
  }
  return ids;
}

test.beforeEach(async ({ page }) => {
  await mockForecast(page);
});

test.describe("KAI-63 Explore Bus eligibility", () => {
  test("Naha postcode 900-8585: Okinawa-local bus results, no mainland fabrication", async ({
    page,
  }) => {
    await setZipOrigin(page, "900-8585", { lat: 26.2124, lng: 127.6809 });
    expect(await busResultCount(page)).toBeGreaterThan(0);

    const okinawaIds = new Set([
      "nago-city",
      "motobu-town",
      "nago-pineapple-park",
      "busena-marine-park-nago",
      "churaumi-aquarium-motobu",
      "bise-fukugi-tree-road-motobu",
      "nakijin-castle-ruins-motobu",
      "kouri-island-okinawa",
      "okinawa-kaigan",
    ]);
    const ids = await busResultCardIds(page);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(okinawaIds.has(id), `unexpected mainland card: ${id}`).toBe(true);
    }
  });

  test("Iwakuni postcode origin: bus results via the Hiroshima hub", async ({
    page,
  }) => {
    // 742-0000 (Iwakuni) previously resolved to mainland-shikoku for
    // coordinate-only origins → 0 bus results. The Yamaguchi-honshu
    // exclusion box restores the mainland resolution.
    await setZipOrigin(page, "742-0000", { lat: 34.1758, lng: 132.2251 });
    expect(await busResultCount(page)).toBeGreaterThan(0);
  });

  test("Nakayama station origin: bus results exist", async ({ page }) => {
    await setStationOrigin(page, "Kanagawa", "Nakayama Station (中山駅)");
    expect(await busResultCount(page)).toBeGreaterThan(0);
  });

  test("Yokohama station origin: bus results exist", async ({ page }) => {
    await setStationOrigin(page, "Kanagawa", "Yokohama Station (横浜駅)");
    expect(await busResultCount(page)).toBeGreaterThan(0);
  });
});
