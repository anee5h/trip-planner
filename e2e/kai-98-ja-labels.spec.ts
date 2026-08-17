import { expect, test } from "@playwright/test";

/**
 * KAI-98: shared taxonomy labels must reach a rendered Japanese destination
 * surface, not only the dictionary and catalogue validator.
 */
test("Japanese destination labels render Castle and Park", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes("mobile"),
    "mobile detail layout hides the taxonomy badge row",
  );
  await page.goto("/ja/destinations/kanazawa-castle-ishikawa");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");

  await expect(page.getByText("城", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("公園", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Castle", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Park", { exact: true })).toHaveCount(0);
});
