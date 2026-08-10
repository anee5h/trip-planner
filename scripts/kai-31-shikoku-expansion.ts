/**
 * KAI-31 — Shikoku beta expansion (PR2).
 *
 * Adds 35 bilingual POIs across 8 Shikoku target municipalities and creates
 * two new municipal hubs (Miyoshi City, Uwajima City). Also corrects four
 * existing containment/relationship defects:
 *
 *   1. teshima-island-kagawa was parented under takamatsu-city with
 *      municipalityId Kagawa:takamatsu, but the island is in Tonosho Town
 *      (Shozu District). It is not contained in Takamatsu City; convert it
 *      to a gateway-accessed standalone (gatewayHubId = takamatsu-city).
 *   2. ryugado-cave-kochi was parented under kochi-city with municipalityId
 *      Kochi:kochi, but the cave is in Kami City. Convert it to a
 *      gateway-accessed standalone (gatewayHubId = kochi-city).
 *   3. iya-valley-tokushima was a standalone gateway-accessed via
 *      tokushima-city; the Iya Valley is in Miyoshi City. Re-parent under
 *      the new miyoshi-city hub with municipalityId Tokushima:miyoshi.
 *   4. uwajima-castle was a standalone gateway-accessed via matsuyama-city;
 *      the castle is in Uwajima City. Re-parent under the new uwajima-city
 *      hub with municipalityId Ehime:uwajima, and remove it from the
 *      matsuyama-city featured list (cross-municipality featured).
 *
 * Idempotence: records are keyed by id; running twice produces zero diff.
 * Usage: tsx scripts/kai-31-shikoku-expansion.ts
 */

import fs from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import type { Destination } from "../src/shared/types/destination";

const INDEX_PATH = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Destination[];
const byId = new Map(index.map((d) => [d.id, d]));
const AUDIT_DATE = "2026-08-10";

const OPENING_HOURS_JA: Record<string, string> = {
  "ritsurin-garden":
    "1月7:00～17:00、2月7:00～17:30、3月6:30～18:00、4～5月5:30～18:30、6～8月5:30～19:00、9月5:30～18:30、10月6:00～17:30、11月6:30～17:00、12月7:00～19:00（年中無休）。",
  "takamatsu-castle-tamamo":
    "西門は月により5:30～7:00開門、17:00～19:00閉門。東門は7:00～8:30開門、17:00～18:00閉門。12月29～31日は休園。",
  "yashima-takamatsu": "屋島は常時開放。屋島寺の納経受付は7:00～17:00。",
  "shikoku-mura":
    "9:30～17:00（最終入場16:30）。火曜休館（祝日の場合は翌日）。臨時休館・荒天休館あり。",
  "takamatsu-art-museum":
    "9:30～17:00（最終入館16:30）。特別展は火～土・祝日に19:00まで延長の場合あり。月曜・12月29日～1月3日休館。",
  "ishite-ji-ehime":
    "観光7:00～17:00、祈祷6:00～19:00、宝物館・洞窟8:00～17:00。",
  "bansuiso-matsuyama":
    "9:00～18:00。月曜休館（祝日は開館）。展示により変更される場合があります。",
  "dogo-onsen-annex-asuka-no-yu": "1階浴室6:00～23:00、2階各室6:00～22:00。",
  "botchan-train-matsuyama":
    "土曜・日曜・祝日のみ運行。12月30日～1月3日は運休。",
  "dogo-haikara-dori":
    "通りは通行可。各店舗の営業時間・定休日は店舗により異なります。",
  "yuzuki-castle-ruins-matsuyama":
    "公園は常時開園。展示施設9:00～17:00。月曜休館（祝日は開館し翌平日休館）。",
  "ehime-art-museum":
    "9:40～18:00（最終入館17:30）。月曜休館（祝日は翌日休館）。毎月第1月曜は開館し翌火曜休館。12月29日～1月3日休館。",
  "awa-odori-kaikan":
    "9:00～20:00。12月28日～1月1日、2・6・9・12月の第2水曜休館（祝日は翌日）。昼公演は11・14・15・16時、夜公演は20時。",
  "bizan-ropeway-tokushima":
    "4～10月9:00～21:00、11～3月9:00～17:30。1月1日は6:00～17:30。",
  "tokushima-central-park":
    "公園は常時開放。旧表御殿庭園9:00～17:00（最終入園16:30）。庭園は月曜・祝日の翌日・12月28日～1月4日休園（例外あり）。",
  "tokushima-modern-art-museum":
    "9:30～17:00（最終入館16:30）。月曜（祝日の場合は翌日）、12月29日～1月4日休館。展示替えによる臨時休館あり。",
  "uzu-no-michi-naruto":
    "3～9月9:00～18:00、10～2月9:00～17:00。3・6・9・12月の第2月曜休館。",
  "uzushio-cruise-naruto":
    "運航時刻は公式時刻表を確認。潮流・天候により変更。通常船は予約不要、小型水中観潮船は要予約。",
  "otsuka-museum-of-art-naruto":
    "9:30～17:00（入館券販売16:00まで）。月曜休館（祝日の場合は翌日）。開館カレンダーを確認。",
  "naruto-german-house":
    "9:30～17:00（最終入館16:30）。第4月曜休館（祝日の場合は翌日）、12月28日～31日休館。臨時休館あり。",
  "ryozen-ji-naruto": "7:00～17:00。年中無休。",
  "katsurahama-beach": "常時開放。海水浴場ではなく観光向け。",
  "hirome-market-kochi":
    "月～土10:00～23:00、日曜9:00～23:00。店舗により営業時間が異なります。",
  "sakamoto-ryoma-memorial-museum":
    "9:00～17:00（最終入館16:30頃）。休館日なし。",
  "chikurin-ji-kochi":
    "本堂周辺8:00～17:00、名勝庭園・宝物館8:30～17:00。年中無休。",
  "makino-botanical-garden":
    "9:00～17:00（最終入園16:30）。メンテナンス休園日あり。公式カレンダーを確認。",
  "harimaya-bridge-kochi": "常時開放。",
  "nakazu-banshoen-marugame": "9:30～17:00。水曜休園（祝日は開園し翌日休園）。",
  "marugame-uchiwa-museum":
    "9:30～17:00（最終入館16:30）。水曜休館（祝日は開館し翌日休館）。年末年始休館。",
  "oboke-koboke-gorge":
    "観光遊覧船9:00～17:00（最終出航16:30）。年中運航（強風・荒天時を除く）。",
  "ochiai-folk-village":
    "集落は常時見学可。長岡家住宅9:00～16:00。水曜休館、1・2月休業。",
  "mount-tsurugi-miyoshi":
    "リフトは4月中旬～11月30日、通常9:00～16:30（8月は8:00から）。天候・営業日は公式サイトを確認。",
  "uwajima-date-museum":
    "9:00～17:00（最終入館16:30）。火曜・12月29日～1月3日休館。展示替えによる臨時休館あり。",
  "warei-taisha-shrine": "境内は参拝可。和霊大祭は7月23・24日。",
  "tenshaen-garden-uwajima":
    "8:30～16:30（4～6月は17:00まで）。12月第2月曜～2月末の月曜休園、12月28日～1月1日休園。",
};

// ---------------------------------------------------------------------------
// Shared record templates
// ---------------------------------------------------------------------------

function poil(
  id: string,
  name: string,
  nameJa: string,
  municipalityId: string,
  parent: string,
  coords: [number, number],
  kind: Destination["kind"],
  categories: string[],
  tags: string[],
  description: string,
  descriptionJa: string,
  jaHighlights: string[],
  enHighlights: string[],
  budget: [number, number, number],
  breakdown: { transport: number; tickets: number; food: number; cafe: number },
  transportOptions: Destination["transportOptions"],
  visitHours: { min: number; max: number },
  walking: [number, number, number],
  indoorPercent: number,
  crowd: Destination["crowd"],
  season: Destination["season"],
  bestMonths: number[],
  bestSeason: string,
  weatherDependence: "low" | "moderate" | "high",
  comfort: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  },
  ratings: Destination["ratings"],
  officialWebsite: string,
  businessHours: string,
  reservation: string,
  parking: string,
  notes: string,
  sources: {
    type: Destination["editorial"]["sources"][number]["type"];
    url: string;
    title: string;
  }[],
  image: {
    url: string;
    license: string;
    attribution: string;
    sourceUrl: string;
  },
  aliases: string[] = [],
  openingHoursMetadata?: Destination["openingHoursMetadata"],
): Destination {
  const sum =
    breakdown.transport + breakdown.tickets + breakdown.food + breakdown.cafe;
  const recommended = budget[1];
  if (Math.abs(sum - recommended) > Math.max(100, recommended * 0.02)) {
    throw new Error(
      `${id}: budget breakdown sum ${sum} != recommended ${recommended}`,
    );
  }
  const [walkingMin, walkingSunMin, walkingShadeMin] = walking;
  if (walkingSunMin + walkingShadeMin > walkingMin) {
    throw new Error(`${id}: walkingSunMin+walkingShadeMin > walkingMin`);
  }
  // walkingMin is metres of on-site walking; sanity-cap at a brisk 5 km/h.
  if (walkingMin > visitHours.max * 5000) {
    throw new Error(`${id}: walkingMin > visitHours.max*5000`);
  }
  const openingHoursJa = OPENING_HOURS_JA[id];
  if (!openingHoursJa) {
    throw new Error(`${id}: missing audited Japanese opening hours`);
  }
  return {
    id,
    name,
    nameJa,
    kind,
    role: "poi",
    placeType: "destination",
    aliases,
    municipalityId,
    prefecture: municipalityId.split(":")[0],
    region: "Shikoku",
    coordinates: { lat: coords[0], lng: coords[1] },
    categories,
    tags,
    description,
    highlights: enHighlights,
    status: "beta",
    travelEstimate: { confidence: "beta" },
    collections: [],
    transportOptions,
    budgetMin: budget[0],
    budgetRecommended: budget[1],
    budgetMax: budget[2],
    budgetBreakdown: breakdown,
    heroImage: image.url,
    image: image.url,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: image.license,
      attribution: image.attribution,
      sourceUrl: image.sourceUrl,
    },
    openingHoursMetadata,
    recommendedVisitHours: visitHours,
    walkingMin,
    walkingSunMin,
    walkingShadeMin,
    walkingIntensity:
      comfort.walkingIntensity <= 3
        ? "low"
        : comfort.walkingIntensity <= 6
          ? "medium"
          : "high",
    indoorPercent,
    comfort,
    ratings,
    ratingsSchemaVersion: 2,
    crowd,
    season,
    bestMonths,
    bestSeason,
    weatherDependence,
    reservation,
    parking,
    notes,
    notesJa: `【見どころ】${nameJa}は四国の観光スポットです。訪問前に公式サイトで最新の営業情報をご確認ください。`,
    reservationJa: "【予約】最新の予約・受付情報は公式サイトをご確認ください。",
    parkingJa: "【駐車場】公式サイトで最新の駐車場情報をご確認ください。",
    openingHoursJa,
    businessHours,
    officialWebsite,
    content: {
      en: {
        name,
        description,
        highlights: enHighlights,
      },
      ja: {
        name: nameJa,
        description: descriptionJa,
        highlights: jaHighlights,
      },
    },
    editorial: {
      lifecycle: "in_review",
      sources: sources.map((s) => ({ ...s, accessedAt: AUDIT_DATE })),
      checkedAt: AUDIT_DATE,
      freshness: "current",
      changeSummary: "KAI-31 Shikoku beta expansion",
      changes: [
        {
          changedAt: AUDIT_DATE,
          changedBy: "Meguruto editorial",
          summary: "Added source-backed KAI-31 Shikoku POI",
          method: "assisted",
        },
      ],
    },
    ratingMetadata: {
      rubricVersion: 1,
      method: "assisted",
      confidence: "low",
    },
    relationships: { parentDestinationId: parent },
    schemaVersion: 2,
  };
}

function hubRecord(
  id: string,
  name: string,
  nameJa: string,
  municipalityId: string,
  coords: [number, number],
  categories: string[],
  tags: string[],
  description: string,
  descriptionJa: string,
  highlights: string[],
  jaHighlights: string[],
  featured: string[],
  nearby: string[],
  budget: [number, number, number],
  breakdown: { transport: number; tickets: number; food: number; cafe: number },
  transportOptions: Destination["transportOptions"],
  ratings: Destination["ratings"],
  visitHours: { min: number; max: number },
  notes,
  sources: {
    type: Destination["editorial"]["sources"][number]["type"];
    url: string;
    title: string;
  }[],
  image: {
    url: string;
    license: string;
    attribution: string;
    sourceUrl: string;
  },
  importance: "major" | "notable" | "standard" = "notable",
): Destination {
  const sum =
    breakdown.transport + breakdown.tickets + breakdown.food + breakdown.cafe;
  if (Math.abs(sum - budget[1]) > Math.max(100, budget[1] * 0.02)) {
    throw new Error(
      `${id}: hub budget breakdown sum ${sum} != recommended ${budget[1]}`,
    );
  }
  return {
    id,
    name,
    nameJa,
    kind: "city",
    role: "hub",
    placeType: "hub",
    importance,
    aliases: [nameJa],
    municipalityId,
    prefecture: municipalityId.split(":")[0],
    region: "Shikoku",
    coordinates: { lat: coords[0], lng: coords[1] },
    categories,
    tags,
    description,
    highlights,
    status: "verified",
    travelEstimate: { confidence: "beta" },
    collections: [],
    transportOptions,
    budgetMin: budget[0],
    budgetRecommended: budget[1],
    budgetMax: budget[2],
    budgetBreakdown: breakdown,
    heroImage: image.url,
    image: image.url,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: image.license,
      attribution: image.attribution,
      sourceUrl: image.sourceUrl,
    },
    recommendedVisitHours: visitHours,
    walkingMin: 4000,
    walkingSunMin: 1500,
    walkingShadeMin: 2500,
    walkingIntensity: "medium",
    indoorPercent: 40,
    comfort: { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 5 },
    ratings,
    ratingsSchemaVersion: 2,
    crowd: { weekday: 4, weekend: 6, holiday: 7 },
    season: { spring: 9, summer: 7, autumn: 9, winter: 7 },
    bestMonths: [3, 4, 5, 9, 10, 11],
    bestSeason: "Spring & Autumn",
    weatherDependence: "moderate",
    reservation:
      "Not usually required; reserve popular accommodation in advance.",
    parking: "Check local parking and public transport guidance.",
    notes,
    businessHours: "Open access",
    // Hubs intentionally carry no officialWebsite (kept destination-only per
    // PlaceCatalog policy); the tourism office link lives in editorial.sources.
    content: {
      en: { name, description, highlights },
      ja: {
        name: nameJa,
        description: descriptionJa,
        highlights: jaHighlights,
      },
    },
    // No editorial block: verified Shikoku municipal hubs (e.g.
    // marugame-city) carry no editorial lifecycle. A lifecycle here would
    // either mark children as having an unpublished parent (in_review) or
    // contradict the verified status (published).
    relationships: {
      featuredDestinationIds: featured,
      nearbyDestinationIds: nearby,
    },
    schemaVersion: 2,
  };
}

// ---------------------------------------------------------------------------
// New records
// ---------------------------------------------------------------------------

const newRecords: Destination[] = [];

// --- Takamatsu City (5) ---
newRecords.push(
  poil(
    "ritsurin-garden",
    "Ritsurin Garden",
    "栗林公園",
    "Kagawa:takamatsu",
    "takamatsu-city",
    [34.3295, 134.0439],
    "garden",
    ["Nature", "Garden", "History"],
    ["Nature", "Garden", "History", "Takamatsu City"],
    "One of Japan's finest surviving daimyo gardens, laid out in the 17th century around six ponds and thirteen hills, with the pine-covered Mount Shiun as borrowed scenery.",
    "江戸時代から受け継がれる大名庭園で、6つの池と13の築山が配され、紫雲山を借景にした回遊式庭園の名園です。",
    ["自然", "庭園", "歴史"],
    ["Nature", "Garden", "History"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 500, food: 1500, cafe: 500 },
    { train: 110, bus: 120, car: 130 },
    { min: 2, max: 4 },
    [6000, 3500, 2500],
    30,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 9.4, summer: 7.6, autumn: 9.2, winter: 8.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 5 },
    {
      overall: 9.2,
      couple: 9,
      summer: 8.2,
      winter: 8,
      rain: 7.4,
      food: 8,
      photography: 9.4,
      relaxation: 9.4,
      value: 8.6,
      uniqueness: 9,
    },
    "https://www.my-kagawa.jp/en/see-and-do/10077",
    "Open year-round; hours vary by month (07:00–17:00 in Jan, 07:00–19:00 in Dec)",
    "None required",
    "Paid parking available near the garden",
    "Source-backed KAI-31 Shikoku expansion record for Takamatsu City.",
    [
      {
        type: "tourism_board",
        url: "https://www.my-kagawa.jp/en/see-and-do/10077",
        title: "Ritsurin Garden — VISIT KAGAWA official tourism site",
      },
      {
        type: "tourism_board",
        url: "https://www.art-takamatsu.com/en/spot/entry-642.html",
        title: "Takamatsu City official art/tourism listing",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Ritsurin.JPG/1280px-Ritsurin.JPG",
      license: "CC BY-SA 3.0",
      attribution: "Leela Soden",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ritsurin.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "takamatsu-castle-tamamo",
    "Takamatsu Castle (Tamamo Park)",
    "高松城（玉藻公園）",
    "Kagawa:takamatsu",
    "takamatsu-city",
    [34.3504, 134.0518],
    "castle",
    ["History", "Culture", "Sightseeing"],
    ["Castle", "History", "Takamatsu City"],
    "A rare seaside castle whose inner moat opens directly onto the Seto Inland Sea; the surviving tower base and reconstructed yagura sit inside Tamamo Park.",
    "瀬戸内海に面した海城で、内堀が海に直接つながる珍しい構造。天守台や復元された櫓が玉藻公園内に残ります。",
    ["歴史", "文化", "城郭"],
    ["History", "Culture", "Sightseeing"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 300, food: 1500, cafe: 700 },
    { train: 105, bus: 120, car: 125 },
    { min: 1, max: 3 },
    [5000, 3000, 2000],
    25,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 7.4, autumn: 8.6, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 5 },
    {
      overall: 8.6,
      couple: 8.4,
      summer: 7.8,
      winter: 7.6,
      rain: 6.8,
      food: 7.4,
      photography: 8.6,
      relaxation: 8,
      value: 8.2,
      uniqueness: 8.6,
    },
    "https://www.city.takamatsu.kagawa.jp/kurashi/kurashi/shisetsu/park/tamamo/index.html",
    "Open year-round; gate hours vary by month; closed Dec 29–31",
    "None required",
    "Paid parking available at the east gate area",
    "Source-backed KAI-31 Shikoku expansion record for Takamatsu City.",
    [
      {
        type: "official",
        url: "https://www.city.takamatsu.kagawa.jp/kurashi/kurashi/shisetsu/park/tamamo/index.html",
        title: "Takamatsu Castle (Tamamo Park) — Takamatsu City official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Takamatsu_castle09s3872.jpg/1280px-Takamatsu_castle09s3872.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Takamatsu_castle09s3872.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "yashima-takamatsu",
    "Yashima",
    "屋島",
    "Kagawa:takamatsu",
    "takamatsu-city",
    [34.3366, 134.1092],
    "mountain",
    ["Nature", "History", "Viewpoint"],
    ["Nature", "History", "Viewpoint", "Takamatsu City"],
    "A flat-topped lava mesa on the Seto Inland Sea, site of the 1185 Battle of Yashima and home to Yashima-ji, temple No. 84 of the Shikoku pilgrimage, with panoramic sea views.",
    "瀬戸内海に浮かぶ溶岩台地。1185年の屋島の戦いの舞台で、四国霊場第84番札所・屋島寺があり、海を見渡す絶景が広がります。",
    ["自然", "歴史", "展望"],
    ["Nature", "History", "Viewpoint"],
    [2000, 5000, 9000],
    { transport: 1800, tickets: 500, food: 1800, cafe: 900 },
    { train: 115, bus: 125, car: 130 },
    { min: 3, max: 5 },
    [8000, 4800, 3200],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9, summer: 8.2, autumn: 9.2, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "high",
    { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 7 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 8.4,
      winter: 7.4,
      rain: 6.4,
      food: 7.8,
      photography: 9,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 9.2,
    },
    "https://www.yashima-navi.jp/en/about/",
    "Open access; Yashima-ji temple office 07:00–17:00",
    "None required",
    "Paid parking near the summit shuttle bus stops",
    "Source-backed KAI-31 Shikoku expansion record for Takamatsu City. The former Yashima ropeway is permanently closed; the summit shuttle bus is the current access.",
    [
      {
        type: "tourism_board",
        url: "https://www.yashima-navi.jp/en/about/",
        title: "all YASHIMA — Takamatsu City official Yashima tourism site",
      },
      {
        type: "tourism_board",
        url: "https://www.my-kagawa.jp/point/280/",
        title: "Yashima-ji — Kagawa Tourism official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Yashimaji_06.JPG/1280px-Yashimaji_06.JPG",
      license: "CC BY-SA 3.0",
      attribution: "Reggaeman",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Yashimaji_06.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "shikoku-mura",
    "Shikoku Mura",
    "四国村",
    "Kagawa:takamatsu",
    "takamatsu-city",
    [34.344, 134.1058],
    "museum",
    ["Culture", "Museum", "History"],
    ["Culture", "Museum", "History", "Takamatsu City"],
    "An open-air museum of historic buildings moved from across Shikoku, including farmhouses, a kabuki stage, and sugar-mill structures, set in hillside woodland below Yashima.",
    "四国各地から移築された歴史的建造物を展示する野外博物館。民家や芝居小屋、砂糖しぼり小屋などが屋島の麓の斜面に並びます。",
    ["文化", "博物館", "歴史"],
    ["Culture", "Museum", "History"],
    [2500, 6000, 10000],
    { transport: 1800, tickets: 1600, food: 1800, cafe: 800 },
    { train: 115, bus: 125, car: 130 },
    { min: 2, max: 4 },
    [6500, 4000, 2500],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 7.6, autumn: 9, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 6 },
    {
      overall: 8.6,
      couple: 8.4,
      summer: 7.8,
      winter: 7.6,
      rain: 6.6,
      food: 7.6,
      photography: 8.6,
      relaxation: 8.4,
      value: 8,
      uniqueness: 9,
    },
    "https://www.shikokumura.or.jp/en/",
    "09:30–17:00 (last admission 16:30); closed Tuesdays (next day if Tuesday is a national holiday)",
    "None required",
    "Free parking available",
    "Source-backed KAI-31 Shikoku expansion record for Takamatsu City.",
    [
      {
        type: "official",
        url: "https://www.shikokumura.or.jp/en/information/",
        title: "Shikoku Mura official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Shikokumura27s3200.jpg/1280px-Shikokumura27s3200.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Shikokumura27s3200.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "takamatsu-art-museum",
    "Takamatsu Art Museum",
    "高松市美術館",
    "Kagawa:takamatsu",
    "takamatsu-city",
    [34.3441, 134.0492],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Art", "Takamatsu City"],
    "Takamatsu's municipal museum of modern and contemporary art, whose collection follows three pillars: post-war contemporary Japanese art, art in the world from the 20th century onward (prints), and the arts of Kagawa (lacquerware and metalwork).",
    "戦後日本の現代美術、20世紀以降の世界の美術（版画）、香川の美術（漆芸・金工）を3つの柱として収集する高松市の美術館です。",
    ["文化", "博物館", "アート"],
    ["Culture", "Museum", "Art"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 200, food: 1500, cafe: 800 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 3 },
    [3000, 1800, 1200],
    85,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 7.6, autumn: 8.6, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.2,
      couple: 8,
      summer: 7.6,
      winter: 7.8,
      rain: 8.4,
      food: 7.2,
      photography: 7.8,
      relaxation: 7.6,
      value: 7.8,
      uniqueness: 8.2,
    },
    "https://www.city.takamatsu.kagawa.jp/museum/takamatsu/english/general_info/info.html",
    "09:30–17:00 (last admission 16:30); special exhibitions may run to 19:00 Tue–Sat and holidays; closed Mondays and Dec 29–Jan 3",
    "None required",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Takamatsu City.",
    [
      {
        type: "official",
        url: "https://www.city.takamatsu.kagawa.jp/museum/takamatsu/english/general_info/info.html",
        title: "Takamatsu Art Museum official visitor information",
      },
      {
        type: "official",
        url: "https://www.city.takamatsu.kagawa.jp/museum/takamatsu/english/collection/collection.html",
        title: "Takamatsu Art Museum official collection overview",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Takamatsu_City_Museum_of_Art_Building_1.jpg",
      license: "CC BY-SA 3.0",
      attribution: "MK Products",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Takamatsu_City_Museum_of_Art_Building_1.jpg",
    },
  ),
);

// --- Matsuyama City (7) ---
newRecords.push(
  poil(
    "ishite-ji-ehime",
    "Ishite-ji",
    "石手寺",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8468, 132.7964],
    "temple",
    ["History", "Culture", "Temple"],
    ["History", "Culture", "Temple", "Matsuyama City"],
    "Temple No. 51 of the Shikoku 88-temple pilgrimage, with a National Treasure Niomon gate and important cultural-property halls, a 20-minute walk from Dogo Onsen.",
    "四国八十八箇所第51番札所。国宝の仁王門や重要文化財の堂宇が残り、道後温泉から徒歩約20分です。",
    ["歴史", "文化", "寺院"],
    ["History", "Culture", "Temple"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 0, food: 1800, cafe: 700 },
    { train: 105, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [4000, 2400, 1600],
    30,
    { weekday: 3, weekend: 4, holiday: 5 },
    { spring: 8.6, summer: 7.6, autumn: 8.8, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    {
      overall: 8.6,
      couple: 8.2,
      summer: 7.6,
      winter: 7.4,
      rain: 6.8,
      food: 7.6,
      photography: 8.4,
      relaxation: 8.2,
      value: 8.4,
      uniqueness: 8.8,
    },
    "https://en.matsuyama-sightseeing.com/spot/31-2/",
    "Sightseeing 07:00–17:00; prayers 06:00–19:00; treasure hall and caves 08:00–17:00",
    "None required",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City.",
    [
      {
        type: "tourism_board",
        url: "https://en.matsuyama-sightseeing.com/spot/31-2/",
        title: "Ishite-ji — Tourism Matsuyama official listing",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/a/a8/Ishiteji_niomon.JPG",
      license: "CC BY-SA 3.0",
      attribution: "アイザール (ja.wikipedia)",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ishiteji_niomon.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "bansuiso-matsuyama",
    "Bansuiso",
    "萬翠荘",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8425, 132.7682],
    "museum",
    ["Culture", "Museum", "History"],
    ["Culture", "Museum", "History", "Matsuyama City"],
    "A French Renaissance-style mansion built in 1922 by Count Sadakoto Hisamatsu, a descendant of the former lords of Matsuyama, designated an Important Cultural Property and now open as a museum.",
    "1922年に旧松山藩主家の子孫・久松定謨伯爵が建てたフランス・ルネサンス様式の邸宅。国の重要文化財に指定され、現在は美術館として公開されています。",
    ["文化", "博物館", "歴史"],
    ["Culture", "Museum", "History"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 400, food: 1500, cafe: 600 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    75,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 7.8, autumn: 8.4, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.4,
      couple: 8.2,
      summer: 7.6,
      winter: 8,
      rain: 8.2,
      food: 7.2,
      photography: 8.6,
      relaxation: 7.8,
      value: 7.8,
      uniqueness: 8.8,
    },
    "https://www.bansuisou.org/",
    "09:00–18:00; closed Mondays (open on public holidays; exhibition schedules may change)",
    "None required",
    "About 20 parking spaces; public transport recommended",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City.",
    [
      {
        type: "official",
        url: "https://www.bansuisou.org/information/",
        title: "Bansuiso official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Bansuiso%2CMatsuyama-city%2CJapan.jpg/1280px-Bansuiso%2CMatsuyama-city%2CJapan.jpg",
      license: "CC BY-SA 3.0",
      attribution: "katorisi",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Bansuiso,Matsuyama-city,Japan.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "dogo-onsen-annex-asuka-no-yu",
    "Dogo Onsen Annex Asuka-no-Yu",
    "道後温泉別館 飛鳥乃湯泉",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8517, 132.7866],
    "onsen",
    ["Onsen", "Wellness", "Culture"],
    ["Onsen", "Wellness", "Matsuyama City"],
    "The newest bathhouse of Dogo Onsen, with a striking wooden lattice facade and bathing areas inspired by the Asuka period, offering modern baths beside the historic Honkan.",
    "道後温泉の新別館。飛鳥時代をイメージした木組みの外観が特徴で、歴史ある本館の隣で現代的な入浴体験ができます。",
    ["温泉", "癒し", "文化"],
    ["Onsen", "Wellness", "Culture"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 610, food: 1300, cafe: 590 },
    { train: 105, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    80,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8.2, autumn: 8.4, winter: 8.8 },
    [10, 11, 12, 1, 2, 3],
    "Winter",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.8,
      couple: 9,
      summer: 8.2,
      winter: 9,
      rain: 8.6,
      food: 8,
      photography: 8.8,
      relaxation: 9.2,
      value: 8.2,
      uniqueness: 8.8,
    },
    "https://dogo.jp/onsen/asuka",
    "First-floor bath 06:00–23:00; upper floors 06:00–22:00",
    "Not required for first-floor bath; private rooms reserve in advance",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City.",
    [
      {
        type: "official",
        url: "https://www.city.matsuyama.ehime.jp/kanko/kankoguide/kankomeisho/dogoonsen/info/dougo1126.html",
        title: "Dogo Onsen Annex Asuka-no-Yu — Matsuyama City official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Asuka-no_yu.jpg/1280px-Asuka-no_yu.jpg",
      license: "CC0",
      attribution: "Drivephotographer",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Asuka-no_yu.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "botchan-train-matsuyama",
    "Botchan Train",
    "坊っちゃん列車",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8504, 132.7851],
    null,
    ["Experience", "History", "Culture"],
    ["Experience", "History", "Culture", "Matsuyama City"],
    "A restored steam-era tram from Natsume Soseki's novel Botchan, running on weekends and holidays between Dogo Onsen and central Matsuyama.",
    "夏目漱石の小説『坊っちゃん』に登場する蒸気機関車時代の路面電車を復元した列車。週末・祝日に道後温泉と松山市街を結びます。",
    ["体験", "歴史", "文化"],
    ["Experience", "History", "Culture"],
    [2000, 5000, 9000],
    { transport: 1800, tickets: 1300, food: 1300, cafe: 600 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    50,
    { weekday: 2, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 8, autumn: 8.4, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8.2,
      summer: 8,
      winter: 8,
      rain: 6.6,
      food: 7.4,
      photography: 8.8,
      relaxation: 8,
      value: 7.8,
      uniqueness: 9,
    },
    "https://www.iyotetsu.co.jp/botchan/",
    "Runs on weekends and holidays; no service Dec 30–Jan 3; timetable published by Iyotetsu",
    "Not required (no reservations; capacity 36)",
    "Public transport recommended",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City. Does not run Dec 30–Jan 3.",
    [
      {
        type: "official",
        url: "https://www.iyotetsu.co.jp/botchan/",
        title: "Botchan Train — Iyotetsu official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Botchan-ressha.jpg/1280px-Botchan-ressha.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Daichan",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Botchan-ressha.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "dogo-haikara-dori",
    "Dogo Haikara Dori",
    "道後ハイカラ通り",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8514, 132.7851],
    "street",
    ["Shopping", "Food", "Culture"],
    ["Shopping", "Food", "Culture", "Matsuyama City"],
    "The covered shopping street connecting Dogo Onsen Station to the Honkan, lined with souvenir shops selling Botchan dango, local sweets, and citrus products.",
    "道後温泉駅から本館へ続くアーケード商店街。坊っちゃん団子や郷土菓子、柑橘製品などを扱う土産物店が並びます。",
    ["ショッピング", "グルメ", "文化"],
    ["Shopping", "Food", "Culture"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 0, food: 1400, cafe: 600 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    60,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.2, summer: 7.8, autumn: 8.2, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 7.8,
      couple: 7.8,
      summer: 7.6,
      winter: 7.8,
      rain: 8.2,
      food: 8.6,
      photography: 7.4,
      relaxation: 7.2,
      value: 8,
      uniqueness: 7.4,
    },
    "https://www.dogo.or.jp/experience/dogo-haikara-dori/",
    "Open access (shop hours vary)",
    "None required",
    "Public transport recommended",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City.",
    [
      {
        type: "tourism_board",
        url: "https://www.dogo.or.jp/experience/dogo-haikara-dori/",
        title: "Dogo Haikara Dori — Dogo Onsen official area guide",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/%E9%81%93%E5%BE%8C%E5%95%86%E5%BA%97%E8%A1%97_Dogo_Shopping_Street_-_panoramio.jpg/1280px-%E9%81%93%E5%BE%8C%E5%95%86%E5%BA%97%E8%A1%97_Dogo_Shopping_Street_-_panoramio.jpg",
      license: "CC BY 3.0",
      attribution: "lienyuan lee",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:道後商店街_Dogo_Shopping_Street_-_panoramio.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "yuzuki-castle-ruins-matsuyama",
    "Yuzuki Castle Ruins (Dogo Park)",
    "道後公園（湯築城跡）",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8486, 132.7871],
    "park",
    ["History", "Nature", "Culture"],
    ["History", "Nature", "Culture", "Matsuyama City"],
    "A National Historic Site and city park on the grounds of the Kono clan's medieval Yuzuki Castle, with restored moats, earthworks, samurai residences, and an exhibition hall.",
    "中世に河野氏が居城とした湯築城の跡を整備した国史跡の公園。復元された堀や土塁、武家屋敷、展示館があります。",
    ["歴史", "自然", "文化"],
    ["History", "Nature", "Culture"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 0, food: 1300, cafe: 700 },
    { train: 105, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [4500, 2700, 1800],
    25,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9, summer: 7.6, autumn: 8.6, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 5 },
    {
      overall: 8.2,
      couple: 8,
      summer: 7.4,
      winter: 7.4,
      rain: 6.4,
      food: 7.4,
      photography: 8.2,
      relaxation: 8.6,
      value: 8.6,
      uniqueness: 8.2,
    },
    "https://dogokouen.jp/",
    "Park open anytime; exhibition facility 09:00–17:00; closed Mondays (open on public holidays, closed the following weekday)",
    "None required",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City.",
    [
      {
        type: "official",
        url: "https://dogokouen.jp/",
        title: "Dogo Park (Yuzuki Castle Ruins) official site",
      },
      {
        type: "tourism_board",
        url: "https://en.matsuyama-sightseeing.com/spot/18-2/",
        title: "Dogo-kōen Park — Tourism Matsuyama official listing",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/%E9%81%93%E5%BE%8C%E5%85%AC%E5%9C%92%E3%83%BB%E6%B9%AF%E7%AF%89%E5%9F%8E%E8%B7%A1_%28%E6%88%A6%E5%9B%BD%E6%99%82%E4%BB%A3%E6%B2%B3%E9%87%8E%E6%B0%8F%E3%81%AE%E5%9F%8E%E9%A4%A8%E8%B7%A1%29_-_panoramio.jpg/1280px-%E9%81%93%E5%BE%8C%E5%85%AC%E5%9C%92%E3%83%BB%E6%B9%AF%E7%AF%89%E5%9F%8E%E8%B7%A1_%28%E6%88%A6%E5%9B%BD%E6%99%82%E4%BB%A3%E6%B2%B3%E9%87%8E%E6%B0%8F%E3%81%AE%E5%9F%8E%E9%A4%A8%E8%B7%A1%29_-_panoramio.jpg",
      license: "CC BY 3.0",
      attribution: "Yoshio Kohara",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:道後公園・湯築城跡_(戦国時代河野氏の城館跡)_-_panoramio.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "ehime-art-museum",
    "Ehime Prefectural Museum of Art",
    "愛媛県美術館",
    "Ehime:matsuyama",
    "matsuyama-city",
    [33.8406, 132.7622],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Art", "Matsuyama City"],
    "A prefectural museum in Matsuyama Castle's moat park, presenting Japanese and Western modern art and rotating exhibitions in a central Matsuyama setting.",
    "松山城の堀之内にある県立美術館。近現代の日本・西洋美術や、松山ゆかりの作品をコレクションとして展示しています。",
    ["文化", "博物館", "アート"],
    ["Culture", "Museum", "Art"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 340, food: 1400, cafe: 760 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 3 },
    [3000, 1800, 1200],
    85,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 7.6, autumn: 8.4, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.2,
      couple: 8,
      summer: 7.6,
      winter: 7.8,
      rain: 8.4,
      food: 7.2,
      photography: 7.8,
      relaxation: 7.6,
      value: 7.8,
      uniqueness: 8,
    },
    "https://www.ehime-art.jp/en/guide",
    "09:40–18:00 (last admission 17:30); closed Mondays, except the first Monday of each month is open and the following Tuesday is closed (a holiday Monday closes the following day); closed Dec 29–Jan 3",
    "None required",
    "No parking at the museum; Kencho Nishi parking offers two hours free, with nearby paid lots",
    "Source-backed KAI-31 Shikoku expansion record for Matsuyama City.",
    [
      {
        type: "official",
        url: "https://www.ehime-art.jp/en/guide",
        title: "Ehime Prefectural Museum of Art official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Prefectual_Museum_of_Art1_%28Matuyama_City%29.JPG/1280px-Prefectual_Museum_of_Art1_%28Matuyama_City%29.JPG",
      license: "CC BY 3.0",
      attribution: "Jyo81",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Prefectual_Museum_of_Art1_(Matuyama_City).JPG",
    },
  ),
);

// --- Tokushima City (4) ---
newRecords.push(
  poil(
    "awa-odori-kaikan",
    "Awa Odori Kaikan",
    "阿波おどり会館",
    "Tokushima:tokushima",
    "tokushima-city",
    [34.0702, 134.545],
    "museum",
    ["Culture", "Museum", "Experience"],
    ["Culture", "Museum", "Experience", "Tokushima City"],
    "A downtown hall where visitors can watch professional Awa Odori dance performances year-round and learn the history of the festival, at the foot of Mount Bizan.",
    "徳島市中心部の会館で、一年を通じて阿波おどりの実演を鑑賞でき、踊りの歴史や装束も学べます。眉山のふもとに位置します。",
    ["文化", "博物館", "体験"],
    ["Culture", "Museum", "Experience"],
    [2000, 5000, 9000],
    { transport: 1500, tickets: 1300, food: 1500, cafe: 700 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    80,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8.8, autumn: 8.4, winter: 8 },
    [6, 7, 8, 9, 10, 11],
    "Summer",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.6,
      couple: 8.6,
      summer: 8.8,
      winter: 8,
      rain: 8.6,
      food: 8.2,
      photography: 8.2,
      relaxation: 7.8,
      value: 8,
      uniqueness: 9.2,
    },
    "https://www.awaodori-kaikan.jp/",
    "09:00–20:00; closed Dec 28–Jan 1 and on the 2nd Wednesday of Feb, Jun, Sep, and Dec (next day if a holiday)",
    "Advance booking recommended for performance seats; day and evening schedules vary",
    "Paid parking available in the area",
    "Source-backed KAI-31 Shikoku expansion record for Tokushima City.",
    [
      {
        type: "official",
        url: "https://www.awaodori-kaikan.jp/",
        title: "Awa Odori Kaikan official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Awa-dance_memorial_hall01s3200.jpg/1280px-Awa-dance_memorial_hall01s3200.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Awa-dance_memorial_hall01s3200.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "bizan-ropeway-tokushima",
    "Mount Bizan Ropeway",
    "眉山ロープウェイ",
    "Tokushima:tokushima",
    "tokushima-city",
    [34.0687, 134.5413],
    "viewpoint",
    ["Nature", "Viewpoint", "Experience"],
    ["Nature", "Viewpoint", "Experience", "Tokushima City"],
    "A six-minute cable-car ride from beside the Awa Odori Kaikan to the summit of Mount Bizan, with sweeping views over Tokushima City and the Yoshino River delta.",
    "阿波おどり会館の隣から約6分で眉山山頂へ。徳島市街と吉野川のデルタを見渡す眺望が楽しめます。",
    ["自然", "展望", "体験"],
    ["Nature", "Viewpoint", "Experience"],
    [2000, 5000, 9000],
    { transport: 1800, tickets: 1500, food: 1000, cafe: 700 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3500, 2100, 1400],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 8.6, autumn: 9, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8.6,
      summer: 8.4,
      winter: 8,
      rain: 6.6,
      food: 7.6,
      photography: 9,
      relaxation: 8.4,
      value: 8,
      uniqueness: 8.4,
    },
    "https://www.city.tokushima.tokushima.jp/multilingual/english_portal/tourism_culture/mt_bizan/ropeway.html",
    "09:00–21:00 (Apr–Oct), 09:00–17:30 (Nov–Mar); Jan 1 opens 06:00–17:30",
    "None required",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Tokushima City.",
    [
      {
        type: "official",
        url: "https://www.city.tokushima.tokushima.jp/multilingual/english_portal/tourism_culture/mt_bizan/ropeway.html",
        title: "Awagin Bizan Ropeway — Tokushima City official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/2/23/Bizan01.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Kansai explorer",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Bizan01.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "tokushima-central-park",
    "Tokushima Central Park",
    "徳島中央公園",
    "Tokushima:tokushima",
    "tokushima-city",
    [34.0747, 134.5549],
    "park",
    ["History", "Nature", "Culture"],
    ["History", "Nature", "Culture", "Tokushima City"],
    "A National Historic Site on the grounds of Tokushima Castle, with reconstructed stone walls, the Washinomon gate, a castle museum, and the former Omotegoten garden.",
    "徳島城跡に整備された国史跡の公園。石垣や復元された鷲の門、徳島城博物館、旧表御殿庭園などがあります。",
    ["歴史", "自然", "文化"],
    ["History", "Nature", "Culture"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 50, food: 1300, cafe: 650 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [4000, 2400, 1600],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 7.6, autumn: 8.4, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 5 },
    {
      overall: 8,
      couple: 7.8,
      summer: 7.2,
      winter: 7.2,
      rain: 6.4,
      food: 7.2,
      photography: 8,
      relaxation: 8.4,
      value: 8.6,
      uniqueness: 8,
    },
    "https://www.city.tokushima.tokushima.jp/shisetsu/park/chuo.html",
    "Park open access; former garden 09:00–17:00 (last entry 16:30); museum hours vary",
    "None required",
    "Check local parking guidance",
    "Former garden admission is 50 yen for adults and 30 yen for children; museum admission is separate.",
    [
      {
        type: "official",
        url: "https://www.city.tokushima.tokushima.jp/shisetsu/park/chuo.html",
        title: "Tokushima Central Park — Tokushima City official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Tokushima_Central_Park%2C_Tokushima_Prefecture%3B_April_2017_%2801%29.jpg/1280px-Tokushima_Central_Park%2C_Tokushima_Prefecture%3B_April_2017_%2801%29.jpg",
      license: "CC BY-SA 2.0",
      attribution: "wongwt",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Tokushima_Central_Park,_Tokushima_Prefecture;_April_2017_(01).jpg",
    },
  ),
);

newRecords.push(
  poil(
    "tokushima-modern-art-museum",
    "Tokushima Modern Art Museum",
    "徳島県立近代美術館",
    "Tokushima:tokushima",
    "tokushima-city",
    [34.0398, 134.5267],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Art", "Tokushima City"],
    "A prefectural museum of modern art in Tokushima's cultural forest park, with collection and special exhibitions of Japanese and Western modern art.",
    "文化の森総合公園内にある県立の近代美術館。日本や西洋の近現代美術を収蔵・展示し、企画展も開催しています。",
    ["文化", "博物館", "アート"],
    ["Culture", "Museum", "Art"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 200, food: 1200, cafe: 600 },
    { train: 105, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    85,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 7.6, autumn: 8.2, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8,
      couple: 7.8,
      summer: 7.4,
      winter: 7.6,
      rain: 8.4,
      food: 7,
      photography: 7.6,
      relaxation: 7.6,
      value: 7.8,
      uniqueness: 8,
    },
    "https://art.bunmori.tokushima.jp/info/index_en.html",
    "09:30–17:00 (last admission 16:30); closed Mondays (next day if a holiday), Dec 29–Jan 4, and during exhibition changes",
    "None required",
    "Free parking at the cultural forest park",
    "Source-backed KAI-31 Shikoku expansion record for Tokushima City.",
    [
      {
        type: "official",
        url: "https://art.bunmori.tokushima.jp/info/index_en.html",
        title: "Tokushima Modern Art Museum official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Tokushima_21st_century_cultural_information_center01n3872.jpg/1280px-Tokushima_21st_century_cultural_information_center01n3872.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Tokushima_21st_century_cultural_information_center01n3872.jpg",
    },
  ),
);

// --- Naruto City (5) ---
newRecords.push(
  poil(
    "uzu-no-michi-naruto",
    "Uzu no Michi (Naruto Whirlpool Walkway)",
    "大鳴門橋遊歩道 うずしお道",
    "Tokushima:naruto",
    "naruto-city",
    [34.1728, 134.6084],
    "viewpoint",
    ["Nature", "Viewpoint", "Experience"],
    ["Nature", "Viewpoint", "Experience", "Naruto City"],
    "A 450-meter enclosed walkway inside the Onaruto Bridge, 45 meters above the sea, with glass-floor sections overlooking the Naruto whirlpools.",
    "大鳴門橋の橋桁の中を歩く全長450mの遊歩道。海面から45mの高さで、ガラス床から鳴門の渦潮を見下ろせます。",
    ["自然", "展望", "体験"],
    ["Nature", "Viewpoint", "Experience"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 510, food: 1300, cafe: 690 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    70,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 8.2, autumn: 9, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 4 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 8.4,
      winter: 7.8,
      rain: 6.8,
      food: 7.6,
      photography: 9.2,
      relaxation: 8.2,
      value: 8,
      uniqueness: 9.4,
    },
    "https://www.uzunomichi.jp/lang_en/",
    "09:00–18:00 (Mar–Sep), 09:00–17:00 (Oct–Feb); closed 2nd Monday of Mar/Jun/Sep/Dec",
    "None required",
    "Paid parking at Naruto Park",
    "Source-backed KAI-31 Shikoku expansion record for Naruto City. Whirlpool strength depends on tide; check the tide table before visiting.",
    [
      {
        type: "official",
        url: "https://www.uzunomichi.jp/lang_en/",
        title: "Uzu no Michi official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Oh_Naruto_Bridge_inside.JPG/1280px-Oh_Naruto_Bridge_inside.JPG",
      license: "CC BY-SA 3.0",
      attribution: "TEMPA WATARU",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Oh_Naruto_Bridge_inside.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "uzushio-cruise-naruto",
    "Naruto Whirlpool Cruise",
    "うずしお観潮船",
    "Tokushima:naruto",
    "naruto-city",
    [34.213, 134.61],
    null,
    ["Nature", "Experience", "Viewpoint"],
    ["Nature", "Experience", "Viewpoint", "Naruto City"],
    "Sightseeing boats that approach the Naruto whirlpools directly, offering close views of the tidal maelstroms from the water; departures from Naruto Park.",
    "鳴門の渦潮を間近で見学できる観潮船。鳴門公園の亀浦港から出航し、海面から渦の迫力を体感できます。",
    ["自然", "体験", "展望"],
    ["Nature", "Experience", "Viewpoint"],
    [2500, 6000, 10000],
    { transport: 1800, tickets: 2000, food: 1400, cafe: 800 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    50,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.8, summer: 8.4, autumn: 9, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "high",
    { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 4 },
    {
      overall: 9,
      couple: 9,
      summer: 8.6,
      winter: 7.8,
      rain: 6.2,
      food: 7.8,
      photography: 9.4,
      relaxation: 8,
      value: 7.8,
      uniqueness: 9.6,
    },
    "https://www.uzusio.com/en/geton/",
    "Schedule varies; check the official timetable; weather- and tide-dependent",
    "WONDER NARUTO requires no reservation; AQUA EDDY requires advance reservation",
    "Paid parking at Naruto Park Kameura port",
    "Source-backed KAI-31 Shikoku expansion record for Naruto City. The Aqua Eddy underwater-view boat requires advance reservation.",
    [
      {
        type: "official",
        url: "https://www.uzusio.com/en/geton/",
        title: "Naruto whirlpool sightseeing cruise — official operator site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Whirlpools_fureai_park.JPG/1280px-Whirlpools_fureai_park.JPG",
      license: "CC BY-SA 4.0",
      attribution: "アラツク",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Whirlpools_fureai_park.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "otsuka-museum-of-art-naruto",
    "Otsuka Museum of Art",
    "大塚国際美術館",
    "Tokushima:naruto",
    "naruto-city",
    [34.2326, 134.6375],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Art", "Naruto City"],
    "A museum of life-size ceramic reproductions of famous Western paintings, letting visitors walk through masterworks from the Sistine Chapel ceiling to modern art.",
    "西洋名画を原寸大の陶板で再現した世界唯一の陶板名画美術館。システィーナ礼拝堂の天井画から現代美術まで、原寸の名画を歩いて鑑賞できます。",
    ["文化", "博物館", "アート"],
    ["Culture", "Museum", "Art"],
    [4500, 9000, 15000],
    { transport: 2500, tickets: 3300, food: 2200, cafe: 1000 },
    { train: 115, bus: 125, car: 130 },
    { min: 2, max: 4 },
    [6000, 3500, 2500],
    90,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8.2, autumn: 8.6, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 9, walkingIntensity: 4 },
    {
      overall: 8.8,
      couple: 8.8,
      summer: 8.2,
      winter: 8,
      rain: 9,
      food: 8,
      photography: 8.6,
      relaxation: 8.4,
      value: 7.6,
      uniqueness: 9.6,
    },
    "https://o-museum.or.jp/",
    "09:30–17:00 (ticket sales until 16:00); closed Mondays (next day if a holiday)",
    "None required",
    "Free parking available",
    "Source-backed KAI-31 Shikoku expansion record for Naruto City.",
    [
      {
        type: "official",
        url: "https://o-museum.or.jp/pages/187/",
        title: "Otsuka Museum of Art official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/The_Otsuka_Museum_of_Art01s3200.jpg/1280px-The_Otsuka_Museum_of_Art01s3200.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:The_Otsuka_Museum_of_Art01s3200.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "naruto-german-house",
    "Naruto German House",
    "鳴門市ドイツ館",
    "Tokushima:naruto",
    "naruto-city",
    [34.1647, 134.499],
    "museum",
    ["Culture", "Museum", "History"],
    ["Culture", "Museum", "History", "Naruto City"],
    "A museum on the site of the World War I Bando prisoner-of-war camp, telling the story of German POWs and their role in bringing Beethoven's Ninth and Western culture to Japan.",
    "第一次世界大戦の板東俘虜収容所跡地に建つ博物館。ドイツ兵俘虜が日本に第九や西洋文化を伝えた歴史を紹介しています。",
    ["文化", "博物館", "歴史"],
    ["Culture", "Museum", "History"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 400, food: 1400, cafe: 700 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    75,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 7.8, autumn: 8.2, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.2,
      couple: 7.8,
      summer: 7.6,
      winter: 7.6,
      rain: 8.2,
      food: 7.4,
      photography: 7.6,
      relaxation: 7.4,
      value: 8.2,
      uniqueness: 8.8,
    },
    "https://doitsukan.com/",
    "09:30–17:00 (last admission 16:30); closed the 4th Monday (next day if a holiday) and Dec 28–31",
    "None required",
    "Free parking shared with Roadside Station Dai-san no Sato; about 100 spaces",
    "Admission is 400 yen for adults and 100 yen for children; temporary closures can occur.",
    [
      {
        type: "official",
        url: "https://doitsukan.com/spot.html",
        title: "Naruto German House — official visitor information",
      },
      {
        type: "official",
        url: "https://www.city.naruto.lg.jp/map/info/95/",
        title: "Naruto German House — Naruto City facility map",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/2/27/Naruto_German_House_20131014.jpg",
      license: "CC BY-SA 3.0",
      attribution: "そらみみ",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Naruto_German_House_20131014.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "ryozen-ji-naruto",
    "Ryozen-ji",
    "霊山寺",
    "Tokushima:naruto",
    "naruto-city",
    [34.1594, 134.5027],
    "temple",
    ["History", "Culture", "Temple"],
    ["History", "Culture", "Temple", "Naruto City"],
    "Temple No. 1 of the Shikoku 88-temple pilgrimage, traditionally the starting point of the route, with a Daishido hall and the statue of Kobo Daishi at its entrance.",
    "四国八十八箇所霊場の第1番札所で、遍路の出発点とされる寺院。本堂や大師堂があり、門前には空海の像が立っています。",
    ["歴史", "文化", "寺院"],
    ["History", "Culture", "Temple"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 0, food: 1300, cafe: 700 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    25,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.6, summer: 7.8, autumn: 8.8, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8.2,
      summer: 7.8,
      winter: 7.4,
      rain: 6.8,
      food: 7.4,
      photography: 8.2,
      relaxation: 8.4,
      value: 8.6,
      uniqueness: 8.6,
    },
    "https://naruto-tourism.jp/en/spot/15466",
    "07:00–17:00 daily",
    "None required",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Naruto City (the temple is in Oasa-cho, Naruto City, not Tokushima City).",
    [
      {
        type: "tourism_board",
        url: "https://naruto-tourism.jp/en/spot/15466",
        title: "Ryozenji — Naruto City official travel guide",
      },
      {
        type: "official",
        url: "https://www.ryosenji.jp/",
        title: "Ryozenji official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Gate_of_Ryozenji_Temple_in_Naruto%2C_Tokushima.jpg/1280px-Gate_of_Ryozenji_Temple_in_Naruto%2C_Tokushima.jpg",
      license: "CC BY-SA 4.0",
      attribution: "そらみみ",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Gate_of_Ryozenji_Temple_in_Naruto,_Tokushima.jpg",
    },
  ),
);

// --- Kochi City (6) ---
newRecords.push(
  poil(
    "katsurahama-beach",
    "Katsurahama Beach",
    "桂浜",
    "Kochi:kochi",
    "kochi-city",
    [33.4971, 133.5744],
    "beach",
    ["Nature", "History", "Scenery"],
    ["Nature", "History", "Scenery", "Kochi City"],
    "A Pacific-coast beach of white sand and pines, with a bronze statue of Sakamoto Ryoma gazing out to sea, a small aquarium, and the Ryoma museum nearby.",
    "白砂と松林が続く太平洋の海岸。坂本龍馬像が海を見つめ、近くに水族館や龍馬記念館があります。",
    ["自然", "歴史", "絶景"],
    ["Nature", "History", "Scenery"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 0, food: 1700, cafe: 800 },
    { train: 110, bus: 120, car: 130 },
    { min: 1, max: 2 },
    [5000, 3000, 2000],
    20,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.8, summer: 8.4, autumn: 9, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 5 },
    {
      overall: 8.8,
      couple: 8.8,
      summer: 8.6,
      winter: 8,
      rain: 6.4,
      food: 8,
      photography: 9.2,
      relaxation: 9,
      value: 8.4,
      uniqueness: 8.8,
    },
    "https://www.city.kochi.kochi.jp/kochi-city-travel-guide/katsurahama-beach/",
    "Open access; beach is for sightseeing, not swimming",
    "None required",
    "Paid parking available",
    "Source-backed KAI-31 Shikoku expansion record for Kochi City.",
    [
      {
        type: "tourism_board",
        url: "https://www.city.kochi.kochi.jp/kochi-city-travel-guide/katsurahama-beach/",
        title: "Katsurahama Beach — Kochi City official travel guide",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/0/02/Katsurahama_Beach.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Kotaro",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Katsurahama_Beach.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "hirome-market-kochi",
    "Hirome Ichiba",
    "ひろめ市場",
    "Kochi:kochi",
    "kochi-city",
    [33.5604, 133.5356],
    "market",
    ["Food", "Market", "Culture"],
    ["Food", "Market", "Culture", "Kochi City"],
    "A lively covered food market with dozens of food stalls and open seating, famous for katsuo no tataki and other Kochi specialties, popular day and night.",
    "多数の飲食店と開放的な座席が並ぶ市場。カツオのたたきなど高知名物を気軽に楽しめ、昼夜を問わず賑わいます。",
    ["グルメ", "市場", "文化"],
    ["Food", "Market", "Culture"],
    [1500, 4000, 7000],
    { transport: 1000, tickets: 0, food: 2200, cafe: 800 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    80,
    { weekday: 5, weekend: 8, holiday: 9 },
    { spring: 8.6, summer: 8.6, autumn: 8.6, winter: 8.4 },
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 9, walkingIntensity: 3 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 8.6,
      winter: 8.6,
      rain: 9,
      food: 9.4,
      photography: 8,
      relaxation: 7.8,
      value: 8.8,
      uniqueness: 8.8,
    },
    "https://www.hirome.co.jp/",
    "10:00–23:00 Monday–Saturday; 09:00–23:00 Sunday (individual vendors vary)",
    "None required",
    "Check local parking guidance",
    "Source-backed KAI-31 Shikoku expansion record for Kochi City.",
    [
      {
        type: "official",
        url: "https://www.hirome.co.jp/access.html",
        title: "Hirome Ichiba official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Hirome-Ichiba%2CKochi-city%2CJapan.jpg/1280px-Hirome-Ichiba%2CKochi-city%2CJapan.jpg",
      license: "CC BY-SA 3.0",
      attribution: "katorisi",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hirome-Ichiba,Kochi-city,Japan.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "sakamoto-ryoma-memorial-museum",
    "Sakamoto Ryoma Memorial Museum",
    "高知県立坂本龍馬記念館",
    "Kochi:kochi",
    "kochi-city",
    [33.4964, 133.5719],
    "museum",
    ["History", "Museum", "Culture"],
    ["History", "Museum", "Culture", "Kochi City"],
    "A dramatic concrete museum above Katsurahama Beach devoted to Sakamoto Ryoma, with life-size exhibits and panoramic views of the Pacific.",
    "桂浜の高台にある坂本龍馬の生涯を紹介する博物館。等身大の展示や太平洋を望む眺望が特徴です。",
    ["歴史", "博物館", "文化"],
    ["History", "Museum", "Culture"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 500, food: 1300, cafe: 700 },
    { train: 110, bus: 120, car: 130 },
    { min: 1, max: 3 },
    [4000, 2400, 1600],
    75,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8, autumn: 8.4, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 4 },
    {
      overall: 8.6,
      couple: 8.4,
      summer: 8,
      winter: 7.8,
      rain: 8.4,
      food: 7.6,
      photography: 8.2,
      relaxation: 7.8,
      value: 8.2,
      uniqueness: 8.8,
    },
    "https://ryoma-kinenkan.jp/visit/",
    "09:00–17:00 (enter by about 16:30); no regular closing days",
    "None required",
    "Free on-site parking for 42 cars; bus parking is prioritized by advance reservation; fallback Katsurahama parking is paid",
    "Adult admission is 500 yen outside special exhibitions and 900 yen during special exhibitions; group visits should reserve ahead.",
    [
      {
        type: "official",
        url: "https://ryoma-kinenkan.jp/visit/",
        title: "Sakamoto Ryoma Memorial Museum official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/The_Sakamoto_Ryoma_Memorial_Museum_01.jpg/1280px-The_Sakamoto_Ryoma_Memorial_Museum_01.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Mugu-shisai",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:The_Sakamoto_Ryoma_Memorial_Museum_01.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "chikurin-ji-kochi",
    "Chikurin-ji",
    "竹林寺",
    "Kochi:kochi",
    "kochi-city",
    [33.5465, 133.5767],
    "temple",
    ["History", "Culture", "Temple"],
    ["History", "Culture", "Temple", "Kochi City"],
    "Temple No. 31 of the Shikoku pilgrimage on Mount Godaisan, with a noted scenic garden and treasure hall of Buddhist art.",
    "五台山にある四国八十八箇所第31番札所。名勝の庭園と仏教美術を収めた宝物館で知られます。",
    ["歴史", "文化", "寺院"],
    ["History", "Culture", "Temple"],
    [1500, 4000, 7000],
    { transport: 1200, tickets: 500, food: 1500, cafe: 800 },
    { train: 105, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [3500, 2100, 1400],
    30,
    { weekday: 3, weekend: 4, holiday: 5 },
    { spring: 8.6, summer: 7.8, autumn: 8.8, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8.2,
      summer: 7.8,
      winter: 7.4,
      rain: 7,
      food: 7.6,
      photography: 8.6,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 8.4,
    },
    "https://visitkochijapan.com/en/activities/10056",
    "Grounds 08:00–17:00; garden & treasure hall 08:30–17:00",
    "None required",
    "Check local parking guidance",
    "The main grounds are free; the scenic garden and treasure hall require a small admission fee.",
    [
      {
        type: "tourism_board",
        url: "https://visitkochijapan.com/en/activities/10056",
        title: "Chikurin-ji — Kochi Prefecture official tourism site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Chikurinji_Kochi02s3872.jpg/1280px-Chikurinji_Kochi02s3872.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Chikurinji_Kochi02s3872.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "makino-botanical-garden",
    "Kochi Prefectural Makino Botanical Garden",
    "高知県立牧野植物園",
    "Kochi:kochi",
    "kochi-city",
    [33.5483, 133.5791],
    "garden",
    ["Nature", "Garden", "Culture"],
    ["Nature", "Garden", "Culture", "Kochi City"],
    "A botanical garden honoring the botanist Tomitaro Makino, with thousands of native and cultivated plant species on the slopes of Mount Godaisan.",
    "植物学者・牧野富太郎を記念する植物園。五台山の斜面に数千種の植物が植えられています。",
    ["自然", "庭園", "文化"],
    ["Nature", "Garden", "Culture"],
    [2000, 5000, 9000],
    { transport: 1500, tickets: 850, food: 1500, cafe: 1150 },
    { train: 105, bus: 115, car: 120 },
    { min: 2, max: 4 },
    [6000, 3500, 2500],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9.2, summer: 8.6, autumn: 8.8, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 5 },
    {
      overall: 8.8,
      couple: 8.8,
      summer: 8.4,
      winter: 7.4,
      rain: 7.2,
      food: 7.6,
      photography: 9,
      relaxation: 9,
      value: 8.2,
      uniqueness: 8.8,
    },
    "https://www.makino.or.jp/multilingual/?lang=en",
    "09:00–17:00 (last entry 16:30); maintenance closures vary—check the official calendar",
    "None required",
    "Paid parking available; admission is normally 850 yen but special exhibitions can change the fee",
    "The garden publishes maintenance closures and seasonal exhibition fees; verify the calendar before visiting.",
    [
      {
        type: "official",
        url: "https://www.makino.or.jp/guide/",
        title: "Makino Botanical Garden official visitor information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Kochi_Prefectural_Makino_Botanical_Garden02s5.jpg/1280px-Kochi_Prefectural_Makino_Botanical_Garden02s5.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kochi_Prefectural_Makino_Botanical_Garden02s5.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "harimaya-bridge-kochi",
    "Harimaya Bridge",
    "はりまや橋",
    "Kochi:kochi",
    "kochi-city",
    [33.5596, 133.5423],
    null,
    ["History", "Culture", "Landmark"],
    ["History", "Culture", "Landmark", "Kochi City"],
    "Kochi's most famous landmark, a red bridge at the heart of the city made famous by the Yosakoi-bushi folk song, with a small park where the original river once flowed.",
    "よさこい節の歌で知られる高知のシンボル。市街の中心に赤い橋が架かり、かつての川の流れを再現した公園があります。",
    ["歴史", "文化", "名所"],
    ["History", "Culture", "Landmark"],
    [500, 2000, 4000],
    { transport: 500, tickets: 0, food: 1000, cafe: 500 },
    { train: 100, bus: 115, car: 120 },
    { min: 0.5, max: 1 },
    [2000, 1200, 800],
    40,
    { weekday: 5, weekend: 7, holiday: 8 },
    { spring: 8.2, summer: 7.8, autumn: 8.2, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 3 },
    {
      overall: 7.6,
      couple: 7.4,
      summer: 7.2,
      winter: 7.2,
      rain: 7.4,
      food: 7.6,
      photography: 7.8,
      relaxation: 7,
      value: 8,
      uniqueness: 7.8,
    },
    "https://www.city.kochi.kochi.jp/site/kanko/harimayabashi.html",
    "Open access",
    "None required",
    "Public transport recommended",
    "Source-backed KAI-31 Shikoku expansion record for Kochi City.",
    [
      {
        type: "tourism_board",
        url: "https://www.city.kochi.kochi.jp/site/kanko/harimayabashi.html",
        title: "Harimaya Bridge — Kochi City official tourism page",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Kochi_Harimaya-bashi_Bridge.jpeg/1280px-Kochi_Harimaya-bashi_Bridge.jpeg",
      license: "Public domain",
      attribution: "Nnh",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kochi_Harimaya-bashi_Bridge.jpeg",
    },
  ),
);

// --- Marugame City (2) ---
newRecords.push(
  poil(
    "nakazu-banshoen-marugame",
    "Nakazu Banshoen",
    "中津万象園",
    "Kagawa:marugame",
    "marugame-city",
    [34.2855, 133.7682],
    "garden",
    ["Nature", "Garden", "History"],
    ["Nature", "Garden", "History", "Marugame City"],
    "A daimyo garden built in 1688 for the Kyogoku clan, with a large pond and islands, plus painting, uchiwa, and ceramics exhibits.",
    "1688年に京極氏が築いた大名庭園。大きな池と島々が配され、絵画館・うちわの里・陶器館が併設されています。",
    ["自然", "庭園", "歴史"],
    ["Nature", "Garden", "History"],
    [2000, 5000, 9000],
    { transport: 1500, tickets: 1200, food: 1500, cafe: 800 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [5000, 3000, 2000],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9, summer: 7.8, autumn: 8.8, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 5 },
    {
      overall: 8.4,
      couple: 8.4,
      summer: 7.8,
      winter: 7.6,
      rain: 7,
      food: 7.8,
      photography: 8.6,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 8.4,
    },
    "https://www.city.marugame.lg.jp/page/3065.html",
    "09:30–17:00; closed Wednesdays",
    "None required",
    "Parking available; the city listing links to the garden's official website",
    "Garden plus painting-hall admission is 1,200 yen for adults and 500 yen for children; the official site has a certificate problem, so the secure city listing is the primary website link.",
    [
      {
        type: "official",
        url: "https://www.city.marugame.lg.jp/page/3065.html",
        title:
          "Nakazu Banshoen / Marugame Museum of Art — Marugame City official site",
      },
      {
        type: "official",
        url: "http://www.bansyouen.com/",
        title: "Nakazu Banshoen official website",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Nakatsu-bansho-en_Marugame_Kagawa_pref01n4350.jpg/1280px-Nakatsu-bansho-en_Marugame_Kagawa_pref01n4350.jpg",
      license: "CC BY 2.5",
      attribution: "663highland",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Nakatsu-bansho-en_Marugame_Kagawa_pref01n4350.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "marugame-uchiwa-museum",
    "Marugame Uchiwa Museum",
    "丸亀うちわミュージアム",
    "Kagawa:marugame",
    "marugame-city",
    [34.2855, 133.7693],
    "museum",
    ["Culture", "Museum", "Shopping"],
    ["Culture", "Museum", "Shopping", "Marugame City"],
    "A museum of Marugame's handmade bamboo fans, one of the city's traditional crafts, with workshops where visitors can make their own uchiwa.",
    "丸亀の伝統工芸・うちわづくりを紹介するミュージアム。手作りうちわの体験教室も開催されています。",
    ["文化", "博物館", "ショッピング"],
    ["Culture", "Museum", "Shopping"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 0, food: 1000, cafe: 1000 },
    { train: 100, bus: 115, car: 120 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    70,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 7.8, autumn: 8.2, winter: 7.8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8,
      couple: 7.8,
      summer: 7.6,
      winter: 7.8,
      rain: 8.4,
      food: 7.4,
      photography: 7.8,
      relaxation: 7.4,
      value: 8,
      uniqueness: 8.4,
    },
    "https://marugameuchiwa.jp/museum",
    "09:30–17:00 (last entry 16:30); closed Wednesdays (open on public holidays, closed the following day); closed over New Year",
    "Museum admission is free; fan-making experience has a separate fee—check current availability",
    "15 parking spaces; large buses should contact the museum in advance",
    "Source-backed KAI-31 Shikoku expansion record for Marugame City.",
    [
      {
        type: "tourism_board",
        url: "https://www.come-marugame.jp/en/tourist-information/post-596/",
        title: "Marugame Uchiwa Museum — Marugame City official tourism portal",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Uchiwa_Museum01.jpg/1280px-Uchiwa_Museum01.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Toto-tarou",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Uchiwa_Museum01.jpg",
    },
  ),
);

// --- Miyoshi City (3; Iya Valley record is re-parented below) ---
newRecords.push(
  poil(
    "oboke-koboke-gorge",
    "Oboke and Koboke Gorges",
    "大歩危・小歩危",
    "Tokushima:miyoshi",
    "miyoshi-city",
    [33.8867, 133.7606],
    "waterfall",
    ["Nature", "Scenery", "Experience"],
    ["Nature", "Scenery", "Experience", "Miyoshi City"],
    "Dramatic granite gorges carved by the Yoshino River, best seen from the sightseeing boats that run through the rapids of Oboke.",
    "吉野川が削った花崗岩の大峡谷。大歩危の急流を観光船で下りながら迫力ある景観を楽しめます。",
    ["自然", "絶景", "体験"],
    ["Nature", "Scenery", "Experience"],
    [2500, 6000, 10000],
    { transport: 2000, tickets: 1500, food: 1500, cafe: 1000 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [4000, 2400, 1600],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 8.6, autumn: 9.2, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "high",
    { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 5 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 8.4,
      winter: 7.2,
      rain: 6.2,
      food: 7.8,
      photography: 9.2,
      relaxation: 8.6,
      value: 8,
      uniqueness: 9.2,
    },
    "https://discovertokushima.net/en/spots/obokeandkobokegorges/",
    "Sightseeing boat 09:00–17:00 (last departure 16:30); open year-round except strong winds or bad weather",
    "Check current operation before travel; weather can suspend the boat",
    "Paid parking near the boat dock",
    "Adult sightseeing-boat fare is 1,500 yen; children aged 3 through elementary school are 750 yen.",
    [
      {
        type: "tourism_board",
        url: "https://discovertokushima.net/en/spots/obokeandkobokegorges/",
        title: "Oboke and Koboke Gorges — Tokushima Tourism official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Oboke_gorge_pleasure_boat_2106_August_13.B.jpg/1280px-Oboke_gorge_pleasure_boat_2106_August_13.B.jpg",
      license: "CC BY-SA 4.0",
      attribution: "さかおり",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Oboke_gorge_pleasure_boat_2106_August_13.B.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "ochiai-folk-village",
    "Ochiai Folk Village",
    "落合集落",
    "Tokushima:miyoshi",
    "miyoshi-city",
    [33.8803, 133.9357],
    null,
    ["History", "Culture", "Scenery"],
    ["History", "Culture", "Scenery", "Miyoshi City"],
    "A terraced village in the Iya valley designated as an Important Preservation District, where steep stone terraces and thatched roofs cascade down the mountainside.",
    "祖谷渓の山中にある重要伝統的建造物群保存地区。石垣と茅葺き屋根の家々が急斜面に重なる棚田の山村です。",
    ["歴史", "文化", "絶景"],
    ["History", "Culture", "Scenery"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 0, food: 1500, cafe: 1000 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 3 },
    [4500, 2700, 1800],
    20,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8.8, summer: 8, autumn: 9.4, winter: 7.2 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "high",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 7 },
    {
      overall: 8.8,
      couple: 8.8,
      summer: 8,
      winter: 7.2,
      rain: 6,
      food: 7.6,
      photography: 9.4,
      relaxation: 9,
      value: 8.4,
      uniqueness: 9.4,
    },
    "https://miyoshi-tourism.jp/en/spot/119/",
    "Village paths are freely viewable; Nagaoka House 09:00–16:00 and closed Wednesdays and January–February",
    "None required",
    "Limited roadside parking; drive carefully",
    "Source-backed KAI-31 Shikoku expansion record for Miyoshi City.",
    [
      {
        type: "tourism_board",
        url: "https://miyoshi-tourism.jp/en/spot/119/",
        title: "Ochiai Village — Miyoshi City official tourism site",
      },
      {
        type: "tourism_board",
        url: "https://miyoshi-tourism.jp/en/spot/23994/",
        title: "Nagaoka-ke Historic House — Miyoshi City official tourism site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/A_mountainside_village%2C_built_on_terraces_%286551524129%29.jpg/1280px-A_mountainside_village%2C_built_on_terraces_%286551524129%29.jpg",
      license: "CC BY-SA 2.0",
      attribution: "KimonBerlin",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:A_mountainside_village,_built_on_terraces_(6551524129).jpg",
    },
  ),
);

newRecords.push(
  poil(
    "mount-tsurugi-miyoshi",
    "Mount Tsurugi",
    "剣山",
    "Tokushima:miyoshi",
    "miyoshi-city",
    [33.8536, 134.0942],
    "mountain",
    ["Nature", "Viewpoint", "Scenery"],
    ["Nature", "Viewpoint", "Scenery", "Miyoshi City"],
    "Shikoku's second-highest mountain, a gently sloping peak with alpine plant fields, reached via a sightseeing lift from the Minokoshi trailhead.",
    "四国第二の高峰。なだらかな山容と高山植物の群落で知られ、見ノ越登山口から観光リフトを利用できます。",
    ["自然", "展望", "絶景"],
    ["Nature", "Viewpoint", "Scenery"],
    [2500, 6000, 10000],
    { transport: 2000, tickets: 2300, food: 1000, cafe: 700 },
    { train: 115, bus: 125, car: 130 },
    { min: 3, max: 5 },
    [8000, 4800, 3200],
    5,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8.4, summer: 8.8, autumn: 8.6, winter: 5.4 },
    [6, 7, 8, 9, 10],
    "Summer",
    "high",
    { heatTolerance: 6, rainFriendly: 3, walkingIntensity: 7 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 9,
      winter: 5,
      rain: 5.6,
      food: 7.2,
      photography: 9.2,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 9,
    },
    "https://www.rinya.maff.go.jp/e/national_forest/recreation_forest/tsurugisan.html",
    "Lift normally operates mid-April–Nov 30, 09:00–16:30 (08:00 in August); weather and seasonal trail conditions can change access",
    "None required",
    "Paid parking at Minokoshi trailhead",
    "Source-backed KAI-31 Shikoku expansion record for Miyoshi City.",
    [
      {
        type: "government",
        url: "https://www.rinya.maff.go.jp/e/national_forest/recreation_forest/tsurugisan.html",
        title:
          "Tsurugisan Recreation Forest — Forestry Agency official listing",
      },
      {
        type: "official",
        url: "https://turugirift.com/",
        title: "Mt. Tsurugi sightseeing lift official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Mt.Tsurugisan.jpg/1280px-Mt.Tsurugisan.jpg",
      license: "Public domain",
      attribution: "As6673",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mt.Tsurugisan.jpg",
    },
  ),
);

// --- Uwajima City (3; Uwajima Castle is re-parented below) ---
newRecords.push(
  poil(
    "uwajima-date-museum",
    "Uwajima City Date Museum",
    "宇和島市立伊達博物館",
    "Ehime:uwajima",
    "uwajima-city",
    [33.2159, 132.5626],
    "museum",
    ["History", "Museum", "Culture"],
    ["History", "Museum", "Culture", "Uwajima City"],
    "A museum of the Date clan who ruled the Uwajima domain, displaying armor, swords, and documents from the feudal era.",
    "宇和島藩を治めた伊達家ゆかりの武具や刀剣、古文書などを展示する博物館です。",
    ["歴史", "博物館", "文化"],
    ["History", "Museum", "Culture"],
    [1500, 4000, 7000],
    { transport: 1500, tickets: 500, food: 1300, cafe: 700 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    80,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 7.8, autumn: 8.4, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    {
      overall: 8.2,
      couple: 7.8,
      summer: 7.6,
      winter: 7.6,
      rain: 8.2,
      food: 7.4,
      photography: 7.8,
      relaxation: 7.4,
      value: 8.2,
      uniqueness: 8.4,
    },
    "https://www.city.uwajima.ehime.jp/site/datehaku-top/datehaku-riyou.html",
    "09:00–17:00 (last admission 16:30); closed Tuesdays and Dec 29–Jan 3; exhibition-change closures may apply",
    "None required",
    "Parking for about 15 cars and four buses is available; check current access guidance",
    "Adult admission is 500 yen; university and senior admission is 400 yen, and high-school students and younger are free.",
    [
      {
        type: "official",
        url: "https://www.city.uwajima.ehime.jp/site/datehaku-top/datehaku-riyou.html",
        title: "Uwajima City Date Museum — Uwajima City official site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Uwajima_city_historical_museum.jpg/1280px-Uwajima_city_historical_museum.jpg",
      license: "CC BY-SA 3.0",
      attribution: "As6022014",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Uwajima_city_historical_museum.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "warei-taisha-shrine",
    "Warei Taisha",
    "和霊神社",
    "Ehime:uwajima",
    "uwajima-city",
    [33.2297, 132.5653],
    "shrine",
    ["History", "Culture", "Shrine"],
    ["History", "Culture", "Shrine", "Uwajima City"],
    "A major shrine in southern Ehime dedicated to Yamabe Seibei Kinyori (山家清兵衛公頼), whose annual Warei festival includes portable shrines and Ushi-oni floats on July 23–24.",
    "南予地方の総鎮守で、山家清兵衛公頼を祀る神社。和霊大祭は7月23・24日に行われ、神輿や牛鬼が登場します。",
    ["歴史", "文化", "神社"],
    ["History", "Culture", "Shrine"],
    [1000, 3000, 6000],
    { transport: 1000, tickets: 0, food: 1300, cafe: 700 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 8, autumn: 8.8, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8.2,
      summer: 8,
      winter: 7.4,
      rain: 6.8,
      food: 7.6,
      photography: 8.4,
      relaxation: 8.2,
      value: 8.4,
      uniqueness: 8.8,
    },
    "https://ehime-jinjacho.jp/jinja/?p=444",
    "Shrine grounds open daily; the main Warei festival is July 23–24",
    "None required",
    "Parking for about 60 cars is listed by the Ehime Shrine Association",
    "The Ehime Shrine Association identifies Yamabe Seibei Kinyori as the enshrined deity and dates the main festival July 23–24.",
    [
      {
        type: "official",
        url: "https://ehime-jinjacho.jp/jinja/?p=444",
        title: "Warei Taisha — Ehime Shrine Association listing",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Warei_Jinja_03.JPG/1280px-Warei_Jinja_03.JPG",
      license: "CC BY-SA 3.0",
      attribution: "Reggaeman",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Warei_Jinja_03.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "tenshaen-garden-uwajima",
    "Tenshaen Garden",
    "天赦園",
    "Ehime:uwajima",
    "uwajima-city",
    [33.2236, 132.5684],
    "garden",
    ["Nature", "Garden", "History"],
    ["Nature", "Garden", "History", "Uwajima City"],
    "A strolling garden established in 1866 for Uwajima's Date Munetada, centered on a pond with plum trees and a two-story teahouse.",
    "1866年に宇和島藩第7代藩主・伊達宗紀（むねただ）が築いた回遊式庭園。池を中心に梅や茶亭が配されています。",
    ["自然", "庭園", "歴史"],
    ["Nature", "Garden", "History"],
    [1500, 4000, 7000],
    { transport: 1200, tickets: 500, food: 1500, cafe: 800 },
    { train: 115, bus: 125, car: 130 },
    { min: 1, max: 2 },
    [4500, 2700, 1800],
    20,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8.8, summer: 7.8, autumn: 8.6, winter: 8 },
    [2, 3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8.4,
      summer: 7.8,
      winter: 8,
      rain: 7,
      food: 7.6,
      photography: 8.8,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 8.6,
    },
    "https://www.city.uwajima.ehime.jp/site/datehaku-top/datehaku-riyou.html",
    "08:30–16:30 (to 17:00 Apr–Jun); closed Mondays from the 2nd Monday of Dec through Feb and Dec 28–Jan 1",
    "None required",
    "Limited on-site parking; check the official access guidance",
    "Adult admission is 500 yen; the official garden information says cash only and lists seasonal Monday and year-end closures.",
    [
      {
        type: "official",
        url: "https://www.city.uwajima.ehime.jp/site/datehaku-top/datehaku-riyou.html",
        title: "Tenshaen — Uwajima City official date-site information",
      },
      {
        type: "official",
        url: "http://uwajima-date.sblo.jp/category/1129912-1.html",
        title: "Tenshaen — Date Museum official garden information",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Tenshaen.jpg/1280px-Tenshaen.jpg",
      license: "Public domain",
      attribution: "As6673",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Tenshaen.jpg",
    },
  ),
);

// --- New municipal hubs ---
newRecords.push(
  hubRecord(
    "miyoshi-city",
    "Miyoshi City",
    "三好市",
    "Tokushima:miyoshi",
    [34.0263, 133.8075],
    ["City", "Nature", "History"],
    ["Miyoshi City", "Iya Valley", "Nature"],
    "A mountain city in western Tokushima encompassing the deep Iya Valley, the Oboke and Koboke gorges of the Yoshino River, and the trails of Mount Tsurugi.",
    "徳島県西部の山間都市。深い祖谷渓、吉野川の大歩危・小歩危峡、剣山の登山道などを擁します。",
    ["Iya Valley", "Oboke & Koboke Gorges", "Mount Tsurugi"],
    ["祖谷渓", "大歩危・小歩危", "剣山"],
    [
      "iya-valley-tokushima",
      "oboke-koboke-gorge",
      "ochiai-folk-village",
      "mount-tsurugi-miyoshi",
    ],
    ["tokushima-city", "naruto-city"],
    [7000, 14000, 22000],
    { transport: 4000, tickets: 3000, food: 5000, cafe: 2000 },
    { train: 115, bus: 125, car: 130 },
    {
      overall: 8.4,
      couple: 8.4,
      summer: 8.2,
      winter: 6.8,
      rain: 5.8,
      food: 7.6,
      photography: 9.2,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 9.4,
    },
    { min: 8, max: 14 },
    "Mountain roads and gorges require careful driving; check seasonal closures.",
    [
      {
        type: "tourism_board",
        url: "https://miyoshi-tourism.jp/en/",
        title: "Miyoshi City official tourism site",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Iya_Valley_01.jpg/1280px-Iya_Valley_01.jpg",
      license: "CC BY 2.0",
      attribution: "na0905",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Iya_Valley_01.jpg",
    },
  ),
);

newRecords.push(
  hubRecord(
    "uwajima-city",
    "Uwajima City",
    "宇和島市",
    "Ehime:uwajima",
    [33.2235, 132.56],
    ["City", "History", "Culture"],
    ["Uwajima City", "Castle", "Date Clan"],
    "A castle town in southern Ehime ruled by the Date clan, known for Uwajima Castle, its bullfighting festivals, and a distinctive regional food culture.",
    "愛媛県南部の城下町。伊達家が治めた宇和島城を中心に、闘牛の祭りや独自の食文化で知られます。",
    ["Uwajima Castle", "Date Museum", "Regional Culture"],
    ["宇和島城", "伊達博物館", "郷土文化"],
    [
      "uwajima-castle",
      "uwajima-date-museum",
      "warei-taisha-shrine",
      "tenshaen-garden-uwajima",
    ],
    ["matsuyama-city"],
    [6000, 12000, 20000],
    { transport: 3500, tickets: 2500, food: 4500, cafe: 1500 },
    { train: 115, bus: 125, car: 130 },
    {
      overall: 8.2,
      couple: 8,
      summer: 7.6,
      winter: 7.2,
      rain: 6.4,
      food: 8.2,
      photography: 8.2,
      relaxation: 7.8,
      value: 8.2,
      uniqueness: 8.6,
    },
    { min: 8, max: 14 },
    "Municipal hub created in KAI-31 to give Uwajima Castle a correct home.",
    [
      {
        type: "tourism_board",
        url: "https://www.uwajima.org/",
        title: "Uwajima City official tourism guide",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Uwajima-jo.JPG/1280px-Uwajima-jo.JPG",
      license: "Public domain",
      attribution: "Vickerman625 (English Wikipedia)",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Uwajima-jo.JPG",
    },
  ),
);

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

// Prettier-format the index exactly like scripts/catalog/generate-outputs.ts
// formats the generated outputs, so a second run produces byte-identical
// output and the migration passes `format:check`.
async function formatIndex(content: string): Promise<string> {
  const config = (await resolveConfig(process.cwd())) ?? {};
  return format(content, { ...config, parser: "json" });
}

let added = 0;
let modified = 0;
for (const record of newRecords) {
  const existing = byId.get(record.id);
  if (!existing) {
    index.push(record);
    byId.set(record.id, record);
    added += 1;
  } else if (JSON.stringify(existing) !== JSON.stringify(record)) {
    const indexPosition = index.findIndex((d) => d.id === record.id);
    if (indexPosition < 0)
      throw new Error(`record index position missing: ${record.id}`);
    index[indexPosition] = record;
    byId.set(record.id, record);
    modified += 1;
    console.log(`  updated ${record.id}: regenerated audited KAI-31 record`);
  }
}

// Containment corrections (idempotent: apply only when the current value differs).
function patch(
  id: string,
  fn: (d: Destination) => void,
  description: string,
): void {
  const d = byId.get(id);
  if (!d) throw new Error(`patch target missing: ${id}`);
  const before = JSON.stringify(d);
  fn(d);
  if (JSON.stringify(d) !== before) {
    modified += 1;
    console.log(`  corrected ${id}: ${description}`);
  }
}

patch(
  "teshima-island-kagawa",
  (d) => {
    d.municipalityId = "Kagawa:tonosho";
    d.relationships = {
      gatewayHubId: "takamatsu-city",
    };
  },
  "island is in Tonosho Town; gateway access via Takamatsu",
);

patch(
  "ryugado-cave-kochi",
  (d) => {
    d.municipalityId = "Kochi:kami";
    d.relationships = {
      gatewayHubId: "kochi-city",
    };
  },
  "cave is in Kami City; gateway access via Kochi",
);

patch(
  "iya-valley-tokushima",
  (d) => {
    d.municipalityId = "Tokushima:miyoshi";
    d.relationships = {
      parentDestinationId: "miyoshi-city",
      featuredDestinationIds: [],
      nearbyDestinationIds: [],
    };
  },
  "Iya Valley is in Miyoshi City; contained under new miyoshi-city hub",
);

patch(
  "uwajima-castle",
  (d) => {
    d.municipalityId = "Ehime:uwajima";
    d.relationships = {
      parentDestinationId: "uwajima-city",
      featuredDestinationIds: [],
      nearbyDestinationIds: [],
    };
  },
  "castle is in Uwajima City; contained under new uwajima-city hub",
);

// Remove the cross-municipality featured reference from Matsuyama City.
patch(
  "matsuyama-city",
  (d) => {
    d.relationships = {
      ...(d.relationships ?? {}),
      featuredDestinationIds: (
        d.relationships?.featuredDestinationIds ?? []
      ).filter((id) => id !== "uwajima-castle"),
    };
  },
  "uwajima-castle is in Uwajima City, not Matsuyama; removed from featured",
);

// Hub-quality pass: each legacy Shikoku hub features exactly its own
// same-municipality children (hand-verified containment). New hubs already
// carry full child featured lists; legacy hubs had empty or stale lists.
const HUB_FEATURED: Record<string, string[]> = {
  "takamatsu-city": [
    "ritsurin-garden",
    "takamatsu-castle-tamamo",
    "yashima-takamatsu",
    "shikoku-mura",
    "takamatsu-art-museum",
  ],
  "matsuyama-city": [
    "matsuyama-castle-ehime",
    "dogo-onsen-ehime",
    "ishite-ji-ehime",
    "bansuiso-matsuyama",
    "dogo-onsen-annex-asuka-no-yu",
    "botchan-train-matsuyama",
    "dogo-haikara-dori",
    "yuzuki-castle-ruins-matsuyama",
    "ehime-art-museum",
  ],
  "tokushima-city": [
    "awa-odori-kaikan",
    "bizan-ropeway-tokushima",
    "tokushima-central-park",
    "tokushima-modern-art-museum",
  ],
  "naruto-city": [
    "uzu-no-michi-naruto",
    "uzushio-cruise-naruto",
    "otsuka-museum-of-art-naruto",
    "naruto-german-house",
    "ryozen-ji-naruto",
  ],
  "kochi-city": [
    "kochi-castle",
    "katsurahama-beach",
    "hirome-market-kochi",
    "sakamoto-ryoma-memorial-museum",
    "chikurin-ji-kochi",
    "makino-botanical-garden",
    "harimaya-bridge-kochi",
  ],
  "marugame-city": [
    "marugame-castle",
    "nakazu-banshoen-marugame",
    "marugame-uchiwa-museum",
  ],
};
for (const [hubId, featured] of Object.entries(HUB_FEATURED)) {
  patch(
    hubId,
    (d) => {
      d.relationships = {
        ...(d.relationships ?? {}),
        featuredDestinationIds: featured,
      };
    },
    `featured list set to ${featured.length} same-municipality children`,
  );
}

fs.writeFileSync(
  INDEX_PATH,
  await formatIndex(JSON.stringify(index, null, 2) + "\n"),
);
console.log(
  `KAI-31: added ${added} records, corrected ${modified} existing records.`,
);
