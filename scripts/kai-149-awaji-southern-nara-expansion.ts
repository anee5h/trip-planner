/**
 * KAI-149 — verified Awaji Island and southern Nara depth.
 *
 * Adds one canonical proposition each for Izanagi Shrine (Awaji City), Awaji
 * Farm Park England Hill (Minamiawaji), Sumoto Castle (Sumoto), Dorogawa
 * Onsen Town, and Mitarai Valley (both Tenkawa). It does not split shrine
 * grounds, park zones, or a valley trail into synthetic cards.
 *
 * New records deliberately use transportOptions: {} + localAccessUnestimated:
 * true + transportMetadata.method "unestimated". The official sources verify
 * local access and destination identity, not complete origin-aware corridors.
 * recommendedVisitHours is destination time only.
 *
 * Usage: tsx scripts/kai-149-awaji-southern-nara-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
import type { Destination, SourceReference } from "../src/shared/types/destination";

const INDEX_PATH = path.join(process.cwd(), "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-23";
const CHANGE_SUMMARY = "Added current, source-verified Awaji Island and southern Nara destination depth coverage.";

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
  transportZoneId: "awaji-island" | "mainland-honshu";
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

const awajiGuide = "https://www.awajishima-kanko.jp/en/spot/";
const awajiAccess = "https://www.awajishima-kanko.jp/en/access/";
const izanagiHome = "https://izanagi-jingu.jp/";
const englandHome = "https://www.england-hill.com/en/";
const englandAccess = "https://www.england-hill.com/access/";
const sumotoGuide = "https://www.japan.travel/en/spot/1047/";
const naraDorogawa = "https://www.visitnara.jp/destinations/area/dorogawa/";
const naraMitarai = "https://www.visitnara.jp/destinations/destination/mitarai-valley/";
const naraAccess = "https://www.japan.travel/en/spot/995/";
const nijigenHome = "https://nijigennomori.com/en/";
const nijigenPrice = "https://nijigennomori.com/en/price/";
const nijigenAccess = "https://nijigennomori.com/en/access/";
const nijigenAugust = "https://nijigennomori.com/en/2026/08/21/nijigennomori-185/";

const records: DestinationWithLocation[] = [
  makeRecord({
    id: "izanagi-jingu-awaji",
    name: "Izanagi Shrine",
    nameJa: "伊弉諾神宮",
    aliases: ["Izanagi Jingū", "Awaji Ichinomiya"],
    officialWebsite: izanagiHome,
    officialWebsiteRequirement: "recommended",
    kind: "shrine",
    importance: "major",
    role: "standalone",
    municipalityId: "Hyogo:awaji",
    transportZoneId: "awaji-island",
    prefecture: "Hyogo",
    coordinates: { lat: 34.4657, lng: 134.8537 },
    location: { address: "740 Taga, Awaji, Hyogo 656-1521, Japan" },
    categories: ["Culture", "History", "Nature"],
    tags: ["History", "Heritage", "Nature", "Traditional", "Hyogo Travel"],
    description: "Awaji's principal shrine dedicated to Izanagi and Izanami, surrounded by evergreen grounds and known for its sacred husband-and-wife camphor trees. It is one shrine outing, not a split mythology card.",
    descriptionJa: "伊弉諾大神と伊弉冉大神をまつる淡路島の一宮で、常緑の境内と夫婦大楠で知られる神社です。神話の要素を分割せず、一つの参拝体験として扱います。",
    highlights: ["Izanagi and Izanami worship", "Sacred husband-and-wife camphor trees", "Quiet evergreen shrine grounds"],
    highlightsJa: ["伊弉諾大神・伊弉冉大神の祭祀", "夫婦大楠", "常緑樹に囲まれた境内"],
    notes: "The official Awaji tourism guide identifies this as the oldest shrine associated with the creation myth and places it in Awaji City. Observe shrine etiquette and current worship guidance.",
    notesJa: "淡路島観光協会の公式案内は、国生み神話に結びつく古社として淡路市の社を紹介しています。参拝作法と公式案内をご確認ください。",
    localAccessModes: ["bus", "car"],
    sources: [source("official", izanagiHome, "Izanagi Shrine official site"), source("tourism_board", awajiGuide, "Official Awaji Island Tourism Guide — Izanagi Shrine identity and municipality"), source("tourism_board", awajiAccess, "Official Awaji Island access guidance (bridge/highway bus and island buses)")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Izanagi-jingu_Haiden.JPG/1280px-Izanagi-jingu_Haiden.JPG",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Izanagi-jingu_Haiden.JPG",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "ChiefHira; Wikimedia Commons File:Izanagi-jingu Haiden.JPG",
    duration: { min: 1, max: 1.5, confidence: "medium", basis: "Manual destination-only estimate for shrine grounds and camphor-tree visit; excludes Awaji Island approach." },
    reservation: "Ordinary worship is not represented as a timed-ticket attraction; check the shrine's current worship and event guidance.",
    parking: "Check the shrine's current parking guidance; Awaji Island tourism advises highway bus and car access because there are no trains on the island.",
  }),
  makeRecord({
    id: "awaji-farm-park-england-hill",
    name: "Awaji Farm Park England Hill",
    nameJa: "淡路ファームパーク イングランドの丘",
    aliases: ["England Hill", "Awaji England Hill"],
    officialWebsite: englandHome,
    officialWebsiteRequirement: "required",
    kind: "park",
    importance: "major",
    role: "standalone",
    municipalityId: "Hyogo:minamiawaji",
    transportZoneId: "awaji-island",
    prefecture: "Hyogo",
    coordinates: { lat: 34.2629, lng: 134.7562 },
    location: { address: "1401 Yagiyogiue, Minamiawaji, Hyogo 656-0443, Japan" },
    categories: ["Nature", "Family", "Food"],
    tags: ["Family", "Animals", "Nature", "Education", "Hyogo Travel"],
    description: "A large agricultural family park in southern Awaji with animals, seasonal flowers, harvest and craft experiences, playgrounds, food, and a Peter Rabbit garden. These internal activities remain one destination card.",
    descriptionJa: "淡路島南部の農業公園で、動物、季節の花、収穫・手作り体験、遊具、飲食、ピーターラビットの花畑などを一つの家族向け体験として楽しめます。",
    highlights: ["Animal encounters and koalas", "Seasonal flower and Peter Rabbit garden", "Harvest, craft, and playground experiences"],
    highlightsJa: ["動物・コアラとのふれあい", "季節の花とピーターラビットの花畑", "収穫・手作り体験と遊具"],
    notes: "The current official site lists 9:30–17:30 opening hours with last entry at 17:00 and current seasonal events; verify the latest calendar before visiting.",
    notesJa: "公式サイトは現在9:30〜17:30（最終入園17:00）と案内し、季節イベントを更新しています。訪問前に最新カレンダーをご確認ください。",
    localAccessModes: ["bus", "car"],
    sources: [source("official", englandHome, "Awaji Farm Park England Hill current official site and opening notice"), source("official", englandAccess, "Awaji Farm Park England Hill official access"), source("tourism_board", awajiAccess, "Official Awaji Island access guidance")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Awaji_England_Hill%2C_Hyogo%2C_Japan_%2826554568782%29.jpg/1280px-Awaji_England_Hill%2C_Hyogo%2C_Japan_%2826554568782%29.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Awaji_England_Hill,_Hyogo,_Japan_(26554568782).jpg",
    imageLicense: "CC BY-SA 2.0",
    imageAttribution: "pelican from Tokyo, Japan; Wikimedia Commons",
    duration: { min: 3, max: 5, confidence: "medium", basis: "Manual destination-only estimate for a meaningful park visit across animals, flowers, and one experience; excludes island travel." },
    reservation: "General admission and optional activities follow current operator rules; web tickets and event reservations may vary by date.",
    parking: "Use the official park access and parking guidance; highway bus/car access is appropriate for this rural island park.",
  }),
  makeRecord({
    id: "sumoto-castle-awaji",
    name: "Sumoto Castle",
    nameJa: "洲本城",
    aliases: ["Sumoto Castle Ruins", "Mikumayama Castle"],
    officialWebsite: "https://www.awajishima-kanko.jp/en/spot/",
    officialWebsiteRequirement: "recommended",
    kind: "castle",
    importance: "major",
    role: "standalone",
    municipalityId: "Hyogo:sumoto",
    transportZoneId: "awaji-island",
    prefecture: "Hyogo",
    coordinates: { lat: 34.3398, lng: 134.9022 },
    location: { address: "1272 Orodani, Sumoto, Hyogo 656-0023, Japan" },
    categories: ["History", "Nature", "Photography"],
    tags: ["Castle", "History", "Scenic", "Heritage", "Hyogo Travel"],
    description: "A mountain castle ruin on Mt. Mikuma overlooking Sumoto and the Kii Channel, with a reconstructed stone-and-timber tower and panoramic island views. The ruins and viewpoint form one outing.",
    descriptionJa: "洲本市街と紀淡海峡を望む三熊山の山城跡で、復元天守台と石垣、島の眺望を一つの散策体験として楽しめます。",
    highlights: ["Mikumayama castle ruins", "Reconstructed tower and stonework", "Panoramic Sumoto and Kii Channel views"],
    highlightsJa: ["三熊山の城跡", "復元天守・石垣", "洲本市街と紀淡海峡の眺望"],
    notes: "The official Awaji tourism guide places the castle on the summit of Mt. Mikuma at about 133 m. The official regional guide says Awaji has no trains; access requires island bus or car from the bridge corridor.",
    notesJa: "淡路島観光協会は標高約133mの三熊山山頂にある城跡として紹介しています。淡路島には鉄道がないため、橋を渡った後は島内バスまたは車でアクセスします。",
    localAccessModes: ["bus", "car"],
    sources: [source("tourism_board", awajiGuide, "Official Awaji Island Tourism Guide — Sumoto Castle identity"), source("government", sumotoGuide, "Japan National Tourism Organization official destination guide — Sumoto Castle access context"), source("tourism_board", awajiAccess, "Official Awaji Island access and public-bus guidance")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Sumoto_Castle_Awaji_Island_Japan03n.jpg/1280px-Sumoto_Castle_Awaji_Island_Japan03n.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Sumoto_Castle_Awaji_Island_Japan03n.jpg",
    imageLicense: "CC BY 2.5",
    imageAttribution: "663highland; Wikimedia Commons",
    duration: { min: 1.5, max: 2.5, confidence: "medium", basis: "Manual destination-only estimate for the castle ruins, climb, and viewpoint; excludes island approach." },
    reservation: "The open ruins are not represented as a timed-ticket attraction; verify any current tower, event, or access restrictions.",
    parking: "Use current Sumoto/official tourism parking guidance. Do not infer a train arrival: Awaji Island has no railway service.",
  }),
  makeRecord({
    id: "dorogawa-onsen-tenkawa",
    name: "Dorogawa Onsen Town",
    nameJa: "洞川温泉街",
    aliases: ["Dorogawa Onsen", "Dorogawa Hot Spring Town"],
    officialWebsite: naraDorogawa,
    officialWebsiteRequirement: "recommended",
    kind: "onsen",
    importance: "major",
    role: "standalone",
    municipalityId: "Nara:tenkawa",
    transportZoneId: "mainland-honshu",
    prefecture: "Nara",
    coordinates: { lat: 34.2702, lng: 135.8818 },
    location: { address: "Dorogawa, Tenkawa, Yoshino-gun, Nara, Japan" },
    categories: ["Culture", "Nature", "Food"],
    tags: ["Onsen", "Historic Street", "Nature", "Relaxation", "Nara Travel"],
    description: "A traditional hot-spring town deep in southern Nara's sacred mountains, with ryokan, mountain spring water, local food, and a spiritual Shugendo atmosphere. The town is one slow-travel proposition rather than separate lodging cards.",
    descriptionJa: "南奈良の聖なる山々に抱かれた温泉街で、旅館、山の湧水、郷土料理、修験道の精神文化を感じるそぞろ歩きを一つの滞在型体験として楽しめます。",
    highlights: ["Traditional onsen-town streetscape", "Ryokan bathing and local cuisine", "Mt. Omine spiritual mountain setting"],
    highlightsJa: ["伝統的な温泉街の町並み", "旅館の入浴と郷土料理", "大峯山の修験道文化"],
    notes: "Official Nara guidance describes Dorogawa as a sacred mountain retreat and recommends combining it with nearby valley and temple experiences. Respect local residents and check facility-specific bathing rules.",
    notesJa: "奈良県の公式観光案内は洞川を山岳信仰の温泉地として紹介し、周辺の渓谷や寺院との組み合わせを案内しています。施設ごとの入浴案内をご確認ください。",
    localAccessModes: ["train", "bus", "car"],
    sources: [source("tourism_board", naraDorogawa, "Official Nara Travel Guide — Dorogawa Onsen area identity"), source("government", naraAccess, "Japan National Tourism Organization official Dorogawa access guide"), source("tourism_board", "https://www.visitnara.jp/venues/A00885/", "Official Nara Travel Guide — Dorogawa Onsen townscape")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/2016-09-09_Dorogawa-Onsen%2C_Tenkawa%2C_Nara%2C%E6%B4%9E%E5%B7%9D%E6%B8%A9%E6%B3%89_DSCF0430.jpg/1280px-2016-09-09_Dorogawa-Onsen%2C_Tenkawa%2C_Nara%2C%E6%B4%9E%E5%B7%9D%E6%B8%A9%E6%B3%89_DSCF0430.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:2016-09-09_Dorogawa-Onsen,_Tenkawa,_Nara,%E6%B4%9E%E5%B7%9D%E6%B8%A9%E6%B3%89_DSCF0430.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "松岡明芳; Wikimedia Commons",
    duration: { min: 2, max: 4, confidence: "medium", basis: "Manual destination-only estimate for town stroll and one onsen/visitor experience; excludes the long Kintetsu/bus approach and overnight stay." },
    reservation: "Ryokan stays and bathing facilities have their own rules and availability; check the current official lodging/facility guidance.",
    parking: "Use designated town parking and current local signs. Public transport requires Kintetsu to Shimoichiguchi followed by the local bus corridor.",
  }),
  makeRecord({
    id: "mitarai-valley-tenkawa",
    name: "Mitarai Valley",
    nameJa: "みたらい渓谷",
    aliases: ["Mitarai Gorge", "Mitarai Ravine"],
    officialWebsite: naraMitarai,
    officialWebsiteRequirement: "recommended",
    kind: "nature",
    importance: "major",
    role: "standalone",
    municipalityId: "Nara:tenkawa",
    transportZoneId: "mainland-honshu",
    prefecture: "Nara",
    coordinates: { lat: 34.2548, lng: 135.8732 },
    location: { address: "Tenkawa, Yoshino-gun, Nara, Japan" },
    categories: ["Nature", "Photography", "Active"],
    tags: ["Nature", "Scenic", "Active Hiking", "Waterfall", "Nara Travel"],
    description: "A mountain valley of hiking trails, waterfalls, emerald river pools, and a suspension bridge in Tenkawa. It is a single hiking anchor; individual falls and bridges are highlights, not duplicate cards.",
    descriptionJa: "天川村の渓谷に遊歩道、滝、エメラルド色の渓流、吊り橋が連なる山歩きの拠点です。個々の滝や橋は見どころとして扱い、カードを分割しません。",
    highlights: ["Waterfalls and emerald river pools", "Suspension bridge and mountain trail", "Autumn foliage and summer mountain air"],
    highlightsJa: ["滝とエメラルド色の渓流", "吊り橋と山道", "秋の紅葉と夏の山の涼しさ"],
    notes: "Official Nara guidance says the valley takes a little under three hours from Nara City and is best combined with an overnight stay in nearby Dorogawa Onsen. Trail conditions and seasonal closures must be checked.",
    notesJa: "奈良県の公式観光案内は奈良市から約3時間弱かかり、洞川温泉との宿泊組み合わせを勧めています。登山道の状態や季節閉鎖をご確認ください。",
    localAccessModes: ["train", "bus", "car"],
    sources: [source("tourism_board", naraMitarai, "Official Nara Travel Guide — Mitarai Valley trails, waterfalls, and access"), source("government", naraAccess, "Japan National Tourism Organization official southern-Nara access context"), source("tourism_board", naraDorogawa, "Official Nara Travel Guide — Dorogawa area pairing")],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Mitaraikeikoku201811b.jpg/1280px-Mitaraikeikoku201811b.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Mitaraikeikoku201811b.jpg",
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "8-hachiro; Wikimedia Commons",
    duration: { min: 3, max: 5, confidence: "medium", basis: "Manual destination-only estimate for a meaningful valley hike; excludes Nara/Shimoichiguchi bus travel and is not a promise of a full trail completion time." },
    reservation: "No general timed admission is represented; check current trail, weather, and local safety guidance before hiking.",
    parking: "Use designated local parking only. Public transport uses Kintetsu to Shimoichiguchi and the local bus corridor; do not infer a train-to-trailhead journey.",
  }),
  makeRecord({
    id: "nijigen-no-mori-awaji",
    name: "Nijigen no Mori",
    nameJa: "ニジゲンノモリ",
    aliases: ["Nijigen no Mori Theme Park", "Awaji Island anime park"],
    officialWebsite: nijigenHome,
    officialWebsiteRequirement: "required",
    kind: "park",
    importance: "major",
    role: "standalone",
    municipalityId: "Hyogo:awaji",
    transportZoneId: "awaji-island",
    prefecture: "Hyogo",
    coordinates: { lat: 34.5804495, lng: 135.0131136 },
    location: { address: "2425-2 Kusumoto, Awaji, Hyogo 656-2301, Japan" },
    categories: ["Nature", "Culture", "Family"],
    tags: ["Family", "Anime", "Adventure", "Nature", "Hyogo Travel"],
    description: "A park-level anime, manga, and game experience inside Hyogo Prefectural Awajishima Park. Nijigen no Mori is one selectable destination; Dragon Quest Island, Godzilla Interception Operation, NARUTO & BORUTO Shinobi-Zato, Crayon Shin-chan Adventure Park, Attack on Titan, and other franchise areas are structured highlights rather than duplicate destination cards.",
    descriptionJa: "兵庫県立淡路島公園内でアニメ・漫画・ゲームを自然の中で体験できるパークです。ニジゲンノモリを一つの選択可能な目的地として扱い、ドラゴンクエスト アイランド、ゴジラ迎撃作戦、NARUTO＆BORUTO忍里、クレヨンしんちゃんアドベンチャーパーク、進撃の巨人などは重複カードではなく構造化した見どころとして扱います。",
    highlights: ["Park-wide anime, manga, and game experiences", "Multiple current attraction areas in one Awajishima Park setting", "Seasonal and current 2026 programs, including Attack on Titan"],
    highlightsJa: ["アニメ・漫画・ゲームを横断するパーク体験", "淡路島公園内の複数アトラクションエリア", "進撃の巨人など2026年の現行プログラムと季節イベント"],
    notes: "The official August 2026 business notice confirms current operating hours and attraction schedules. The park is open within the prefectural park, while each attraction requires its own paid ticket; attraction areas are not separate catalogue cards.",
    notesJa: "公式の2026年8月営業案内で現在の営業時間とアトラクション日程を確認できます。県立公園内への入園は無料ですが、各アトラクションには有料チケットが必要です。アトラクションエリアは別カードに分割しません。",
    localAccessModes: ["bus", "car"],
    sources: [
      source("official", nijigenHome, "Nijigen no Mori official home — park identity, current attraction list, and 2026 programs"),
      source("official", nijigenAugust, "Nijigen no Mori official August 2026 business notice — current operating hours and schedules"),
      source("official", nijigenPrice, "Nijigen no Mori official prices and business information — free park admission, paid attractions, advance and same-day tickets"),
      source("official", nijigenAccess, "Nijigen no Mori official access — address, Awajishima Park location, car/highway-bus access, and official map coordinates"),
    ],
    heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Awaji_land_park_Hyogopref_forest_zone.JPG/1280px-Awaji_land_park_Hyogopref_forest_zone.JPG",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Awaji_land_park_Hyogopref_forest_zone.JPG",
    imageLicense: "CC BY-SA 3.0",
    imageAttribution: "Mti",
    duration: { min: 4, max: 8, confidence: "medium", basis: "Manual destination-only estimate for selecting and experiencing multiple attraction areas in the park; excludes the Awaji Island approach and does not imply every franchise area must be visited." },
    reservation: "Admission to the prefectural park is free, but each attraction requires a paid ticket. The official site supports advance tickets with time slots and same-day tickets at attraction reception; availability and attraction schedules vary by date, so check the official ticket page before visiting.",
    parking: "The official access and pricing pages list free parking lots near different attraction areas, including Lots E and F; the nearest lot varies by selected attraction. Highway bus and car access are supported; do not infer a rail station on Awaji Island.",
  }),
];

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as DestinationWithLocation[];
const byId = new Map(index.map((item) => [item.id, item]));
for (const record of records) {
  const existing = byId.get(record.id);
  if (existing) {
    if (existing.name !== record.name || existing.nameJa !== record.nameJa) throw new Error(`KAI-149 identity conflict: ${record.id}`);
    byId.set(record.id, {
      ...existing,
      transportZoneId: record.transportZoneId,
      ...(record.id === "nijigen-no-mori-awaji"
        ? { heroImage: record.heroImage, imageMetadata: record.imageMetadata }
        : {}),
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
console.log(`KAI-149 processed ${records.length} canonical records; total=${next.length}`);
