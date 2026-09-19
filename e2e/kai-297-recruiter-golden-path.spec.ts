import { expect, test, type Page } from "./fixtures";

const TOKYO_ORIGIN = {
  label: "Tokyo Station",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  source: "station",
  transportZoneId: "mainland-honshu",
};

const FORECAST_DATES = ["2026-08-12", "2026-08-13", "2026-08-14"];

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1024) < 768;
}

async function seedDeterministicHome(page: Page) {
  await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
  await page.addInitScript((origin) => {
    localStorage.setItem("meguruto-guest-origin", JSON.stringify(origin));
  }, TOKYO_ORIGIN);
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

async function selectOvernight(page: Page) {
  if (isMobile(page)) {
    const planner = page.getByTestId("home-planner");
    await planner.getByRole("button", { name: "Duration" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "2 days / 1 night" })
      .click();
    return;
  }

  await page.getByRole("combobox", { name: "Duration" }).click();
  await page.getByRole("option", { name: "2 days / 1 night" }).click();
}

async function switchLocale(page: Page, target: "en" | "ja") {
  if (isMobile(page)) {
    const current = page.url().includes("/ja/") ? "ja" : "en";
    if (current !== target) {
      await page.getByTestId("navbar-mobile-language-toggle").click();
      await expect(page.locator("html")).toHaveAttribute("lang", target);
    }
    return;
  }

  await page.getByTestId("navbar-desktop-language-toggle").click();
  await page
    .getByRole("button", { name: target === "ja" ? "日本語" : "English" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", target);
}

async function clickPrimaryHomeAction(page: Page) {
  await page
    .getByRole("button", {
      name: /Find matches|旅先を探す|View matches|おすすめを見る/,
    })
    .first()
    .click();
}

async function openFirstRecommendation(page: Page) {
  const topMatches = page.getByRole("region", { name: "Top matches for you" });
  const firstCard = topMatches.locator('a[href^="/destinations/"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page).toHaveURL(/\/destinations\/[^/?]+/);
}

async function generateItinerary(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("trip-cost-breakdown")).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Logistics", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Customize|カスタマイズ/ }).click();
  await page
    .getByRole("button", { name: /Generate Plan|プランを生成/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Save Plan to Itinerary|旅程に登録/ }),
  ).toBeVisible();
}

test.describe("KAI-297 recruiter golden path", () => {
  test.beforeEach(async ({ page }) => {
    await seedDeterministicHome(page);
  });

  test("guest can move from Home through recommendations, planning and Explore", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-headline")).toBeVisible();
    await expect(page.getByTestId("home-value-proposition")).toBeVisible();
    await expect(page.locator("[data-home-origin-date-ready]")).toBeVisible();
    await expect(page.locator("[data-home-planner-ready]")).toBeVisible();

    await selectOvernight(page);
    await switchLocale(page, "ja");
    await expect(page.getByTestId("home-headline")).toBeVisible();
    await switchLocale(page, "en");
    await clickPrimaryHomeAction(page);
    await openFirstRecommendation(page);
    await generateItinerary(page);

    await page
      .getByRole("button", { name: /Save Plan to Itinerary|旅程に登録/ })
      .click();
    const authDialog = page.getByRole("dialog");
    await expect(authDialog).toBeVisible();
    await expect(
      authDialog.getByRole("heading", { name: "Save this trip" }),
    ).toBeVisible();
    await expect(
      authDialog.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
    await authDialog
      .getByRole("button", { name: "Close", exact: true })
      .click();

    const explore = page.locator('a[href="/destinations"]:visible').first();
    await expect(explore).toBeVisible();
    await explore.click();
    await expect(page).toHaveURL(/\/destinations(?:\?|$)/);
    await expect(
      page.locator('main a[href^="/destinations/"]').first(),
    ).toBeVisible();
  });

  test("Japanese search dialog has a localized accessible name", async ({
    page,
  }) => {
    await page.goto("/ja/");
    if (isMobile(page)) {
      await page
        .locator('nav[aria-label="Mobile Navigation"]')
        .getByRole("button", { name: "検索", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: /^(Ctrl K|⌘K)$/ }).click();
    }
    await expect(page.getByRole("dialog")).toHaveAccessibleName("目的地を検索");
  });

  test("browser-emulated standalone mode keeps Home usable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const result = nativeMatchMedia(query);
        if (query === "(display-mode: standalone)") {
          return { ...result, matches: true };
        }
        return result;
      };
    });
    await page.goto("/");
    await expect(
      page.locator('[data-home-display-mode="standalone"]'),
    ).toBeVisible();
    await expect(page.getByTestId("home-headline")).toBeVisible();
    await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
  });
});

const AUTH_FIXTURE_ENABLED =
  process.env.PWA_E2E !== "1" &&
  (process.env.E2E_AUTH_FIXTURE === "1" || process.env.A11Y_E2E === "1");

async function installAuthFixture(page: Page) {
  await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
  const fakeUser = {
    id: "00000000-0000-0000-0000-000000000297",
    aud: "authenticated",
    role: "authenticated",
    email: "kai-297-fixture@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {
      full_name: "KAI-297 Fixture",
      preferences: { preferences_set: true },
    },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const fakeSession = {
    access_token: "test-only-kai-297-access",
    refresh_token: "test-only-kai-297-refresh",
    expires_in: 3600,
    expires_at: 1786507200,
    token_type: "bearer",
    user: fakeUser,
  };

  await page.route("https://a11y-test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    if (url.includes("/auth/v1/user") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeUser),
      });
    }
    if (url.includes("/auth/v1/token") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeSession),
      });
    }
    if (url.includes("/auth/v1/logout") && method === "POST") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.includes("/rest/v1/user_data") && method === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "[]",
      });
    }
    if (url.includes("/rest/v1/") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: "{}",
    });
  });
}

test.describe("KAI-297 authenticated handoff", () => {
  test("signup entry, email login, route preservation and logout stay connected", async ({
    page,
  }) => {
    test.skip(
      !AUTH_FIXTURE_ENABLED,
      "E2E_AUTH_FIXTURE=1 or A11Y_E2E=1 required for the isolated fake auth project",
    );
    await installAuthFixture(page);
    await page.goto("/destinations/ueno-park");

    await page.getByTestId("navbar-signup-cta").click();
    const authDialog = page.getByRole("dialog");
    await expect(authDialog).toBeVisible();
    await expect(
      authDialog.getByRole("heading", { name: "Create your free account" }),
    ).toBeVisible();
    await authDialog
      .getByRole("button", { name: "Sign In", exact: true })
      .last()
      .click();
    await authDialog
      .getByPlaceholder("Email address")
      .fill("recruiter@example.invalid");
    await authDialog.getByPlaceholder("Password").fill("test-only-password");
    await authDialog
      .getByRole("button", { name: "Sign In", exact: true })
      .first()
      .click();

    await expect(page).toHaveURL(/\/destinations\/ueno-park$/);
    await expect(page.getByTestId("navbar-avatar-trigger")).toBeVisible();

    await page.getByTestId("navbar-avatar-trigger").click();
    await page.getByRole("menuitem", { name: "Sign Out", exact: true }).click();
    await expect(page.getByTestId("navbar-signup-cta")).toBeVisible();
    await expect(page.getByTestId("navbar-avatar-trigger")).toHaveCount(0);
    await expect(page).toHaveURL(/\/destinations\/ueno-park$/);
  });
});
