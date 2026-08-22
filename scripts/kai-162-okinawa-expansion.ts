/**
 * KAI-162 — verified modern Okinawa attraction coverage.
 *
 * Adds one canonical record for each independently ticketed attraction. The
 * script is intentionally idempotent: it appends missing IDs, rejects
 * conflicting existing IDs or obvious name/coordinate duplicates, and leaves
 * the canonical catalogue untouched on a second run.
 *
 * Usage: tsx scripts/kai-162-okinawa-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type {
  Destination,
  SourceReference,
} from "../src/shared/types/destination";

const INDEX_PATH = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const REVIEW_DATE = "2026-08-22";

type DestinationWithLocation = Destination & {
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
};

const source = (
  type: SourceReference["type"],
  url: string,
  title: string,
): SourceReference => ({
  type,
  url,
  title,
  accessedAt: REVIEW_DATE,
});

const jungliaHome = "https://junglia.jp/en";
const jungliaHomeJa = "https://junglia.jp/";
const jungliaAccess = "https://www.junglia.jp/en/access";
const jungliaGetReady = "https://www.junglia.jp/en/get-ready";
const jungliaBus = "https://www.tokyobus.jp/okinawa/one-city-bus05/";
const jungliaHours = "https://www.junglia.jp/en/opening-hours?section=shows";
const jungliaQuickVisit =
  "https://junglia.jp/en/ticket/furatto-ticket?section=more-attractions";
const jungliaCoordinateSource =
  "https://www.city.nago.okinawa.jp/machidukuri/2023072800017/file_contents/20250602_siryou10-1.pdf";
const jungliaTourism = "https://www.okinawastory.jp/spot/600022159";
const jungliaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Junglia_Okinawa_seen_from_Mount_Yae_202512.jpg/1920px-Junglia_Okinawa_seen_from_Mount_Yae_202512.jpg";

const dmmAccess = "https://kariyushi-aquarium.com/access/";
const dmmHours = "https://kariyushi-aquarium.com/opening-hours/";
const dmmFloor = "https://kariyushi-aquarium.com/floor/";
const dmmTicket =
  "https://book.kariyushi-aquarium.com/top/products/dd39bc1a-167a-5434-8222-f74d0b2fa84e?lng=ja-JP";
const dmmRoyalPlan =
  "https://book.kariyushi-aquarium.com/top/products/e41fb6bc-8e49-544e-8187-71b73c676d23?lng=ja-JP";
const dmmImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/DMM_Kariyushi_Aquarium_202006.jpg/1920px-DMM_Kariyushi_Aquarium_202006.jpg";

const modelSeason = {
  spring: 7,
  summer: 6,
  autumn: 7,
  winter: 7,
};

const modelSeasonMetadata = {
  method: "model" as const,
  modelVersion: "season-model-v1",
  confidence: "low" as const,
  basis: "indoorPercent/kind; year-round marker; calibration gap documented",
};

const modelSeasonSource = (): SourceReference => ({
  type: "calculated",
  url: "catalogue-model://kai-89",
  title:
    "season-model-v1; indoorPercent/kind; year-round marker; calibration gap documented",
  accessedAt: "2026-08-14",
});

const unknownBudget = {
  method: "unknown" as const,
  modelVersion: "budget-model-v1",
  confidence: "unknown" as const,
  basis:
    "Current admission and access costs are volatile or origin-dependent; no numeric budget is published here.",
};

const unknownCrowd = {
  method: "unknown" as const,
  modelVersion: "crowd-model-v1",
  confidence: "unknown" as const,
  basis:
    "No stable crowd vector was verified; neutralized rather than inferred from attraction type.",
};

const manualComfort = (basis: string) => ({
  method: "manual" as const,
  confidence: "medium" as const,
  basis,
});

const manualDuration = (basis: string) => ({
  method: "manual" as const,
  confidence: "medium" as const,
  basis,
});

const manualWalking = (basis: string) => ({
  method: "manual" as const,
  unit: "minutes" as const,
  confidence: "medium" as const,
  basis,
});

const junglia: DestinationWithLocation = {
  id: "junglia-okinawa",
  officialWebsite: jungliaHome,
  officialWebsiteRequirement: "required",
  name: "JUNGLIA OKINAWA",
  nameJa: "ジャングリア沖縄",
  aliases: ["JUNGLIA"],
  municipalityId: "Okinawa:nakijin",
  prefecture: "Okinawa",
  region: "Okinawa",
  kind: "theme_park",
  role: "standalone",
  placeType: "destination",
  importance: "major",
  coordinates: { lat: 26.6417419, lng: 127.9739612 },
  location: {
    latitude: 26.6417419,
    longitude: 127.9739612,
    address:
      "553-1 Goyayama, Nakijin Village, Kunigami District, Okinawa Prefecture 905-0413",
  },
  categories: ["Theme Park", "Family", "Nature", "Adventure"],
  tags: ["Theme Park", "Family", "Nature", "Adventure", "Okinawa"],
  description:
    "A large theme park in Nakijin's Yambaru area combining outdoor nature-adventure experiences with live entertainment, food, and a scenic spa.",
  highlights: [
    "Nature-adventure attractions in the Yambaru area",
    "Live entertainment and food in one independently ticketed park",
    "A northern Okinawa outing that pairs with Nago, Kouri, or Churaumi",
  ],
  content: {
    en: {
      name: "JUNGLIA OKINAWA",
      description:
        "A large theme park in Nakijin's Yambaru area combining outdoor nature-adventure experiences with live entertainment, food, and a scenic spa.",
      highlights: [
        "Nature-adventure attractions in the Yambaru area",
        "Live entertainment and food in one independently ticketed park",
        "A northern Okinawa outing that pairs with Nago, Kouri, or Churaumi",
      ],
      reservation:
        "Tickets are product and date dependent. Check the official site; some attractions use reservation-pass rules.",
      parking:
        "On-site parking is available; check the official access guidance for current terms.",
      openingHours:
        "Operating hours and attraction availability vary by date and conditions; check the official calendar.",
      notes:
        "Junglia is in Nakijin, not Nago. No rail reaches the park. Naha-origin visitors should plan around the long northern-Okinawa transfer; current direct-bus evidence is kept in the origin-aware transport registry and schedules may be date-dependent.",
    },
    ja: {
      name: "ジャングリア沖縄",
      description:
        "やんばるの自然が広がる今帰仁村にある大型テーマパーク。自然を生かしたアドベンチャー、エンターテインメント、飲食、スパを一つの施設で楽しめます。",
      highlights: [
        "やんばるの自然を舞台にしたアドベンチャー体験",
        "ショーや飲食も含む一つの大型テーマパーク",
        "名護・古宇利島・美ら海水族館と組み合わせやすい北部沖縄の行き先",
      ],
      reservation:
        "チケットは商品・日付により条件が異なります。公式サイトをご確認ください。一部アトラクションは整理券等の対象です。",
      parking:
        "駐車場あり。料金・利用条件は来園前に公式アクセス案内をご確認ください。",
      openingHours:
        "営業時間やアトラクションの運営状況は日付・天候等により変わるため、公式カレンダーをご確認ください。",
      notes:
        "所在地は名護市ではなく今帰仁村です。園内へ鉄道は乗り入れていません。那覇発は北部までの移動を含む日帰り計画として検討してください。現在確認できる直通バス情報は出発地対応の交通レジストリで扱い、運行日は最新の公式案内をご確認ください。",
    },
  },
  transportOptions: {},
  transportZoneId: "okinawa-main",
  localAccessModes: ["bus", "car", "my_car"],
  localAccessUnestimated: true,
  transportMetadata: {
    method: "source-verified",
    confidence: "high",
    basis:
      "Official access pages verify bus and private-vehicle modes; current direct bus products are represented in the origin-aware registry, while date-specific schedules and car door-to-door time remain unestimated.",
  },
  recommendedVisitHours: { min: 3, max: 7 },
  durationMetadata: manualDuration(
    "Conservative 3–7 hour editorial window derived from the official approximately 3-hour Quick Visit product and the official 1Day sample itinerary.",
  ),
  walkingMetadata: {
    method: "unknown",
    confidence: "unknown",
    basis:
      "No authoritative on-site walking distance or defensible walking model was verified; intentionally left unknown.",
  },
  indoorPercent: 35,
  comfort: { heatTolerance: 4, rainFriendly: 3 },
  comfortMetadata: manualComfort(
    "Outdoor theme-park editorial fit assessment; attraction availability and conditions vary. No numeric walking estimate is asserted.",
  ),
  weatherDependence: "high",
  ratings: {
    overall: 8.5,
    couple: 7.5,
    summer: 8.5,
    winter: 7.5,
    rain: 4,
    food: 7,
    photography: 8.5,
    relaxation: 6,
    value: 6.5,
    uniqueness: 9,
    family: 9,
    nature: 8,
    walkability: 5,
  },
  ratingsSchemaVersion: 2,
  ratingMetadata: {
    rubricVersion: 2,
    method: "manual",
    confidence: "medium",
  },
  seasonMetadata: {
    method: "unknown",
    confidence: "unknown",
    basis:
      "The attraction is primarily outdoor and weather-dependent; no defensible four-season score model was verified from current authoritative material.",
  },
  budgetMetadata: unknownBudget,
  crowdMetadata: unknownCrowd,
  scoreMetadata: {
    state: "estimated",
    value: 7.2,
    rubricVersion: "kai-89-overall-v2",
    confidence: "low",
    coverage: 0.9,
    provenance: {
      sourceClass: "model",
      basis:
        '{"rubric":"kai-89-overall-v2","coverage":0.9,"significance":"major","recognition":"no-designation","richness":"categories-4","accessibility":"absent"}',
    },
    noteKey: "destination.scoreEstimatedNote",
  },
  reservation:
    "Tickets are product and date dependent; check the official site. Some attractions use reservation-pass rules.",
  parking:
    "On-site parking is available; check the official access guidance for current terms.",
  businessHours:
    "Operating hours and attraction availability vary by date and conditions; check the official calendar.",
  notes:
    "Junglia is in Nakijin, not Nago. No rail reaches the park. Naha-origin visitors should plan around the long northern-Okinawa transfer; current direct-bus evidence is kept in the origin-aware transport registry and schedules may be date-dependent.",
  notesJa:
    "所在地は名護市ではなく今帰仁村です。園内へ鉄道は乗り入れていません。那覇発は北部までの移動を含む日帰り計画として検討してください。現在確認できる直通バス情報は出発地対応の交通レジストリで扱い、運行日は最新の公式案内をご確認ください。",
  heroImage: jungliaImage,
  imageMetadata: {
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "Kugel~commonswiki, CC BY-SA 4.0, via Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Junglia_Okinawa_seen_from_Mount_Yae_202512.jpg",
  },
  status: "verified",
  travelEstimate: { confidence: "beta" },
  collections: [],
  relationships: {
    nearbyDestinationIds: ["nago-city", "yambaru", "churaumi-aquarium-motobu"],
    relatedDestinationIds: ["nakijin-castle-ruins-motobu"],
  },
  editorial: {
    lifecycle: "approved",
    freshness: "current",
    checkedAt: REVIEW_DATE,
    reviewedAt: REVIEW_DATE,
    reviewedBy: "Meguruto editorial",
    changeSummary: "Added current, source-verified Junglia Okinawa coverage.",
    sources: [
      source("official", jungliaHome, "JUNGLIA OKINAWA official English site"),
      source(
        "official",
        jungliaHomeJa,
        "ジャングリア沖縄 official Japanese site",
      ),
      source("official", jungliaAccess, "JUNGLIA official access page"),
      source(
        "official",
        jungliaGetReady,
        "JUNGLIA official preparation and access guidance",
      ),
      source("official", jungliaBus, "Tokyo Bus current JUNGLIA EXPRESS route"),
      source(
        "official",
        jungliaHours,
        "JUNGLIA official hours and attraction calendar",
      ),
      source(
        "official",
        jungliaQuickVisit,
        "JUNGLIA official quick-visit guidance",
      ),
      source(
        "tourism_board",
        jungliaTourism,
        "Okinawa Convention & Visitors Bureau listing",
      ),
    ],
    fieldSources: {
      name: [source("official", jungliaHome, "Official English name")],
      nameJa: [source("official", jungliaHomeJa, "Official Japanese name")],
      status: [
        source("official", jungliaHome, "Current operator site and notices"),
      ],
      municipalityId: [
        source("official", jungliaHome, "Official launch/location information"),
      ],
      location: [
        source("official", jungliaAccess, "Official access/location guidance"),
      ],
      coordinates: [
        source(
          "government",
          jungliaCoordinateSource,
          "Nago City official transport document",
        ),
      ],
      localAccessModes: [
        source("official", jungliaAccess, "Official access page"),
        source("official", jungliaGetReady, "Official access guidance"),
      ],
      relationships: [
        source(
          "manual",
          jungliaTourism,
          "Northern Okinawa itinerary relationship review",
        ),
      ],
      seasonMetadata: [
        source(
          "manual",
          jungliaAccess,
          "Season vector intentionally omitted; current access guidance does not support a defensible structured season model",
        ),
      ],
    },
    changes: [
      {
        changedAt: REVIEW_DATE,
        changedBy: "Meguruto editorial",
        summary:
          "Added one canonical attraction record after current operator, government, and tourism-board verification.",
        method: "manual",
      },
    ],
  },
  addedAt: REVIEW_DATE,
};

const dmm: DestinationWithLocation = {
  id: "dmm-kariyushi-aquarium",
  officialWebsite: dmmAccess,
  officialWebsiteRequirement: "required",
  name: "DMM KARIYUSHI AQUARIUM",
  nameJa: "DMMかりゆし水族館",
  aliases: ["かりゆし水族館"],
  municipalityId: "Okinawa:tomigusuku",
  prefecture: "Okinawa",
  region: "Okinawa",
  kind: "aquarium",
  role: "standalone",
  placeType: "destination",
  importance: "notable",
  coordinates: { lat: 26.1577349, lng: 127.6509771 },
  location: {
    latitude: 26.1577349,
    longitude: 127.6509771,
    address: "3-35 Toyosaki, Tomigusuku City, Okinawa Prefecture 901-0225",
  },
  categories: ["Aquarium", "Family", "Indoor", "Leisure"],
  tags: ["Aquarium", "Family", "Indoor", "Rainy Day", "Okinawa"],
  description:
    "An indoor aquarium and immersive marine-life attraction in Toyosaki, Tomigusuku, near Naha Airport.",
  highlights: [
    "Okinawan marine life and tropical aquarium exhibits",
    "Indoor light-and-sound presentations and animal encounters",
    "A compact, rain-friendly option for a southern Okinawa itinerary",
  ],
  content: {
    en: {
      name: "DMM KARIYUSHI AQUARIUM",
      description:
        "An indoor aquarium and immersive marine-life attraction in Toyosaki, Tomigusuku, near Naha Airport.",
      highlights: [
        "Okinawan marine life and tropical aquarium exhibits",
        "Indoor light-and-sound presentations and animal encounters",
        "A compact, rain-friendly option for a southern Okinawa itinerary",
      ],
      reservation:
        "Online and same-day individual tickets are available; check current date-specific terms. Group reservations follow separate rules.",
      parking:
        "Free parking is available at iias Okinawa Toyosaki; check current operator access guidance.",
      openingHours:
        "Opening hours vary by date; check the official calendar before visiting.",
      notes:
        "This is in Tomigusuku, not Naha, and is distinct from Churaumi Aquarium. Official access lists bus and car options; Naha-area bus evidence is represented in the origin-aware registry, while rail and car door-to-door time are not asserted.",
    },
    ja: {
      name: "DMMかりゆし水族館",
      description:
        "那覇空港に近い豊見城市豊崎にある、沖縄の海をテーマにした屋内型の水族館・没入型エンターテインメント施設です。",
      highlights: [
        "沖縄の海の生き物と熱帯の水槽展示",
        "光と音の演出や動物とのふれあい体験",
        "雨天時にも組み込みやすい南部沖縄の短時間スポット",
      ],
      reservation:
        "個人はオンライン購入・当日購入に対応しています。日付指定等の条件は最新の公式案内をご確認ください。団体予約は別の扱いです。",
      parking:
        "イーアス沖縄豊崎の無料駐車場を利用できます。最新の利用条件は公式アクセス案内をご確認ください。",
      openingHours:
        "営業時間は日付により異なるため、来館前に公式カレンダーをご確認ください。",
      notes:
        "所在地は那覇市ではなく豊見城市で、美ら海水族館とは別の施設です。公式アクセスではバス・車が案内されています。那覇周辺のバス情報は出発地対応の交通レジストリで扱い、鉄道や車のドアツードア所要時間は示していません。",
    },
  },
  transportOptions: {},
  transportZoneId: "okinawa-main",
  localAccessModes: ["bus", "car", "my_car"],
  localAccessUnestimated: true,
  transportMetadata: {
    method: "source-verified",
    confidence: "high",
    basis:
      "Official access page verifies bus and private-vehicle modes; current Naha-area bus products are represented in the origin-aware registry, while fare and car door-to-door time remain unestimated.",
  },
  recommendedVisitHours: { min: 1, max: 3 },
  durationMetadata: manualDuration(
    "Conservative 1–3 hour editorial window derived from the official standard-ticket and Royal Plan product guidance.",
  ),
  walkingMin: 60,
  walkingMetadata: manualWalking(
    "Conservative indoor walking estimate for the aquarium visit; no route distance is presented as an official fact.",
  ),
  indoorPercent: 90,
  comfort: { heatTolerance: 8, rainFriendly: 10, walkingIntensity: 5 },
  comfortMetadata: {
    method: "model",
    modelVersion: "comfort-model-v1",
    confidence: "low",
    basis: "derived from indoorPercent=90, kind='aquarium', walkingMin=60",
  },
  weatherDependence: "low",
  ratings: {
    overall: 8,
    couple: 7,
    summer: 7,
    winter: 8,
    rain: 9,
    food: 5,
    photography: 8,
    relaxation: 6,
    value: 7,
    uniqueness: 8,
    family: 9,
    accessibility: 8,
    walkability: 8,
  },
  ratingsSchemaVersion: 2,
  ratingMetadata: {
    rubricVersion: 2,
    method: "manual",
    confidence: "medium",
  },
  season: modelSeason,
  bestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  bestSeason: "All Year (indoor)",
  seasonMetadata: modelSeasonMetadata,
  budgetMetadata: unknownBudget,
  crowdMetadata: unknownCrowd,
  scoreMetadata: {
    state: "estimated",
    value: 6.2,
    rubricVersion: "kai-89-overall-v2",
    confidence: "low",
    coverage: 0.9,
    provenance: {
      sourceClass: "model",
      basis:
        '{"rubric":"kai-89-overall-v2","coverage":0.9,"significance":"notable","recognition":"no-designation","richness":"categories-4","accessibility":"absent"}',
    },
    noteKey: "destination.scoreEstimatedNote",
  },
  reservation:
    "Online and same-day individual tickets are available; check current date-specific terms. Group reservations follow separate rules.",
  parking:
    "Free parking is available at iias Okinawa Toyosaki; check current operator access guidance.",
  businessHours:
    "Opening hours vary by date; check the official calendar before visiting.",
  notes:
    "This is in Tomigusuku, not Naha, and is distinct from Churaumi Aquarium. Official access lists bus and car options; Naha-area bus evidence is represented in the origin-aware registry, while rail and car door-to-door time are not asserted.",
  notesJa:
    "所在地は那覇市ではなく豊見城市で、美ら海水族館とは別の施設です。公式アクセスではバス・車が案内されています。那覇周辺のバス情報は出発地対応の交通レジストリで扱い、鉄道や車のドアツードア所要時間は示していません。",
  heroImage: dmmImage,
  imageMetadata: {
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "Kugel~commonswiki, CC BY-SA 4.0, via Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:DMM_Kariyushi_Aquarium_202006.jpg",
  },
  status: "verified",
  travelEstimate: { confidence: "beta" },
  collections: [],
  relationships: {
    nearbyDestinationIds: ["naha-city"],
    relatedDestinationIds: ["churaumi-aquarium-motobu"],
  },
  editorial: {
    lifecycle: "approved",
    freshness: "current",
    checkedAt: REVIEW_DATE,
    reviewedAt: REVIEW_DATE,
    reviewedBy: "Meguruto editorial",
    changeSummary:
      "Added current, source-verified DMM Kariyushi Aquarium coverage.",
    sources: [
      source(
        "official",
        dmmAccess,
        "DMM KARIYUSHI AQUARIUM official access page",
      ),
      source(
        "official",
        dmmHours,
        "DMM KARIYUSHI AQUARIUM official hours calendar",
      ),
      source(
        "official",
        dmmFloor,
        "DMM KARIYUSHI AQUARIUM official floor guide",
      ),
      source(
        "official",
        dmmTicket,
        "DMM KARIYUSHI AQUARIUM standard ticket product",
      ),
      source(
        "official",
        dmmRoyalPlan,
        "DMM KARIYUSHI AQUARIUM Royal Plan product",
      ),
    ],
    fieldSources: {
      name: [source("official", dmmAccess, "Official Japanese facility name")],
      nameJa: [
        source("official", dmmAccess, "Official Japanese facility name"),
      ],
      status: [source("official", dmmHours, "Current operator hours calendar")],
      municipalityId: [
        source("official", dmmAccess, "Official access/location guidance"),
      ],
      location: [
        source("official", dmmAccess, "Official access/location guidance"),
      ],
      coordinates: [source("official", dmmAccess, "Official access map link")],
      localAccessModes: [source("official", dmmAccess, "Official access page")],
      relationships: [
        source(
          "manual",
          dmmAccess,
          "South Okinawa itinerary relationship review",
        ),
      ],
      comfort: [
        source(
          "calculated",
          "catalogue-model://kai-89",
          "comfort-model-v1; derived from indoorPercent=90, kind='aquarium', walkingMin=60",
        ),
      ],
      season: [modelSeasonSource()],
      bestMonths: [modelSeasonSource()],
    },
    changes: [
      {
        changedAt: REVIEW_DATE,
        changedBy: "Meguruto editorial",
        summary:
          "Added one canonical attraction record after current operator verification.",
        method: "manual",
      },
    ],
  },
  addedAt: REVIEW_DATE,
};

const additions = [junglia, dmm] as const;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function assertNoDuplicateCandidate(
  candidate: DestinationWithLocation,
  catalog: Destination[],
) {
  const candidateNames = [
    candidate.name,
    candidate.nameJa,
    ...(candidate.aliases ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalize);
  const existing = catalog.find((destination) => {
    const names = [
      destination.name,
      destination.nameJa,
      ...(destination.aliases ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalize);
    return candidateNames.some((name) => names.includes(name));
  });
  if (existing) {
    throw new Error(
      `${candidate.id}: normalized name duplicates ${existing.id}`,
    );
  }

  const exactCoordinate = catalog.find(
    (destination) =>
      destination.coordinates?.lat === candidate.coordinates?.lat &&
      destination.coordinates?.lng === candidate.coordinates?.lng,
  );
  if (exactCoordinate) {
    throw new Error(
      `${candidate.id}: coordinates duplicate ${exactCoordinate.id}`,
    );
  }
}

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const addedIds: string[] = [];
const updatedIds: string[] = [];

for (const candidate of additions) {
  const existing = byId.get(candidate.id);
  if (existing) {
    if (
      existing.name !== candidate.name ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(
        `${candidate.id}: existing record conflicts with KAI-162 evidence`,
      );
    }
    const existingIndex = catalog.findIndex(
      (destination) => destination.id === candidate.id,
    );
    if (JSON.stringify(existing) !== JSON.stringify(candidate)) {
      // These IDs are owned by this expansion script. Replacing an existing
      // copy keeps the correction pass deterministic and removes stale fields
      // from the original KAI-162 records (notably Junglia season/walking
      // metadata) without touching unrelated catalogue records.
      catalog[existingIndex] = candidate;
      byId.set(candidate.id, candidate);
      updatedIds.push(candidate.id);
    }
    continue;
  }

  assertNoDuplicateCandidate(candidate, catalog);
  for (const relatedId of [
    ...(candidate.relationships?.nearbyDestinationIds ?? []),
    ...(candidate.relationships?.relatedDestinationIds ?? []),
  ]) {
    if (!byId.has(relatedId)) {
      throw new Error(
        `${candidate.id}: relationship target ${relatedId} is missing`,
      );
    }
  }

  catalog.push(candidate);
  byId.set(candidate.id, candidate);
  addedIds.push(candidate.id);
}

if (addedIds.length > 0 || updatedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || updatedIds.length > 0
    ? `KAI-162: added ${addedIds.length} and updated ${updatedIds.length} Okinawa destinations${[...addedIds, ...updatedIds].length > 0 ? ` (${[...addedIds, ...updatedIds].join(", ")})` : ""}`
    : "KAI-162: catalogue already contains the verified records; no changes made",
);
