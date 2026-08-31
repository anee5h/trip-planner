import { expect, test, type Page } from "@playwright/test";

async function switchToJapanese(page: Page) {
  const desktopLanguage = page.getByTestId("navbar-desktop-language-toggle");
  if (await desktopLanguage.isVisible()) {
    await desktopLanguage.click();
    await page.getByRole("button", { name: "日本語", exact: true }).click();
  } else {
    const url = new URL(page.url());
    url.pathname = url.pathname === "/" ? "/ja/" : `/ja${url.pathname}`;
    await page.goto(url.toString());
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
}

test.describe("KAI-49 Japanese Explore localization", () => {
  test("localizes runtime chrome and hides the overall-score sort", async ({
    page,
  }) => {
    await page.goto("/destinations?sort=overall");
    await switchToJapanese(page);

    await expect(
      page.getByRole("heading", { name: "目的地", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("日本全国の旅先を探してみましょう。", { exact: false }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "グリッド表示に切り替え" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "マップ表示に切り替え" }),
    ).toBeVisible();
    await expect(page.locator("#results-grid")).toContainText(
      /該当する目的地：\d+件/,
    );

    const body = (await page.locator("body").innerText()) ?? "";
    expect(body).not.toMatch(
      /ui\.(?:destinations|destinationsDescription|grid|map)|Top Rated|Highest Rated|評価が高い順|Overall Score/i,
    );
    await expect(page).toHaveURL(/sort=recommended/);
  });

  test("localizes the Japanese empty state without leaking keys or English", async ({
    page,
  }) => {
    await page.goto("/destinations?q=kai49-no-result-sentinel");
    await switchToJapanese(page);

    await expect(
      page.getByRole("heading", {
        name: "条件に一致する目的地が見つかりませんでした。",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "検索条件を変更するか、フィルターを解除してお試しください。",
      ),
    ).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /ui\.noDestinationsFound|No destinations match|Try adjusting your search/i,
    );
  });
});
