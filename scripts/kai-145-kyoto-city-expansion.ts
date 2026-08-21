/**
 * KAI-145 — verified Kyoto City destination depth.
 *
 * Adds only independently recommendable Kyoto City destinations. Broad area
 * records, street fragments, temple subfeatures, and venue subcomponents are
 * intentionally not split into synthetic depth. The script is idempotent:
 * missing IDs are appended once, while an existing conflicting ID fails fast.
 *
 * Usage: tsx scripts/kai-145-kyoto-city-expansion.ts
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

type KyotoSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases?: string[];
  officialWebsite: string;
  officialWebsiteRequirement: "required" | "recommended";
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  areaId: string;
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
    basis: string;
  };
  reservation?: string;
  parking?: string;
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

const image = (
  heroImage: string,
  sourceUrl: string,
  license: string,
  attribution: string,
): KyotoSpec["image"] => ({
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

const makeRecord = (spec: KyotoSpec): DestinationWithLocation => {
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
      "予約・拝観条件は変更される場合があるため、訪問前に公式案内をご確認ください。",
    parking:
      "可能な限り公共交通機関をご利用ください。駐車場の条件は公式案内をご確認ください。",
    openingHours:
      "拝観時間・休業日は変更される場合があるため、訪問前に公式案内をご確認ください。",
  };

  return {
    id: spec.id,
    officialWebsite: spec.officialWebsite,
    officialWebsiteRequirement: spec.officialWebsiteRequirement,
    name: spec.name,
    nameJa: spec.nameJa,
    aliases: spec.aliases,
    municipalityId: spec.municipalityId,
    prefecture: "Kyoto",
    region: "Kansai",
    kind: spec.kind,
    role: "poi",
    placeType: "destination",
    importance: spec.importance,
    areaId: spec.areaId,
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
      method: "unknown",
      confidence: "unknown",
      basis:
        "Official sources verify available local modes, but no origin-specific journey time or fare is hard-coded; the origin-aware transport service remains authoritative.",
    },
    recommendedVisitHours: spec.duration?.hours,
    durationMetadata: spec.duration
      ? {
          method: "manual",
          confidence: "medium",
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
      parentDestinationId: "kyoto-city",
      nearbyDestinationIds: spec.nearbyDestinationIds,
    },
    editorial: {
      lifecycle: "approved",
      freshness: "current",
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      reviewedBy: "Meguruto editorial",
      changeSummary:
        "Added current, source-verified Kyoto City depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Kyoto City destination after current operator, government, and tourism-board verification.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

const reviewedCandidates: DestinationWithLocation[] = [
  makeRecord({
    id: "kiyomizu-dera",
    name: "Kiyomizu-dera Temple",
    nameJa: "清水寺",
    aliases: ["Kiyomizu-dera", "Kiyomizudera"],
    officialWebsite: "https://www.kiyomizudera.or.jp/en/location/",
    officialWebsiteRequirement: "required",
    kind: "temple",
    importance: "major",
    areaId: "higashiyama",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 34.994856, lng: 135.78505 },
    location: {
      address: "1-294 Kiyomizu, Higashiyama-ku, Kyoto-shi, Kyoto 605-0862",
      latitude: 34.994856,
      longitude: 135.78505,
    },
    categories: ["Temple", "History", "Culture", "Sightseeing"],
    tags: ["Temple", "History", "Culture", "Photography", "Kyoto City"],
    description:
      "A historic temple complex in eastern Kyoto known for its wooden Main Hall stage, hillside views, and Otowa waterfall.",
    descriptionJa:
      "京都東山の山腹に建つ歴史ある寺院。清水の舞台、境内からの眺望、音羽の滝で知られます。",
    highlights: [
      "Kiyomizu-dera's wooden Main Hall stage",
      "Otowa waterfall and the temple hillside",
      "A core Higashiyama cultural outing",
    ],
    highlightsJa: ["清水の舞台", "音羽の滝", "東山を代表する文化散策"],
    notes:
      "The official approach guidance matters: some map-app routes do not reach the temple grounds correctly. No on-site parking is asserted here.",
    notesJa:
      "公式案内が示す正しい参道をご確認ください。地図アプリによっては境内へ正しく到達できない経路が表示されます。境内駐車場は案内していません。",
    localAccessModes: ["bus", "train"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 1–2 hour estimate from the repository's duration-model-v1 temple band, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://www.kiyomizudera.or.jp/en/location/",
        "Kiyomizu-dera official location and access",
      ),
      source(
        "official",
        "https://www.kiyomizudera.or.jp/en/visit/",
        "Kiyomizu-dera official grounds and visitor guidance",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/gion-kiyomizu/",
        "Kyoto Travel Gion and Kiyomizu area",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg/1280px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-01.jpg",
      "https://commons.wikimedia.org/wiki/File:Kiyomizu-dera,_Kyoto,_November_2016_-01.jpg",
      "CC BY-SA 4.0",
      "Martin Falbisoner, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    nearbyDestinationIds: ["kyoto-historic", "yasaka-shrine", "sanjusangen-do"],
  }),
  makeRecord({
    id: "ninenzaka-sannenzaka",
    name: "Ninenzaka and Sannenzaka Walk",
    nameJa: "二年坂・三年坂",
    aliases: ["Ninenzaka", "Sannenzaka", "二年坂", "三年坂", "産寧坂"],
    officialWebsite:
      "https://kyoto.travel/en/travel-inspiration/how-to-avoid-the-crowds-while-accessing-kiyomizu-temple-and-higashiyama-areas/",
    officialWebsiteRequirement: "recommended",
    kind: "street",
    importance: "major",
    areaId: "higashiyama",
    municipalityId: "Kyoto:kyoto",
    location: {
      address: "Ninenzaka and Sannenzaka, Higashiyama-ku, Kyoto 605-0862",
    },
    categories: ["Street", "Culture", "History", "Walking"],
    tags: ["Historic Street", "Culture", "Walking", "Shopping", "Kyoto City"],
    description:
      "A preserved Higashiyama pedestrian streetscape of stone slopes, traditional buildings, small shops, and the approach to Kiyomizu-dera.",
    descriptionJa:
      "清水寺へ続く東山の歴史的な坂道。伝統的な町家や店が並ぶ二年坂・三年坂の歩行者散策エリアです。",
    highlights: [
      "Traditional Higashiyama streetscape",
      "A coherent walking approach to Kiyomizu-dera",
      "Small shops and cultural townscape rather than a ticketed attraction",
    ],
    highlightsJa: [
      "東山の伝統的な町並み",
      "清水寺へ続く散策路",
      "歴史的な坂道と店舗",
    ],
    notes:
      "This is one district walk, not separate Ninenzaka and Sannenzaka attractions. Visitors should follow local traffic and photography rules.",
    notesJa:
      "二年坂と三年坂を別々の施設として扱わず、一つの町並み散策として掲載しています。現地の交通・撮影ルールに従ってください。",
    localAccessModes: ["bus", "train"],
    sources: [
      source(
        "tourism_board",
        "https://kyoto.travel/en/travel-inspiration/how-to-avoid-the-crowds-while-accessing-kiyomizu-temple-and-higashiyama-areas/",
        "Kyoto Travel Higashiyama and Kiyomizu route",
      ),
      source(
        "government",
        "https://www.city.kyoto.lg.jp/tokei/page/0000281305.html",
        "Kyoto City traditional buildings preservation districts",
      ),
      source(
        "official",
        "https://www.gion.or.jp/around/%E4%BA%8C%E5%B9%B4%E5%9D%82%E3%83%BB%E4%B8%89%E5%B9%B4%E5%9D%82",
        "Gion association Ninenzaka and Sannenzaka",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/%E4%B8%89%E5%B9%B4%E5%9D%82_%E4%BA%8C%E5%B9%B4%E5%9D%82_%E5%AF%8C%E5%A3%AB%E5%B1%8B_%2814005366732%29.jpg/1280px-%E4%B8%89%E5%B9%B4%E5%9D%82_%E4%BA%8C%E5%B9%B4%E5%9D%82_%E5%AF%8C%E5%A3%AB%E5%B1%8B_%2814005366732%29.jpg",
      "https://commons.wikimedia.org/wiki/File:%E4%B8%89%E5%B9%B4%E5%9D%82_%E4%BA%8C%E5%B9%B4%E5%9D%82_%E5%AF%8C%E5%A3%AB%E5%B1%8B_(14005366732).jpg",
      "CC BY 2.0",
      "othree, CC BY 2.0, via Wikimedia Commons",
    ),
    nearbyDestinationIds: ["kiyomizu-dera", "yasaka-shrine", "kyoto-historic"],
  }),
  makeRecord({
    id: "arashiyama-bamboo-togetsukyo",
    name: "Arashiyama Bamboo Grove and Togetsukyo Bridge",
    nameJa: "嵐山竹林・渡月橋",
    aliases: ["Arashiyama Bamboo Grove", "Togetsukyo Bridge", "渡月橋"],
    officialWebsite: "https://kyoto.travel/en/areas/saga-arashiyama/",
    officialWebsiteRequirement: "recommended",
    kind: "nature",
    importance: "major",
    areaId: "arashiyama",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.0128769, lng: 135.6777748 },
    location: {
      address: "Saga-Arashiyama, Ukyo-ku, Kyoto; Togetsukyo Bridge area",
      latitude: 35.0128769,
      longitude: 135.6777748,
    },
    categories: ["Nature", "Scenery", "Outdoors", "Landmark"],
    tags: ["Nature", "Scenery", "Outdoors", "Photography", "Kyoto City"],
    description:
      "A western Kyoto landscape outing combining the Arashiyama bamboo grove, the Katsura River setting, and the Togetsukyo Bridge area.",
    descriptionJa:
      "嵐山の竹林と桂川、渡月橋周辺を一つの景観散策として楽しむ京都西部の代表的なアウトドア行き先です。",
    highlights: [
      "Arashiyama bamboo grove landscape",
      "Togetsukyo Bridge and the Katsura River setting",
      "A public landscape outing reached by several rail corridors",
    ],
    highlightsJa: [
      "嵐山の竹林",
      "桂川と渡月橋の景観",
      "複数の鉄道で訪ねられる景観散策",
    ],
    notes:
      "The coordinate is the official Togetsukyo map anchor and is not a claim that the entire bamboo grove shares one point. Tenryu-ji is modeled separately as the independently visitable temple sibling.",
    notesJa:
      "座標は公式地図に示された渡月橋の基準点で、竹林全体の一点を示すものではありません。独立して拝観できる天龍寺は別の行き先として掲載しています。",
    localAccessModes: ["train", "bus"],
    duration: {
      hours: { min: 3, max: 6 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 3–6 hour estimate from the repository's duration-model-v1 nature band, excluding access time.",
    },
    sources: [
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/saga-arashiyama/",
        "Kyoto Travel Saga and Arashiyama area",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/getting-around/comfortable-access-to-saga-arashiyama/",
        "Kyoto Travel Saga and Arashiyama access",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/destinations/togetsukyo-bridge/",
        "Kyoto Travel Togetsukyo Bridge map and destination page",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Arashiyama_Bamboo_Grove.jpg/1280px-Arashiyama_Bamboo_Grove.jpg",
      "https://commons.wikimedia.org/wiki/File:Arashiyama_Bamboo_Grove.jpg",
      "CC BY 4.0",
      "Mitchwandrew, CC BY 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "tenryu-ji-kyoto",
    name: "Tenryu-ji Temple",
    nameJa: "天龍寺",
    aliases: ["Tenryu-ji", "天龍寺"],
    officialWebsite: "https://www.tenryuji.com/en/visit/index.html",
    officialWebsiteRequirement: "required",
    kind: "temple",
    importance: "major",
    areaId: "arashiyama",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.015859, lng: 135.673685 },
    location: {
      address: "68 Susukinobaba-cho, Saga-Tenryuji, Ukyo-ku, Kyoto 616-8385",
      latitude: 35.015859,
      longitude: 135.673685,
    },
    categories: ["Temple", "History", "Garden", "Culture"],
    tags: ["Temple", "Garden", "History", "Culture", "Kyoto City"],
    description:
      "A major Rinzai Zen temple in Arashiyama with a historic garden, temple buildings, and a separately visitable cultural complex.",
    descriptionJa:
      "嵐山を代表する臨済宗の禅寺。史跡・名勝の庭園と諸堂を備えた、独立して拝観できる文化施設です。",
    highlights: [
      "Sogenchi garden",
      "Historic temple buildings",
      "A cultural sibling to the Arashiyama landscape outing",
    ],
    highlightsJa: [
      "曹源池庭園",
      "歴史ある諸堂",
      "嵐山景観散策と組み合わせやすい文化行き先",
    ],
    notes:
      "Buildings may close without notice and the operator does not accept parking reservations. The garden, buildings, and dragon painting remain one temple record.",
    notesJa:
      "諸堂は予告なく閉鎖される場合があり、駐車場の予約は受け付けていません。庭園・諸堂・雲龍図は一つの寺院記録として扱います。",
    localAccessModes: ["train", "bus", "my_car"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 1–2 hour estimate from the repository's duration-model-v1 temple band, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://www.tenryuji.com/en/visit/index.html",
        "Tenryu-ji official admission and access",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/saga-arashiyama/",
        "Kyoto Travel Saga and Arashiyama area",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Tenryu-ji_Temple_in_Kyoto.jpg/1280px-Tenryu-ji_Temple_in_Kyoto.jpg",
      "https://commons.wikimedia.org/wiki/File:Tenryu-ji_Temple_in_Kyoto.jpg",
      "CC BY-SA 4.0",
      "TarnishedPath, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "gion-hanamikoji-pontocho",
    name: "Gion, Hanamikoji and Pontocho Districts",
    nameJa: "祇園・花見小路・先斗町",
    aliases: ["Gion", "Hanamikoji", "Pontocho", "祇園", "花見小路", "先斗町"],
    officialWebsite: "https://kyoto.travel/en/areas/gion-kiyomizu/",
    officialWebsiteRequirement: "recommended",
    kind: "district",
    importance: "major",
    areaId: "gion",
    municipalityId: "Kyoto:kyoto",
    location: {
      address: "Gion, Hanamikoji and Pontocho, Kyoto City, Kyoto",
    },
    categories: ["Culture", "Nightlife", "Food", "District", "Walking"],
    tags: ["Culture", "Nightlife", "Food", "Walking", "Kyoto City"],
    description:
      "A coherent traditional-district and evening walking experience across Gion, Hanamikoji, and Pontocho's tea-house, dining, and townscape areas.",
    descriptionJa:
      "祇園・花見小路・先斗町の茶屋街、飲食店、歴史的な町並みを一つの伝統文化・夜の散策体験として楽しむエリアです。",
    highlights: [
      "Gion's traditional townscape",
      "Hanamikoji and its tea-house streets",
      "Pontocho dining and evening atmosphere",
    ],
    highlightsJa: [
      "祇園の伝統的な町並み",
      "花見小路の茶屋街",
      "先斗町の飲食と夜の雰囲気",
    ],
    notes:
      "This is one district/evening experience, not three duplicate street cards. Hanamikoji has traffic and photography etiquette restrictions; visitors must follow local rules.",
    notesJa:
      "祇園・花見小路・先斗町を別々の通りカードに分けず、一つの地区・夜の体験として掲載しています。花見小路の交通・撮影マナーを守ってください。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/gion-kiyomizu/",
        "Kyoto Travel Gion and Kiyomizu area",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/central/",
        "Kyoto Travel Central Kyoto districts",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Facade_of_a_dwelling_with_sudare%2C_wooden_balustrades_and_yellow_lamp%2C_Shinbashi-dori%2C_Gion%2C_Kyoto%2C_Japan.jpg/1280px-Facade_of_a_dwelling_with_sudare%2C_wooden_balustrades_and_yellow_lamp%2C_Shinbashi-dori%2C_Gion%2C_Kyoto%2C_Japan.jpg",
      "https://commons.wikimedia.org/wiki/File:Facade_of_a_dwelling_with_sudare,_wooden_balustrades_and_yellow_lamp,_Shinbashi-dori,_Gion,_Kyoto,_Japan.jpg",
      "CC BY-SA 4.0",
      "Basile Morin, CC BY-SA 4.0, via Wikimedia Commons",
    ),
    nearbyDestinationIds: ["yasaka-shrine", "kennin-ji"],
  }),
  makeRecord({
    id: "uzumasa-kyoto-village",
    name: "UZUMASA KYOTO VILLAGE",
    nameJa: "太秦映画村",
    aliases: [
      "Toei Kyoto Studio Park",
      "Toei Uzumasa Eigamura",
      "東映太秦映画村",
    ],
    officialWebsite: "https://en.eigamura.com/",
    officialWebsiteRequirement: "required",
    kind: "theme_park",
    importance: "major",
    areaId: "arashiyama",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.016452, lng: 135.708023 },
    location: {
      address: "10 Higashi Hachiokacho, Uzumasa, Ukyo-ku, Kyoto",
      latitude: 35.016452,
      longitude: 135.708023,
    },
    categories: ["Theme Park", "Family", "Entertainment", "Culture"],
    tags: ["Theme Park", "Family", "Entertainment", "Culture", "Kyoto City"],
    description:
      "A film-themed Kyoto attraction with Edo-period sets, live entertainment, and hands-on historical-film experiences under the current UZUMASA KYOTO VILLAGE brand.",
    descriptionJa:
      "現在のUZUMASA KYOTO VILLAGEブランドで運営される映画・時代劇テーマパーク。江戸の町並みセットやショー、体験型の展示を楽しめます。",
    highlights: [
      "Edo-period film and television sets",
      "Family-friendly live experiences",
      "The current UZUMASA KYOTO VILLAGE renewal",
    ],
    highlightsJa: [
      "時代劇の町並みセット",
      "家族で楽しめる体験・ショー",
      "UZUMASA KYOTO VILLAGEの新しい運営ブランド",
    ],
    notes:
      "The operator publishes different 2–3 hour, half-day, and full-day planning choices; no single visit duration is asserted here. Rides, sets, shows, and temporary events remain components of one park record.",
    notesJa:
      "公式案内には2〜3時間・半日・1日など複数の過ごし方が示されるため、単一の滞在時間は掲載していません。アトラクション、セット、ショー、期間イベントは一つのパーク記録に含めます。",
    localAccessModes: ["train", "bus", "my_car"],
    duration: {
      hours: { min: 4, max: 8 },
      source: durationMethodologySource,
      basis:
        "The operator publishes multiple 2–3 hour, half-day, and full-day planning choices rather than one duration; the repository's conservative theme-park band is used as a 4–8 hour planning window, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://en.eigamura.com/",
        "UZUMASA KYOTO VILLAGE official English site",
      ),
      source(
        "official",
        "https://en.eigamura.com/access/",
        "UZUMASA KYOTO VILLAGE official access",
      ),
      source(
        "official",
        "https://eigamura.com/",
        "UZUMASA KYOTO VILLAGE official Japanese site",
      ),
      source(
        "official",
        "https://global.toei-eigamura.com/",
        "Toei Kyoto Studio Park renewal information",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Rashomon_plate_displayed_at_Uzumasa_Kyoto_Village.jpg/1280px-Rashomon_plate_displayed_at_Uzumasa_Kyoto_Village.jpg",
      "https://commons.wikimedia.org/wiki/File:Rashomon_plate_displayed_at_Uzumasa_Kyoto_Village.jpg",
      "CC0",
      "Bykim2012, CC0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "kurama-dera-kyoto",
    name: "Kurama-dera Temple",
    nameJa: "鞍馬寺",
    aliases: ["Kurama-dera", "Kuramadera"],
    officialWebsite: "https://www.kuramadera.or.jp/access.html",
    officialWebsiteRequirement: "required",
    kind: "temple",
    importance: "notable",
    areaId: "northern-kyoto",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.1181404, lng: 135.7708892 },
    location: {
      address: "1074 Kurama Honmachi, Sakyo-ku, Kyoto 601-1111",
      latitude: 35.1181404,
      longitude: 135.7708892,
    },
    categories: ["Temple", "Mountain", "Hiking", "Nature"],
    tags: ["Temple", "Mountain", "Hiking", "Nature", "Kyoto City"],
    description:
      "A mountain temple reached through Kurama's forested approach, with a cable option and a documented hiking connection toward Kibune.",
    descriptionJa:
      "鞍馬の森に囲まれた山寺。ケーブルを利用する参道と、貴船へ続く山道の起点として知られます。",
    highlights: [
      "Mountain temple approach",
      "Optional Kurama cable route",
      "Hiking connection toward Kibune",
    ],
    highlightsJa: [
      "山中の寺院参道",
      "利用を選べる鞍馬ケーブル",
      "貴船へ続く山道",
    ],
    notes:
      "The main hall, Niomon, cable, Mao-den, and trail are one Kurama-dera outing. The operator advises checking temporary suspensions; no own parking is asserted.",
    notesJa:
      "本殿金堂、仁王門、ケーブル、魔王殿、山道は一つの鞍馬寺行き先として扱います。運休等の臨時変更は公式案内をご確認ください。専用駐車場は掲載していません。",
    localAccessModes: ["train", "bus"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 1–2 hour estimate from the repository's duration-model-v1 temple band, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://www.kuramadera.or.jp/access.html",
        "Kurama-dera official access",
      ),
      source(
        "official",
        "https://www.kuramadera.or.jp/",
        "Kurama-dera official site",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/destinations/kuramadera-temple/",
        "Kyoto Travel Kurama-dera official tourism map anchor",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/kurama-kibune/",
        "Kyoto Travel Kurama and Kibune area",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Kurama-dera_sanmon.jpg/1280px-Kurama-dera_sanmon.jpg",
      "https://commons.wikimedia.org/wiki/File:Kurama-dera_sanmon.jpg",
      "CC BY-SA 3.0",
      "KENPEI, CC BY-SA 3.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "kifune-jinja-kyoto",
    name: "Kifune-jinja Shrine",
    nameJa: "貴船神社",
    aliases: ["Kibune", "Kibune-jinja", "貴船", "貴船神社"],
    officialWebsite: "https://kifunejinja.jp/en/contact/",
    officialWebsiteRequirement: "required",
    kind: "shrine",
    importance: "notable",
    areaId: "northern-kyoto",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.1220909, lng: 135.7629101 },
    location: {
      address: "180 Kurama Kibunecho, Sakyo-ku, Kyoto 601-1112",
      latitude: 35.1220909,
      longitude: 135.7629101,
    },
    categories: ["Shrine", "Culture", "Nature", "Walking"],
    tags: ["Shrine", "Nature", "Culture", "Walking", "Kyoto City"],
    description:
      "A mountain shrine complex in the Kibune valley with a lantern-lined approach, water-luck tradition, and three related shrine sites.",
    descriptionJa:
      "貴船の谷間に鎮座する山の神社。灯籠が並ぶ参道、水にまつわる信仰、三つの社を含む境内で知られます。",
    highlights: [
      "Lantern-lined shrine approach",
      "Water-related shrine tradition",
      "Kibune valley mountain setting",
    ],
    highlightsJa: ["灯籠が並ぶ参道", "水にまつわる信仰", "貴船の谷の山間景観"],
    notes:
      "The three shrine sites, stone-lantern approach, river platforms, and nearby restaurants remain one Kifune-jinja record. Parking is limited and public transport is recommended.",
    notesJa:
      "本宮・結社・奥宮、灯籠参道、川床、周辺飲食店は一つの貴船神社記録に含めます。駐車台数が限られるため公共交通機関が推奨されています。",
    localAccessModes: ["train", "bus", "my_car"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 1–2 hour estimate from the repository's duration-model-v1 shrine band, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://kifunejinja.jp/en/contact/",
        "Kifune Shrine official contact and FAQ",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/destinations/kifunejinja-shrine/",
        "Kyoto Travel Kifune-jinja Shrine",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/kurama-kibune/",
        "Kyoto Travel Kurama and Kibune area",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Torii_and_Omoigawa_Bridge%2C_Kifune_Shrine_2022-08-27.jpg/1280px-Torii_and_Omoigawa_Bridge%2C_Kifune_Shrine_2022-08-27.jpg",
      "https://commons.wikimedia.org/wiki/File:Torii_and_Omoigawa_Bridge,_Kifune_Shrine_2022-08-27.jpg",
      "CC BY 2.0",
      "inunami, CC BY 2.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "sanzen-in-ohara",
    name: "Sanzen-in Temple",
    nameJa: "三千院",
    aliases: ["Sanzen-in", "三千院門跡"],
    officialWebsite: "https://www.sanzenin.or.jp/en/",
    officialWebsiteRequirement: "required",
    kind: "temple",
    importance: "notable",
    areaId: "northern-kyoto",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.119355680329086, lng: 135.83215231524355 },
    location: {
      address: "540 Raigoin-cho, Ohara, Sakyo-ku, Kyoto 601-1242",
      latitude: 35.119355680329086,
      longitude: 135.83215231524355,
    },
    categories: ["Temple", "Garden", "Nature", "Culture"],
    tags: ["Temple", "Garden", "Nature", "Culture", "Kyoto City"],
    description:
      "A temple-and-garden destination in rural Ohara, known for mossy grounds, seasonal scenery, and a quiet northern Kyoto setting.",
    descriptionJa:
      "京都北部の大原にある寺院・庭園。苔むした境内、四季の景観、山里の静かな環境を楽しめます。",
    highlights: [
      "Mossy temple gardens",
      "Rural Ohara setting",
      "A distinct northern-rural Kyoto outing",
    ],
    highlightsJa: ["苔の庭園", "大原の山里の景観", "北部・郊外の京都散策"],
    notes:
      "Sanzen-in is a child of Kyoto City for municipal containment, not of a generic Ohara destination. Ohara remains area context rather than an aggregate card.",
    notesJa:
      "三千院は自治体上の京都市の子行き先として扱い、汎用的な大原カードの子にはしていません。大原はエリア文脈として扱います。",
    localAccessModes: ["bus", "train"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 1–2 hour estimate from the repository's duration-model-v1 temple band, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://www.sanzenin.or.jp/en/",
        "Sanzen-in official visitor information",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/areas/ohara/",
        "Kyoto Travel Ohara area",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Fall_foliage_in_Sanzen-in.jpg/1280px-Fall_foliage_in_Sanzen-in.jpg",
      "https://commons.wikimedia.org/wiki/File:Fall_foliage_in_Sanzen-in.jpg",
      "CC BY-SA 4.0",
      "Charlie fong, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "jakko-in-ohara",
    name: "Jakko-in Temple",
    nameJa: "寂光院",
    aliases: ["Jakko-in", "Jakkoji", "寂光院"],
    officialWebsite: "https://www.jakkoin.jp/haikan/",
    officialWebsiteRequirement: "required",
    kind: "temple",
    importance: "notable",
    areaId: "northern-kyoto",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 35.1241, lng: 135.821045 },
    location: {
      address: "676 Ohara Kusao-cho, Sakyo-ku, Kyoto 601-1248",
      latitude: 35.1241,
      longitude: 135.821045,
    },
    categories: ["Temple", "History", "Garden", "Culture"],
    tags: ["Temple", "Garden", "History", "Culture", "Kyoto City"],
    description:
      "A historic temple in rural Ohara with a garden, steep approach, and a quieter northern Kyoto cultural setting.",
    descriptionJa:
      "大原の山里にある歴史ある寺院。庭園と階段のある参道、静かな北部京都の文化景観を楽しめます。",
    highlights: [
      "Historic Ohara temple",
      "Garden and steep approach",
      "A sibling to Sanzen-in rather than a generic Ohara aggregate",
    ],
    highlightsJa: [
      "大原の歴史ある寺院",
      "庭園と階段の参道",
      "三千院と並ぶ個別の大原行き先",
    ],
    notes:
      "Temporary closures and visitor hours should be rechecked before a trip. The temple, garden, gallery, and approach remain one canonical record.",
    notesJa:
      "臨時休観や拝観時間は訪問前に再確認してください。寺院・庭園・ギャラリー・参道は一つの記録として扱います。",
    localAccessModes: ["bus", "train"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      basis:
        "No official duration was published; conservative 1–2 hour estimate from the repository's duration-model-v1 temple band, excluding access time.",
    },
    sources: [
      source(
        "official",
        "https://www.jakkoin.jp/haikan/",
        "Jakko-in official visiting information",
      ),
      source(
        "tourism_board",
        "https://kyoto.travel/en/destinations/jakkoin-temple/",
        "Kyoto Travel Jakko-in Temple",
      ),
      source(
        "tourism_board",
        "https://www.japan.travel/en/spot/1119/",
        "JNTO Jakko-in information",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Jakko-Ji_Sadamitsuji_%28Sakyo-ku_Kyoto%29_hdsr_Sh%C5%8Dr%C5%8D_S5_01.jpg/1280px-Jakko-Ji_Sadamitsuji_%28Sakyo-ku_Kyoto%29_hdsr_Sh%C5%8Dr%C5%8D_S5_01.jpg",
      "https://commons.wikimedia.org/wiki/File:Jakko-Ji_Sadamitsuji_(Sakyo-ku_Kyoto)_hdsr_Sh%C5%8Dr%C5%8D_S5_01.jpg",
      "CC BY 4.0",
      "Hyppolyte de Saint-Rambert, CC BY 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "fushimi-sake-district",
    name: "Fushimi Sake District",
    nameJa: "酒どころ伏見",
    aliases: ["Fushimi sake", "Fushimi Momoyama", "伏見桃山さんぽ"],
    officialWebsite: "https://www.gekkeikan.com/museum/fushimi/",
    officialWebsiteRequirement: "recommended",
    kind: "district",
    importance: "notable",
    areaId: "fushimi",
    municipalityId: "Kyoto:kyoto",
    location: {
      address: "Fushimi Momoyama and Chushojima, Fushimi-ku, Kyoto",
    },
    categories: ["Food", "Sake", "Culture", "History", "District"],
    tags: ["Food", "Sake", "Culture", "History", "Walking", "Kyoto City"],
    description:
      "A Fushimi walking and food-heritage district combining sake history, breweries, canals, museums, and the Fushimi Momoyama streetscape.",
    descriptionJa:
      "酒蔵、酒造りの歴史、運河、博物館、伏見桃山の町並みをめぐる京都南部の食文化・産業遺産散策エリアです。",
    highlights: [
      "Fushimi sake-making heritage",
      "Breweries, canals, and historic streets",
      "A distinct outing from Fushimi Inari Taisha",
    ],
    highlightsJa: [
      "伏見の酒造り文化",
      "酒蔵・運河・歴史的な町並み",
      "伏見稲荷大社とは異なる南部京都の行き先",
    ],
    notes:
      "This is one district anchor. Individual breweries, restaurants, shopping arcades, boat rides, and generic food-market context are not separate destination records.",
    notesJa:
      "地区全体を一つの行き先として扱います。個別の酒蔵、飲食店、商店街、舟遊び、一般的な食市場は別の目的地レコードに分けません。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        "https://www.gekkeikan.com/museum/fushimi/",
        "Gekkeikan official Fushimi sake walk",
      ),
      source(
        "official",
        "https://www.gekkeikan.co.jp/enjoy/museum/fushimi/",
        "Gekkeikan official 伏見桃山さんぽ map",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Sign%2C_Fujioka_Sake_Brewery%2C_Fushimi%2C_Kyoto_-_Sep_30%2C_2016.jpg/1280px-Sign%2C_Fujioka_Sake_Brewery%2C_Fushimi%2C_Kyoto_-_Sep_30%2C_2016.jpg",
      "https://commons.wikimedia.org/wiki/File:Sign,_Fujioka_Sake_Brewery,_Fushimi,_Kyoto_-_Sep_30,_2016.jpg",
      "CC BY-SA 2.0",
      "Richard, enjoy my life!, CC BY-SA 2.0, via Wikimedia Commons",
    ),
    nearbyDestinationIds: ["fushimi-inari-taisha"],
  }),
  makeRecord({
    id: "gekkeikan-okura-sake-museum",
    name: "Gekkeikan Okura Sake Museum",
    nameJa: "月桂冠大倉記念館",
    aliases: ["Gekkeikan Okura Memorial Museum", "月桂冠大倉記念館"],
    officialWebsite: "https://www.gekkeikan.com/museum",
    officialWebsiteRequirement: "required",
    kind: "museum",
    importance: "notable",
    areaId: "fushimi",
    municipalityId: "Kyoto:kyoto",
    coordinates: { lat: 34.933582, lng: 135.766039 },
    location: {
      address: "247 Minamihama-cho, Fushimi-ku, Kyoto 612-8660",
      latitude: 34.933582,
      longitude: 135.766039,
    },
    categories: ["Museum", "Food", "Sake", "Culture", "Indoor"],
    tags: ["Museum", "Sake", "Food", "Culture", "Indoor", "Kyoto City"],
    description:
      "A Fushimi museum documenting Gekkeikan's sake history, brewing culture, tools, and the local water-and-sake tradition.",
    descriptionJa:
      "伏見の酒造りの歴史、道具、仕込み文化、名水と酒の関わりを紹介する月桂冠の博物館です。",
    highlights: [
      "Fushimi sake history",
      "Traditional brewing tools and exhibits",
      "A compact indoor sibling to the wider Fushimi sake district",
    ],
    highlightsJa: [
      "伏見の酒造りの歴史",
      "伝統的な酒造道具と展示",
      "伏見酒どころ散策と組み合わせやすい屋内博物館",
    ],
    notes:
      "The operator currently recommends online reservation and describes a roughly 40–60 minute visit. Capacity, payment, tasting, and group rules can change; check the current visitor page.",
    notesJa:
      "公式案内ではオンライン予約が推奨され、所要時間は約40〜60分とされています。定員、支払、試飲、団体条件は変更される場合があります。",
    localAccessModes: ["train", "bus"],
    sources: [
      source(
        "official",
        "https://www.gekkeikan.com/museum",
        "Gekkeikan Okura Sake Museum official site",
      ),
      source(
        "official",
        "https://www.gekkeikan.co.jp/enjoy/museum/access/",
        "Gekkeikan official visitor and access information",
      ),
      source(
        "official",
        "https://www.gekkeikan.com/museum/fushimi/",
        "Gekkeikan official Fushimi sake walk",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Gekkeikan_Okura_Sake_Museum01nt3200.jpg/1280px-Gekkeikan_Okura_Sake_Museum01nt3200.jpg",
      "https://commons.wikimedia.org/wiki/File:Gekkeikan_Okura_Sake_Museum01nt3200.jpg",
      "CC BY 2.5",
      "663highland, CC BY 2.5, via Wikimedia Commons",
    ),
    duration: {
      // The validator stores visit hours to one decimal place. 40 minutes is
      // conservatively represented as 0.7 hours rather than false precision.
      hours: { min: 0.7, max: 1 },
      source: source(
        "official",
        "https://www.gekkeikan.co.jp/enjoy/museum/access/",
        "Gekkeikan official approximate visit duration",
      ),
      basis:
        "Official visitor information states an approximate 40–60 minute visit; converted to hours without adding travel time.",
    },
  }),
];

// These composite area candidates remain in the review matrix above, but the
// current catalogue contract requires coordinates and their authoritative
// sources do not provide one canonical point for the whole experience.
const deferredWithoutCanonicalCoordinate = new Set([
  "ninenzaka-sannenzaka",
  "gion-hanamikoji-pontocho",
  "fushimi-sake-district",
]);
const candidates = reviewedCandidates.filter(
  (candidate) => !deferredWithoutCanonicalCoordinate.has(candidate.id),
);

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const existingNames = new Map<string, string>();
for (const destination of catalog) {
  for (const candidate of [destination.name, ...(destination.aliases ?? [])]) {
    const key = normalize(candidate);
    if (key.length >= 6) existingNames.set(key, destination.id);
  }
}

const addedIds: string[] = [];
const enrichedIds: string[] = [];
for (const candidate of candidates) {
  const existing = byId.get(candidate.id);
  if (existing) {
    if (
      existing.name !== candidate.name ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(
        `${candidate.id}: existing record conflicts with the verified KAI-145 identity`,
      );
    }
    if (candidate.recommendedVisitHours && !existing.recommendedVisitHours) {
      existing.recommendedVisitHours = candidate.recommendedVisitHours;
      existing.durationMetadata = candidate.durationMetadata;
      if (existing.editorial && candidate.editorial?.fieldSources) {
        existing.editorial.fieldSources = {
          ...existing.editorial.fieldSources,
          recommendedVisitHours:
            candidate.editorial.fieldSources.recommendedVisitHours,
        };
      }
      enrichedIds.push(candidate.id);
    }
    if (
      candidate.durationMetadata?.method === "manual" &&
      !candidate.editorial?.fieldSources?.recommendedVisitHours &&
      existing.editorial?.fieldSources?.recommendedVisitHours
    ) {
      delete existing.editorial.fieldSources.recommendedVisitHours;
      enrichedIds.push(candidate.id);
    }
    continue;
  }

  for (const name of [
    candidate.name,
    candidate.nameJa,
    ...(candidate.aliases ?? []),
  ]) {
    const key = normalize(name);
    if (key.length < 6) continue;
    const duplicateId = existingNames.get(key);
    if (duplicateId) {
      throw new Error(
        `${candidate.id}: normalized name/alias '${name}' duplicates existing ${duplicateId}`,
      );
    }
  }

  const parent = byId.get("kyoto-city");
  if (!parent || parent.role !== "hub") {
    throw new Error("kyoto-city hub is required before adding Kyoto children");
  }
  if (candidate.municipalityId !== parent.municipalityId) {
    throw new Error(`${candidate.id}: municipality does not match kyoto-city`);
  }

  catalog.push(candidate);
  byId.set(candidate.id, candidate);
  for (const name of [
    candidate.name,
    candidate.nameJa,
    ...(candidate.aliases ?? []),
  ]) {
    const key = normalize(name);
    if (key.length >= 6) existingNames.set(key, candidate.id);
  }
  addedIds.push(candidate.id);
}

for (const candidate of candidates) {
  for (const relatedId of [
    candidate.relationships?.parentDestinationId,
    ...(candidate.relationships?.nearbyDestinationIds ?? []),
  ].filter((value): value is string => Boolean(value))) {
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
    ? `KAI-145: added ${addedIds.length} Kyoto City destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-145: catalogue already contains the verified Kyoto records; no changes made",
);
