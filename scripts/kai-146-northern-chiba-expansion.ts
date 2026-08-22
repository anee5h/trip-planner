/**
 * KAI-146 — verified Northern Chiba destination depth.
 *
 * The catalogue already has broad Funabashi, Matsudo, Choshi, Kisarazu, and
 * Sakura context. This script adds only independently visitable anchors that
 * were checked against current operator, government, or official tourism
 * sources. It deliberately leaves broad coast/market candidates and the
 * temporarily closed Matsudo City Museum out of production data.
 *
 * Usage: tsx scripts/kai-146-northern-chiba-expansion.ts
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

type ChibaSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases?: string[];
  officialWebsite: string;
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  areaId?: string;
  municipalityId: string;
  coordinates?: { lat: number; lng: number };
  location: DestinationWithLocation["location"];
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
  relatedDestinationIds?: string[];
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

const gsiCoordinateSource = (address: string) =>
  source(
    "government",
    `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`,
    `GSI Address Search coordinate for ${address}`,
  );

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
    "Official sources provide access, facility, or event context but not a defensible four-season suitability score; unknown is preserved.",
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
): ChibaSpec["image"] => ({
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

const makeRecord = (spec: ChibaSpec): DestinationWithLocation => {
  const primarySource = spec.sources[0];
  const accessSource =
    spec.sources.find((candidate) =>
      /access|route|transport|station|walk/i.test(candidate.title),
    ) ?? primarySource;
  const coordinateSource = spec.sources.find((candidate) =>
    /coordinate|map|location/i.test(candidate.title),
  );
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
    fieldSources.coordinates = [coordinateSource ?? primarySource];
  }
  if (spec.duration?.source.type === "calculated") {
    fieldSources.recommendedVisitHours = [spec.duration.source];
  }

  const reservation =
    spec.reservation ??
    "Check the official visitor guidance for current reservation and admission rules.";
  const parking =
    spec.parking ??
    "Use public transport where possible; check the official visitor guidance for current parking conditions.";

  const relationships: NonNullable<Destination["relationships"]> = {};
  if (spec.parentDestinationId) {
    relationships.parentDestinationId = spec.parentDestinationId;
  }
  if (spec.relatedDestinationIds) {
    relationships.relatedDestinationIds = spec.relatedDestinationIds;
  }

  return {
    id: spec.id,
    officialWebsite: spec.officialWebsite,
    officialWebsiteRequirement: "required",
    name: spec.name,
    nameJa: spec.nameJa,
    aliases: spec.aliases,
    municipalityId: spec.municipalityId,
    prefecture: "Chiba",
    region: "Kanto",
    kind: spec.kind,
    role: spec.parentDestinationId ? "poi" : "standalone",
    placeType: "destination",
    importance: spec.importance,
    areaId: spec.areaId,
    coordinates: spec.coordinates,
    location: spec.location,
    categories: spec.categories,
    tags: spec.tags,
    description: spec.description,
    highlights: spec.highlights,
    content: {
      en: {
        name: spec.name,
        description: spec.description,
        highlights: spec.highlights,
        notes: spec.notes,
        reservation,
        parking,
        openingHours:
          "Visitor hours and closures vary by date; check the official visitor guidance before visiting.",
      },
      ja: {
        name: spec.nameJa,
        description: spec.descriptionJa,
        highlights: spec.highlightsJa,
        notes: spec.notesJa,
        reservation:
          "予約・利用条件は変更される場合があるため、訪問前に公式案内をご確認ください。",
        parking:
          "可能な限り公共交通機関をご利用ください。駐車場の条件は公式案内をご確認ください。",
        openingHours:
          "利用時間・休業日は変更される場合があるため、訪問前に公式案内をご確認ください。",
      },
    },
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
    reservation,
    parking,
    notes: spec.notes,
    notesJa: spec.notesJa,
    status: "verified",
    travelEstimate: { confidence: "beta" },
    collections: [],
    relationships,
    editorial: {
      lifecycle: "approved",
      freshness: "current",
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      reviewedBy: "Meguruto editorial",
      changeSummary:
        "Added current, source-verified Northern Chiba destination depth coverage.",
      sources: spec.sources,
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added one canonical Northern Chiba destination after current operator, government, and tourism-board verification.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

const reviewedCandidates: DestinationWithLocation[] = [
  makeRecord({
    id: "funabashi-andersen-park",
    name: "H.C. Andersen Park",
    nameJa: "ふなばしアンデルセン公園",
    aliases: ["Funabashi Andersen Park", "ふなばしアンデルセンパーク"],
    officialWebsite: "https://www.park-funabashi.or.jp/and/",
    kind: "park",
    importance: "major",
    municipalityId: "Chiba:funabashi",
    coordinates: { lat: 35.75853, lng: 140.058273 },
    location: {
      address: "525 Kanehoricho, Funabashi, Chiba 274-0054",
      latitude: 35.75853,
      longitude: 140.058273,
    },
    categories: ["Park", "Family", "Nature", "Outdoors"],
    tags: ["Park", "Family", "Nature", "Outdoors", "Funabashi"],
    description:
      "A large family-oriented park with play areas, animals, gardens, nature, and children's art experiences in northern Funabashi.",
    descriptionJa:
      "船橋市北部にある、遊具、動物、花畑、自然、子ども美術館などを備えた家族向けの大規模な公園です。",
    highlights: [
      "Five themed park zones",
      "Family play, animals, gardens, and nature",
      "A substantial bus-accessible outing from the Funabashi area",
    ],
    highlightsJa: [
      "5つのゾーンで構成された園内",
      "遊び・動物・花・自然・子ども美術館",
      "船橋エリアからバスで訪ねるまとまった公園行き先",
    ],
    notes:
      "The operator publishes five course examples ranging from roughly 3 to 5.5 hours. The park is not a rail-station destination; check the current bus and parking guidance.",
    notesJa:
      "公式には約3〜5.5時間の5つの園内コース例が案内されています。駅前の行き先ではないため、訪問前にバスと駐車場の公式案内をご確認ください。",
    localAccessModes: ["bus", "car", "my_car"],
    parentDestinationId: "funabashi-city",
    duration: {
      hours: { min: 3, max: 5.5 },
      source: source(
        "official",
        "https://www.park-funabashi.or.jp/and/course.html",
        "H.C. Andersen Park official course examples",
      ),
      confidence: "high",
      basis:
        "The operator publishes five sample courses ranging from approximately 3 to 5.5 hours; this range excludes origin travel time.",
    },
    reservation:
      "Check the operator's current visitor, event, and ticket guidance before visiting.",
    parking:
      "On-site parking is documented by the operator; check current capacity and access guidance.",
    sources: [
      source(
        "official",
        "https://www.park-funabashi.or.jp/and/",
        "H.C. Andersen Park official site",
      ),
      source(
        "official",
        "https://www.park-funabashi.or.jp/and/access.html",
        "H.C. Andersen Park official access and parking",
      ),
      source(
        "government",
        "https://www.city.funabashi.lg.jp/shisetsu/kouenshimminnomori/0001/0001/0001/p011324.html",
        "Funabashi City H.C. Andersen Park facility page",
      ),
      gsiCoordinateSource("千葉県船橋市金堀町525"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Funabashi-Andersen-Park_33.jpg/1280px-Funabashi-Andersen-Park_33.jpg",
      "https://commons.wikimedia.org/wiki/File:Funabashi-Andersen-Park_33.jpg",
      "CC BY 4.0",
      "RuinDig/Yuki Uchida, CC BY 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "nakayama-hokekyoji-ichikawa",
    name: "Nakayama Hokekyo-ji Temple",
    nameJa: "日蓮宗大本山 中山法華経寺",
    aliases: ["Hokekyo-ji", "Nakayama Hokekyoji", "中山法華経寺"],
    officialWebsite: "https://hokekyoji2101.wixsite.com/nakayama",
    kind: "temple",
    importance: "major",
    municipalityId: "Chiba:ichikawa",
    coordinates: { lat: 35.721226, lng: 139.948273 },
    location: {
      address: "2-10-1 Nakayama, Ichikawa, Chiba 272-0813",
      latitude: 35.721226,
      longitude: 139.948273,
    },
    categories: ["Temple", "History", "Culture", "Architecture"],
    tags: ["Temple", "History", "Culture", "Ichikawa", "Commuter Belt"],
    description:
      "A major Nichiren Buddhist temple in Ichikawa with nationally designated cultural properties and a substantial historic precinct.",
    descriptionJa:
      "市川市中山にある日蓮宗の大本山。国宝や重要文化財を含む歴史的な伽藍を備えた寺院です。",
    highlights: [
      "Historic Nakayama temple precinct",
      "Nationally designated cultural properties",
      "A rail-accessible cultural outing in the northern Chiba commuter belt",
    ],
    highlightsJa: [
      "歴史ある中山の境内",
      "国宝・重要文化財を含む文化財",
      "北部千葉の鉄道で訪ねやすい文化散策",
    ],
    notes:
      "The exact access to individual halls and collections varies; this record represents the temple precinct rather than promising unrestricted interior access.",
    notesJa:
      "堂宇や収蔵品の拝観条件は場所ごとに異なります。本記録は寺院境内を扱い、すべての内部を自由に見学できるとは案内していません。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 1.5, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was found; a conservative 1.5–3 hour temple-precinct estimate is derived from the repository methodology, excluding travel time.",
    },
    sources: [
      source(
        "official",
        "https://hokekyoji2101.wixsite.com/nakayama",
        "Nakayama Hokekyo-ji official temple site",
      ),
      source(
        "government",
        "https://www.city.ichikawa.lg.jp/culture/24238.html",
        "Ichikawa City Hokekyo-ji cultural-property page",
      ),
      source(
        "tourism_board",
        "https://www.ichikawa-kankou.jp/type-a/%E6%97%A5%E8%93%AE%E5%AE%97-%E5%A4%A7%E6%9C%AC%E5%B1%B1-%E4%B8%AD%E5%B1%B1-%E6%B3%95%E8%8F%AF%E7%B5%8C%E5%AF%BA/",
        "Ichikawa Tourism Association Nakayama Hokekyo-ji",
      ),
      source(
        "official",
        "https://temple.nichiren.or.jp/1041026-hokekyoji/",
        "Nichiren Shu Nakayama Hokekyo-ji page",
      ),
      gsiCoordinateSource("千葉県市川市中山2-10-1"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Nakayama_Hokekyoji_temple.jpg/1280px-Nakayama_Hokekyoji_temple.jpg",
      "https://commons.wikimedia.org/wiki/File:Nakayama_Hokekyoji_temple.jpg",
      "CC BY-SA 4.0",
      "ママさん, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "tojo-tei-matsudo",
    name: "Tojo-tei House and Tojo Historical Museum",
    nameJa: "戸定邸・戸定歴史館",
    aliases: ["Tojo-tei", "Tojo Residence", "戸定邸"],
    officialWebsite: "https://www.city.matsudo.chiba.jp/tojo/",
    kind: "historic",
    importance: "major",
    municipalityId: "Chiba:matsudo",
    coordinates: { lat: 35.776695, lng: 139.900284 },
    location: {
      address: "714-1 Matsudo, Matsudo, Chiba 271-0092",
      latitude: 35.776695,
      longitude: 139.900284,
    },
    categories: ["History", "Museum", "Garden", "Culture"],
    tags: ["History", "Museum", "Garden", "Culture", "Matsudo"],
    description:
      "A coherent Matsudo historic outing combining the nationally designated Tojo-tei residence, its garden, adjacent historical museum, and park setting.",
    descriptionJa:
      "国指定重要文化財の戸定邸と庭園、隣接する戸定歴史館、公園の景観を一つの歴史文化散策として楽しめる松戸の行き先です。",
    highlights: [
      "Tojo-tei historic residence",
      "Adjacent Tojo Historical Museum",
      "Garden and hilltop views near Matsudo Station",
    ],
    highlightsJa: ["戸定邸", "隣接する戸定歴史館", "庭園と高台の景観"],
    notes:
      "This is one complex, not separate records for the residence, garden, museum, and park. The current city notice reports a partial corridor restriction while public areas remain visitable; check it before visiting.",
    notesJa:
      "邸宅・庭園・歴史館・公園を別々の記録には分けていません。現在の市の案内では一部通路に制限がある一方、公開エリアは見学できます。訪問前に最新状況をご確認ください。",
    localAccessModes: ["train", "car", "my_car"],
    parentDestinationId: "matsudo-city",
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was found; a conservative 1–2 hour historic-complex estimate is derived from the repository methodology, excluding travel time.",
    },
    parking:
      "Matsudo City publishes parking guidance; bus parking requires advance contact. Check current conditions before arrival.",
    sources: [
      source(
        "official",
        "https://www.city.matsudo.chiba.jp/tojo/",
        "Matsudo City official Tojo-tei site",
      ),
      source(
        "official",
        "https://www.city.matsudo.chiba.jp/tojo/annai.html",
        "Matsudo City Tojo-tei facility and access guide",
      ),
      source(
        "official",
        "https://www.city.matsudo.chiba.jp/tojo/oshirase/open_schedule.html",
        "Matsudo City current Tojo-tei opening/status notice",
      ),
      gsiCoordinateSource("千葉県松戸市松戸714-1"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Tojo-tei_02.jpg/1280px-Tojo-tei_02.jpg",
      "https://commons.wikimedia.org/wiki/File:Tojo-tei_02.jpg",
      "CC BY-SA 4.0",
      "Suikotei, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "yagiri-no-watashi-matsudo",
    name: "Yagiri-no-Watashi Ferry",
    nameJa: "矢切の渡し",
    aliases: ["Yagiri Ferry", "Yagiri-no-Watashi", "矢切の渡し船"],
    officialWebsite: "https://maruchiba.jp/spot/detail_10042.html",
    kind: "mixed",
    importance: "notable",
    municipalityId: "Chiba:matsudo",
    coordinates: { lat: 35.75901, lng: 139.885132 },
    location: {
      address: "1257 Shimoyagiri, Matsudo, Chiba 271-0096",
      latitude: 35.75901,
      longitude: 139.885132,
    },
    categories: ["River", "Culture", "Scenery", "Outdoors"],
    tags: ["River Crossing", "River", "Scenery", "Matsudo", "Shibamata"],
    description:
      "A historic Edo River ferry outing linking the Matsudo/Yagiri landing with the Shibamata side of the river.",
    descriptionJa:
      "松戸・矢切側と対岸の柴又側を江戸川で結ぶ、歴史ある渡船を中心とした川辺の行き先です。",
    highlights: [
      "Edo River crossing",
      "Matsudo/Yagiri and Shibamata-side walking context",
      "A small-scale heritage and riverside experience",
    ],
    highlightsJa: [
      "江戸川の渡船",
      "矢切・柴又を結ぶ川辺の散策",
      "歴史ある小さな体験",
    ],
    notes:
      "Current prefectural tourism information says the service is not currently hand-rowed. Weather can stop the crossing, so confirm current operation by phone before relying on it for a timed itinerary.",
    notesJa:
      "現在の県観光案内では手漕ぎ運航ではないと案内されています。天候で休航する場合があるため、時間を決めた行程では訪問前に電話で運航をご確認ください。",
    localAccessModes: ["train", "bus", "car", "my_car"],
    parentDestinationId: "matsudo-city",
    duration: {
      hours: { min: 0.5, max: 1.5 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was found; a conservative short ferry-and-riverside estimate is derived from the repository methodology, excluding access and any onward Shibamata walk.",
    },
    reservation:
      "No reservation is asserted; operation is weather-dependent and current tourism guidance recommends confirming service.",
    parking:
      "Access guidance emphasizes station, bus, taxi, and walking options; check current local parking conditions rather than assuming a dedicated lot.",
    sources: [
      source(
        "tourism_board",
        "https://maruchiba.jp/spot/detail_10042.html",
        "Chiba official tourism Yagiri-no-Watashi page",
      ),
      source(
        "official",
        "https://www.hokuso-railway.co.jp/railway/station/yagiri.html",
        "Hokuso Railway Yagiri Station access",
      ),
      gsiCoordinateSource("千葉県松戸市下矢切1257"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/YagiriNoWatashi_Matsudo_Chiba_Japan_JAN2016.jpg/1280px-YagiriNoWatashi_Matsudo_Chiba_Japan_JAN2016.jpg",
      "https://commons.wikimedia.org/wiki/File:YagiriNoWatashi_Matsudo_Chiba_Japan_JAN2016.jpg",
      "CC BY-SA 4.0",
      "Ka23 13, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "akebonoyama-agricultural-park-kashiwa",
    name: "Akebonoyama Agricultural Park",
    nameJa: "あけぼの山農業公園",
    aliases: ["Akebonoyama Park", "あけぼの山公園"],
    officialWebsite: "https://akebonoyama-nougyoukouen.jp/",
    kind: "park",
    importance: "notable",
    municipalityId: "Chiba:kashiwa",
    coordinates: { lat: 35.891518, lng: 139.992828 },
    location: {
      address: "2005-2 Fuse, Kashiwa, Chiba 277-0825",
      latitude: 35.891518,
      longitude: 139.992828,
    },
    categories: ["Park", "Nature", "Flowers", "Agriculture"],
    tags: ["Park", "Flowers", "Nature", "Agriculture", "Kashiwa"],
    description:
      "A municipal agricultural and flower park in Kashiwa with gardens, farm-themed facilities, nature, and recurring events.",
    descriptionJa:
      "柏市北部にある農業と花をテーマにした公園。庭園、農業体験、自然、季節の催しを楽しめます。",
    highlights: [
      "Flower and garden landscapes",
      "Agricultural and nature-oriented facilities",
      "A distinct Kashiwa outing outside the central Tokyo commuter corridor",
    ],
    highlightsJa: [
      "花と庭園の景観",
      "農業・自然に触れる施設",
      "柏北部の公園散策",
    ],
    notes:
      "The city treats Akebonoyama Park and the Agricultural Park as one adjacent public complex; this record intentionally does not split the zones. Flower timing is useful context but is not encoded as a numeric season score.",
    notesJa:
      "市の案内に合わせ、あけぼの山公園と農業公園を一つの隣接する公園群として扱っています。花の時期は参考情報にとどめ、数値の季節スコアは設定していません。",
    localAccessModes: ["bus", "car", "my_car"],
    duration: {
      hours: { min: 2, max: 3 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was found; a conservative 2–3 hour park estimate is derived from the repository methodology, excluding travel time.",
    },
    parking:
      "Kashiwa City and the operator publish car and parking guidance; check current capacity and event-day restrictions.",
    sources: [
      source(
        "official",
        "https://akebonoyama-nougyoukouen.jp/",
        "Akebonoyama Agricultural Park official site",
      ),
      source(
        "government",
        "https://www.city.kashiwa.lg.jp/facilities/park/akebonoyama-nogyo.html",
        "Kashiwa City Akebonoyama facility page",
      ),
      source(
        "tourism_board",
        "https://maruchiba.jp/spot/detail_10028.html",
        "Chiba official tourism Akebonoyama page",
      ),
      gsiCoordinateSource("千葉県柏市布施2005-2"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Akebonoyama_Agricultural_Park.JPG/1280px-Akebonoyama_Agricultural_Park.JPG",
      "https://commons.wikimedia.org/wiki/File:Akebonoyama_Agricultural_Park.JPG",
      "Public domain",
      "Abasaa, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "shimizu-park-noda",
    name: "Shimizu Park",
    nameJa: "清水公園",
    aliases: ["Shimizu-koen", "清水公園（野田市）"],
    officialWebsite: "https://www.shimizu-kouen.com/",
    kind: "park",
    importance: "major",
    municipalityId: "Chiba:noda",
    coordinates: { lat: 35.96006, lng: 139.85083 },
    location: {
      address: "906 Shimizu, Noda, Chiba 278-0043",
      latitude: 35.96006,
      longitude: 139.85083,
    },
    categories: ["Park", "Nature", "Family", "Outdoors"],
    tags: ["Park", "Family", "Nature", "Outdoors", "Noda"],
    description:
      "A large active park in Noda combining seasonal gardens, outdoor facilities, camping and BBQ, fishing, and family activities.",
    descriptionJa:
      "野田市にある大規模な公園。季節の庭園、アウトドア施設、キャンプ・バーベキュー、釣り、家族向け体験が集まります。",
    highlights: [
      "Seasonal gardens and broad park grounds",
      "Outdoor, camping, BBQ, fishing, and family facilities",
      "A station-accessible Noda day-outing anchor",
    ],
    highlightsJa: [
      "季節の庭園と広い園内",
      "アウトドア・キャンプ・BBQ・釣り",
      "野田の駅から訪ねる公園行き先",
    ],
    notes:
      "Facilities such as field athletics and Aqua Venture can require reservations or have capacity and weather restrictions. This is one park record, not a record for every paid facility.",
    notesJa:
      "フィールドアスレチックやアクアベンチャーなどは予約・定員・天候による制限があります。個々の有料施設を別々の記録には分けていません。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 3, max: 6 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was found; a conservative 3–6 hour park estimate is derived from the repository methodology, depending on selected facilities and excluding travel time.",
    },
    reservation:
      "Some activities require advance reservation or have capacity limits; check the operator's current facility guidance.",
    parking:
      "The operator publishes car and parking guidance; check current availability and event-day conditions.",
    sources: [
      source(
        "official",
        "https://www.shimizu-kouen.com/",
        "Shimizu Park official operator site",
      ),
      source(
        "government",
        "https://www.city.noda.chiba.jp/shisei/profile/bunkazai/kouen/1000808.html",
        "Noda City Shimizu Park page",
      ),
      source(
        "tourism_board",
        "https://www.japan.travel/en/spot/2233/",
        "JNTO Shimizu Park visitor information",
      ),
      gsiCoordinateSource("千葉県野田市清水906"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Shimizu_Park_%28Noda%29_201905.jpg/1280px-Shimizu_Park_%28Noda%29_201905.jpg",
      "https://commons.wikimedia.org/wiki/File:Shimizu_Park_(Noda)_201905.jpg",
      "CC BY-SA 4.0",
      "Suikotei, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "kikkoman-soy-sauce-museum-noda",
    name: "Kikkoman Soy Sauce Museum",
    nameJa: "キッコーマンもの知りしょうゆ館",
    aliases: ["Kikkoman Noda Factory Tour", "Kikkoman Soy Sauce Museum Noda"],
    officialWebsite: "https://www.kikkoman.com/en/culture/soysaucemuseum/",
    kind: "museum",
    importance: "notable",
    municipalityId: "Chiba:noda",
    coordinates: { lat: 35.941463, lng: 139.870667 },
    location: {
      address: "110 Noda, Noda, Chiba 278-0037",
      latitude: 35.941463,
      longitude: 139.870667,
    },
    categories: ["Museum", "Food", "Industry", "Culture", "Indoor"],
    tags: ["Museum", "Food", "Industry", "Culture", "Noda"],
    description:
      "An operator-run museum and factory-tour destination covering Kikkoman's soy-sauce history, production, and food culture in Noda.",
    descriptionJa:
      "野田の醤油文化とキッコーマンの歴史・製造を紹介する、工場見学と一体の企業博物館です。",
    highlights: [
      "Soy-sauce history and production exhibits",
      "A concrete anchor for Noda's food and industry heritage",
      "A short walk from Nodashi Station",
    ],
    highlightsJa: [
      "醤油の歴史と製造展示",
      "野田の食・産業遺産を代表する具体的な行き先",
      "野田市駅から徒歩圏",
    ],
    notes:
      "Factory tours require reservation. Reception windows, holidays, and visitor conditions can change, so the operator's current reservation page remains authoritative.",
    notesJa:
      "工場見学は予約が必要です。受付時間、休業日、見学条件は変更される場合があるため、公式予約案内をご確認ください。",
    localAccessModes: ["train"],
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No fixed official visit window was used; a conservative 1–2 hour museum/tour estimate is derived from the repository methodology, excluding travel time.",
    },
    reservation:
      "Advance reservation is required for factory tours; check the operator's current visitor guidance.",
    parking:
      "Use the operator's current access guidance; no unverified parking capacity or fee is hard-coded.",
    sources: [
      source(
        "official",
        "https://www.kikkoman.com/en/culture/soysaucemuseum/",
        "Kikkoman Soy Sauce Museum official page",
      ),
      source(
        "official",
        "https://www.kikkoman.com/en/culture/foodeducation/plant.html",
        "Kikkoman Noda factory-tour information",
      ),
      source(
        "tourism_board",
        "https://maruchiba.jp/feature/detail_528.html",
        "Chiba official Noda soy-sauce feature",
      ),
      gsiCoordinateSource("千葉県野田市野田110"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Kikkoman_Noda_01.jpg/1280px-Kikkoman_Noda_01.jpg",
      "https://commons.wikimedia.org/wiki/File:Kikkoman_Noda_01.jpg",
      "CC BY-SA 4.0",
      "Suikotei, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "spa-metsa-ootaka-nagareyama",
    name: "Spa Metsa Ootaka, Ryusenji-no-Yu",
    nameJa: "スパメッツァおおたか 竜泉寺の湯",
    aliases: ["Spa Metsa Ootaka", "Ryusenji-no-Yu Spa Metsa Ootaka"],
    officialWebsite: "https://www.ryusenjinoyu.com/spametsaotaka/",
    kind: "onsen",
    importance: "notable",
    municipalityId: "Chiba:nagareyama",
    coordinates: { lat: 35.872856, lng: 139.921661 },
    location: {
      address: "1-15-1 Otakanomori Nishi, Nagareyama, Chiba 270-0128",
      latitude: 35.872856,
      longitude: 139.921661,
    },
    categories: ["Onsen", "Wellness", "Indoor", "Relaxation"],
    tags: ["Onsen", "Wellness", "Relaxation", "Indoor", "Nagareyama"],
    description:
      "A current natural-hot-spring and sauna facility near Nagareyama-Otakanomori Station, useful as a concrete evening and relaxation destination.",
    descriptionJa:
      "流山おおたかの森駅近くにある天然温泉・サウナ・リラクゼーション施設。流山の具体的な夜・休息の行き先です。",
    highlights: [
      "Natural hot-spring bathing and sauna facilities",
      "A late-hours relaxation option near the station",
      "A concrete attraction rather than a generic Nagareyama evening district",
    ],
    highlightsJa: [
      "天然温泉とサウナ",
      "駅近の夜・休息の選択肢",
      "流山の具体的な施設行き先",
    ],
    notes:
      "The operator publishes current facility rules, maintenance closures, capacity limits, and tattoo/age/mixed-bathing restrictions. Hours and fees are intentionally left volatile.",
    notesJa:
      "施設ルール、臨時休館、定員、タトゥー・年齢・混浴に関する条件は公式案内をご確認ください。営業時間と料金は変動するため固定していません。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 2, max: 4 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was used; a conservative 2–4 hour relaxation estimate is derived from the repository methodology, excluding travel time.",
    },
    reservation:
      "Check current operator rules for facility access, capacity, age, tattoo, and mixed-bathing restrictions.",
    parking:
      "The operator publishes car access guidance; check current parking conditions and any facility-specific restrictions.",
    sources: [
      source(
        "official",
        "https://www.ryusenjinoyu.com/spametsaotaka/",
        "Spa Metsa Ootaka official facility site",
      ),
      source(
        "official",
        "https://www.ryusenjinoyu.com/spametsaotaka/concept/",
        "Spa Metsa Ootaka official facilities and rules",
      ),
      source(
        "government",
        "https://www.city.nagareyama.chiba.jp/tourism/1013061.html",
        "Nagareyama City tourism information",
      ),
      gsiCoordinateSource("千葉県流山市おおたかの森西1-15-1"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Ryusenji-no-yu_%28Spa-metsa-Otaka%29_02.jpg/1280px-Ryusenji-no-yu_%28Spa-metsa-Otaka%29_02.jpg",
      "https://commons.wikimedia.org/wiki/File:Ryusenji-no-yu_(Spa-metsa-Otaka)_02.jpg",
      "CC BY-SA 4.0",
      "NEO-NEED, CC BY-SA 4.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "national-museum-japanese-history-sakura",
    name: "National Museum of Japanese History",
    nameJa: "国立歴史民俗博物館",
    aliases: ["Rekihaku", "National Museum of Japanese History Sakura"],
    officialWebsite: "https://www.rekihaku.ac.jp/",
    kind: "museum",
    importance: "major",
    municipalityId: "Chiba:sakura",
    coordinates: { lat: 35.724312, lng: 140.219498 },
    location: {
      address: "117 Jonai-cho, Sakura, Chiba 285-8502",
      latitude: 35.724312,
      longitude: 140.219498,
    },
    categories: ["Museum", "History", "Culture", "Indoor"],
    tags: ["Museum", "History", "Culture", "Sakura", "Chiba"],
    description:
      "A national museum in Sakura presenting Japanese history and folk culture through large-scale permanent and special exhibitions.",
    descriptionJa:
      "佐倉城址公園に近接し、日本の歴史と民俗文化を大規模な常設・企画展示で紹介する国立博物館です。",
    highlights: [
      "Large-scale Japanese history and folk-culture galleries",
      "A strong indoor complement to Sakura Castle Park",
      "Rail-and-bus access from the Tokyo/Chiba commuter belt",
    ],
    highlightsJa: [
      "日本の歴史・民俗文化の展示",
      "佐倉城址公園と組み合わせやすい屋内文化施設",
      "東京・千葉方面から鉄道とバスでアクセス",
    ],
    notes:
      "The museum is modeled as a separate sibling/related destination to the existing Sakura Castle Park record. Seasonal hours and closures are operational facts; no season score is inferred.",
    notesJa:
      "既存の佐倉城址公園とは別の姉妹・関連行き先として扱っています。季節ごとの開館時間や休館日は運用情報であり、季節スコアは推定していません。",
    localAccessModes: ["train", "bus", "car", "my_car"],
    relatedDestinationIds: ["sakura-castle-chiba"],
    duration: {
      hours: { min: 3, max: 5 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was used; a conservative 3–5 hour museum estimate is derived from the repository methodology, excluding travel time.",
    },
    parking:
      "The museum publishes car and visitor parking guidance; check current access conditions before arrival.",
    sources: [
      source(
        "official",
        "https://www.rekihaku.ac.jp/",
        "National Museum of Japanese History official site",
      ),
      source(
        "official",
        "https://www.rekihaku.ac.jp/information/access/",
        "National Museum of Japanese History official access",
      ),
      source(
        "government",
        "https://www.city.sakura.lg.jp/soshiki/sakuranomiryoku/1/15919.html",
        "Sakura City National Museum of Japanese History page",
      ),
      gsiCoordinateSource("千葉県佐倉市城内町117"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/National_Museum_of_Japanese_History_2008.jpg/1280px-National_Museum_of_Japanese_History_2008.jpg",
      "https://commons.wikimedia.org/wiki/File:National_Museum_of_Japanese_History_2008.jpg",
      "CC BY-SA 3.0",
      "Wiiii, CC BY-SA 3.0, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "inubosaki-lighthouse-choshi",
    name: "Inubosaki Lighthouse",
    nameJa: "犬吠埼灯台",
    aliases: ["Inubosaki Lighthouse", "Inubohsaki Lighthouse", "犬吠埼"],
    officialWebsite:
      "https://www.choshikanko.com/kankoDB/%E7%8A%AC%E5%90%A0%E5%9F%BC%E7%81%AF%E5%8F%B0/",
    kind: "tower",
    importance: "major",
    municipalityId: "Chiba:choshi",
    coordinates: { lat: 35.7077778, lng: 140.8686111 },
    location: {
      address: "9576 Inubosaki, Choshi, Chiba 288-0012",
      latitude: 35.7077778,
      longitude: 140.8686111,
    },
    categories: ["Landmark", "Scenery", "History", "Coast"],
    tags: ["Lighthouse", "Coast", "Scenery", "History", "Choshi"],
    description:
      "An active visitor lighthouse at Cape Inubo, offering a distinctive Choshi coastal landmark and Pacific views.",
    descriptionJa:
      "銚子の犬吠埼に立つ現役の灯台。太平洋を望む、銚子を代表する海岸景観のランドマークです。",
    highlights: [
      "Historic lighthouse tower and coastal setting",
      "Pacific views from Cape Inubo",
      "A distinct lighthouse anchor for a Choshi east-coast outing",
    ],
    highlightsJa: [
      "歴史ある灯台と海岸の景観",
      "犬吠埼から望む太平洋",
      "銚子東海岸の灯台行き先",
    ],
    notes:
      "Cape Inubo/Inubosaki is kept as the lighthouse's setting rather than a second micro-destination. Visitor hours and weather closures are volatile; the separate materials exhibition hall is not represented as an open attraction.",
    notesJa:
      "犬吠埼は灯台の立地として扱い、別の小規模な記録には分けていません。見学時間や天候による休止は変動し、別館の資料展示室を営業中の行き先としては掲載していません。",
    localAccessModes: ["train", "bus", "my_car"],
    parentDestinationId: "choshi-city",
    duration: {
      hours: { min: 1, max: 2 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No stable official visit window was used; a conservative 1–2 hour lighthouse-and-coast estimate is derived from the repository methodology, excluding travel time.",
    },
    sources: [
      source(
        "tourism_board",
        "https://www.choshikanko.com/kankoDB/%E7%8A%AC%E5%90%A0%E5%9F%BC%E7%81%AF%E5%8F%B0/",
        "Choshi Tourism Association Inubosaki Lighthouse",
      ),
      source(
        "government",
        "https://www.mlit.go.jp/sogoseisaku/region/infratourism/en/infralist/chiba/index03.html",
        "MLIT infrastructure tourism Inubosaki Lighthouse",
      ),
      source(
        "government",
        "https://www.kaiho.mlit.go.jp/03kanku/choshi/main_lh.html",
        "Choshi Coast Guard lighthouse list and position",
      ),
      source(
        "tourism_board",
        "https://www.choshikanko.com/info/0259/",
        "Choshi Tourism Association materials hall closure notice",
      ),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/250821_Inubosaki_Lighthouse_05.jpg/1280px-250821_Inubosaki_Lighthouse_05.jpg",
      "https://commons.wikimedia.org/wiki/File:250821_Inubosaki_Lighthouse_05.jpg",
      "CC0",
      "Aspere, via Wikimedia Commons",
    ),
  }),
  makeRecord({
    id: "byobugaura-choshi",
    name: "Byobugaura Cliffs",
    nameJa: "屏風ケ浦",
    aliases: ["Byobugaura", "Byōbugaura", "Dover of the Orient"],
    officialWebsite:
      "https://www.choshikanko.com/kankoDB/%E5%B1%8F%E9%A2%A8%E3%82%B1%E6%B5%A6/",
    kind: "cliff",
    importance: "notable",
    municipalityId: "Chiba:choshi",
    coordinates: { lat: 35.704407, lng: 140.843445 },
    location: {
      address:
        "Shiomicho, Choshi, Chiba 288-0025; Choshi Marina promenade access",
      latitude: 35.704407,
      longitude: 140.843445,
    },
    categories: ["Nature", "Geology", "Scenery", "Coast"],
    tags: ["Cliffs", "Geology", "Coast", "Scenery", "Choshi"],
    description:
      "A long Pacific-facing cliff landscape and natural monument viewed from the Choshi Marina promenade.",
    descriptionJa:
      "銚子マリーナの遊歩道から眺める、太平洋沿いの長い断崖景観。地質と海岸の自然を楽しめる天然記念物です。",
    highlights: [
      "Layered coastal cliffs",
      "Choshi Marina promenade viewpoint context",
      "A geology-and-scenery outing distinct from Inubosaki Lighthouse",
    ],
    highlightsJa: [
      "地層が見える海食崖",
      "銚子マリーナ遊歩道からの景観",
      "犬吠埼灯台とは異なる地質・海岸体験",
    ],
    notes:
      "The coordinate is a GSI address anchor for the Shiomicho/Choshi Marina access area, not a claim that the long cliff line has one viewpoint. Cliff-top land includes private or unsafe areas; use the designated promenade and follow current local guidance.",
    notesJa:
      "長い海岸線に広がるため、単一の展望地点座標は設定していません。崖上には私有地や危険な場所があるため、指定された遊歩道を利用し現地案内に従ってください。",
    localAccessModes: ["bus", "car", "my_car"],
    parentDestinationId: "choshi-city",
    duration: {
      hours: { min: 0.5, max: 1.5 },
      source: durationMethodologySource,
      confidence: "medium",
      basis:
        "No official visit window was found; a conservative short scenic/geology-stop estimate is derived from the repository methodology, excluding access and any longer coastal walk.",
    },
    sources: [
      source(
        "tourism_board",
        "https://www.choshikanko.com/kankoDB/%E5%B1%8F%E9%A2%A8%E3%82%B1%E6%B5%A6/",
        "Choshi Tourism Association Byobugaura cliffs",
      ),
      source(
        "tourism_board",
        "https://www.choshikanko.com/course/%E9%8A%9A%E5%AD%90%E3%82%B8%E3%82%AA%E3%83%91%E3%83%BC%E3%82%AF%E6%95%A3%E6%AD%A9%E3%82%B3%E3%83%BC%E3%82%B9/",
        "Choshi Geopark walking course",
      ),
      source(
        "tourism_board",
        "https://maruchiba.jp/spot/detail_10186.html",
        "Chiba official tourism Byobugaura listing",
      ),
      gsiCoordinateSource("千葉県銚子市潮見町"),
    ],
    image: image(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Byobugaura_01.jpg/1280px-Byobugaura_01.jpg",
      "https://commons.wikimedia.org/wiki/File:Byobugaura_01.jpg",
      "CC BY 3.0",
      "Σ64, CC BY 3.0, via Wikimedia Commons",
    ),
  }),
];

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as DestinationWithLocation[];
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const existingNames = new Map<string, string>();
for (const destination of catalog) {
  for (const candidate of [
    destination.name,
    destination.nameJa,
    ...(destination.aliases ?? []),
  ].filter((value): value is string => Boolean(value))) {
    const key = normalize(candidate);
    if (key.length >= 6) existingNames.set(key, destination.id);
  }
}

const candidateNames = new Map<string, string>();
for (const candidate of reviewedCandidates) {
  for (const name of [
    candidate.name,
    candidate.nameJa,
    ...(candidate.aliases ?? []),
  ]) {
    const key = normalize(name);
    if (key.length < 6) continue;
    const existingCandidate = candidateNames.get(key);
    if (existingCandidate && existingCandidate !== candidate.id) {
      throw new Error(
        `${candidate.id}: candidate name/alias '${name}' duplicates ${existingCandidate}`,
      );
    }
    candidateNames.set(key, candidate.id);
    const duplicateId = existingNames.get(key);
    if (duplicateId && duplicateId !== candidate.id) {
      throw new Error(
        `${candidate.id}: normalized name/alias '${name}' duplicates existing ${duplicateId}`,
      );
    }
  }
}

const addedIds: string[] = [];
const enrichedIds: string[] = [];
const localAccessModes = new Set<TransportMode>([
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
]);
for (const candidate of reviewedCandidates) {
  const existing = byId.get(candidate.id);
  if (existing) {
    if (
      existing.name !== candidate.name ||
      existing.nameJa !== candidate.nameJa ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(
        `${candidate.id}: existing record conflicts with the verified KAI-146 identity`,
      );
    }
    let enriched = false;
    if (candidate.areaId === undefined && existing.areaId !== undefined) {
      delete existing.areaId;
      enriched = true;
    }
    if (
      candidate.coordinates &&
      JSON.stringify(existing.coordinates) !==
        JSON.stringify(candidate.coordinates)
    ) {
      existing.coordinates = candidate.coordinates;
      if (existing.location && candidate.location) {
        existing.location = {
          ...existing.location,
          latitude: candidate.location.latitude,
          longitude: candidate.location.longitude,
        };
      }
      if (existing.editorial?.fieldSources) {
        existing.editorial.fieldSources = {
          ...existing.editorial.fieldSources,
          coordinates: candidate.editorial?.fieldSources?.coordinates ?? [],
        };
      }
      enriched = true;
    }
    if (
      candidate.id === "yagiri-no-watashi-matsudo" &&
      existing.tags?.includes("Ferry")
    ) {
      existing.tags = candidate.tags;
      enriched = true;
    }
    if (
      JSON.stringify(existing.localAccessModes) !==
      JSON.stringify(candidate.localAccessModes)
    ) {
      existing.localAccessModes = candidate.localAccessModes;
      if (existing.editorial?.fieldSources) {
        existing.editorial.fieldSources = {
          ...existing.editorial.fieldSources,
          localAccessModes:
            candidate.editorial?.fieldSources?.localAccessModes ?? [],
        };
      }
      enriched = true;
    }
    if (
      candidate.id === "funabashi-andersen-park" &&
      existing.editorial?.fieldSources?.recommendedVisitHours
    ) {
      delete existing.editorial.fieldSources.recommendedVisitHours;
      enriched = true;
    }
    if (enriched) enrichedIds.push(candidate.id);
    continue;
  }

  if (candidate.municipalityId?.split(":")[0] !== candidate.prefecture) {
    throw new Error(
      `${candidate.id}: municipality ${candidate.municipalityId} does not match ${candidate.prefecture}`,
    );
  }
  if (candidate.prefecture !== "Chiba" || candidate.region !== "Kanto") {
    throw new Error(`${candidate.id}: expected Chiba/Kanto geography`);
  }
  if (
    !candidate.nameJa ||
    !candidate.content?.en?.name ||
    !candidate.content.ja?.name ||
    !candidate.editorial?.sources?.length ||
    !candidate.imageMetadata
  ) {
    throw new Error(
      `${candidate.id}: bilingual/source/image contract is incomplete`,
    );
  }
  if (
    !candidate.coordinates ||
    candidate.coordinates.lat < 34.5 ||
    candidate.coordinates.lat > 36.5 ||
    candidate.coordinates.lng < 139 ||
    candidate.coordinates.lng > 141.5
  ) {
    throw new Error(
      `${candidate.id}: coordinate is outside the Chiba QA envelope`,
    );
  }
  for (const mode of candidate.localAccessModes ?? []) {
    if (!localAccessModes.has(mode)) {
      throw new Error(`${candidate.id}: unsupported local access mode ${mode}`);
    }
  }
  const parentDestinationId = candidate.relationships?.parentDestinationId;
  if (parentDestinationId) {
    const parent = byId.get(parentDestinationId);
    if (!parent || parent.role !== "hub") {
      throw new Error(
        `${candidate.id}: parent ${parentDestinationId} must be an existing hub`,
      );
    }
    if (parent.municipalityId !== candidate.municipalityId) {
      throw new Error(
        `${candidate.id}: parent municipality ${parent.municipalityId} does not match ${candidate.municipalityId}`,
      );
    }
  }
  for (const relatedId of candidate.relationships?.relatedDestinationIds ??
    []) {
    if (!byId.has(relatedId)) {
      throw new Error(
        `${candidate.id}: related destination ${relatedId} is missing`,
      );
    }
  }

  catalog.push(candidate);
  byId.set(candidate.id, candidate);
  addedIds.push(candidate.id);
}

// Ensure parent chains remain acyclic after the append. This is intentionally
// local to the expansion script rather than a new global validation framework.
for (const destination of catalog) {
  const seen = new Set<string>();
  let current: DestinationWithLocation | undefined = destination;
  while (current?.relationships?.parentDestinationId) {
    const parentId = current.relationships.parentDestinationId;
    if (seen.has(parentId)) {
      throw new Error(`${destination.id}: parent relationship cycle detected`);
    }
    seen.add(parentId);
    current = byId.get(parentId);
  }
}

if (addedIds.length > 0 || enrichedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length > 0 || enrichedIds.length > 0
    ? `KAI-146: added ${addedIds.length} Northern Chiba destinations (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")})`
    : "KAI-146: catalogue already contains the verified Northern Chiba records; no changes made",
);
