/**
 * KAI-148 — Shikoku interior: Iya / Oboke–Koboke / Shimanto.
 *
 * Adds independently selectable visitor propositions for Iya-no-Kazurabashi,
 * the connected Oboke–Koboke gorge corridor, and the Shimanto River's
 * Yakatabune Nattoku experience. Nakatsu Gorge and Shikoku Karst remain as
 * coherent supporting interior records. Uchiko-za, Kotohira-gu, and Besshi
 * are removed from this ticket wave: Uchiko-za's main theater is currently
 * closed for renovation, while the other two do not serve the ticket's
 * Iya/Oboke-Koboke/Shimanto objective.
 *
 * New records deliberately use transportOptions: {} + localAccessUnestimated:
 * true + transportMetadata.method "unestimated". Official sources verify
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
const CHANGE_SUMMARY = "Re-centered KAI-148 on current Iya, Oboke–Koboke, and Shimanto interior depth.";

const REMOVED_IDS = new Set([
  "kotohira-gu-kagawa",
  "uchiko-za-ehime",
  "besshi-copper-mine-memorial-museum",
]);

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
  const accessSource = spec.sources.find((item) => /access|route|transport|walk|parking|bus|directions/i.test(item.title)) ?? primarySource;
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
    region: "Shikoku",
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
        summary: "Added or retained one canonical destination after current operator, government, and official tourism verification.",
        method: "manual",
      }],
    },
    addedAt: REVIEW_DATE,
  } as unknown as DestinationWithLocation;
};

const iyaKazurabashi = "https://miyoshi-tourism.jp/en/spot/46/";
const obokeKoboke = "https://miyoshi-tourism.jp/en/spot/53/";
const obokeCruise = "https://miyoshi-tourism.jp/en/spot/24284/";
const nakatsuHome = "https://visitkochijapan.com/en/see-and-do/10014";
const karstGuide = "https://okushimanto.jp/en/special/content1";
const shimantoNattoku = "https://visitkochijapan.com/en/activities/10152";

const records: DestinationWithLocation[] = [
  makeRecord({
    id: "iya-no-kazurabashi-tokushima",
    name: "Iya-no-Kazurabashi",
    nameJa: "祖谷のかずら橋",
    aliases: ["Iya Vine Bridge", "Kazurabashi Bridge", "Iya-no-Kazura-bashi"],
    officialWebsite: iyaKazurabashi,
    officialWebsiteRequirement: "required",
    kind: "bridge",
    importance: "major",
    role: "standalone",
    municipalityId: "Tokushima:miyoshi",
    transportZoneId: "mainland-shikoku",
    prefecture: "Tokushima",
    coordinates: { lat: 33.8854986, lng: 133.8360303 },
    location: { address: "162-2 Zentoku, Nishi-Iyayamamura, Miyoshi, Tokushima, Japan" },
    categories: ["Nature", "Outdoors", "Culture"],
    tags: ["Tokushima", "Miyoshi", "Iya", "Bridge", "Nature", "Hiking"],
    description: "A 45-metre vine suspension bridge over the Iya River and the independently selectable signature visitor experience of the remote Iya Valley, with the Biwa Waterfall and illuminated night view nearby.",
    descriptionJa: "祖谷川に架かる全長45mのかずら橋で、秘境・祖谷を代表する独立した訪問体験です。近くの琵琶の滝や夜間ライトアップも楽しめます。",
    highlights: ["45-metre vine suspension bridge", "National Important Tangible Folk Cultural Property", "Biwa Waterfall and evening illumination nearby"],
    highlightsJa: ["全長45mのかずら橋", "国指定重要有形民俗文化財", "近くの琵琶の滝と夜間ライトアップ"],
    notes: "Miyoshi City's current tourism page gives seasonal hours, a 550-yen adult admission, a five-minute walk from Kazurabashi Yumebutai parking, and bus access from JR Oboke Station. Heavy rain warnings can cause temporary closure; the bridge is the canonical card, not a duplicate generic Iya Valley record.",
    notesJa: "三好市公式観光案内の季節別営業時間、一般大人550円、かずら橋夢舞台駐車場から徒歩約5分、JR大歩危駅からのバスアクセスに基づきます。大雨警報時は一時閉鎖の可能性があります。祖谷全域とは別の橋体験として扱います。",
    localAccessModes: ["bus", "car"],
    sources: [source("tourism_board", iyaKazurabashi, "Miyoshi City official tourism — Iya-no-Kazurabashi")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Iya_Kazurabashi-4.jpg/1280px-Iya_Kazurabashi-4.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Iya_Kazurabashi-4.jpg",
    imageLicense: "CC BY 2.0",
    imageAttribution: "ume-y",
    duration: { min: 1, max: 2, confidence: "medium", basis: "Destination-only estimate for crossing the bridge, the nearby Biwa Waterfall, and the official site experience; excludes the remote intercity journey." },
    reservation: "No reservation is required for ordinary bridge admission; pay at the ticket counter. Check severe-weather closure notices before departure.",
    parking: "Kazurabashi Yumebutai municipal parking has paid spaces; the official page lists a five-minute walk and no parking reservations.",
  }),
  makeRecord({
    id: "oboke-koboke-gorges-tokushima",
    name: "Oboke–Koboke Gorges",
    nameJa: "大歩危・小歩危峡",
    aliases: ["Oboke Gorge", "Koboke Gorge", "Oboke-kyo & Koboke-kyo"],
    officialWebsite: obokeKoboke,
    officialWebsiteRequirement: "required",
    kind: "nature",
    importance: "major",
    role: "standalone",
    municipalityId: "Tokushima:miyoshi",
    transportZoneId: "mainland-shikoku",
    prefecture: "Tokushima",
    coordinates: { lat: 33.8765375, lng: 133.7672057 },
    location: { address: "Yamashirocho Shigemi–Uenami, Miyoshi, Tokushima, Japan" },
    categories: ["Nature", "Outdoors", "Scenic"],
    tags: ["Tokushima", "Miyoshi", "Oboke", "Koboke", "Gorge", "River", "Scenic"],
    description: "A connected Yoshino River gorge corridor where Oboke's dramatic schist formations and Koboke's downstream rock scenery form one selectable interior landscape proposition; the official pleasure cruise is a structured highlight, not a duplicate card.",
    descriptionJa: "吉野川が刻んだ大歩危・小歩危の渓谷回廊で、大歩危の結晶片岩の岩壁と下流の小歩危の景観を一つの訪問体験として扱います。公式遊覧船は独立カードではなく構造化ハイライトです。",
    highlights: ["Oboke's natural-monument schist formations", "Koboke Gorge three kilometres downstream", "Optional 30-minute Yoshino River pleasure cruise"],
    highlightsJa: ["天然記念物の結晶片岩による大歩危の岩壁", "約3km下流の小歩危峡", "任意で楽しめる約30分の吉野川遊覧船"],
    notes: "The official Miyoshi tourism site describes Oboke and Koboke as one river-shaped geological landscape, with Koboke about three kilometres downstream. JR Oboke Station is the practical rail anchor; road access and the cruise terminal cover the wider corridor. Intercity time is excluded from the visit duration.",
    notesJa: "三好市公式観光案内が示す大歩危・小歩危の一体的な地質景観と、約3km下流の小歩危を一つの回廊として扱います。JR大歩危駅が鉄道の基点で、周辺道路と遊覧船乗り場を含めます。四国内の移動時間は訪問時間に含めません。",
    localAccessModes: ["train", "bus", "car"],
    sources: [source("tourism_board", obokeKoboke, "Miyoshi City official tourism — Oboke-kyo & Koboke-kyo"), source("tourism_board", obokeCruise, "Miyoshi City official tourism — Oboke Gorge Pleasure Cruise")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Oboke_gorge_pleasure_boat_2106_August_13.B.jpg/1280px-Oboke_gorge_pleasure_boat_2106_August_13.B.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Oboke_gorge_pleasure_boat_2106_August_13.B.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "さかおり",
    duration: { min: 2, max: 4, confidence: "medium", basis: "Destination-only estimate for selected gorge viewpoints, riverside stops, and the optional 30-minute cruise; excludes the interior Shikoku journey." },
    reservation: "The official cruise page directs visitors to the terminal and publishes same-location boarding; weather or rising water can cancel departures. No blanket reservation claim is made for the gorge corridor.",
    parking: "The official cruise listing says parking is available; use marked parking and current river-condition guidance for the wider gorge corridor.",
  }),
  makeRecord({
    id: "shimanto-river-yakatabune-nattoku",
    name: "Shimanto River Yakatabune Nattoku",
    nameJa: "四万十川屋形船 なっとく",
    aliases: ["Yakatabune Nattoku", "Shimanto River Sightseeing Houseboat Nattoku"],
    officialWebsite: shimantoNattoku,
    officialWebsiteRequirement: "required",
    kind: "cruise",
    importance: "major",
    role: "standalone",
    municipalityId: "Kochi:shimanto",
    transportZoneId: "mainland-shikoku",
    prefecture: "Kochi",
    coordinates: { lat: 33.041728, lng: 132.841747 },
    location: { address: "846-1 Tadenokawa, Shimanto, Kochi Prefecture, Japan" },
    categories: ["Nature", "Outdoors", "River"],
    tags: ["Kochi", "Shimanto", "River", "Cruise", "Boat", "Scenic"],
    description: "A year-round 40–50-minute traditional houseboat cruise on an upper Shimanto River stretch, with clear water, mountain scenery, and views toward iconic chinkabashi submersible bridges.",
    descriptionJa: "清流と山並み、沈下橋の景観を眺めながら四万十川上流を屋形船で巡る、通年運航の40〜50分の具体的な訪問体験です。",
    highlights: ["40–50-minute traditional houseboat cruise", "Upper Shimanto scenery and chinkabashi views", "Optional river-food bento during the cruise"],
    highlightsJa: ["40〜50分の伝統的な屋形船", "四万十川上流と沈下橋の景観", "川の食材を使った弁当の追加注文"],
    notes: "VISIT KOCHI JAPAN identifies Nattoku as the furthest-upriver regular yakatabune service, with departures on the hour from 9:00 to 16:00 subject to weather. The official listing gives the Tadenokawa address, 2,200-yen adult fare, and weekend/holiday reservation recommendation. This concrete operator experience is used instead of an arbitrary point labelled only Shimanto River.",
    notesJa: "VISIT KOCHI JAPANが紹介する上流側の定期屋形船で、天候により変更されますが9時〜16時の毎時出航です。公式案内の田出ノ川住所、一般大人2200円、週末・繁忙期は予約推奨に基づきます。単なる四万十川の任意地点ではなく、具体的な事業者体験を登録します。",
    localAccessModes: ["bus", "car"],
    sources: [source("tourism_board", shimantoNattoku, "VISIT KOCHI JAPAN — Yakatabune Nattoku")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Shimanto_River_And_Iwama_Bridge_1.jpg/1280px-Shimanto_River_And_Iwama_Bridge_1.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Shimanto_River_And_Iwama_Bridge_1.jpg",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "京浜にけ",
    duration: { min: 1, max: 2, confidence: "high", basis: "The operator listing gives a 40–50-minute cruise; the destination-only range includes boarding and disembarkation but excludes the remote drive." },
    reservation: "Reservations are not required for ordinary cruises but are recommended on weekends and holidays; meal bento orders require reservation. Weather can change departures.",
    parking: "Parking is available at the Nattoku office on Route 441 beside the riverside jetty; follow the current operator guidance.",
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
const byId = new Map(index.filter((item) => !REMOVED_IDS.has(item.id)).map((item) => [item.id, item]));
for (const record of records) {
  const existing = byId.get(record.id);
  if (existing) {
    if (existing.name !== record.name || existing.nameJa !== record.nameJa) throw new Error(`KAI-148 identity conflict: ${record.id}`);
    byId.set(record.id, {
      ...existing,
      region: "Shikoku",
      prefecture: record.prefecture,
      transportZoneId: record.transportZoneId,
      editorial: existing.editorial
        ? { ...existing.editorial, changeSummary: CHANGE_SUMMARY, checkedAt: REVIEW_DATE, reviewedAt: REVIEW_DATE }
        : record.editorial,
    });
    continue;
  }
  byId.set(record.id, record);
}
const next = Array.from(byId.values());
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(next, null, 2)}\n`);
console.log(`KAI-148 removed ${REMOVED_IDS.size} out-of-objective records and processed ${records.length} canonical records; total=${next.length}`);
