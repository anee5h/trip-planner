/**
 * KAI-157 — verified Fukuoka bay + west-coast destination depth.
 *
 * Adds only independently recommendable Fukuoka destinations, checked against
 * current operator/government/tourism sources on the implementation date.
 * Marine World Uminonakamichi is ONE canonical bay/anchor (Uminonakamichi
 * Seaside Park is nearby context, not a competing card); Nokonoshima Island
 * Park models ferry + island-bus access (no fake train route); Sakurai
 * Futamigaura is ONE canonical Itoshima coastal anchor (standalone, no new
 * hub); Yanagawa is ONE canonical canal-cruise outing. teamLab Forest is
 * enriched under the existing fukuoka-paypay-dome record (venue-within-venue,
 * no new card). The script is idempotent.
 *
 * Transport honesty: ferry semantics are explicit in localAccessModes and
 * notes; legacy static minutes are display fallback only (low confidence).
 *
 * Usage: tsx scripts/kai-157-fukuoka-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
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
  location?: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
};

type FukuokaSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases?: string[];
  officialWebsite: string;
  officialWebsiteRequirement: "required" | "recommended";
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  /** "standalone" for deliberate roots without a hub parent. */
  role?: "poi" | "standalone";
  municipalityId: string;
  coordinates?: { lat: number; lng: number };
  location?: DestinationWithLocation["location"];
  categories: string[];
  tags: string[];
  description: string;
  descriptionJa: string;
  highlights: string[];
  highlightsJa: string[];
  notes: string;
  notesJa: string;
  localAccessModes: TransportMode[];
  sources: SourceReference[];
  image: NonNullable<Destination["imageMetadata"]> & { heroImage: string };
  duration?: {
    hours: { min: number; max: number };
    source: SourceReference;
    confidence: "high" | "medium";
    basis: string;
  };
  reservation?: string;
  parking?: string;
  parentDestinationId?: string;
  nearbyDestinationIds?: string[];
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

const unknownBudget = {
  method: "unknown" as const,
  modelVersion: "budget-model-v1",
  confidence: "unknown" as const,
  basis:
    "Current admission, food, and access costs are volatile or destination-dependent; no numeric budget is published here.",
};

const unknownCrowd = {
  method: "unknown" as const,
  modelVersion: "crowd-model-v1",
  confidence: "unknown" as const,
  basis:
    "No stable crowd vector was verified; neutralized rather than inferred from attraction type.",
};

const unknownSeason = {
  method: "unknown" as const,
  modelVersion: "season-model-v1",
  confidence: "unknown" as const,
  basis:
    "Official sources provide local hours, route, or event context but not a defensible four-season suitability score; unknown is preserved.",
};

const image = (
  heroImage: string,
  sourceUrl: string,
  license: string,
  attribution: string,
): FukuokaSpec["image"] => ({
  heroImage,
  source: "Wikimedia Commons",
  license,
  attribution,
  sourceUrl,
});

const durationMethodologySource = source(
  "calculated",
  "https://github.com/aneesh-patil/trip-planner/blob/main/scripts/models/duration-model-v1.ts",
  "Meguruto KAI-89 duration-model-v1 kind-band estimate",
);

const neutralRatings: Destination["ratings"] = {
  overall: 5,
  couple: 5,
  summer: 5,
  winter: 5,
  rain: 5,
  food: 5,
  photography: 5,
  relaxation: 5,
  value: 5,
  uniqueness: 5,
};

// ── Source URLs (checked 2026-08-22) ────────────────────────────────────────
const marineHome = "https://marine-world.jp/for-foreigners/en/";
const marineAccess = "https://marine-world.jp/access/";
const marineImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Marine_World_Uminonakamichi_2.JPG/1280px-Marine_World_Uminonakamichi_2.JPG";

const nokoHome = "https://nokonoshima.com/en";
const nokoAccess = "https://nokonoshima.com/en/access/";
const nokoImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Nokonoshima_Island%2C_enkei.jpg/1280px-Nokonoshima_Island%2C_enkei.jpg";

const itoshimaHome = "https://www.crossroadfukuoka.jp/en/spot/12456";
const itoshimaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Futamigaura_Beach_from_observation_deck_of_Futamigaura_Cemetery_1.JPG/1280px-Futamigaura_Beach_from_observation_deck_of_Futamigaura_Cemetery_1.JPG";

const yanagawaHome = "https://www.yanagawakk.co.jp/";
const yanagawaTourism = "https://www.yanagawa-net.com/ohori/";
const yanagawaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Yanagawa-kawakudari.jpg/1280px-Yanagawa-kawakudari.jpg";

const teamlabHome = "https://www.teamlab.art/e/forest/";

// ── makeRecord ──────────────────────────────────────────────────────────────
const makeRecord = (spec: FukuokaSpec): DestinationWithLocation => {
  const primarySource = spec.sources[0];
  const accessSource =
    spec.sources.find((candidate) =>
      /access|route|transport|walk/i.test(candidate.title),
    ) ?? primarySource;
  const fieldSources: Record<string, SourceReference[]> = {
    name: [primarySource],
    nameJa: [primarySource],
    status: [primarySource],
    municipalityId: [primarySource],
    localAccessModes: [accessSource],
    relationships: [primarySource],
  };
  if (spec.location) fieldSources.location = [primarySource];
  if (spec.coordinates) {
    fieldSources.coordinates = [
      spec.sources.find((candidate) =>
        /map|location|access/i.test(candidate.title),
      ) ?? primarySource,
    ];
  }
  if (spec.duration && spec.duration.source.type === "calculated")
    fieldSources.recommendedVisitHours = [spec.duration.source];

  const contentEn = {
    name: spec.name,
    description: spec.description,
    highlights: spec.highlights,
    notes: spec.notes,
    reservation:
      spec.reservation ??
      "Check the official visitor guidance for current reservation and admission rules.",
    parking:
      spec.parking ??
      "Use public transport where possible; check the official visitor guidance for current parking conditions.",
    openingHours:
      "Visitor hours and closures vary by date; check the official visitor guidance before visiting.",
  };
  const contentJa = {
    name: spec.nameJa,
    description: spec.descriptionJa,
    highlights: spec.highlightsJa,
    notes: spec.notesJa,
    reservation:
      "予約・入場条件は変更される場合があるため、訪問前に公式案内をご確認ください。",
    parking:
      "可能な限り公共交通機関をご利用ください。駐車場の条件は公式案内をご確認ください。",
    openingHours:
      "開館時間・休館日は変更される場合があるため、訪問前に公式案内をご確認ください。",
  };

  return {
    id: spec.id,
    officialWebsite: spec.officialWebsite,
    officialWebsiteRequirement: spec.officialWebsiteRequirement,
    name: spec.name,
    nameJa: spec.nameJa,
    aliases: spec.aliases,
    municipalityId: spec.municipalityId,
    prefecture: "Fukuoka",
    region: "Kyushu",
    kind: spec.kind,
    role: spec.role ?? "poi",
    placeType: "destination",
    importance: spec.importance,
    coordinates: spec.coordinates,
    location: spec.location,
    categories: spec.categories,
    tags: spec.tags,
    description: spec.description,
    highlights: spec.highlights,
    content: { en: contentEn, ja: contentJa },
    heroImage: spec.image.heroImage,
    imageMetadata: {
      source: spec.image.source,
      license: spec.image.license,
      attribution: spec.image.attribution,
      sourceUrl: spec.image.sourceUrl,
    },
    transportOptions: {},
    localAccessModes: spec.localAccessModes,
    localAccessUnestimated: true,
    transportMetadata: {
      method: "unestimated",
      confidence: "unknown",
      basis:
        "No origin-aware corridor duration is modeled for this destination. Local access exists (localAccessModes) but a complete origin-to-destination duration is not verified; recommendation availability comes only from canonical origin-aware routes (ferry infrastructure for island access), never from static transportOptions numbers.",
    },
    recommendedVisitHours: spec.duration?.hours,
    durationMetadata: spec.duration
      ? {
          method: "manual",
          confidence: spec.duration.confidence,
          basis: spec.duration.basis,
        }
      : undefined,
    ratings: neutralRatings,
    ratingsSchemaVersion: 2,
    ratingMetadata: {
      rubricVersion: 2,
      method: "manual",
      confidence: "low",
    },
    seasonMetadata: unknownSeason,
    budgetMetadata: unknownBudget,
    crowdMetadata: unknownCrowd,
    reservation:
      spec.reservation ??
      "Check the official visitor guidance for current reservation and admission rules.",
    parking:
      spec.parking ??
      "Use public transport where possible; check the official visitor guidance for current parking conditions.",
    notes: spec.notes,
    notesJa: spec.notesJa,
    status: "verified",
    travelEstimate: { confidence: "beta" },
    collections: [],
    relationships: {
      ...(spec.parentDestinationId
        ? { parentDestinationId: spec.parentDestinationId }
        : {}),
      ...(spec.nearbyDestinationIds
        ? { nearbyDestinationIds: spec.nearbyDestinationIds }
        : {}),
    },
    editorial: {
      lifecycle: "approved",
      freshness: "current",
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      reviewedBy: "Meguruto editorial",
      changeSummary:
        "Added current, source-verified Fukuoka bay and west-coast destination depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Fukuoka destination after current operator, government, and tourism-board verification.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

// ── Candidate records ───────────────────────────────────────────────────────
const reviewedCandidates: DestinationWithLocation[] = [
  makeRecord({
    id: "marine-world-uminonakamichi",
    name: "Marine World Uminonakamichi",
    nameJa: "マリンワールド海の中道",
    aliases: ["Marine World Uminonakamichi", "Uminonakamichi Aquarium"],
    officialWebsite: marineHome,
    officialWebsiteRequirement: "required",
    kind: "aquarium",
    importance: "major",
    municipalityId: "Fukuoka:fukuoka",
    coordinates: { lat: 33.6611, lng: 130.3658 },
    location: {
      address: "18-28 Saitozaki, Higashi-ku, Fukuoka, Fukuoka 811-0321",
      latitude: 33.6611,
      longitude: 130.3658,
    },
    categories: ["Aquarium", "Family", "Nature", "Entertainment"],
    tags: ["Aquarium", "Family", "Nature", "Entertainment", "Fukuoka"],
    description:
      "A large aquarium on the Uminonakamichi peninsula with dolphin and sea lion shows, a Kuroshio tank, and the adjacent Uminonakamichi Seaside Park for a full bay day out.",
    descriptionJa:
      "海の中道の半島にある大型水族館。イルカ・アシカショーや黒潮大水槽があり、隣接する国営海の中道海浜公園と合わせて一日の海辺の行き先になります。",
    highlights: [
      "Dolphin and sea lion shows in a bayfront setting",
      "Kuroshio current tank and diverse marine life",
      "Pairs with Uminonakamichi Seaside Park for a full bay outing",
    ],
    highlightsJa: [
      "海辺のイルカ・アシカショー",
      "黒潮大水槽の海の生き物",
      "海の中道海浜公園と合わせた一日の行き先",
    ],
    notes:
      "About 5 minutes on foot from JR Umi no Nakamichi Station (Kashi Line). The adjacent Uminonakamichi Seaside Park is a separate national park; the aquarium is the canonical bay anchor.",
    notesJa:
      "JR海の中道駅（香椎線）から徒歩約5分です。隣接する国営海の中道海浜公園は別施設で、本レコードは水族館を中心とした海辺の定番スポットとして扱います。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        marineHome,
        "Marine World Uminonakamichi official English site",
      ),
      source(
        "official",
        marineAccess,
        "Marine World Uminonakamichi official access page",
      ),
    ],
    image: image(
      marineImage,
      "https://commons.wikimedia.org/wiki/File:Marine_World_Uminonakamichi_2.JPG",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 2, max: 4 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Aquarium visit band; park extension extends the day.",
    },
    reservation:
      "Advance digital tickets are available; check the official site for current hours.",
    parking:
      "On-site parking is available; check the official access guidance for current terms.",
  }),
  makeRecord({
    id: "nokonoshima-island-park",
    name: "Nokonoshima Island Park",
    nameJa: "能古島アイランドパーク",
    aliases: ["Noko Island Park", "Nokonoshima"],
    officialWebsite: nokoHome,
    officialWebsiteRequirement: "required",
    kind: "park",
    importance: "notable",
    role: "standalone",
    municipalityId: "Fukuoka:fukuoka",
    coordinates: { lat: 33.63, lng: 130.29 },
    location: {
      address: "1624 Nokonoshima, Nishi-ku, Fukuoka, Fukuoka 819-0012",
      latitude: 33.63,
      longitude: 130.29,
    },
    categories: ["Park", "Nature", "Family", "Island"],
    tags: ["Park", "Nature", "Family", "Island", "Fukuoka"],
    description:
      "A flower park on Nokonoshima Island, reached by a 10-minute ferry from Meinohama, with seasonal blooms (cosmos, narcissus, cherry blossom) and views across Hakata Bay.",
    descriptionJa:
      "能古島にある花の公園。姪浜からフェリーで約10分。コスモスや水仙、桜など季節の花と博多湾の絶景を楽しめます。",
    highlights: [
      "Seasonal flower fields (cosmos, narcissus, cherry blossom)",
      "A 10-minute ferry ride from Meinohama to the island",
      "Hakata Bay views from the island",
    ],
    highlightsJa: [
      "コスモス・水仙・桜などの季節の花",
      "姪浜からフェリーで約10分",
      "博多湾を望む島の絶景",
    ],
    notes:
      "Access is by FERRY from Meinohama Ferry Terminal (~10 min) to Nokonoshima, then a Nishitetsu bus (~13 min) to the park. There is NO direct train to the island. Last ferry times matter for a day trip.",
    notesJa:
      "アクセスは姪浜フェリー乗り場からフェリー（約10分）で能古島へ渡り、さらに西鉄バスで約13分で公園に到着します。島へ直通の鉄道はありません。日帰りの場合は最終便の時間に注意が必要です。",
    localAccessModes: ["bus"],
    sources: [
      source(
        "official",
        nokoHome,
        "Nokonoshima Island Park official English site",
      ),
      source(
        "official",
        nokoAccess,
        "Nokonoshima Island Park official access page",
      ),
    ],
    image: image(
      nokoImage,
      "https://commons.wikimedia.org/wiki/File:Nokonoshima_Island,_enkei.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 2, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Time spent at the island park itself (flower fields, walks, views); the ferry crossing and island bus are transport, not visit time.",
    },
    reservation:
      "Check current ferry schedules and park hours; no advance park admission is modeled.",
    parking:
      "Use the ferry; island parking is limited. Check the official access guidance.",
  }),
  makeRecord({
    id: "sakurai-futamigaura-itoshima",
    name: "Sakurai Futamigaura",
    nameJa: "桜井二見ヶ浦",
    aliases: ["Futamigaura Itoshima", "Sakurai Futamigaura White Torii"],
    officialWebsite: itoshimaHome,
    officialWebsiteRequirement: "recommended",
    kind: "nature",
    importance: "notable",
    role: "standalone",
    municipalityId: "Fukuoka:itoshima",
    coordinates: { lat: 33.5564, lng: 130.1739 },
    location: {
      address: "Shimasakurai, Itoshima, Fukuoka 819-1304",
      latitude: 33.5564,
      longitude: 130.1739,
    },
    categories: ["Nature", "Viewpoint", "Coast", "Photography"],
    tags: ["Nature", "Viewpoint", "Coast", "Photography", "Itoshima"],
    description:
      "A celebrated west-coast viewpoint in Itoshima where a white torii gate stands before the Meoto Iwa (married-couple rocks) in the sea, popular for sunsets and photography.",
    descriptionJa:
      "糸島の西海岸にある景勝地。海に立つ白い鳥居と夫婦岩が有名で、夕日や写真スポットとして人気があります。",
    highlights: [
      "The white torii gate and Meoto Iwa offshore",
      "A sunset and photography spot on the Itoshima coast",
      "A canonical west-coast anchor (not a catch-all district)",
    ],
    highlightsJa: [
      "海に立つ白い鳥居と夫婦岩",
      "糸島海岸の夕日・写真スポット",
      "西海岸の代表的なスポット",
    ],
    notes:
      "About 15 minutes by car from Chikuzen-Maebaru Station; public bus service is limited. Car suitability is noted honestly — no invented bus/train minutes are claimed beyond what is verifiable.",
    notesJa:
      "筑前前原駅から車で約15分。路線バスは本数が限られています。公共交通の所要時間は検証できる範囲でのみ記載し、車での訪問を正直に案内しています。",
    localAccessModes: ["car", "my_car"],
    transportOptions: {},
    sources: [
      source(
        "tourism_board",
        itoshimaHome,
        "VISIT FUKUOKA Sakurai Futamigaura listing",
      ),
      source(
        "official",
        "https://www.crossroadfukuoka.jp/",
        "VISIT FUKUOKA official tourism site",
      ),
    ],
    image: image(
      itoshimaImage,
      "https://commons.wikimedia.org/wiki/File:Futamigaura_Beach_from_observation_deck_of_Futamigaura_Cemetery_1.JPG",
      "CC BY-SA 4.0",
      "Saigen Jiro, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Coastal viewpoint visit band.",
    },
  }),
  makeRecord({
    id: "yanagawa-canal-cruise",
    name: "Yanagawa Canal Cruise",
    nameJa: "柳川川下り",
    aliases: ["Yanagawa River Cruise", "Yanagawa Kawakudari"],
    officialWebsite: yanagawaHome,
    officialWebsiteRequirement: "required",
    kind: "cruise",
    importance: "notable",
    role: "standalone",
    municipalityId: "Fukuoka:yanagawa",
    coordinates: { lat: 33.1625, lng: 130.4019 },
    location: {
      address: "536-7 Mitsuhashimachi Fujiyoshi, Yanagawa, Fukuoka 832-0826",
      latitude: 33.1625,
      longitude: 130.4019,
    },
    categories: ["Experience", "Culture", "History", "Boat"],
    tags: ["Experience", "Culture", "History", "Boat", "Yanagawa"],
    description:
      "A punt-boat cruise through the canal town of Yanagawa, a 60-minute ride along the moat of the former castle town, famous for its water-town scenery and eel cuisine.",
    descriptionJa:
      "柳川の掘割を小船で巡る川下り。かつての城下町の内堀を約60分かけて進み、水郷の風景と名物のうなぎを楽しめます。",
    highlights: [
      "A 60-minute punt-boat ride through the canal town",
      "The moat of the former castle town of Yanagawa",
      "A classic rail day-trip from Fukuoka (Nishitetsu)",
    ],
    highlightsJa: [
      "掘割を小船で60分の川下り",
      "かつての城下町・柳川の内堀",
      "西鉄で福岡から日帰りできる定番",
    ],
    notes:
      "A single canonical canal-cruise outing: the Shogetsu boarding area is one operator's product, and the town's moat cruise is the stable visitor proposition. Reached by Nishitetsu Tenjin Omuta Line to Nishitetsu Yanagawa Station.",
    notesJa:
      "川下りは一つの定番の体験として扱います。松月乗船場は運航会社の一つで、城下町の掘割クルーズが安定した訪問体験です。西鉄天神大牟田線の西鉄柳川駅からアクセスします。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        yanagawaHome,
        "Yanagawa Kanko Kaihatsu (Shogetsu) official site",
      ),
      source(
        "official",
        yanagawaTourism,
        "Yanagawa City official canal-cruise page",
      ),
    ],
    image: image(
      yanagawaImage,
      "https://commons.wikimedia.org/wiki/File:Yanagawa-kawakudari.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 2, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Destination experience time: the ~60-minute canal cruise plus time in the water-town streets and for eel lunch. The train from Fukuoka is transport, not visit time.",
    },
    reservation:
      "Boats depart on a schedule; check current times. The cruise operator (Yanagawa Kanko Kaihatsu) runs the Shogetsu boarding area.",
    parking:
      "Free parking is available at the boarding-area lots; shuttle buses return from the endpoint.",
  }),
];

// ── Main ───────────────────────────────────────────────────────────────────
function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as DestinationWithLocation[];
const byId = new Map(catalog.map((d) => [d.id, d]));

const existingNames = new Map<string, string>();
for (const d of catalog) {
  for (const name of [d.name, d.nameJa, ...(d.aliases ?? [])].filter(
    (v): v is string => Boolean(v),
  )) {
    const key = normalize(name);
    if (key.length >= 6) existingNames.set(key, d.id);
  }
}

const addedIds: string[] = [];
const enrichedIds: string[] = [];

// Marine World is a child of fukuoka-city (same municipality); Nokonoshima
// (island, ferry-only), Sakurai Futamigaura (Itoshima), and Yanagawa (own
// municipality) are standalone roots — no new hubs created.
const parentByCandidate: Record<string, string> = {
  "marine-world-uminonakamichi": "fukuoka-city",
};

for (const candidate of reviewedCandidates) {
  const existing = byId.get(candidate.id);
  if (existing) {
    if (
      existing.name !== candidate.name ||
      existing.nameJa !== candidate.nameJa ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(
        `${candidate.id}: existing record conflicts with the verified KAI-157 identity`,
      );
    }
    // Correct image provenance on existing records (idempotent).
    if (
      existing.heroImage !== candidate.heroImage ||
      JSON.stringify(existing.imageMetadata) !==
        JSON.stringify(candidate.imageMetadata)
    ) {
      existing.heroImage = candidate.heroImage;
      existing.imageMetadata = candidate.imageMetadata;
      if (existing.content?.en) existing.content.en.image = undefined;
      enrichedIds.push(candidate.id);
    }
    // Transport correction (KAI-157 review): static transportOptions minutes
    // bypass the origin-aware guard. Nokonoshima's mainland-kyushu zone was
    // also invalid (island requires ferry). Both are corrected here: static
    // values cleared; transportZoneId removed so the island box resolves
    // Nokonoshima to its own ferry-only zone.
    if (
      existing.transportOptions &&
      Object.keys(existing.transportOptions).length > 0
    ) {
      existing.transportOptions = {};
      existing.transportMetadata = {
        method: "unestimated",
        confidence: "unknown",
        basis:
          "No origin-aware corridor duration is modeled for this destination. Local access exists (localAccessModes) but a complete origin-to-destination duration is not verified; recommendation availability comes only from canonical origin-aware routes (ferry infrastructure for island access), never from static transportOptions numbers.",
      };
      enrichedIds.push(candidate.id);
    }
    if (existing.transportZoneId && existing.transportZoneId !== "unknown") {
      delete existing.transportZoneId;
      enrichedIds.push(candidate.id);
    }
    // Duration correction (KAI-157 review): recommendedVisitHours must mean
    // time spent at/within the destination, not origin-to-destination travel.
    // The corrected candidates carry pure destination-time bands.
    if (
      candidate.recommendedVisitHours &&
      JSON.stringify(existing.recommendedVisitHours) !==
        JSON.stringify(candidate.recommendedVisitHours)
    ) {
      existing.recommendedVisitHours = candidate.recommendedVisitHours;
      existing.durationMetadata = {
        method: "manual",
        confidence: "medium",
        basis:
          "Destination experience time (visit at/within the destination); origin-to-destination travel is modeled separately in transport.",
      };
      // A duration change invalidates any previously model-derived walking
      // minutes (they were computed from the old visit band). Clear them so
      // the derive pass regenerates from the corrected duration.
      if (existing.walkingMin !== undefined) {
        delete existing.walkingMin;
        delete existing.walkingIntensity;
        delete existing.walkingMetadata;
      }
      enrichedIds.push(candidate.id);
    }
    continue;
  }
  if (candidate.municipalityId?.split(":")[0] !== "Fukuoka") {
    throw new Error(`${candidate.id}: expected Fukuoka prefecture`);
  }
  const candidateNames = [
    candidate.name,
    candidate.nameJa,
    ...(candidate.aliases ?? []),
  ].filter((v): v is string => Boolean(v));
  for (const name of candidateNames) {
    const key = normalize(name);
    if (key.length < 6) continue;
    const dup = existingNames.get(key);
    if (dup) {
      throw new Error(
        `${candidate.id}: normalized name '${name}' duplicates existing ${dup}`,
      );
    }
  }
  const parentId = parentByCandidate[candidate.id];
  if (parentId) {
    const parent = byId.get(parentId);
    if (!parent || parent.role !== "hub") {
      throw new Error(
        `${candidate.id}: parent ${parentId} must be an existing hub`,
      );
    }
    if (parent.municipalityId !== candidate.municipalityId) {
      throw new Error(
        `${candidate.id}: parent municipality ${parent.municipalityId} does not match ${candidate.municipalityId}`,
      );
    }
    candidate.relationships = {
      ...candidate.relationships,
      parentDestinationId: parentId,
    };
  }
  catalog.push(candidate);
  byId.set(candidate.id, candidate);
  for (const name of candidateNames) {
    const key = normalize(name);
    if (key.length >= 6) existingNames.set(key, candidate.id);
  }
  addedIds.push(candidate.id);
}

// Post-pass relationship validation.
for (const candidate of reviewedCandidates) {
  for (const relatedId of [
    candidate.relationships?.nearbyDestinationIds ?? [],
  ].flat()) {
    if (!byId.has(relatedId)) {
      throw new Error(
        `${candidate.id}: relationship target ${relatedId} is missing`,
      );
    }
  }
}

// ── Enrichments ─────────────────────────────────────────────────────────────
// teamLab Forest is a permanent installation inside BOSS E-ZO beside PayPay
// Dome — modeled as enrichment of the existing fukuoka-paypay-dome record
// (venue-within-venue; NO new card per the no-fake-depth rule).
const paypayDome = byId.get("fukuoka-paypay-dome");
if (paypayDome) {
  const teamlabNotesEn =
    "teamLab Forest Fukuoka, a permanent interactive digital-art museum, is on the 5th floor of BOSS E-ZO (beside Mizuho PayPay Dome). It is modeled as part of this venue record, not a separate card.";
  const teamlabNotesJa =
    "チームラボフォレスト福岡は、みずほPayPayドーム横のBOSS E・ZO 5階にある常設のデジタルアートミュージアムです。この施設レコードの一部として扱い、別カードにはしません。";
  const priorNotes = paypayDome.notes ?? "";
  if (!priorNotes.includes("teamLab Forest")) {
    paypayDome.notes = `${priorNotes}\n${teamlabNotesEn}`.trim();
    paypayDome.notesJa =
      `${paypayDome.notesJa ?? ""}\n${teamlabNotesJa}`.trim();
    if (
      paypayDome.content?.en &&
      !paypayDome.content.en.notes?.includes("teamLab")
    ) {
      paypayDome.content.en.notes =
        `${paypayDome.content.en.notes ?? ""}\n${teamlabNotesEn}`.trim();
    }
    if (
      paypayDome.content?.ja &&
      !paypayDome.content.ja.notes?.includes("チームラボ")
    ) {
      paypayDome.content.ja.notes =
        `${paypayDome.content.ja.notes ?? ""}\n${teamlabNotesJa}`.trim();
    }
    enrichedIds.push("fukuoka-paypay-dome");
  }
}

// Curated fukuoka-city featured children: the new bay child plus the
// existing core. Only same-municipality children may be featured.
const fukuokaCity = byId.get("fukuoka-city");
if (!fukuokaCity || fukuokaCity.role !== "hub") {
  throw new Error(
    "fukuoka-city hub is required before curating featured places",
  );
}
const curatedFukuokaFeatured = [
  "tenjin",
  "canal-city-hakata",
  "ohori-park",
  "kushida-shrine",
  "fukuoka-castle-ruins",
  "fukuoka-tower",
  "fukuoka-yatai",
  "nakasu",
  "tochoji",
  "hakata-machiya-folk-museum",
  "maizuru-park",
  "fukuoka-art-museum",
  "fukuoka-city-museum",
  "fukuoka-paypay-dome",
  "marine-world-uminonakamichi",
];
if (
  JSON.stringify(fukuokaCity.relationships?.featuredDestinationIds ?? []) !==
  JSON.stringify(curatedFukuokaFeatured)
) {
  fukuokaCity.relationships = {
    ...fukuokaCity.relationships,
    featuredDestinationIds: curatedFukuokaFeatured,
  };
  if (fukuokaCity.editorial?.fieldSources) {
    fukuokaCity.editorial.fieldSources = {
      ...fukuokaCity.editorial.fieldSources,
      relationships: [
        source(
          "calculated",
          "catalogue-model://kai-157",
          "KAI-157 curated Fukuoka City children; structural children remain authoritative",
        ),
      ],
    };
  }
  enrichedIds.push("fukuoka-city");
}

if (addedIds.length > 0 || enrichedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || enrichedIds.length > 0
    ? `KAI-157: added ${addedIds.length} Fukuoka destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-157: catalogue already contains the verified Fukuoka records; no changes made",
);
