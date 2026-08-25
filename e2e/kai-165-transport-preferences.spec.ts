import { expect, test, type Page } from "@playwright/test";

const COPY = {
  en: {
    language: "English",
    public: "Public transit",
    rental: "Rental car",
    personal: "Personal car",
    field: "Getting around",
    close: "Close",
    find: "Find matches",
  },
  ja: {
    language: "日本語",
    public: "公共交通",
    rental: "レンタカー",
    personal: "マイカー",
    field: "移動手段",
    close: "閉じる",
    find: "旅先を探す",
  },
} as const;

async function switchLocale(page: Page, target: "en" | "ja") {
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    const languageButton = page.getByRole("button", {
      name: /^(?:言語|Language)/,
    });
    const current = await languageButton.innerText();
    const wantsJapanese = target === "ja";
    if (current.includes(wantsJapanese ? "English" : "日本語")) {
      await languageButton.click();
    }
    await page.keyboard.press("Escape");
    return;
  }

  const languageButton = page.getByRole("button", { name: "Select language" });
  await languageButton.click();
  await page
    .getByRole("button", { name: COPY[target].language, exact: true })
    .click();
}

async function openTransport(page: Page, copy: (typeof COPY)["en"]) {
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    await page
      .locator("button:visible")
      .filter({ hasText: copy.field })
      .first()
      .click();
  } else {
    await page.getByTestId("transport-trigger").click();
  }
}

for (const locale of ["en", "ja"] as const) {
  test(`KAI-165 transport capabilities stay multi-select in ${locale}`, async ({
    page,
  }) => {
    const copy = COPY[locale];
    await page.goto("/");
    await expect(page.locator("[data-home-planner-ready]")).toBeVisible();
    await switchLocale(page, locale);
    await expect(page.locator("body")).toContainText(copy.public);

    await openTransport(page, copy);
    const publicOption = page.getByTestId("transport-option-public");
    const rentalOption = page.getByTestId("transport-option-rental");
    const personalOption = page.getByTestId("transport-option-my_car");

    await expect(publicOption).toHaveAttribute("aria-pressed", "true");
    await expect(rentalOption).toHaveAttribute("aria-pressed", "false");
    await expect(personalOption).toHaveAttribute("aria-pressed", "false");

    // Main KAI-165 case: selecting Rental does not clear Public.
    await rentalOption.click();
    await expect(publicOption).toHaveAttribute("aria-pressed", "true");
    await expect(rentalOption).toHaveAttribute("aria-pressed", "true");
    await expect(personalOption).toHaveAttribute("aria-pressed", "false");

    // Native buttons preserve keyboard activation and independent deselection.
    await publicOption.focus();
    await page.keyboard.press("Space");
    await expect(publicOption).toHaveAttribute("aria-pressed", "false");
    await expect(rentalOption).toHaveAttribute("aria-pressed", "true");
    await publicOption.focus();
    await page.keyboard.press("Enter");
    await expect(publicOption).toHaveAttribute("aria-pressed", "true");

    // My Car and Rental Car remain one carMode choice, while Public remains on.
    await personalOption.click();
    await expect(personalOption).toHaveAttribute("aria-pressed", "true");
    await expect(rentalOption).toHaveAttribute("aria-pressed", "false");
    await expect(publicOption).toHaveAttribute("aria-pressed", "true");
    await rentalOption.click();
    await expect(rentalOption).toHaveAttribute("aria-pressed", "true");
    await expect(personalOption).toHaveAttribute("aria-pressed", "false");

    // Apply the planner state, then close/reopen the transport control.
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      await page.getByRole("button", { name: copy.close, exact: true }).click();
    } else {
      await page.getByTestId("transport-trigger").click();
    }
    await page.getByRole("button", { name: copy.find, exact: true }).click();
    await openTransport(page, copy);
    await expect(publicOption).toHaveAttribute("aria-pressed", "true");
    await expect(rentalOption).toHaveAttribute("aria-pressed", "true");
  });
}
