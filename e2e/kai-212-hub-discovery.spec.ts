import { expect, test } from "./fixtures";

const RICH_HUB = "kyoto-city";
const SPARSE_HUB = "koriyama-city";
const PARTIAL_HUB = "abashiri-city";

async function waitForHub(
  page: Parameters<typeof test>[0]["page"],
  id: string,
) {
  await page.goto(`/destinations/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function assertHierarchy(page: Parameters<typeof test>[0]["page"]) {
  await expect(
    page.getByRole("heading", {
      name: "Top sights in Kyoto City",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plan your visit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Before you go", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Go next", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("trip-cost-breakdown")).toHaveCount(1);
  await expect(
    page.locator("details").filter({ hasText: "More practical information" }),
  ).toHaveJSProperty("open", false);
  await expect(
    page.getByRole("heading", { name: "More things to do", exact: true }),
  ).toBeVisible();

  const sectionNames = await page
    .locator("[data-section]")
    .evaluateAll((sections) =>
      sections.map((section) => section.getAttribute("data-section")),
    );
  const indexOf = (name: string) => sectionNames.indexOf(name);
  expect(indexOf("overview")).toBeGreaterThanOrEqual(0);
  expect(indexOf("plan-your-visit")).toBeGreaterThan(indexOf("overview"));
  expect(indexOf("top-sights")).toBeGreaterThan(indexOf("plan-your-visit"));
  expect(indexOf("before-you-go")).toBeGreaterThan(indexOf("top-sights"));
  expect(indexOf("go-next")).toBeGreaterThan(indexOf("before-you-go"));

  await expect(
    page.getByText("Places to add to your plan", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Related places", { exact: true })).toHaveCount(
    0,
  );
}

async function assertTopRailResponsive(
  page: Parameters<typeof test>[0]["page"],
) {
  const topSection = page.locator('section[data-section="top-sights"]');
  const rail = topSection.locator("[data-rail]").first();
  await expect(rail).toBeVisible();
  await expect
    .poll(() =>
      rail.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
      })),
    )
    .toMatchObject({ overflowX: "auto" });

  const viewportWidth = page.viewportSize()?.width ?? 1024;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewportWidth);

  const railShell = rail.locator("xpath=..");
  const next = railShell.getByRole("button", { name: "Scroll right" });
  const previous = railShell.getByRole("button", { name: "Scroll left" });
  if (viewportWidth < 768) {
    await expect(next).toBeHidden();
    await expect(previous).toBeHidden();
    await rail.evaluate((element) => {
      element.scrollLeft = element.clientWidth;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  } else {
    await expect(next).toBeVisible();
    await expect(previous).toBeHidden();
    await next.click();
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(previous).toBeVisible();
  }
}

test.describe("KAI-206 detail-page information architecture", () => {
  test("prioritizes planning before Kyoto discovery and keeps the top rail usable", async ({
    page,
  }) => {
    await waitForHub(page, RICH_HUB);
    await assertHierarchy(page);
    await assertTopRailResponsive(page);
  });

  test("keeps sparse hubs complete without an empty discovery shell", async ({
    page,
  }) => {
    await waitForHub(page, SPARSE_HUB);
    await expect(
      page.getByRole("heading", { name: "Plan your visit", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Before you go", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('[data-cost-state="unavailable-compact"]'),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Estimated visit cost" }),
    ).toHaveCount(0);
    await expect(
      page.locator('section[data-section="top-sights"]'),
    ).toHaveCount(0);
    const goNext = page.locator('[data-section="go-next"]');
    if ((await goNext.count()) > 0) {
      await expect(
        goNext.getByRole("heading", { name: "Go next", exact: true }),
      ).toBeVisible();
      await expect(goNext.locator("[data-rail]").first()).toBeVisible();
    }
    await expect(
      page.locator("[data-section=plan-duration-links]"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 1024);
  });

  test("fails closed for hubs with zero valid sights without inventing discovery rails or substituting peer cities", async ({
    page,
  }) => {
    await waitForHub(page, PARTIAL_HUB);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Abashiri City",
    );
    await expect(
      page.locator('section[data-section="top-sights"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-section="explore-rails"]')).toHaveCount(0);
    await expect(page.getByTestId("destination-at-a-glance")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Plan your visit", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Before you go", exact: true }),
    ).toBeVisible();
    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toContain("Hakodate Night View");
    expect(pageText).not.toContain("Mount Hakodate");
  });

  test("keeps the new hub hierarchy free of English heading leakage in Japanese", async ({
    page,
  }) => {
    await page.goto(`/ja/destinations/${RICH_HUB}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "京都の見どころ",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "この街を計画", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "次に見る", exact: true }),
    ).toBeVisible();
    const body = await page.locator("body").innerText();
    for (const leakedHeading of [
      "Top sights and explore",
      "Plan your visit",
      "Before you go",
      "Go next",
      "Top Sights in Kyoto City",
    ]) {
      expect(body).not.toContain(leakedHeading);
    }
  });
});
