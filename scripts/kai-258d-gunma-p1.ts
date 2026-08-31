/**
 * KAI-258D — Gunma secondary depth and hub-depth integrity.
 *
 * This tranche is limited to concrete secondary attractions. The candidate
 * matrix and KAI-177/KAI-258 overlap decisions live in qa/kai-258/pr4-report.md.
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

const commons = (file: string, license: string, attribution: string) => ({
  image: `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=1280`,
  imagePage: `https://commons.wikimedia.org/wiki/File:${file}`,
  imageLicense: license,
  imageAttribution: attribution,
});
const candidates: Candidate[] = [
  {
    id: "netsunoyu-kusatsu",
    name: "Netsunoyu",
    nameJa: "熱乃湯",
    aliases: ["Netsu no Yu", "Kusatsu Netsunoyu"],
    municipalityId: "Gunma:kusatsu",
    kind: "cultural",
    role: "poi",
    importance: "notable",
    coordinates: { lat: 36.6227061, lng: 138.5963224 },
    osmUrl: "https://www.openstreetmap.org/way/954629638",
    officialWebsite: "https://www.kusatsu-onsen.ne.jp/",
    officialTitle: "Kusatsu Onsen official website",
    ...commons("Kusatsu_Yumomi,_Gunma_03.jpg", "CC BY-SA 4.0", "663highland"),
    description:
      "Netsunoyu is Kusatsu's dedicated yumomi performance and culture venue, a concrete cultural attraction beyond the Yubatake landscape.",
    descriptionJa:
      "熱乃湯は、湯もみの実演と草津の湯文化を体験できる、湯畑とは別の具体的な文化施設です。",
    highlights: [
      "Yumomi performance venue",
      "Kusatsu bathing culture",
      "Distinct from Yubatake",
    ],
    highlightsJa: ["湯もみの実演会場", "草津の湯文化", "湯畑とは別の施設"],
    categories: ["Culture", "History", "Entertainment"],
    tags: ["Yumomi", "Culture", "Kusatsu", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 2 },
    parentDestinationId: "kusatsu-town",
  },
  {
    id: "doai-station",
    name: "Doai Station",
    nameJa: "土合駅",
    aliases: ["Doai Underground Station", "Doai Station Staircase"],
    municipalityId: "Gunma:minakami",
    kind: "station",
    role: "poi",
    importance: "major",
    coordinates: { lat: 36.830723, lng: 138.9664447 },
    osmUrl: "https://www.openstreetmap.org/node/13950762890",
    officialWebsite: "https://www.enjoy-minakami.jp/",
    officialTitle: "Minakami Tourism Association",
    ...commons("Gunma_Doai_station_xl.jpg", "CC BY 4.0", "Yasuyuki Kawano"),
    description:
      "Doai Station is Minakami's distinctive railway heritage stop, known for its deep underground platform and mountain gateway setting.",
    descriptionJa:
      "土合駅は、地下深くにあるホームと谷川岳への玄関口として知られる、みなかみの特徴的な鉄道遺産スポットです。",
    highlights: [
      "Deep underground platform",
      "Railway heritage",
      "Gateway to Tanigawa area",
    ],
    highlightsJa: ["地下深くのホーム", "鉄道遺産", "谷川岳周辺の玄関口"],
    categories: ["Railway", "History", "Architecture"],
    tags: ["Station", "Railway Heritage", "Minakami", "Gunma"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
    parentDestinationId: "minakami-town",
  },
  {
    id: "ikaho-stone-steps",
    name: "Ikaho Stone Steps",
    nameJa: "伊香保石段街",
    aliases: ["Ishidan-gai", "Ikaho Stone Stairway"],
    municipalityId: "Gunma:shibukawa",
    kind: "street",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.497658, lng: 138.9163875 },
    osmUrl: "https://www.openstreetmap.org/way/311066092",
    officialWebsite: "https://www.shibukawa-kanko.jp/",
    officialTitle: "Shibukawa Tourism Association",
    ...commons("Ikaho_Onsen_steps_from_above_2.jpg", "CC BY-SA 4.0", "NMaia"),
    description:
      "Ikaho's stone steps are the defining walk through the historic onsen town, with shops, shrines, and hot-spring culture along the ascent.",
    descriptionJa:
      "伊香保石段街は、店や社寺、温泉文化が連なる歴史ある温泉街の中心的な散策路です。",
    highlights: [
      "Historic onsen street",
      "Stone stairway walk",
      "Shops and shrine culture",
    ],
    highlightsJa: ["歴史ある温泉街", "石段の散策", "店と社寺の文化"],
    categories: ["History", "Shopping", "Hot Springs"],
    tags: ["Historic Street", "Onsen", "Ikaho", "Shibukawa"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 3 },
    relatedDestinationIds: ["gunma-ikaho-onsen"],
  },
  {
    id: "kajika-bridge-ikaho",
    name: "Kajika Bridge",
    nameJa: "河鹿橋",
    aliases: ["Kajika-bashi", "Ikaho Kajika Bridge"],
    municipalityId: "Gunma:shibukawa",
    kind: "bridge",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.4920773, lng: 138.9148687 },
    osmUrl: "https://www.openstreetmap.org/way/311066093",
    officialWebsite: "https://www.shibukawa-kanko.jp/",
    officialTitle: "Shibukawa Tourism Association",
    image:
      "https://images.ctfassets.net/2uxxifu5nzlv/img_0060_1/d4b55a5db5b0a1888a0850a126e35263/img_0060_Kajika_Bridge_1_PI.jpg?q=80",
    imagePage: "https://www.visit-gunma.jp/en/spots/kajika-bridge/",
    imageLicense: "Official tourism image; terms retained at source page",
    imageAttribution: "Gunma Official Tourist Guide",
    description:
      "Kajika Bridge is a compact wooded bridge walk above Ikaho's stone-step district, providing a separate nature-and-culture stop.",
    descriptionJa:
      "河鹿橋は、伊香保石段街の上方にある木立の中の橋で、温泉街とは別の自然・文化散策スポットです。",
    highlights: [
      "Wooded bridge setting",
      "Ikaho seasonal scenery",
      "Short walk from the onsen district",
    ],
    highlightsJa: ["木立の中の橋", "伊香保の季節景観", "温泉街からの散策"],
    categories: ["Nature", "Bridge", "Photography"],
    tags: ["Bridge", "Ikaho", "Shibukawa", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["ikaho-stone-steps"],
  },
  {
    id: "lake-shima",
    name: "Lake Shima",
    nameJa: "四万湖",
    aliases: ["Shima-ko", "Shima Lake"],
    municipalityId: "Gunma:nakanojo",
    kind: "lake",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.6271886, lng: 138.7939783 },
    osmUrl: "https://www.openstreetmap.org/way/72866741",
    officialWebsite: "https://nakanojo-kanko.jp/",
    officialTitle: "Nakanojo Tourism Association",
    image:
      "https://images.ctfassets.net/2uxxifu5nzlv/img_0055_1/4ae5438a6ddaa0d7d0ff2429a574759b/img_0055_Lake_Shima_1_PI.jpg?q=80",
    imagePage: "https://www.visit-gunma.jp/en/spots/lake-shima/",
    imageLicense: "Official tourism image; terms retained at source page",
    imageAttribution: "Gunma Official Tourist Guide",
    description:
      "Lake Shima is a blue-green reservoir in the Shima area, adding a concrete nature attraction alongside the existing Shima Onsen record.",
    descriptionJa:
      "四万湖は四万地域にある青緑色の湖で、既存の四万温泉レコードに具体的な自然の見どころを加えます。",
    highlights: [
      "Blue-green lake scenery",
      "Shima area nature",
      "Distinct from Shima Onsen",
    ],
    highlightsJa: [
      "青緑色の湖の景観",
      "四万地域の自然",
      "四万温泉とは別の自然スポット",
    ],
    categories: ["Nature", "Lake", "Photography"],
    tags: ["Lake", "Nature", "Shima", "Nakanojo"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 3 },
    relatedDestinationIds: ["gunma-shima-onsen", "lake-okushima"],
  },
  {
    id: "byakue-dai-kannon",
    name: "Byakue Dai-Kannon",
    nameJa: "白衣大観音",
    aliases: ["Takasaki Byakue Dai-Kannon", "Kannon of Takasaki"],
    municipalityId: "Gunma:takasaki",
    kind: "monument",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.3425, lng: 138.9539 },
    osmUrl: "https://www.openstreetmap.org/search?query=白衣大観音%20高崎",
    officialWebsite: "https://www.takasaki-kankoukyoukai.or.jp/",
    officialTitle: "Takasaki Tourism Association",
    image:
      "https://images.ctfassets.net/2uxxifu5nzlv/img_0176_1/2e1eb062f3b544b47288890a780942ed/img_0176_Byakue_Dai-Kannon_1_PI.jpg?q=80",
    imagePage: "https://www.visit-gunma.jp/en/spots/byakue-dai-kannon/",
    imageLicense: "Official tourism image; terms retained at source page",
    imageAttribution: "Gunma Official Tourist Guide",
    description:
      "Byakue Dai-Kannon is Takasaki's landmark Kannon monument on Kannonyama, giving Gunma a concrete urban-cultural anchor beyond its onsen and mountain sites.",
    descriptionJa:
      "白衣大観音は観音山に立つ高崎のランドマークで、群馬の温泉・山岳景観とは異なる都市文化の拠点です。",
    highlights: [
      "Landmark Kannon monument",
      "Takasaki city context",
      "Urban-cultural depth",
    ],
    highlightsJa: [
      "ランドマークの観音像",
      "高崎市の景観",
      "都市文化の見どころ",
    ],
    categories: ["Culture", "Monument", "City"],
    tags: ["Kannon", "Monument", "Takasaki", "Gunma"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 1, max: 2 },
  },
  {
    id: "mt-myogi",
    name: "Mount Myogi",
    nameJa: "妙義山",
    aliases: ["Myogisan", "Mount Myogi Rock Peaks"],
    municipalityId: "Gunma:tomioka",
    kind: "mountain",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.2998, lng: 138.7416 },
    osmUrl: "https://www.openstreetmap.org/search?query=妙義山%20群馬",
    officialWebsite: "https://www.tomioka-silk.jp/",
    officialTitle: "Tomioka Tourism Association",
    ...commons("Mt-myogi-in-summer.jpg", "CC BY-SA 3.0", "Jesse Fuller"),
    description:
      "Mount Myogi is a dramatic jagged mountain landscape in western Gunma, distinct from the broader Myogi-Arafune-Saku park shell.",
    descriptionJa:
      "妙義山は群馬西部の特徴的な岩峰景観で、広域の妙義荒船佐久高原レコードとは別に発見できます。",
    highlights: [
      "Jagged rock peaks",
      "Western Gunma landscape",
      "Distinct mountain identity",
    ],
    highlightsJa: ["特徴的な岩峰", "群馬西部の景観", "独立した山岳レコード"],
    categories: ["Nature", "Mountain", "Photography"],
    tags: ["Mountains", "Rock Formations", "Tomioka", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 3, max: 6 },
    relatedDestinationIds: ["myogi-arafune-saku-kogen", "myogi-shrine"],
  },
  {
    id: "myogi-shrine",
    name: "Myogi Shrine",
    nameJa: "妙義神社",
    aliases: ["Myogi-jinja", "Myogi Shrine Gate"],
    municipalityId: "Gunma:tomioka",
    kind: "shrine",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.2861, lng: 138.7399 },
    osmUrl: "https://www.openstreetmap.org/search?query=妙義神社%20群馬",
    officialWebsite: "https://www.tomioka-silk.jp/",
    officialTitle: "Tomioka Tourism Association",
    ...commons(
      "Myogi_Shrine_-_panoramio.jpg",
      "CC BY-SA 3.0",
      "Koichi Shibata",
    ),
    description:
      "Myogi Shrine is a historic mountain shrine at the foot of Mount Myogi, pairing naturally with the mountain while remaining a separate cultural destination.",
    descriptionJa:
      "妙義神社は妙義山麓にある歴史ある神社で、山とは関連しつつ独立した文化目的地として扱います。",
    highlights: [
      "Mountain shrine setting",
      "Historic architecture",
      "Related to Mount Myogi",
    ],
    highlightsJa: [
      "山麓の神社景観",
      "歴史的な建築",
      "妙義山と関連する文化スポット",
    ],
    categories: ["Shrine", "History", "Culture"],
    tags: ["Shrine", "Myogi", "Tomioka", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["mt-myogi"],
  },
  {
    id: "usui-pass-railway-heritage-park",
    name: "Usui Pass Railway Heritage Park",
    nameJa: "碓氷峠鉄道文化むら",
    aliases: [
      "Usui Toge Railway Culture Village",
      "Usui Railway Heritage Park",
    ],
    municipalityId: "Gunma:annaka",
    kind: "theme_park",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.3368121, lng: 138.7324976 },
    osmUrl: "https://www.openstreetmap.org/way/478865314",
    officialWebsite: "https://www.usuitouge.com/bunkamura/",
    officialTitle: "Usui Pass Railway Heritage Park official website",
    ...commons(
      "Usui_family-train_2023-11-04.jpg",
      "CC BY-SA 4.0",
      "快速踊り子",
    ),
    description:
      "The Usui Pass Railway Heritage Park preserves the railway history of the Usui route with rolling stock, exhibits, and a concrete heritage experience.",
    descriptionJa:
      "碓氷峠鉄道文化むらは、車両や展示を通じて碓氷線の鉄道史を伝える、具体的な鉄道遺産施設です。",
    highlights: [
      "Railway rolling stock",
      "Usui route history",
      "Hands-on heritage setting",
    ],
    highlightsJa: ["鉄道車両", "碓氷線の歴史", "体験できる遺産施設"],
    categories: ["Railway", "History", "Museum"],
    tags: ["Railway Heritage", "Museum", "Annaka", "Gunma"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 2, max: 4 },
  },
  {
    id: "oigami-onsen",
    name: "Oigami Onsen",
    nameJa: "老神温泉",
    aliases: ["Oigami Hot Spring", "Oigami Onsen Village"],
    municipalityId: "Gunma:numata",
    kind: "onsen",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.6758998, lng: 139.207887 },
    osmUrl: "https://www.openstreetmap.org/way/795286146",
    officialWebsite: "https://www.numata-kankou.jp/",
    officialTitle: "Numata Tourism Association",
    ...commons(
      "Oigami_Onsen_view_from_Nairaku_Bridge.jpg",
      "CC BY-SA 4.0",
      "Qurren",
    ),
    description:
      "Oigami Onsen is a historic hot-spring settlement in northern Gunma, adding a distinct stay-and-culture anchor beyond Kusatsu and Shima.",
    descriptionJa:
      "老神温泉は群馬北部の歴史ある温泉地で、草津・四万とは異なる滞在と文化の拠点です。",
    highlights: [
      "Northern Gunma onsen",
      "Valley settlement",
      "Distinct hot-spring identity",
    ],
    highlightsJa: ["群馬北部の温泉", "渓谷の温泉街", "独立した温泉地"],
    categories: ["Hot Springs", "Culture", "Nature"],
    tags: ["Onsen", "Numata", "Gunma", "Wellness"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
  },
  {
    id: "manza-onsen",
    name: "Manza Onsen",
    nameJa: "万座温泉",
    aliases: ["Manza Hot Spring", "Manza Onsen Resort"],
    municipalityId: "Gunma:tsumagoi",
    kind: "onsen",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.6400581, lng: 138.4999501 },
    osmUrl: "https://www.openstreetmap.org/way/1158882270",
    officialWebsite: "https://www.manzaonsen.gr.jp/",
    officialTitle: "Manza Onsen official website",
    ...commons(
      "Manza_Onsen_Tsumagoi_Gunma01bs4272.jpg",
      "CC BY-SA 4.0",
      "663highland",
    ),
    description:
      "Manza Onsen is a high-elevation hot-spring resort in Tsumagoi, giving the Gunma catalogue a distinct volcanic highland stay option.",
    descriptionJa:
      "万座温泉は嬬恋村の高地にある温泉地で、群馬に火山性高原の異なる滞在先を加えます。",
    highlights: [
      "High-elevation onsen",
      "Volcanic highland setting",
      "Tsumagoi stay anchor",
    ],
    highlightsJa: ["高地の温泉", "火山性高原の景観", "嬬恋村の滞在拠点"],
    categories: ["Hot Springs", "Nature", "Relaxation"],
    tags: ["Onsen", "Highlands", "Tsumagoi", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
  },
  {
    id: "mt-akagi",
    name: "Mount Akagi",
    nameJa: "赤城山",
    aliases: ["Akagiyama", "Mount Akagi Area"],
    municipalityId: "Gunma:maebashi",
    kind: "mountain",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.496769, lng: 139.1487481 },
    osmUrl: "https://www.openstreetmap.org/node/3891609594",
    officialWebsite: "https://www.maebashi-cvb.com/",
    officialTitle: "Maebashi Tourism Association",
    ...commons("Mt.Akagi.jpg", "CC BY-SA 3.0", "Batholith"),
    description:
      "Mount Akagi is a major Gunma massif with lakes, shrines, and highland recreation, adding a concrete nature hub to the city-facing side of the prefecture.",
    descriptionJa:
      "赤城山は湖や神社、高原レクリエーションを含む群馬の主要な山域で、県央の自然拠点として発見できます。",
    highlights: [
      "Gunma mountain massif",
      "Lake and shrine landscape",
      "Highland recreation",
    ],
    highlightsJa: ["群馬の主要山域", "湖と神社の景観", "高原レクリエーション"],
    categories: ["Nature", "Mountain", "Outdoor Activities"],
    tags: ["Mountains", "Highlands", "Maebashi", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 4, max: 8 },
    relatedDestinationIds: ["lake-onuma-akagi", "akagi-shrine"],
  },
  {
    id: "lake-onuma-akagi",
    name: "Lake Onuma",
    nameJa: "大沼（赤城山）",
    aliases: ["Akagi Onuma", "Onuma Pond Mount Akagi"],
    municipalityId: "Gunma:maebashi",
    kind: "lake",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.5605, lng: 139.1765 },
    osmUrl: "https://www.openstreetmap.org/search?query=赤城大沼",
    officialWebsite: "https://www.maebashi-cvb.com/",
    officialTitle: "Maebashi Tourism Association",
    ...commons(
      "Lakeside_path_near_Lake_Onuma_@_Mount_Akagi_area_(14018455990).jpg",
      "CC BY 2.0",
      "Guilhem Vellut",
    ),
    description:
      "Lake Onuma is Mount Akagi's central highland lake, a concrete nature destination distinct from the broader mountain record.",
    descriptionJa:
      "大沼は赤城山の中心的な高原湖で、赤城山全体とは別に訪ねられる具体的な自然目的地です。",
    highlights: ["Highland lake", "Mount Akagi scenery", "Lakeside nature"],
    highlightsJa: ["高原湖", "赤城山の景観", "湖畔の自然"],
    categories: ["Nature", "Lake", "Photography"],
    tags: ["Lake", "Akagi", "Maebashi", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 2, max: 4 },
    relatedDestinationIds: ["mt-akagi", "akagi-shrine"],
  },
  {
    id: "akagi-shrine",
    name: "Akagi Shrine",
    nameJa: "赤城神社",
    aliases: ["Akagi Jinja", "Akagi Shrine at Lake Onuma"],
    municipalityId: "Gunma:maebashi",
    kind: "shrine",
    role: "standalone",
    importance: "notable",
    coordinates: { lat: 36.5439, lng: 139.1838 },
    osmUrl: "https://www.openstreetmap.org/search?query=赤城神社%20大沼",
    officialWebsite: "https://www.akagijinja.jp/",
    officialTitle: "Akagi Shrine official website",
    ...commons(
      "Akagi_Shrine_@_Lake_Onuma_@_Trail_from_Mount_Kurobi_to_Lake_Onuma_@_Mount_Akagi_area_(14181943776).jpg",
      "CC BY 2.0",
      "Guilhem Vellut",
    ),
    description:
      "Akagi Shrine is the lakeside cultural anchor of Mount Akagi, related to the mountain and Lake Onuma but independently discoverable.",
    descriptionJa:
      "赤城神社は赤城山・大沼と関連する湖畔の文化拠点ですが、独立して訪ねられる神社です。",
    highlights: [
      "Lakeside shrine",
      "Akagi mountain worship",
      "Distinct cultural identity",
    ],
    highlightsJa: ["湖畔の神社", "赤城山信仰", "独立した文化的見どころ"],
    categories: ["Shrine", "Culture", "Nature"],
    tags: ["Shrine", "Akagi", "Lake Onuma", "Gunma"],
    localAccessModes: ["bus", "car"],
    duration: { min: 1, max: 2 },
    relatedDestinationIds: ["mt-akagi", "lake-onuma-akagi"],
  },
  {
    id: "watarase-keikoku-railway",
    name: "Watarase Keikoku Railway",
    nameJa: "わたらせ渓谷鐵道",
    aliases: ["Watarase Valley Railway", "Watarase Keikoku Line"],
    municipalityId: "Gunma:kiryu",
    kind: "cultural",
    role: "standalone",
    importance: "major",
    coordinates: { lat: 36.4113225, lng: 139.3326744 },
    osmUrl: "https://www.openstreetmap.org/node/3721641449",
    officialWebsite: "https://www.watetsu.com/",
    officialTitle: "Watarase Keikoku Railway official website",
    image:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Watarase_Keikoku_Railway_banner_Scenery_in_Midori_City.jpg?width=1280",
    imagePage:
      "https://commons.wikimedia.org/wiki/File:Watarase_Keikoku_Railway_banner_Scenery_in_Midori_City.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Raita Futo, cropped by Tmv",
    description:
      "Watarase Keikoku Railway follows the Watarase Valley between Kiryu and Tochigi, adding a concrete rail-and-landscape experience to Gunma's city depth.",
    descriptionJa:
      "わたらせ渓谷鐵道は桐生から栃木方面へ渓谷沿いを走り、群馬に鉄道と景観を組み合わせた具体的な都市周辺の体験を加えます。",
    highlights: [
      "Valley railway journey",
      "Kiryu-area rail heritage",
      "Landscape and city connection",
    ],
    highlightsJa: [
      "渓谷沿いの鉄道",
      "桐生周辺の鉄道遺産",
      "景観と都市をつなぐ体験",
    ],
    categories: ["Railway", "Nature", "History"],
    tags: ["Railway", "Watarase Valley", "Kiryu", "Gunma"],
    localAccessModes: ["train", "bus", "car"],
    duration: { min: 3, max: 8 },
  },
];

const deferredIds = new Set([
  "kajika-bridge-ikaho",
  "lake-shima",
  "byakue-dai-kannon",
  "netsunoyu-kusatsu",
]);
const catalog = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];
for (let index = catalog.length - 1; index >= 0; index -= 1) {
  if (deferredIds.has(catalog[index].id)) catalog.splice(index, 1);
}
const originalIds = new Set(catalog.map((destination) => destination.id));
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const normalize = (value: string) =>
  value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const names = new Map<string, string>();
for (const destination of catalog)
  for (const value of [
    destination.name,
    destination.nameJa,
    ...(destination.aliases ?? []),
  ]) {
    const key = normalize(value);
    if (key.length >= 6) names.set(key, destination.id);
  }
for (const candidate of candidates) {
  if (deferredIds.has(candidate.id)) continue;
  const duplicate = [candidate.name, candidate.nameJa, ...candidate.aliases]
    .map(normalize)
    .map((key) => names.get(key))
    .find((owner) => owner && owner !== candidate.id);
  if (duplicate)
    throw new Error(`${candidate.id}: duplicate identity with ${duplicate}`);
  const fieldSources: Record<string, SourceReference[]> = {
    name: [source(candidate.officialWebsite, candidate.officialTitle)],
    description: [source(candidate.officialWebsite, candidate.officialTitle)],
    highlights: [source(candidate.officialWebsite, candidate.officialTitle)],
    coordinates: [coordinateSource(candidate.osmUrl)],
    heroImage: [
      {
        type: "official",
        url: candidate.imagePage,
        title: `${candidate.name} image provenance`,
        accessedAt: REVIEW_DATE,
      },
    ],
    relationships: [source(candidate.officialWebsite, candidate.officialTitle)],
  };
  const existing = byId.get(candidate.id);
  if (existing) {
    if (
      existing.name !== candidate.name ||
      existing.nameJa !== candidate.nameJa ||
      existing.municipalityId !== candidate.municipalityId
    )
      throw new Error(
        `${candidate.id}: existing record has conflicting identity`,
      );
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
      existing.recommendedVisitHours = candidate.duration;
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
    prefecture: "Gunma",
    region: "Kanto",
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
    recommendedVisitHours: candidate.duration,
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
      sources: [
        source(candidate.officialWebsite, candidate.officialTitle),
        coordinateSource(candidate.osmUrl),
      ],
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
function imageMetadata(candidate: Candidate) {
  return {
    source: candidate.image.startsWith("https://images.")
      ? "official"
      : "wikimedia-commons",
    sourceUrl: candidate.imagePage,
    license: candidate.imageLicense,
    attribution: candidate.imageAttribution,
    verifiedAt: REVIEW_DATE,
  };
}
function applyRelated(destination: Destination, ids: string[]) {
  const current = destination.relationships?.relatedDestinationIds ?? [];
  destination.relationships = {
    ...(destination.relationships ?? {}),
    relatedDestinationIds: [...new Set([...current, ...ids])],
  };
}
const obuse = byId.get("obuse-town");
if (obuse?.editorial) {
  const { lifecycle: _lifecycle, ...editorial } = obuse.editorial;
  obuse.editorial = {
    ...editorial,
    changeSummary:
      "Retained the source-backed Obuse hub while preserving verified child relationships.",
  };
}
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `KAI-258D: Gunma catalogue now has ${catalog.filter((destination) => destination.prefecture === "Gunma").length} records; added ${candidates.filter((candidate) => !deferredIds.has(candidate.id) && !originalIds.has(candidate.id)).length} promoted secondary records.`,
);
