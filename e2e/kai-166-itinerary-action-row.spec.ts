import { expect, test } from "./fixtures";

const DESTINATION = "ueno-park";
const MOBILE_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];
const DESKTOP_VIEWPORTS = [
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
];
const LONG_STOP_NAMES = {
  en: "Sanjusangen-do Temple and National Treasure Hall, Kyoto National Museum District",
  ja: "京都・三十三間堂と国宝仏像をめぐる東山の歴史文化散策スポット",
} as const;

async function generatePlan(
  page: Parameters<typeof test>[0]["page"],
  locale: "en" | "ja",
) {
  const path =
    locale === "ja"
      ? `/ja/destinations/${DESTINATION}`
      : `/destinations/${DESTINATION}`;
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /Customize|カスタマイズ/ }).click();
  await page
    .getByRole("button", { name: /Generate Plan|プランを生成/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Save Plan to Itinerary|旅程に登録/ }),
  ).toBeVisible();
}

async function keepFooterAboveBottomNav(
  page: Parameters<typeof test>[0]["page"],
) {
  const save = page
    .getByRole("button", { name: /Save Plan to Itinerary|旅程に登録/ })
    .first();
  await save.scrollIntoViewIfNeeded();
  await save.evaluate((saveElement) => {
    const footer = saveElement.parentElement;
    const nav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    if (!footer || !nav) return;
    const overlap =
      footer.getBoundingClientRect().bottom -
      nav.getBoundingClientRect().top +
      8;
    if (overlap > 0) window.scrollBy(0, overlap);
  });
}

async function readActionGeometry(page: Parameters<typeof test>[0]["page"]) {
  const save = page
    .getByRole("button", { name: /Save Plan to Itinerary|旅程に登録/ })
    .first();
  return save.evaluate((saveElement) => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const footer = saveElement.parentElement;
    const card = saveElement.closest("[class*='overflow-hidden']");
    const nav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    const buttons = footer ? Array.from(footer.querySelectorAll("button")) : [];
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      footer: footer ? rect(footer) : null,
      footerFlexDirection: footer
        ? getComputedStyle(footer).flexDirection
        : null,
      card: card ? rect(card) : null,
      buttons: buttons.map((button) => ({
        text: button.innerText.trim(),
        disabled: button.disabled,
        rect: rect(button),
        contentFits: button.scrollWidth <= button.clientWidth + 1,
      })),
      save: rect(saveElement),
      bottomNav: nav ? rect(nav) : null,
    };
  });
}

async function signInAsFixture(page: import("@playwright/test").Page) {
  const fakeUser = {
    id: "00000000-0000-0000-0000-000000000166",
    aud: "authenticated",
    role: "authenticated",
    email: "kai-166-fixture@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {
      full_name: "KAI-166 Fixture",
      preferences: { preferences_set: true },
    },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const fakeSession = {
    access_token: "kai-166-fixture-access-token",
    refresh_token: "kai-166-fixture-refresh-token",
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
    if (url.includes("/rest/v1/")) {
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

async function createTripWithLongStop(
  page: Parameters<typeof test>[0]["page"],
  locale: "en" | "ja",
) {
  const copy =
    locale === "ja"
      ? {
          route: "/ja/my-trips",
          start: "最初の旅行を計画",
          save: "旅行を保存",
          edit: "旅程を編集",
          custom: "自由入力の場所",
          add: "立ち寄り先を追加",
        }
      : {
          route: "/my-trips",
          start: "Plan your first trip",
          save: "Save trip",
          edit: "Edit itinerary",
          custom: "Custom location",
          add: "Add stop",
        };

  await signInAsFixture(page);
  await page.goto(copy.route);
  await page.getByRole("button", { name: copy.start }).click();
  await page.getByRole("button", { name: copy.save }).click();
  await page.getByRole("button", { name: copy.edit }).click();
  await page.getByRole("button", { name: copy.custom }).click();
  await page
    .locator("[data-add-stop-form] [data-custom-stop-input]")
    .fill(LONG_STOP_NAMES[locale]);
  await page.getByRole("button", { name: copy.add, exact: true }).click();
  await expect(page.locator("[data-stop-id]")).toHaveCount(1);
}

async function assertLongStopLayout(
  page: Parameters<typeof test>[0]["page"],
  width: number,
  expectedTitle: string,
) {
  const row = page.locator("[data-stop-id]").first();
  const title = row.locator("[data-stop-title]");
  const actions = row.locator("[data-stop-action-cluster]");
  await expect(title).toBeVisible();
  await expect(title).toHaveText(expectedTitle);
  await expect(actions).toBeVisible();

  const titleBox = await title.boundingBox();
  const actionsBox = await actions.boundingBox();
  const rowBox = await row.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(rowBox).not.toBeNull();

  if (!titleBox || !actionsBox || !rowBox) return;

  if (width < 640) {
    expect(
      actionsBox.y,
      `mobile controls must trail the title at ${width}px`,
    ).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
  } else {
    expect(
      titleBox.x + titleBox.width,
      `desktop title must not enter controls at ${width}px`,
    ).toBeLessThanOrEqual(actionsBox.x);
  }

  expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(
    rowBox.x + rowBox.width + 0.5,
  );
  for (const selector of ["[data-drag-handle]", "[data-stop-actions]"]) {
    const controlBox = await row.locator(selector).boundingBox();
    expect(controlBox, `${selector} must render`).not.toBeNull();
    if (controlBox) {
      expect(controlBox.width).toBeGreaterThanOrEqual(44);
      expect(controlBox.height).toBeGreaterThanOrEqual(44);
    }
  }
}

for (const locale of ["en", "ja"] as const) {
  test(`KAI-166 ${locale} generated itinerary actions stay inside the planner`, async ({
    page,
  }) => {
    for (const viewport of MOBILE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await generatePlan(page, locale);
      await keepFooterAboveBottomNav(page);

      const geometry = await readActionGeometry(page);
      expect(geometry.footer).not.toBeNull();
      expect(geometry.card).not.toBeNull();
      expect(geometry.buttons).toHaveLength(3);
      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
        geometry.documentClientWidth,
      );

      for (const action of geometry.buttons) {
        expect(
          action.disabled,
          `${locale} ${viewport.width}px ${action.text}`,
        ).toBe(false);
        expect(
          action.rect.height,
          `${locale} ${viewport.width}px ${action.text}`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          action.contentFits,
          `${locale} ${viewport.width}px ${action.text}`,
        ).toBe(true);
        expect(action.rect.left).toBeGreaterThanOrEqual(
          (geometry.footer as { left: number }).left - 1,
        );
        expect(action.rect.right).toBeLessThanOrEqual(
          (geometry.footer as { right: number }).right + 1,
        );
        expect(action.rect.left).toBeGreaterThanOrEqual(
          (geometry.card as { left: number }).left - 1,
        );
        expect(action.rect.right).toBeLessThanOrEqual(
          (geometry.card as { right: number }).right + 1,
        );
      }

      expect(geometry.save.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(geometry.save.right).toBeLessThanOrEqual(
        (geometry.card as { right: number }).right + 1,
      );
      if (geometry.bottomNav && geometry.bottomNav.height > 0) {
        expect(geometry.footer!.bottom).toBeLessThanOrEqual(
          geometry.bottomNav.top + 1,
        );
      }
    }
  });
}

test("KAI-166 keeps the compact action row on tablet and desktop", async ({
  page,
}) => {
  for (const viewport of DESKTOP_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await generatePlan(page, "en");
    const geometry = await readActionGeometry(page);

    expect(geometry.footerFlexDirection).toBe("row");
    expect(geometry.footer!.height).toBeLessThanOrEqual(64);
    expect(geometry.save.width).toBeLessThan(geometry.footer!.width);
    expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
      geometry.documentClientWidth,
    );
    expect(geometry.bottomNav?.height ?? 0).toBe(0);
  }
});

test("KAI-166 preserves generated itinerary action behavior and keyboard access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await generatePlan(page, "en");

  const changePreferences = page.getByRole("button", {
    name: "Change preferences",
    exact: true,
  });
  await changePreferences.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Customize Plan Preferences")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create day plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Plan to Itinerary", exact: true }),
  ).toHaveCount(0);

  await generatePlan(page, "en");
  await page
    .getByRole("button", { name: "Save Plan to Itinerary", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const locale of ["en", "ja"] as const) {
  test(`KAI-166 ${locale} long custom stop title never collides with controls`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.includes("mobile"),
      "long-title mobile coverage runs in the mobile project",
    );

    await page.setViewportSize({ width: 360, height: 932 });
    await createTripWithLongStop(page, locale);
    for (const viewport of [
      { width: 360, height: 932 },
      { width: 375, height: 932 },
      { width: 390, height: 932 },
      { width: 393, height: 932 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await assertLongStopLayout(page, viewport.width, LONG_STOP_NAMES[locale]);
    }
  });
}

test("KAI-166 long custom stop title stays beside controls on desktop", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("desktop"),
    "desktop long-title coverage runs in the desktop project",
  );

  for (const locale of ["en", "ja"] as const) {
    await page.setViewportSize({ width: 640, height: 900 });
    await createTripWithLongStop(page, locale);
    for (const width of [640, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await assertLongStopLayout(page, width, LONG_STOP_NAMES[locale]);
    }
  }
});
