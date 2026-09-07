import { expect, test, type Page } from "./fixtures";

/**
 * KAI-279: budget is an explicit whole-trip party-total yen constraint that
 * survives Home -> Explore -> Detail unchanged, and party-size changes never
 * change the cap itself (the estimate may).
 *
 * Runs against the real Home planner: Desktop uses radix Selects; mobile uses
 * the option sheets. Custom total is entered through the inline yen editor.
 */
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

const isMobile = (page: Page) => page.viewportSize()!.width < 1024;

async function setParty(page: Page, size: number) {
  const partyValue = page.getByTestId("home-party-size");
  await expect(partyValue).toBeVisible();
  const current = Number(await partyValue.textContent());
  const step = current < size ? 1 : -1;
  const steps = Math.abs(current - size);
  for (let i = 0; i < steps; i += 1) {
    const btn = page.getByRole("button", {
      name:
        step > 0
          ? /Increase party|人数を増やす/
          : /Decrease party|人数を減らす/,
    });
    await btn.click();
  }
  await expect(page.getByTestId("home-party-size")).toHaveText(String(size));
}

async function setDurationFullDay(page: Page) {
  if (!isMobile(page)) {
    const durationCombobox = page
      .getByRole("combobox", { name: /Duration|滞在時間/i })
      .first();
    await durationCombobox.click();
    await page.waitForTimeout(600);
    await page
      .getByRole("option", { name: /Full day|1日/i })
      .first()
      .click();
  } else {
    const row = page
      .getByTestId("home-planner-row")
      .filter({ hasText: /Duration|滞在時間/ });
    await row.click();
    await page
      .getByRole("button", { name: /Full day|1日/ })
      .first()
      .click();
  }
}

async function chooseCustomBudget(page: Page): Promise<void> {
  if (!isMobile(page)) {
    const budgetCombobox = page
      .getByRole("combobox", { name: /Budget|予算/i })
      .first();
    await budgetCombobox.click();
    await page.waitForTimeout(600);
    await page
      .getByRole("option", { name: /Custom total|合計予算を指定/ })
      .first()
      .click();
  } else {
    const row = page
      .getByTestId("home-planner-row")
      .filter({ hasText: /Budget|予算/ });
    await row.click();
    await page
      .getByRole("button", { name: /Custom total|合計予算を指定/ })
      .first()
      .click();
  }
}

async function enterCustomAmount(page: Page, amount: string) {
  // The same editor renders in the desktop (hidden on small screens) and
  // mobile layout; target whichever instance is actually visible.
  const editor = page
    .getByTestId("custom-budget-editor")
    .filter({ visible: true })
    .first();
  await expect(editor).toBeVisible();
  const input = editor.getByRole("textbox").first();
  await input.fill(amount);
  await editor.getByTestId("custom-budget-apply").click();
  await expect(editor).toBeHidden();
}

async function applyPlanner(page: Page) {
  // Desktop CTA is a plain button (no testid); mobile CTA carries
  // home-planner-cta. Target the visible primary action by label.
  const cta = page
    .getByRole("button", {
      name: /Find matches|Update matches|View matches|旅先を探す|条件で更新|おすすめを見る/i,
    })
    .filter({ visible: true })
    .first();
  await cta.click();
  await expect(
    page
      .getByRole("heading", { name: /Top matches for you/i })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

async function openExploreFilters(page: Page) {
  const filtersBtn = page
    .getByRole("button", { name: /Filters|絞り込み/i })
    .filter({ visible: true })
    .first();
  await filtersBtn.click();
}

/** On mobile the Explore active-chip row is hidden; assert applied state via
 *  the filters modal (works on both viewports). */
async function assertAppliedCustomOnExplore(page: Page, amount: string) {
  await openExploreFilters(page);
  const editor = page.getByTestId("budget-custom-editor").filter({
    visible: true,
  });
  await expect(editor).toBeVisible();
  await expect(editor).toContainText(amount);
  await page.keyboard.press("Escape");
}

async function assertEconomyPresetOnExplore(page: Page) {
  await openExploreFilters(page);
  const tile = page.getByTestId("budget-tile-economy");
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(tile).toContainText("50,000");
  await expect(tile).toContainText(/total|まで/i);
  await page.keyboard.press("Escape");
}

async function topMatchesViewAllHref(page: Page): Promise<string | null> {
  const section = page
    .getByRole("heading", { name: /Top matches for you/i })
    .filter({ visible: true })
    .first()
    .locator("xpath=ancestor::section[1]");
  return section
    .getByRole("link", { name: /View all top matches|もっと見る/i })
    .filter({ visible: true })
    .first()
    .getAttribute("href");
}

test.beforeEach(async ({ page }) => setup(page));

test("warm-up: Home surface loads (planner + heavy rails)", async ({
  page,
}) => {
  // Serial file order means this first test warms the dev server's module
  // graph (HomeHeavy and friends) so the journey tests below do not race a
  // cold transform under CI/dev resource limits.
  await page.goto("/");
  await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Today/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Top matches for you/i }).first(),
  ).toBeVisible();
});

test("KAI-279: Custom ¥80,000 party-total survives Home->Explore->Detail; party 2->4 keeps the cap", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-home-planner-ready]")).toBeVisible();

  // Party 2 (default), full day, Custom total ¥80,000.
  await setDurationFullDay(page);
  await chooseCustomBudget(page);
  await enterCustomAmount(page, "80000");
  await applyPlanner(page);

  const href = await topMatchesViewAllHref(page);
  expect(href).not.toBeNull();
  // The exact custom cap and party/duration ride the URL into Explore.
  expect(href).toContain("budget=80000");
  expect(href).toContain("budgetTier=standard");
  expect(href).toContain("partySize=2");
  expect(href).toContain("duration=fullDay");

  // Explore shows the applied cap explicitly (filters modal) and the same party.
  await page.goto(href!);
  await assertAppliedCustomOnExplore(page, "80,000");

  // Open the first destination card -> Detail.
  const firstCard = page
    .locator("a[href^='/destinations/']")
    .filter({ has: page.locator("article, img").first() })
    .first();
  await expect(firstCard).toBeVisible();
  const detailUrl = await firstCard.getAttribute("href");
  await page.goto(detailUrl!);

  await expect(page.locator("h1").first()).toBeVisible();
  // Detail affordability note references the SAME ¥80,000 party-total cap.
  await expect(page.getByTestId("budget-fit-note")).toBeVisible();
  await expect(page.getByTestId("budget-fit-note")).toContainText("80,000");

  // Party 4 keeps the cap: back on Home, bump the party and re-check the
  // applied custom cap is STILL ¥80,000 (estimate may change).
  await page.goto("/");
  await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
  await setParty(page, 4);
  await applyPlanner(page);
  const href4 = await topMatchesViewAllHref(page);
  expect(href4).not.toBeNull();
  expect(href4).toContain("budget=80000");
  expect(href4).toContain("partySize=4");
  expect(href4).not.toContain("budget=160000");
});

test("KAI-279: Economy preset carries its visible ¥50,000 party-total into Explore", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-home-planner-ready]")).toBeVisible();

  if (!isMobile(page)) {
    const budgetCombobox = page
      .getByRole("combobox", { name: /Budget|予算/i })
      .first();
    await budgetCombobox.click();
    await page.waitForTimeout(600);
    await page
      .getByRole("option", { name: /Economy|エコノミー/ })
      .first()
      .click();
    await budgetCombobox.click();
    await page.waitForTimeout(600);
    await expect(
      page
        .getByRole("option", { name: /Up to ¥50,000 total|合計 ¥50,000 まで/ })
        .first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    const row = page
      .getByTestId("home-planner-row")
      .filter({ hasText: /Budget|予算/ });
    await row.click();
    await page
      .getByRole("button", { name: /Economy|エコノミー/ })
      .first()
      .click();
  }

  await applyPlanner(page);
  const href = await topMatchesViewAllHref(page);
  expect(href).not.toBeNull();
  expect(href).toContain("budget=50000");
  expect(href).toContain("budgetTier=economy");

  await page.goto(href!);
  // Applied Economy preset is visibly selected with its numeric party-total
  // semantics inside the budget modal (visible on both viewports).
  await assertEconomyPresetOnExplore(page);
});
