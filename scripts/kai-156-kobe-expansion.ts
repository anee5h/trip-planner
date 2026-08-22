/**
 * KAI-156 — verified Kobe + Hanshin destination depth.
 *
 * Adds only independently recommendable Kobe destinations, checked against
 * current operator/government/tourism sources on the implementation date.
 * Mt Rokko is ONE canonical mountain outing (Garden Terrace, cable, and
 * mountain-bus access are context, not competing cards); Nada sake is
 * anchored by the Hakutsuru Sake Brewery Museum; Suma is modeled as the
 * CURRENT Kobe Suma Sea World (Suma Aqualife Park closed 2023; reopened as
 * Suma Sea World June 2024). The script is idempotent: missing IDs are
 * appended once, conflicting identities fail fast, and a second run
 * produces zero diff.
 *
 * Transport honesty: Mt Rokko access REQUIRES the Rokko Cable + mountain
 * bus — no direct train reaches the summit. Records carry legacy static
 * minutes as display fallback only (low confidence); origin-aware transport
 * remains authoritative.
 *
 * Usage: tsx scripts/kai-156-kobe-expansion.ts
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

type KobeSpec = {
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
  transportOptions?: { train?: number; bus?: number; shinkansen?: number };
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

const legacyTransport = {
  method: "legacy-fallback" as const,
  confidence: "low" as const,
  basis:
    "Static minutes are retained only as a legacy display fallback matching existing Kobe records; origin-aware transport remains authoritative and is never fabricated.",
};

const image = (
  heroImage: string,
  sourceUrl: string,
  license: string,
  attribution: string,
): KobeSpec["image"] => ({
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
const rokkoHome = "https://www.rokkosan.com/gt/?lang=en";
const rokkoAccess = "https://kobe-rokko.jp/";
const rokkoCable = "https://www.rokkocable.com/en/";
const rokkoImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Mt_rokko01s2816.jpg/1280px-Mt_rokko01s2816.jpg";

const hakutsuruHome = "https://www.hakutsuru.co.jp/community/shiryo/";
const hakutsuruImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Hakuturu-sake-museum.jpg/1280px-Hakuturu-sake-museum.jpg";

const ikutaHome = "https://ikutajinja.or.jp/access";
const ikutaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Ikuta_Shrine_honden.jpg/1280px-Ikuta_Shrine_honden.jpg";

const sorakuenHome = "https://sorakuen.com/english/";
const sorakuenImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Sorakuen08st3200.jpg/1280px-Sorakuen08st3200.jpg";

const sumaHome = "https://www.kobesuma-seaworld.jp/en/";
const sumaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/%E7%A5%9E%E6%88%B8%E9%A0%88%E7%A3%A8%E3%82%B7%E3%83%BC%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89_%E3%82%B7%E3%83%A3%E3%83%81%E3%81%AE%E3%83%A2%E3%83%8B%E3%83%A5%E3%83%A1%E3%83%B3%E3%83%88.jpg/1280px-%E7%A5%9E%E6%88%B8%E9%A0%88%E7%A3%A8%E3%82%B7%E3%83%BC%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89_%E3%82%B7%E3%83%A3%E3%83%81%E3%81%AE%E3%83%A2%E3%83%8B%E3%83%A5%E3%83%A1%E3%83%B3%E3%83%88.jpg";

// ── makeRecord ──────────────────────────────────────────────────────────────
const makeRecord = (spec: KobeSpec): DestinationWithLocation => {
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
    prefecture: "Hyogo",
    region: "Kansai",
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
    transportOptions: spec.transportOptions ?? {},
    localAccessModes: spec.localAccessModes,
    localAccessUnestimated: true,
    transportMetadata: legacyTransport,
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
        "Added current, source-verified Kobe and Hanshin destination depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Kobe destination after current operator, government, and tourism-board verification.",
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
    id: "mt-rokko-kobe",
    name: "Mt. Rokko",
    nameJa: "六甲山",
    aliases: ["Mount Rokko", "Rokko-san"],
    officialWebsite: rokkoHome,
    officialWebsiteRequirement: "recommended",
    kind: "mountain",
    importance: "major",
    role: "standalone",
    municipalityId: "Hyogo:kobe",
    coordinates: { lat: 34.7625, lng: 135.257 },
    location: {
      address: "Rokkosan-cho, Nada-ku, Kobe, Hyogo 657-0101",
      latitude: 34.7625,
      longitude: 135.257,
    },
    categories: ["Mountain", "Nature", "Viewpoint", "Sightseeing"],
    tags: ["Mountain", "Nature", "Viewpoint", "Sightseeing", "Kobe"],
    description:
      "The mountain range above Kobe with panoramic views over Osaka Bay, reached by the Rokko Cable and mountain buses, with the Rokko Garden Terrace observation complex and seasonal nature trails.",
    descriptionJa:
      "神戸の背後にそびえる山塊。六甲ケーブルと山上バスでアクセスし、六甲ガーデンテラスからの大阪湾の絶景と四季の自然を楽しめます。",
    highlights: [
      "Panoramic Osaka Bay views from the summit area",
      "Rokko Garden Terrace and Rokko Shidare observatory",
      "A mountain outing reached by cable car and mountain bus (no direct train)",
    ],
    highlightsJa: [
      "大阪湾を見渡す山上からの絶景",
      "六甲ガーデンテラスと六甲枝垂れ展望台",
      "ケーブルと山上バスで登る山の行き先",
    ],
    notes:
      "Access requires the Rokko Cable from Rokko Cable Shimo Station (JR Rokkomichi Station + bus) to Rokko Sanjo, then the Rokko Sanjo bus to Garden Terrace (~13 min). There is NO direct train to the summit. Rokko-Arima Ropeway links to Arima Onsen.",
    notesJa:
      "アクセスは六甲ケーブル下駅（JR六甲道駅からバス）から六甲山上駅までケーブル、さらに六甲山上バスでガーデンテラスへ約13分です。山頂へ直通の鉄道はありません。六甲有馬ロープウェーで有馬温泉と結ばれています。",
    localAccessModes: ["bus", "car", "my_car"],
    transportOptions: { bus: 90 },
    sources: [
      source("official", rokkoHome, "Rokko Garden Terrace official site"),
      source(
        "official",
        rokkoCable,
        "Kobe Rokko Railway (cable) official site",
      ),
      source("official", rokkoAccess, "Kobe Rokko mountain official portal"),
    ],
    image: image(
      rokkoImage,
      "https://commons.wikimedia.org/wiki/File:Mt_rokko01s2816.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 3, max: 6 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Cable + mountain bus + terrace visit band; a full outing is 3–6 hours.",
    },
    reservation:
      "Check current cable and mountain-bus schedules; no summit admission reservation is modeled.",
    parking:
      "Car parking exists at Rokko Cable Shimo and some summit facilities; check the official guidance.",
  }),
  makeRecord({
    id: "hakutsuru-sake-brewery-museum",
    name: "Hakutsuru Sake Brewery Museum",
    nameJa: "白鶴酒造資料館",
    aliases: ["Hakutsuru Sake Museum", "Hakutsuru Shiryo-kan"],
    officialWebsite: hakutsuruHome,
    officialWebsiteRequirement: "required",
    kind: "museum",
    importance: "notable",
    municipalityId: "Hyogo:kobe",
    coordinates: { lat: 34.7039, lng: 135.2655 },
    location: {
      address:
        "4-5-5 Sumiyoshi Minamimachi, Higashinada-ku, Kobe, Hyogo 658-0041",
      latitude: 34.7039,
      longitude: 135.2655,
    },
    categories: ["Museum", "Culture", "Food", "History"],
    tags: ["Museum", "Culture", "Food", "History", "Kobe"],
    description:
      "A free sake museum in the Nada brewing district, set in a restored Taisho-era brewery, with exhibits on the traditional sake-making process and tasting opportunities.",
    descriptionJa:
      "灘の酒蔵・白鶴が大正時代の酒蔵を利用して開設した無料の資料館。伝統的な酒造りの工程を立体展示で紹介し、試飲も楽しめます。",
    highlights: [
      "Free admission in the historic Nada brewing district",
      "Restored Taisho-era brewery with sake-making exhibits",
      "A cultural anchor for the Nada sake area",
    ],
    highlightsJa: [
      "灘の酒蔵で無料見学",
      "大正時代の酒蔵を活用した展示",
      "灘エリアの文化スポット",
    ],
    notes:
      "Free admission; open 9:30–16:30 (entry until 16:00). About 5 minutes on foot from Hanshin Sumiyoshi Station. Construction at the adjacent Hakutsuru headquarters may affect parking.",
    notesJa:
      "入館無料、開館9:30〜16:30（入館は16:00まで）。阪神住吉駅から徒歩約5分です。隣接する本社敷地内の工事で駐車場の一部が利用できない場合があります。",
    localAccessModes: ["train", "bus"],
    transportOptions: { train: 35, bus: 50 },
    sources: [
      source(
        "official",
        hakutsuruHome,
        "Hakutsuru Sake Brewery Museum official site",
      ),
      source(
        "official",
        "https://www.hakutsuru.co.jp/",
        "Hakutsuru Sake Brewery official site",
      ),
    ],
    image: image(
      hakutsuruImage,
      "https://commons.wikimedia.org/wiki/File:Hakuturu-sake-museum.jpg",
      "CC BY-SA 4.0",
      "Kakidai, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Museum visit band with tasting.",
    },
  }),
  makeRecord({
    id: "ikuta-shrine-kobe",
    name: "Ikuta Shrine",
    nameJa: "生田神社",
    aliases: ["Ikuta Jinja"],
    officialWebsite: ikutaHome,
    officialWebsiteRequirement: "required",
    kind: "shrine",
    importance: "notable",
    municipalityId: "Hyogo:kobe",
    coordinates: { lat: 34.7006, lng: 135.1911 },
    location: {
      address: "1-2-1 Shimoyamate-dori, Chuo-ku, Kobe, Hyogo 650-0011",
      latitude: 34.7006,
      longitude: 135.1911,
    },
    categories: ["Shrine", "Culture", "History", "Sightseeing"],
    tags: ["Shrine", "Culture", "History", "Sightseeing", "Kobe"],
    description:
      "One of Japan's oldest shrines, in central Kobe near Sannomiya, historically linked to the name 'Kobe' itself and a short walk from the city's main transport hub.",
    descriptionJa:
      "日本でも有数の古社で、三宮に近い神戸中心部に鎮座します。「神戸」という地名の由来にも関わる由緒ある神社で、市の中心部から徒歩圏です。",
    highlights: [
      "One of Japan's oldest shrines, a 10-minute walk from Sannomiya",
      "Historically tied to the origin of the name 'Kobe'",
      "A heritage counterpoint to the harbor district",
    ],
    highlightsJa: [
      "三宮から徒歩10分の古社",
      "「神戸」の地名の由来に関わる由緒",
      "港エリアとは異なる歴史スポット",
    ],
    notes:
      "Grounds open daily; amulet office and goshuin 9:00–16:30. About 10 minutes on foot from JR Sannomiya / private-line Sannomiya stations.",
    notesJa:
      "境内は毎日開いています。お札授与所・御朱印受付は9時〜16時半。JR三ノ宮駅・各私鉄三宮駅から徒歩約10分です。",
    localAccessModes: ["train", "bus"],
    transportOptions: { train: 20, bus: 30 },
    sources: [
      source("official", ikutaHome, "Ikuta Shrine official access page"),
      source(
        "tourism_board",
        "https://www.feel-kobe.jp/facilities/0000000035/",
        "Kobe Tourism Bureau Ikuta Shrine listing",
      ),
    ],
    image: image(
      ikutaImage,
      "https://commons.wikimedia.org/wiki/File:Ikuta_Shrine_honden.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 1 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Shrine visit band.",
    },
  }),
  makeRecord({
    id: "sorakuen-garden",
    name: "Sorakuen Garden",
    nameJa: "相楽園",
    aliases: ["Kobe Sorakuen Garden", "Sorakuen"],
    officialWebsite: sorakuenHome,
    officialWebsiteRequirement: "required",
    kind: "garden",
    importance: "notable",
    municipalityId: "Hyogo:kobe",
    coordinates: { lat: 34.6969, lng: 135.1874 },
    location: {
      address: "5-3-1 Nakayamatedori, Chuo-ku, Kobe, Hyogo 650-0004",
      latitude: 34.6969,
      longitude: 135.1874,
    },
    categories: ["Garden", "Nature", "Culture", "History"],
    tags: ["Garden", "Nature", "Culture", "History", "Kobe"],
    description:
      "A Japanese garden in central Kobe with a teahouse, pond, and the Hassam-an tea room, offering a quiet green retreat within walking distance of Sannomiya.",
    descriptionJa:
      "神戸市中心部にある日本庭園。茶室や池を配し、三宮から徒歩圏で静かな緑のひとときを過ごせます。",
    highlights: [
      "A landscaped Japanese garden in central Kobe",
      "Tea house and seasonal plantings",
      "A short walk from Sannomiya",
    ],
    highlightsJa: [
      "神戸中心部の日本庭園",
      "茶室と四季の植栽",
      "三宮から徒歩圏",
    ],
    notes:
      "Open 9:00–17:00 (entry until 16:30); closed Thursdays and year-end holidays. Admission is 300 yen. The Hassam-an teahouse and formal garden are the highlights.",
    notesJa:
      "開園9:00〜17:00（入園は16:30まで）。木曜と年末年始は休園。入園料300円。茶室「八三庵」と庭園が見どころです。",
    localAccessModes: ["train", "bus"],
    transportOptions: { train: 15, bus: 25 },
    sources: [
      source(
        "official",
        sorakuenHome,
        "Kobe Sorakuen Garden official English site",
      ),
      source(
        "tourism_board",
        "https://www.feel-kobe.jp/facilities/0000000006/",
        "Kobe Tourism Bureau Sorakuen listing",
      ),
    ],
    image: image(
      sorakuenImage,
      "https://commons.wikimedia.org/wiki/File:Sorakuen08st3200.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 1 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Japanese garden visit band.",
    },
  }),
  makeRecord({
    id: "kobe-suma-sea-world",
    name: "Kobe Suma Sea World",
    nameJa: "神戸須磨シーワールド",
    aliases: ["Suma Sea World", "Kobe Suma Seaworld"],
    officialWebsite: sumaHome,
    officialWebsiteRequirement: "required",
    kind: "aquarium",
    importance: "major",
    municipalityId: "Hyogo:kobe",
    coordinates: { lat: 34.6417, lng: 135.1189 },
    location: {
      address: "1-3-5 Wakamiyacho, Suma-ku, Kobe, Hyogo 654-0049",
      latitude: 34.6417,
      longitude: 135.1189,
    },
    categories: ["Aquarium", "Family", "Nature", "Entertainment"],
    tags: ["Aquarium", "Family", "Nature", "Entertainment", "Kobe"],
    description:
      "The current aquarium on Suma's coast (reopened June 2024 after Suma Aqualife Park closed in 2023), with dolphin and orca shows plus the adjacent Suma Beach.",
    descriptionJa:
      "須磨海岸に面した現在の水族館（2023年に閉館した須磨海浜水族園がリニューアルし2024年6月に開業）。イルカ・シャチのショーと隣接する須磨海水浴場が楽しめます。",
    highlights: [
      "Dolphin and orca shows on the Suma coast",
      "Adjacent Suma Beach and family outing",
      "The current successor to Suma Aqualife Park (reopened June 2024)",
    ],
    highlightsJa: [
      "須磨海岸のイルカ・シャチショー",
      "隣接する須磨海水浴場とファミリー向け",
      "須磨海浜水族園の後継施設（2024年6月開業）",
    ],
    notes:
      "Suma Aqualife Park closed May 31, 2023 and reopened as Kobe Suma Sea World in June 2024 at the same coastal site. Admission and hours vary by season; book tickets in advance online.",
    notesJa:
      "須磨海浜水族園は2023年5月31日に閉館し、2024年6月に「神戸須磨シーワールド」として同じ須磨海岸に開業しました。料金・時間は季節により変動し、オンライン事前予約が推奨されます。",
    localAccessModes: ["train", "bus"],
    transportOptions: { train: 40, bus: 60 },
    sources: [
      source("official", sumaHome, "Kobe Suma Sea World official English site"),
      source(
        "official",
        "https://www.kobesuma-seaworld.jp/en/access/",
        "Kobe Suma Sea World official access page",
      ),
    ],
    image: image(
      sumaImage,
      "https://commons.wikimedia.org/wiki/File:神戸須磨シーワールド_シャチのモニュメント.jpg",
      "CC BY-SA 4.0",
      "KKPCW, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 3, max: 5 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Aquarium + coast visit band.",
    },
    reservation:
      "Advance online ticket booking is recommended; admission and hours vary by season.",
    nearbyDestinationIds: [],
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

// All Kobe records are children of kobe-city (same municipality); Mt Rokko is
// a standalone mountain root (no hub parent, no new hub created).
const parentByCandidate: Record<string, string> = {
  "hakutsuru-sake-brewery-museum": "kobe-city",
  "ikuta-shrine-kobe": "kobe-city",
  "sorakuen-garden": "kobe-city",
  "kobe-suma-sea-world": "kobe-city",
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
        `${candidate.id}: existing record conflicts with the verified KAI-156 identity`,
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
    continue;
  }
  if (candidate.municipalityId?.split(":")[0] !== "Hyogo") {
    throw new Error(`${candidate.id}: expected Hyogo prefecture`);
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

// Post-pass relationship validation: nearby refs between newly added records
// resolve only after the full candidate set is appended.
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
// Curated kobe-city featured children: the new Kobe children plus the
// existing core. Only same-municipality children may be featured.
const kobeCity = byId.get("kobe-city");
if (!kobeCity || kobeCity.role !== "hub") {
  throw new Error("kobe-city hub is required before curating featured places");
}
const curatedKobeFeatured = [
  "meriken-park",
  "kobe-port-tower",
  "kobe-harborland",
  "nankinmachi-chinatown",
  "kitano-ijinkan",
  "nunobiki-falls",
  "nunobiki-herb-gardens",
  "nunobiki-ropeway",
  "arima-onsen",
  "kobe-maya-night-view",
  "kobe-animal-kingdom",
  "kobe-maritime-museum",
  "ikuta-shrine-kobe",
  "sorakuen-garden",
  "hakutsuru-sake-brewery-museum",
  "kobe-suma-sea-world",
];
if (
  JSON.stringify(kobeCity.relationships?.featuredDestinationIds ?? []) !==
  JSON.stringify(curatedKobeFeatured)
) {
  kobeCity.relationships = {
    ...kobeCity.relationships,
    featuredDestinationIds: curatedKobeFeatured,
  };
  if (kobeCity.editorial?.fieldSources) {
    kobeCity.editorial.fieldSources = {
      ...kobeCity.editorial.fieldSources,
      relationships: [
        source(
          "calculated",
          "catalogue-model://kai-156",
          "KAI-156 curated Kobe City children; structural children remain authoritative",
        ),
      ],
    };
  }
  enrichedIds.push("kobe-city");
}

if (addedIds.length > 0 || enrichedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || enrichedIds.length > 0
    ? `KAI-156: added ${addedIds.length} Kobe destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-156: catalogue already contains the verified Kobe records; no changes made",
);
