/**
 * KAI-258B — Gunma P0 anchor/depth.
 *
 * This is intentionally a narrow, idempotent data mutation. The candidate
 * identity/duplicate matrix was completed first and reconciled with KAI-177:
 * six KAI-177 overlaps are implemented here as the shared P0 catalogue
 * surface; the remaining KAI-177 work is not copied into this branch.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  AdmissionCostFact,
  Destination,
  LocalTransportAccess,
  SourceReference,
} from "../src/shared/types/destination";

const ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-31";

type Candidate = {
  id: string;
  name: string;
  nameJa: string;
  aliases: string[];
  municipalityId: string;
  kind: Destination["kind"];
  role: NonNullable<Destination["role"]>;
  importance: NonNullable<Destination["importance"]>;
  coordinates: { lat: number; lng: number };
  osmUrl: string;
  officialWebsite: string;
  image: string;
  imagePage: string;
  imageLicense: string;
  imageAttribution: string;
  description: string;
  descriptionJa: string;
  highlights: string[];
  highlightsJa: string[];
  tags: string[];
  localAccessModes: NonNullable<Destination["localAccessModes"]>;
  parentDestinationId?: string;
  relatedDestinationIds?: string[];
  duration: { min: number; max: number };
  categories: string[];
  source: SourceReference;
};

const source = (url: string, quote: string): SourceReference => ({
  type: "official",
  url,
  accessedAt: REVIEW_DATE,
  quote,
});

const coordinatesSource = (url: string): SourceReference => ({
  type: "manual",
  url,
  accessedAt: REVIEW_DATE,
  quote:
    "OpenStreetMap feature used as the map anchor; no route duration inferred.",
});

const unknownBudget = {
  method: "unknown" as const,
  state: "unavailable" as const,
  provenance: "none" as const,
  reasonCode: "source_missing" as const,
  modelVersion: "budget-model-v1",
  confidence: "unknown" as const,
  basis:
    "No current general-entry amount was promoted from the reviewed official source.",
};

const unknownSeason = {
  method: "unknown" as const,
  modelVersion: "season-model-v1",
  confidence: "unknown" as const,
  basis: "No stable seasonality claim was promoted from the reviewed source.",
};

const unknownReservation =
  "Reservation requirements are unverified; check the official source before visiting.";
const unknownReservationJa =
  "予約の要否は未確認のため、訪問前に公式情報をご確認ください。";
const unknownParking =
  "Parking availability is unverified; check the official source before visiting.";
const unknownParkingJa =
  "駐車場の有無は未確認のため、訪問前に公式情報をご確認ください。";

const unknownCrowd = {
  method: "unknown" as const,
  modelVersion: "crowd-model-v1",
  confidence: "unknown" as const,
  basis:
    "No stable crowd vector was verified; the value is neutralized rather than inferred.",
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

const makeAdmission = (candidate: Candidate): AdmissionCostFact => {
  const notApplicable = new Set([
    "lake-haruna",
    "lake-okushima",
    "usui-third-bridge",
  ]);
  if (notApplicable.has(candidate.id)) {
    return {
      state: "not_applicable",
      provenance: "verified_source",
      reasonCode: "not_applicable",
      scope: "general_entry",
      cost: { kind: "not_applicable" },
      basis:
        "The official source presents an open landscape or heritage structure rather than one general-entry ticket product.",
      sourceUrls: [candidate.officialWebsite],
      checkedAt: REVIEW_DATE,
      reviewIntervalMonths: 12,
    };
  }
  return {
    state: "unavailable",
    provenance: "verified_source",
    reasonCode: "source_missing",
    scope: "general_entry",
    cost: { kind: "unavailable" },
    basis:
      "The reviewed official source was retained, but no current general-entry amount was promoted without a source-specific fee statement.",
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

const candidates: Candidate[] = [
  {
    id: "kusatsu-yubatake",
    name: "Yubatake",
    nameJa: "湯畑",
    aliases: ["Hot Water Field", "Kusatsu Yubatake"],
    municipalityId: "Gunma:kusatsu",
    kind: "onsen",
    role: "poi",
    importance: "flagship",
    coordinates: { lat: 36.6231, lng: 138.5965 },
    osmUrl: "https://www.openstreetmap.org/relation/12852884",
    officialWebsite: "https://www.kusatsu-onsen.ne.jp/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/251128_Yubatake%2C_Kusatsu_14.jpg/1280px-251128_Yubatake%2C_Kusatsu_14.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:251128_Yubatake,_Kusatsu_14.jpg",
    imageLicense: "CC0",
    imageAttribution: "Aspere",
    description:
      "Kusatsu's central hot-water field is the town's defining geothermal landmark, with the steam, channels, and public streets of the onsen core arranged around the source.",
    descriptionJa:
      "草津温泉の中心にある湯畑は、湯けむりと湯樋が集まる温泉街の象徴的な景観です。",
    highlights: [
      "Central geothermal landmark in Kusatsu Onsen",
      "Steam, hot-water channels, and onsen-town streets",
      "Distinct anchor for exploring the Kusatsu town core",
    ],
    highlightsJa: [
      "草津温泉の中心にある地熱の名所",
      "湯けむりと湯樋が続く温泉街の景観",
      "草津の町歩きの基点になる名所",
    ],
    tags: ["Hot Springs", "Nature", "Kusatsu", "Gunma Travel"],
    localAccessModes: ["train", "bus", "car"],
    parentDestinationId: "kusatsu-town",
    duration: { min: 1, max: 2 },
    categories: ["Nature", "Culture"],
    source: source(
      "https://www.kusatsu-onsen.ne.jp/",
      "The Kusatsu Onsen Tourism Association identifies Yubatake as the central hot-water field and town landmark.",
    ),
  },
  {
    id: "sainokawara-park",
    name: "Sainokawara Park",
    nameJa: "西の河原公園",
    aliases: ["Sai-no-kawara Park", "Sainokawara"],
    municipalityId: "Gunma:kusatsu",
    kind: "park",
    role: "poi",
    importance: "notable",
    coordinates: { lat: 36.6243024, lng: 138.5894948 },
    osmUrl: "https://www.openstreetmap.org/way/1252074447",
    officialWebsite: "https://www.kusatsu-onsen.ne.jp/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/251128_Sainokawara_Park_06.jpg/1280px-251128_Sainokawara_Park_06.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:251128_Sainokawara_Park_06.jpg",
    imageLicense: "CC0",
    imageAttribution: "Aspere",
    description:
      "Sainokawara Park is Kusatsu's open volcanic streamscape, where warm water emerges among rocks and paths west of the onsen town.",
    descriptionJa:
      "西の河原公園は、温泉街の西側に広がる岩場と湯の流れが特徴の火山性の公園です。",
    highlights: [
      "Open volcanic streamscape within the Kusatsu onsen area",
      "Rocky paths and warm-water landscape",
      "Separate park anchor from the town's Yubatake core",
    ],
    highlightsJa: [
      "草津温泉にある開放的な火山性の水景",
      "岩場と温かい湯の流れを歩く景観",
      "湯畑中心部とは別の公園の見どころ",
    ],
    tags: ["Nature", "Park", "Hot Springs", "Kusatsu", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    parentDestinationId: "kusatsu-town",
    duration: { min: 1, max: 2 },
    categories: ["Nature", "Parks"],
    source: source(
      "https://www.kusatsu-onsen.ne.jp/",
      "The Kusatsu Onsen Tourism Association presents Sainokawara Park as a named Kusatsu attraction west of the town core.",
    ),
  },
  {
    id: "mt-tanigawa",
    name: "Mount Tanigawa",
    nameJa: "谷川岳",
    aliases: ["Tanigawadake", "Tanigawadake Joch", "谷川岳ヨッホ"],
    municipalityId: "Gunma:minakami",
    kind: "mountain",
    role: "poi",
    importance: "flagship",
    coordinates: { lat: 36.8343949, lng: 138.9302115 },
    osmUrl: "https://www.openstreetmap.org/node/3261275246",
    officialWebsite: "https://tanigawadake-joch.com/en/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Tanigawa-dake%2C_October_2007.jpg/1280px-Tanigawa-dake%2C_October_2007.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Tanigawa-dake,_October_2007.jpg",
    imageLicense: "Public domain",
    imageAttribution: "Brian Adler",
    description:
      "Mount Tanigawa is Minakami's major alpine destination, presented by the ropeway operator as Tanigawadake Joch with access into the mountain landscape.",
    descriptionJa:
      "谷川岳はみなかみを代表する山岳景観で、ロープウェイ事業者は谷川岳ヨッホとして山の玄関口を案内しています。",
    highlights: [
      "Alpine mountain destination in Minakami",
      "Tanigawadake Joch ropeway gateway",
      "Distinct mountain anchor for Minakami outings",
    ],
    highlightsJa: [
      "みなかみを代表する山岳の目的地",
      "谷川岳ヨッホのロープウェイ玄関口",
      "みなかみの山旅を支える独立した拠点",
    ],
    tags: ["Mountains", "Nature", "Hiking", "Minakami", "Gunma Travel"],
    localAccessModes: ["train", "bus", "car"],
    parentDestinationId: "minakami-town",
    relatedDestinationIds: ["takaragawa-onsen"],
    duration: { min: 2, max: 4 },
    categories: ["Nature", "Outdoor Activities"],
    source: source(
      "https://tanigawadake-joch.com/en/",
      "The operator identifies Tanigawadake Joch as the Mount Tanigawa mountain gateway in Minakami.",
    ),
  },
  {
    id: "takaragawa-onsen",
    name: "Takaragawa Onsen Osenkaku",
    nameJa: "宝川温泉 汪泉閣",
    aliases: ["Takaragawa Onsen", "Takaragawa Hot Spring"],
    municipalityId: "Gunma:minakami",
    kind: "onsen",
    role: "poi",
    importance: "notable",
    coordinates: { lat: 36.8479555, lng: 139.0468165 },
    osmUrl: "https://www.openstreetmap.org/node/11627722880",
    officialWebsite: "http://www.takaragawa.com/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Takaragawa_Onsen_01.jpg/1280px-Takaragawa_Onsen_01.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Takaragawa_Onsen_01.jpg",
    imageLicense: "CC BY-SA 2.1 jp",
    imageAttribution: "nobiinue",
    description:
      "Takaragawa Onsen Osenkaku is a distinct riverside onsen destination in Minakami, known for its bathhouse and mountain-valley setting.",
    descriptionJa:
      "宝川温泉 汪泉閣は、山あいの川沿いにあるみなかみの独立した温泉滞在先です。",
    highlights: [
      "Riverside onsen destination in Minakami",
      "Osenkaku operator and bathing complex",
      "Separate choice from Minakami town and Kusatsu onsen records",
    ],
    highlightsJa: [
      "みなかみの川沿いにある温泉地",
      "汪泉閣が運営する入浴施設群",
      "みなかみ町中心部や草津温泉とは別の選択肢",
    ],
    tags: ["Hot Springs", "Nature", "Minakami", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    parentDestinationId: "minakami-town",
    relatedDestinationIds: ["mt-tanigawa"],
    duration: { min: 2, max: 4 },
    categories: ["Hot Springs", "Nature"],
    source: source(
      "http://www.takaragawa.com/",
      "The operator identifies Takaragawa Onsen Osenkaku as a Minakami onsen destination.",
    ),
  },
  {
    id: "lake-haruna",
    name: "Lake Haruna",
    nameJa: "榛名湖",
    aliases: ["Harunako", "Haruna Lake"],
    municipalityId: "Gunma:takasaki",
    kind: "lake",
    role: "standalone",
    importance: "flagship",
    coordinates: { lat: 36.4752798, lng: 138.8659063 },
    osmUrl: "https://www.openstreetmap.org/relation/3563406",
    officialWebsite: "https://www.takasaki-kankoukyoukai.or.jp/en/?p=82",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Lake_Haruna_in_February_%28a%29.jpg/1280px-Lake_Haruna_in_February_%28a%29.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Lake_Haruna_in_February_(a).jpg",
    imageLicense: "CC BY 2.0",
    imageAttribution: "puffyjet",
    description:
      "Lake Haruna is the highland lake at the centre of Mount Haruna's scenic area, a concrete nature destination within Takasaki.",
    descriptionJa:
      "榛名湖は高崎市の榛名山エリアの中心にある湖で、山上の景観を楽しめる具体的な自然の目的地です。",
    highlights: [
      "Highland lake in Mount Haruna's scenic area",
      "Concrete nature anchor within Takasaki",
      "Distinct from the broader Ikaho Onsen record",
    ],
    highlightsJa: [
      "榛名山の山上にある湖の景観",
      "高崎の自然観光を支える具体的な見どころ",
      "伊香保温泉の広域記述とは別の目的地",
    ],
    tags: ["Lakes", "Nature", "Mount Haruna", "Takasaki", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    relatedDestinationIds: ["haruna-shrine"],
    duration: { min: 2, max: 4 },
    categories: ["Nature", "Lakes"],
    source: source(
      "https://www.takasaki-kankoukyoukai.or.jp/en/?p=82",
      "Takasaki Tourism Association identifies Lake Haruna as a named Mount Haruna attraction.",
    ),
  },
  {
    id: "haruna-shrine",
    name: "Haruna Shrine",
    nameJa: "榛名神社",
    aliases: ["Haruna-jinja", "Haruna Jinja"],
    municipalityId: "Gunma:takasaki",
    kind: "shrine",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.4584395, lng: 138.8524464 },
    osmUrl: "https://www.openstreetmap.org/way/631522240",
    officialWebsite: "http://www.haruna.or.jp/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Haruna_Shrine_panorama_April_2010.jpg/1280px-Haruna_Shrine_panorama_April_2010.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Haruna_Shrine_panorama_April_2010.jpg",
    imageLicense: "CC BY 2.0",
    imageAttribution: "TANAKA Juuyoh (田中十洋)",
    description:
      "Haruna Shrine is a mountain shrine in Takasaki's Haruna area, a separate cultural destination from the lake and the wider mountain landscape.",
    descriptionJa:
      "榛名神社は高崎市の榛名山エリアにある山岳信仰の神社で、湖や山域とは別に訪ねられる文化の目的地です。",
    highlights: [
      "Mountain shrine in Takasaki's Haruna area",
      "Distinct cultural visit beside the lake landscape",
      "Official shrine source retained for current visitor guidance",
    ],
    highlightsJa: [
      "高崎の榛名山エリアにある神社",
      "湖の景観とは別に訪ねられる文化の見どころ",
      "最新の参拝案内は公式神社情報を確認",
    ],
    tags: ["Shrines", "Culture", "History", "Takasaki", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    relatedDestinationIds: ["lake-haruna"],
    duration: { min: 1, max: 3 },
    categories: ["Culture", "History"],
    source: source(
      "http://www.haruna.or.jp/",
      "The Haruna Shrine official site identifies the named shrine and its visitor information.",
    ),
  },
  {
    id: "lake-okushima",
    name: "Lake Okushima",
    nameJa: "奥四万湖",
    aliases: ["Okushima Lake", "Shima Blue"],
    municipalityId: "Gunma:nakanojo",
    kind: "lake",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.7014659, lng: 138.7838334 },
    osmUrl: "https://www.openstreetmap.org/relation/10994358",
    officialWebsite: "https://www.visit-gunma.jp/en/spots/lake-okushima/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Shimagawa_Dam_lake.jpg/1280px-Shimagawa_Dam_lake.jpg",
    imagePage: "https://commons.wikimedia.org/wiki/File:Shimagawa_Dam_lake.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Qurren",
    description:
      "Lake Okushima is the deep, blue-water lake at the back of the Shima area, a separate nature destination from the Shima Onsen town record.",
    descriptionJa:
      "奥四万湖は四万地域の奥にある青い湖で、四万温泉街のレコードとは別に発見できる自然の目的地です。",
    highlights: [
      "Blue-water lake in the deeper Shima area",
      "Separate from the Shima Onsen town aggregate",
      "Concrete nature choice for a Nakanojo outing",
    ],
    highlightsJa: [
      "四万地域の奥にある青い湖",
      "四万温泉街の広域レコードとは別の見どころ",
      "中之条の自然旅で選べる具体的な目的地",
    ],
    tags: ["Lakes", "Nature", "Shima", "Nakanojo", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    relatedDestinationIds: ["gunma-shima-onsen"],
    duration: { min: 2, max: 4 },
    categories: ["Nature", "Lakes"],
    source: source(
      "https://www.visit-gunma.jp/en/spots/lake-okushima/",
      "Gunma Official Tourist Guide identifies Lake Okushima as a named spot in Nakanojo's Shima area.",
    ),
  },
  {
    id: "fukiware-falls",
    name: "Fukiware Falls",
    nameJa: "吹割の滝",
    aliases: ["Fukiware-no-taki", "Fukiware Waterfall"],
    municipalityId: "Gunma:numata",
    kind: "waterfall",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.7020468, lng: 139.2070519 },
    osmUrl: "https://www.openstreetmap.org/node/3174003692",
    officialWebsite: "https://www.numata-kankou.jp/fukiwarenotaki/index.html",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Fukiware_Falls_01.jpg/1280px-Fukiware_Falls_01.jpg",
    imagePage: "https://commons.wikimedia.org/wiki/File:Fukiware_Falls_01.jpg",
    imageLicense: "CC BY 3.0",
    imageAttribution: "Σ64",
    description:
      "Fukiware Falls is a named waterfall destination in Numata, where the river cuts through a distinctive rocky gorge.",
    descriptionJa:
      "吹割の滝は沼田市にある独立した滝の名所で、川が特徴的な岩の渓谷を刻む景観を楽しめます。",
    highlights: [
      "Named waterfall destination in Numata",
      "Rock-cut river gorge landscape",
      "Independent nature stop rather than an onsen-town mention",
    ],
    highlightsJa: [
      "沼田市にある滝の名所",
      "岩を刻む川と渓谷の景観",
      "温泉街の記述に埋もれない独立した自然の見どころ",
    ],
    tags: ["Waterfalls", "Nature", "Numata", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 3 },
    categories: ["Nature", "Waterfalls"],
    source: source(
      "https://www.numata-kankou.jp/fukiwarenotaki/index.html",
      "Numata Tourism Association identifies Fukiware Falls as the named waterfall attraction.",
    ),
  },
  {
    id: "usui-third-bridge",
    name: "Usui Third Bridge",
    nameJa: "碓氷第三橋梁（めがね橋）",
    aliases: ["Usui Megane Bridge", "Megane-bashi", "碓氷第三橋梁"],
    municipalityId: "Gunma:annaka",
    kind: "bridge",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.3579734, lng: 138.6982767 },
    osmUrl: "https://www.openstreetmap.org/node/5729776197",
    officialWebsite: "https://www.city.annaka.lg.jp/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Detail_of_Usui_Bridge_No._3_01.jpg/1280px-Detail_of_Usui_Bridge_No._3_01.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Detail_of_Usui_Bridge_No._3_01.jpg",
    imageLicense: "CC BY 2.0",
    imageAttribution: "TANAKA Juuyoh (田中十洋)",
    description:
      "Usui Third Bridge, widely called Megane Bridge, is Annaka's historic brick railway viaduct and a discrete heritage destination.",
    descriptionJa:
      "碓氷第三橋梁（めがね橋）は、安中市に残る歴史的な煉瓦造りの鉄道橋で、独立した近代化遺産の目的地です。",
    highlights: [
      "Historic brick railway viaduct in Annaka",
      "Qualified identity avoids collision with other Megane Bridges",
      "Discrete railway-heritage stop",
    ],
    highlightsJa: [
      "安中市に残る歴史的な煉瓦造りの鉄道橋",
      "他地域の眼鏡橋と区別できる正式な呼称",
      "鉄道遺産として訪ねられる見どころ",
    ],
    tags: ["History", "Architecture", "Railway", "Annaka", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 2 },
    categories: ["History", "Architecture"],
    source: source(
      "https://www.city.annaka.lg.jp/",
      "Annaka City identifies Usui Third Bridge / Megane Bridge as the historic railway bridge attraction.",
    ),
  },
  {
    id: "shorinzan-darumaji",
    name: "Shorinzan Darumaji Temple",
    nameJa: "少林山達磨寺",
    aliases: ["Shorinzan Daruma-ji", "Daruma Temple"],
    municipalityId: "Gunma:takasaki",
    kind: "temple",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.3299532, lng: 138.9573645 },
    osmUrl: "https://www.openstreetmap.org/way/256525207",
    officialWebsite: "https://www.daruma.or.jp/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/%E5%B0%91%E6%9E%97%E5%B1%B1%E9%81%94%E7%A3%A8%E5%AF%BA%E9%9C%8A%E7%AC%A6%E5%A0%82.JPG/1280px-%E5%B0%91%E6%9E%97%E5%B1%B1%E9%81%94%E7%A3%A8%E5%AF%BA%E9%9C%8A%E7%AC%A6%E5%A0%82.JPG",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:%E5%B0%91%E6%9E%97%E5%B1%B1%E9%81%94%E7%A3%A8%E5%AF%BA%E9%9C%8A%E7%AC%A6%E5%A0%82.JPG",
    imageLicense: "CC BY 3.0",
    imageAttribution: "小池 隆",
    description:
      "Shorinzan Darumaji Temple is a distinct Takasaki cultural destination associated with the city's daruma tradition and temple grounds.",
    descriptionJa:
      "少林山達磨寺は、高崎のだるま文化と結び付く寺院で、独立した文化観光の目的地です。",
    highlights: [
      "Distinct temple destination in Takasaki",
      "Daruma cultural association",
      "Separate cultural depth from the broader Gunma landscape records",
    ],
    highlightsJa: [
      "高崎にある独立した寺院の目的地",
      "だるま文化と結び付く見どころ",
      "群馬の広域自然レコードとは別の文化の深度",
    ],
    tags: ["Temples", "Culture", "Daruma", "Takasaki", "Gunma Travel"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 3 },
    categories: ["Culture", "History"],
    source: source(
      "https://www.daruma.or.jp/",
      "The Shorinzan Darumaji official temple site identifies the temple and its daruma tradition.",
    ),
  },
  {
    id: "onioshidashi-park",
    name: "Onioshidashi Park",
    nameJa: "鬼押出し園",
    aliases: ["Onioshidashi-en", "Onioshidashi Volcanic Park"],
    municipalityId: "Gunma:tsumagoi",
    kind: "park",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.4438285, lng: 138.5324873 },
    osmUrl: "https://www.openstreetmap.org/way/627048947",
    officialWebsite:
      "https://www.princehotels.co.jp/amuse/onioshidashi/history/",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/%E9%AC%BC%E6%8A%BC%E5%87%BA%E3%81%97%E5%9C%92_-_panoramio.jpg/1280px-%E9%AC%BC%E6%8A%BC%E5%87%BA%E3%81%97%E5%9C%92_-_panoramio.jpg",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:%E9%AC%BC%E6%8A%BC%E5%87%BA%E3%81%97%E5%9C%92_-_panoramio.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "SpringField1967",
    description:
      "Onioshidashi Park is a volcanic-rock landscape in Tsumagoi, operated as a named park and separate from the Kusatsu onsen-town aggregate.",
    descriptionJa:
      "鬼押出し園は嬬恋村にある火山岩の景観公園で、草津温泉街の広域レコードとは別に訪ねられる施設です。",
    highlights: [
      "Volcanic-rock landscape in Tsumagoi",
      "Named operator-run park destination",
      "Distinct from Kusatsu Town and Kusatsu Onsen records",
    ],
    highlightsJa: [
      "嬬恋村に広がる火山岩の景観",
      "運営事業者が案内する独立した公園施設",
      "草津町や草津温泉のレコードとは別の目的地",
    ],
    tags: ["Nature", "Parks", "Volcano", "Tsumagoi", "Gunma Travel"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
    categories: ["Nature", "Parks"],
    source: source(
      "https://www.princehotels.co.jp/amuse/onioshidashi/history/",
      "Prince Hotels & Resorts identifies Onioshidashi Park as a named volcanic-landscape park.",
    ),
  },
];

const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];
const originalIds = new Set(catalog.map((destination) => destination.id));
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const names = new Map<string, string>();
const normalize = (value: string) =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[\s\-_・·]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
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

const applyRelated = (destination: Destination, ids: string[]): void => {
  const existing = destination.relationships?.relatedDestinationIds ?? [];
  const merged = [...new Set([...existing, ...ids])];
  destination.relationships = {
    ...(destination.relationships ?? {}),
    relatedDestinationIds: merged,
  };
};

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
    if (existing.kind !== candidate.kind) existing.kind = candidate.kind;
    if (JSON.stringify(existing.ratings) !== JSON.stringify(neutralRatings)) {
      existing.ratings = neutralRatings;
    }
    if (Array.isArray(existing.coordinates)) {
      const [lat, lng] = existing.coordinates as unknown as number[];
      existing.coordinates = { lat, lng };
    }
    if (
      existing.coordinates.lat !== candidate.coordinates.lat ||
      existing.coordinates.lng !== candidate.coordinates.lng
    ) {
      existing.coordinates = candidate.coordinates;
    }
    if (existing.heroImage !== candidate.image) {
      existing.heroImage = candidate.image;
      existing.imageMetadata = {
        source: "wikimedia-commons",
        sourceUrl: candidate.imagePage,
        license: candidate.imageLicense,
        attribution: candidate.imageAttribution,
        verifiedAt: REVIEW_DATE,
      };
    }
    existing.content = {
      ...(existing.content ?? {}),
      en: {
        ...(existing.content?.en ?? {}),
        name: candidate.name,
        reservation: unknownReservation,
        parking: unknownParking,
      },
      ja: {
        ...(existing.content?.ja ?? {}),
        name: candidate.nameJa,
        reservation: unknownReservationJa,
        parking: unknownParkingJa,
      },
    };
    existing.reservation = unknownReservation;
    existing.reservationJa = unknownReservationJa;
    existing.parking = unknownParking;
    existing.parkingJa = unknownParkingJa;
    if (existing.recommendedVisitHours === undefined) {
      existing.recommendedVisitHours = candidate.duration;
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
    if (candidate.relatedDestinationIds)
      applyRelated(existing, candidate.relatedDestinationIds);
    continue;
  }
  if (candidate.parentDestinationId) {
    const parent = byId.get(candidate.parentDestinationId);
    if (!parent || parent.role !== "hub") {
      throw new Error(`${candidate.id}: parent must be an existing hub`);
    }
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
  const fieldSources: Record<string, SourceReference[]> = {
    coordinates: [coordinatesSource(candidate.osmUrl)],
    officialWebsite: [candidate.source],
    description: [candidate.source],
    highlights: [candidate.source],
    content: [candidate.source],
    admission: [candidate.source],
    localTransport: [candidate.source],
    relationships: [candidate.source],
    recommendedVisitHours: [candidate.source],
  };
  const record: Destination = {
    id: candidate.id,
    officialWebsite: candidate.officialWebsite,
    officialWebsiteRequirement: "required",
    name: candidate.name,
    nameJa: candidate.nameJa,
    aliases: candidate.aliases,
    municipalityId: candidate.municipalityId,
    prefecture: "Gunma",
    region: "Kanto",
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
        notes:
          "Confirm current access, facility rules, and any seasonal restrictions on the official source before travel.",
        reservation: unknownReservation,
        parking: unknownParking,
      },
      ja: {
        name: candidate.nameJa,
        description: candidate.descriptionJa,
        highlights: candidate.highlightsJa,
        notes:
          "訪問前に公式情報で最新のアクセス、施設案内、季節による制限を確認してください。",
        reservation: unknownReservationJa,
        parking: unknownParkingJa,
      },
    },
    heroImage: candidate.image,
    imageMetadata: {
      source: "wikimedia-commons",
      sourceUrl: candidate.imagePage,
      license: candidate.imageLicense,
      attribution: candidate.imageAttribution,
      verifiedAt: REVIEW_DATE,
    },
    transportOptions: {},
    localAccessModes: candidate.localAccessModes,
    localAccessUnestimated: true,
    transportMetadata: {
      method: "unknown",
      modelVersion: "kai-258-transport-v1",
      confidence: "unknown",
      basis:
        "Official source confirms destination access modes, but no origin-specific route estimate was promoted.",
    },
    localTransport: makeLocalTransport(),
    admission: makeAdmission(candidate),
    recommendedVisitHours: candidate.duration,
    durationMetadata: {
      method: "model",
      modelVersion: "kai-258-editorial-duration-v1",
      confidence: "low",
      basis:
        "Bounded planning band for this attraction's on-site scope; not an origin-to-destination travel duration or opening-hours claim.",
    },
    ratings: neutralRatings,
    ratingsSchemaVersion: 2,
    ratingMetadata: { rubricVersion: 2, method: "manual", confidence: "low" },
    seasonMetadata: unknownSeason,
    budgetMetadata: unknownBudget,
    crowdMetadata: unknownCrowd,
    reservation: unknownReservation,
    reservationJa: unknownReservationJa,
    parking: unknownParking,
    parkingJa: unknownParkingJa,
    notes:
      "The destination record is evidence-backed; current prices, opening hours, seasonality, and route times are intentionally not inferred.",
    notesJa:
      "公式情報で確認できる範囲を記録しています。料金、営業時間、季節性、所要時間は推測していません。",
    status: "verified",
    travelEstimate: { confidence: "beta" },
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
      sources: [candidate.source, coordinatesSource(candidate.osmUrl)],
      fieldSources,
    },
    addedAt: REVIEW_DATE,
  };
  catalog.push(record);
  byId.set(record.id, record);
  for (const value of [record.name, record.nameJa, ...record.aliases]) {
    const key = normalize(value);
    if (key.length >= 6) names.set(key, record.id);
  }
}

fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `KAI-258B: Gunma catalogue now has ${catalog.filter((d) => d.prefecture === "Gunma").length} records; added ${candidates.filter((candidate) => !originalIds.has(candidate.id)).length} requested P0 records.`,
);
