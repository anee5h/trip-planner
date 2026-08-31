import { expect, test } from "./fixtures";

/**
 * KAI-259 header/funnel coverage runs with the deterministic auth fixture.
 * A11Y_E2E=1 builds against the fake a11y Supabase project, so these tests
 * never create or mutate a production account.
 */
const RUN = process.env.A11Y_E2E === "1";

const isMobile = (projectName: string) => projectName === "chromium-mobile";

async function signInAsFixture(page: import("@playwright/test").Page) {
  const fakeUser = {
    id: "00000000-0000-0000-0000-000000000000",
    aud: "authenticated",
    role: "authenticated",
    email: "kai-259-fixture@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {
      full_name: "KAI-259 Fixture",
      preferences: { preferences_set: true },
    },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const fakeSession = {
    access_token: "kai-259-fixture-access-token",
    refresh_token: "kai-259-fixture-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: fakeUser,
  };

  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: "sb-a11y-test-auth-token", session: fakeSession },
  );
  await page.route("https://a11y-test.supabase.co/**", (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeUser),
      });
    }
    if (url.includes("/auth/v1/token")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeSession),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: "{}",
    });
  });
}

async function expectGuestHeader(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Meguruto home" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Sign Up|新規登録/ }),
  ).toBeVisible();
  await expect(page.getByTestId("navbar-avatar-trigger")).toHaveCount(0);
}

test.describe("KAI-259 guest header", () => {
  test("guest mobile header presents signup as the primary action", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "mobile project only");
    await expectGuestHeader(page);
    await expect(page.getByTestId("navbar-hamburger")).toHaveCount(0);
  });

  test("guest mobile header keeps language and theme beside signup", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "mobile project only");
    await expectGuestHeader(page);
    await expect(
      page.getByTestId("navbar-mobile-language-toggle"),
    ).toBeVisible();
    await expect(page.getByTestId("navbar-mobile-theme-toggle")).toBeVisible();

    const signupBox = await page.getByTestId("navbar-signup-cta").boundingBox();
    const languageBox = await page
      .getByTestId("navbar-mobile-language-toggle")
      .boundingBox();
    const themeBox = await page
      .getByTestId("navbar-mobile-theme-toggle")
      .boundingBox();
    expect(languageBox?.x).toBeLessThan(signupBox?.x ?? 0);
    expect(themeBox?.x).toBeLessThan(signupBox?.x ?? 0);
  });

  test("guest desktop header presents signup without a second login CTA", async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo.project.name), "desktop project only");
    await expectGuestHeader(page);
    await expect(
      page.locator("header").getByRole("button", { name: /Sign In/ }),
    ).toHaveCount(0);
  });

  test("header signup opens the existing signup flow", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "one deterministic flow test");
    await expectGuestHeader(page);
    await page.getByRole("button", { name: /Sign Up|新規登録/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
  });

  test("Japanese guest header uses the existing signup terminology", async ({
    page,
  }) => {
    await page.goto("/ja/");
    await expect(
      page.getByRole("link", { name: "Meguruto home" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "新規登録" })).toBeVisible();
  });
});

test.describe("KAI-259 authenticated header", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!RUN, "A11Y_E2E=1 required for authenticated fixture");
    await signInAsFixture(page);
    await page.goto("/");
    await expect(page.getByTestId("navbar-avatar-trigger")).toBeVisible();
  });

  test("authenticated mobile header uses avatar account navigation", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), "mobile project only");
    await expect(
      page.getByRole("button", { name: /Sign Up|新規登録/ }),
    ).toHaveCount(0);
    await page.getByTestId("navbar-avatar-trigger").click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toHaveClass(/right-0/);
    await expect(
      menu.getByRole("menuitem", { name: "Collections" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Bucket List" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Itineraries" }),
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Trips" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Passport" })).toHaveCount(
      0,
    );
    await expect(page.getByTestId("navbar-hamburger")).toHaveCount(0);
  });

  test("authenticated desktop header uses avatar account navigation", async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo.project.name), "desktop project only");
    await expect(page.getByRole("button", { name: "User menu" })).toBeVisible();
    await page.getByRole("button", { name: "User menu" }).click();
    const menu = page.locator('[role="menu"]');
    await expect(
      menu.getByRole("menuitem", { name: "Edit Profile" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Settings" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Send Feedback" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();
  });
});
