/**
 * KAI-155 — verified Osaka City + metropolitan-ring destination depth.
 *
 * Adds only independently recommendable Osaka destinations, checked against
 * current operator/government/tourism sources on the implementation date.
 * Deliberately does NOT split attraction complexes into synthetic depth:
 * Expo '70 is one park record (Tower of the Sun is a structured highlight,
 * not a competing card); USJ remains one canonical record; Minoh stays the
 * existing quasi-national-park outing. Grand Green Osaka is DEFERRED (still
 * phased; full completion spring 2027) per the ticket. The script is
 * idempotent: missing IDs are appended once, conflicting identities fail
 * fast, and a second run produces zero diff.
 *
 * Transport honesty: same-city records carry legacy static minutes as the
 * existing Osaka catalogue does (osaka-city train:190 etc.). These are
 * display/fallback provenance only (transportMetadata.method
 * "legacy-fallback", confidence low); origin-aware transport remains
 * authoritative and is never fabricated.
 *
 * Usage: tsx scripts/kai-155-osaka-expansion.ts
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

type OsakaSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases?: string[];
  officialWebsite: string;
  officialWebsiteRequirement: "required" | "recommended";
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  /** "standalone" for deliberate metropolitan-ring roots without a hub parent. */
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
): OsakaSpec["image"] => ({
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
const makeRecord = (spec: OsakaSpec): DestinationWithLocation => {
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
    prefecture: "Osaka",
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
    transportOptions: {},
    localAccessModes: spec.localAccessModes,
    localAccessUnestimated: true,
    transportMetadata: {
      method: "unestimated",
      confidence: "unknown",
      basis:
        "No origin-aware corridor duration is modeled for this destination. Local access exists (localAccessModes) but a complete origin-to-destination duration is not verified; recommendation availability comes only from canonical origin-aware routes, never from static transportOptions numbers.",
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
        "Added current, source-verified Osaka City and metropolitan-ring depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Osaka destination after current operator, government, and tourism-board verification.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};
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
const sumiyoshiHome = "https://www.sumiyoshitaisha.net/en/";
const sumiyoshiAccess = "https://www.sumiyoshitaisha.net/access/";
const sumiyoshiImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Sumiyoshi_Taisha-24.jpg/1280px-Sumiyoshi_Taisha-24.jpg";

const teamlabHome = "https://www.teamlab.art/e/botanicalgarden/";
const teamlabFaq = "https://www.teamlab.art/faq/botanicalgarden/";
const nagaiGardenHome = "https://botanical-garden.nagai-park.jp/";
const nagaiGardenImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Promenade_at_Nagai_Botanical_Garden%2C_January_2024_-9762.jpg/1280px-Promenade_at_Nagai_Botanical_Garden%2C_January_2024_-9762.jpg";

const expoParkHome = "https://www.expo70-park.jp/languages/english/";
const expoParkAccess = "https://www.expo70-park.jp/guide/access/";
const towerOfSunHome = "https://taiyounotou-expo70.jp/en/guide/";
const expoParkImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Osaka_Expo%2770_Festival_Plaza.jpg/1280px-Osaka_Expo%2770_Festival_Plaza.jpg";

const tenjinHome =
  "https://osaka-info.jp/en/spot/tenjimbashisuji-shopping-street/";
const tenjinImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tenjinbashisuji_Shopping_Street_2024_Dec_31_various.jpeg/1280px-Tenjinbashisuji_Shopping_Street_2024_Dec_31_various.jpeg";

const kishiwadaHome =
  "https://www.city.kishiwada.lg.jp/page/36-kishiwadajyo.html";
const kishiwadaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Kishiwada_Castle_Kishiwada_Osaka_pref_Japan02s5.jpg/1280px-Kishiwada_Castle_Kishiwada_Osaka_pref_Japan02s5.jpg";
const danjiriHome = "https://osaka-info.jp/en/spot/kishiwada-danjiri-kaikan/";
const danjiriImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/120513_Kishiwada_Danjiri_Kaikan_Kishiwada_Osaka_pref_Japan01bs5.jpg/1280px-120513_Kishiwada_Danjiri_Kaikan_Kishiwada_Osaka_pref_Japan01bs5.jpg";

const hirakataHome = "https://www.hirakatapark.co.jp/";
const hirakataAccess = "https://www.hirakatapark.co.jp/information/access/";
const hirakataImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Hirakata_park_Osaka_prefecture_Wikivoyage_banner.jpg/1280px-Hirakata_park_Osaka_prefecture_Wikivoyage_banner.jpg";

const usjHome = "https://www.usj.co.jp/web/en/us";
const usjSnw = "https://www.usj.co.jp/web/en/us/areas/super-nintendo-world";

const minoParkHome = "https://www.mino-park.jp/";

// ── Candidate records ───────────────────────────────────────────────────────
const reviewedCandidates: DestinationWithLocation[] = [
  makeRecord({
    id: "sumiyoshi-taisha",
    name: "Sumiyoshi Taisha Grand Shrine",
    nameJa: "住吉大社",
    aliases: ["Sumiyoshi Taisha", "Sumiyoshi Grand Shrine"],
    officialWebsite: sumiyoshiHome,
    officialWebsiteRequirement: "required",
    kind: "shrine",
    importance: "major",
    municipalityId: "Osaka:osaka",
    coordinates: { lat: 34.6128, lng: 135.4933 },
    location: {
      address: "2-9-89 Sumiyoshi, Sumiyoshi-ku, Osaka 558-0045",
      latitude: 34.6128,
      longitude: 135.4933,
    },
    categories: ["Shrine", "History", "Culture", "Sightseeing"],
    tags: ["Shrine", "History", "Culture", "Photography", "Osaka City"],
    description:
      "One of Japan's oldest shrines and the head shrine of all Sumiyoshi shrines nationwide, known for its distinctive Sumiyoshi-zukuri main halls and the iconic red Soribashi bridge.",
    descriptionJa:
      "全国の住吉神社の総本社で、日本最古級の神社の一つ。住吉造の本殿と朱塗りの反橋が有名です。",
    highlights: [
      "The Sumiyoshi-zukuri National Treasure main halls",
      "The red arched Soribashi bridge and garden",
      "A distinctive southern Osaka heritage outing",
    ],
    highlightsJa: [
      "国宝の住吉造本殿",
      "朱塗りの反橋と境内",
      "大阪南部を代表する歴史散策",
    ],
    notes:
      "The shrine is free to enter; the treasure hall has a separate fee. Approach by Nankai Main Line Sumiyoshitaisha Station (3 min walk) or Hankai Tram. No rail line reaches the shrine gate itself.",
    notesJa:
      "境内は無料で参拝できます。宝物殿は別途料金です。南海本線住吉大社駅から徒歩3分、阪堺線住吉鳥居前駅からすぐ。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        sumiyoshiHome,
        "Sumiyoshi Taisha official English site",
      ),
      source(
        "official",
        sumiyoshiAccess,
        "Sumiyoshi Taisha official access page",
      ),
    ],
    image: image(
      sumiyoshiImage,
      "https://commons.wikimedia.org/wiki/File:Sumiyoshi_Taisha-24.jpg",
      "CC BY 4.0",
      "Immanuelle, CC BY 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Shrine visit band; the grounds and garden support a 1–2 hour outing.",
    },
  }),
  makeRecord({
    id: "teamlab-botanical-garden-osaka",
    name: "teamLab Botanical Garden Osaka",
    nameJa: "チームラボ ボタニカルガーデン大阪",
    aliases: ["teamLab Botanical Garden", "Nagai Botanical Garden Night"],
    officialWebsite: teamlabHome,
    officialWebsiteRequirement: "required",
    kind: "garden",
    importance: "major",
    municipalityId: "Osaka:osaka",
    coordinates: { lat: 34.6109, lng: 135.5312 },
    location: {
      address: "1-23 Nagaikoen, Higashisumiyoshi-ku, Osaka 546-0034",
      latitude: 34.6109,
      longitude: 135.5312,
    },
    categories: ["Art", "Garden", "Modern", "Nightlife"],
    tags: ["Art", "Garden", "Modern", "Night", "Osaka City"],
    description:
      "A permanent nighttime open-air museum inside Nagai Botanical Garden, where interactive light artworks transform the plants, lake, and trees of the 240,000-sqm garden.",
    descriptionJa:
      "長居植物園内に常設された夜間野外ミュージアム。園内の植物や池、樹木を使ったインタラクティブな光のアート作品が広がります。",
    highlights: [
      "Permanent nighttime light-art installations across the garden",
      "The garden's plants and lake as living canvases",
      "A modern southern Osaka evening outing",
    ],
    highlightsJa: [
      "園内に広がる常設の夜間アート",
      "植物と池を舞台にした作品群",
      "大阪南部のモダンな夜の散策",
    ],
    notes:
      "Entry is by dated ticket with reserved time slots; hours vary seasonally and last entry is usually about one hour before close. teamLab operates inside the city-run Nagai Botanical Garden, which itself has separate daytime admission.",
    notesJa:
      "日時指定のチケット制です。営業時間は季節により変わり、最終入場は閉館の約1時間前です。チームラボは市営の長居植物園内で運営されており、昼間の植物園とは別料金です。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        teamlabHome,
        "teamLab Botanical Garden Osaka official site",
      ),
      source("official", teamlabFaq, "teamLab Botanical Garden official FAQ"),
      source(
        "official",
        nagaiGardenHome,
        "Osaka City Nagai Botanical Garden official site",
      ),
    ],
    image: image(
      nagaiGardenImage,
      "https://commons.wikimedia.org/wiki/File:Promenade_at_Nagai_Botanical_Garden,_January_2024_-9762.jpg",
      "CC BY-SA 4.0",
      "Laitche, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Night garden walk; the self-paced loop supports 1–2 hours.",
    },
    reservation:
      "Dated, time-slot tickets are required; check the official site for the current calendar.",
    parking:
      "No dedicated on-site parking is asserted; use Osaka Metro Nagai Station (approx. 10 min walk) or JR Hanwa Line Nagai Station.",
  }),
  makeRecord({
    id: "expo-70-commemorative-park",
    name: "Expo '70 Commemorative Park",
    nameJa: "万博記念公園",
    aliases: ["Expo 70 Park", "Banpaku Kinen Koen", "Expo'70 Park"],
    officialWebsite: expoParkHome,
    officialWebsiteRequirement: "required",
    kind: "park",
    importance: "major",
    role: "standalone",
    municipalityId: "Osaka:suita",
    coordinates: { lat: 34.8093, lng: 135.5359 },
    location: {
      address: "1-1 Senri Expo Park, Suita, Osaka 565-0826",
      latitude: 34.8093,
      longitude: 135.5359,
    },
    categories: ["Park", "History", "Culture", "Sightseeing"],
    tags: ["Park", "History", "Culture", "Photography", "Suita"],
    description:
      "The 260-hectare park built on the site of Expo '70, anchored by Taro Okamoto's Tower of the Sun and featuring the Natural and Cultural Gardens, a Japanese garden, and seasonal flowers.",
    descriptionJa:
      "1970年大阪万博の会場跡地に開かれた約260ヘクタールの公園。岡本太郎作の太陽の塔を中心に、自然文化園や日本庭園、四季の花々が楽しめます。",
    highlights: [
      "Taro Okamoto's Tower of the Sun landmark",
      "The Japanese Garden and seasonal flower fields",
      "A Suita metropolitan-ring heritage and nature outing",
    ],
    highlightsJa: [
      "岡本太郎の太陽の塔",
      "日本庭園と四季の花畑",
      "北大阪・吹田の歴史と自然",
    ],
    notes:
      "The Tower of the Sun interior requires a separate dated reservation and a different ticket from the park admission. Park access is via Osaka Monorail Bampaku-kinen-koen Station (direct) or Senri-Chuo Station + walk.",
    notesJa:
      "太陽の塔の内部見学は日時指定の予約制で、公園入園料とは別のチケットが必要です。大阪モノレール万博記念公園駅から直結、または千里中央駅から徒歩です。",
    localAccessModes: ["train", "bus", "shinkansen"],
    sources: [
      source(
        "official",
        expoParkHome,
        "Expo '70 Commemorative Park official English site",
      ),
      source(
        "official",
        expoParkAccess,
        "Expo '70 Commemorative Park official access page",
      ),
      source("official", towerOfSunHome, "Tower of the Sun official site"),
    ],
    image: image(
      expoParkImage,
      "https://commons.wikimedia.org/wiki/File:Osaka_Expo'70_Festival_Plaza.jpg",
      "CC BY-SA 2.0",
      "Flickr user (32413914@N05), CC BY-SA 2.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 3, max: 5 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Park + garden + landmark visit band; a thorough visit is 3–5 hours.",
    },
  }),
  makeRecord({
    id: "tenjinbashi-suji-shopping-street",
    name: "Tenjinbashi-suji Shopping Street",
    nameJa: "天神橋筋商店街",
    aliases: ["Tenjinbashi-suji", "Tenjinbashisuji"],
    officialWebsite: tenjinHome,
    officialWebsiteRequirement: "recommended",
    kind: "street",
    importance: "notable",
    municipalityId: "Osaka:osaka",
    coordinates: { lat: 34.7038, lng: 135.5166 },
    location: {
      address: "Tenjinbashi, Kita-ku, Osaka 530-0041",
      latitude: 34.7038,
      longitude: 135.5166,
    },
    categories: ["Shopping", "Food", "Culture", "Street"],
    tags: ["Shopping", "Food", "Culture", "Street", "Osaka City"],
    description:
      "Japan's longest shopping street at approximately 2.6 km, lined with over 600 shops, eateries, and everyday Osaka commerce running from Tenjinbashi north through Tenjinbashisuji 7-chome.",
    descriptionJa:
      "全長約2.6km、約600軒の店舗が連なる日本一長い商店街。天神橋から天神橋筋7丁目まで、大阪の日常が詰まった買い物と食の通りです。",
    highlights: [
      "Japan's longest covered shopping street (~2.6 km)",
      "Over 600 shops, food stalls, and daily-life Osaka commerce",
      "A free, rain-friendly central Osaka browsing outing",
    ],
    highlightsJa: [
      "全長約2.6kmの日本一長い商店街",
      "約600軒の店と飲食、大阪の日常",
      "雨でも楽しめる中央大阪の散策",
    ],
    notes:
      "The street is a linear district rather than a point POI; the coordinates anchor the Tenjinbashi 2-chome end near Tenjimbashisuji 6-chome Station. Osaka Tenmangu Shrine and the Tenjin Festival site sit at the southern end.",
    notesJa:
      "商店街は線状の地区であり、座標は天神橋筋6丁目駅付近の天神橋2丁目側の起点を示します。南端には大阪天満宮と天神祭の会場があります。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "tourism_board",
        tenjinHome,
        "Osaka Convention & Tourism Bureau Tenjinbashisuji listing",
      ),
      source(
        "official",
        "https://www.tenjin123.com/",
        "Tenjinbashi-suji 1-3 chome official site",
      ),
    ],
    image: image(
      tenjinImage,
      "https://commons.wikimedia.org/wiki/File:Tenjinbashisuji_Shopping_Street_2024_Dec_31_various.jpeg",
      "CC BY 4.0",
      "Nesnad, CC BY 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Longest-street browse band; a full walk with stops is 1–3 hours.",
    },
  }),
  makeRecord({
    id: "kishiwada-castle",
    name: "Kishiwada Castle",
    nameJa: "岸和田城",
    aliases: ["Kishiwada-jo", "Kishiwada Castle & Chikiri Park"],
    officialWebsite: kishiwadaHome,
    officialWebsiteRequirement: "required",
    kind: "castle",
    importance: "notable",
    role: "standalone",
    municipalityId: "Osaka:kishiwada",
    coordinates: { lat: 34.4376, lng: 135.3707 },
    location: {
      address: "9-1 Kishikicho, Kishiwada, Osaka 596-0073",
      latitude: 34.4376,
      longitude: 135.3707,
    },
    categories: ["Castle", "History", "Culture", "Sightseeing"],
    tags: ["Castle", "History", "Culture", "Photography", "Kishiwada"],
    description:
      "A reconstructed castle in the historic Kishiwada castle-town district, home to the famous Kishiwada Danjiri Festival and surrounded by Chikiri Park with its moat and stone walls.",
    descriptionJa:
      "岸和田だんじり祭で知られる城下町・岸和田のシンボル。再建された天守閣は千亀利公園の堀と石垣に囲まれています。",
    highlights: [
      "The reconstructed keep and Chikiri Park moat setting",
      "A base for the Kishiwada Danjiri Festival district",
      "A southern Osaka castle-town heritage outing",
    ],
    highlightsJa: [
      "再建天守と千亀利公園の堀",
      "岸和田だんじり祭のまち歩き拠点",
      "大阪南部の城下町散策",
    ],
    notes:
      "Admission is 300 yen (free for junior high and under); closed Mondays. The Danjiri Kaikan museum is a short walk away and can be combined into one Kishiwada outing.",
    notesJa:
      "入場料は大人300円（中学生以下無料）、月曜休館です。だんじり会館は徒歩圏にあり、まとめて岸和田の一日を楽しめます。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "government",
        kishiwadaHome,
        "Kishiwada City official castle page",
      ),
      source(
        "tourism_board",
        "https://osaka-info.jp/spot/kishiwada-castle/",
        "Osaka Convention & Tourism Bureau Kishiwada Castle listing",
      ),
    ],
    image: image(
      kishiwadaImage,
      "https://commons.wikimedia.org/wiki/File:Kishiwada_Castle_Kishiwada_Osaka_pref_Japan02s5.jpg",
      "CC BY 2.5",
      "663highland, CC BY 2.5, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Castle keep + park walk band.",
    },
    nearbyDestinationIds: ["kishiwada-danjiri-kaikan"],
  }),
  makeRecord({
    id: "kishiwada-danjiri-kaikan",
    name: "Kishiwada Danjiri Kaikan",
    nameJa: "岸和田だんじり会館",
    aliases: ["Kishiwada Danjiri Museum", "Danjiri Kaikan"],
    officialWebsite: danjiriHome,
    officialWebsiteRequirement: "required",
    kind: "museum",
    importance: "notable",
    role: "standalone",
    municipalityId: "Osaka:kishiwada",
    coordinates: { lat: 34.4389, lng: 135.3742 },
    location: {
      address: "11-23 Honmachi, Kishiwada, Osaka 596-0074",
      latitude: 34.4389,
      longitude: 135.3742,
    },
    categories: ["Museum", "History", "Culture", "Festival"],
    tags: ["Museum", "History", "Culture", "Festival", "Kishiwada"],
    description:
      "A museum devoted to the Kishiwada Danjiri Festival, with festival floats, dashi models, and audio-visual exhibits explaining the high-speed danjiri tradition.",
    descriptionJa:
      "岸和田だんじり祭に特化したミュージアム。実物のだんじりや模型、映像で高速で駆けるだんじり祭の世界を紹介します。",
    highlights: [
      "Real festival floats and historical danjiri exhibits",
      "Festival audiovisual content for the Kishiwada Danjiri tradition",
      "Pairs naturally with Kishiwada Castle for a district outing",
    ],
    highlightsJa: [
      "実物のだんじりと歴史展示",
      "岸和田だんじり祭の映像体験",
      "岸和田城と組み合わせた城下町巡り",
    ],
    notes:
      "Admission is 600 yen for adults; closed Mondays. The museum is about a 7-minute walk from Takatsukiji Station on the Nankai Main Line.",
    notesJa:
      "入館料は大人600円、月曜休館です。南海本線蛸地蔵駅から徒歩約7分です。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "tourism_board",
        danjiriHome,
        "Osaka Convention & Tourism Bureau Kishiwada Danjiri Kaikan listing",
      ),
      source(
        "official",
        "https://www.city.kishiwada.lg.jp/",
        "Kishiwada City official site",
      ),
    ],
    image: image(
      danjiriImage,
      "https://commons.wikimedia.org/wiki/File:120513_Kishiwada_Danjiri_Kaikan_Kishiwada_Osaka_pref_Japan01bs5.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Museum visit band with audiovisual content.",
    },
    nearbyDestinationIds: ["kishiwada-castle"],
  }),
  makeRecord({
    id: "hirakata-park",
    name: "Hirakata Park",
    nameJa: "ひらかたパーク",
    aliases: ["Hirakata Park (Hira-Pa)", "Hira-Pa"],
    officialWebsite: hirakataHome,
    officialWebsiteRequirement: "required",
    kind: "amusement_park",
    importance: "notable",
    role: "standalone",
    municipalityId: "Osaka:hirakata",
    coordinates: { lat: 34.8129, lng: 135.6489 },
    location: {
      address: "1-1 Hirakata Koen-cho, Hirakata, Osaka 573-0054",
      latitude: 34.8129,
      longitude: 135.6489,
    },
    categories: ["Theme Park", "Family", "Amusement", "Entertainment"],
    tags: ["Theme Park", "Family", "Amusement", "Entertainment", "Hirakata"],
    description:
      "A long-running family amusement park in northern Osaka operated by Keihan, with roughly 40 rides and seasonal events, about 3 minutes on foot from Keihan Hirakata-koen Station.",
    descriptionJa:
      "京阪グループが運営する大阪北部の老舗ファミリー遊園地。約40のアトラクションと季節イベントを楽しめ、京阪枚方公園駅から徒歩約3分です。",
    highlights: [
      "A classic family amusement park with ~40 rides",
      "Seasonal events and evening openings in summer",
      "A distinct northern Osaka ring family outing",
    ],
    highlightsJa: [
      "約40のアトラクションがある老舗遊園地",
      "季節イベントと夏の夜間営業",
      "北大阪エリアのファミリー向け行き先",
    ],
    notes:
      "Operating hours vary by season (typically 10:00–17:00, later in summer). Admission and ride passes are sold separately; check the official calendar.",
    notesJa:
      "営業時間は季節により異なります（通常10:00〜17:00、夏期は延長）。入園料とフリーパスは別売りです。公式カレンダーをご確認ください。",
    localAccessModes: ["train", "bus"],
    sources: [
      source("official", hirakataHome, "Hirakata Park official site"),
      source("official", hirakataAccess, "Hirakata Park official access page"),
    ],
    image: image(
      hirakataImage,
      "https://commons.wikimedia.org/wiki/File:Hirakata_park_Osaka_prefecture_Wikivoyage_banner.jpg",
      "CC BY-SA 3.0",
      "Jnn, CC BY-SA 3.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 3, max: 6 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Theme-park visit band with rides and events.",
    },
    reservation:
      "Check the official site for current admission and all-access pass options; hours vary by date.",
    parking:
      "Car parking is available; check the official access guidance for current terms.",
  }),
];

// ── Enrichment: USJ (Super Nintendo World context, no new card) ────────────
const usjNotes =
  "Super Nintendo World, including the Donkey Kong Country area that opened December 2024, is part of the single Universal Studios Japan park. Attraction availability and entry rules (timed entry for themed areas, show schedules) change; check the official site rather than relying on stored ride details.";
const usjNotesJa =
  "スーパー・ニンテンドー・ワールド（2024年12月開業のドンキーコング・カントリーを含む）はユニバーサル・スタジオ・ジャパンという一つのテーマパーク内にあります。アトラクションの運営状況やエリア入場方法（時間指定など）・ショーのスケジュールは変わることがあるため、公式サイトをご確認ください。";
// USJ correction (KAI-155 review): the previous reservationJa/parkingJa were
// stale shrine-visit template copy. Official USJ facts (checked 2026-08-22):
// park hours vary by date without notice; dedicated paid parking exists
// (official parking info page); tickets are date-specific and bought via the
// official web ticket store. Durable wording only — no volatile daily values.
const usjReservation =
  "Park admission requires a ticket; date-specific Studio Pass and Express Pass options are sold through the official web ticket store. Park hours and timed-entry requirements for themed areas change by date — check the official site before visiting.";
const usjReservationJa =
  "入場にはチケットが必要です。日付指定のスタジオ・パスやエクスプレス・パスは公式WEBチケットストアで購入します。営業時間やエリアの時間指定入場は日によって変わるため、来場前に公式サイトをご確認ください。";
const usjParking =
  "Dedicated paid parking is available on site (fee varies by date; see the official parking calendar). Hours vary by date; public transport (JR Universal City Station) is the recommended access.";
const usjParkingJa =
  "専用の有料駐車場があります（料金は日によって変動し、公式の駐車料金カレンダーをご確認ください）。営業時間は日により異なります。公共交通機関（JRユニバーサルシティ駅）での来場が推奨されます。";
const usjOfficialSource = source(
  "official",
  "https://www.usj.co.jp/web/ja/jp",
  "Universal Studios Japan official website",
);
const usjParkingSource = source(
  "official",
  "https://www.usj.co.jp/web/ja/jp/access/parking",
  "USJ official parking information page",
);
const usjHoursSource = source(
  "official",
  "https://www.usj.co.jp/web/ja/jp/park-guide/schedule/park-hour",
  "USJ official park hours page",
);

// ── Enrichment: Minoh (existing outing notes, no micro-depth) ──────────────
const minohNotes =
  "The existing Meiji no Mori Mino Quasi-National Park record covers the Minoh outing. Minoo Falls (33 m) is the main natural attraction, reached by a roughly 40-minute one-way walk from Hankyu Minoo Station. This KAI-155 pass intentionally adds no separate Minoh micro-destinations.";
const minohNotesJa =
  "明治の森箕面国定公園の既存レコードが箕面の行き先をカバーしています。箕面大滝（落差33m）が主役で、阪急箕面駅から片道約40分の遊歩道で到達します。KAI-155では箕面の細分化は意図的に追加しません。";

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

// KAI-155 records: children of osaka-city (same municipality) for the three
// Osaka City records; the other four (Expo, Kishiwada x2, Hirakata) are
// metropolitan-ring records with no hub parent — no new city hubs are created
// (batch-1 lesson: avoid unnecessary hubs).
const parentByCandidate: Record<string, string> = {
  "sumiyoshi-taisha": "osaka-city",
  "teamlab-botanical-garden-osaka": "osaka-city",
  "tenjinbashi-suji-shopping-street": "osaka-city",
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
        `${candidate.id}: existing record conflicts with the verified KAI-155 identity`,
      );
    }
    // Correct image provenance on existing records (idempotent): the verified
    // Commons URL/attribution replaces any placeholder or invented URL.
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
    // Transport correction (KAI-155 review): a newly verified destination
    // must not carry static transportOptions minutes — those bypass the
    // origin-aware guard and let a broad prefecture corridor masquerade as
    // an attraction-level route. Clear any static values; availability now
    // comes only from canonical origin-aware routes.
    if (
      existing.transportOptions &&
      Object.keys(existing.transportOptions).length > 0
    ) {
      existing.transportOptions = {};
      existing.transportMetadata = {
        method: "unestimated",
        confidence: "unknown",
        basis:
          "No origin-aware corridor duration is modeled for this destination. Local access exists (localAccessModes) but a complete origin-to-destination duration is not verified; recommendation availability comes only from canonical origin-aware routes, never from static transportOptions numbers.",
      };
      enrichedIds.push(candidate.id);
    }
    continue;
  }
  if (candidate.municipalityId?.split(":")[0] !== "Osaka") {
    throw new Error(`${candidate.id}: expected Osaka prefecture`);
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

// Post-pass relationship validation: nearby refs between two newly added
// records resolve only after the full candidate set is appended.
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
const usj = byId.get("universal-studios-japan");
if (usj) {
  let usjChanged = false;
  if (usj.notes !== usjNotes) {
    usj.notes = usjNotes;
    usj.notesJa = usjNotesJa;
    if (usj.content?.en) usj.content.en.notes = usjNotes;
    if (usj.content?.ja) usj.content.ja.notes = usjNotesJa;
    usjChanged = true;
  }
  // Correct the stale shrine-visit template copy (reservationJa/parkingJa).
  if (
    usj.reservationJa !== usjReservationJa ||
    usj.reservation !== usjReservation
  ) {
    usj.reservationJa = usjReservationJa;
    usj.reservation = usjReservation;
    if (usj.content?.en) usj.content.en.reservation = usjReservation;
    if (usj.content?.ja) usj.content.ja.reservation = usjReservationJa;
    usjChanged = true;
  }
  if (usj.parkingJa !== usjParkingJa || usj.parking !== usjParking) {
    usj.parkingJa = usjParkingJa;
    usj.parking = usjParking;
    if (usj.content?.en) usj.content.en.parking = usjParking;
    if (usj.content?.ja) usj.content.ja.parking = usjParkingJa;
    usjChanged = true;
  }
  // Record provenance for the corrected fields (review requirement: the
  // official source used for each newly added statement must be discoverable).
  if (usjChanged) {
    if (!usj.editorial) usj.editorial = {} as Destination["editorial"];
    const existingSources = usj.editorial.sources ?? [];
    const existingUrls = new Set(existingSources.map((s) => s.url));
    const toAdd = [usjOfficialSource, usjParkingSource, usjHoursSource].filter(
      (s) => !existingUrls.has(s.url),
    );
    if (toAdd.length > 0) {
      usj.editorial.sources = [...existingSources, ...toAdd];
    }
    usj.editorial.fieldSources = {
      ...(usj.editorial.fieldSources ?? {}),
      reservation: [usjOfficialSource],
      parking: [usjParkingSource],
      openingHours: [usjHoursSource],
      notes: [usjOfficialSource],
    };
    if (!usj.editorial.changes) usj.editorial.changes = [];
    usj.editorial.changes = [
      ...usj.editorial.changes,
      {
        changedAt: REVIEW_DATE,
        changedBy: "Meguruto editorial",
        summary:
          "Corrected stale shrine-visit template copy in reservation/parking; verified current USJ parking, hours, and ticket semantics from the official site (durable wording only).",
        method: "manual",
      },
    ];
    usjChanged = true;
    enrichedIds.push("universal-studios-japan");
  }
}

const minoh = byId.get("meiji-no-mori-mino");
if (minoh) {
  if (minoh.notes !== minohNotes) {
    minoh.notes = minohNotes;
    minoh.notesJa = minohNotesJa;
    if (minoh.content?.en) minoh.content.en.notes = minohNotes;
    if (minoh.content?.ja) minoh.content.ja.notes = minohNotesJa;
    enrichedIds.push("meiji-no-mori-mino");
  }
}

// Curated osaka-city featured children: the new Osaka City children plus the
// existing core. Only same-municipality children may be featured (the
// validator flags cross-municipality featured refs).
const osakaCity = byId.get("osaka-city");
if (!osakaCity || osakaCity.role !== "hub") {
  throw new Error("osaka-city hub is required before curating featured places");
}
const curatedOsakaFeatured = [
  "osaka-castle",
  "osaka-aquarium-kaiyukan",
  "dotonbori",
  "shinsaibashi",
  "kuromon-market",
  "umeda-sky-building",
  "universal-studios-japan",
  "tsutenkaku",
  "shinsekai",
  "sumiyoshi-taisha",
  "teamlab-botanical-garden-osaka",
  "tenjinbashi-suji-shopping-street",
  "osaka-station-city",
  "nakanoshima-museum-art-osaka",
  "the-national-museum-of-art-osaka",
];
if (
  JSON.stringify(osakaCity.relationships?.featuredDestinationIds ?? []) !==
  JSON.stringify(curatedOsakaFeatured)
) {
  osakaCity.relationships = {
    ...osakaCity.relationships,
    featuredDestinationIds: curatedOsakaFeatured,
  };
  if (osakaCity.editorial?.fieldSources) {
    osakaCity.editorial.fieldSources = {
      ...osakaCity.editorial.fieldSources,
      relationships: [
        source(
          "calculated",
          "catalogue-model://kai-155",
          "KAI-155 curated Osaka City children; structural children remain authoritative",
        ),
      ],
    };
  }
  enrichedIds.push("osaka-city");
}

if (addedIds.length > 0 || enrichedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || enrichedIds.length > 0
    ? `KAI-155: added ${addedIds.length} Osaka destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-155: catalogue already contains the verified Osaka records; no changes made",
);
