import { expect, test } from "./fixtures";

const TOKYO_ORIGIN = {
  label: "Tokyo Station",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  source: "station",
  transportZoneId: "mainland-honshu",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((origin) => {
    localStorage.setItem("meguruto-guest-origin", JSON.stringify(origin));
  }, TOKYO_ORIGIN);
});

test("KAI-278 Personal Car handoff uses the displayed driving journey endpoint", async ({
  page,
}) => {
  await page.goto("/destinations/hakone-town");
  await page.evaluate(() => {
    window.history.replaceState(
      {
        ...window.history.state,
        usr: { carMode: "my_car", publicModes: [] },
      },
      "",
      "/destinations/hakone-town?car=my_car&mode=none",
    );
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Hakone Town/i }).first(),
  ).toBeVisible();

  const logistics = page.getByRole("tabpanel", {
    name: "Logistics",
    exact: true,
  });
  await expect(
    logistics.getByText("Personal Car", { exact: true }),
  ).toBeVisible();

  const directions = page.getByRole("link", { name: /Get directions/i });
  await expect(directions).toHaveCount(1);
  const href = await directions.getAttribute("href");
  expect(href).toBeTruthy();
  const url = new URL(href!);
  expect(url.searchParams.get("travelmode")).toBe("driving");
  expect(url.searchParams.get("destination")).toBe("35.2324,139.1069");
});

test("KAI-278 Kyoto child cards explicitly represent local access", async ({
  page,
}) => {
  await page.goto("/destinations/kyoto-city?car=none&mode=train,bus");
  await expect(
    page.getByRole("heading", { name: /Kyoto City/i }).first(),
  ).toBeVisible();

  const localScopes = page.locator('[data-testid="journey-scope"]');
  await expect(localScopes.first()).toBeVisible();
  await expect(localScopes.first()).toContainText("Local access");
  await expect(localScopes.first()).not.toContainText("Tokyo");
});

test("KAI-278 Shodoshima keeps known local access partial", async ({
  page,
}) => {
  await page.goto("/destinations/shodoshima");
  await expect(
    page.getByRole("heading", { name: /Shodoshima/i }).first(),
  ).toBeVisible();

  await expect(
    page.getByText("Origin journey unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Known local access:/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Get directions/i })).toHaveCount(
    0,
  );
});

test("KAI-278 Tokyo Station same-origin shows already-there, never a normal 14-19 min journey", async ({
  page,
}) => {
  await page.goto("/destinations/tokyo-station-chiyoda?car=none&mode=train");
  await expect(
    page.getByRole("heading", { name: /Tokyo Station/i }).first(),
  ).toBeVisible();

  await expect(
    page.getByText("Already there", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/14\s*[–—-]\s*19\s*min/)).toHaveCount(0);
});
