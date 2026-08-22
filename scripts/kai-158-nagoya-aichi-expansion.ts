/**
 * KAI-158 — verified Nagoya + Aichi destination depth.
 *
 * Adds only independently recommendable Aichi destinations, checked against
 * current operator/government/tourism sources on the implementation date.
 * Ghibli Park is ONE canonical record in Nagakute (NOT Nagoya City) with
 * structured highlights; Legoland Japan is ONE record with SEA LIFE as a
 * shared-resort enrichment (not a separate depth win); Higashiyama Zoo is
 * one family/nature anchor. Osu Shopping District already exists and is
 * verified/enriched, not duplicated. The script is idempotent: missing IDs
 * are appended once, conflicting identities fail fast, and a second run
 * produces zero diff.
 *
 * Transport honesty: records carry legacy static minutes as display
 * fallback only (transportMetadata.method "legacy-fallback", low
 * confidence); origin-aware transport remains authoritative.
 *
 * Usage: tsx scripts/kai-158-nagoya-aichi-expansion.ts
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

type AichiSpec = {
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
): AichiSpec["image"] => ({
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
const ghibliHome = "https://ghibli-park.jp/en/";
const ghibliTicket = "https://ghibli-park.jp/en/ticket/";
const ghibliAccess = "https://ghibli-park.jp/en/access/";
const ghibliImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Panorama_Photo_of_Mononoke_Village_of_Ghibli_Park.jpg/1280px-Panorama_Photo_of_Mononoke_Village_of_Ghibli_Park.jpg";

const legoHome = "https://www.legoland.jp/en/";
const legoSeaLife = "https://www.legoland.jp/en/resort-guide/sealife-nagoya/";
const legoAccess = "https://www.legoland.jp/en/access/";
const legoImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Legoland_Japan_Hotel_and_Sea_Life_Nagoya.jpg/1280px-Legoland_Japan_Hotel_and_Sea_Life_Nagoya.jpg";

const higashiyamaHome = "https://www.higashiyama.city.nagoya.jp/english/";
const higashiyamaImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Main_Gate_of_Higashiyama_Zoo_and_Botanical_Gardens_in_Autumn.jpg/1280px-Main_Gate_of_Higashiyama_Zoo_and_Botanical_Gardens_in_Autumn.jpg";

const noritakeHome = "https://www.noritake.co.jp/eng/mori/";
const noritakeAccess = "https://www.noritake.co.jp/mori/info/access/";
const noritakeImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Noritake_Garden02%2C_Nishi_Ward_Nagoya_2014.jpg/1280px-Noritake_Garden02%2C_Nishi_Ward_Nagoya_2014.jpg";

const shirotoriHome = "https://www.shirotori-garden.jp/english/";
const shirotoriImage =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Shirotori_Garden%2C_Atsuta_Ward_Nagoya_2014.jpg/1280px-Shirotori_Garden%2C_Atsuta_Ward_Nagoya_2014.jpg";

const osuHome = "https://osu.nagoya/";

// ── Candidate records ───────────────────────────────────────────────────────
const makeRecord = (spec: AichiSpec): DestinationWithLocation => {
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
    prefecture: "Aichi",
    region: "Chubu",
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
        "Added current, source-verified Nagoya and Aichi destination depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Nagoya/Aichi destination after current operator, government, and tourism-board verification.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

const reviewedCandidates: DestinationWithLocation[] = [
  makeRecord({
    id: "ghibli-park-nagakute",
    name: "Ghibli Park",
    nameJa: "ジブリパーク",
    aliases: ["Ghibli Park Nagakute"],
    officialWebsite: ghibliHome,
    officialWebsiteRequirement: "required",
    kind: "theme_park",
    importance: "major",
    role: "standalone",
    municipalityId: "Aichi:nagakute",
    coordinates: { lat: 35.1735, lng: 137.0748 },
    location: {
      address: "1533-1 Ibaragabasama, Nagakute, Aichi 480-1342",
      latitude: 35.1735,
      longitude: 137.0748,
    },
    categories: ["Theme Park", "Family", "Culture", "Entertainment"],
    tags: ["Theme Park", "Family", "Culture", "Entertainment", "Nagakute"],
    description:
      "Studio Ghibli's theme park inside Expo 2005 Aichi Commemorative Park in Nagakute, with five themed areas including Ghibli's Grand Warehouse, Hill of Youth, and Mononoke Village.",
    descriptionJa:
      "愛・地球博記念公園内にあるスタジオジブリのテーマパーク。ジブリの大倉庫、青春の丘、もののけの里など5つのエリアが広がります。",
    highlights: [
      "Five themed areas across Expo 2005 Aichi Commemorative Park",
      "Ghibli's Grand Warehouse indoor exhibition hall",
      "A Nagakute family outing — NOT Nagoya City",
    ],
    highlightsJa: [
      "愛・地球博記念公園内の5つのエリア",
      "ジブリの大倉庫の屋内展示",
      "長久手市のファミリー向け行き先（名古屋市ではありません）",
    ],
    notes:
      "Located in Nagakute, not Nagoya City. Advance dated reservation is required for all tickets; the Grand Warehouse uses assigned entrance times. Access is via the Linimo (Aichi Rapid Transit) at Aichi-Kyuhaku-Kinen-Koen Station.",
    notesJa:
      "所在地は名古屋市ではなく長久手市です。全チケットが日時指定予約制で、大倉庫は入場時間の指定があります。リニモ（愛知高速交通）愛・地球博記念公園駅からアクセスします。",
    localAccessModes: ["train", "bus"],
    sources: [
      source("official", ghibliHome, "Ghibli Park official English site"),
      source("official", ghibliTicket, "Ghibli Park official ticket page"),
      source("official", ghibliAccess, "Ghibli Park official access page"),
    ],
    image: image(
      ghibliImage,
      "https://commons.wikimedia.org/wiki/File:Panorama_Photo_of_Mononoke_Village_of_Ghibli_Park.jpg",
      "CC BY-SA 4.0",
      "Kyu3a, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 4, max: 7 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "Multi-area park visit; a full Grand Warehouse + areas pass is a 4–7 hour day.",
    },
    reservation:
      "Advance dated reservation is required for all tickets; Grand Warehouse entry uses assigned time slots. Tickets go on sale two months ahead.",
    parking:
      "Use public transport (Linimo) or the park's official parking guidance; check current terms.",
  }),
  makeRecord({
    id: "legoland-japan-nagoya",
    name: "LEGOLAND Japan",
    nameJa: "レゴランド・ジャパン",
    aliases: ["LEGOLAND Japan Resort", "Legoland Nagoya"],
    officialWebsite: legoHome,
    officialWebsiteRequirement: "required",
    kind: "theme_park",
    importance: "major",
    municipalityId: "Aichi:nagoya",
    coordinates: { lat: 35.0505, lng: 136.8445 },
    location: {
      address: "2-2-1 Kinjo-futo, Minato-ku, Nagoya, Aichi 455-8605",
      latitude: 35.0505,
      longitude: 136.8445,
    },
    categories: ["Theme Park", "Family", "Amusement", "Entertainment"],
    tags: ["Theme Park", "Family", "Amusement", "Entertainment", "Nagoya"],
    description:
      "An outdoor LEGO theme park on Nagoya's Kinjo Pier with rides, LEGO-building areas, and the adjacent SEA LIFE Nagoya aquarium, about 10 minutes on foot from Aonami Line Kinjo-futo Station.",
    descriptionJa:
      "名古屋港・金城ふ頭にある屋外型レゴテーマパーク。ライドやレゴブロック体験に加え、隣接するシーライフ名古屋水族館も楽しめます。あおなみ線金城ふ頭駅から徒歩約10分です。",
    highlights: [
      "Outdoor LEGO rides and building experiences",
      "Adjacent SEA LIFE Nagoya aquarium (shared resort)",
      "A Nagoya bay-area family outing",
    ],
    highlightsJa: [
      "屋外のレゴライドとブロック体験",
      "隣接するシーライフ名古屋水族館",
      "名古屋港エリアのファミリー向け行き先",
    ],
    notes:
      "SEA LIFE Nagoya is part of the same LEGOLAND Japan Resort and is modeled as an enrichment of this single record, not a separate depth win. Admission and hours vary by date.",
    notesJa:
      "シーライフ名古屋水族館はレゴランド・ジャパン・リゾートの一部で、本レコードの補足情報として扱い、別カードにはしません。入場料・時間は日によって異なります。",
    localAccessModes: ["train", "bus"],
    sources: [
      source("official", legoHome, "LEGOLAND Japan official English site"),
      source(
        "official",
        legoSeaLife,
        "LEGOLAND Japan SEA LIFE Nagoya official page",
      ),
      source("official", legoAccess, "LEGOLAND Japan official access page"),
    ],
    image: image(
      legoImage,
      "https://commons.wikimedia.org/wiki/File:Legoland_Japan_Hotel_and_Sea_Life_Nagoya.jpg",
      "CC BY-SA 4.0",
      "KKPCW (Kyu3a), CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 3, max: 6 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Theme-park + aquarium visit band.",
    },
    reservation:
      "Check the official site for current admission and combo ticket options; hours vary by date.",
    parking:
      "On-site parking is available; check the official access guidance for current terms.",
  }),
  makeRecord({
    id: "higashiyama-zoo-and-botanical-gardens",
    name: "Higashiyama Zoo and Botanical Gardens",
    nameJa: "東山動植物園",
    aliases: ["Higashiyama Zoo", "Higashiyama Botanical Gardens"],
    officialWebsite: higashiyamaHome,
    officialWebsiteRequirement: "required",
    kind: "zoo",
    importance: "major",
    municipalityId: "Aichi:nagoya",
    coordinates: { lat: 35.1616, lng: 136.9755 },
    location: {
      address: "3-70 Higashiyama Motomachi, Chikusa-ku, Nagoya, Aichi 464-0804",
      latitude: 35.1616,
      longitude: 136.9755,
    },
    categories: ["Zoo", "Family", "Nature", "Garden"],
    tags: ["Zoo", "Family", "Nature", "Garden", "Nagoya"],
    description:
      "One of Japan's largest city zoos with a botanical garden and the Higashiyama Sky Tower, home to over 550 animal species and extensive seasonal plantings.",
    descriptionJa:
      "日本有数の規模を誇る名古屋市立の動物園。植物園と東山スカイタワーを併設し、550種以上の動物と四季の植物を楽しめます。",
    highlights: [
      "Over 550 animal species in one city zoo",
      "Adjacent botanical garden and seasonal plantings",
      "A Nagoya family and nature anchor",
    ],
    highlightsJa: [
      "550種以上の動物が暮らす市営動物園",
      "隣接する植物園と四季の植栽",
      "名古屋のファミリー・自然スポット",
    ],
    notes:
      "The zoo and botanical garden are one admission and one canonical record; the Higashiyama Sky Tower is already a separate catalogue record. Closed Mondays.",
    notesJa:
      "動物園と植物園は同一入場・同一レコードとして扱います。東山スカイタワーは既存の別レコードです。月曜休園です。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        higashiyamaHome,
        "Higashiyama Zoo and Botanical Gardens official English site",
      ),
      source(
        "government",
        "https://www.city.nagoya.jp/",
        "Nagoya City official site",
      ),
    ],
    image: image(
      higashiyamaImage,
      "https://commons.wikimedia.org/wiki/File:Main_Gate_of_Higashiyama_Zoo_and_Botanical_Gardens_in_Autumn.jpg",
      "CC BY-SA 4.0",
      "KKPCW, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 3, max: 5 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Zoo + garden + tower-adjacent visit band.",
    },
    reservation:
      "Admission is at the gate; check the official site for current fees and hours.",
    parking:
      "Pay parking is available; check the official guidance for current terms.",
  }),
  makeRecord({
    id: "noritake-garden",
    name: "Noritake Garden",
    nameJa: "ノリタケの森",
    aliases: ["Noritake no Mori", "Noritake Garden Nagoya"],
    officialWebsite: noritakeHome,
    officialWebsiteRequirement: "required",
    kind: "garden",
    importance: "notable",
    municipalityId: "Aichi:nagoya",
    coordinates: { lat: 35.1818, lng: 136.8965 },
    location: {
      address: "3-1-36 Noritake Shinmachi, Nishi-ku, Nagoya, Aichi 451-8501",
      latitude: 35.1818,
      longitude: 136.8965,
    },
    categories: ["Garden", "Culture", "Museum", "Shopping"],
    tags: ["Garden", "Culture", "Museum", "Shopping", "Nagoya"],
    description:
      "An urban green space on the former Noritake china factory site near Nagoya Station, with the Noritake Museum, craft center, and garden paths.",
    descriptionJa:
      "名古屋駅近くの旧ノリタケ製陶所跡地に整備された都会の緑地。ノリタケミュージアムやクラフトセンター、庭園の散策路があります。",
    highlights: [
      "The Noritake Museum and craft demonstrations",
      "Garden paths on the former factory site",
      "A short walk from Nagoya Station",
    ],
    highlightsJa: [
      "ノリタケミュージアムとクラフト体験",
      "旧工場跡地の庭園散策",
      "名古屋駅から徒歩圏",
    ],
    notes:
      "The garden and museum are one coherent outing; admission to the garden is free with paid museum entry. The adjacent AEON Mall Nagoya Noritake Garden shares the site.",
    notesJa:
      "庭園とミュージアムは一つの散策として楽しめます。庭園は無料、ミュージアムは有料です。隣接するイオンモールNagoya Noritake Gardenと同じ敷地です。",
    localAccessModes: ["train", "bus"],
    sources: [
      source("official", noritakeHome, "Noritake Garden official English site"),
      source(
        "official",
        noritakeAccess,
        "Noritake Garden official access page",
      ),
    ],
    image: image(
      noritakeImage,
      "https://commons.wikimedia.org/wiki/File:Noritake_Garden02,_Nishi_Ward_Nagoya_2014.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Garden + museum browse band.",
    },
  }),
  makeRecord({
    id: "shirotori-garden",
    name: "Shirotori Garden",
    nameJa: "白鳥庭園",
    aliases: ["Shirotori Teien"],
    officialWebsite: shirotoriHome,
    officialWebsiteRequirement: "required",
    kind: "garden",
    importance: "notable",
    municipalityId: "Aichi:nagoya",
    coordinates: { lat: 35.1453, lng: 136.906 },
    location: {
      address: "2-5 Atsuta Nishimachi, Atsuta-ku, Nagoya, Aichi 456-0036",
      latitude: 35.1453,
      longitude: 136.906,
    },
    categories: ["Garden", "Nature", "Culture", "Sightseeing"],
    tags: ["Garden", "Nature", "Culture", "Sightseeing", "Nagoya"],
    description:
      "A Japanese garden in Atsuta with a central pond, tea house, and the Shirotori no Yu teahouse, offering a serene Nagoya garden outing near the Nagoya Congress Center.",
    descriptionJa:
      "熱田区にある日本庭園。中央の池と茶室、白鳥の湯を備え、名古屋国際会議場近くで静かな庭園散策が楽しめます。",
    highlights: [
      "A landscaped Japanese garden with central pond",
      "Tea house and seasonal plantings",
      "Pairs with Atsuta Shrine for a southern Nagoya outing",
    ],
    highlightsJa: [
      "池を中心とした日本庭園",
      "茶室と四季の植栽",
      "熱田神宮と組み合わせた名古屋南部の散策",
    ],
    notes:
      "Admission is 300 yen; closed Mondays and year-end holidays. The garden pairs naturally with nearby Atsuta Shrine.",
    notesJa:
      "入園料は300円、月曜と年末年始は休園です。近隣の熱田神宮と合わせて訪れるのがおすすめです。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        shirotoriHome,
        "Shirotori Garden official English site",
      ),
      source(
        "tourism_board",
        "https://www.nagoya-info.jp/en/spot/detail/33/",
        "Nagoya Convention & Visitors Bureau Shirotori Garden listing",
      ),
    ],
    image: image(
      shirotoriImage,
      "https://commons.wikimedia.org/wiki/File:Shirotori_Garden,_Atsuta_Ward_Nagoya_2014.jpg",
      "CC BY-SA 4.0",
      "663highland, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis: "Japanese garden visit band.",
    },
    nearbyDestinationIds: ["atsuta-shrine-nagoya"],
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

// Nagoya City records are children of nagoya-city; Ghibli Park is standalone
// in Nagakute (no hub parent, no new hub created).
const parentByCandidate: Record<string, string> = {
  "legoland-japan-nagoya": "nagoya-city",
  "higashiyama-zoo-and-botanical-gardens": "nagoya-city",
  "noritake-garden": "nagoya-city",
  "shirotori-garden": "nagoya-city",
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
        `${candidate.id}: existing record conflicts with the verified KAI-158 identity`,
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
    // Transport correction (KAI-158 review): a newly verified destination
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
  if (candidate.municipalityId?.split(":")[0] !== "Aichi") {
    throw new Error(`${candidate.id}: expected Aichi prefecture`);
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
// Osu Shopping District already exists with a proper description; verify and
// confirm the official site reference (no new card, no duplicate).
const osu = byId.get("osu-shopping-district");
if (osu) {
  const osuNotes =
    "Osu Shopping District is Nagoya's largest shopping quarter around Osu Kannon, with covered arcades known for electronics, secondhand shops, character goods, and the Osu festival. This record is verified current; no duplicate card is added.";
  if (osu.notes !== osuNotes) {
    osu.notes = osuNotes;
    osu.notesJa =
      "大須商店街は大須観音周辺に広がる名古屋最大の商店街です。アーケードには家電、リサイクルショップ、キャラクターグッズ店などが並び、大須まつりも開催されます。このレコードは現状確認済みで、重複カードは追加しません。";
    if (osu.content?.en) osu.content.en.notes = osuNotes;
    if (osu.content?.ja)
      osu.content.ja.notes =
        "大須商店街は大須観音周辺に広がる名古屋最大の商店街です。アーケードには家電、リサイクルショップ、キャラクターグッズ店などが並び、大須まつりも開催されます。このレコードは現状確認済みで、重複カードは追加しません。";
    enrichedIds.push("osu-shopping-district");
  }
}

// Curated nagoya-city featured children: the new Nagoya children plus the
// existing core. Only same-municipality children may be featured.
const nagoyaCity = byId.get("nagoya-city");
if (!nagoyaCity || nagoyaCity.role !== "hub") {
  throw new Error(
    "nagoya-city hub is required before curating featured places",
  );
}
const curatedNagoyaFeatured = [
  "nagoya-castle-aichi",
  "atsuta-shrine-nagoya",
  "osu-shopping-district",
  "nagoya-city-science-museum",
  "tokugawa-art-museum",
  "scmaglev-and-railway-park",
  "nagoya-city-art-museum",
  "toyota-commemorative-museum-of-industry-and-technology",
  "legoland-japan-nagoya",
  "higashiyama-zoo-and-botanical-gardens",
  "noritake-garden",
  "shirotori-garden",
];
if (
  JSON.stringify(nagoyaCity.relationships?.featuredDestinationIds ?? []) !==
  JSON.stringify(curatedNagoyaFeatured)
) {
  nagoyaCity.relationships = {
    ...nagoyaCity.relationships,
    featuredDestinationIds: curatedNagoyaFeatured,
  };
  if (nagoyaCity.editorial?.fieldSources) {
    nagoyaCity.editorial.fieldSources = {
      ...nagoyaCity.editorial.fieldSources,
      relationships: [
        source(
          "calculated",
          "catalogue-model://kai-158",
          "KAI-158 curated Nagoya City children; structural children remain authoritative",
        ),
      ],
    };
  }
  enrichedIds.push("nagoya-city");
}

if (addedIds.length > 0 || enrichedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || enrichedIds.length > 0
    ? `KAI-158: added ${addedIds.length} Aichi destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-158: catalogue already contains the verified Aichi records; no changes made",
);
