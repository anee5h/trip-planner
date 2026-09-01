import { expect, test } from "./fixtures";

const VIEWPORTS = [
  [375, 812],
  [390, 844],
  [393, 852],
  [430, 932],
  [390, 700],
] as const;

for (const route of ["/", "/ja/"]) {
  test(`${route} keeps the compact planner and actions clear of mobile navigation`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.includes("mobile"),
      "KAI-138 covers the mobile Home surface",
    );

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        route === "/ja/" ? "ja" : "en",
      );
      await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
      await expect(
        page.locator('[data-testid="home-value-proposition"]'),
      ).toHaveText(
        route === "/ja/"
          ? "時間・予算・天気・興味にぴったりの旅先を見つけよう。"
          : "Find trips that fit your time, budget, weather, and interests.",
      );
      await expect(
        page.locator('[data-testid="home-brand-association"]'),
      ).toHaveCount(0);

      const layout = await page.evaluate(() => {
        const rect = (element: Element) => element.getBoundingClientRect();
        const rows = [
          ...document.querySelectorAll('[data-testid="home-planner-row"]'),
        ];
        const ctas = [
          ...document.querySelectorAll('[data-testid="home-planner-cta"]'),
        ];
        const nav = document.querySelector(
          'nav[aria-label="Mobile Navigation"]',
        );
        const headline = document.querySelector(
          '[data-testid="home-headline"]',
        );
        const valueProposition = document.querySelector(
          '[data-testid="home-value-proposition"]',
        );
        if (!nav) throw new Error("Mobile navigation was not rendered");

        return {
          rowHeights: rows.map((row) => rect(row).height),
          ctaHeights: ctas.map((cta) => rect(cta).height),
          ctaBottom: Math.max(...ctas.map((cta) => rect(cta).bottom)),
          navTop: rect(nav).top,
          valuePropositionAfterHeadline: Boolean(
            headline &&
            valueProposition &&
            headline.compareDocumentPosition(valueProposition) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
          horizontalOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - innerWidth,
        };
      });

      expect(layout.rowHeights).toHaveLength(5);
      expect(Math.min(...layout.rowHeights)).toBeGreaterThanOrEqual(44);
      expect(Math.min(...layout.ctaHeights)).toBeGreaterThanOrEqual(44);
      expect(layout.ctaBottom).toBeLessThanOrEqual(layout.navTop);
      expect(layout.valuePropositionAfterHeadline).toBe(true);
      expect(layout.horizontalOverflow).toBe(0);
    }
  });
}
