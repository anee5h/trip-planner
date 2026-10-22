import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

type SmokeLocale = "en" | "ja";
type AdmissionState =
  | "not_applicable"
  | "verified_free"
  | "verified_paid"
  | "variable_price"
  | "unavailable";
interface DestinationFixtureRecord {
  id: string;
  name: string;
  nameJa?: string;
  content?: Partial<Record<SmokeLocale, { name?: string }>>;
  openingHoursMetadata?: { verifiedAt?: string };
}

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FALLBACK_POLICY_INSTANT = "2026-10-09T12:00:00.000Z";
const destinationIndex = JSON.parse(
  readFileSync(
    path.join(ROOT, "src/shared/data/destinations-index.json"),
    "utf8",
  ),
) as DestinationFixtureRecord[];

interface RuntimeCase {
  id: string;
  locale: SmokeLocale;
  hours?: RegExp;
  highlights?: string[];
  description?: RegExp;
  reservation?: RegExp;
  forbiddenCopy?: RegExp[];
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
    id: "fushimi-inari-taisha",
    locale: "ja",
    hours: /境内の参拝時間は案内されていません/,
    highlights: ["千本鳥居", "稲荷山の参道", "稲荷社の総本宮"],
    warning: true,
    admission: "verified_free",
  },
  {
    id: "dotonbori",
    locale: "en",
    // Districts render the open-area policy string, not an attraction schedule.
    hours: /Open access; individual facilities may have separate hours/i,
    highlights: ["Glico sign", "Tonbori Riverwalk", "Takoyaki and restaurants"],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "meiji-jingu",
    locale: "ja",
    hours: /日の出とともに開門/,
    highlights: ["鎮守の杜", "大鳥居", "明治天皇・昭憲皇太后を祀る神社"],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "shibuya-crossing-hachiko",
    locale: "en",
    hours: /Open access/i,
    highlights: ["Shibuya Scramble Crossing", "Hachiko Statue"],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "hakone-town",
    locale: "ja",
    // Hub hours are venue-dependent; the detail intentionally uses its hub fallback.
    hours: /散策自由（個別施設により営業時間が異なります）/,
    highlights: ["芦ノ湖の海賊船クルーズ", "大涌谷", "箱根彫刻の森美術館"],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "tokyo-tower-minato",
    locale: "en",
    hours: /Main Deck \(150m\): 09:00 - 23:00/,
    highlights: [
      "Main Deck (150m)",
      "Top Deck Tour (250m)",
      "Night illumination",
    ],
    warning: false,
    admission: "verified_paid",
  },
  {
    id: "tokyo-skytree-sumida",
    locale: "ja",
    hours: /営業時間は日付により異なります/,
    highlights: [
      "天望デッキ（350m）",
      "天望回廊（450m）",
      "東京ソラマチ（隣接する商業施設）",
      "プラネタリウム天空（東京スカイツリータウン内）",
    ],
    warning: false,
    admission: "variable_price",
  },
  {
    id: "fushimi-inari-taisha",
    locale: "en",
    hours: /No visiting hours are listed for the shrine grounds/i,
    highlights: [
      "Senbon Torii gates",
      "Mount Inari paths",
      "Head shrine of Inari",
    ],
    warning: true,
    admission: "verified_free",
  },
  {
    id: "dotonbori",
    locale: "ja",
    hours: /散策自由/,
    highlights: ["グリコの看板", "とんぼりリバーウォーク", "たこ焼き・飲食店"],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "meiji-jingu",
    locale: "en",
    hours: /Opens at sunrise and closes at sunset/i,
    highlights: [
      "Forested shrine grounds",
      "Large torii gate",
      "Emperor Meiji and Empress Shoken",
    ],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "shibuya-crossing-hachiko",
    locale: "ja",
    hours: /散策自由/,
    highlights: ["渋谷スクランブル交差点", "忠犬ハチ公像"],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "hakone-town",
    locale: "en",
    hours: /Open access; individual facilities may have separate hours/i,
    highlights: [
      "Lake Ashi Sightseeing Cruise",
      "Owakudani Volcanic Valley",
      "Hakone Open-Air Museum",
    ],
    warning: false,
    admission: "not_applicable",
  },
  {
    id: "tokyo-tower-minato",
    locale: "ja",
    hours: /メインデッキ（150m）：9:00〜23:00/,
    highlights: [
      "メインデッキ（150m）",
      "トップデッキツアー（250m）",
      "夜間ライトアップ",
    ],
    warning: false,
    admission: "verified_paid",
  },
  {
    id: "tokyo-skytree-sumida",
    locale: "en",
    hours: /Hours vary by date; check the official calendar/i,
    highlights: [
      "Tembo Deck (350m)",
      "Tembo Galleria (450m)",
      "Tokyo Solamachi (adjacent shopping complex)",
      "Planetarium Tenku (in Tokyo Skytree Town)",
    ],
    warning: false,
    admission: "variable_price",
  },
];

const sourceRecords = destinationIndex;

interface RenderedCopyCheck {
  description?: RegExp;
  reservation?: RegExp;
  forbiddenCopy?: RegExp[];
}

const renderedCopyChecks: Partial<
  Record<string, Partial<Record<SmokeLocale, RenderedCopyCheck>>>
> = {
  "fushimi-inari-taisha": {
    en: {
      description: /head shrine of Inari/,
      reservation:
        /Check the shrine's official guidance for booking requirements/,
      forbiddenCopy: [/four-kilometer trail/i, /thousands of torii gates/i],
    },
    ja: {
      description: /伏見稲荷大社は稲荷社の総本宮/,
      reservation: /祈祷などのサービスや特別な参拝/,
      forbiddenCopy: [/関西を代表する観光地/],
    },
  },
  dotonbori: {
    en: {
      description: /canal-side shopping and entertainment district/,
      reservation: /No booking is needed to walk the public district/,
      forbiddenCopy: [
        /09:30\s*-\s*17:00/i,
        /Closed Mondays/i,
        /general shrine visits/i,
      ],
    },
    ja: {
      description: /川沿いの商業・歓楽街/,
      reservation: /街区の散策に予約は不要/,
      forbiddenCopy: [/一般参拝・見学/, /09:00\s*-\s*17:00/],
    },
  },
  "meiji-jingu": {
    en: {
      description: /Shinto shrine in central Tokyo/,
      reservation:
        /Check the official visitor guidance for reservation requirements/,
      forbiddenCopy: [/open 24 hours/i, /most celebrated/i],
    },
    ja: {
      description: /明治神宮は東京の都心にある神社/,
      reservation: /特別な祈願や施設の利用/,
      forbiddenCopy: [/24時間/, /現地にてチケット/],
    },
  },
  "shibuya-crossing-hachiko": {
    en: {
      description: /pedestrians cross the multi-cornered scramble crossing/,
      reservation: /No booking is needed to use the public crossing/,
      forbiddenCopy: [
        /world'?s busiest/i,
        /09:00\s*[-–]\s*17:00/,
        /giant digital screens/i,
        /tickets available on arrival/i,
      ],
    },
    ja: {
      description: /スクランブル交差点では、多くの歩行者/,
      reservation: /交差点の通行に予約は不要/,
      forbiddenCopy: [
        /世界で最も忙しい/,
        /09:00\s*[〜–]\s*17:00/,
        /デジタルスクリーン/,
      ],
    },
  },
  "hakone-town": {
    en: {
      description: /mountain resort area known for its hot springs/,
      reservation: /Reservation requirements vary by attraction and activity/,
      forbiddenCopy: [
        /open 24 hours/i,
        /No entrance reservation required/i,
        /Best visited during clear weather/i,
      ],
    },
    ja: {
      description: /温泉、芦ノ湖、火山地形/,
      reservation: /予約の要否は施設や体験によって異なります/,
      forbiddenCopy: [/24時間/, /事前予約不要/, /おすすめの季節/],
    },
  },
  "tokyo-tower-minato": {
    en: {
      description: /Tokyo Tower stands 333 meters tall/,
      reservation: /Advance booking recommended for Top Deck Tour/,
      forbiddenCopy: [/332[.]9/, /post-war Tokyo/i],
    },
    ja: {
      description: /高さ333メートルの東京タワー/,
      reservation: /トップデッキツアーは事前予約推奨/,
      forbiddenCopy: [/332[.]9/],
    },
  },
  "tokyo-skytree-sumida": {
    en: {
      description: /Rising 634 meters over Tokyo/,
      reservation: /Advance online booking recommended/,
      forbiddenCopy: [/08:00\s*[-–]\s*22:00/],
    },
    ja: {
      description: /高さ634メートルの東京スカイツリー/,
      reservation: /日時指定事前予約がおすすめ/,
      forbiddenCopy: [/08:00\s*[-–]\s*22:00/],
    },
  },
};

function expectedName(id: string, locale: SmokeLocale): string {
  const record = sourceRecords.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`${id}: missing from canonical test fixture`);
  return (
    record.content?.[locale]?.name?.trim() ||
    (locale === "ja" ? record.nameJa?.trim() : record.name.trim()) ||
    record.name
  );
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function policyInstantFor(id: string): string {
  const record = sourceRecords.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`${id}: missing from canonical test fixture`);
  const verifiedAt = record.openingHoursMetadata?.verifiedAt;
  if (verifiedAt === undefined) return FALLBACK_POLICY_INSTANT;
  if (!isValidIsoDate(verifiedAt)) {
    throw new Error(`${id}: opening-hours verifiedAt is not a valid ISO date`);
  }
  const instant = new Date(`${verifiedAt}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString();
}

function isoDateAfter(instant: string, days: number): string {
  const date = new Date(instant);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function blockRemoteRequests(
  page: import("@playwright/test").Page,
  policyInstant: string,
) {
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
            time: [1, 2, 8, 9].map((days) => isoDateAfter(policyInstant, days)),
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

async function fixBrowserDate(
  page: import("@playwright/test").Page,
  policyInstant: string,
) {
  await page.addInitScript((instant: string) => {
    const RealDate = Date;
    const fixedTime = new RealDate(instant).valueOf();
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
  }, policyInstant);
}

for (const runtimeCase of runtimeCases) {
  test(`${runtimeCase.id} ${runtimeCase.locale} detail release smoke`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const policyInstant = policyInstantFor(runtimeCase.id);
    await blockRemoteRequests(page, policyInstant);
    await fixBrowserDate(page, policyInstant);

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
    const copyCheck = renderedCopyChecks[runtimeCase.id]?.[runtimeCase.locale];
    if (copyCheck?.description) {
      await expect(
        page.getByText(copyCheck.description).first(),
        `${runtimeCase.id} ${runtimeCase.locale}: localized description missing`,
      ).toBeVisible();
    }
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
    const practicalDetails = page.locator("details").filter({
      hasText:
        runtimeCase.locale === "ja"
          ? "その他の旅行情報"
          : "More practical information",
    });
    const needsPracticalDetails = Boolean(
      runtimeCase.highlights?.length ||
      copyCheck?.reservation ||
      copyCheck?.forbiddenCopy?.length,
    );
    if (needsPracticalDetails) {
      await expect(practicalDetails).toHaveCount(1);
      if (!(await practicalDetails.evaluate((element) => element.open))) {
        await practicalDetails.locator("summary").click();
      }
    }
    for (const highlight of runtimeCase.highlights ?? []) {
      await expect(
        practicalDetails.getByText(highlight, { exact: true }),
        `${runtimeCase.id} ${runtimeCase.locale}: localized highlight missing`,
      ).toBeVisible();
    }
    if (copyCheck?.reservation) {
      await expect(
        practicalDetails,
        `${runtimeCase.id} ${runtimeCase.locale}: localized reservation copy missing`,
      ).toContainText(copyCheck.reservation);
    }
    for (const forbidden of copyCheck?.forbiddenCopy ?? []) {
      await expect(
        page.locator("main"),
        `${runtimeCase.id} ${runtimeCase.locale}: stale copy still renders`,
      ).not.toContainText(forbidden);
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
      const freeAdmissionPattern = /\bFree\b|無料|¥\s*0(?:\b|\D)/i;
      if (runtimeCase.admission === "verified_free") {
        await expect
          .soft(
            rowText,
            `${runtimeCase.id}: verified free admission is not rendered as free or zero`,
          )
          .toMatch(freeAdmissionPattern);
      } else {
        await expect
          .soft(
            rowText,
            `${runtimeCase.id}: admission was rendered as free or zero`,
          )
          .not.toMatch(freeAdmissionPattern);
      }
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
