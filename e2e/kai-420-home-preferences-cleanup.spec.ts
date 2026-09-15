import { expect, test } from "./fixtures";

const LOCALES = [
  {
    path: "/",
    increaseParty: "Increase party size",
    primary: /Find matches|Update matches|View matches/,
    view: "View matches",
    removed: "Remember preferences",
  },
  {
    path: "/ja/",
    increaseParty: "人数を増やす",
    primary: /旅先を探す|条件で更新|おすすめを見る/,
    view: "おすすめを見る",
    removed: "設定を保存",
  },
] as const;

test.describe("KAI-420 homepage preference cleanup", () => {
  test("removes homepage save preferences and keeps guest apply ungated", async ({
    page,
  }, testInfo) => {
    const widths = testInfo.project.name.includes("desktop")
      ? [360, 390, 430, 1280]
      : [360, 390, 430];

    for (const locale of LOCALES) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(locale.path);
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        await page.reload();
        await expect(page.locator("[data-home-planner-ready]")).toBeVisible();

        const planner = page.getByTestId("home-planner");
        const removed = planner
          .locator("button:visible")
          .filter({ hasText: locale.removed });
        await expect(removed).toHaveCount(0);

        const increaseParty = planner.getByRole("button", {
          name: locale.increaseParty,
        });
        await expect(increaseParty).toBeEnabled();
        await increaseParty.click();
        const find = planner
          .getByRole("button", { name: locale.primary })
          .filter({ visible: true })
          .first();
        await find.click();
        await expect(page.locator("#recommendations")).toBeVisible();
        await expect(
          planner.locator("button:visible").filter({ hasText: locale.removed }),
        ).toHaveCount(0);
        await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);

        const view = planner
          .getByRole("button", { name: locale.view })
          .filter({ visible: true })
          .first();
        await expect(view).toBeVisible();
        await view.click();
        await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);
      }
    }
  });
});
