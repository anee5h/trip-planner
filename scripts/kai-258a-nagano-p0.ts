/**
 * KAI-258A — Nagano P0 anchor depth.
 *
 * The candidate set was checked against the complete current catalogue before
 * authoring. This script is deliberately idempotent: it refuses identity
 * collisions, preserves existing relationships, and only adds the reviewed
 * Nagano P0 records plus the required same-municipality hub links.
 *
 * Usage: npx tsx scripts/kai-258a-nagano-p0.ts
 */
import fs from "node:fs";
import path from "node:path";
import type {
  AdmissionCostFact,
  Destination,
  LocalTransportAccess,
  SourceReference,
} from "../src/shared/types/destination";

const INDEX_PATH = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const REVIEW_DATE = "2026-08-31";
const REVIEWER = "Meguruto editorial";

type Coordinate = { lat: number; lng: number };
type Candidate = {
  id: string;
  name: string;
  nameJa: string;
  aliases: string[];
  officialWebsite: string;
  kind: NonNullable<Destination["kind"]>;
  role: "poi" | "standalone" | "hub";
  importance: NonNullable<Destination["importance"]>;
  municipalityId?: string;
  coordinates: Coordinate;
  coordinateSource: SourceReference;
  categories: string[];
  tags: string[];
  description: string;
  descriptionJa: string;
  highlights: string[];
  highlightsJa: string[];
  notes: string;
  notesJa: string;
  accessModes: NonNullable<Destination["localAccessModes"]>;
  parentDestinationId?: string;
  source: SourceReference;
  image: {
    url: string;
    sourceUrl: string;
    license: string;
    attribution: string;
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

const commons = (
  file: string,
  url: string,
  license: string,
  attribution: string,
) => ({
  url,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${file}`,
  license,
  attribution,
});

const osm = (type: "node" | "way" | "relation", id: number, title: string) =>
  source(
    "manual",
    `https://www.openstreetmap.org/${type}/${id}`,
    `OpenStreetMap coordinate reference: ${title}`,
  );

const official = (url: string, title: string): SourceReference =>
  source("official", url, title);

const unknownSeason = {
  method: "unknown" as const,
  modelVersion: "season-model-v1",
  confidence: "unknown" as const,
  basis:
    "No defensible four-season suitability vector was verified for this destination; unknown is preserved rather than inferred from scenery or climate.",
};

const unknownBudget = {
  method: "unknown" as const,
  state: "unavailable" as const,
  provenance: "none" as const,
  reasonCode: "source_missing" as const,
  modelVersion: "budget-model-v1",
  confidence: "unknown" as const,
  basis:
    "No complete destination-specific budget evidence was verified; missing numeric costs remain unknown rather than being inferred.",
};

const unknownCrowd = {
  method: "unknown" as const,
  modelVersion: "crowd-model-v1",
  confidence: "unknown" as const,
  basis:
    "No stable crowd vector was verified; the value is neutralized rather than inferred from attraction type.",
};

const openAreaAdmissionIds = new Set([
  "kumoba-pond",
  "kyu-karuizawa-ginza",
  "harunire-terrace",
  "happo-pond",
  "suwa-taisha",
  "obuse-town",
]);

const makeAdmission = (candidate: Candidate): AdmissionCostFact => {
  if (openAreaAdmissionIds.has(candidate.id)) {
    return {
      state: "not_applicable",
      provenance: "verified_source",
      reasonCode: "no_single_admission_product",
      cost: { kind: "not_applicable" },
      scope: "open_area",
      basis:
        "The official destination identity describes an open area or multi-site destination rather than one required admission product; optional facilities and purchases are not promoted as admission.",
      sourceUrls: [candidate.officialWebsite],
      checkedAt: REVIEW_DATE,
      reviewIntervalMonths: 12,
    };
  }
  return {
    state: "unavailable",
    provenance: "verified_source",
    reasonCode: "source_missing",
    cost: { kind: "unavailable", reason: "source_missing" },
    scope: "general_entry",
    basis:
      "The official destination source was reviewed for identity and visitor access, but no current ordinary individual admission value was promoted without a dedicated fee source.",
    sourceUrls: [candidate.officialWebsite],
    checkedAt: REVIEW_DATE,
    reviewIntervalMonths: 12,
  };
};

const makeLocalTransport = (): LocalTransportAccess => ({
  kind: "unavailable",
  reason: "fare_not_found",
  detail:
    "No destination-specific local-transport fare was promoted; route modes remain separately marked as unestimated.",
});

// Required by the repository's planning contract. These are deliberately
// bounded editorial visit bands, not origin-to-destination travel times or
// opening-hour claims. The band is the smallest useful planning envelope for
// each independently recommendable attraction and is kept separate from
// transport evidence.
const visitHours: Record<string, { min: number; max: number }> = {
  "zenkoji-temple": { min: 1, max: 2 },
  "jigokudani-monkey-park": { min: 2, max: 3 },
  "togakushi-shrine": { min: 1, max: 2 },
  "kumoba-pond": { min: 1, max: 2 },
  "kyu-karuizawa-ginza": { min: 1, max: 3 },
  "harunire-terrace": { min: 1, max: 2 },
  "happo-pond": { min: 2, max: 4 },
  "hakuba-iwatake-mountain-resort": { min: 4, max: 8 },
  "tsugaike-nature-park": { min: 2, max: 4 },
  "daio-wasabi-farm": { min: 1, max: 2 },
  "senjojiki-cirque": { min: 2, max: 4 },
  "suwa-taisha": { min: 1, max: 2 },
  "obuse-town": { min: 6, max: 12 },
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

const genericReservation =
  "Reservation and admission conditions can change; check the official visitor guidance before visiting.";
const genericReservationJa =
  "予約・入場条件は変更される場合があるため、訪問前に公式案内をご確認ください。";
const genericParking =
  "Parking conditions vary by site and date; check the official visitor guidance before visiting.";
const genericParkingJa =
  "駐車条件は場所や時期により異なるため、訪問前に公式案内をご確認ください。";
const genericHours =
  "Visitor hours and closures vary by date; check the official visitor guidance before visiting.";
const genericHoursJa =
  "開場時間・休業日は変更される場合があるため、訪問前に公式案内をご確認ください。";

const makeRecord = (candidate: Candidate): Destination => {
  const parent = candidate.parentDestinationId;
  const visitBand = visitHours[candidate.id];
  if (!visitBand) throw new Error(`${candidate.id}: missing visit-hours band`);
  const fieldSources: Record<string, SourceReference[]> = {
    name: [candidate.source],
    nameJa: [candidate.source],
    municipalityId: [candidate.source],
    coordinates: [candidate.coordinateSource],
    status: [candidate.source],
    localAccessModes: [candidate.source],
  };
  if (parent) fieldSources.relationships = [candidate.source];
  fieldSources.recommendedVisitHours = [candidate.source];

  return {
    id: candidate.id,
    officialWebsite: candidate.officialWebsite,
    officialWebsiteRequirement: "required",
    name: candidate.name,
    nameJa: candidate.nameJa,
    aliases: candidate.aliases,
    municipalityId: candidate.municipalityId,
    prefecture: "Nagano",
    region: "Chubu",
    kind: candidate.kind,
    role: candidate.role,
    placeType: "destination",
    importance: candidate.importance,
    coordinates: candidate.coordinates,
    categories: candidate.categories,
    tags: candidate.tags,
    description: candidate.description,
    highlights: candidate.highlights,
    content: {
      en: {
        name: candidate.name,
        description: candidate.description,
        highlights: candidate.highlights,
        notes: candidate.notes,
        reservation: genericReservation,
        parking: genericParking,
        openingHours: genericHours,
      },
      ja: {
        name: candidate.nameJa,
        description: candidate.descriptionJa,
        highlights: candidate.highlightsJa,
        notes: candidate.notesJa,
        reservation: genericReservationJa,
        parking: genericParkingJa,
        openingHours: genericHoursJa,
      },
    },
    heroImage: candidate.image.url,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: candidate.image.license,
      attribution: candidate.image.attribution,
      sourceUrl: candidate.image.sourceUrl,
    },
    transportOptions: {},
    localAccessModes: candidate.accessModes,
    localAccessUnestimated: true,
    transportMetadata: {
      method: "unknown",
      confidence: "unknown",
      basis:
        "Official visitor guidance establishes available access modes, but no complete origin-aware duration or fare is authored in this catalogue expansion.",
    },
    ratings: neutralRatings,
    ratingsSchemaVersion: 2,
    admission: makeAdmission(candidate),
    localTransport: makeLocalTransport(),
    ratingMetadata: {
      rubricVersion: 2,
      method: "manual",
      confidence: "low",
    },
    recommendedVisitHours: visitBand,
    durationMetadata: {
      method: "model",
      modelVersion: "kai-258-editorial-duration-v1",
      confidence: "low",
      basis:
        "Bounded planning band for this attraction's on-site scope; not an origin-to-destination travel duration or opening-hours claim.",
    },
    seasonMetadata: unknownSeason,
    budgetMetadata: unknownBudget,
    crowdMetadata: unknownCrowd,
    reservation: genericReservation,
    reservationJa: genericReservationJa,
    parking: genericParking,
    parkingJa: genericParkingJa,
    openingHours: genericHours,
    openingHoursJa: genericHoursJa,
    notes: candidate.notes,
    notesJa: candidate.notesJa,
    status: "verified",
    travelEstimate: { confidence: "beta" },
    collections: [],
    relationships: parent ? { parentDestinationId: parent } : {},
    editorial: {
      lifecycle: "approved",
      freshness: "current",
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      reviewedBy: REVIEWER,
      changeSummary:
        "Added one current, independently recommendable Nagano P0 destination after identity and duplicate review.",
      sources: [candidate.source, candidate.coordinateSource],
      fieldSources,
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: REVIEWER,
          summary:
            "Added source-backed Nagano P0 destination depth without static cost, duration, opening-status, or seasonality claims.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  };
};

const candidates: Candidate[] = [
  {
    id: "zenkoji-temple",
    name: "Zenko-ji Temple",
    nameJa: "善光寺",
    aliases: ["Zenkō-ji", "Zenkoji Temple", "Nagano Zenkoji"],
    officialWebsite: "https://www.zenkoji.jp/",
    kind: "temple",
    role: "poi",
    importance: "major",
    municipalityId: "Nagano:nagano",
    coordinates: { lat: 36.6614233, lng: 138.1876577 },
    coordinateSource: osm("way", 220401982, "Zenko-ji Temple"),
    categories: ["Temple", "History", "Culture"],
    tags: ["Temple", "Buddhism", "History", "Nagano City"],
    description:
      "A major Buddhist temple in central Nagano, known for its long pilgrimage history, imposing main hall, and the historic approach through the city.",
    descriptionJa:
      "長野市中心部にある古刹。長い巡礼の歴史を持ち、壮大な本堂と門前町の参道が訪れる人を迎えます。",
    highlights: [
      "The imposing main hall and historic temple precinct",
      "A long-established pilgrimage destination in Nagano",
      "Traditional approach streets and temple-town atmosphere",
    ],
    highlightsJa: [
      "壮大な本堂と歴史ある境内",
      "長い巡礼の歴史を持つ長野の中心的な寺院",
      "門前町の参道と寺町の雰囲気",
    ],
    notes:
      "The official temple site is the authority for worship guidance, visitor conditions, and current notices. This record is the independently discoverable temple anchor for Nagano City; it is not a duplicate of the city hub.",
    notesJa:
      "参拝案内・訪問条件・最新のお知らせは寺院公式サイトをご確認ください。長野市ハブとは別に検索できる寺院アンカーとして登録しています。",
    accessModes: ["train", "bus", "car"],
    source: official("https://www.zenkoji.jp/", "Zenko-ji official website"),
    image: commons(
      "Zenkoji-Nagano.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Zenkoji-Nagano.JPG/1280px-Zenkoji-Nagano.JPG",
      "CC BY-SA 3.0",
      "Sl-Ziga, via Wikimedia Commons",
    ),
    parentDestinationId: "nagano-city",
  },
  {
    id: "jigokudani-monkey-park",
    name: "Jigokudani Monkey Park",
    nameJa: "地獄谷野猿公苑",
    aliases: [
      "Jigokudani Yaen-Koen",
      "Snow Monkey Park",
      "Wild Snow Monkey Park",
    ],
    officialWebsite: "https://en.jigokudani-yaenkoen.co.jp/",
    kind: "zoo",
    role: "standalone",
    importance: "major",
    municipalityId: "Nagano:yamanouchi",
    coordinates: { lat: 36.7328117, lng: 138.4623185 },
    coordinateSource: osm("way", 1234130305, "Jigokudani Monkey Park"),
    categories: ["Nature", "Wildlife", "Family"],
    tags: ["Snow Monkeys", "Wildlife", "Nature", "Yamanouchi"],
    description:
      "A protected wildlife viewing park in the Jigokudani valley where visitors can observe Japanese macaques in their natural mountain setting.",
    descriptionJa:
      "地獄谷の山間にある野生ニホンザルの観察施設。自然の中で暮らすサルを観察できる、山ノ内町の独立した訪問先です。",
    highlights: [
      "Japanese macaques in a natural mountain setting",
      "A forested approach into the Jigokudani valley",
      "Independent wildlife attraction beyond the broad national-park record",
    ],
    highlightsJa: [
      "自然の山間で暮らすニホンザル",
      "地獄谷の森を歩くアプローチ",
      "広域の国立公園記録とは別に探せる野生動物スポット",
    ],
    notes:
      "The operator's English and Japanese sites are authoritative for current access, visitor guidance, and animal-welfare rules. The park is kept as a standalone destination because it is not contained by an existing same-municipality hub record.",
    notesJa:
      "現在のアクセス・見学案内・動物保護ルールは運営者の公式サイトをご確認ください。同一自治体の既存ハブに包含されていないため、独立した目的地として扱います。",
    accessModes: ["train", "bus", "car"],
    source: official(
      "https://en.jigokudani-yaenkoen.co.jp/",
      "Jigokudani Yaen-Koen official website",
    ),
    image: commons(
      "Macaca_fuscata_meditation.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Macaca_fuscata_meditation.jpg/1280px-Macaca_fuscata_meditation.jpg",
      "CC BY-SA 2.0",
      "Daisuke tashiro, via Wikimedia Commons",
    ),
  },
  {
    id: "togakushi-shrine",
    name: "Togakushi Shrine",
    nameJa: "戸隠神社",
    aliases: ["Togakushi Jinja", "Togakushi Five Shrines"],
    officialWebsite: "https://www.togakushi-jinja.jp/",
    kind: "shrine",
    role: "poi",
    importance: "major",
    municipalityId: "Nagano:nagano",
    coordinates: { lat: 36.7424055, lng: 138.0848364 },
    coordinateSource: osm("way", 1226364518, "Togakushi Shrine Chusha"),
    categories: ["Shrine", "Nature", "History"],
    tags: ["Shrine", "Togakushi", "Forest", "Nagano City"],
    description:
      "A historic mountain-shrine complex at the foot of Mount Togakushi, visited for its five-shrine pilgrimage, sacred forest paths, and distinctive religious landscape.",
    descriptionJa:
      "戸隠山の麓に広がる歴史ある神社群。五社めぐり、神聖な森の道、山岳信仰の景観を訪ねられます。",
    highlights: [
      "The five-shrine Togakushi pilgrimage",
      "Sacred cedar and mountain-forest approaches",
      "A distinct mountain-culture anchor within Nagano City",
    ],
    highlightsJa: [
      "戸隠神社五社めぐり",
      "杉並木と山の森を歩く参道",
      "長野市内の山岳文化を代表する訪問先",
    ],
    notes:
      "The official shrine site is authoritative for the five-shrine route, worship guidance, and current notices. The map anchor is the Chusha precinct; the record represents the shrine complex rather than a new shell for each shrine.",
    notesJa:
      "五社めぐり・参拝案内・最新情報は神社公式サイトをご確認ください。地図の代表点は中社境内とし、各社ごとの不要な重複シェルは作成していません。",
    accessModes: ["bus", "car"],
    source: official(
      "https://www.togakushi-jinja.jp/",
      "Togakushi Shrine official website",
    ),
    image: commons(
      "160430_Togakushi-jinja_Chusha_Nagano_Japan02n.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/160430_Togakushi-jinja_Chusha_Nagano_Japan02n.jpg/1280px-160430_Togakushi-jinja_Chusha_Nagano_Japan02n.jpg",
      "CC BY 2.5",
      "663highland, via Wikimedia Commons",
    ),
    parentDestinationId: "nagano-city",
  },
  {
    id: "kumoba-pond",
    name: "Kumoba Pond",
    nameJa: "雲場池",
    aliases: ["Kumoba-ike", "Kumobaike Pond", "Swan Lake"],
    officialWebsite: "https://karuizawa-kankokyokai.jp/spot/23234/",
    kind: "lake",
    role: "poi",
    importance: "major",
    municipalityId: "Nagano:karuizawa",
    coordinates: { lat: 36.3520901, lng: 138.6268853 },
    coordinateSource: osm("way", 238530693, "Kumoba Pond"),
    categories: ["Nature", "Lake", "Photography"],
    tags: ["Lake", "Nature", "Photography", "Karuizawa"],
    description:
      "A quiet pond near central Karuizawa, known for reflected woodland scenery and an easy lakeside walk through one of the town's signature landscapes.",
    descriptionJa:
      "軽井沢中心部に近い静かな池。水面に映る森の景色と歩きやすい湖畔の道で知られる、軽井沢を代表する自然景観です。",
    highlights: [
      "Woodland reflections on the pond",
      "A gentle lakeside walking route",
      "A nature stop distinct from the Karuizawa town aggregate",
    ],
    highlightsJa: [
      "水面に映る森の景色",
      "歩きやすい湖畔の散策路",
      "軽井沢町ハブとは別に探せる自然スポット",
    ],
    notes:
      "The Karuizawa Tourist Association listing is authoritative for current local visitor guidance. It is linked to Karuizawa Town because the pond is physically in the town and represents a standalone choice for visitors.",
    notesJa:
      "現在の観光案内は軽井沢観光協会の掲載情報をご確認ください。軽井沢町内に位置し、旅行者が独立して選べる自然スポットとして町ハブに紐づけています。",
    accessModes: ["train", "car"],
    source: official(
      "https://karuizawa-kankokyokai.jp/spot/23234/",
      "Karuizawa Tourist Association: Kumoba Pond",
    ),
    image: commons(
      "Kumoba-ike03s2048.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Kumoba-ike03s2048.jpg/1280px-Kumoba-ike03s2048.jpg",
      "CC BY 2.5",
      "663highland, via Wikimedia Commons",
    ),
    parentDestinationId: "karuizawa-town",
  },
  {
    id: "kyu-karuizawa-ginza",
    name: "Kyu-Karuizawa Ginza",
    nameJa: "旧軽井沢銀座",
    aliases: [
      "Old Karuizawa Ginza Street",
      "Kyu-Karuizawa Ginza Street",
      "旧軽銀座",
    ],
    officialWebsite: "https://karuizawa-kankokyokai.jp/",
    kind: "street",
    role: "poi",
    importance: "major",
    municipalityId: "Nagano:karuizawa",
    coordinates: { lat: 36.3598831, lng: 138.6368547 },
    coordinateSource: osm("way", 148792053, "Kyu-Karuizawa Ginza"),
    categories: ["Shopping", "Street", "Food", "History"],
    tags: ["Shopping Street", "Historic Street", "Food", "Karuizawa"],
    description:
      "Karuizawa's historic main shopping street, lined with cafes, bakeries, restaurants, and long-established shops in the old resort district.",
    descriptionJa:
      "旧軽井沢の中心にある歴史的な商店街。カフェやベーカリー、飲食店、老舗店が並ぶ、リゾートの街歩きの核です。",
    highlights: [
      "Historic resort-town shopping and food stops",
      "Independent cafes, bakeries, and long-established shops",
      "A walkable urban complement to Karuizawa's nature attractions",
    ],
    highlightsJa: [
      "歴史ある避暑地の商店街と食べ歩き",
      "カフェ・ベーカリー・老舗店めぐり",
      "軽井沢の自然スポットを補う街歩きの選択肢",
    ],
    notes:
      "The Karuizawa Tourist Association is the authority for current district guidance. The street is represented as one heritage-shopping proposition; individual shops are not duplicated as destination shells.",
    notesJa:
      "現在のエリア案内は軽井沢観光協会をご確認ください。商店街全体を一つの歴史・買い物体験として扱い、個別店舗の重複シェルは作成していません。",
    accessModes: ["train", "car"],
    source: official(
      "https://karuizawa-kankokyokai.jp/",
      "Karuizawa Tourist Association official website",
    ),
    image: commons(
      "Old_Karuizawa_ginza04s3200.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Old_Karuizawa_ginza04s3200.jpg/1280px-Old_Karuizawa_ginza04s3200.jpg",
      "CC BY 2.5",
      "663highland, via Wikimedia Commons",
    ),
    parentDestinationId: "karuizawa-town",
  },
  {
    id: "harunire-terrace",
    name: "Harunire Terrace",
    nameJa: "ハルニレテラス",
    aliases: ["Hoshino Area Harunire Terrace", "ハルニレのテラス"],
    officialWebsite: "https://www.hoshino-area.jp/harunireterrace/",
    kind: "shopping",
    role: "poi",
    importance: "notable",
    municipalityId: "Nagano:karuizawa",
    coordinates: { lat: 36.3593866, lng: 138.5904379 },
    coordinateSource: osm("way", 266776115, "Harunire Terrace"),
    categories: ["Shopping", "Food", "Nature", "Relaxation"],
    tags: ["Shopping", "Restaurants", "Forest", "Karuizawa"],
    description:
      "A small forest-side town of shops and restaurants in the Hoshino Area, arranged along the river under Karuizawa's native harunire trees.",
    descriptionJa:
      "軽井沢星野エリアの森と川辺に広がる小さな街。ハルニレの木々の下にショップやレストランが並びます。",
    highlights: [
      "Forest-side restaurants and small shops",
      "A riverside setting among harunire trees",
      "A distinct Hoshino Area experience beyond old-town shopping",
    ],
    highlightsJa: [
      "森の中のレストランとショップ",
      "ハルニレの木々に囲まれた川辺の景観",
      "旧軽井沢の商店街とは異なる星野エリアの体験",
    ],
    notes:
      "The Hoshino Area operator site is authoritative for current shop listings, visitor guidance, and events. It is linked to Karuizawa Town as a distinct commercial-and-nature POI rather than folded into the town description.",
    notesJa:
      "店舗情報・訪問案内・イベントは星野エリア運営者の公式サイトをご確認ください。町の説明に埋め込まず、商業と自然を組み合わせた独立POIとして軽井沢町に紐づけています。",
    accessModes: ["train", "car"],
    source: official(
      "https://www.hoshino-area.jp/harunireterrace/",
      "Karuizawa Hoshino Area: Harunire Terrace",
    ),
    image: commons(
      "160730_Harunire_Terrace_Karuizawa_Nagano_pref_Japan01n.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/160730_Harunire_Terrace_Karuizawa_Nagano_pref_Japan01n.jpg/1280px-160730_Harunire_Terrace_Karuizawa_Nagano_pref_Japan01n.jpg",
      "CC BY 2.5",
      "663highland, via Wikimedia Commons",
    ),
    parentDestinationId: "karuizawa-town",
  },
  {
    id: "happo-pond",
    name: "Happo Pond",
    nameJa: "八方池",
    aliases: ["Happo-ike", "Happo-one Pond", "八方池（八方尾根）"],
    officialWebsite: "https://www.happo-one.jp/en/trekking/",
    kind: "lake",
    role: "poi",
    importance: "major",
    municipalityId: "Nagano:hakuba",
    coordinates: { lat: 36.6942499, lng: 137.7845366 },
    coordinateSource: osm("way", 626228134, "Happo Pond"),
    categories: ["Nature", "Hiking", "Lake", "Photography"],
    tags: ["Lake", "Hiking", "Northern Alps", "Hakuba"],
    description:
      "An alpine pond on the Happo Ridge hiking route, prized for mountain reflections and panoramic views across the Northern Alps.",
    descriptionJa:
      "八方尾根の登山道にある高山の池。北アルプスの山並みを映す景観と、尾根上からの眺望で知られます。",
    highlights: [
      "Alpine reflections of the Northern Alps",
      "The Happo Ridge hiking route",
      "A landmark nature choice separate from the Hakuba village aggregate",
    ],
    highlightsJa: [
      "北アルプスを映す高山の池",
      "八方尾根のハイキングルート",
      "白馬村ハブとは別に選べる代表的な自然スポット",
    ],
    notes:
      "The Happo-one operator's hiking guide is authoritative for route conditions, lift operation, and current mountain guidance. The pond is represented as a child of Hakuba Village because its canonical municipality is Hakuba.",
    notesJa:
      "ルート状況・リフト運行・山上の最新案内は八方尾根運営者の公式ガイドをご確認ください。所在地が白馬村であるため白馬村ハブの子POIとして登録しています。",
    accessModes: ["train", "bus", "car"],
    source: official(
      "https://www.happo-one.jp/en/trekking/",
      "Happo-one official hiking guide",
    ),
    image: commons(
      "Happo_Pond_2021-09-15.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Happo_Pond_2021-09-15.jpg/1280px-Happo_Pond_2021-09-15.jpg",
      "CC0",
      "Alpsdake, via Wikimedia Commons",
    ),
    parentDestinationId: "hakuba-village",
  },
  {
    id: "hakuba-iwatake-mountain-resort",
    name: "Hakuba Iwatake Mountain Resort",
    nameJa: "白馬岩岳マウンテンリゾート",
    aliases: ["Hakuba Iwatake", "Iwatake Mountain Harbor", "白馬岩岳"],
    officialWebsite: "https://iwatake-mountain-resort.com/",
    kind: "mountain",
    role: "poi",
    importance: "major",
    municipalityId: "Nagano:hakuba",
    coordinates: { lat: 36.7290053, lng: 137.8399824 },
    coordinateSource: osm("node", 6728997687, "Hakuba Iwatake Mountain Resort"),
    categories: ["Mountain", "Nature", "Viewpoint", "Family"],
    tags: ["Mountain Resort", "Mountain Harbor", "Viewpoint", "Hakuba"],
    description:
      "A four-season mountain resort on Iwatake with elevated viewpoints, mountain activities, and the Mountain Harbor panorama over the Hakuba peaks.",
    descriptionJa:
      "白馬岩岳に広がる通年型の山岳リゾート。山上の展望地やアクティビティ、白馬連峰を望むマウンテンハーバーがあります。",
    highlights: [
      "Mountain Harbor views across the Hakuba peaks",
      "Four-season mountain activities",
      "A visitor destination distinct from the Hakuba Village hub",
    ],
    highlightsJa: [
      "白馬連峰を望むマウンテンハーバー",
      "四季を通じた山上アクティビティ",
      "白馬村ハブとは別に探せる山岳リゾート",
    ],
    notes:
      "The resort operator site is authoritative for current seasonal operation, activities, and visitor conditions. The Mountain Harbor name is retained as an alias/context, not a duplicate record.",
    notesJa:
      "季節ごとの営業・アクティビティ・訪問条件は運営者公式サイトをご確認ください。マウンテンハーバーは別レコードにせず、別名・文脈として扱っています。",
    accessModes: ["train", "bus", "car"],
    source: official(
      "https://iwatake-mountain-resort.com/",
      "Hakuba Iwatake Mountain Resort official site",
    ),
    image: commons(
      "Hakuba_Iwatake_Snow_Field.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hakuba_Iwatake_Snow_Field.JPG/1280px-Hakuba_Iwatake_Snow_Field.JPG",
      "Public domain",
      "Ski Mania, via Wikimedia Commons",
    ),
    parentDestinationId: "hakuba-village",
  },
  {
    id: "tsugaike-nature-park",
    name: "Tsugaike Nature Park",
    nameJa: "栂池自然園",
    aliases: ["Tsugaike Natural Park", "栂池自然園（白馬つがいけ）"],
    officialWebsite: "https://sizenen.otarimura.com/",
    kind: "park",
    role: "standalone",
    importance: "major",
    municipalityId: "Nagano:otari",
    coordinates: { lat: 36.774, lng: 137.8182318 },
    coordinateSource: osm("node", 11250236822, "Tsugaike Visitor Center"),
    categories: ["Nature", "Wetland", "Hiking", "Park"],
    tags: ["Nature Park", "Wetland", "Alpine Flowers", "Otari"],
    description:
      "A high-elevation wetland and alpine nature park in Otari, reached through the Tsugaike mountain resort and known for boardwalk trails and alpine scenery.",
    descriptionJa:
      "小谷村の山岳リゾートから入る高層湿原の自然公園。木道の散策路と高山の景観を楽しめる、白馬村とは別自治体の自然スポットです。",
    highlights: [
      "High-elevation wetland boardwalks",
      "Alpine plants and mountain scenery",
      "A standalone Otari destination, not a Hakuba Village child",
    ],
    highlightsJa: [
      "高層湿原の木道散策",
      "高山植物と山岳景観",
      "白馬村の子POIではなく小谷村の独立した目的地",
    ],
    notes:
      "The park operator and Tsugaike resort sites are authoritative for current opening, ropeway operation, trail conditions, and seasonal guidance. The coordinate anchor is the park visitor-center area; no Hakuba Village containment edge is created because the municipality is Otari.",
    notesJa:
      "開園・ロープウェイ運行・遊歩道状況・季節案内は運営者と栂池リゾートの公式サイトをご確認ください。地図の代表点はビジターセンター周辺とし、所在地が小谷村のため白馬村への包含関係は作りません。",
    accessModes: ["train", "bus", "car"],
    source: official(
      "https://sizenen.otarimura.com/",
      "Tsugaike Nature Park official visitor site",
    ),
    image: commons(
      "Tsugaike_Nature_Park_s2.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Tsugaike_Nature_Park_s2.jpg/1280px-Tsugaike_Nature_Park_s2.jpg",
      "CC BY-SA 4.0",
      "Alpsdake, via Wikimedia Commons",
    ),
  },
  {
    id: "daio-wasabi-farm",
    name: "Daio Wasabi Farm",
    nameJa: "大王わさび農場",
    aliases: ["Daio Wasabi Nōjō", "大王わさび農場（安曇野）"],
    officialWebsite: "https://www.daiowasabi.co.jp/",
    kind: "garden",
    role: "standalone",
    importance: "major",
    municipalityId: "Nagano:azumino",
    coordinates: { lat: 36.3386266, lng: 137.9099429 },
    coordinateSource: osm("relation", 7299686, "Daio Wasabi Farm"),
    categories: ["Nature", "Food", "Garden", "Family"],
    tags: ["Wasabi", "Farm", "Garden", "Azumino"],
    description:
      "A large working wasabi farm in Azumino, with clear-water fields, walking paths, food, and farm products in a distinctive rural landscape.",
    descriptionJa:
      "安曇野に広がる大規模なわさび農場。清流のわさび田、散策路、農場の味覚や商品を楽しめる特徴的な農村景観です。",
    highlights: [
      "Clear-water wasabi fields",
      "Farm walking paths and rural scenery",
      "Wasabi-based food and products from the operator",
    ],
    highlightsJa: [
      "清流を利用したわさび田",
      "農場内の散策路と田園風景",
      "運営者が案内するわさび料理と商品",
    ],
    notes:
      "The farm operator site is authoritative for current visitor information, facilities, food, and shop guidance. It is a standalone Azumino outing because no existing Azumino hub is present in the current catalogue.",
    notesJa:
      "現在の見学案内・施設・飲食・ショップ情報は農場公式サイトをご確認ください。現行カタログに安曇野市ハブがないため、独立した安曇野の訪問先として登録しています。",
    accessModes: ["train", "car"],
    source: official(
      "https://www.daiowasabi.co.jp/",
      "Daio Wasabi Farm official website",
    ),
    image: commons(
      "Daio_wasabi_farm02c.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Daio_wasabi_farm02c.jpg/1280px-Daio_wasabi_farm02c.jpg",
      "CC BY 2.5",
      "663highland, via Wikimedia Commons",
    ),
  },
  {
    id: "senjojiki-cirque",
    name: "Senjojiki Cirque",
    nameJa: "千畳敷カール",
    aliases: [
      "Senjōjiki Cirque",
      "Senjojiki Cirque, Central Alps",
      "千畳敷カール（中央アルプス）",
    ],
    officialWebsite: "https://www.chuo-alps.com/en/",
    kind: "rock_formation",
    role: "standalone",
    importance: "major",
    municipalityId: "Nagano:komagane",
    coordinates: { lat: 35.7799412, lng: 137.8127301 },
    coordinateSource: osm("node", 8585141479, "Senjojiki Cirque"),
    categories: ["Nature", "Mountain", "Geology", "Hiking"],
    tags: ["Cirque", "Central Alps", "Mountain", "Komagane"],
    description:
      "A dramatic glacial cirque in the Central Alps below Mount Hoken, reached through the Komagatake Ropeway and valued for its alpine basin scenery.",
    descriptionJa:
      "宝剣岳の下に広がる中央アルプスの壮大な氷河地形。駒ヶ岳ロープウェイで訪ねられる高山のカール景観です。",
    highlights: [
      "The broad alpine cirque below Mount Hoken",
      "Central Alps mountain scenery from the ropeway summit",
      "An independently discoverable attraction beyond the Chuo Alps park record",
    ],
    highlightsJa: [
      "宝剣岳の下に広がる高山のカール",
      "ロープウェイ山上から望む中央アルプスの景観",
      "中央アルプス国定公園記録とは別に探せる代表景勝地",
    ],
    notes:
      "The Central Alps operator site is authoritative for ropeway operation, access conditions, and mountain guidance. Senjojiki is kept independent rather than remaining only as a phrase inside the broad Chuo Alps record.",
    notesJa:
      "ロープウェイ運行・アクセス条件・山上の案内は中央アルプス駒ヶ岳ロープウェイ公式サイトをご確認ください。広域の中央アルプス記録の説明だけに留めず、独立した目的地として登録しています。",
    accessModes: ["train", "bus", "car"],
    source: official(
      "https://www.chuo-alps.com/en/",
      "Central Alps Komagatake Ropeway official website",
    ),
    image: commons(
      "Senj%C5%8Djiki_Cirque_03.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Senj%C5%8Djiki_Cirque_03.jpg/1280px-Senj%C5%8Djiki_Cirque_03.jpg",
      "CC BY 2.0",
      "Hajime NAKANO, via Wikimedia Commons",
    ),
  },
  {
    id: "suwa-taisha",
    name: "Suwa Taisha",
    nameJa: "諏訪大社",
    aliases: ["Suwa Grand Shrine", "Suwa Taisha Four Shrines", "諏訪大社四社"],
    officialWebsite: "https://suwataisha.or.jp/",
    kind: "shrine",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 35.99849, lng: 138.1190236 },
    coordinateSource: osm("way", 182516539, "Suwa Taisha Kamisha Honmiya"),
    categories: ["Shrine", "History", "Culture"],
    tags: ["Shrine", "Four Shrines", "Shinshu", "Suwa"],
    description:
      "One of Japan's ancient shrine traditions, represented by four major precincts around the Lake Suwa region and its distinctive sacred architecture and festivals.",
    descriptionJa:
      "諏訪湖周辺の四つの主要な社からなる古社。独自の社殿建築や祭礼を伝える、諏訪地域を代表する信仰文化の目的地です。",
    highlights: [
      "The Kamisha and Shimosha four-shrine pilgrimage",
      "Distinctive sacred architecture and traditions",
      "A regional shrine proposition rather than a single-site duplicate",
    ],
    highlightsJa: [
      "上社・下社の四社めぐり",
      "独自の社殿建築と伝統行事",
      "単一境内の重複ではなく諏訪地域の巡拝体験としての登録",
    ],
    notes:
      "The official Suwa Taisha site is authoritative for the four shrines, worship guidance, access, and current events. The map anchor is Kamisha Honmiya; this multi-site record intentionally has no guessed parent or single-municipality containment edge.",
    notesJa:
      "四社の案内・参拝・アクセス・行事は諏訪大社公式サイトをご確認ください。地図の代表点は上社本宮とし、複数自治体にまたがるため推測による親子関係や単一自治体への包含は設定していません。",
    accessModes: ["train", "car"],
    source: official(
      "https://suwataisha.or.jp/",
      "Suwa Taisha official website",
    ),
    image: commons(
      "Suwa_taisha_harumiya13bs3200.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Suwa_taisha_harumiya13bs3200.jpg/1280px-Suwa_taisha_harumiya13bs3200.jpg",
      "CC BY 2.5",
      "663highland, via Wikimedia Commons",
    ),
  },
  {
    id: "obuse-town",
    name: "Obuse Town",
    nameJa: "小布施町",
    aliases: ["Obuse", "小布施"],
    officialWebsite: "https://www.town.obuse.nagano.jp/sightseeing/",
    kind: "town",
    role: "hub",
    importance: "notable",
    municipalityId: "Nagano:obuse",
    coordinates: { lat: 36.6977297, lng: 138.3123863 },
    coordinateSource: osm(
      "relation",
      4759285,
      "Obuse Town administrative area",
    ),
    categories: ["Travel Hub", "History", "Food", "Culture"],
    tags: ["Town", "Chestnuts", "Hokusai", "Nagano"],
    description:
      "A compact cultural town in northern Nagano known for chestnut cuisine, preserved streets, and the Hokusai heritage that makes it a useful standalone travel hub.",
    descriptionJa:
      "栗菓子、歴史ある街並み、葛飾北斎ゆかりの文化で知られる長野県北部の小さな町。周辺を歩いて巡る旅行ハブです。",
    highlights: [
      "Chestnut sweets and local food culture",
      "Walkable historic streets and temple-town character",
      "Hokusai-related cultural sites reserved for the secondary-depth review",
    ],
    highlightsJa: [
      "栗菓子と地域の食文化",
      "歩いて巡れる歴史的な街並みと門前町の風情",
      "北斎ゆかりの文化施設は二次深掘りで評価",
    ],
    notes:
      "The Obuse municipal site is authoritative for current town tourism information. This PR adds the hub only; its candidate museums, temples, and streets remain deliberately unadded until the KAI-258C evidence review.",
    notesJa:
      "町の観光情報は小布施町公式サイトをご確認ください。本PRではハブのみを追加し、候補の美術館・寺院・通りはKAI-258Cの証拠確認まで意図的に追加しません。",
    accessModes: ["train", "car"],
    source: official(
      "https://www.town.obuse.nagano.jp/sightseeing/",
      "Obuse Town official tourism portal",
    ),
    image: commons(
      "Chestnut_Obuse_City%2C_Nagano_Prefecture.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Chestnut_Obuse_City%2C_Nagano_Prefecture.jpg/1280px-Chestnut_Obuse_City%2C_Nagano_Prefecture.jpg",
      "CC BY-SA 3.0",
      "黒ゆり, via Wikimedia Commons",
    ),
  },
];

const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s]+/gu, "");

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];
const originalIds = new Set(catalog.map((destination) => destination.id));
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const names = new Map<string, string>();
for (const destination of catalog) {
  for (const value of [
    destination.name,
    destination.nameJa,
    ...(destination.aliases ?? []),
  ].filter((value): value is string => Boolean(value))) {
    const key = normalize(value);
    if (key.length >= 6) names.set(key, destination.id);
  }
}

for (const candidate of candidates) {
  const existing = byId.get(candidate.id);
  if (existing) {
    if (
      existing.name !== candidate.name ||
      existing.nameJa !== candidate.nameJa ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(
        `${candidate.id}: existing record has conflicting identity`,
      );
    }
    const visitBand = visitHours[candidate.id];
    if (!visitBand)
      throw new Error(`${candidate.id}: missing visit-hours band`);
    if (existing.recommendedVisitHours === undefined) {
      existing.recommendedVisitHours = visitBand;
      existing.editorial = existing.editorial ?? {
        lifecycle: "approved",
        sources: [candidate.source, candidate.coordinateSource],
      };
      existing.editorial.fieldSources = {
        ...(existing.editorial.fieldSources ?? {}),
        recommendedVisitHours: [candidate.source],
      };
    }
    if (
      existing.budgetMetadata?.state !== "unavailable" ||
      existing.budgetMetadata.provenance !== "none" ||
      existing.budgetMetadata.reasonCode !== "source_missing"
    ) {
      existing.budgetMetadata = {
        ...(existing.budgetMetadata ?? {}),
        method: "unknown",
        state: "unavailable",
        provenance: "none",
        reasonCode: "source_missing",
      };
    }
    const admission = makeAdmission(candidate);
    if (JSON.stringify(existing.admission) !== JSON.stringify(admission)) {
      existing.admission = admission;
    }
    const localTransport = makeLocalTransport();
    if (
      JSON.stringify(existing.localTransport) !== JSON.stringify(localTransport)
    ) {
      existing.localTransport = localTransport;
    }
    continue;
  }
  if (
    candidate.municipalityId &&
    candidate.municipalityId.split(":")[0] !== "Nagano"
  ) {
    throw new Error(`${candidate.id}: candidate is outside Nagano scope`);
  }
  for (const value of [
    candidate.name,
    candidate.nameJa,
    ...candidate.aliases,
  ]) {
    const key = normalize(value);
    if (key.length >= 6 && names.has(key)) {
      throw new Error(
        `${candidate.id}: normalized candidate name '${value}' duplicates ${names.get(key)}`,
      );
    }
  }
  if (candidate.parentDestinationId) {
    const parent = byId.get(candidate.parentDestinationId);
    if (!parent || parent.role !== "hub") {
      throw new Error(`${candidate.id}: parent must be an existing hub`);
    }
    if (parent.municipalityId !== candidate.municipalityId) {
      throw new Error(
        `${candidate.id}: parent municipality ${parent.municipalityId} does not match ${candidate.municipalityId}`,
      );
    }
  }
  const record = makeRecord(candidate);
  catalog.push(record);
  byId.set(record.id, record);
  for (const value of [record.name, record.nameJa, ...(record.aliases ?? [])]) {
    const key = normalize(value);
    if (key.length >= 6) names.set(key, record.id);
  }
}

const hubUpdates: Record<
  string,
  { childIds: string[]; description?: string; highlights?: string[] }
> = {
  "nagano-city": {
    childIds: ["zenkoji-temple", "togakushi-shrine"],
  },
  "karuizawa-town": {
    childIds: ["kumoba-pond", "kyu-karuizawa-ginza", "harunire-terrace"],
    description:
      "Elegant alpine mountain resort town with distinct nature, heritage-shopping, and forest dining choices including Kumoba Pond, Kyu-Karuizawa Ginza, and Harunire Terrace.",
    highlights: [
      "Kumoba Pond woodland reflections",
      "Kyu-Karuizawa Ginza heritage shopping street",
      "Harunire Terrace forest restaurants and shops",
    ],
  },
  "hakuba-village": {
    childIds: ["happo-pond", "hakuba-iwatake-mountain-resort"],
    description:
      "World-famous Japan Alps mountain village with independently discoverable alpine viewpoints and resorts including Happo Pond and Hakuba Iwatake Mountain Resort.",
    highlights: [
      "Happo Pond alpine hiking and reflections",
      "Hakuba Iwatake Mountain Resort panoramas",
      "Northern Alps mountain scenery",
    ],
  },
};

for (const [hubId, update] of Object.entries(hubUpdates)) {
  const hub = byId.get(hubId);
  if (!hub || hub.role !== "hub") throw new Error(`${hubId}: hub not found`);
  const existing = hub.relationships?.featuredDestinationIds ?? [];
  const merged = [...new Set([...existing, ...update.childIds])];
  hub.relationships = {
    ...(hub.relationships ?? {}),
    featuredDestinationIds: merged,
  };
  if (update.description) hub.description = update.description;
  if (update.highlights) hub.highlights = update.highlights;
}

fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `KAI-258A: Nagano catalogue now has ${catalog.filter((d) => d.prefecture === "Nagano").length} records; added ${candidates.filter((candidate) => !originalIds.has(candidate.id)).length} requested P0 records.`,
);
