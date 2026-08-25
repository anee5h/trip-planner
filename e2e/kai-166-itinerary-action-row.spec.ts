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
  await page
    .getByRole("button", { name: /Create (area|day) plan|プランを作成/ })
    .click();
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
  await page.getByRole("button", { name: "Close modal", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
