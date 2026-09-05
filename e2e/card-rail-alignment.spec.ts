import { expect, test } from "./fixtures";

/**
 * Equal-height rail contract (KAI-335 presentation follow-up):
 * sibling cards in the same horizontal rail must share the same outer
 * height and bottom edge, regardless of differing title/description/
 * metadata/action content. Home runs with real recommendation data;
 * destination rails hydrate from the static relationships catalogue.
 */
const BOTTOM_TOLERANCE_PX = 2;

async function railBottomDeltas(
  page: import("@playwright/test").Page,
  railCardsLocator: () => Promise<DOMRect[]>,
): Promise<{ delta: number; count: number }> {
  const rects = await page.evaluate(railCardsLocator);
  if (rects.length < 2) return { delta: 0, count: rects.length };
  const bottoms = rects.map((r) => r.bottom);
  return {
    delta: Math.max(...bottoms) - Math.min(...bottoms),
    count: rects.length,
  };
}

test.describe("card rail equal-height contract", () => {
  test("Home top matches: all sibling cards share one bottom edge", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#recommendations")).toBeVisible();
    await expect
      .poll(async () =>
        page.locator("#recommendations a[href^='/destinations/']").count(),
      )
      .toBeGreaterThanOrEqual(2);

    const { delta, count } = await railBottomDeltas(page, () => {
      const sec = document.querySelector("#recommendations");
      if (!sec) return [];
      return [...sec.querySelectorAll("a[href^='/destinations/']")].map((l) => {
        const r = l.getBoundingClientRect();
        return { bottom: r.bottom, height: r.height } as DOMRect;
      });
    });
    expect(count).toBeGreaterThanOrEqual(2);
    expect(delta).toBeLessThanOrEqual(BOTTOM_TOLERANCE_PX);
  });

  test("Nearby hubs rail: card containers share one bottom edge", async ({
    page,
  }) => {
    await page.goto("/destinations/kamakura-city");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const hs = [...document.querySelectorAll("h2, h3")];
          return hs.some((h) =>
            /Nearby hubs|近くの都市ハブ/.test(h.textContent || ""),
          );
        }),
      )
      .toBe(true);

    const { delta, count } = await railBottomDeltas(page, () => {
      const hs = [...document.querySelectorAll("h2, h3")];
      const h = hs.find((el) =>
        /Nearby hubs|近くの都市ハブ/.test(el.textContent || ""),
      );
      const section = h?.closest("section");
      if (!section) return [];
      return [...section.querySelectorAll("div.overflow-hidden.flex.flex-col")]
        .filter((el) => el.getBoundingClientRect().height > 150)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { bottom: r.bottom, height: r.height } as DOMRect;
        });
    });
    expect(count).toBeGreaterThanOrEqual(2);
    expect(delta).toBeLessThanOrEqual(BOTTOM_TOLERANCE_PX);
  });
});
