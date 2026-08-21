import { expect, test, type Page, type Route } from "@playwright/test";

async function holdHeavyHome(page: Page) {
  let release!: () => void;
  let requested = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const handler = async (route: Route) => {
    requested = true;
    await gate;
    await route.continue();
  };

  await page.route("**/*HomeHeavy*", handler);
  return {
    release,
    requested: () => requested,
  };
}

test.describe("KAI-144 parity-safe early Home surface", () => {
  test("does not lose an early Find Matches click", async ({ page }) => {
    const heavy = await holdHeavyHome(page);
    await page.goto("/");

    await expect(page.getByTestId("home-headline")).toBeVisible();
    await expect(page.locator("[data-home-origin-date-ready]")).toBeVisible();
    await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
    await expect.poll(heavy.requested, { timeout: 10_000 }).toBe(true);

    const findButton = page
      .locator("[data-home-planner-ready]")
      .getByRole("button", {
        name: /Find matches|View matches|Update matches/i,
      })
      .first();
    await findButton.scrollIntoViewIfNeeded();
    await findButton.click({ force: true });

    heavy.release();
    await expect(
      page.getByRole("heading", { name: "Top matches for you", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("does not lose an early Surprise Me click", async ({ page }) => {
    const heavy = await holdHeavyHome(page);
    await page.goto("/");

    await expect(page.getByTestId("home-headline")).toBeVisible();
    await expect.poll(heavy.requested, { timeout: 10_000 }).toBe(true);

    const surpriseButton = page
      .locator("[data-home-planner-ready]")
      .getByRole("button", { name: /Surprise me/i });
    await surpriseButton.scrollIntoViewIfNeeded();
    await surpriseButton.click({ force: true });

    heavy.release();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 30_000,
    });
  });
});
