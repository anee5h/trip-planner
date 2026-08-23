/**
 * KAI-154 — verified Shiga east/north Lake Biwa destination depth.
 *
 * Adds only independently recommendable Shiga destinations, checked against
 * current operator/government/tourism sources on the implementation date.
 * Kurokabe Square is ONE canonical Nagahama heritage-town outing (castle,
 * galleries, and the old-town streets are context within that proposition,
 * not competing cards); Chikubushima models ferry + island access with a
 * dedicated chikubushima transport zone (Nagahama/Imazu ports + Biwako Kisen
 * service); Koka Ninja House is ONE canonical Koka ninja-experience anchor;
 * the Makino Metasequoia avenue is ONE linear scenic anchor reached via
 * Makino Station + local bus (no invented train-to-door claim); Eigen-ji is
 * ONE canonical Higashiomi temple outing; Taga Taisha is ONE distinct
 * eastern-Shiga shrine anchor. The script is idempotent.
 *
 * Transport honesty: Chikubushima is a ferry-only island modeled like the
 * KAI-157 Nokonoshima precedent — a dedicated `chikubushima` transport zone
 * (Nagahama/Imazu ferry ports on the mainland-honshu zone, island terminal in
 * the island zone) plus the Biwako Kisen passenger service. New unestimated
 * records deliberately carry NO static transportOptions minutes: their
 * presence would affect origin-aware fallback eligibility. Records use
 * transportOptions: {} + localAccessUnestimated: true +
 * transportMetadata.method "unestimated"; recommendation availability comes
 * only from canonical origin-aware routes.
 *
 * Usage: tsx scripts/kai-154-shiga-expansion.ts
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
const REVIEW_DATE = "2026-08-23";

type DestinationWithLocation = Destination & {
  location?: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
};

type ShigaSpec = {
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
    "Official sources provide local hours, route, or event context but not a defensible four-season suitability score; unknown is preserved. Famous seasonal scenery (e.g. autumn foliage) is not by itself a defensible monthly vector.",
};

const image = (
  heroImage: string,
  sourceUrl: string,
  license: string,
  attribution: string,
): ShigaSpec["image"] => ({
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

// ── makeRecord ──────────────────────────────────────────────────────────────
const makeRecord = (spec: ShigaSpec): DestinationWithLocation => {
  const primarySource = spec.sources[0];
  const accessSource =
    spec.sources.find((candidate) =>
      /access|route|transport|walk|cruise|ferry/i.test(candidate.title),
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
        /map|location|access|aerial/i.test(candidate.title),
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
    prefecture: "Shiga",
    region: "Kansai",
    kind: spec.kind,
    role: spec.role ?? "standalone",
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
        "Added current, source-verified Shiga east/north Lake Biwa destination depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Shiga destination after current operator, government, and tourism-board verification.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

// ── Candidate records ───────────────────────────────────────────────────────

const kurokabeHome = "https://www.kurokabe.co.jp/";
const chikubuCruise = "https://www.biwakokisen.co.jp/cruise/chikubu/";
const chikubuPriceTime =
  "https://www.biwakokisen.co.jp/cruise/chikubu/price_time/";
const nagahamaPortAccess = "https://www.biwakokisen.co.jp/access/nagahama/";
const kokaNinjaHome = "https://www.kouka-ninjya.com/la_en/info/";
const metasequoiaSpot = "https://takashima-kanko.jp/spot/2018/06/post_155.html";
const eigenjiOfficial = "https://eigenji-t.jp/contact/";
const tagaTaishaListing =
  "https://global.biwako-visitors.jp/things-to-do/22084/";

const reviewedCandidates: DestinationWithLocation[] = [
  makeRecord({
    id: "kurokabe-square-nagahama",
    name: "Kurokabe Square",
    nameJa: "黒壁スクエア",
    aliases: ["Kurokabe", "Nagahama Kurokabe Square", "Kurokabe Glass House"],
    officialWebsite: kurokabeHome,
    officialWebsiteRequirement: "required",
    kind: "historic_town",
    importance: "major",
    municipalityId: "Shiga:nagahama",
    coordinates: { lat: 35.3845, lng: 136.2689 },
    location: {
      address: "12-38 Motohama-cho, Nagahama, Shiga 526-0059",
      latitude: 35.3845,
      longitude: 136.2689,
    },
    categories: ["Historic District", "Shopping", "Culture", "History"],
    tags: ["Historic District", "Shopping", "Culture", "History", "Nagahama"],
    description:
      "A preserved merchant quarter around the Meiji-era Kurokabe Bank building in central Nagahama, with glass shops, craft studios, cafes and galleries — turning Nagahama into more than a castle-only stop.",
    descriptionJa:
      "明治築の黒壁銀行を中心にガラス店や工房、カフェ、ギャラリーが並ぶ長浜の伝統的建造物群。城下町散策の核となるエリアです。",
    highlights: [
      "The Meiji-era Kurokabe Bank building and glass shops",
      "Preserved old-town streets of former castle-town Nagahama",
      "Craft and glass-blowing experiences in converted storehouses",
    ],
    highlightsJa: [
      "黒壁銀行の洋館とガラスショップ",
      "旧北国街道の古い街並み",
      "蔵造りを活かしたガラス体験・工房",
    ],
    notes:
      "About 5–10 minutes on foot from JR Nagahama Station. One canonical heritage-town proposition: Nagahama Castle, Kurokabe Museum, and individual galleries are part of this district experience, not separate cards. Nearby Nagahama Port is the mainland terminal for Chikubushima ferries.",
    notesJa:
      "JR長浜駅から徒歩約5〜10分。長浜城・黒壁美術館・個々のギャラリーは地区体験の一部として扱い、別カードにはしません。近くの長浜港は竹生島クルーズの発着港です。",
    localAccessModes: ["train"],
    sources: [
      source("official", kurokabeHome, "Kurokabe Square official site"),
      source(
        "official",
        nagahamaPortAccess,
        "Biwako Kisen Nagahama Port access page",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Kurokabe_Square_Nagahama_City_Shiga_Prefecture_2023.jpg/1280px-Kurokabe_Square_Nagahama_City_Shiga_Prefecture_2023.jpg",
      "https://commons.wikimedia.org/wiki/File:Kurokabe_Square_Nagahama_City_Shiga_Prefecture_2023.jpg",
      "Public domain",
      "ウィキ太郎, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 2, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Old-town browsing band (shops, galleries, cafe stops); pairing with Nagahama Castle extends the visit.",
    },
  }),
  makeRecord({
    id: "chikubushima-island",
    name: "Chikubu Island (Chikubushima)",
    nameJa: "竹生島",
    aliases: ["Chikubushima", "Chikubu Island", "Tsukubusuma Island"],
    officialWebsite: chikubuCruise,
    officialWebsiteRequirement: "required",
    kind: "island",
    importance: "major",
    municipalityId: "Shiga:nagahama",
    coordinates: { lat: 35.4228, lng: 136.1378 },
    location: {
      address: "Chikubushima, Nagahama, Shiga 529-0713",
      latitude: 35.4228,
      longitude: 136.1378,
    },
    categories: ["Island", "Temple", "Shrine", "Nature"],
    tags: ["Island", "Temple", "Shrine", "Ferry", "Shiga"],
    description:
      "A small sacred island in northern Lake Biwa, home to Hogon-ji Temple and Tsukubusuma Shrine, reached only by Biwako Kisen ferry from Nagahama or Imazu with scenic crossings across the lake.",
    descriptionJa:
      "琵琶湖北部に浮かぶ小島。宝厳寺と竹生島神社があり、長浜港または今津港から琵琶湖汽船の遊覧船で渡ります。",
    highlights: [
      "Hogon-ji Temple and Tsukubusuma Shrine on a forested lake island",
      "The kawarake clay-plate throwing rite",
      "Scenic ferry crossing across northern Lake Biwa",
    ],
    highlightsJa: [
      "宝厳寺と竹生島神社",
      "かわらけ投げの神事",
      "琵琶湖を横断する遊覧船の旅",
    ],
    notes:
      "FERRY ONLY: no road or rail reaches the island. Biwako Kisen runs the Nagahama route (~35 min each way, adult round trip ¥3,800) and the Imazu route (~25–30 min, ¥3,600), with roughly 85–90-minute landings; schedules vary by season and weather, and an island admission fee applies. The recommendedVisitHours cover time ON the island only — the crossing and any train to the port are transport.",
    notesJa:
      "島へはフェリーでのみアクセスできます（道路・鉄道なし）。琵琶湖汽船が長浜航路（片道約35分、大人往復3,800円）と今津航路（約25〜30分、3,600円）を運航し、上陸時間は約85〜90分。時期・天候によりダイヤが変わり、入島料が別途必要です。滞在時間は島内の体験時間のみで、航路や港までの移動は含みません。",
    // ferry is inter-zone transport in this schema, not a "local mode";
    // the island itself is walk-only after landing.
    localAccessModes: [],
    sources: [
      source(
        "official",
        chikubuCruise,
        "Biwako Kisen Chikubushima cruise official page",
      ),
      source(
        "official",
        chikubuPriceTime,
        "Biwako Kisen Chikubushima fare and timetable page",
      ),
      source(
        "official",
        nagahamaPortAccess,
        "Biwako Kisen Nagahama Port access page",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Chikubushima_aerial_shoot.jpg/1280px-Chikubushima_aerial_shoot.jpg",
      "https://commons.wikimedia.org/wiki/File:Chikubushima_aerial_shoot.jpg",
      "CC BY-SA 4.0",
      "ブルーノ・プラス, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "high",
      basis:
        "Biwako Kisen schedules give ~85–90-minute landings per round-trip sailing; this is island experience time only (temple, shrine, rite). Ferry crossing and port access are transport, not visit time.",
    },
    reservation:
      "Ferries run on fixed daily schedules that change by season; check the Biwako Kisen timetable before visiting.",
    parking:
      "Use the ferry from Nagahama or Imazu; check the operator's port-access guidance for current parking.",
  }),
  makeRecord({
    id: "koka-ninja-house",
    name: "Koka Ninja House",
    nameJa: "甲賀流忍術屋敷",
    aliases: [
      "Koga Ninja House",
      "Koka-ryu Ninjutsu Yashiki",
      "Former Mochizuki Residence",
    ],
    officialWebsite: kokaNinjaHome,
    officialWebsiteRequirement: "required",
    kind: "museum",
    importance: "notable",
    municipalityId: "Shiga:koka",
    coordinates: { lat: 34.9717, lng: 136.1836 },
    location: {
      address: "2331 Ryuhoshi, Konan-cho, Koka, Shiga 520-3311",
      latitude: 34.9717,
      longitude: 136.1836,
    },
    categories: ["Museum", "History", "Family", "Experience"],
    tags: ["Museum", "History", "Family", "Experience", "Koka"],
    description:
      "The surviving residence of the Mochizuki family — one genuine Koka ninja house with revolving walls, trapdoors and hidden passages, offering guided tours through authentic ninja architecture.",
    descriptionJa:
      "甲賀流忍者・望月氏の本家住宅。回転戸や隠し階段など仕掛けのある本物の忍術屋敷を、ガイド付きで見学できます。",
    highlights: [
      "Authentic ninja-house tricks: revolving doors and hidden staircases",
      "Guided tours explaining real Koka ninja history",
      "One canonical Koka ninja anchor (not a theme park)",
    ],
    highlightsJa: [
      "回転扉・隠し階段などの本物の仕掛け",
      "甲賀忍者の歴史を解説するガイドツアー",
      "テーマパークではない甲賀忍者の本流スポット",
    ],
    notes:
      "From JR Kusatsu Line Konan Station it is about a 20-minute walk (or short taxi); the house sits in rural southern Shiga, so the final leg beyond the station is not modeled as a verified corridor. Open 10:00–16:00 weekdays (to 17:00 weekends/holidays); closed Wednesdays, fourth Thursdays and year-end holidays. Admission ¥800 adults / ¥600 children.",
    notesJa:
      "JR草津線甲南駅から徒歩約20分（タクシーなら短時間）。駅からの最終区間は検証済み経路としてモデル化していません。平日10:00〜16:00、土日祝は17:00まで。水曜・第4木曜・年末年始休館。入場料は大人800円・子ども600円。",
    localAccessModes: ["train", "car"],
    sources: [
      source(
        "official",
        kokaNinjaHome,
        "Koka Ninja House official English visitor information",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Koka_Ninja_House_20090823.jpg/1280px-Koka_Ninja_House_20090823.jpg",
      "https://commons.wikimedia.org/wiki/File:Koka_Ninja_House_20090823.jpg",
      "Public domain",
      "Mocchy, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Single guided house tour plus grounds; a compact outing, not a half-day complex.",
    },
  }),
  makeRecord({
    id: "makino-metasequoia-avenue",
    name: "Makino Metasequoia Avenue",
    nameJa: "マキノ高原 メタセコイア並木",
    aliases: [
      "Metasequoia Namiki",
      "Makino Pickland Metasequoia Road",
      "メタセコイア並木",
    ],
    officialWebsite: metasequoiaSpot,
    officialWebsiteRequirement: "recommended",
    kind: "nature",
    importance: "notable",
    municipalityId: "Shiga:takashima",
    coordinates: { lat: 35.5453, lng: 135.9961 },
    location: {
      address: "Makino, Takashima, Shiga 520-1822",
      latitude: 35.5453,
      longitude: 135.9961,
    },
    categories: ["Nature", "Viewpoint", "Photography", "Scenic Drive"],
    tags: ["Nature", "Viewpoint", "Photography", "Scenic Drive", "Takashima"],
    description:
      "A straight 2.4 km avenue of some 500 metasequoia trees along a prefectural road on the Makino highland plateau in western Lake Biwa — a linear scenic drive-and-walk landmark.",
    descriptionJa:
      "高島市マキノ高原の府県道沿いに約500本のメタセコイアが約2.4kmにわたって並ぶ直線的な並木道です。",
    highlights: [
      "2.4 km of towering metasequoia along a single prefectural road",
      "Distinct seasonal faces (fresh green, deep green, winter hoarfrost)",
      "Pairs naturally with Makino highland and northern-lake drives",
    ],
    highlightsJa: [
      "約2.4kmにわたるメタセコイアの並木",
      "新緑・深緑・冬の霧氷と季節ごとの表情",
      "マキノ高原・湖北ドライブと合わせて楽しむ景勝地",
    ],
    notes:
      "This is a LINEAR roadside attraction: from JR Makino Station take the Makino-kogen bus (~10 min) to Makino Pickland, then walk back along the avenue; by car use the free Pickland lot. No seasonal score is asserted despite its famous winter/autumn imagery — seasonMetadata stays unknown.",
    notesJa:
      "線状の並木道スポットです。JRマキノ駅からマキノ高原線バスで約10分、マキノピックランド下車後に並木を散策。車の場合はピックランドの無料駐車場を利用します。季節の有名な景観でも、季節スコアは推定せず unknown を維持します。",
    localAccessModes: ["bus", "car", "my_car"],
    sources: [
      source(
        "official",
        metasequoiaSpot,
        "Takashima City Tourism Association Metasequoia avenue page",
      ),
      source(
        "government",
        "https://www.city.takashima.lg.jp/soshiki/seisakubu/kikakukohoka/10/3/3/525.html",
        "Takashima City Metasequoia preservation page",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/A_row_of_Metasequoia_trees_Makino_20200919.jpg/1280px-A_row_of_Metasequoia_trees_Makino_20200919.jpg",
      "https://commons.wikimedia.org/wiki/File:A_row_of_Metasequoia_trees_Makino_20200919.jpg",
      "CC0",
      "先従隗始, CC0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Walk/drive the avenue plus photo stops; a compact nature stop, not a full-day park.",
    },
  }),
  makeRecord({
    id: "eigenji-higashiomi",
    name: "Eigen-ji",
    nameJa: "永源寺",
    aliases: ["Eigenji Temple", "Zuisekizan Eigen-ji", "Eigen-ji Monastery"],
    officialWebsite: eigenjiOfficial,
    officialWebsiteRequirement: "recommended",
    kind: "temple",
    importance: "notable",
    municipalityId: "Shiga:higashiomi",
    coordinates: { lat: 35.0533, lng: 136.2283 },
    location: {
      address: "Eigenji-takanocho, Higashiomi, Shiga 527-0211",
      latitude: 35.0533,
      longitude: 136.2283,
    },
    categories: ["Temple", "Culture", "History", "Garden"],
    tags: ["Temple", "Culture", "History", "Garden", "Higashiomi"],
    description:
      "Head temple of the Eigen-ji branch of Rinzai Zen, set above the Echi River gorge in eastern Shiga, known for its Zen gardens, bell tower and riverside teahouses.",
    descriptionJa:
      "臨済宗永源寺派大本山。愛知川の峡谷を見下ろす禅寺で、禅庭や鐘楼、塔頭の茶屋が訪れる人を迎えます。",
    highlights: [
      "Rinzai Zen head temple in the Echi River gorge",
      "Classical Zen gardens and the great temple bell",
      "An eastern-Shiga culture anchor away from the lake shore",
    ],
    highlightsJa: [
      "愛知川峡に建つ臨済宗の大本山",
      "禅庭と名物の梵鐘",
      "湖岸を離れた湖東文化の拠点",
    ],
    notes:
      "In Higashiomi municipality; reach via JR/Omi-Hachiman area then a bus toward Eigenji (Eigenjimae stop), followed by a walk. Hours 9:00–16:00 (extended during foliage season); admission ¥600 adults. Individual sub-temples are part of the precinct experience, not separate cards.",
    notesJa:
      "東近江市にあります。JR近江八幡方面から永源寺行きバス（永源寺前停下車）＋徒歩でアクセス。9:00〜16:00（紅葉期は延長あり）、拝観料600円。塔頭は境内体験の一部として扱い、別カードにはしません。",
    localAccessModes: ["bus", "train"],
    sources: [
      source(
        "official",
        eigenjiOfficial,
        "Eigen-ji head temple official contact/admission page",
      ),
      source(
        "tourism_board",
        "https://global.biwako-visitors.jp/things-to-do/22360/",
        "Lake Biwa Visit Shiga official listing for Eigenji Temple",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Zuisekizan_Eigen-ji_Temple_20211121_05.jpg/1280px-Zuisekizan_Eigen-ji_Temple_20211121_05.jpg",
      "https://commons.wikimedia.org/wiki/File:Zuisekizan_Eigen-ji_Temple_20211121_05.jpg",
      "CC0",
      "先従隗始, CC0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Main hall, gardens, and river-side stroll; foliage season can extend the stay.",
    },
  }),
  makeRecord({
    id: "taga-taisha",
    name: "Taga Taisha",
    nameJa: "多賀大社",
    aliases: ["Taga Taisha Shrine", "Oga-san", "Taga Grand Shrine"],
    officialWebsite: tagaTaishaListing,
    officialWebsiteRequirement: "recommended",
    kind: "shrine",
    importance: "major",
    municipalityId: "Shiga:taga",
    coordinates: { lat: 35.2264, lng: 136.2833 },
    location: {
      address: "1322 Taga, Taga-cho, Inukami-gun, Shiga 522-0341",
      latitude: 35.2264,
      longitude: 136.2833,
    },
    categories: ["Shrine", "Culture", "History", "Spiritual"],
    tags: ["Shrine", "Culture", "History", "Spiritual", "Taga"],
    description:
      "One of Japan's great shrines dedicated to Izanagi and Izanami, famed for longevity blessings and its lantern-lined approach, anchoring a distinct eastern-Shiga heritage outing on the Ohmi Railway Main Line.",
    descriptionJa:
      "伊邪那岐命・伊邪那美命を祀る大社。長寿のご利益と参道の灯籠で知られ、近江鉄道沿線の湖東地方の文化的な拠点です。",
    highlights: [
      "Grand vermilion halls and a lantern-lined sandō approach",
      "Longevity blessings at one of eastern Japan's major shrines",
      "A distinct Ohmi-Railway heritage outing separate from the lake shore",
    ],
    highlightsJa: [
      "朱色の社殿と灯籠が並ぶ参道",
      "長寿祈願で知られる大社",
      "近江鉄道沿線の湖東地方を代表する参拝地",
    ],
    notes:
      "About a 10-minute walk from Ohmi Railway Taga Taisha-mae Station (branch line from Toyosato on the Main Line). This creates a genuinely distinct eastern-Shiga pattern when paired with Hikone or Eigen-ji, not just another lakeside stop.",
    notesJa:
      "近江鉄道多賀大社前駅から徒歩約10分（本線豊郷駅から支線）。彦根や永源寺と組み合わせると湖岸とは異なる湖東の旅になります。",
    localAccessModes: ["train"],
    sources: [
      source(
        "official",
        tagaTaishaListing,
        "Lake Biwa Visit Shiga official listing for Taga Taisha",
      ),
      source(
        "tourism_board",
        tagaTaishaListing,
        "Lake Biwa Visit Shiga official listing for Taga Taisha (address and access)",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Taga-taisha_Haiden-b.jpg/1280px-Taga-taisha_Haiden-b.jpg",
      "https://commons.wikimedia.org/wiki/File:Taga-taisha_Haiden-b.jpg",
      "CC BY-SA 3.0",
      "Yanajin33 (edited by 663highland), CC BY-SA 3.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Shrine grounds and approach street; a focused heritage stop that pairs with nearby eastern-Shiga sites.",
    },
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
  const names = [
    d.name,
    d.nameJa,
    ...(Array.isArray(d.aliases) ? d.aliases : []),
  ].filter((v): v is string => Boolean(v));
  for (const name of names) {
    const key = normalize(name);
    if (key.length >= 6) existingNames.set(key, d.id);
  }
}

const parentByCandidate: Record<string, string> = {};

const addedIds: string[] = [];
const enrichedIds: string[] = [];

for (const candidate of reviewedCandidates) {
  const existing = byId.get(candidate.id);
  if (existing) {
    // Idempotence guard: identity fields must match; otherwise conflict.
    if (
      existing.name !== candidate.name ||
      existing.nameJa !== candidate.nameJa ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(
        `${candidate.id}: existing record conflicts with the verified KAI-154 identity`,
      );
    }
    // Keep provenance correct on re-run (idempotent).
    const imageChanged =
      existing.heroImage !== candidate.heroImage ||
      JSON.stringify(existing.imageMetadata) !==
        JSON.stringify(candidate.imageMetadata);
    if (imageChanged) {
      existing.heroImage = candidate.heroImage;
      existing.imageMetadata = candidate.imageMetadata;
      if (existing.content?.en) existing.content.en.image = undefined;
      enrichedIds.push(existing.id);
    }

    // Transport honesty guard (idempotent): strip any static fallback.
    if (
      existing.transportOptions &&
      Object.keys(existing.transportOptions ?? {}).length > 0
    ) {
      existing.transportOptions = {};
      existing.transportMetadata = {
        method: "unestimated",
        confidence: "unknown",
        basis:
          "No origin-aware corridor duration is modeled for this destination. Local access exists (localAccessModes) but a complete origin-to-destination duration is not verified; recommendation availability comes only from canonical origin-aware routes (ferry infrastructure for island access), never from static transportOptions numbers.",
      };
      enrichedIds.push(existing.id);
    }
    if ((existing as { transportZoneId?: string }).transportZoneId) {
      delete (existing as { transportZoneId?: string }).transportZoneId;
    }

    if (
      JSON.stringify(existing.recommendedVisitHours) !==
        JSON.stringify(candidate.recommendedVisitHours) &&
      candidate.recommendedVisitHours
    ) {
      existing.recommendedVisitHours = candidate.recommendedVisitHours;
      existing.durationMetadata = {
        method: "manual",
        confidence: candidate.duration!.confidence,
        basis: candidate.duration!.basis,
      };
      enrichedIds.push(existing.id);
    }
    continue;
  }

  // Duplicate-name guard against the whole catalogue.
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

  // Prefecture scope guard.
  if (candidate.municipalityId?.split(":")[0] !== "Shiga") {
    throw new Error(`${candidate.id}: expected Shiga prefecture`);
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

if (addedIds.length > 0 || enrichedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || enrichedIds.length > 0
    ? `KAI-154: added ${addedIds.length} Shiga destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-154: catalogue already contains the verified Shiga records; no changes made",
);
