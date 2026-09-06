import { expect, test, type Page } from "./fixtures";

async function setup(page: Page) {
  await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
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

async function waitForDetail(page: Page) {
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Create day plan|Create area plan/i })
      .first(),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => setup(page));

test("KAI-276: Home Today View all preserves the selected date", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Top matches for you", exact: true }),
  ).toBeVisible();
  const todayButton = page.getByRole("button", { name: /^Today/ }).first();
  await expect(todayButton).toBeVisible();
  await todayButton.click();
  const section = page
    .getByRole("heading", { name: "Top matches for you", exact: true })
    .locator("xpath=ancestor::section[1]");
  const href = await section
    .getByRole("link", { name: "View all top matches", exact: true })
    .getAttribute("href");
  expect(href).toContain("date=2026-08-12");
});

test("KAI-276: halfDay detail planner starts at the half-day window", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({ duration: "halfDay", partySize: 2 }),
    );
  });
  await page.goto("/destinations/ueno-zoo");
  await waitForDetail(page);
  const planButton = page
    .getByRole("button", { name: /Create day plan|Create area plan/i })
    .first();
  await planButton.click();
  const form = page
    .getByText("Customize Plan Preferences", { exact: true })
    .locator("xpath=ancestor::form[1]");
  await expect(form).toBeVisible();
  const text = await form.innerText();
  expect(text).toContain("09:00");
  expect(text).toContain("14:00");
  expect(text).not.toContain("18:00");
});

test("KAI-276: Compare preserves the active trip context", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({
        origin: {
          label: "Tokyo Station",
          coordinates: { lat: 35.6812, lng: 139.7671 },
          source: "station",
          transportZoneId: "mainland-honshu",
        },
        travelDate: "2026-08-20",
        dateSemantics: "custom",
        duration: "2d1n",
        partySize: 4,
        publicModes: ["train"],
        carMode: "none",
        budget: { kind: "cap", cap: 30000, tier: "standard" },
      }),
    );
    localStorage.setItem("trip-planner-compare", JSON.stringify(["ueno-zoo"]));
  });
  await page.goto("/compare");
  await expect(
    page.getByRole("heading", { name: /Compare destinations/i }),
  ).toBeVisible();
  const rows = await page.locator("tbody tr").allTextContents();
  expect(rows.join(" ")).not.toContain("Budget (Recommended)N/A");
  expect(rows.join(" ")).toContain("¥");
});

test("KAI-276: Detail to Compare modal keeps Ueno party and estimate context", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({
        origin: {
          label: "Tokyo Station",
          coordinates: { lat: 35.6812, lng: 139.7671 },
          source: "station",
          transportZoneId: "mainland-honshu",
        },
        travelDate: "2026-08-20",
        dateSemantics: "custom",
        duration: "2d1n",
        partySize: 4,
        publicModes: ["train"],
        carMode: "none",
        budget: { kind: "cap", cap: 30000, tier: "standard" },
      }),
    );
    localStorage.setItem("trip-planner-compare", JSON.stringify([]));
  });
  await page.goto("/destinations/ueno-zoo");
  await expect(page.locator("h1").first()).toBeVisible();
  const detailCostText = await page
    .getByTestId("trip-cost-breakdown")
    .innerText();
  const detailRange = detailCostText.match(/¥([\d.]+)k[–-]¥?([\d.]+)k/);
  expect(detailRange).not.toBeNull();
  await page.locator('button[aria-label="Add to Compare"]').first().click();
  await page.getByRole("button", { name: /Compare now/i }).click();
  const modal = page.locator(".fixed.inset-0").last();
  const modalCostText = await modal.innerText();
  const modalRange = modalCostText.match(/¥([\d.]+)k[-–]¥?([\d.]+)k/);
  expect(modalRange?.slice(1)).toEqual(detailRange?.slice(1));
  await expect(modal).not.toContainText("N/A");
});

test("KAI-276: browser history and logo navigation preserve the active context", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({
        origin: {
          label: "Tokyo Station",
          coordinates: { lat: 35.6812, lng: 139.7671 },
          source: "station",
          transportZoneId: "mainland-honshu",
        },
        travelDate: "2026-08-20",
        dateSemantics: "custom",
        duration: "2d1n",
        partySize: 4,
        publicModes: ["train"],
        carMode: "none",
        budget: { kind: "cap", cap: 30000, tier: "standard" },
      }),
    );
  });
  await page.goto(
    "/destinations?q=ueno&date=2026-08-20&duration=2d1n&partySize=4&mode=train",
  );
  await expect(page.locator("main")).toBeVisible();
  const detailLink = page.locator('main a[href^="/destinations/"]').first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();
  await expect(page).toHaveURL(/\/destinations\/[^/?]+/);
  await page.goBack();
  await expect(page).toHaveURL(/\/destinations\?/);
  await page.goForward();
  await expect(page).toHaveURL(/\/destinations\/[^/?]+/);
  await page.getByRole("link", { name: "Meguruto home" }).click();
  await expect(page).toHaveURL(/\/$/);
  const viewAll = page
    .getByRole("heading", { name: "Top matches for you", exact: true })
    .locator("xpath=ancestor::section[1]")
    .getByRole("link", { name: /View all top matches/i });
  await expect.poll(() => viewAll.getAttribute("href")).toMatch(/partySize=4/);
  await expect
    .poll(() => viewAll.getAttribute("href"))
    .toMatch(/duration=2d1n/);
  await expect.poll(() => viewAll.getAttribute("href")).toMatch(/mode=train/);
});
