/**
 * KAI-147 — Wakayama Kumano core recovery.
 *
 * KAI-147 was marked Done due to unrelated performance work; the intended
 * Kumano destination implementation was absent from the merged catalogue.
 * This script restores the geographic core with four canonical records:
 *
 * - ADD one combined Kumano Hongu Taisha / Oyunohara proposition (the current
 *   shrine grounds and the Otorii at its former site are one visit).
 * - ADD Kumano Hayatama Taisha in Shingu, the missing Kumano Sanzan anchor in
 *   an otherwise empty Wakayama:shingu municipality.
 * - ADD Yunomine Onsen as the pilgrimage onsen village (Tsuboyu and public
 *   baths are highlights, not separate cards).
 * - ADD one bounded Nakahechi walking segment, Takijiri-oji to Takahara, from
 *   the operator's published course data (~4 km, 2–3 h, ~430 m ascent).
 *
 * Deliberate rejections: no separate Nachi Taisha card (the existing
 * nachi-falls-wakayama record already covers that complex); no separate
 * Tsuboyu/Kamikura/Oyunohara component cards; Kushimoto omitted as optional
 * and outside the core gap. The broad Koya-centered UNESCO record
 * (kumano-kodo-koya-wakayama) is preserved unchanged; it is not a substitute
 * for independently selectable Kumano propositions.
 *
 * Transport contract: official/operator sources verify local access only.
 * Every new record keeps static transportOptions empty and explicitly marks
 * origin-aware routes as unestimated — never fabricating Osaka/Kyoto travel
 * times or turning a local bus fact into an intercity duration.
 *
 * Usage: npx tsx scripts/kai-147-kumano-core-recovery.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
import type {
  Destination,
  SourceReference,
} from "../src/shared/types/destination";

const INDEX_PATH =
  process.env.KAI147_INDEX_PATH ??
  path.join(process.cwd(), "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-23";
const CHANGE_SUMMARY =
  "KAI-147 recovery: added source-verified Kumano core propositions after the issue had been closed by unrelated performance work.";

type DestinationWithLocation = Destination & {
  location?: { address: string; latitude?: number; longitude?: number };
};

type RecordSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases: string[];
  prefecture: "Wakayama";
  municipalityId: string;
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  coordinates: { lat: number; lng: number };
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
    "Current admission, bathing, food, and access costs are destination- and date-dependent; no numeric budget is published here.",
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
    "Operational guidance does not establish a defensible four-season suitability score; unknown is preserved.",
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
      /access|bus|rail|train|route|transport/i.test(candidate.title),
    ) ?? primarySource;
  const coordinateSource =
    spec.sources.find(
      (candidate) =>
        candidate.type !== "manual" &&
        /pin|map|coordinate/i.test(candidate.title),
    ) ?? primarySource;

  return {
    id: spec.id,
    officialWebsite: primarySource.url,
    officialWebsiteRequirement: "required",
    name: spec.name,
    nameJa: spec.nameJa,
    aliases: spec.aliases,
    municipalityId: spec.municipalityId,
    prefecture: spec.prefecture,
    region: "Kansai",
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
      changeSummary: CHANGE_SUMMARY,
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
            "Added one canonical KAI-147 Kumano core destination from current first-party evidence after the issue had been closed by unrelated performance work.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

const tanabeKumanoBureau = source(
  "tourism_board",
  "https://www.tb-kumano.jp/en/",
  "Tanabe City Kumano Tourism Bureau — Hongu area identity and bus network",
);

const reviewedRecords: DestinationWithLocation[] = [
  makeRecord({
    id: "kumano-hongu-taisha-oyunohara",
    name: "Kumano Hongu Taisha & Oyunohara",
    nameJa: "熊野本宮大社・大斎原",
    aliases: ["Kumano Hongu Taisha", "Oyunohara", "熊野本宮大社", "大斎原"],
    prefecture: "Wakayama",
    municipalityId: "Wakayama:tanabe",
    kind: "shrine",
    importance: "major",
    coordinates: { lat: 33.8403512, lng: 135.7736333 },
    location: {
      address: "Hongu-cho Kumanou, Tanabe, Wakayama 646-1355, Japan",
      latitude: 33.8403512,
      longitude: 135.7736333,
    },
    categories: ["Shrine", "History", "Spiritual"],
    tags: [
      "History",
      "Heritage",
      "Traditional",
      "Spiritual",
      "Wakayama Travel",
    ],
    description:
      "The head shrine of all Kumano shrines sits on a wooded hill above the Otorii — one of the largest torii gates in the world — marking Oyunohara, the sandbank where the shrine stood before floodwaters. Shrine grounds and the giant torii form one pilgrimage visit.",
    descriptionJa:
      "熊野三山の一本社。世界最大級の大鳥居が立つ旧社地・大斎原を見下ろす丘の上に鎮座し、現在の社地と大鳥居を一つの参拝体験として扱います。",
    highlights: [
      "Head shrine of the Kumano Sanzan",
      "Oyunohara's giant Otorii gate",
      "Spring and autumn festival traditions",
    ],
    highlightsJa: [
      "熊野三山の総本宮",
      "大斎原の大鳥居",
      "春季・秋季大祭の伝統",
    ],
    notes:
      "The Tanabe City Kumano Tourism Bureau lists shrine hours of 8:00–17:00 and its Homotsuden treasure museum at 9:00–16:00 with a 300 yen adult admission. Buses connect Hongu with Kii-Tanabe, Shirahama, Shingu, and Koyasan.",
    notesJa:
      "田辺市熊野ツーリズムビューローは本殿参拝を8:00〜17:00、宝物殿を9:00〜16:00（大人300円）と案内しています。紀伊田辺・白浜・新宮・高野山からバスで結ばれています。",
    reservation:
      "Ordinary worship needs no reservation; group ceremonies follow shrine guidance.",
    reservationJa:
      "通常の参拝に予約は不要です。団体祈願は神社の案内に従ってください。",
    parking:
      "Use the shrine and Oyunohara visitor parking; check current operator signage for lot locations.",
    parkingJa:
      "境内および大斎原周辺の来訪者用駐車場をご利用ください。最新の案内表示をご確認ください。",
    openingHours:
      "Precincts 8:00–17:00; Homotsuden treasure museum 9:00–16:00 (adults 300 yen).",
    openingHoursJa: "境内は8:00〜17:00、宝物殿は9:00〜16:00（大人300円）。",
    localAccessModes: ["bus", "car", "my_car"],
    duration: {
      hours: { min: 1, max: 1.5 },
      confidence: "medium",
      basis:
        "Conservative band for shrine worship plus the walk between the hillside precincts and the Otorii at Oyunohara; excludes bus approach and museum browsing beyond the standard circuit.",
    },
    sources: [
      source(
        "official",
        "https://www.tb-kumano.jp/en/kumano-kodo/world-heritage/kumano-hongu-taisha/",
        "Kumano Hongu Taisha — Tanabe City Kumano Tourism Bureau (hours and Homotsuden)",
      ),
      tanabeKumanoBureau,
      source(
        "tourism_board",
        "https://www.tb-kumano.jp/en/kumano-kodo/world-heritage/kumano-hongu-taisha/",
        "Kumano Hongu Taisha — Tanabe City Kumano Tourism Bureau (official site pin)",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/way/797748245",
        "OpenStreetMap way 797748245: Kumano Hongu Taisha coordinates (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Kumano-hong%C3%BB-taisha_Shrine_-_Torii_at_%C3%94yunohara.jpg/1280px-Kumano-hong%C3%BB-taisha_Shrine_-_Torii_at_%C3%94yunohara.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kumano-hongû-taisha_Shrine_-_Torii_at_Ôyunohara.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Yanajin33, CC BY-SA 3.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "kumano-hayatama-taisha-shingu",
    name: "Kumano Hayatama Taisha",
    nameJa: "熊野速玉大社",
    aliases: ["Kumano Hayatama Grand Shrine", "熊野速玉大社", "速玉大社"],
    prefecture: "Wakayama",
    municipalityId: "Wakayama:shingu",
    kind: "shrine",
    importance: "major",
    coordinates: { lat: 33.7322978, lng: 135.9836823 },
    location: {
      address: "1-13-8 Minato, Shingu, Wakayama 647-0080, Japan",
      latitude: 33.7322978,
      longitude: 135.9836823,
    },
    categories: ["Shrine", "History", "Spiritual"],
    tags: [
      "History",
      "Heritage",
      "Traditional",
      "Spiritual",
      "Wakayama Travel",
    ],
    description:
      "One of the three Kumano Sanzan grand shrines, standing at the mouth of the Kumano River with vivid vermillion buildings, a thousand-year-old sacred nagi tree, and the Kumano Shimpokan treasure museum. The shrine fills Shingu as the catalogue's missing Sanzan anchor.",
    descriptionJa:
      "熊野川河口に立つ熊野三山の一つ。朱色の社殿、樹齢千年の御神木ナギ、神宝館を擁し、カタログに欠けていた新宮の熊野拠点として整備しました。",
    highlights: [
      "Kumano Sanzan grand-shrine worship",
      "Thousand-year sacred nagi tree",
      "Kumano Shimpokan treasure museum (500 yen)",
    ],
    highlightsJa: ["熊野三山の参拝", "樹齢千年のご神木ナギ", "神宝館（500円）"],
    notes:
      "The Shingu City Tourist Association lists grounds open sunrise to 17:00, the amulet office 8:00–17:00, and the Shimpokan 9:00–16:00, open year-round; the shrine is about 15 minutes on foot from JR Shingu Station.",
    notesJa:
      "新宮市観光協会は境内を日の出〜17:00、授与所を8:00〜17:00、神宝館を9:00〜16:00（年中無休）、JR新宮駅から徒歩約15分と案内しています。",
    reservation:
      "Ordinary worship needs no reservation; check festival schedules before visiting.",
    reservationJa:
      "通常の参拝に予約は不要です。祭事日程は訪問前にご確認ください。",
    parking:
      "Free parking is available near the grounds per the city tourist association; confirm current lots on arrival.",
    parkingJa:
      "観光協会の案内では境内近くに無料駐車場があります。到着時に最新の駐車場をご確認ください。",
    openingHours:
      "Grounds sunrise–17:00; amulet office 8:00–17:00; Kumano Shimpokan 9:00–16:00; open year-round.",
    openingHoursJa:
      "境内は日の出〜17:00、授与所は8:00〜17:00、神宝館は9:00〜16:00。年中無休。",
    localAccessModes: ["train", "bus", "car", "my_car"],
    duration: {
      hours: { min: 0.75, max: 1 },
      confidence: "medium",
      basis:
        "Conservative band for grounds worship plus the treasure museum; excludes JR approach and Kamikura-jinja climb.",
    },
    sources: [
      source(
        "official",
        "https://www.shinguu.jp/en/spots/detail/A0001",
        "Kumano Hayatama Taisha Grand Shrine — Shingu City Tourist Association (hours, access, Shimpokan)",
      ),
      source(
        "official",
        "http://kumanohayatama.jp/",
        "Kumano Hayatama Taisha official site (Japanese)",
      ),
      source(
        "government",
        "https://www.shinguu.jp/spots/detail/A0001",
        "Kumano Hayatama Taisha — Shingu City official site coordinate-bearing map link",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/way/211578006",
        "OpenStreetMap way 211578006: Kumano Hayatama Taisha coordinates (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Shingu_Kumano_Hayatama-taisha_Courtyard_2.jpg/1280px-Shingu_Kumano_Hayatama-taisha_Courtyard_2.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Shingu_Kumano_Hayatama-taisha_Courtyard_2.jpg",
      license: "CC BY 4.0",
      attribution: "Zairon, CC BY 4.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "yunomine-onsen",
    name: "Yunomine Onsen",
    nameJa: "湯の峰温泉",
    aliases: ["Yunomine Hot Spring", "Tsuboyu", "湯の峰温泉", "つぼ湯"],
    prefecture: "Wakayama",
    municipalityId: "Wakayama:tanabe",
    kind: "onsen",
    importance: "major",
    coordinates: { lat: 33.8288351, lng: 135.7575842 },
    location: {
      address: "Hongu-cho Yunomine, Tanabe, Wakayama 646-1353, Japan",
      latitude: 33.8288351,
      longitude: 135.7575842,
    },
    categories: ["Onsen", "Culture", "Relaxation"],
    tags: ["Onsen", "Relaxation", "Heritage", "Traditional", "Wakayama Travel"],
    description:
      "An 1,800-year-old pilgrimage hot-spring village in a narrow valley, where worshippers purified themselves before Kumano Hongu Taisha. Tsuboyu — a UNESCO-registered wooden bathhouse — and the Yuzutsu cooking basin sit beside the steaming creek; trailheads for the Dainichi-goe and Akagi-goe walks start here.",
    descriptionJa:
      "熊野詣での禊の場として1800年の歴史を持つ温泉郷。世界遺産登録の湯治場「つぼ湯」やゆずつ（湯筒）が湯川沿いに並び、大日越え・赤木越えの古道起点でもあります。",
    highlights: [
      "Tsuboyu, a UNESCO-registered bathhouse",
      "Onsen tamago at the Yuzutsu basin",
      "Dainichi-goe and Akagi-goe trailheads",
    ],
    highlightsJa: [
      "世界遺産登録のつぼ湯",
      "ゆずつで温める温泉たまご",
      "大日越え・赤木越えの古道起点",
    ],
    notes:
      "The Tanabe City Kumano Tourism Bureau lists Tsuboyu at 800 yen (under 12: 400 yen), 6:00–21:00 with reception closing 20:30, private use for 1–2 people up to 30 minutes without reservations; buses run from Kii-Tanabe, Shirahama, and Shingu.",
    notesJa:
      "田辺市熊野ツーリズムビューローはつぼ湯を大人800円（12歳未満400円）、6:00〜21:00（受付20:30終了）、1〜2名30分の個室貸切・予約不要と案内。紀伊田辺・白浜・新宮からバスが運行しています。",
    reservation:
      "Tsuboyu is first-come-first-served by numbered ticket; lodging day-use baths require facility reservations.",
    reservationJa:
      "つぼ湯は整理券順の先着です。旅館の日帰り入浴は各施設の予約が必要です。",
    parking:
      "Village parking concentrates at the southern entrance; follow current municipal signs.",
    parkingJa:
      "村の駐車場は南入口付近に集約されています。現地の案内表示に従ってください。",
    openingHours:
      "Tsuboyu and public baths 6:00–21:00 (reception closes 20:30); open year-round.",
    openingHoursJa:
      "つぼ湯・公衆浴場は6:00〜21:00（受付20:30終了）。通年営業。",
    localAccessModes: ["bus", "car", "my_car"],
    duration: {
      hours: { min: 1.5, max: 3 },
      confidence: "medium",
      basis:
        "Conservative band for one soak at Tsuboyu or a public bath, the village stroll, and onsen tamago; excludes overnight stays and hiking legs.",
    },
    sources: [
      source(
        "official",
        "https://www.tb-kumano.jp/en/places/yunomine/",
        "Yunomine Onsen — Tanabe City Kumano Tourism Bureau (Tsuboyu prices, hours, usage)",
      ),
      tanabeKumanoBureau,
      source(
        "tourism_board",
        "https://www.tb-kumano.jp/en/places/yunomine/",
        "Yunomine Onsen — Tanabe City Kumano Tourism Bureau (official area map)",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/node/2822838506",
        "OpenStreetMap node 2822838506: Yunomine Onsen locality coordinates (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Kumano_Kodo_pilgrimage_route_Yunomine_Onsen_World_heritage_%E7%86%8A%E9%87%8E%E5%8F%A4%E9%81%93_%E6%B9%AF%E3%81%AE%E5%B3%B0%E6%B8%A9%E6%B3%89116.JPG/1280px-Kumano_Kodo_pilgrimage_route_Yunomine_Onsen_World_heritage_%E7%86%8A%E9%87%8E%E5%8F%A4%E9%81%93_%E6%B9%AF%E3%81%AE%E5%B3%B0%E6%B8%A9%E6%B3%89116.JPG",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kumano_Kodo_pilgrimage_route_Yunomine_Onsen_World_heritage_熊野古道_湯の峰温泉116.JPG",
      license: "CC BY-SA 4.0",
      attribution: "Nekosuki, CC BY-SA 4.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "kumano-kodo-takijiri-takahara",
    name: "Kumano Kodo: Takijiri-oji to Takahara",
    nameJa: "熊野古道 中辺路 滝尻王子〜高原",
    aliases: [
      "Takijiri-oji to Takahara",
      "Nakahechi Takijiri Takahara",
      "滝尻王子",
      "高原",
    ],
    prefecture: "Wakayama",
    municipalityId: "Wakayama:tanabe",
    kind: "nature",
    importance: "notable",
    coordinates: { lat: 33.7755327, lng: 135.5036869 },
    location: {
      address:
        "Nakanobecho Kurisugawa/Takahara, Tanabe, Wakayama 646-1331, Japan",
      latitude: 33.7755327,
      longitude: 135.5036869,
    },
    categories: ["Nature", "Hiking", "History"],
    tags: [
      "Hiking",
      "Nature",
      "Scenic",
      "Heritage",
      "Active Hiking",
      "Wakayama Travel",
    ],
    description:
      "The classic first-day Nakahechi segment: from the Takijiri-oji trailhead beside the Kumano Kodo Kan pilgrimage center, a steep forested climb past boulders and caves rises to the ridge-top village of Takahara, with panoramic Hatenashi-range views and the old camphor-shaded Takahara Kumano-jinja.",
    descriptionJa:
      "中辺路の出発区間。熊野古道館のそばの滝尻王子から、巨岩や洞窟を抜ける急坂を登ると、尾根の高原集落に至ります。果無連峰の眺望と樟に囲まれた高原熊野神社が見どころです。",
    highlights: [
      "Official Nakahechi entry segment",
      "Tainai-kuguri cave and Chichi-iwa rock",
      "Panoramic Takahara village views",
    ],
    highlightsJa: [
      "中辺路の出発セグメント",
      "胎内くぐりの岩窟と乳岩",
      "高原集落の展望",
    ],
    notes:
      "Operator course data: ~4 km one-way, 2–3 hours, difficulty 2.5, total elevation gain ~430 m and loss ~200 m. Buses serve Takijiri from Kii-Tanabe and Shirahama; there are no buses to/from Takahara — the nearest stop is Kurisugawa on Route 311, about a 30-minute walk away.",
    notesJa:
      "運行者のコースデータ：片道約4km、所要2〜3時間、難易度2.5、累積標高差は上り約430m・下り約200m。滝尻には紀伊田辺・白浜からバスでアクセスできますが、高原にバスはなく、最寄りは国道311号の栗栖川停留所から徒歩約30分です。",
    reservation:
      "No timed admission; check trail conditions, heat, and closures with the Kumano Kodo Kan before hiking.",
    reservationJa:
      "時間制の入場はありません。歩行前に熊野古道館で道の状態や閉鎖情報をご確認ください。",
    parking:
      "Use the Takijiri-oji and Kumano Kodo Kan parking; do not leave cars at Kurisugawa roadside.",
    parkingJa:
      "滝尻王子および熊野古道館の駐車場をご利用ください。栗栖川の路肩駐車は避けてください。",
    openingHours:
      "No fixed admission hours; trail access is subject to weather, maintenance, and temporary closures. Check current Kumano Kodo guidance before hiking.",
    openingHoursJa:
      "入場時間の設定はありません。古道への立ち入りは天候・保全工事・臨時閉鎖の影響を受けます。歩行前に熊野古道の最新案内をご確認ください。",
    localAccessModes: ["bus", "car", "my_car"],
    duration: {
      hours: { min: 2, max: 3 },
      confidence: "high",
      basis:
        "Operator-published course time for the one-way segment (2–3 hrs); excludes return transfer planning.",
    },
    sources: [
      source(
        "official",
        "https://www.tb-kumano.jp/en/kumano-kodo/nakahechi/takijiri-oji-to-tsugizakura-oji/takijiri-oji-to-takahara/",
        "Takijiri-oji to Takahara course data — Tanabe City Kumano Tourism Bureau",
      ),
      tanabeKumanoBureau,
      source(
        "tourism_board",
        "https://www.tb-kumano.jp/en/kumano-kodo/world-heritage/takijiri-oji/",
        "Takijiri-oji — Tanabe City Kumano Tourism Bureau (official site pin)",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/node/3207246310",
        "OpenStreetMap node 3207246310: Takijiri-oji coordinates (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/1/1f/Takijiri-oji_shrine_2.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Takijiri-oji_shrine_2.jpg",
      license: "CC BY-SA 3.0",
      attribution: "KMR, CC BY-SA 3.0, via Wikimedia Commons",
    },
  }),
];

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
  for (const value of [
    record.name,
    record.nameJa ?? "",
    ...(record.aliases ?? []),
  ]) {
    if (!value) continue;
    const key = normalize(value);
    if (key.length >= 6 && !names.has(key)) names.set(key, record.id);
  }
}

const preserveKAI147DerivedOutputs = (
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
  const isPriorKAI147Record =
    existing.editorial?.checkedAt === REVIEW_DATE &&
    (existing.editorial.changeSummary?.includes("KAI-147") ||
      existing.editorial.changeSummary?.includes(CHANGE_SUMMARY));
  if (!isPriorKAI147Record) return merged;

  const canonicalVisitMax = canonical.recommendedVisitHours?.max;
  const modelWalkingMatchesCanonicalVisit =
    existing.walkingMetadata?.method !== "model" ||
    (canonicalVisitMax !== undefined &&
      existing.walkingMetadata.basis.includes(`${canonicalVisitMax}h visit`));
  if (!modelWalkingMatchesCanonicalVisit) return merged;

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
const refreshedIds: string[] = [];
for (const candidate of reviewedRecords) {
  const existing = byId.get(candidate.id);
  if (!existing) {
    if (candidate.municipalityId?.split(":")[0] !== candidate.prefecture) {
      throw new Error(`${candidate.id}: municipality/prefecture mismatch`);
    }
    for (const value of [
      candidate.name,
      candidate.nameJa ?? "",
      ...candidate.aliases,
    ]) {
      if (!value) continue;
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
      candidate.nameJa ?? "",
      ...candidate.aliases,
    ]) {
      if (!value) continue;
      const key = normalize(value);
      if (key.length >= 6) names.set(key, candidate.id);
    }
    addedIds.push(candidate.id);
    continue;
  }

  if (
    existing.name !== candidate.name ||
    existing.nameJa !== candidate.nameJa ||
    existing.prefecture !== candidate.prefecture ||
    existing.region !== candidate.region ||
    existing.municipalityId !== candidate.municipalityId
  ) {
    throw new Error(`KAI-147 identity conflict: ${candidate.id}`);
  }
  const merged = preserveKAI147DerivedOutputs(existing, candidate);
  if (JSON.stringify(existing) !== JSON.stringify(merged)) {
    const index = catalog.findIndex((record) => record.id === candidate.id);
    catalog[index] = merged;
    byId.set(candidate.id, merged);
    refreshedIds.push(candidate.id);
  }
}

if (addedIds.length > 0 || refreshedIds.length > 0) {
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(
  addedIds.length || refreshedIds.length
    ? `KAI-147: added ${addedIds.length} (${addedIds.join(", ")}); refreshed ${refreshedIds.length} (${refreshedIds.join(", ")})`
    : "KAI-147: verified catalogue already matches the canonical scope; no changes made",
);
