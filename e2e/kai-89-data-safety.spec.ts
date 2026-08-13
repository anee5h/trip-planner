import { expect, test, type Page } from "@playwright/test";

const BAD_VISIBLE_COPY = [
  /\bNaN\b/i,
  /\bInfinity\b/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\[object Object\]/i,
  /A top recommended attraction in/i,
  /Municipal hub created in/i,
  /city expansion record/i,
  /Municipal hub record reviewed/i,
  /Source-backed/i,
  /v1\.9\.2/i,
];

const DESTINATION_MATRIX = [
  "meiji-jingu", // shrine
  "tokyo-national-museum", // museum
  "shinjuku-gyo-en", // park with partial budget data
  "osaka-city", // city hub
  "fujikawaguchiko-town", // town hub
  "kouri-island-okinawa", // island
  "himeji-castle", // UNESCO item
  "yakushima-town", // remote island hub
  "ashikaga-flower-park-tochigi", // seasonal access
] as const;

async function assertVisibleDataIsSafe(page: Page) {
  const text = await page.locator("body").innerText();
  for (const pattern of BAD_VISIBLE_COPY) {
    expect(text, `visible text matched ${pattern}`).not.toMatch(pattern);
  }
  expect(text).not.toMatch(/¥\s*NaN|NaN\s*[–〜-]\s*NaN/i);
}

test.describe("KAI-89 rendered data safety", () => {
  test("Explore cards have no malformed data or leaked internal copy", async ({
    page,
  }) => {
    await page.goto("/destinations");
    await expect(page.locator("main")).toBeVisible();
    await assertVisibleDataIsSafe(page);
    await expect(
      page.locator('a[href^="/destinations/"]').first(),
    ).toBeVisible();
  });

  for (const id of [
    "meiji-jingu",
    "tokyo-national-museum",
    "osaka-city",
    "ishigaki-city",
    "nara-park-todaiji",
  ]) {
    test(`detail page ${id} renders safe fallback text`, async ({ page }) => {
      await page.goto(`/destinations/${id}`);
      await expect(page.locator("main")).toBeVisible();
      await assertVisibleDataIsSafe(page);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }

  test("direct detail navigation survives reload and back navigation", async ({
    page,
  }) => {
    await page.goto("/destinations");
    const firstCard = page.locator('a[href^="/destinations/"]').first();
    const href = await firstCard.getAttribute("href");
    expect(href).toMatch(/^\/destinations\//);
    await firstCard.click();
    await expect(page).toHaveURL(/\/destinations\/[^/]+/);
    await assertVisibleDataIsSafe(page);
    await page.reload();
    await assertVisibleDataIsSafe(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/destinations(?:\?|$)/);
    await assertVisibleDataIsSafe(page);
  });

  test("representative destination types render safe cards", async ({
    page,
  }) => {
    await page.goto("/destinations");
    const cards = page.locator('a[href^="/destinations/"]');
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      const text = await card.innerText();
      for (const pattern of BAD_VISIBLE_COPY) {
        expect(text, `card text matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("original Nara temple cards never render a NaN price range", async ({
    page,
  }) => {
    for (const [id, query] of [
      ["yakushi-ji-temple", "Yakushi-ji"],
      ["toshodai-ji-temple", "Toshodai-ji"],
    ] as const) {
      await page.goto(`/destinations?q=${encodeURIComponent(query)}`);
      const card = page.locator(`a[href^="/destinations/${id}"]`).first();
      await expect(card).toBeVisible();
      expect(await card.innerText()).not.toMatch(/¥\s*NaN|NaN\s*[–〜-]\s*NaN/i);
      await assertVisibleDataIsSafe(page);
    }
  });

  for (const id of DESTINATION_MATRIX) {
    test(`type matrix detail ${id} has finite score and safe fallbacks`, async ({
      page,
    }) => {
      await page.goto(`/destinations/${id}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("h1").first()).toBeVisible();
      await assertVisibleDataIsSafe(page);
      await expect(
        page.locator('[data-testid="destination-detail-score"]'),
      ).toHaveText(/^(?:\d+(?:\.\d+)?|N\/A)$/);
    });
  }

  test("paid, free, unknown, partial, and transport price states stay distinct", async ({
    page,
  }) => {
    const states = [
      ["tokyo-national-museum", /Estimated visit cost|概算滞在費用/],
      ["hiroshima-national-peace-memorial-hall", /Free Admission|入場無料/],
      ["cupnoodles-museum-osaka-ikeda", /Cost unavailable|料金不明/],
      ["shinjuku-gyo-en", /Cost unavailable|料金不明/],
      ["kouri-island-okinawa", /Estimated visit cost|概算滞在費用/],
    ] as const;
    for (const [id, expected] of states) {
      await page.goto(`/destinations/${id}`);
      if (id === "hiroshima-national-peace-memorial-hall") {
        await page.getByRole("button", { name: "View cost breakdown" }).click();
      }
      await expect(page.locator("body")).toContainText(expected);
      await assertVisibleDataIsSafe(page);
    }
  });

  test("known onsite cost plus unknown selected fare stays partial", async ({
    page,
  }) => {
    await page.route("**/data/destinations/osaka-city.json", async (route) => {
      const response = await route.fetch();
      const destination = await response.json();
      destination.transportFares = {
        ...destination.transportFares,
        train: -1,
      };
      await route.fulfill({ response, json: destination });
    });

    await page.goto("/destinations?q=Osaka%20City&mode=train&partySize=2");
    await page.locator('a[href^="/destinations/osaka-city"]').first().click();
    await expect(page.locator("body")).toContainText(
      "On-site budget (transport excluded)",
    );
    await expect(page.locator("body")).toContainText("Cost unavailable");
    await expect(page.locator("body")).not.toContainText("Couple Budget");
    await assertVisibleDataIsSafe(page);
  });
});
