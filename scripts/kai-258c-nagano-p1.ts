/**
 * KAI-258C — Nagano secondary-hub completion.
 *
 * Evidence/identity review is captured in qa/kai-258/pr3-report.md. The
 * mutation is intentionally idempotent and uses child links rather than
 * mutating the frozen Wikipedia Phase 3 hub inputs.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  AdmissionCostFact,
  Destination,
  LocalTransportAccess,
  SourceReference,
} from "../src/shared/types/destination";

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-31";

const source = (url: string, title: string): SourceReference => ({
  type: "official",
  url,
  title,
  accessedAt: REVIEW_DATE,
});
const coordinateSource = (url: string): SourceReference => ({
  type: "calculated",
  url,
  title: "OpenStreetMap feature used as a map anchor; not a route-time claim",
  accessedAt: REVIEW_DATE,
});

type Candidate = {
  id: string;
  name: string;
  nameJa: string;
  aliases: string[];
  municipalityId?: string;
  kind: Destination["kind"];
  role: Destination["role"];
  importance: NonNullable<Destination["importance"]>;
  coordinates: { lat: number; lng: number };
  osmUrl: string;
  officialWebsite: string;
  officialTitle: string;
  image: string;
  imagePage: string;
  imageLicense: string;
  imageAttribution: string;
  description: string;
  descriptionJa: string;
  highlights: string[];
  highlightsJa: string[];
  categories: string[];
  tags: string[];
  localAccessModes: NonNullable<Destination["localAccessModes"]>;
  duration: { min: number; max: number };
  parentDestinationId?: string;
  relatedDestinationIds?: string[];
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
const visitHours = (candidate: Candidate) => candidate.duration;
const makeAdmission = (candidate: Candidate): AdmissionCostFact => ({
  state: "unavailable",
  provenance: "verified_source",
  reasonCode: "source_missing",
  scope: "general_entry",
  cost: { kind: "unavailable" },
  basis:
    "The official source was reviewed, but no current general-entry amount was promoted without a source-specific fee statement.",
  sourceUrls: [candidate.officialWebsite],
  checkedAt: REVIEW_DATE,
  reviewIntervalMonths: 12,
});
const makeLocalTransport = (): LocalTransportAccess => ({
  kind: "unavailable",
  reason: "fare_not_found",
  detail:
    "No destination-specific local-transport fare was promoted; route modes remain explicitly unestimated.",
});

const candidates: Candidate[] = [
  {
    id: "former-mikasa-hotel",
    name: "Former Mikasa Hotel",
    nameJa: "旧三笠ホテル",
    aliases: ["Old Mikasa Hotel", "Kyu-Mikasa Hotel"],
    municipalityId: "Nagano:karuizawa",
    kind: "historic",
    role: "poi",
    importance: "notable",
    coordinates: { lat: 36.3731331, lng: 138.6262318 },
    osmUrl: "https://www.openstreetmap.org/node/4365279592",
    officialWebsite: "https://karuizawa-kankokyokai.jp/spot/",
    officialTitle: "Karuizawa Tourism Association — Former Mikasa Hotel",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Old_mikasa_hotel02s3872.jpg/1280px-Old_mikasa_hotel02s3872.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Old_mikasa_hotel02s3872.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "663highland",
    description:
      "The Former Mikasa Hotel is a preserved Western-style resort hotel and a distinct heritage stop within Karuizawa's historic landscape.",
    descriptionJa:
      "旧三笠ホテルは、軽井沢の歴史的な景観を伝える保存された西洋式のリゾートホテル建築です。",
    highlights: [
      "Historic resort architecture",
      "Karuizawa heritage context",
      "Distinct from the town-wide Karuizawa record",
    ],
    highlightsJa: [
      "歴史的なリゾート建築",
      "軽井沢の近代史",
      "軽井沢町全体のレコードとは別の見どころ",
    ],
    categories: ["History", "Architecture", "Culture"],
    tags: ["Historic Building", "Architecture", "Karuizawa", "Nagano"],
    localAccessModes: ["train", "car"],
    duration: { min: 1, max: 2 },
    parentDestinationId: "karuizawa-town",
  },
  {
    id: "kagami-pond",
    name: "Kagami Pond",
    nameJa: "鏡池",
    aliases: ["Kagami-ike", "Togakushi Kagami Pond"],
    municipalityId: "Nagano:nagano",
    kind: "lake",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.7503693, lng: 138.0619696 },
    osmUrl: "https://www.openstreetmap.org/node/5122390221",
    officialWebsite: "https://togakushi-21.jp/",
    officialTitle: "Togakushi Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Kagami_Pond_and_Mount_Togakushi_at_the_back%2C_Nagano_Prefecture%3B_September_2019.jpg/1280px-Kagami_Pond_and_Mount_Togakushi_at_the_back%2C_Nagano_Prefecture%3B_September_2019.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Kagami_Pond_and_Mount_Togakushi_at_the_back,_Nagano_Prefecture;_September_2019.jpg",
    imageLicense: "CC BY-SA 2.0",
    imageAttribution: "Big Ben in Japan",
    description:
      "Kagami Pond is a reflective forest lake in Togakushi with a direct visual relationship to the surrounding mountain and shrine landscape.",
    descriptionJa:
      "鏡池は、戸隠の森と山々を水面に映す湖で、戸隠神社周辺の自然景観を補う見どころです。",
    highlights: [
      "Reflective mountain views",
      "Forest setting",
      "Distinct from Togakushi Shrine",
    ],
    highlightsJa: [
      "山々を映す水面",
      "森に囲まれた景観",
      "戸隠神社とは別の自然スポット",
    ],
    categories: ["Nature", "Lake", "Photography"],
    tags: ["Lake", "Nature", "Togakushi", "Nagano"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["togakushi-shrine"],
  },
  {
    id: "shibu-onsen",
    name: "Shibu Onsen",
    nameJa: "渋温泉",
    aliases: ["Shibu Hot Spring", "Shibu Onsen Town"],
    municipalityId: "Nagano:yamanouchi",
    kind: "onsen",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.7343852, lng: 138.4305856 },
    osmUrl: "https://www.openstreetmap.org/node/5209200386",
    officialWebsite: "https://www.shibuonsen.net/",
    officialTitle: "Shibu Onsen official website",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Shibu_onsen_night_view.jpg/1280px-Shibu_onsen_night_view.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Shibu_onsen_night_view.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Totti",
    description:
      "Shibu Onsen is a historic hot-spring settlement in Yamanouchi known for its compact streetscape, bathhouse culture, and ryokan setting.",
    descriptionJa:
      "渋温泉は、共同浴場文化と旅館街の景観が残る山ノ内町の歴史ある温泉街です。",
    highlights: [
      "Historic onsen streets",
      "Ryokan town atmosphere",
      "Yamanouchi hot-spring culture",
    ],
    highlightsJa: ["歴史ある温泉街", "旅館街の雰囲気", "山ノ内の温泉文化"],
    categories: ["Hot Springs", "Culture", "History"],
    tags: ["Onsen", "Ryokan", "Yamanouchi", "Nagano"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 2, max: 4 },
  },
  {
    id: "shiga-kogen",
    name: "Shiga Kogen",
    nameJa: "志賀高原",
    aliases: ["Shiga Highlands", "Shiga Kogen Highlands"],
    municipalityId: "Nagano:yamanouchi",
    kind: "mountain",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.7330511, lng: 138.4316714 },
    osmUrl: "https://www.openstreetmap.org/node/4687972416",
    officialWebsite: "https://www.shigakogen.gr.jp/",
    officialTitle: "Shiga Kogen official website",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Shiga_Kogen_from_Nozoki04n4272.jpg/1280px-Shiga_Kogen_from_Nozoki04n4272.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Shiga_Kogen_from_Nozoki04n4272.jpg",
    imageLicense: "CC BY 2.5",
    imageAttribution: "663highland",
    description:
      "Shiga Kogen is a broad highland recreation and nature area in Yamanouchi, distinct from the smaller Shibu Onsen settlement.",
    descriptionJa:
      "志賀高原は、渋温泉街とは異なる、山ノ内町の広域的な高原自然・レクリエーションエリアです。",
    highlights: [
      "Highland landscapes",
      "Large mountain recreation area",
      "Distinct from Shibu Onsen",
    ],
    highlightsJa: [
      "高原の景観",
      "広い山岳レクリエーションエリア",
      "渋温泉とは別の自然エリア",
    ],
    categories: ["Nature", "Mountain", "Outdoor Activities"],
    tags: ["Highlands", "Mountains", "Yamanouchi", "Nagano"],
    localAccessModes: ["bus", "car"],
    duration: { min: 4, max: 8 },
  },
  {
    id: "matsumoto-nakamachi-nawate",
    name: "Nakamachi and Nawate Streets",
    nameJa: "中町通り・縄手通り",
    aliases: [
      "Nakamachi Street",
      "Nawate Street",
      "Matsumoto Historic Streets",
    ],
    municipalityId: "Nagano:matsumoto",
    kind: "street",
    role: "poi",
    importance: "major",
    coordinates: { lat: 36.2344, lng: 137.971 },
    osmUrl: "https://www.openstreetmap.org/node/4643762692",
    officialWebsite: "https://visitmatsumoto.com/",
    officialTitle: "Matsumoto Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Nakamachi_street_Matsumoto_Nagano_pref_Japan07n.jpg/1280px-Nakamachi_street_Matsumoto_Nagano_pref_Japan07n.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Nakamachi_street_Matsumoto_Nagano_pref_Japan07n.jpg",
    imageLicense: "CC BY 2.5",
    imageAttribution: "663highland",
    description:
      "Nakamachi and Nawate Streets form a walkable historic and shopping pair in central Matsumoto, complementing the castle without duplicating it.",
    descriptionJa:
      "中町通りと縄手通りは、松本城とは別に歩いて楽しめる、中心市街地の歴史・商店街エリアです。",
    highlights: [
      "Historic storehouses",
      "Riverside Nawate streetscape",
      "Central Matsumoto walking route",
    ],
    highlightsJa: [
      "土蔵造りの町並み",
      "川沿いの縄手通り",
      "松本中心部の散策ルート",
    ],
    categories: ["History", "Shopping", "Culture"],
    tags: ["Historic Street", "Shopping", "Matsumoto", "Nagano"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 2, max: 3 },
    parentDestinationId: "matsumoto-city",
  },
  {
    id: "utsukushigahara-highlands",
    name: "Utsukushigahara Highlands",
    nameJa: "美ヶ原高原",
    aliases: ["Utsukushigahara", "Utsukushigahara Plateau"],
    municipalityId: "Nagano:ueda",
    kind: "mountain",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.2307236, lng: 138.140291 },
    osmUrl: "https://www.openstreetmap.org/way/117369484",
    officialWebsite: "https://www.utsukushi2034.jp/",
    officialTitle: "Utsukushigahara Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/%E7%BE%8E%E3%83%B6%E5%8E%9F%E3%82%B9%E3%82%AB%E3%82%A4%E3%83%A9%E3%82%A4%E3%83%B3_-_panoramio_-_Yobito_KAYANUMA.jpg/1280px-%E7%BE%8E%E3%83%B6%E5%8E%9F%E3%82%B9%E3%82%AB%E3%82%A4%E3%83%A9%E3%82%A4%E3%83%B3_-_panoramio_-_Yobito_KAYANUMA.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:%E7%BE%8E%E3%83%B6%E5%8E%9F%E3%82%B9%E3%82%AB%E3%82%A4%E3%83%A9%E3%82%A4%E3%83%B3_-_panoramio_-_Yobito_KAYANUMA.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Yobito KAYANUMA",
    description:
      "Utsukushigahara is a high open plateau on the Matsumoto-Ueda side of Nagano, best treated as a broad nature destination rather than as a museum shell.",
    descriptionJa:
      "美ヶ原は、松本・上田側に広がる開放的な高原で、単一施設ではなく広域の自然目的地として扱います。",
    highlights: [
      "Open plateau landscapes",
      "Highland viewpoints",
      "Broad nature destination",
    ],
    highlightsJa: ["開けた高原景観", "高原の展望", "広域の自然目的地"],
    categories: ["Nature", "Mountain", "Viewpoint"],
    tags: ["Highlands", "Viewpoint", "Ueda", "Matsumoto"],
    localAccessModes: ["bus", "car"],
    duration: { min: 3, max: 6 },
    relatedDestinationIds: ["matsumoto-city"],
  },
  {
    id: "anrakuji-temple-ueda",
    name: "Anrakuji Temple",
    nameJa: "安楽寺",
    aliases: ["Anraku-ji", "Anrakuji Octagonal Pagoda"],
    municipalityId: "Nagano:ueda",
    kind: "temple",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.3521426, lng: 138.1531466 },
    osmUrl: "https://www.openstreetmap.org/node/5210313925",
    officialWebsite: "https://www.bessho-spa.jp/",
    officialTitle: "Bessho Onsen Tourism Association",
    image:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Anrakuji_Hakkakusanjyuunotou_BessyoOnsen.jpg?width=1280",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Anrakuji_Hakkakusanjyuunotou_BessyoOnsen.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Wikimedia Commons contributor",
    description:
      "Anrakuji is a Soto Zen temple in Bessho Onsen, known for its historic octagonal pagoda and distinct religious heritage.",
    descriptionJa:
      "安楽寺は別所温泉にある曹洞宗の寺院で、歴史的な八角三重塔と独自の文化遺産で知られます。",
    highlights: [
      "Historic octagonal pagoda",
      "Bessho Onsen heritage",
      "Distinct temple identity",
    ],
    highlightsJa: [
      "歴史ある八角三重塔",
      "別所温泉の文化遺産",
      "独立した寺院レコード",
    ],
    categories: ["Temple", "History", "Culture"],
    tags: ["Temple", "Pagoda", "Bessho Onsen", "Ueda"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["nagano-bessho-onsen", "kitamuki-kannon"],
  },
  {
    id: "kitamuki-kannon",
    name: "Kitamuki Kannon",
    nameJa: "北向観音",
    aliases: ["Kitamuki Kannon Temple", "Kitamuki Kannon-do"],
    municipalityId: "Nagano:ueda",
    kind: "temple",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.3498913, lng: 138.1564174 },
    osmUrl: "https://www.openstreetmap.org/node/3393797481",
    officialWebsite: "https://www.bessho-spa.jp/",
    officialTitle: "Bessho Onsen Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/0/0c/Interior_of_Kitamuki_Iwaya_Juichimen_Kannon_201602.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Interior_of_Kitamuki_Iwaya_Juichimen_Kannon_201602.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Kazuindahouse5201",
    description:
      "Kitamuki Kannon is a separate Kannon temple in Bessho Onsen, forming a natural cultural counterpart to Anrakuji rather than a duplicate of it.",
    descriptionJa:
      "北向観音は別所温泉にある独立した観音堂で、安楽寺とは異なる文化的見どころとして位置づけます。",
    highlights: [
      "Kannon worship",
      "Bessho Onsen temple walk",
      "Related but distinct from Anrakuji",
    ],
    highlightsJa: [
      "観音信仰",
      "別所温泉の寺社散策",
      "安楽寺とは関連する別の寺院",
    ],
    categories: ["Temple", "Culture", "History"],
    tags: ["Temple", "Kannon", "Bessho Onsen", "Ueda"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["anrakuji-temple-ueda", "nagano-bessho-onsen"],
  },
  {
    id: "yanagimachi-street-ueda",
    name: "Yanagimachi Street",
    nameJa: "柳町通り",
    aliases: ["Ueda Yanagimachi", "Old Hokkokukaido Yanagimachi"],
    municipalityId: "Nagano:ueda",
    kind: "street",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.4058268, lng: 138.2531181 },
    osmUrl: "https://www.openstreetmap.org/node/13065174901",
    officialWebsite: "https://ueda-kanko.or.jp/",
    officialTitle: "Ueda Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/5/56/Ueda-Yanagimachi1.jpg",
    imagePage: "https://commons.wikimedia.org/wiki/File:Ueda-Yanagimachi1.jpg",
    imageLicense: "Public domain",
    imageAttribution: "大友ディミトリ",
    description:
      "Yanagimachi Street preserves a section of Ueda's old Hokkokukaido atmosphere with historic buildings, food, and small-scale town walking.",
    descriptionJa:
      "柳町通りは、歴史的な建物や食の店が残る、上田の旧北国街道を感じられる町歩きエリアです。",
    highlights: [
      "Historic highway streetscape",
      "Small shops and food",
      "Distinct Ueda town walk",
    ],
    highlightsJa: ["旧街道の町並み", "小さな店と食", "上田の町歩き"],
    categories: ["History", "Shopping", "Food"],
    tags: ["Historic Street", "Food", "Ueda", "Nagano"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["ueda-castle-nagano"],
  },
  {
    id: "kirigamine-highlands",
    name: "Kirigamine Highlands",
    nameJa: "霧ヶ峰高原",
    aliases: ["Kirigamine", "Kirigamine Plateau"],
    municipalityId: "Nagano:suwa",
    kind: "mountain",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.0973159, lng: 138.1674446 },
    osmUrl: "https://www.openstreetmap.org/node/2430769431",
    officialWebsite: "https://www.suwakanko.jp/",
    officialTitle: "Suwa Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Kirigamine_seen_from_the_east_2018-03-04.jpg/1280px-Kirigamine_seen_from_the_east_2018-03-04.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Kirigamine_seen_from_the_east_2018-03-04.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Koda6029",
    description:
      "Kirigamine is an open highland area east of Lake Suwa, offering a separate nature identity from the shrine and lake destinations around Suwa.",
    descriptionJa:
      "霧ヶ峰は諏訪湖東側に広がる開放的な高原で、諏訪の社寺や湖とは異なる自然の目的地です。",
    highlights: [
      "Open highland scenery",
      "Highland walking",
      "Suwa-area nature context",
    ],
    highlightsJa: ["開放的な高原景観", "高原散策", "諏訪周辺の自然"],
    categories: ["Nature", "Mountain", "Outdoor Activities"],
    tags: ["Highlands", "Nature", "Suwa", "Nagano"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
    relatedDestinationIds: ["suwa-taisha"],
  },
  {
    id: "yashimagahara-wetland",
    name: "Yashimagahara Wetland",
    nameJa: "八島ヶ原湿原",
    aliases: ["Yashimagahara Marsh", "Yashimagahara Shitsugen"],
    municipalityId: "Nagano:shimosuwa",
    kind: "nature",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.1190053, lng: 138.166393 },
    osmUrl: "https://www.openstreetmap.org/way/386612549",
    officialWebsite: "https://shimosuwaonsen.jp/",
    officialTitle: "Shimosuwa Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Yashimagahara_Wetland_05.jpg/1280px-Yashimagahara_Wetland_05.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Yashimagahara_Wetland_05.jpg",
    imageLicense: "CC BY 3.0",
    imageAttribution: "Σ64",
    description:
      "Yashimagahara Wetland is a highland marsh with a distinct walking and seasonal plant landscape, separate from the broader Kirigamine record.",
    descriptionJa:
      "八島ヶ原湿原は、季節の植物と木道散策が特徴の高層湿原で、霧ヶ峰全体とは別の自然見どころです。",
    highlights: ["Highland wetland", "Boardwalk landscape", "Seasonal plants"],
    highlightsJa: ["高層湿原", "木道の景観", "季節の植物"],
    categories: ["Nature", "Wetland", "Hiking"],
    tags: ["Wetland", "Nature", "Shimosuwa", "Nagano"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
    relatedDestinationIds: ["kirigamine-highlands"],
  },
  {
    id: "lake-shirakaba",
    name: "Lake Shirakaba",
    nameJa: "白樺湖",
    aliases: ["Shirakaba-ko", "Shirakaba Lake"],
    municipalityId: "Nagano:chino",
    kind: "lake",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.1057761, lng: 138.237963 },
    osmUrl: "https://www.openstreetmap.org/relation/2314066",
    officialWebsite: "https://www.shirakabako.com/",
    officialTitle: "Lake Shirakaba Tourism Association",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Lake_Shirakaba11bs4272.jpg/1280px-Lake_Shirakaba11bs4272.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Lake_Shirakaba11bs4272.jpg",
    imageLicense: "CC BY 2.5",
    imageAttribution: "663highland",
    description:
      "Lake Shirakaba is a highland lake and resort landscape on the Venus Line, distinct from Lake Suwa and the Kirigamine wetland.",
    descriptionJa:
      "白樺湖はビーナスライン沿いの高原湖・リゾート景観で、諏訪湖や霧ヶ峰湿原とは異なる目的地です。",
    highlights: ["Highland lake", "Resort landscape", "Venus Line context"],
    highlightsJa: ["高原湖", "リゾート景観", "ビーナスライン周辺"],
    categories: ["Nature", "Lake", "Outdoor Activities"],
    tags: ["Lake", "Highlands", "Chino", "Nagano"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
    relatedDestinationIds: ["kirigamine-highlands"],
  },
  {
    id: "hirugami-onsen",
    name: "Hirugami Onsen",
    nameJa: "昼神温泉",
    aliases: ["Hirugami Hot Spring", "Hirugami Onsen Village"],
    municipalityId: "Nagano:achi",
    kind: "onsen",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 35.4562619, lng: 137.7146019 },
    osmUrl: "https://www.openstreetmap.org/node/8207895833",
    officialWebsite: "https://hirugamionsen.jp/",
    officialTitle: "Hirugami Onsen official website",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Hirugami001.JPG/1280px-Hirugami001.JPG",
    imagePage: "https://commons.wikimedia.org/wiki/File:Hirugami001.JPG",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Opqr",
    description:
      "Hirugami Onsen is a hot-spring settlement in Achi, providing a concrete southern Nagano wellness anchor alongside the area's night-sky attractions.",
    descriptionJa:
      "昼神温泉は阿智村の温泉街で、星空観賞など阿智地域の観光と組み合わせられる南信州の滞在拠点です。",
    highlights: [
      "Hot-spring settlement",
      "Achi village context",
      "Southern Nagano stay base",
    ],
    highlightsJa: ["温泉街", "阿智村の観光", "南信州の滞在拠点"],
    categories: ["Hot Springs", "Relaxation", "Nature"],
    tags: ["Onsen", "Achi", "Wellness", "Nagano"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
  },
  {
    id: "hokusai-museum-obuse",
    name: "Hokusai Museum",
    nameJa: "北斎館",
    aliases: ["Hokusai-kan", "Obuse Hokusai Museum"],
    municipalityId: "Nagano:obuse",
    kind: "museum",
    role: "poi",
    importance: "major",
    coordinates: { lat: 36.6940706, lng: 138.3172117 },
    osmUrl: "https://www.openstreetmap.org/way/228926051",
    officialWebsite: "https://hokusai-kan.com/",
    officialTitle: "Hokusai Museum official website",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Hokusai_Museum.jpg/1280px-Hokusai_Museum.jpg",
    imagePage: "https://commons.wikimedia.org/wiki/File:Hokusai_Museum.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "キャンター",
    description:
      "The Hokusai Museum is Obuse's dedicated art anchor, preserving a discoverable museum identity within the wider chestnut and historic-town destination.",
    descriptionJa:
      "北斎館は、小布施の栗や歴史的な町並みとは別に、北斎作品を軸とする美術館として訪ねられる文化拠点です。",
    highlights: [
      "Hokusai-focused collection",
      "Obuse cultural anchor",
      "Distinct museum identity",
    ],
    highlightsJa: [
      "北斎を軸にした展示",
      "小布施の文化拠点",
      "独立した美術館レコード",
    ],
    categories: ["Museum", "Art", "Culture"],
    tags: ["Hokusai", "Museum", "Obuse", "Nagano"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
    parentDestinationId: "obuse-town",
  },
  {
    id: "gansho-in-temple",
    name: "Gansho-in Temple",
    nameJa: "岩松院",
    aliases: ["Ganshoin", "Gansho-in Temple Obuse"],
    municipalityId: "Nagano:obuse",
    kind: "temple",
    role: "poi",
    importance: "notable",
    coordinates: { lat: 36.6984606, lng: 138.3338805 },
    osmUrl: "https://www.openstreetmap.org/node/916914777",
    officialWebsite: "https://www.gansho-in.or.jp/",
    officialTitle: "Gansho-in Temple official website",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Ganshoin_Hondo_01.jpg/1280px-Ganshoin_Hondo_01.jpg",
    imagePage: "https://commons.wikimedia.org/wiki/File:Ganshoin_Hondo_01.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Tawashi2006",
    description:
      "Gansho-in is a historic temple in Obuse with a distinct cultural identity from the Hokusai Museum and the town-wide record.",
    descriptionJa:
      "岩松院は小布施にある歴史ある寺院で、北斎館や小布施町全体のレコードとは異なる文化的な見どころです。",
    highlights: [
      "Historic temple setting",
      "Obuse cultural walk",
      "Distinct from Hokusai Museum",
    ],
    highlightsJa: [
      "歴史ある寺院の景観",
      "小布施の文化散策",
      "北斎館とは別の見どころ",
    ],
    categories: ["Temple", "History", "Culture"],
    tags: ["Temple", "History", "Obuse", "Nagano"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
    parentDestinationId: "obuse-town",
  },
];

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];
const originalIds = new Set(catalog.map((destination) => destination.id));
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const normalize = (value: string) =>
  value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const names = new Map<string, string>();
for (const destination of catalog) {
  for (const value of [
    destination.name,
    destination.nameJa,
    ...(destination.aliases ?? []),
  ]) {
    const key = normalize(value);
    if (key.length >= 6) names.set(key, destination.id);
  }
}
for (const candidate of candidates) {
  if (candidate.id.includes("star-village"))
    throw new Error("deferred candidate leaked into mutation");
  const identityOwner = [candidate.name, candidate.nameJa, ...candidate.aliases]
    .map(normalize)
    .map((key) => names.get(key))
    .find((owner) => owner && owner !== candidate.id);
  if (identityOwner)
    throw new Error(
      `${candidate.id}: duplicate identity with ${identityOwner}`,
    );
  const existing = byId.get(candidate.id);
  const fieldSources: Record<string, SourceReference[]> = {
    name: [candidateSource(candidate)],
    description: [candidateSource(candidate)],
    highlights: [candidateSource(candidate)],
    coordinates: [coordinateSource(candidate.osmUrl)],
    heroImage: [imageSource(candidate)],
    relationships: [candidateSource(candidate)],
  };
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
    if (existing.kind !== candidate.kind) existing.kind = candidate.kind;
    if (
      JSON.stringify(existing.coordinates) !==
      JSON.stringify(candidate.coordinates)
    )
      existing.coordinates = candidate.coordinates;
    if (existing.heroImage !== candidate.image) {
      existing.heroImage = candidate.image;
      existing.imageMetadata = imageMetadata(candidate);
    }
    existing.content = {
      ...(existing.content ?? {}),
      en: { ...(existing.content?.en ?? {}), name: candidate.name },
      ja: { ...(existing.content?.ja ?? {}), name: candidate.nameJa },
    };
    if (existing.recommendedVisitHours === undefined)
      existing.recommendedVisitHours = visitHours(candidate);
    if (
      JSON.stringify(existing.admission) !==
      JSON.stringify(makeAdmission(candidate))
    )
      existing.admission = makeAdmission(candidate);
    if (
      JSON.stringify(existing.localTransport) !==
      JSON.stringify(makeLocalTransport())
    )
      existing.localTransport = makeLocalTransport();
    if (candidate.relatedDestinationIds)
      applyRelated(existing, candidate.relatedDestinationIds);
    continue;
  }
  const record: Destination = {
    id: candidate.id,
    name: candidate.name,
    nameJa: candidate.nameJa,
    aliases: candidate.aliases,
    officialWebsite: candidate.officialWebsite,
    officialWebsiteRequirement: "required",
    municipalityId: candidate.municipalityId,
    kind: candidate.kind,
    role: candidate.role,
    placeType: "destination",
    importance: candidate.importance,
    prefecture: "Nagano",
    region: "Chubu",
    categories: candidate.categories,
    tags: candidate.tags,
    heroImage: candidate.image,
    imageMetadata: imageMetadata(candidate),
    coordinates: candidate.coordinates,
    description: candidate.description,
    highlights: candidate.highlights,
    content: {
      en: {
        name: candidate.name,
        description: candidate.description,
        highlights: candidate.highlights,
        notes:
          "Check the official source for current access, facility rules, and seasonal restrictions before travel.",
      },
      ja: {
        name: candidate.nameJa,
        description: candidate.descriptionJa,
        highlights: candidate.highlightsJa,
        notes:
          "訪問前に公式情報で最新のアクセス、施設ルール、季節ごとの制限を確認してください。",
      },
    },
    budgetMetadata: unknownBudget,
    admission: makeAdmission(candidate),
    transportOptions: {},
    localAccessModes: candidate.localAccessModes,
    localAccessUnestimated: true,
    localTransport: makeLocalTransport(),
    recommendedVisitHours: visitHours(candidate),
    ratings: neutralRatings,
    ratingsSchemaVersion: 2,
    ratingMetadata: { rubricVersion: 2, method: "manual", confidence: "low" },
    collections: [],
    relationships: {
      ...(candidate.parentDestinationId
        ? { parentDestinationId: candidate.parentDestinationId }
        : {}),
      ...(candidate.relatedDestinationIds
        ? { relatedDestinationIds: candidate.relatedDestinationIds }
        : {}),
    },
    editorial: {
      lifecycle: "approved",
      sources: [candidateSource(candidate), coordinateSource(candidate.osmUrl)],
      fieldSources,
    },
    addedAt: REVIEW_DATE,
    status: "verified",
    travelEstimate: { confidence: "beta" },
  };
  catalog.push(record);
  byId.set(record.id, record);
  for (const value of [record.name, record.nameJa, ...(record.aliases ?? [])]) {
    const key = normalize(value);
    if (key.length >= 6) names.set(key, record.id);
  }
}

function candidateSource(candidate: Candidate): SourceReference {
  return source(candidate.officialWebsite, candidate.officialTitle);
}
function imageSource(candidate: Candidate): SourceReference {
  return {
    type: "official",
    url: candidate.imagePage,
    title: `${candidate.name} image provenance`,
    accessedAt: REVIEW_DATE,
  };
}
function imageMetadata(candidate: Candidate) {
  return {
    source: "wikimedia-commons",
    sourceUrl: candidate.imagePage,
    license: candidate.imageLicense,
    attribution: candidate.imageAttribution,
    verifiedAt: REVIEW_DATE,
  };
}
function applyRelated(destination: Destination, ids: string[]) {
  const existing = destination.relationships?.relatedDestinationIds ?? [];
  destination.relationships = {
    ...(destination.relationships ?? {}),
    relatedDestinationIds: [...new Set([...existing, ...ids])],
  };
}

fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `KAI-258C: Nagano catalogue now has ${catalog.filter((destination) => destination.prefecture === "Nagano").length} records; added ${candidates.filter((candidate) => !originalIds.has(candidate.id)).length} secondary records.`,
);
