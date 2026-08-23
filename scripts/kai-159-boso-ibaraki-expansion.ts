/**
 * KAI-159 — Kanto regional depth: south/east Boso + Ibaraki infill.
 *
 * Decision record (first-party/operator research and current catalogue audit,
 * 2026-08-23):
 * - ADD one coherent Shiroyama Park proposition (park, castle museum, city view),
 *   not separate Tateyama Castle/Hakkenden Museum component cards.
 * - ADD Awa Shrine, Kamogawa Sea World, and Onjuku Beach as distinct south/east
 *   Boso propositions across history, family marine life, and coast access.
 * - ADD Kasama Inari Shrine plus Ibaraki Ceramic Art Museum as two independently
 *   recommendable Kasama anchors; defer Crafthills and Kasama Inari Art Museum as
 *   component cards within the same pottery outing.
 * - ADD integrated Hitachi Kamine Park and Hitachinokuni Soshagu Shrine as the
 *   bounded Hitachi/Ishioka anchors. Defer Nago-dera and all KAI-146-owned
 *   Kisarazu, Choshi, and Kujukuri work.
 *
 * Transport contract: source-backed local access modes do not imply a complete
 * origin-to-destination route. Every new record therefore keeps static
 * transportOptions empty and explicitly marks the route as unestimated.
 *
 * Usage: npx tsx scripts/kai-159-boso-ibaraki-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
import type {
  Destination,
  SourceReference,
} from "../src/shared/types/destination";

const INDEX_PATH =
  process.env.KAI159_INDEX_PATH ??
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
  prefecture: "Chiba" | "Ibaraki";
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
      /access|bus|rail|train|route|transport/i.test(candidate.title),
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
    region: "Kanto",
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
        "Added after KAI-159 first-party operational, identity, municipality, coordinate, and local-access verification.",
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
            "Added one canonical KAI-159 Boso/Ibaraki destination from current first-party evidence.",
          method: "manual",
        },
      ],
    },
    addedAt: REVIEW_DATE,
  } as DestinationWithLocation;
};

const reviewedRecords: DestinationWithLocation[] = [
  makeRecord({
    id: "shiroyama-park-tateyama",
    name: "Shiroyama Park (Tateyama)",
    nameJa: "城山公園（館山）",
    aliases: ["Tateyama Castle Park", "Tateyama Castle", "館山城"],
    prefecture: "Chiba",
    municipalityId: "Chiba:tateyama",
    kind: "park",
    importance: "notable",
    coordinates: { lat: 34.980753, lng: 139.8565053 },
    location: {
      address: "Tateyama, Chiba, Japan",
      latitude: 34.980753,
      longitude: 139.8565053,
    },
    categories: ["Park", "Castle", "History", "Viewpoint"],
    tags: ["Park", "Castle", "History", "Tateyama"],
    description:
      "A hilltop park in Tateyama combining the Hakkenden Museum in Tateyama Castle, the city museum, seasonal flower trails and broad views over Tateyama Bay; it is one coherent historic-city outing rather than separate component cards.",
    descriptionJa:
      "館山城（八犬伝博物館）と館山市立博物館、四季の花が咲く散策路、館山湾を望む眺望をあわせて楽しめる丘陵公園。城・博物館・展望を一つの館山の歴史散策として扱います。",
    highlights: [
      "Tateyama Castle's Hakkenden Museum within Shiroyama Park",
      "Seasonal flowers along the hill trails, including spring cherry blossom",
      "Panoramic Tateyama Bay and occasional Mt. Fuji views",
    ],
    highlightsJa: [
      "城山公園内の館山城・八犬伝博物館",
      "桜など四季の花を楽しめる丘の散策路",
      "館山湾と、条件が良ければ富士山を望む眺望",
    ],
    notes:
      "This is the single Tateyama castle-and-park proposition. Do not split its castle museum, city museum, or individual flower areas into separate cards. Check Tateyama City Tourist Information Office guidance for current museum arrangements.",
    notesJa:
      "館山城・八犬伝博物館・市立博物館・園内の花景色をまとめた一つの館山の立ち寄り先です。各要素を別カードには分けません。博物館の最新の利用条件は館山市観光案内で確認してください。",
    reservation:
      "No advance booking is stated for park access; check the official Tateyama visitor guidance for museum arrangements.",
    reservationJa:
      "公園利用に事前予約の案内はありません。博物館の利用条件は館山の公式観光案内で確認してください。",
    parking:
      "Use designated park or city parking where available; check local guidance before driving during flower seasons.",
    parkingJa:
      "指定駐車場を利用し、花の時期に車で訪れる場合は最新の現地案内を確認してください。",
    openingHours:
      "Park grounds and the individual museum facilities have different visitor arrangements; check the Tateyama City Tourist Information Office before visiting.",
    openingHoursJa:
      "公園と館内施設では利用条件が異なります。訪問前に館山市観光案内で最新情報を確認してください。",
    localAccessModes: ["bus", "car", "my_car"],
    duration: {
      hours: { min: 1.5, max: 2.5 },
      confidence: "medium",
      basis:
        "Conservative park, museum, and hill-view walking band; travel from any origin is excluded.",
    },
    sources: [
      source(
        "tourism_board",
        "https://tateyamacity.com/en/attractions/",
        "Tateyama City Tourist Information Office: Shiroyama Park",
      ),
      source(
        "government",
        "https://maruchiba.jp/spot/detail_10428.html",
        "Chiba Prefecture official tourism site (Chiba Kanko Navi): Shiroyama Park map pin",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/way/265358058",
        "OpenStreetMap auxiliary cross-check: Shiroyama Park coordinate",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Tateyama_Castle%2C_tenshu.JPG/1280px-Tateyama_Castle%2C_tenshu.JPG",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Tateyama_Castle,_tenshu.JPG",
      license: "CC0",
      attribution: "Saigen Jiro, CC0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "awa-shrine-tateyama",
    name: "Awa Shrine",
    nameJa: "安房神社",
    aliases: ["Awa Jinja", "安房神社（館山）"],
    prefecture: "Chiba",
    municipalityId: "Chiba:tateyama",
    kind: "shrine",
    importance: "notable",
    coordinates: { lat: 34.9227089, lng: 139.8370131 },
    location: {
      address: "589 Daijingu, Tateyama, Chiba, Japan",
      latitude: 34.9227089,
      longitude: 139.8370131,
    },
    categories: ["Shrine", "History", "Culture", "Nature"],
    tags: ["Shrine", "History", "Tateyama", "Cherry Blossoms"],
    description:
      "A long-standing shrine in southern Tateyama, approached through mature trees and a large white torii; it is a distinct spiritual and seasonal stop from the nearby city-and-castle outing.",
    descriptionJa:
      "南館山にある古社。大きな白い鳥居と古木の参道が印象的で、館山の城山公園とは異なる、信仰と季節の景観を楽しむ立ち寄り先です。",
    highlights: [
      "A large white torii and wooded approach to the main sanctuary",
      "A distinct southern-Tateyama shrine experience",
      "Cherry blossoms along the approach in early April",
    ],
    highlightsJa: [
      "大きな白い鳥居と木立に包まれた参道",
      "館山南部で楽しむ独立した神社参拝",
      "4月上旬に参道を彩る桜",
    ],
    notes:
      "The shrine is not a Shiroyama Park component. The Tateyama City visitor page lists a 20-minute JR bus approach from Tateyama Station; this final-leg fact does not model an origin-to-destination duration.",
    notesJa:
      "城山公園の付属施設ではなく、独立した館山南部の神社です。館山市の案内では館山駅からJRバスで約20分ですが、この最終アクセス情報を出発地からの所要時間として扱いません。",
    reservation:
      "General worship does not require a reservation; verify prayer or special-service arrangements directly with the shrine.",
    reservationJa:
      "通常の参拝に予約は不要です。祈祷など特別な利用は神社へ直接確認してください。",
    parking:
      "Check official shrine or Tateyama visitor guidance for current parking conditions.",
    parkingJa:
      "駐車場の最新状況は神社または館山の公式観光案内で確認してください。",
    openingHours:
      "Current Awa Shrine guidance: talismans and goshuin 08:30–16:30; specific prayers 09:00–16:00.",
    openingHoursJa:
      "安房神社の最新案内では、御朱印・神符授与は8:30〜16:30、祈祷などは9:00〜16:00です。",
    localAccessModes: ["bus", "car", "my_car"],
    duration: {
      hours: { min: 0.75, max: 1 },
      confidence: "medium",
      basis:
        "Conservative precinct, approach, and worship band; Tateyama Station access is excluded.",
    },
    sources: [
      source(
        "official",
        "http://www.awajinjya.org/",
        "Awa Shrine official site",
      ),
      source(
        "tourism_board",
        "https://tateyamacity.com/en/shrines-temples/awa-shrine/",
        "Tateyama City Tourist Information Office: Awa Shrine visitor information",
      ),
      source(
        "government",
        "https://maruchiba.jp/spot/detail_10587.html",
        "Chiba Prefecture official tourism site (Chiba Kanko Navi): Awa Shrine map pin",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/way/727172519",
        "OpenStreetMap: Awa Shrine coordinate (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/2/22/%E5%AE%89%E6%88%BF%E7%A5%9E%E7%A4%BE%EF%BC%88%E5%8D%83%E8%91%89%E7%9C%8C%E9%A4%A8%E5%B1%B1%E5%B8%82%EF%BC%8920250223-IMG_3414.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:%E5%AE%89%E6%88%BF%E7%A5%9E%E7%A4%BE%EF%BC%88%E5%8D%83%E8%91%89%E7%9C%8C%E9%A4%A8%E5%B1%B1%E5%B8%82%EF%BC%8920250223-IMG_3414.jpg",
      license: "CC BY 4.0",
      attribution: "くろふね, CC BY 4.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "kamogawa-sea-world",
    name: "Kamogawa Sea World",
    nameJa: "鴨川シーワールド",
    aliases: ["Kamogawa Seaworld", "Kamosea"],
    prefecture: "Chiba",
    municipalityId: "Chiba:kamogawa",
    kind: "aquarium",
    importance: "major",
    coordinates: { lat: 35.1152464, lng: 140.1190315 },
    location: {
      address: "Kamogawa, Chiba 296-0041, Japan",
      latitude: 35.1152464,
      longitude: 140.1190315,
    },
    categories: ["Aquarium", "Animals", "Family", "Entertainment"],
    tags: ["Aquarium", "Orca", "Animals", "Kamogawa"],
    description:
      "A full-scale marine-life park on Kamogawa's Pacific shore, with orca, beluga, dolphin and sea-lion programs plus themed aquatic habitats; it is the region's distinct family marine-life anchor.",
    descriptionJa:
      "鴨川の太平洋岸にある大規模な海洋レジャー施設。シャチ、ベルーガ、イルカ、アシカのプログラムと多彩な展示エリアを備え、房総南東部の家族向け海洋体験の核です。",
    highlights: [
      "Orca, beluga, dolphin, and sea-lion programs with daily schedules",
      "Multiple themed marine habitats across a full-scale aquarium park",
      "A distinct family outing on the Pacific coast",
    ],
    highlightsJa: [
      "日別スケジュールで案内されるシャチ・ベルーガ・イルカ・アシカのプログラム",
      "多様な海洋生物を楽しめるテーマ別展示エリア",
      "太平洋岸で過ごす房総の家族向け一日レジャー",
    ],
    notes:
      "The official operator publishes a date-specific schedule and current access guidance. Its free shuttle from JR Awa-Kamogawa Station takes about 10 minutes, but this local connection is not an origin-duration claim.",
    notesJa:
      "運営者が日別のスケジュールと最新アクセスを公開しています。JR安房鴨川駅から無料送迎バスで約10分ですが、この最終アクセス情報を出発地からの所要時間として扱いません。",
    reservation:
      "Admission products and program arrangements vary by date; check the official calendar and ticket guidance before visiting.",
    reservationJa:
      "入場券・プログラムの利用条件は日程により異なります。訪問前に公式カレンダーとチケット案内を確認してください。",
    parking:
      "Check the official operator access page for current car and parking guidance.",
    parkingJa:
      "車・駐車場の最新案内は運営者の公式アクセスページで確認してください。",
    openingHours:
      "Hours and programs vary by date; the official published daily calendar is authoritative.",
    openingHoursJa:
      "営業時間とプログラムは日付により異なります。公式の日別カレンダーを確認してください。",
    localAccessModes: ["train", "bus", "car", "my_car"],
    duration: {
      hours: { min: 3, max: 5 },
      confidence: "medium",
      basis:
        "Conservative full aquarium-park program band; arrival travel and optional hotel stay are excluded.",
    },
    sources: [
      source(
        "official",
        "https://www.kamogawa-seaworld.jp/english/",
        "Kamogawa Sea World official current hours and programs",
      ),
      source(
        "official",
        "https://www.kamogawa-seaworld.jp/english/access/route/",
        "Kamogawa Sea World official access and shuttle guidance",
      ),
      source(
        "government",
        "https://maruchiba.jp/spot/detail_10373.html",
        "Chiba Prefecture official tourism site (Chiba Kanko Navi): Kamogawa Sea World map pin",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/way/1050545416",
        "OpenStreetMap: Kamogawa Sea World coordinate (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/8/87/%E9%B4%A8%E5%B7%9D%E3%82%B7%E3%83%BC%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89%E5%85%A5%E5%8F%A3_-_panoramio.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:%E9%B4%A8%E5%B7%9D%E3%82%B7%E3%83%BC%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89%E5%85%A5%E5%8F%A3_-_panoramio.jpg",
      license: "CC BY 3.0",
      attribution: "ger531, CC BY 3.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "onjuku-beach",
    name: "Onjuku Beach",
    nameJa: "御宿海岸",
    aliases: ["Onjuku Central Beach", "御宿中央海水浴場"],
    prefecture: "Chiba",
    municipalityId: "Chiba:onjuku",
    kind: "beach",
    importance: "notable",
    coordinates: { lat: 35.1833577, lng: 140.3569834 },
    location: {
      address: "Central Beach, Onjuku, Chiba, Japan",
      latitude: 35.1833577,
      longitude: 140.3569834,
    },
    categories: ["Beach", "Nature", "Family", "Photography"],
    tags: ["Beach", "Swimming", "Coast", "Onjuku"],
    description:
      "A broad, white-sand Pacific beach in Onjuku, represented by the Central Beach and Moon Desert Memorial frontage; its shallow, comparatively calm Ajiro Bay shore is a distinct east-Boso coastal day-outing.",
    descriptionJa:
      "御宿の太平洋側に広がる白砂の海岸。中央海水浴場と月の沙漠記念像周辺を軸に、遠浅で比較的穏やかな網代湾の海辺を楽しむ外房の独立した海岸散策・海水浴の立ち寄り先です。",
    highlights: [
      "Around two kilometres of white sand along Onjuku's Pacific shore",
      "Central Beach's Moon Desert Memorial frontage",
      "Three lifeguarded beach areas in the published summer opening season",
    ],
    highlightsJa: [
      "御宿の太平洋岸に続く約2kmの白砂の海岸",
      "中央海岸の月の沙漠記念像周辺",
      "公式に案内される夏季の3つの海水浴場",
    ],
    notes:
      "This is one coast proposition, not a set of separate monument and beach cards. The 2026 lifeguarded beach opening was July 18–August 23, 08:30–17:00; sea conditions and seasonal services must be checked before swimming. The tourism association identifies the beach frontage as about a 7-minute walk from Onjuku Station.",
    notesJa:
      "記念像と各海水浴場を別カードにはせず、一つの御宿海岸の体験として扱います。2026年の海水浴場開設は7月18日〜8月23日、8:30〜17:00で、遊泳前に海況と季節サービスを確認してください。観光協会は御宿駅から海岸まで徒歩約7分と案内しています。",
    reservation:
      "No reservation is stated for the shoreline; check the tourism association's current swimming and event guidance.",
    reservationJa:
      "海岸利用に予約の案内はありません。遊泳・イベントは観光協会の最新案内を確認してください。",
    parking:
      "Paid parking is listed near the three summer beach areas; check current local guidance before driving.",
    parkingJa:
      "夏季の3海水浴場周辺には有料駐車場の案内があります。車で訪れる前に最新の現地情報を確認してください。",
    openingHours:
      "The 2026 lifeguarded beach opening was July 18–August 23, 08:30–17:00; the shore is a year-round landscape but swimming services are seasonal.",
    openingHoursJa:
      "2026年の海水浴場開設は7月18日〜8月23日、8:30〜17:00です。海岸景観は通年ですが、遊泳サービスは季節限定です。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 1, max: 1.5 },
      confidence: "medium",
      basis:
        "Conservative beach walk, memorial frontage, and seasonal swimming band; rail or driving approach is excluded.",
    },
    sources: [
      source(
        "tourism_board",
        "https://onjuku-kankou.com/event/kaisuiyoku/",
        "Onjuku Town Tourism Association: 2026 beach opening and facilities",
      ),
      source(
        "tourism_board",
        "https://onjuku-kankou.com/photospot/pg-kaigan/",
        "Onjuku Town Tourism Association: Onjuku Beach access",
      ),
      source(
        "government",
        "https://maruchiba.jp/spot/detail_10690.html",
        "Chiba Prefecture official tourism site (Chiba Kanko Navi): Onjuku Central Beach map pin",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/node/2715131038",
        "OpenStreetMap auxiliary cross-check: Moon Desert Memorial at Onjuku Central Beach frontage",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/e/e6/Onjuku_Beach.jpg",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Onjuku_Beach.jpg",
      license: "Public domain",
      attribution: "Zeimusu, public domain, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "kasama-inari-shrine",
    name: "Kasama Inari Shrine",
    nameJa: "笠間稲荷神社",
    aliases: ["Kasama Inari", "Kasama Inari Jinja"],
    prefecture: "Ibaraki",
    municipalityId: "Ibaraki:kasama",
    kind: "shrine",
    importance: "major",
    coordinates: { lat: 36.3854725, lng: 140.2543843 },
    location: {
      address: "1 Kasama, Kasama, Ibaraki, Japan",
      latitude: 36.3854725,
      longitude: 140.2543843,
    },
    categories: ["Shrine", "History", "Food", "Culture"],
    tags: ["Shrine", "Inari", "Kasama", "Pottery"],
    description:
      "A major Inari shrine in Kasama, established in 651, with a lively approach of soba shops, cafes, sake-brewery conversions and pottery galleries; it is the historic core of a broader Kasama craft day.",
    descriptionJa:
      "651年創建と伝わる笠間の代表的な稲荷神社。参道にはそば店、カフェ、酒蔵を活用した店、陶芸ギャラリーが並び、笠間の歴史と工芸を巡る一日の核になります。",
    highlights: [
      "One of Japan's major Inari shrines, established in 651",
      "Kasama Inari Sushi and seasonal street food context",
      "Wisteria in late spring and the autumn chrysanthemum festival",
    ],
    highlightsJa: [
      "651年創建と伝わる全国有数の稲荷神社",
      "笠間いなり寿司と参道の食文化",
      "晩春の藤と秋の菊まつり",
    ],
    notes:
      "Kasama Inari is distinct from the regional ceramic-art museum, while the small Inari Art Museum is a component of the shrine grounds and is intentionally not a second card. The Ibaraki guide lists a 5-minute bus ride or 20-minute walk from Kasama Station; no intercity duration is inferred.",
    notesJa:
      "笠間稲荷は県陶芸美術館とは異なる歴史・参道の体験です。一方、境内の小さな稲荷美術館は神社体験の一部として別カードにしません。茨城県の案内では笠間駅からバス約5分または徒歩約20分ですが、これを都市間の所要時間として扱いません。",
    reservation:
      "General worship does not require a reservation; check official festival and prayer guidance for special arrangements.",
    reservationJa:
      "通常の参拝に予約は不要です。祭礼・祈祷などは公式案内で確認してください。",
    parking:
      "The Ibaraki guide lists 250 parking spaces; confirm current conditions with the shrine before driving during festivals.",
    parkingJa:
      "茨城県の案内では駐車場250台です。祭礼時に車で訪れる場合は、神社の最新案内を確認してください。",
    openingHours:
      "06:00 to sunset, per the Ibaraki Prefectural Government visitor guide.",
    openingHoursJa: "茨城県の観光案内では6:00〜日没です。",
    localAccessModes: ["train", "bus", "car", "my_car"],
    duration: {
      hours: { min: 0.5, max: 1 },
      confidence: "medium",
      basis:
        "Conservative shrine, approach-street, and food-stop band; station and road travel are excluded.",
    },
    sources: [
      source(
        "government",
        "https://visit.ibarakiguide.jp/en/sightseeing/22308/",
        "Ibaraki Prefectural Government: Kasama Inari Shrine visitor information",
      ),
      source(
        "official",
        "http://www.kasama.or.jp/access/index.html",
        "Kasama Inari Shrine official access page map pin",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/node/745550349",
        "OpenStreetMap: Kasama Inari Shrine coordinate (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/6/61/%E7%AC%A0%E9%96%93%E7%A8%B2%E8%8D%B7%E7%A5%9E%E7%A4%BE_-_panoramio.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:%E7%AC%A0%E9%96%93%E7%A8%B2%E8%8D%B7%E7%A5%9E%E7%A4%BE_-_panoramio.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Akeiro Torii, CC BY-SA 3.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "ibaraki-ceramic-art-museum",
    name: "Ibaraki Ceramic Art Museum",
    nameJa: "茨城県陶芸美術館",
    aliases: ["Ibaraki Prefectural Ceramic Art Museum", "Togei Museum Ibaraki"],
    prefecture: "Ibaraki",
    municipalityId: "Ibaraki:kasama",
    kind: "museum",
    importance: "notable",
    coordinates: { lat: 36.3723876, lng: 140.2630038 },
    location: {
      address: "2345 Kasama, Kasama, Ibaraki, Japan",
      latitude: 36.3723876,
      longitude: 140.2630038,
    },
    categories: ["Museum", "Art", "Ceramics", "Culture"],
    tags: ["Museum", "Ceramics", "Art", "Kasama"],
    description:
      "Eastern Japan's first museum devoted solely to ceramic art, in Kasama with permanent works by Japanese master ceramists and changing exhibitions; it provides the region's clear craft-and-art counterpoint to Kasama Inari.",
    descriptionJa:
      "陶芸を専門とする東日本初の美術館。笠間で板谷波山・松井康成などの作品を常設展示し、多彩な企画展も行います。笠間稲荷とは異なる、工芸と美術を主題にした立ち寄り先です。",
    highlights: [
      "Eastern Japan's first museum focused solely on ceramic art",
      "Permanent works by Hazan Itaya and Kosei Matsui",
      "Changing exhibitions from Japan and abroad",
    ],
    highlightsJa: [
      "陶芸を専門とする東日本初の美術館",
      "板谷波山・松井康成などの常設展示",
      "国内外の多彩な企画展",
    ],
    notes:
      "This is the one Kasama ceramic-art institution in the catalogue. Crafthills and individual gallery/shop stops are part of the surrounding craft itinerary, not duplicate museum cards. The prefectural guide lists a 25-minute walk from Kasama Station or short taxi access.",
    notesJa:
      "笠間の陶芸美術を代表する一館として扱います。クラフトヒルズや個々のギャラリー・店舗は周辺の工芸散策の一部であり、重複する美術館カードにはしません。県の案内では笠間駅から徒歩約25分またはタクシー利用です。",
    reservation:
      "Check the official museum site for exhibition-specific ticketing and reservation arrangements.",
    reservationJa:
      "企画展ごとの入館・予約条件は美術館公式サイトで確認してください。",
    parking:
      "Check official museum guidance for current car and parking arrangements.",
    parkingJa: "車・駐車場の利用条件は美術館の公式案内で確認してください。",
    openingHours:
      "09:30–17:00 (last entry 16:30); closed Mondays except public-holiday Mondays, then Tuesday, and over New Year, per the prefectural visitor guide.",
    openingHoursJa:
      "県の観光案内では9:30〜17:00（最終入館16:30）。月曜休館（祝日の場合は開館し翌火曜休館）、年末年始休館です。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 1, max: 1.5 },
      confidence: "medium",
      basis:
        "Conservative permanent-collection and temporary-exhibition band; station and road travel are excluded.",
    },
    sources: [
      source(
        "official",
        "https://www.tougei.museum.ibk.ed.jp/",
        "Ibaraki Ceramic Art Museum official site",
      ),
      source(
        "government",
        "https://visit.ibarakiguide.jp/en/sightseeing/22291/",
        "Ibaraki Prefectural Government: Ibaraki Ceramic Art Museum visitor information",
      ),
      source(
        "official",
        "https://www.tougei.museum.ibk.ed.jp/viewer/info.html?id=5",
        "Ibaraki Ceramic Art Museum official access guide map marker",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/node/4191897333",
        "OpenStreetMap: Ibaraki Ceramic Art Museum coordinate (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/e/e8/Ibaraki_Ceramic_Art_Museum.JPG",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Ibaraki_Ceramic_Art_Museum.JPG",
      license: "Public domain",
      attribution: "Abasaa, public domain, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "hitachi-kamine-park",
    name: "Hitachi Kamine Park",
    nameJa: "かみね公園",
    aliases: ["Kamine Park", "Kamine Zoo and Amusement Park"],
    prefecture: "Ibaraki",
    municipalityId: "Ibaraki:hitachi",
    kind: "park",
    importance: "notable",
    coordinates: { lat: 36.6088294, lng: 140.6578191 },
    location: {
      address: "5-2-22 Miyatacho, Hitachi, Ibaraki, Japan",
      latitude: 36.6088294,
      longitude: 140.6578191,
    },
    categories: ["Park", "Zoo", "Amusement Park", "Family"],
    tags: ["Park", "Zoo", "Amusement Park", "Hitachi"],
    description:
      "A large hillside family park above Hitachi and the Pacific, uniting a zoo, amusement park and children's play area; it is one integrated northern-Ibaraki family proposition rather than three adjacent facility cards.",
    descriptionJa:
      "日立市と太平洋を見下ろす丘陵の大型ファミリー公園。動物園・遊園地・子どもの遊び場を一体で楽しめる、茨城北部の家族向けレジャーの核です。",
    highlights: [
      "Zoo, amusement park, and children's play area in one hillside park",
      "Views over Hitachi City and the Pacific coast",
      "Around 1,000 cherry trees from early April",
    ],
    highlightsJa: [
      "動物園・遊園地・子どもの遊び場を一体で楽しめる公園",
      "日立市街と太平洋を見下ろす眺望",
      "4月上旬から見頃を迎える約1,000本の桜",
    ],
    notes:
      "Kamine's zoo, rides and children's area are deliberately one integrated destination. The Ibaraki guide lists a 30-minute walk from JR Hitachi Station and a 10-minute drive from Hitachi-Chuo IC; these local legs do not establish an origin-duration estimate.",
    notesJa:
      "動物園・遊園地・子どもの遊び場を別カードに分けず、かみね公園として一体で扱います。県の案内ではJR日立駅から徒歩約30分、日立中央ICから車で約10分ですが、これらを出発地からの所要時間として扱いません。",
    reservation:
      "Check the official park site for current facility hours, ticketing, and group arrangements.",
    reservationJa:
      "各施設の営業時間・券種・団体利用はかみね公園の公式案内で確認してください。",
    parking:
      "Check the official park access page for current car and parking arrangements.",
    parkingJa: "車・駐車場の最新案内はかみね公園公式サイトで確認してください。",
    openingHours:
      "Hours differ by area and season; the prefectural guide publishes March–October and November–February schedules plus closure dates.",
    openingHoursJa:
      "エリア・季節で営業時間が異なります。茨城県の案内で3〜10月、11〜2月の時間と休園日を確認してください。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 2, max: 4 },
      confidence: "medium",
      basis:
        "Conservative multi-facility zoo, rides, and play-area band; station and motorway approach are excluded.",
    },
    sources: [
      source(
        "official",
        "https://kaminepark.or.jp/",
        "Kamine Park official site",
      ),
      source(
        "government",
        "https://visit.ibarakiguide.jp/en/sightseeing/22371/",
        "Ibaraki Prefectural Government: Hitachi Kamine Park visitor information",
      ),
      source(
        "government",
        "https://www.ibarakiguide.jp/spot.php?mode=detail&code=311",
        "Ibaraki Prefecture official tourism (Kanko Ibaraki): Kamine Park map pin",
      ),
      source(
        "manual",
        "https://www.openstreetmap.org/way/458491018",
        "OpenStreetMap: Hitachi Kamine Park coordinate (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/e/e6/Kamine_Park%2C_Ibaraki_01.jpg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kamine_Park,_Ibaraki_01.jpg",
      license: "CC BY 4.0",
      attribution: "Σ64, CC BY 4.0, via Wikimedia Commons",
    },
  }),
  makeRecord({
    id: "hitachinokuni-soshagu-shrine",
    name: "Hitachinokuni Soshagu Shrine",
    nameJa: "常陸國總社宮",
    aliases: ["Hitachinokuni Sōshagū", "Soshagu Shrine", "総社宮"],
    prefecture: "Ibaraki",
    municipalityId: "Ibaraki:ishioka",
    kind: "shrine",
    importance: "notable",
    coordinates: { lat: 36.187864, lng: 140.269072 },
    location: {
      address: "Ishioka, Ibaraki, Japan",
      latitude: 36.187864,
      longitude: 140.269072,
    },
    categories: ["Shrine", "History", "Festival", "Culture"],
    tags: ["Shrine", "Festival", "History", "Ishioka"],
    description:
      "An Ishioka shrine whose main sanctuary dates to 1627 and which anchors the September Ishioka Festival, a major procession of lion dances, floats and portable shrines; it provides a distinct historic-and-festival zone beyond Mito and Tsukuba.",
    descriptionJa:
      "1627年建立の本殿を持つ石岡の神社。9月の石岡のおまつり（例大祭）では獅子舞・山車・神輿が町を巡り、水戸・つくば以外の茨城で歴史と祭礼を体験する核になります。",
    highlights: [
      "A main sanctuary built in 1627, the oldest building in the grounds",
      "The September Ishioka Festival with lion dances, floats, and mikoshi",
      "Omamori, goshuin, and experience programs tied to the shrine",
    ],
    highlightsJa: [
      "境内最古の建物である1627年建立の本殿",
      "獅子舞・山車・神輿が巡る9月の石岡のおまつり",
      "お守り・御朱印と神社に結びつく体験プログラム",
    ],
    notes:
      "This is Ishioka's one canonical shrine-and-festival proposition. The official site identifies access from JR Ishioka Station and publishes current festival notices; confirm special event transport restrictions before visiting. No static Tokyo or airport duration is inferred.",
    notesJa:
      "石岡の神社・祭礼を代表する一つの立ち寄り先として扱います。公式サイトはJR石岡駅からのアクセスと祭礼の最新情報を案内しています。祭礼時の交通規制などは出発前に確認してください。東京や空港からの固定所要時間は設定しません。",
    reservation:
      "General worship does not require a reservation; confirm experience programs, prayers, and festival access directly with the shrine.",
    reservationJa:
      "通常の参拝に予約は不要です。体験、祈祷、祭礼時の利用条件は神社の公式案内で確認してください。",
    parking:
      "Check current official festival notices and shrine guidance before driving, especially in September.",
    parkingJa:
      "特に9月の祭礼時に車で訪れる場合は、神社の最新案内と交通規制情報を確認してください。",
    openingHours:
      "Shrine visiting and office arrangements vary; use the official current notices, particularly around the September festival.",
    openingHoursJa:
      "参拝・授与所の利用条件は変わる場合があります。特に9月の祭礼前後は公式の最新案内を確認してください。",
    localAccessModes: ["train", "car", "my_car"],
    duration: {
      hours: { min: 1, max: 2 },
      confidence: "medium",
      basis:
        "Conservative precinct, worship, and cultural-program band; festival attendance and all origin travel are excluded.",
    },
    sources: [
      source(
        "official",
        "https://sosyagu.jp/en/",
        "Hitachinokuni Soshagu Shrine official English visitor guide",
      ),
      source(
        "official",
        "https://sosyagu.jp/en/access/",
        "Hitachinokuni Soshagu Shrine official current notices and access page",
      ),
      source(
        "official",
        "https://sosyagu.jp/access/",
        "Hitachinokuni Soshagu official access page map pin",
      ),
      source(
        "manual",
        "https://www.wikidata.org/wiki/Q11481689",
        "Wikidata: Hitachinokuni Soshagu coordinate (auxiliary)",
      ),
    ],
    image: {
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/4/41/Soshagu_%28Ishioka%29_haiden.JPG",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Soshagu_(Ishioka)_haiden.JPG",
      license: "CC0",
      attribution: "Saigen Jiro, CC0, via Wikimedia Commons",
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
  for (const value of [record.name, record.nameJa, ...(record.aliases ?? [])]) {
    if (!value) continue;
    const key = normalize(value);
    if (key.length >= 6 && !names.has(key)) names.set(key, record.id);
  }
}

const preserveKAI159DerivedOutputs = (
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
  const isPriorKAI159Record =
    existing.editorial?.checkedAt === REVIEW_DATE &&
    existing.editorial.changeSummary?.includes("KAI-159");
  if (!isPriorKAI159Record) return merged;

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

  if (
    existing.name !== candidate.name ||
    existing.nameJa !== candidate.nameJa ||
    existing.prefecture !== candidate.prefecture ||
    existing.region !== candidate.region ||
    existing.municipalityId !== candidate.municipalityId
  ) {
    throw new Error(`KAI-159 identity conflict: ${candidate.id}`);
  }
  const merged = preserveKAI159DerivedOutputs(existing, candidate);
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
    ? `KAI-159: added ${addedIds.length} (${addedIds.join(", ")}); refreshed ${refreshedIds.length} (${refreshedIds.join(", ")})`
    : "KAI-159: verified catalogue already matches the canonical scope; no changes made",
);
