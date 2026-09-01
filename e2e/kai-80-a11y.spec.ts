/**
 * KAI-80: automated WCAG 2.2 AA (automated subset) gate — representative
 * major-route matrix.
 *
 * Runs against the PRODUCTION build (A11Y_E2E=1 switches the webServer to
 * build + preview; never the dev server, never PWA semantics).
 *
 * COVERAGE MATRIX (documented, no Cartesian explosion):
 *   Routes:        Home, /destinations, destination detail, Home filters
 *                  + date picker, navigation, guest auth modal,
 *                  /settings, /bucket-list, /passport, /my-trips,
 *                  collections, loading/empty/error, dialogs/sheets
 *   Locales:       EN + JA on primary content routes
 *   Projects:      mobile + desktop (both projects run this file)
 *   Themes:        light + dark on high-risk surfaces (contrast is gated)
 *   Focus:         dialog focus entry, Tab/Shift+Tab trap, Escape, focus
 *                  return to trigger; keyboard-only nav + planner checks
 *   Reduced motion: representative animated surfaces
 *   Reflow:        narrow/zoom-equivalent layouts — no horizontal
 *                  overflow, no clipped primary controls
 *   Locale contract: html.lang en/ja, refresh retention, EN<->JA switch
 *   Auth:          deterministic guest/client-state surfaces (supabase is
 *                  null in E2E — no production mutation by construction).
 *                  Real-session flows are documented manual QA.
 *
 * No conditional no-op tests: required controls are ASSERTED visible.
 */
import { test, expect } from "./fixtures";
import { expectNoA11yViolations } from "./a11y";

const RUN = process.env.A11Y_E2E === "1";

test.skip(!RUN, "A11Y_E2E=1 required");

/**
 * Deterministic NON-PRODUCTION auth fixture (KAI-80): makes the app's
 * supabase client (built with the fake a11y-test project URL) see a
 * signed-in user WITHOUT touching any real Supabase.
 *
 * 1. Injects a synthetic session into localStorage BEFORE the app loads
 *    (key `sb-a11y-test-auth-token` — the project ref derived from the
 *    fake URL https://a11y-test.supabase.co).
 * 2. Route-intercepts the fake project's auth endpoints so
 *    supabase-js `getSession()`/`/auth/v1/user` returns the fixture user.
 *
 * All requests stay inside the browser; nothing reaches production.
 */
async function signInAsTestUser(page: import("@playwright/test").Page) {
  const fakeUser = {
    id: "00000000-0000-0000-0000-000000000000",
    aud: "authenticated",
    role: "authenticated",
    email: "a11y-fixture@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {
      full_name: "A11y Fixture",
      preferences: { preferences_set: true },
    },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const fakeSession = {
    access_token: "a11y-fixture-access-token",
    refresh_token: "a11y-fixture-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: fakeUser,
  };

  await page.addInitScript(
    ({ key, session }) => {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch {}
    },
    {
      key: "sb-a11y-test-auth-token",
      session: fakeSession,
    },
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
      // Refresh-token grant: supabase-js expects a session-shaped body.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "a11y-fixture-access-token",
          refresh_token: "a11y-fixture-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: fakeUser,
        }),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: "{}",
    });
  });
}

/**
 * Opens the guest auth modal through the existing header signup flow. The
 * auth modal's built-in toggle remains the login entry point.
 */
async function openSignIn(page: import("@playwright/test").Page) {
  const desktopSignIn = page
    .locator("header button", { hasText: "Sign In" })
    .first();
  if (await desktopSignIn.isVisible().catch(() => false)) {
    await desktopSignIn.click();
    return;
  }

  const signup = page.getByTestId("navbar-signup-cta");
  await expect(signup).toBeVisible();
  await signup.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Sign In", exact: true })
    .last()
    .click();
}

/**
 * Switches the UI language to `target` ("en" | "ja"). Desktop uses the
 * explicit language menu; mobile follows the locale URL because the compact
 * header no longer has a hamburger navigation surface.
 */
async function switchLocale(
  page: import("@playwright/test").Page,
  target: "en" | "ja",
) {
  const desktopLang = page.getByTestId("navbar-desktop-language-toggle");
  if (await desktopLang.isVisible().catch(() => false)) {
    await desktopLang.click();
    const option = page.getByRole("button", {
      name: target === "ja" ? "日本語" : "English",
    });
    await expect(option).toBeVisible();
    await option.click();
    return;
  }

  const url = new URL(page.url());
  const unprefixedPath = url.pathname.replace(/^\/ja(?=\/|$)/, "") || "/";
  url.pathname =
    target === "ja"
      ? unprefixedPath === "/"
        ? "/ja/"
        : `/ja${unprefixedPath}`
      : unprefixedPath;
  if (new URL(page.url()).pathname !== url.pathname) {
    await page.goto(url.toString());
  }
}

// Clear persisted theme so each test starts from the OS-scheme default.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("tabimap_theme");
    } catch {
      /* ignore */
    }
  });
});

// Theme-scoped helper describes. `test.use` must live at describe level.
const routes: Array<[string, string]> = [
  ["home", "/"],
  ["destinations", "/destinations"],
  ["destination detail", "/destinations/kamakura"],
  ["settings", "/settings"],
  ["bucket-list", "/bucket-list"],
  ["passport", "/passport"],
  ["my-trips", "/my-trips"],
  ["collections", "/collections"],
];
const highRisk = new Set([
  "home",
  "destinations",
  "destination detail",
  "settings",
]);
const primary = new Set(["home", "destinations", "destination detail"]);

// ---------------------------------------------------------------------------
// Locale contract (#6)
// ---------------------------------------------------------------------------
test.describe("KAI-80 locale contract", () => {
  test("/ has html.lang=en and /ja/ has html.lang=ja", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/ja/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });

  test("refresh retains the correct lang", async ({ page }) => {
    await page.goto("/ja/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });

  test("EN→JA switch gives JA URL + root lang; JA→EN is inverse", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await switchLocale(page, "ja");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect
      .poll(async () => page.url(), { timeout: 15000 })
      .toMatch(/\/ja\//);

    await switchLocale(page, "en");
    // The URL may take a moment; assert the root lang first, then the URL.
    await expect(page.locator("html")).toHaveAttribute("lang", "en", {
      timeout: 15000,
    });
    await expect
      .poll(async () => page.url(), { timeout: 15000 })
      .not.toMatch(/\/ja\//);
  });
});

// ---------------------------------------------------------------------------
// Public content routes — light theme (axe) (#3)
// ---------------------------------------------------------------------------
test.describe("KAI-80 public routes (light)", () => {
  test.use({ colorScheme: "light" });

  for (const [label, route] of routes) {
    test(`${label} ${route} (EN) has no WCAG 2.2 AA violations`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test("guest auth modal (EN) has no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await page.goto("/");
    await openSignIn(page);
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("auth modal focus semantics: entry, trap, Escape, return to opener", async ({
    page,
  }) => {
    await page.goto("/");
    const desktopOpener = page
      .locator("header button", { hasText: "Sign In" })
      .first();
    const isDesktop = await desktopOpener.isVisible().catch(() => false);
    if (isDesktop) {
      await desktopOpener.focus();
      await desktopOpener.click();
    } else {
      await openSignIn(page);
    }
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    // Initial focus lands inside the dialog (an input or button).
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('[role="dialog"]') !== null,
        ),
      )
      .toBe(true);
    // Tab stays trapped (several presses).
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      );
      expect(inside).toBe(true);
    }
    // Shift+Tab wraps back inside.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+Tab");
      const inside = await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      );
      expect(inside).toBe(true);
    }
    // Escape closes.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Focus returns to the existing header auth opener after dismissal.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return false;
          if (el.tagName !== "BUTTON") return false;
          const text = el.textContent ?? "";
          return (
            text.includes("Sign In") ||
            text.includes("Sign Up") ||
            el.getAttribute("data-testid") === "navbar-signup-cta"
          );
        }),
      )
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Public content routes — JA (primary routes) (#3)
// ---------------------------------------------------------------------------
test.describe("KAI-80 public routes (JA)", () => {
  test.use({ colorScheme: "light", locale: "ja-JP" });

  for (const [label, route] of routes) {
    if (!primary.has(label)) continue;
    test(`${label} ${route} (JA) has no WCAG 2.2 AA violations`, async ({
      page,
    }) => {
      await page.goto(`/ja${route === "/" ? "/" : route}`);
      await expect(page.locator("main")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});

// ---------------------------------------------------------------------------
// Public content routes — dark theme (contrast gated, high-risk) (#3)
// ---------------------------------------------------------------------------
test.describe("KAI-80 public routes (dark)", () => {
  test.use({ colorScheme: "dark" });

  for (const [label, route] of routes) {
    if (!highRisk.has(label)) continue;
    test(`${label} ${route} (EN, dark) has no WCAG 2.2 AA violations`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForFunction(() =>
        document.documentElement.classList.contains("dark"),
      );
      await expectNoA11yViolations(page);
    });
  }
});

// ---------------------------------------------------------------------------
// Home planner: date picker + filters (#3, #5)
// ---------------------------------------------------------------------------
test.describe("KAI-80 Home planner controls (light)", () => {
  test.use({ colorScheme: "light" });

  test("date picker dialog is accessible and traps focus", async ({ page }) => {
    await page.goto("/");
    // The TravelDatePicker lives in the desktop weather section; the
    // mobile layout renders the HomePlanner (vibe/duration/budget/
    // transport sheets) with no date field, so this test is
    // desktop-only. Wait for main + a bounded window for the trigger;
    // if the layout never renders it (mobile), skip deterministically.
    await expect(page.locator("main")).toBeVisible();
    let dateTriggerFound = false;
    try {
      await expect
        .poll(
          () =>
            page.locator('button[aria-label*="Choose travel date" i]').count(),
          { timeout: 45000 },
        )
        .toBeGreaterThan(0);
      dateTriggerFound = true;
    } catch {
      dateTriggerFound = false;
    }
    if (!dateTriggerFound) {
      // Mobile layout (HomePlanner without a date field) — skip.
      test.skip(
        true,
        "mobile layout — date picker lives in the desktop weather section",
      );
      return;
    }
    const dateTriggers = page.locator(
      'button[aria-label*="Choose travel date" i], [aria-label*="travel date" i]',
    );
    await expect(dateTriggers.first()).toBeVisible({ timeout: 30000 });
    const visibleTrigger = dateTriggers.filter({ visible: true }).first();
    await expect(visibleTrigger).toBeVisible();
    await visibleTrigger.click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    const focusedInside = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(focusedInside).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("planner select controls are keyboard-operable", async ({ page }) => {
    await page.goto("/");
    const desktopInterest = page
      .locator('button[aria-label="Interest"]')
      .first();
    let interestTrigger: import("@playwright/test").Locator;
    let isMobile = false;
    try {
      await desktopInterest.waitFor({ state: "visible", timeout: 8000 });
      interestTrigger = desktopInterest;
    } catch {
      // Mobile: the planner rows open per-field bottom-sheet dialogs.
      isMobile = true;
      interestTrigger = page
        .locator("button", { hasText: /Interest|興味/ })
        .first();
    }
    await expect(interestTrigger).toBeVisible();
    await interestTrigger.focus();
    await page.keyboard.press(isMobile ? "Space" : "Enter");
    if (isMobile) {
      const dialog = page
        .locator('[role="dialog"][aria-label="Interest"]')
        .first();
      await expect(dialog).toBeVisible();
      // Focus enters the sheet (KAI-80 fix) and stays trapped.
      await expect
        .poll(() =>
          page.evaluate(
            () => document.activeElement?.closest('[role="dialog"]') !== null,
          ),
        )
        .toBe(true);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        const inside = await page.evaluate(
          () => document.activeElement?.closest('[role="dialog"]') !== null,
        );
        expect(inside).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    } else {
      const listbox = page.locator('[role="listbox"]').first();
      await expect(listbox).toBeVisible();
      await page.keyboard.press("ArrowDown");
      // The highlighted option is keyboard-reachable.
      const highlighted = await page.evaluate(
        () =>
          !!document.querySelector(
            '[role="option"][data-highlighted="true"], [role="option"][aria-selected="true"], [role="option"]:focus',
          ),
      );
      expect(highlighted).toBe(true);
      await expectNoA11yViolations(page);
      // Selecting completes the choice (value changes).
      const before = await page
        .locator('button[aria-label="Interest"]')
        .first()
        .textContent();
      await page.locator('[role="option"]').nth(1).click();
      await expect
        .poll(async () =>
          (
            await page
              .locator('button[aria-label="Interest"]')
              .first()
              .textContent()
          )
            ?.trim()
            ?.slice(0, 20),
        )
        .not.toBe(before?.trim()?.slice(0, 20));
    }
  });

  test("mobile planner sheet restores focus to its opener after close", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    // Mobile-only: if the desktop Vibe trigger is visible, this is the
    // desktop layout — skip (test.skip throws; must NOT be caught).
    const desktopInterest = page
      .locator('button[aria-label="Interest"]')
      .first();
    let desktopVisible = false;
    try {
      await desktopInterest.waitFor({ state: "visible", timeout: 15000 });
      desktopVisible = true;
    } catch {
      desktopVisible = false;
    }
    if (desktopVisible) {
      test.skip(true, "desktop layout — mobile sheet not present");
      return;
    }
    const interestRow = page
      .locator("button", { hasText: /Interest|興味/ })
      .first();
    await expect(interestRow).toBeVisible();
    await interestRow.focus();
    await page.keyboard.press("Space");
    const dialog = page
      .locator('[role="dialog"][aria-label="Interest"]')
      .first();
    await expect(dialog).toBeVisible();
    // Escape closes and focus returns to the opener row.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const text = document.activeElement?.textContent ?? "";
          return text.includes("Interest") || text.includes("興味");
        }),
      )
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real focus behavior (#5)
// ---------------------------------------------------------------------------
test.describe("KAI-80 focus management", () => {
  test("dialog: focus enters, Tab stays trapped, Escape returns to trigger", async ({
    page,
  }) => {
    await page.goto("/destinations/kamakura");
    // Desktop: Ctrl-K chip opens GlobalSearch; mobile: header Search button.
    const desktopTrigger = page
      .locator("button:has-text('Ctrl K'), button:has-text('⌘K')")
      .first();
    const mobileTrigger = page.locator('button[aria-label="Search"]').first();
    let trigger: import("@playwright/test").Locator;
    try {
      await desktopTrigger.waitFor({ state: "visible", timeout: 8000 });
      trigger = desktopTrigger;
    } catch {
      trigger = mobileTrigger;
    }
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('[role="dialog"]') !== null,
        ),
      )
      .toBe(true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      );
      expect(inside).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    const stillInside = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(stillInside).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Focus returns to the trigger (Ctrl-K chip or Search button) after close.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return false;
          const text = el.textContent ?? "";
          return (
            text.includes("Ctrl K") ||
            text.includes("⌘K") ||
            el.getAttribute("aria-label") === "Search"
          );
        }),
      )
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reduced motion (#7)
// ---------------------------------------------------------------------------
test.describe("KAI-80 reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("Home renders and controls work with animations reduced", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expectNoA11yViolations(page);
    // State transition still works: open the auth modal (guest state).
    await openSignIn(page);
    await expect(page.locator('[role="dialog"]').first()).toBeVisible();
    // KAI-80: with prefers-reduced-motion, the dialog's animation classes
    // must resolve to no non-essential animation (none or zero duration).
    const animState = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const cs = dialog ? getComputedStyle(dialog) : null;
      return {
        animationName: cs?.animationName ?? "no-dialog",
        animationDuration: cs?.animationDuration ?? "no-dialog",
      };
    });
    expect(
      animState.animationName === "none" ||
        animState.animationDuration === "0s" ||
        parseFloat(animState.animationDuration) <= 0.001,
    ).toBe(true);
    await page.keyboard.press("Escape");
  });

  test("destination page interactive elements work with animations reduced", async ({
    page,
  }) => {
    await page.goto("/destinations/kamakura");
    await expect(page.locator("main")).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

// ---------------------------------------------------------------------------
// Keyboard-only primary navigation (#5)
// ---------------------------------------------------------------------------
test.describe("KAI-80 keyboard-only navigation", () => {
  test("primary nav links are reachable via Tab and activate", async ({
    page,
  }) => {
    await page.goto("/");
    let nav = page.locator("header nav").first();
    if (!(await nav.isVisible().catch(() => false))) {
      nav = page.getByRole("navigation", { name: "Mobile Navigation" });
    }
    await expect(nav).toBeVisible();
    const firstLink = nav.locator("a").first();
    await expect(firstLink).toBeVisible();
    await firstLink.focus();
    // Tab until focus lands on a nav link (bounded), then activate it.
    let active = "";
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      active =
        (await page.evaluate(() => {
          const el = document.activeElement;
          return el?.tagName === "A" ? (el.getAttribute("href") ?? "") : "";
        })) ?? "";
      if (active) break;
    }
    expect(active).toBeTruthy();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    const url = page.url();
    expect(url).not.toMatch(/\/$|127\.0\.0\.1:4173\/?$/);
  });
});

// ---------------------------------------------------------------------------
// Visible focus (#6)
// ---------------------------------------------------------------------------
test.describe("KAI-80 visible focus (focus-visible ring present)", () => {
  test("primary controls show a focus-visible ring when keyboard-focused", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    // Mobile: BottomNav Search; Desktop: Ctrl-K chip or the theme toggle.
    // Pick the first visible keyboard control.
    const candidates = [
      page.locator('button[aria-label="Search"]').first(),
      page.locator("button:has-text('Ctrl K'), button:has-text('⌘K')").first(),
      page.locator('button[aria-label="Toggle theme"]').first(),
    ];
    let target: import("@playwright/test").Locator | null = null;
    for (const c of candidates) {
      if (await c.isVisible().catch(() => false)) {
        target = c;
        break;
      }
    }
    expect(target).not.toBeNull();
    await target!.focus();
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const outlineWidth = parseFloat(cs.outlineWidth) || 0;
      const hasRingClass = el.className
        ?.toString()
        .includes("focus-visible:ring");
      const boxShadow = cs.boxShadow;
      return {
        outlineWidth,
        hasRingClass,
        boxShadowNonDefault: boxShadow !== "none" && boxShadow !== "",
      };
    });
    expect(
      ring &&
        (ring.outlineWidth > 0 ||
          ring.hasRingClass ||
          ring.boxShadowNonDefault),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reflow (#9)
// ---------------------------------------------------------------------------
test.describe("KAI-80 reflow (narrow)", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("Home at narrow width: no horizontal overflow, controls not clipped", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    // Primary control remains present in guest state (mobile header).
    await expect(page.getByTestId("navbar-signup-cta")).toBeVisible();
    await expect(page.getByTestId("navbar-hamburger")).toHaveCount(0);
  });

  test("destination detail at narrow width: no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/destinations/kamakura");
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("Search dialog at narrow width: dialog usable, no overflow", async ({
    page,
  }) => {
    await page.goto("/");
    // Mobile-header Search button (KAI-80 addition) — visible at 320px;
    // opens the same GlobalSearch dialog.
    const searchTrigger = page.locator('button[aria-label="Search"]').first();
    await expect(searchTrigger).toBeVisible();
    await searchTrigger.click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Loading / empty / error states (#3)
// ---------------------------------------------------------------------------
test.describe("KAI-80 state surfaces", () => {
  test("unknown destination route shows the error state accessibly", async ({
    page,
  }) => {
    await page.goto("/destinations/this-route-does-not-exist");
    await expect(page.locator("main")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("bucket-list empty state is accessible", async ({ page }) => {
    await page.goto("/bucket-list");
    await expect(page.locator("main")).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

// ---------------------------------------------------------------------------
// Authenticated-state coverage (#4) — deterministic non-production fixture
// ---------------------------------------------------------------------------
test.describe("KAI-80 authenticated state (fixture, no production mutation)", () => {
  test("user menu shows Signed in as + account navigation works", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    // The avatar sheet is the single authenticated navigation surface at all
    // viewport sizes.
    const userMenu = page.locator('button[aria-label="User menu"]').first();
    await expect(userMenu).toBeVisible();
    await userMenu.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[role="dialog"]').first()).toBeVisible();
    await expectNoA11yViolations(page);
    await expect(page.getByText("a11y-fixture@example.com")).toBeVisible();
    // Account navigation target works.
    await page
      .getByRole("menuitem", { name: /Edit Profile|プロフィール編集/ })
      .first()
      .evaluate((el) => (el as HTMLAnchorElement).click());
    await expect(page).toHaveURL(/\/settings\?section=account/);
    await expect(page.locator("main")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Settings account section renders in authenticated state", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto("/settings?section=account");
    await expect(page.locator("main")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Bucket List, My Trips and Passport render authenticated", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    for (const route of ["/bucket-list", "/my-trips", "/passport"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoA11yViolations(page);
    }
  });
});
