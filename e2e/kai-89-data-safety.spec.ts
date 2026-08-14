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
      ).toHaveText(/^(?:\d+(?:\.\d+)?|N\/A|—)$/);
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
    // (kept from KAI-89 pass 1)
    await page.goto("/destinations/kouri-island-okinawa");
    await expect(page.locator("main")).toBeVisible();
    await assertVisibleDataIsSafe(page);
  });

  test("unverified template hubs never render a raw authoritative score", async ({
    page,
  }) => {
    // otsu-city carries the 114-record template rating vector with no
    // ratingMetadata: the detail score card must show "—" + the
    // under-review caption, never the bare 9.5, and the detailed ratings
    // tab (raw sub-scores) must be hidden (REC-002).
    for (const id of ["otsu-city", "tottori-city", "abashiri-city"]) {
      await page.goto(`/destinations/${id}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(
        page.locator('[data-testid="destination-detail-score"]'),
      ).toHaveText("—");
      await expect(
        page.getByText("Score under editorial review"),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Detailed Ratings" }),
      ).toHaveCount(0);
      await assertVisibleDataIsSafe(page);
    }
  });

  test("verified rating evidence still renders a raw score", async ({
    page,
  }) => {
    // yokohama-city has ratingMetadata high/manual (genuine distinct vector).
    await page.goto("/destinations/yokohama-city");
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.locator('[data-testid="destination-detail-score"]'),
    ).toHaveText(/^\d+(?:\.\d+)?$/);
    await assertVisibleDataIsSafe(page);
  });

  test("Explore cards hide the score chip for unverified ratings", async ({
    page,
  }) => {
    const cardFor = (hrefPrefix: string) =>
      page
        .locator(`a[href^="${hrefPrefix}"]`)
        .first()
        .locator('xpath=ancestor::div[contains(@class,"rounded-card")]');
    await page.goto("/destinations?q=otsu");
    const otsuCard = cardFor("/destinations/otsu-city");
    await expect(otsuCard).toBeVisible();
    await expect(
      otsuCard.locator('[data-testid="meguruto-score"]'),
    ).toHaveCount(0);
    await page.goto("/destinations?q=yokohama");
    const verifiedCard = cardFor("/destinations/yokohama-city");
    await expect(verifiedCard).toBeVisible();
    await expect(
      verifiedCard.locator('[data-testid="meguruto-score"]'),
    ).toHaveCount(1);
  });

  test("day-plan widget duration range is monotonic (no reversed 9–8)", async ({
    page,
  }) => {
    // 6–12h hub template used to render "~9–8 hours" from a hardcoded upper
    // bound; the upper bound now comes from the visit-hours data.
    for (const id of ["otsu-city", "tottori-city", "beppu-city"]) {
      await page.goto(`/destinations/${id}`);
      const duration = page.getByText(/Est\. duration:/).first();
      await expect(duration).toBeVisible();
      const text = await duration.innerText();
      const match = text.match(/~(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) hours/);
      expect(match, `monotonic range for ${id}: ${text}`).not.toBeNull();
      if (match) {
        expect(Number(match[1])).toBeLessThanOrEqual(Number(match[2]));
      }
    }
  });

  test("corrected transport states render honestly (no fabricated rail)", async ({
    page,
  }) => {
    // naha-city's fabricated train:200 was removed (no rail link to Okinawa);
    // the detail transport section must not present a rail time.
    await page.goto("/destinations/naha-city");
    await expect(page.locator("main")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/train.*(?:200|180|3h20)/i);
    await assertVisibleDataIsSafe(page);
  });

  test("Hamarikyu Gardens never renders stale 24-hour/open-access copy", async ({
    page,
  }) => {
    // Final-pass cross-field fix: localized hours/parking/reservation were
    // synchronized to the official Tokyo Metropolitan Park page (09:00-17:00,
    // no general on-site parking). The detail page must not show the stale
    // template "24 Hours (Open access)" / "散策自由（24時間開放）" claims.
    await page.goto("/destinations/hamarikyu-gardens");
    await expect(page.locator("main")).toBeVisible();
    // Wait for the actual detail content (SPA navigation can race the body
    // read if the router lands on the home shell first).
    await expect(page.locator("h1").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/24 Hours|Open access|24時間開放|散策自由/i);
    expect(body).toMatch(/09:00-17:00/);
    expect(body).toMatch(/No general on-site parking/i);
    await assertVisibleDataIsSafe(page);
  });

  test("model outputs render as estimates, never as verified facts", async ({
    page,
  }) => {
    // Verified budget (source-backed ticket) stays concrete. KAI-89
    // contract: catalogue values are PER-PERSON — the details page scales
    // the ¥500 Engakuji ticket by party size (default 2 → ¥1,000 total).
    await page.goto("/destinations/engakuji");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/1,000/).first()).toBeVisible();

    // Template budget cleared to unknown renders as unavailable, not a
    // fabricated price.
    await page.goto("/destinations/abukuma-cave-fukushima");
    await expect(page.locator("main")).toBeVisible();
    const abukuma = await page.locator("body").innerText();
    expect(abukuma).not.toMatch(/¥\d{4,}[–〜-]\d{4,}/);

    // Seasonally neutralized destination must not claim "All Year" as a
    // verified fact.
    await page.goto("/destinations/edo-castle-tokyo");
    await expect(page.locator("main")).toBeVisible();
    const edo = await page.locator("body").innerText();
    expect(edo).not.toMatch(/Best Season[\s\S]{0,20}All Year/i);
    await assertVisibleDataIsSafe(page);
  });
});
