/**
 * KAI-148 — verified Shikoku interior depth.
 *
 * Adds one canonical proposition each for Kotohira-gu, Uchiko-za, the Besshi
 * Copper Mine Memorial Museum, Nakatsu Gorge, and the Shikoku Karst. It does
 * not split a single shrine, theater, gorge, or plateau into synthetic cards.
 *
 * New records deliberately use transportOptions: {} + localAccessUnestimated:
 * true + transportMetadata.method "unestimated". The official sources verify
 * local access and destination identity, not complete origin-aware corridors.
 * recommendedVisitHours is destination time only.
 *
 * Usage: tsx scripts/kai-148-shikoku-interior-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
import type { Destination, SourceReference } from "../src/shared/types/destination";

const INDEX_PATH = path.join(process.cwd(), "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-23";
const CHANGE_SUMMARY = "Added current, source-verified Shikoku interior destination depth coverage.";

type DestinationWithLocation = Destination & {
  location?: { address: string; latitude?: number; longitude?: number };
};

type RegionSpec = {
  id: string;
  name: string;
  nameJa: string;
  aliases?: string[];
  officialWebsite: string;
  officialWebsiteRequirement: "required" | "recommended";
  kind: NonNullable<Destination["kind"]>;
  importance: NonNullable<Destination["importance"]>;
  role?: "poi" | "standalone";
  municipalityId: string;
  transportZoneId: "mainland-shikoku";
  prefecture: string;
  coordinates: { lat: number; lng: number };
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
  heroImage: string;
  imageSourceUrl: string;
  imageLicense: string;
  imageAttribution: string;
  duration: { min: number; max: number; confidence: "high" | "medium"; basis: string };
  reservation: string;
  parking: string;
  parentDestinationId?: string;
};

const source = (
  type: SourceReference["type"],
  url: string,
  title: string,
): SourceReference => ({ type, url, title, accessedAt: REVIEW_DATE });

const unknownBudget = {
  method: "unknown" as const,
  modelVersion: "budget-model-v1",
  confidence: "unknown" as const,
  basis: "Admission, food, and access costs are volatile or destination-dependent; no numeric budget is published here.",
};
const unknownCrowd = {
  method: "unknown" as const,
  modelVersion: "crowd-model-v1",
  confidence: "unknown" as const,
  basis: "No stable crowd vector was verified; neutralized rather than inferred from attraction type.",
};
const unknownSeason = {
  method: "unknown" as const,
  modelVersion: "season-model-v1",
  confidence: "unknown" as const,
  basis: "Official sources provide identity, hours, reservation, or route context but not a defensible four-season suitability vector; unknown is preserved.",
};
const neutralRatings: Destination["ratings"] = {
  overall: 5, couple: 5, summer: 5, winter: 5, rain: 5,
  food: 5, photography: 5, relaxation: 5, value: 5, uniqueness: 5,
};
const durationMethodologySource = source(
  "calculated",
  "https://github.com/aneesh-patil/trip-planner/blob/main/scripts/models/duration-model-v1.ts",
  "Meguruto KAI-89 duration-model-v1 kind-band estimate",
);

const makeRecord = (spec: RegionSpec): DestinationWithLocation => {
  const primarySource = spec.sources[0];
  const accessSource = spec.sources.find((item) => /access|route|transport|walk|parking|bus/i.test(item.title)) ?? primarySource;
  const fieldSources: Record<string, SourceReference[]> = {
    name: [primarySource], nameJa: [primarySource], status: [primarySource],
    municipalityId: [primarySource], localAccessModes: [accessSource], relationships: [primarySource],
    coordinates: [accessSource], recommendedVisitHours: [durationMethodologySource],
  };
  if (spec.location) fieldSources.location = [primarySource];
  return {
    id: spec.id,
    officialWebsite: spec.officialWebsite,
    officialWebsiteRequirement: spec.officialWebsiteRequirement,
    name: spec.name,
    nameJa: spec.nameJa,
    aliases: spec.aliases,
    municipalityId: spec.municipalityId,
    transportZoneId: spec.transportZoneId,
    prefecture: spec.prefecture,
    region: "Kansai",
    kind: spec.kind,
    role: spec.role ?? "standalone",
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
        openingHours: "Hours and closures vary by date; check the official visitor guidance before visiting.",
      },
      ja: {
        name: spec.nameJa,
        description: spec.descriptionJa,
        highlights: spec.highlightsJa,
        notes: spec.notesJa,
        reservation: "予約・入場条件は変更される場合があるため、訪問前に公式案内をご確認ください。",
        parking: "駐車場・アクセス条件は変更される場合があるため、訪問前に公式案内をご確認ください。",
        openingHours: "開館時間・休館日は変更される場合があるため、訪問前に公式案内をご確認ください。",
      },
    },
    heroImage: spec.heroImage,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: spec.imageLicense,
      attribution: spec.imageAttribution,
      sourceUrl: spec.imageSourceUrl,
    },
    transportOptions: {},
    localAccessModes: spec.localAccessModes,
    localAccessUnestimated: true,
    transportMetadata: {
      method: "unestimated",
      confidence: "unknown",
      basis: "Official sources verify local access but not a complete origin-to-destination duration. Recommendation availability must come from canonical origin-aware routes, never from static transportOptions numbers.",
    },
    recommendedVisitHours: { min: spec.duration.min, max: spec.duration.max },
    durationMetadata: { method: "manual", confidence: spec.duration.confidence, basis: spec.duration.basis },
    ratings: neutralRatings,
    ratingsSchemaVersion: 2,
    ratingMetadata: { rubricVersion: 2, method: "manual", confidence: "low" },
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
    relationships: spec.parentDestinationId ? { parentDestinationId: spec.parentDestinationId } : {},
    editorial: {
      lifecycle: "approved",
      freshness: "current",
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      reviewedBy: "Meguruto editorial",
      changeSummary: CHANGE_SUMMARY,
      sources: spec.sources,
      fieldSources,
      changes: [{
        changedAt: REVIEW_DATE,
        changedBy: "Meguruto editorial",
        summary: "Added one canonical destination after current operator, government, and official tourism verification.",
        method: "manual",
      }],
    },
    addedAt: REVIEW_DATE,
  } as unknown as DestinationWithLocation;
};

const kotohiraHome = "https://www.konpira.or.jp/";
const kotohiraGuide = "https://www.konpira.or.jp/articles_2023/20231130_KOTOHIRA-Gu_Official-Guide_in_English/article.html";
const uchikoHome = "https://uchikogenic.com/en/visit/uchikoza/";
const besshiHome = "https://www.sumitomo.gr.jp/english/history/related/besshidouzan/";
const besshiGuide = "https://visit.city.niihama.ehime.jp/spot/68?loc=en";
const nakatsuHome = "https://visitkochijapan.com/en/see-and-do/10014";
const karstGuide = "https://okushimanto.jp/en/special/content1";

const records: DestinationWithLocation[] = [
  makeRecord({
    id: "kotohira-gu-kagawa",
    name: "Kotohira-gu Shrine",
    nameJa: "金刀比羅宮",
    aliases: ["Kompira-san", "Kotohiragu"],
    officialWebsite: kotohiraHome,
    officialWebsiteRequirement: "required",
    kind: "shrine",
    importance: "major",
    role: "standalone",
    municipalityId: "Kagawa:kotohira",
    transportZoneId: "mainland-shikoku",
    prefecture: "Kagawa",
    coordinates: { lat: 34.1847, lng: 133.8174 },
    location: { address: "892-1 Kotohira, Nakatado-gun, Kagawa 766-8501, Japan" },
    categories: ["Shrine", "Culture", "History"],
    tags: ["Kagawa", "Kotohira", "Shrine", "Historic", "Mountain"],
    description: "A major Shikoku pilgrimage shrine on the eastern slope of Mount Zozu, reached by a long stone-step approach and layered with worship halls, historic architecture, art, and sea-guardian traditions.",
    descriptionJa: "象頭山の東斜面に鎮座し、長い石段の参道、社殿、歴史的建築、芸術、海の守護神信仰が重なる四国を代表する巡礼社です。",
    highlights: ["785-step approach to the main shrine", "Historic shrine architecture and art", "Kompira-san pilgrimage tradition"],
    highlightsJa: ["本宮まで続く785段の石段", "歴史ある社殿と美術", "こんぴら参りの巡礼文化"],
    notes: "The official guide describes the shrine’s sea-guardian tradition, 785 stone steps to the Gohon-gu, secondary shrines, and art spaces. The climb is the destination experience; intercity travel is excluded from the visit duration.",
    notesJa: "公式案内が示す海の守護神信仰、本宮までの785段、摂社や美術空間を一つの境内体験として扱います。訪問時間に四国内の移動時間は含めません。",
    localAccessModes: ["train", "bus", "car"],
    sources: [source("official", kotohiraHome, "KOTOHIRA-Gu official site"), source("official", kotohiraGuide, "KOTOHIRA-Gu Official Guide in English")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Kotohira-gu_shrine_%2852005829370%29.jpg/1280px-Kotohira-gu_shrine_%2852005829370%29.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Kotohira-gu_shrine_(52005829370).jpg",
    imageLicense: "CC BY 2.0",
    imageAttribution: "Raita Futo",
    duration: { min: 2, max: 4, confidence: "medium", basis: "Destination-only estimate for the stone-step climb, worship halls, secondary shrines, and art spaces described by the official guide; excludes intercity travel." },
    reservation: "Ordinary worship does not require a timed reservation; check current shrine events and special-opening guidance.",
    parking: "Use current official shrine and Kotohira visitor guidance for parking and the station-to-approach walk.",
  }),
  makeRecord({
    id: "uchiko-za-ehime",
    name: "Uchiko-za Theater",
    nameJa: "内子座",
    aliases: ["Uchiko-za Kabuki Theater"],
    officialWebsite: uchikoHome,
    officialWebsiteRequirement: "required",
    kind: "historic",
    importance: "major",
    role: "standalone",
    municipalityId: "Ehime:uchiko",
    transportZoneId: "mainland-shikoku",
    prefecture: "Ehime",
    coordinates: { lat: 33.5484, lng: 132.6521 },
    location: { address: "2102 Uchiko, Uchiko-cho, Kita-gun, Ehime, Japan" },
    categories: ["History", "Culture", "Theater"],
    tags: ["Ehime", "Uchiko", "Historic", "Culture", "Theater"],
    description: "A preserved Taisho-era kabuki-style theater in Uchiko with a revolving stage, hanamichi runway, box seating, backstage spaces, and a community-preservation story.",
    descriptionJa: "内子の町並みに残る大正期の芝居小屋で、回り舞台、花道、升席、奈落などの舞台機構と地域による保存の歩みを体感できます。",
    highlights: ["Taisho-era wooden theater", "Revolving stage and hanamichi", "Backstage and under-stage spaces"],
    highlightsJa: ["大正期の木造芝居小屋", "回り舞台と花道", "舞台裏と奈落の空間"],
    notes: "The current official visitor page states that the theater is undergoing large-scale renovation and seismic reinforcement, with the main theater closed for approximately four years while backstage areas may remain visitable. Check current status before travel.",
    notesJa: "現行の公式案内では大規模改修・耐震補強のため本体が約4年間休館中で、舞台裏を見学できる場合があります。訪問前に最新状況をご確認ください。",
    localAccessModes: ["train", "bus", "car"],
    sources: [source("official", uchikoHome, "Uchikogenic / Uchiko Tourism Association — Uchiko-za current visitor status")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Uchiko-za_20170611.jpg/1280px-Uchiko-za_20170611.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Uchiko-za_20170611.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Suicasmo",
    duration: { min: 1, max: 1.5, confidence: "medium", basis: "Destination-only estimate for the theater and backstage visit; current renovation restrictions may shorten or change the visit." },
    reservation: "Performances and special tours may require advance reservation; current renovation access is subject to official guidance.",
    parking: "The official visitor page lists limited free parking; verify availability before arrival.",
  }),
  makeRecord({
    id: "besshi-copper-mine-memorial-museum",
    name: "Besshi Copper Mine Memorial Museum",
    nameJa: "別子銅山記念館",
    aliases: ["Besshi Copper Mine Museum"],
    officialWebsite: besshiHome,
    officialWebsiteRequirement: "required",
    kind: "museum",
    importance: "major",
    role: "standalone",
    municipalityId: "Ehime:niihama",
    transportZoneId: "mainland-shikoku",
    prefecture: "Ehime",
    coordinates: { lat: 33.8701, lng: 133.2884 },
    location: { address: "654-3 Kannonbara, Niihama, Ehime, Japan" },
    categories: ["Museum", "History", "Industry"],
    tags: ["Ehime", "Niihama", "Museum", "History", "Mining"],
    description: "A memorial museum on the grounds of Oyamazumi Shrine that presents the 283-year history of the Besshi Copper Mine through geology, mining technology, documents, models, and working life.",
    descriptionJa: "大山積神社の境内にあり、283年続いた別子銅山の歴史を地質、採鉱技術、史料、模型、鉱山労働者の暮らしから伝える記念館です。",
    highlights: ["283 years of mining history", "Geology and mining-technique exhibits", "Mine railway and historical models"],
    highlightsJa: ["283年に及ぶ銅山史", "地質と採鉱技術の展示", "鉱山鉄道や歴史模型"],
    notes: "Sumitomo’s official history page describes five exhibition corners and the museum’s setting at Oyamazumi Shrine. The museum visit is distinct from the higher-altitude Tonaru mine ruins and does not include that separate excursion.",
    notesJa: "住友グループの公式史料が示す5つの展示コーナーと大山積神社境内の立地を一つの博物館体験として扱います。東平の遺構訪問は別の行程で、所要時間に含めません。",
    localAccessModes: ["bus", "car"],
    sources: [source("operator", besshiHome, "Sumitomo Group — Besshi Copper Mine Memorial Museum"), source("tourism_board", besshiGuide, "Niihama official tourism listing")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Besshi_dozan_kinenkan_museum.jpg/1280px-Besshi_dozan_kinenkan_museum.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Besshi_dozan_kinenkan_museum.jpg",
    imageLicense: "Public domain",
    imageAttribution: "As6022014",
    duration: { min: 1, max: 2, confidence: "medium", basis: "Destination-only museum estimate based on the five official exhibition areas; excludes any separate mountain-mine excursion." },
    reservation: "Check current opening and group-visit guidance with the operator.",
    parking: "Use current museum and Niihama tourism access guidance for parking and local road conditions.",
  }),
  makeRecord({
    id: "nakatsu-gorge-kochi",
    name: "Nakatsu Gorge",
    nameJa: "中津渓谷",
    aliases: ["Nakatsu Keikoku", "Niyodo Blue Nakatsu Gorge"],
    officialWebsite: nakatsuHome,
    officialWebsiteRequirement: "required",
    kind: "nature",
    importance: "major",
    role: "standalone",
    municipalityId: "Kochi:niyodogawa",
    transportZoneId: "mainland-shikoku",
    prefecture: "Kochi",
    coordinates: { lat: 33.5752, lng: 133.0142 },
    location: { address: "Nakatsu, Niyodogawa, Agawa-gun, Kochi, Japan" },
    categories: ["Nature", "Outdoors", "Waterfall"],
    tags: ["Kochi", "Niyodogawa", "Valley", "Waterfall", "Nature", "Hiking"],
    description: "A short gorge trek along the blue-green Nakatsu River, with a 2.3-kilometre riverside path, stepping stones, small bridges, boulders, moss, and the 20-metre Uryu no Taki waterfall.",
    descriptionJa: "青く澄んだ中津川に沿う約2.3kmの遊歩道で、飛び石や小橋、巨岩と苔、20mの雨竜の滝を巡る仁淀ブルーの渓谷です。",
    highlights: ["2.3-kilometre riverside trail", "Uryu no Taki waterfall", "Niyodo Blue pools and mossy boulders"],
    highlightsJa: ["約2.3kmの川沿い遊歩道", "雨竜の滝", "仁淀ブルーの淵と苔むした巨岩"],
    notes: "The official Kochi tourism page describes a gentle 2.3-kilometre path with stepping stones, bridges, and the 20-metre waterfall. Weather, water levels, and trail conditions can change; check local guidance before walking.",
    notesJa: "高知県観光の公式案内が示す飛び石・小橋を含む約2.3kmの道と20mの滝を一つの散策体験として扱います。天候・水位・遊歩道状況は訪問前にご確認ください。",
    localAccessModes: ["bus", "car"],
    sources: [source("tourism_board", nakatsuHome, "VISIT KOCHI JAPAN — Nakatsu Gorge")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/%E7%A7%8B%E3%81%AE%E4%B8%AD%E6%B4%A5%E6%B8%93%E8%B0%B7_%28Nakatsu_Gorge_in_autumn%29_23_Nov%2C_2014_-_panoramio.jpg/1280px-%E7%A7%8B%E3%81%AE%E4%B8%AD%E6%B4%A5%E6%B8%93%E8%B0%B7_%28Nakatsu_Gorge_in_autumn%29_23_Nov%2C_2014_-_panoramio.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:%E7%A7%8B%E3%81%AE%E4%B8%AD%E6%B4%A5%E6%B8%93%E8%B0%B7_(Nakatsu_Gorge_in_autumn)_23_Nov,_2014_-_panoramio.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Hiroaki Kaneko",
    duration: { min: 1.5, max: 3, confidence: "medium", basis: "Destination-only estimate for the official 2.3-kilometre riverside walk and waterfall stops; excludes Kochi-to-gorge travel." },
    reservation: "No ordinary trail reservation is represented; check current local conditions and any seasonal restrictions.",
    parking: "Use the current official Kochi tourism access guidance and observe local parking restrictions.",
  }),
  makeRecord({
    id: "shikoku-karst-kochi",
    name: "Shikoku Karst",
    nameJa: "四国カルスト",
    aliases: ["Tengu Highlands", "Shikoku Karst Natural Park"],
    officialWebsite: karstGuide,
    officialWebsiteRequirement: "required",
    kind: "nature",
    importance: "major",
    role: "standalone",
    municipalityId: "Kochi:tsuno",
    transportZoneId: "mainland-shikoku",
    prefecture: "Kochi",
    coordinates: { lat: 33.4699, lng: 133.0151 },
    location: { address: "Tengu Highlands, Tsuno, Takaoka-gun, Kochi, Japan" },
    categories: ["Nature", "Outdoors", "Mountain"],
    tags: ["Kochi", "Tsuno", "Ehime", "Nature", "Mountain", "Scenic"],
    description: "A high limestone plateau spanning Tsuno and Yusuhara in Kochi and Ehime, with ridge-top grasslands, exposed karst, grazing landscapes, mountain views, and linked highland walks.",
    descriptionJa: "高知県津野町から愛媛県久万高原町・梼原町方面へ広がる石灰岩台地で、稜線の草原、カルスト地形、放牧風景、山岳展望、森林散策を楽しめます。",
    highlights: ["Ridge-top grasslands and limestone outcrops", "Tengu Highlands and highland viewpoints", "4.5-kilometre forest therapy road"],
    highlightsJa: ["稜線の草原と石灰岩の露頭", "天狗高原の展望", "約4.5kmの森林セラピーロード"],
    notes: "The official Oku Shimanto guide describes the karst as spanning Tsuno and Yusuhara in Kochi and Ehime, extending about 25 kilometres, and recommends a scenic drive. The card represents the landscape corridor rather than a fabricated single viewpoint; weather and seasonal road closures matter.",
    notesJa: "奥四万十の公式案内が示す高知・愛媛にまたがる約25kmのカルスト景観と天狗高原を一つの景観回廊として扱います。季節・天候による道路規制をご確認ください。",
    localAccessModes: ["car", "bus"],
    sources: [source("tourism_board", karstGuide, "Oku Shimanto official tourism — Shikoku Karst"), source("government", "https://www.japan.travel/en/spot/816/", "JNTO — Shikoku Karst")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Shikoku_Karst_2023-08-02_1706.jpg/1280px-Shikoku_Karst_2023-08-02_1706.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Shikoku_Karst_2023-08-02_1706.jpg",
    imageLicense: "CC0",
    imageAttribution: "Photos of Japan",
    duration: { min: 2, max: 4, confidence: "medium", basis: "Destination-only estimate for highland viewpoints, short walks, and a selected section of the 4.5-kilometre therapy road; excludes the intercity drive across the plateau." },
    reservation: "Ordinary landscape access does not require a reservation; guided therapy walks may require advance application according to official guidance.",
    parking: "Use marked highland parking only and check current road, weather, and seasonal closure notices.",
  }),
];

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as DestinationWithLocation[];
const byId = new Map(index.map((item) => [item.id, item]));
for (const record of records) {
  const existing = byId.get(record.id);
  if (existing) {
    if (existing.name !== record.name || existing.nameJa !== record.nameJa) throw new Error(`KAI-148 identity conflict: ${record.id}`);
    byId.set(record.id, {
      ...existing,
      transportZoneId: record.transportZoneId,
      editorial: existing.editorial
        ? { ...existing.editorial, changeSummary: CHANGE_SUMMARY }
        : existing.editorial,
    });
    continue;
  }
  byId.set(record.id, record);
}
const next = Array.from(byId.values());
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(next, null, 2)}\n`);
console.log(`KAI-148 processed ${records.length} canonical records; total=${next.length}`);
