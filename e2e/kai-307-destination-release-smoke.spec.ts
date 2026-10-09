import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

type SmokeLocale = "en" | "ja";
type AdmissionState = "not_applicable" | "verified_paid" | "variable_price";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destinationIndex = JSON.parse(
  readFileSync(
    path.join(ROOT, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as Array<{
  id: string;
  name: string;
  nameJa?: string;
  content?: Partial<Record<SmokeLocale, { name?: string }>>;
}>;

interface RuntimeCase {
  id: string;
  locale: SmokeLocale;
  hours?: RegExp;
  warning: boolean;
  admission: AdmissionState;
}

const runtimeCases: RuntimeCase[] = [
  {
    id: "shinjuku-city",
    locale: "en",
    hours: /Open access; individual facilities may have separate hours/i,
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "kinkaku-ji",
    locale: "ja",
    hours: /09:00〜17:00/,
    warning: false,
    admission: "verified_paid",
  },
  {
    id: "ueno-park",
    locale: "en",
    hours: /Park grounds are always open/i,
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "osaka-aquarium-kaiyukan",
    locale: "ja",
    hours: /営業時間は日付により異なります/,
    warning: false,
    admission: "variable_price",
  },
  {
    id: "tokyo-tower-minato",
    locale: "en",
    warning: true,
    admission: "verified_paid",
  },
];

const sourceRecords = destinationIndex as Array<{
  id: string;
  name: string;
  nameJa?: string;
  content?: Partial<Record<SmokeLocale, { name?: string }>>;
}>;

function expectedName(id: string, locale: SmokeLocale): string {
  const record = sourceRecords.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`${id}: missing from canonical test fixture`);
  return (
    record.content?.[locale]?.name?.trim() ||
    (locale === "ja" ? record.nameJa?.trim() : record.name.trim()) ||
    record.name
  );
}

async function blockRemoteRequests(page: import("@playwright/test").Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "https://api.open-meteo.com" &&
      url.pathname === "/v1/forecast"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          daily: {
            time: ["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18"],
            temperature_2m_max: [21, 22, 20, 19],
            temperature_2m_min: [12, 13, 11, 10],
            weathercode: [1, 2, 3, 61],
          },
        }),
      });
      return;
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
        await route.fallback();
        return;
      }
      await route.abort();
      return;
    }
    await route.fallback();
  });
}

async function fixBrowserDate(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const RealDate = Date;
    const fixedTime = new RealDate("2026-10-09T12:00:00.000Z").valueOf();
    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixedTime);
        else super(...(args as ConstructorParameters<typeof Date>));
      }
      static now() {
        return fixedTime;
      }
    }
    Object.setPrototypeOf(FixedDate, RealDate);
    window.Date = FixedDate as unknown as DateConstructor;
  });
}

for (const runtimeCase of runtimeCases) {
  test(`${runtimeCase.id} ${runtimeCase.locale} detail release smoke`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await blockRemoteRequests(page);
    await fixBrowserDate(page);

    const localePrefix = runtimeCase.locale === "ja" ? "/ja" : "";
    const route = `${localePrefix}/destinations/${encodeURIComponent(runtimeCase.id)}`;
    await page.goto(route, { waitUntil: "domcontentloaded" });

    const heading = page.getByRole("heading", { level: 1 });
    await expect(
      heading,
      `${runtimeCase.id}: detail identity missing`,
    ).toBeVisible();
    await expect(heading).toContainText(
      expectedName(runtimeCase.id, runtimeCase.locale),
    );
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      runtimeCase.locale,
    );

    const overview = page.locator('[data-section="overview"]');
    await expect(
      overview,
      `${runtimeCase.id}: overview did not render`,
    ).toBeVisible();
    const sectionNav = page.getByTestId("destination-section-nav");
    await expect(
      sectionNav,
      `${runtimeCase.id}: section navigation missing`,
    ).toBeVisible();
    await sectionNav.locator('a[href="#overview"]').click();
    await expect(page).toHaveURL(/#overview$/);
    await expect(page.locator("#overview")).toBeInViewport();

    const atAGlance = page.getByTestId("destination-at-a-glance");
    await expect(
      atAGlance,
      `${runtimeCase.id}: core overview missing`,
    ).toBeVisible();
    const warningText =
      runtimeCase.locale === "ja" ? "未確認" : "Not yet verified";
    if (runtimeCase.warning) {
      await expect(
        atAGlance,
        `${runtimeCase.id}: unverified-hours warning missing`,
      ).toContainText(warningText);
    } else {
      await expect(
        atAGlance,
        `${runtimeCase.id}: verified/venue-dependent hours show a stale warning`,
      ).not.toContainText(/Not yet verified|未確認/);
    }
    if (runtimeCase.hours) {
      await expect(
        atAGlance,
        `${runtimeCase.id}: opening-hours presentation contradicts the expected state`,
      ).toContainText(runtimeCase.hours);
    }

    const expandBreakdown = page.getByRole("button", {
      name: /View cost breakdown|費用.*内訳/,
    });
    await expect(
      expandBreakdown,
      `${runtimeCase.id}: cost breakdown action missing`,
    ).toBeVisible();
    await expandBreakdown.click();
    const breakdown = page.getByTestId("trip-cost-breakdown");
    await expect(breakdown).toBeVisible();
    const admissionLabel =
      runtimeCase.locale === "ja" ? "入場料・チケット" : "Admission / Tickets";
    const admissionRow = breakdown.getByText(admissionLabel, { exact: true });
    const shouldHaveAdmissionRow = runtimeCase.admission !== "not_applicable";
    await expect(
      admissionRow,
      `${runtimeCase.id}: admission applicability rendered incorrectly`,
    ).toHaveCount(shouldHaveAdmissionRow ? 1 : 0);
    if (shouldHaveAdmissionRow) {
      const rowText = (await admissionRow.locator("..").innerText()).replace(
        /\s+/g,
        " ",
      );
      await expect
        .soft(
          rowText,
          `${runtimeCase.id}: admission was rendered as free or zero`,
        )
        .not.toMatch(/\bFree\b|無料|¥\s*0(?:\b|\D)/i);
      if (runtimeCase.admission === "verified_paid") {
        await expect
          .soft(
            rowText,
            `${runtimeCase.id}: verified paid admission is not shown as a positive amount`,
          )
          .toMatch(/¥\s*[1-9]\d*/);
      }
    }

    expect(pageErrors, `${runtimeCase.id}: application pageerror`).toEqual([]);
  });
}
