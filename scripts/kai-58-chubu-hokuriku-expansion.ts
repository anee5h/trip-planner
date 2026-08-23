/**
 * KAI-58 — Chubu/Hokuriku regional depth.
 *
 * Decision record (Ox primary-source research vs Luna catalogue audit, 2026-08-23):
 * - ADD Ainokura and Suganuma as two separately mapped, inhabited UNESCO
 *   components in Nanto, not as a generic Gokayama/serial-property duplicate.
 * - ADD Toyama Glass Art Museum as the one bounded urban Toyama culture anchor.
 * - ADD Fukui Prefectural Dinosaur Museum as a distinct Katsuyama museum outing.
 * - ENRICH the existing canonical Tojinbo ID; boats are weather-dependent context,
 *   never a second destination card.
 * - DEFER Maruoka Castle because active 2026 repair / partial-entry windows cannot
 *   be represented as ordinary unrestricted visitor status. Defer Zuiryuji, Himi,
 *   generic city labels, and Alpine Route infrastructure to avoid scope sprawl.
 *
 * Transport contract: every record carries only local-access topology. No static
 * origin duration is inferred from a train, tram, road, or community-bus final leg.
 *
 * Usage: npx tsx scripts/kai-58-chubu-hokuriku-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
import type {
  Destination,
  SourceReference,
} from "../src/shared/types/destination";

const INDEX_PATH =
  process.env.KAI58_INDEX_PATH ??
  path.join(process.cwd(), "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-23";

type DestinationWithLocation = Destination & {
  location?: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
};

type RecordSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases: string[];
  prefecture: "Toyama" | "Fukui";
  municipalityId: string;
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  coordinates?: { lat: number; lng: number };
  location: NonNullable<DestinationWithLocation["location"]>;
  categories: string[];
  tags: string[];
  description: string;
  descriptionJa: string;
  highlights: string[];
  highlightsJa: string[];
  notes: string;
  notesJa: string;
  reservation: string;
  reservationJa: string;
  parking: string;
  parkingJa: string;
  openingHours: string;
  openingHoursJa: string;
  localAccessModes: TransportMode[];
  duration: {
    hours: { min: number; max: number };
    confidence: "high" | "medium";
    basis: string;
  };
  sources: SourceReference[];
  image: {
    heroImage: string;
    sourceUrl: string;
    license: string;
    attribution: string;
  };
};

const source = (
  type: SourceReference["type"],
  url: string,
  title: string,
): SourceReference => ({ type, url, title, accessedAt: REVIEW_DATE });

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

const unknownBudget = {
  method: "unknown" as const,
  modelVersion: "budget-model-v1",
  confidence: "unknown" as const,
  basis:
    "Current admission, food, and access costs are destination- and date-dependent; no numeric budget is published here.",
};

const unknownCrowd = {
  method: "unknown" as const,
  modelVersion: "crowd-model-v1",
  confidence: "unknown" as const,
  basis:
    "No stable crowd vector was verified from first-party sources; it is not inferred from attraction type.",
};

const unknownSeason = {
  method: "unknown" as const,
  modelVersion: "season-model-v1",
  confidence: "unknown" as const,
  basis:
    "Operational hours and seasonal openings do not establish a defensible four-season suitability score; unknown is preserved.",
};

const unestimatedTransportMetadata = {
  method: "unestimated" as const,
  confidence: "unknown" as const,
  basis:
    "Local access is documented, but no complete origin-aware corridor duration is modeled. Static transportOptions are deliberately empty so local-leg facts never become origin-route fallbacks.",
};

const makeRecord = (spec: RecordSpec): DestinationWithLocation => {
  const primarySource = spec.sources[0];
  const accessSource =
    spec.sources.find((candidate) =>
      /access|bus|tram|railway|transport|route/i.test(candidate.title),
    ) ?? primarySource;
  const coordinateSource =
    spec.sources.find((candidate) => candidate.type === "manual") ??
    primarySource;

  return {
    id: spec.id,
    officialWebsite: primarySource.url,
    officialWebsiteRequirement: "required",
    name: spec.name,
    nameJa: spec.nameJa,
    aliases: spec.aliases,
    municipalityId: spec.municipalityId,
    prefecture: spec.prefecture,
    region: "Chubu",
    kind: spec.kind,
    role: "standalone",
    placeType: "destination",
    importance: spec.importance,
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
        reservation: spec.reservation,
        parking: spec.parking,
        openingHours: spec.openingHours,
      },
      ja: {
        name: spec.nameJa,
        description: spec.descriptionJa,
        highlights: spec.highlightsJa,
        notes: spec.notesJa,
        reservation: spec.reservationJa,
        parking: spec.parkingJa,
        openingHours: spec.openingHoursJa,
      },
    },
    heroImage: spec.image.heroImage,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: spec.image.license,
      attribution: spec.image.attribution,
      sourceUrl: spec.image.sourceUrl,
    },
    transportOptions: {},
    localAccessModes: spec.localAccessModes,
    localAccessUnestimated: true,
    transportMetadata: unestimatedTransportMetadata,
    recommendedVisitHours: spec.duration.hours,
    durationMetadata: {
      method: "manual",
      confidence: spec.duration.confidence,
      basis: spec.duration.basis,
    },
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
    reservation: spec.reservation,
    parking: spec.parking,
    notes: spec.notes,
    notesJa: spec.notesJa,
    status: "verified",
    travelEstimate: { confidence: "beta" },
    collections: [],
    relationships: {},
    editorial: {
      lifecycle: "approved",
      freshness: "current",
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      reviewedBy: "Meguruto editorial",
      changeSummary:
        "Added or refreshed after first-party operational, identity, and local-access verification for KAI-58 Chubu/Hokuriku regional depth.",
      sources: spec.sources,
      fieldSources: {
        name: [primarySource],
        nameJa: [primarySource],
        municipalityId: [primarySource],
        status: [primarySource],
        coordinates: [coordinateSource],
        location: [coordinateSource],
        localAccessModes: [accessSource],
        transportOptions: [accessSource],
      },
      changes: [
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Added or refreshed one canonical KAI-58 Chubu/Hokuriku destination from current first-party evidence.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

const ainokura = makeRecord({
  id: "ainokura-gassho-village",
  name: "Ainokura Gassho-zukuri Village",
  nameJa: "相倉合掌造り集落",
  aliases: [
    "The Gassho-zukuri Village of Ainokura",
    "Ainokura Village",
    "Ainokura",
    "相倉",
  ],
  prefecture: "Toyama",
  municipalityId: "Toyama:nanto",
  kind: "village",
  importance: "major",
  coordinates: { lat: 36.426006, lng: 136.935478 },
  location: {
    address: "611 Ainokura, Nanto, Toyama 939-1915",
    latitude: 36.426006,
    longitude: 136.935478,
  },
  categories: ["Village", "UNESCO", "Heritage", "Architecture", "Culture"],
  tags: ["Gokayama", "Gassho-zukuri", "UNESCO", "Nanto", "Minshuku"],
  description:
    "An inhabited UNESCO World Heritage gassho-zukuri village in Gokayama, with steep thatched houses, small museums and traditional inns among the Shogawa valley mountains.",
  descriptionJa:
    "五箇山にある世界遺産の合掌造り集落。急勾配の茅葺き家屋が残り、民家園ではなく今も住民が暮らす集落の中に資料館や民宿があります。",
  highlights: [
    "A distinct UNESCO component with inhabited 100–350-year-old gassho houses",
    "Village museums, washi-making context and traditional minshuku stays",
    "Mountain-valley scenery that is especially immersive as an overnight stop",
  ],
  highlightsJa: [
    "住民が暮らす世界遺産の合掌造り集落",
    "資料館・和紙文化・民宿に触れる滞在",
    "山あいの景観を泊まりで味わえる五箇山の拠点",
  ],
  notes:
    "Ainokura is a distinct World Heritage component, not a generic Gokayama label or a duplicate of Suganuma. The World Heritage Bus serves Ainokuraguchi; the official village guidance says the stop is about a 5-minute walk away. Bus schedules and mountain-road conditions are variable, so check the operator before travel.",
  notesJa:
    "相倉は菅沼とは別の世界遺産構成資産で、「五箇山」という地域名の重複カードではありません。世界遺産バスの相倉口から集落までは公式案内で徒歩約5分。山間部のバス時刻・道路状況は変動するため、出発前に運行会社で確認してください。",
  reservation:
    "Village access is generally open; reserve minshuku or experiences directly and check the official village guidance for current arrangements.",
  reservationJa:
    "集落への立ち入りは原則自由ですが、民宿・体験は各施設へ予約し、最新の案内を公式サイトで確認してください。",
  parking:
    "Use the designated village parking or the World Heritage Bus; check local guidance for current access conditions.",
  parkingJa:
    "指定駐車場または世界遺産バスを利用し、最新の交通案内を確認してください。",
  openingHours:
    "Village access: 08:30–17:00 daily per official visitor guidance; individual houses, museums and inns set their own hours.",
  openingHoursJa:
    "公式案内では集落の見学時間は毎日8:30〜17:00。民家・資料館・民宿の営業時間は各施設で異なります。",
  localAccessModes: ["bus", "car", "my_car"],
  duration: {
    hours: { min: 2, max: 3 },
    confidence: "medium",
    basis:
      "Conservative on-site village, museum, and walking band; overnight accommodation is optional and intercity bus travel is excluded.",
  },
  sources: [
    source(
      "tourism_board",
      "https://gokayama-info.jp/en/archives/1306",
      "Gokayama official: The Gassho-zukuri Village of Ainokura",
    ),
    source(
      "government",
      "https://culture-archives.city.nanto.toyama.jp/heritages/sekai0001/",
      "Nanto City cultural archive: Historic Villages of Shirakawa-go and Gokayama",
    ),
    source(
      "official",
      "https://www.kaetsunou.co.jp/company/sekaiisan/",
      "Kaetsuno Bus World Heritage Bus timetable",
    ),
    source(
      "government",
      "https://whc.unesco.org/en/list/734/maps/",
      "UNESCO Historic Villages of Shirakawa-go and Gokayama component map",
    ),
    source(
      "government",
      "https://www.tabi-nanto.jp/archives/4517",
      "Gokayama NANTO Tourism Organization (Nanto City official): Ainokura village map pin",
    ),
  ],
  image: {
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Gokayama_Ainokura_Gassho-zukuri_09.jpg/1280px-Gokayama_Ainokura_Gassho-zukuri_09.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Gokayama_Ainokura_Gassho-zukuri_09.jpg",
    license: "CC BY-SA 4.0",
    attribution: "Zairon, CC BY-SA 4.0, via Wikimedia Commons",
  },
});

const suganuma = makeRecord({
  id: "suganuma-gassho-village",
  name: "Suganuma Gassho-zukuri Village",
  nameJa: "菅沼合掌造り集落",
  aliases: [
    "The Gassho-zukuri Village of Suganuma",
    "Suganuma Village",
    "Suganuma",
    "菅沼",
  ],
  prefecture: "Toyama",
  municipalityId: "Toyama:nanto",
  kind: "village",
  importance: "notable",
  coordinates: { lat: 36.404163, lng: 136.886581 },
  location: {
    address: "578 Suganuma, Nanto, Toyama 939-1973",
    latitude: 36.404163,
    longitude: 136.886581,
  },
  categories: ["Village", "UNESCO", "Heritage", "Architecture", "Culture"],
  tags: ["Gokayama", "Gassho-zukuri", "UNESCO", "Nanto", "Mountain Village"],
  description:
    "A small, separately mapped UNESCO gassho-zukuri village in Gokayama, where nine surviving thatched houses form a compact mountain-valley heritage stop distinct from nearby Ainokura.",
  descriptionJa:
    "五箇山にある小規模な世界遺産の合掌造り集落。現存する9棟の茅葺き家屋が山あいに集まり、近隣の相倉とは別の構成資産・立ち寄り先です。",
  highlights: [
    "A separate UNESCO component with a compact cluster of nine surviving gassho houses",
    "A smaller, quieter heritage-village outing than Ainokura",
    "Gokayama culture museums and valley scenery beside the World Heritage Bus stop",
  ],
  highlightsJa: [
    "9棟の合掌造りが残る独立した世界遺産構成資産",
    "相倉とは異なる、コンパクトで静かな集落散策",
    "世界遺産バスでつながる五箇山文化と山里の景観",
  ],
  notes:
    "Suganuma is not an Ainokura sub-feature: UNESCO maps it as a separate component, with its own visitor conditions and World Heritage Bus stop about a 1-minute walk from the village. Seasonal hours and mountain-road transport can change; verify the official guidance before travel.",
  notesJa:
    "菅沼は相倉の付属施設ではありません。ユネスコでは別の構成資産として地図化され、独自の見学条件と世界遺産バス停（集落まで公式案内で徒歩約1分）があります。季節の見学時間・山間部の交通は変わるため、出発前に公式案内を確認してください。",
  reservation:
    "Village access is generally open; check official visitor guidance for seasonal access and individual facility arrangements.",
  reservationJa:
    "集落への立ち入りは原則自由ですが、季節の交通・各施設の利用条件は公式案内を確認してください。",
  parking:
    "Use designated local parking or the World Heritage Bus; do not treat small village roads as general parking.",
  parkingJa:
    "指定駐車場または世界遺産バスを利用し、集落内の狭い道路を一般駐車場として扱わないでください。",
  openingHours:
    "Official visitor guidance: 08:00–17:00 Apr–Nov; 09:00–17:00 Dec–Mar; closed Dec 31–Jan 1. Individual facilities vary.",
  openingHoursJa:
    "公式案内では4〜11月は8:00〜17:00、12〜3月は9:00〜17:00、12月31日〜1月1日は休み。個別施設の時間は異なります。",
  localAccessModes: ["bus", "car", "my_car"],
  duration: {
    hours: { min: 1.5, max: 2.5 },
    confidence: "medium",
    basis:
      "Conservative compact-village and museum/walk band; bus approach time and any onward Gokayama itinerary are excluded.",
  },
  sources: [
    source(
      "tourism_board",
      "https://gokayama-info.jp/en/archives/1270",
      "Gokayama official: The Gassho-zukuri Village of Suganuma",
    ),
    source(
      "government",
      "https://culture-archives.city.nanto.toyama.jp/heritages/sekai0001/",
      "Nanto City cultural archive: Historic Villages of Shirakawa-go and Gokayama",
    ),
    source(
      "official",
      "https://www.kaetsunou.co.jp/company/sekaiisan/",
      "Kaetsuno Bus World Heritage Bus timetable",
    ),
    source(
      "government",
      "https://whc.unesco.org/en/list/734/maps/",
      "UNESCO Historic Villages of Shirakawa-go and Gokayama component map",
    ),
    source(
      "government",
      "https://www.tabi-nanto.jp/archives/4497",
      "Gokayama NANTO Tourism Organization (Nanto City official): Suganuma village map pin",
    ),
  ],
  image: {
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Suganuma_Gassho_village_-_Flickr_-_tsuda.jpg/1280px-Suganuma_Gassho_village_-_Flickr_-_tsuda.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Suganuma_Gassho_village_-_Flickr_-_tsuda.jpg",
    license: "CC BY-SA 2.0",
    attribution:
      "tsuda from Tsushima, Aichi, Japan, CC BY-SA 2.0, via Wikimedia Commons",
  },
});

const toyamaGlass = makeRecord({
  id: "toyama-glass-art-museum",
  name: "Toyama Glass Art Museum",
  nameJa: "富山市ガラス美術館",
  aliases: ["Toyama Kirari", "Toyama City Glass Art Museum", "富山キラリ"],
  prefecture: "Toyama",
  municipalityId: "Toyama:toyama",
  kind: "museum",
  importance: "notable",
  coordinates: { lat: 36.6886084, lng: 137.2151316 },
  location: {
    address: "5-1 Nishicho, Toyama, Toyama 930-0062",
    latitude: 36.6886084,
    longitude: 137.2151316,
  },
  categories: ["Museum", "Contemporary Art", "Architecture", "Culture"],
  tags: ["Glass Art", "Toyama Kirari", "Museum", "Toyama City", "Architecture"],
  description:
    "A contemporary glass museum in the timber-and-glass Toyama Kirari building, with permanent and changing exhibitions plus the site-specific Glass Art Garden in central Toyama City.",
  descriptionJa:
    "富山市中心部の複合施設「富山キラリ」にある現代ガラス美術館。常設・企画展示と、空間全体を生かしたグラス・アート・ガーデンを楽しめます。",
  highlights: [
    "Contemporary glass exhibitions and the site-specific Glass Art Garden",
    "The distinctive Toyama Kirari architecture in central Toyama",
    "An urban culture anchor complementary to Toyama’s mountain and village outings",
  ],
  highlightsJa: [
    "現代ガラス作品とグラス・アート・ガーデン",
    "富山キラリの建築空間",
    "山岳・山里観光と異なる富山市中心部の文化拠点",
  ],
  notes:
    "The museum is in central Toyama City: from Toyama Station, use the tram to Grand Plaza-mae (then about 2 minutes on foot) or Nishicho (about 1 minute). Exhibition changes and closures affect access, so check the official calendar; the museum has no visitor parking.",
  notesJa:
    "富山駅から市内電車でグランドプラザ前下車徒歩約2分、または西町下車徒歩約1分。展示替え・休館日は公式カレンダーで確認してください。来館者用駐車場はありません。",
  reservation:
    "No general reservation is stated; check the official calendar and ticket guidance because exhibition access and closures can vary.",
  reservationJa:
    "一般的な予約案内はありませんが、展示・休館日により利用条件が変わるため公式カレンダーとチケット案内を確認してください。",
  parking:
    "No visitor parking. Use tram or nearby public parking at your own arrangement.",
  parkingJa:
    "来館者用駐車場はありません。市内電車または周辺の公共駐車場を利用してください。",
  openingHours:
    "Normally 09:30–18:00 (admission to 17:30); the official calendar and exhibition notices govern special hours and closures.",
  openingHoursJa:
    "通常9:30〜18:00（入場は17:30まで）。特別時間・休館日は公式カレンダーと展示案内を確認してください。",
  localAccessModes: ["train", "bus", "car", "my_car"],
  duration: {
    hours: { min: 1.5, max: 2.5 },
    confidence: "medium",
    basis:
      "Conservative single-museum band covering permanent/gallery viewing; special exhibitions may change the appropriate dwell time.",
  },
  sources: [
    source(
      "official",
      "https://toyama-glass-art-museum.jp/en/",
      "Toyama Glass Art Museum official English site and current calendar",
    ),
    source(
      "official",
      "https://toyama-glass-art-museum.jp/en/visitor/",
      "Toyama Glass Art Museum official visitor and access information",
    ),
    source(
      "tourism_board",
      "https://visit-toyama-japan.com/en/places-to-go/80267",
      "Visit Toyama official: Toyama Glass Art Museum",
    ),
    source(
      "official",
      "https://toyama-glass-art-museum.jp/visitor/",
      "Toyama Glass Art Museum official visitor guide map (confirms catalogue coordinates)",
    ),
  ],
  image: {
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/TOYAMA_KIRARI_Toyama_Glass_Art_Museum_ac_%281%29.jpg/1280px-TOYAMA_KIRARI_Toyama_Glass_Art_Museum_ac_%281%29.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:TOYAMA_KIRARI_Toyama_Glass_Art_Museum_ac_(1).jpg",
    license: "CC BY-SA 4.0",
    attribution: "Asturio Cantabrio, CC BY-SA 4.0, via Wikimedia Commons",
  },
});

const dinosaurMuseum = makeRecord({
  id: "fukui-prefectural-dinosaur-museum",
  name: "Fukui Prefectural Dinosaur Museum",
  nameJa: "福井県立恐竜博物館",
  aliases: ["FPDM", "Fukui Dinosaur Museum", "恐竜博物館"],
  prefecture: "Fukui",
  municipalityId: "Fukui:katsuyama",
  kind: "museum",
  importance: "major",
  coordinates: { lat: 36.082679, lng: 136.506355 },
  location: {
    address: "51-11 Terao, Muroko-cho, Katsuyama, Fukui 911-8601",
    latitude: 36.082679,
    longitude: 136.506355,
  },
  categories: ["Museum", "Science", "Natural History", "Family"],
  tags: ["Dinosaurs", "Fossils", "Natural History", "Katsuyama", "Family"],
  description:
    "Japan’s principal dinosaur museum in Katsuyama, with major fossil and natural-history galleries, a large reconstructed museum complex and seasonal field-station activities.",
  descriptionJa:
    "勝山市にある国内有数の恐竜・古生物博物館。恐竜化石や地球史の展示を中心に、大規模な展示空間と季節のフィールドステーション活動を備えます。",
  highlights: [
    "Large-scale dinosaur, fossil and earth-history galleries",
    "A destination-scale museum rather than a small local collection",
    "Seasonal field-station and fossil-programme context",
  ],
  highlightsJa: [
    "恐竜・化石・地球史を扱う大規模展示",
    "地域資料館ではない、目的地となる博物館体験",
    "季節のフィールドステーション・化石プログラム",
  ],
  notes:
    "From JR Fukui, the official route uses the Echizen Railway to Katsuyama (about 1 hour), then a taxi (about 10 minutes) or community bus. Current ticket guidance makes advance time-specific purchase the principle; same-day admission depends on remaining inventory. Check the museum before travel for special exhibitions and closures.",
  notesJa:
    "JR福井駅からえちぜん鉄道で勝山駅まで約1時間、駅からタクシー約10分またはコミュニティバスを利用します。現行のチケット案内では事前の日時指定購入が原則で、当日券は残数がある場合のみです。企画展・休館日は訪問前に博物館で確認してください。",
  reservation:
    "Advance time-specific ticket purchase is the principle; same-day admission is only available when inventory remains. Check the official ticket page before travel.",
  reservationJa:
    "事前の日時指定チケット購入が原則です。当日入場は残数がある場合のみのため、訪問前に公式チケット案内を確認してください。",
  parking:
    "Large on-site parking is available; use rail plus the community bus or taxi when practical and check current event-day guidance.",
  parkingJa:
    "大型駐車場があります。状況に応じて鉄道とコミュニティバスまたはタクシーを利用し、イベント日の案内を確認してください。",
  openingHours:
    "Normally 09:00–17:00 (entry to 16:30); the second and fourth Wednesdays and year-end/New Year are closed except as announced. Check the official calendar for seasonal changes.",
  openingHoursJa:
    "通常9:00〜17:00（入館は16:30まで）。夏休み期間等を除き第2・第4水曜と年末年始は休館です。季節・企画展の変更は公式案内を確認してください。",
  localAccessModes: ["train", "bus", "car", "my_car"],
  duration: {
    hours: { min: 3, max: 4 },
    confidence: "medium",
    basis:
      "Conservative large-museum gallery band; optional field-station activities and the Katsuyama approach are excluded.",
  },
  sources: [
    source(
      "official",
      "https://www.dinosaur.pref.fukui.jp/en/info.html",
      "Fukui Prefectural Dinosaur Museum official access, hours and fees",
    ),
    source(
      "official",
      "https://www.dinosaur.pref.fukui.jp/guide/ticket.html",
      "Fukui Prefectural Dinosaur Museum current ticket guidance",
    ),
    source(
      "official",
      "https://www.dinosaur.pref.fukui.jp/guide/access.html",
      "Fukui Prefectural Dinosaur Museum current Japanese access guidance",
    ),
    source(
      "official",
      "https://www.dinosaur.pref.fukui.jp/",
      "Fukui Prefectural Dinosaur Museum official site map (embedded map within ~33 m of record)",
    ),
  ],
  image: {
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Fukui_Prefectural_Dinosaur_Museum_20210504_59.jpg/1280px-Fukui_Prefectural_Dinosaur_Museum_20210504_59.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Fukui_Prefectural_Dinosaur_Museum_20210504_59.jpg",
    license: "CC0",
    attribution: "先従隗始, CC0, via Wikimedia Commons",
  },
});

const tojinbo = makeRecord({
  id: "tojinbo-cliffs-fukui",
  name: "Tojinbo Cliffs",
  nameJa: "東尋坊",
  aliases: [
    "Tojinbo Basalt Sea Cliffs",
    "Tojinbo",
    "東尋坊の断崖",
    "東尋坊観光遊覧船",
  ],
  prefecture: "Fukui",
  municipalityId: "Fukui:sakai",
  kind: "nature",
  importance: "major",
  coordinates: { lat: 36.25147269, lng: 136.12033106 },
  location: {
    address: "Mikuni-cho Anto, Sakai, Fukui",
    latitude: 36.25147269,
    longitude: 136.12033106,
  },
  categories: ["Nature", "Geology", "Coast", "Scenic Walk"],
  tags: ["Cliffs", "Columnar Joints", "Coast", "Sakai", "Fukui"],
  description:
    "A designated coastal cliffscape in Sakai, where rare coarse columnar-jointed volcanic rock forms a dramatic Sea of Japan shoreline with cliff walks and an optional weather-dependent sightseeing cruise.",
  descriptionJa:
    "坂井市の日本海岸にある名勝・天然記念物の断崖景勝地。粗い柱状節理の火山岩が連なる海岸を歩け、天候・海況次第で遊覧船も利用できます。",
  highlights: [
    "Designated cliffscape with rare columnar-jointed volcanic formations",
    "Coastal walks and viewpoints along the Sea of Japan",
    "Optional sightseeing boat as a weather-dependent activity, not a separate destination",
  ],
  highlightsJa: [
    "柱状節理の火山岩が連なる名勝・天然記念物の断崖",
    "日本海を望む海岸散策と展望",
    "天候・海況に左右される遊覧船は別カードではなく任意の体験",
  ],
  notes:
    "Tojinbo is the canonical cliff destination; the sightseeing boat is an optional operator activity, not a duplicate place card. From Mikuni Station, the operator describes a local bus final leg of about 10 minutes; boat departures, boarding point and cancellations depend on sea conditions, so verify same-day status. The current Tojinbo area redevelopment is scheduled through 2027.",
  notesJa:
    "東尋坊は断崖そのものを表す正規の目的地です。遊覧船は別の場所カードではなく任意の事業者体験です。三国駅からの最終区間は事業者案内で路線バス約10分。出航・乗船場所・欠航は海況に左右されるため当日確認してください。東尋坊エリアは2027年完成予定の整備が進行中です。",
  reservation:
    "Cliff access does not require a reservation. Check the sightseeing-boat operator on the day of travel because departures and boarding location depend on weather and sea conditions.",
  reservationJa:
    "断崖の見学に予約は不要です。遊覧船は天候・海況で出航と乗船場所が変わるため、当日に事業者案内を確認してください。",
  parking:
    "Use designated Tojinbo-area parking or public transport. Check the current area and boat-operator guidance while redevelopment is in progress.",
  parkingJa:
    "東尋坊エリアの指定駐車場または公共交通を利用してください。整備期間中は現地と遊覧船事業者の最新案内を確認してください。",
  openingHours:
    "Cliff access is an outdoor visit. The sightseeing boat’s published seasonal schedule and actual operation are weather- and sea-condition-dependent; verify on the day.",
  openingHoursJa:
    "断崖は屋外の見学地です。遊覧船の季節運航時間と実際の出航は天候・海況に左右されるため、当日確認してください。",
  localAccessModes: ["train", "bus", "car", "my_car"],
  duration: {
    hours: { min: 2, max: 3 },
    confidence: "medium",
    basis:
      "Conservative on-foot cliff and promenade band; optional 30-minute cruise and all station approach time are excluded.",
  },
  sources: [
    source(
      "government",
      "https://kunishitei.bunka.go.jp/heritage/detail/401/1050",
      "Agency for Cultural Affairs: Tojinbo designated heritage record",
    ),
    source(
      "tourism_board",
      "https://kanko-sakai.com/en/feature/tojinbo_oshima/",
      "Sakai City Tourism Guide: Tojinbo and Oshima access and coastal walks",
    ),
    source(
      "official",
      "https://www.toujinbou-yuransen.jp/access/",
      "Tojinbo Cliffs Sightseeing Boats official access guidance",
    ),
    source(
      "official",
      "https://www.toujinbou-yuransen.jp/",
      "Tojinbo Cliffs Sightseeing Boats current operation status",
    ),
  ],
  image: {
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Tojinbo_cliffs%2C_Fukui_Prefecture%3B_September_2019_%2801%29.jpg/1280px-Tojinbo_cliffs%2C_Fukui_Prefecture%3B_September_2019_%2801%29.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Tojinbo_cliffs,_Fukui_Prefecture;_September_2019_(01).jpg",
    license: "CC BY 2.0",
    attribution: "雷太, CC BY 2.0, via Wikimedia Commons",
  },
});

const reviewedRecords = [
  ainokura,
  suganuma,
  toyamaGlass,
  dinosaurMuseum,
  tojinbo,
];
const newRecordIds = new Set(
  reviewedRecords
    .filter((record) => record.id !== tojinbo.id)
    .map((record) => record.id),
);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, "");

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as DestinationWithLocation[];
const byId = new Map(catalog.map((record) => [record.id, record]));
const names = new Map<string, string>();
for (const record of catalog) {
  for (const value of [record.name, record.nameJa, ...(record.aliases ?? [])]) {
    if (!value) continue;
    const key = normalize(value);
    if (key.length >= 6 && !names.has(key)) names.set(key, record.id);
  }
}

const preserveKAI58DerivedOutputs = (
  existing: DestinationWithLocation,
  canonical: DestinationWithLocation,
): DestinationWithLocation => {
  const merged: DestinationWithLocation = {
    ...canonical,
    collections: existing.collections ?? [],
    relationships: {
      ...(existing.relationships ?? {}),
      ...(canonical.relationships ?? {}),
    },
  };
  // On the initial migration, replace legacy derived data so the canonical
  // KAI-89 generator can recompute it. On later reruns, retain that generator's
  // output rather than making its committed artifacts stale again.
  const isPriorKAI58Record =
    existing.editorial?.checkedAt === REVIEW_DATE &&
    existing.editorial.changeSummary?.includes("KAI-58");
  if (!isPriorKAI58Record) return merged;

  return {
    ...merged,
    walkingMin: existing.walkingMin,
    walkingIntensity: existing.walkingIntensity,
    walkingMetadata: existing.walkingMetadata,
    scoreMetadata: existing.scoreMetadata,
    editorial: {
      ...merged.editorial,
      fieldSources: {
        ...(merged.editorial?.fieldSources ?? {}),
        ...(existing.editorial?.fieldSources?.walkingMin
          ? { walkingMin: existing.editorial.fieldSources.walkingMin }
          : {}),
      },
    },
  };
};

const addedIds: string[] = [];
const enrichedIds: string[] = [];
for (const candidate of reviewedRecords) {
  const existing = byId.get(candidate.id);
  if (!existing) {
    if (!newRecordIds.has(candidate.id)) {
      throw new Error(
        `KAI-58 expected existing canonical record: ${candidate.id}`,
      );
    }
    if (candidate.municipalityId?.split(":")[0] !== candidate.prefecture) {
      throw new Error(`${candidate.id}: municipality/prefecture mismatch`);
    }
    for (const value of [
      candidate.name,
      candidate.nameJa,
      ...candidate.aliases,
    ]) {
      const key = normalize(value);
      if (key.length < 6) continue;
      const duplicateId = names.get(key);
      if (duplicateId && duplicateId !== candidate.id) {
        throw new Error(
          `${candidate.id}: normalized identity '${value}' duplicates ${duplicateId}`,
        );
      }
    }
    catalog.push(candidate);
    byId.set(candidate.id, candidate);
    for (const value of [
      candidate.name,
      candidate.nameJa,
      ...candidate.aliases,
    ]) {
      const key = normalize(value);
      if (key.length >= 6) names.set(key, candidate.id);
    }
    addedIds.push(candidate.id);
    continue;
  }

  if (candidate.id !== "tojinbo-cliffs-fukui") {
    // An earlier KAI-58 run may already have added this record. Preserve
    // relationship/collection state, but re-apply canonical fields so a later
    // verified correction (for example, an official map coordinate) is not
    // silently ignored on rerun.
    if (
      existing.name !== candidate.name ||
      existing.nameJa !== candidate.nameJa ||
      existing.prefecture !== candidate.prefecture ||
      existing.region !== candidate.region ||
      existing.municipalityId !== candidate.municipalityId
    ) {
      throw new Error(`KAI-58 identity conflict: ${candidate.id}`);
    }
    const merged = preserveKAI58DerivedOutputs(existing, candidate);
    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      const index = catalog.findIndex((record) => record.id === candidate.id);
      catalog[index] = merged;
      byId.set(candidate.id, merged);
      enrichedIds.push(candidate.id);
    }
    continue;
  }

  // Intentional canonical migration from incomplete legacy Tojinbo metadata.
  // Preserve existing collections/relationship keys, then overwrite every visitor
  // field that KAI-58 has re-verified; this avoids creating a new cliff or cruise ID.
  const merged = preserveKAI58DerivedOutputs(existing, candidate);
  const changed = JSON.stringify(existing) !== JSON.stringify(merged);
  if (changed) {
    const index = catalog.findIndex((record) => record.id === candidate.id);
    catalog[index] = merged;
    byId.set(candidate.id, merged);
    enrichedIds.push(candidate.id);
  }
}

// Relationship integrity: the two separate Gokayama components should be visible
// as nearby, never collapsed into a generic regional parent.
const repairedRelationshipIds: string[] = [];
for (const [id, nearbyId] of [
  ["ainokura-gassho-village", "suganuma-gassho-village"],
  ["suganuma-gassho-village", "ainokura-gassho-village"],
] as const) {
  const record = byId.get(id);
  if (!record || !byId.has(nearbyId)) {
    throw new Error(`KAI-58 relationship target missing: ${id} -> ${nearbyId}`);
  }
  const current = record.relationships?.nearbyDestinationIds ?? [];
  if (!current.includes(nearbyId)) {
    record.relationships = {
      ...(record.relationships ?? {}),
      nearbyDestinationIds: [...current, nearbyId],
    };
    repairedRelationshipIds.push(id);
  }
}

if (
  addedIds.length > 0 ||
  enrichedIds.length > 0 ||
  repairedRelationshipIds.length > 0
) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length || enrichedIds.length || repairedRelationshipIds.length
    ? `KAI-58: added ${addedIds.length} (${addedIds.join(", ")}); enriched ${enrichedIds.length} (${enrichedIds.join(", ")}); repaired relationships ${repairedRelationshipIds.length} (${repairedRelationshipIds.join(", ")})`
    : "KAI-58: verified catalogue already matches the canonical scope; no changes made",
);
