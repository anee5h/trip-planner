/**
 * KAI-161 — verified Uji, northern Kyoto, and Ine depth.
 *
 * Adds one canonical proposition each for Nintendo Museum (Uji), Miyama
 * Kayabuki no Sato (Nantan), and Maizuru Red Brick Park (Maizuru). It does
 * not split museum buildings, workshops, warehouses, or village sub-spots
 * into synthetic cards. Existing Ine Funaya is enriched in place with current
 * official visitor/sea-taxi guidance; no duplicate Ine cruise card is added.
 *
 * New records deliberately use transportOptions: {} + localAccessUnestimated:
 * true + transportMetadata.method "unestimated". The official sources verify
 * local access and destination identity, not complete origin-aware corridors.
 * recommendedVisitHours is destination time only.
 *
 * Usage: tsx scripts/kai-161-uji-northern-kyoto-expansion.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { TransportMode } from "../src/shared/services/transport/types";
import type { Destination, SourceReference } from "../src/shared/types/destination";

const INDEX_PATH = path.join(process.cwd(), "src/shared/data/destinations-index.json");
const REVIEW_DATE = "2026-08-23";

type DestinationWithLocation = Destination & {
  location?: { address: string; latitude?: number; longitude?: number };
};

type KyotoSpec = {
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

const makeRecord = (spec: KyotoSpec): DestinationWithLocation => {
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
    prefecture: "Kyoto",
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
      changeSummary: "Added current, source-verified Uji/northern Kyoto destination depth coverage.",
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

const nintendoHome = "https://museum.nintendo.com/en/index.html";
const nintendoAccess = "https://museum.nintendo.com/en/access/index.html";
const nintendoVisitFlow = "https://museum.nintendo.com/en/guide/visit-flow/index.html";
const nintendoImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Nintendo_Museum_Entrance.jpg/1280px-Nintendo_Museum_Entrance.jpg";
const nintendoImagePage = "https://commons.wikimedia.org/wiki/File:Nintendo_Museum_Entrance.jpg";

const miyamaHome = "https://kayabukinosato.jp/en/";
const miyamaAccess = "https://kayabukinosato.jp/en/visit/";
const miyamaImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Miyama_Kayabuki%28Thatched%29_Museum.jpg/1280px-Miyama_Kayabuki%28Thatched%29_Museum.jpg";
const miyamaImagePage = "https://commons.wikimedia.org/wiki/File:Miyama_Kayabuki(Thatched)_Museum.jpg";

const maizuruGuide = "https://www.kyototourism.org/en/sightseeing/526/";
const maizuruCity = "https://www.city.maizuru.kyoto.jp/kankou/0000015405.html";
const maizuruHome = "https://akarenga-park.com/";
const maizuruImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Maizuru_Red_Brick_Warehouses_2021-03_ac_%282%29.jpg/1280px-Maizuru_Red_Brick_Warehouses_2021-03_ac_%282%29.jpg";
const maizuruImagePage = "https://commons.wikimedia.org/wiki/File:Maizuru_Red_Brick_Warehouses_2021-03_ac_(2).jpg";

const records: DestinationWithLocation[] = [
  makeRecord({
    id: "nintendo-museum-uji",
    name: "Nintendo Museum",
    nameJa: "ニンテンドーミュージアム",
    aliases: ["Nintendo Museum Uji", "Nintendo Uji Museum"],
    officialWebsite: nintendoHome,
    officialWebsiteRequirement: "required",
    kind: "museum",
    importance: "major",
    role: "poi",
    municipalityId: "Kyoto:uji",
    coordinates: { lat: 34.8997, lng: 135.7814 },
    location: { address: "56 Kaguraden, Ogura-cho, Uji-shi, Kyoto 611-0042, Japan" },
    categories: ["Culture", "Museum", "Family"],
    tags: ["Education", "Family", "Museum", "Interactive", "Kyoto Travel"],
    description: "Nintendo's Uji museum traces the company's entertainment history from Hanafuda to Nintendo Switch and adds hands-on play experiences, a café, and a shop. It is one ticketed museum proposition rather than separate cards for its internal spaces.",
    descriptionJa: "花札からNintendo Switchまで任天堂のエンターテインメントの歴史をたどり、現代的な遊びの体験も楽しめる宇治のミュージアムです。館内の展示・カフェ・ショップは一つの入館体験として扱います。",
    highlights: ["Nintendo product history displays", "Interactive play experiences", "Hanafuda Craft & Play workshop"],
    highlightsJa: ["任天堂製品の歴史展示", "インタラクティブな遊びの体験", "花札づくり・遊び体験"],
    notes: "Tickets are date/time-specific. The official site currently uses a drawing process with possible first-come/first-served releases after the drawing; the café and shop are inside the museum and require admission.",
    notesJa: "日時指定のチケット制です。公式案内では抽選を基本とし、空きが出た場合に先着販売が行われます。カフェとショップも入館者向けです。",
    localAccessModes: ["train", "bus"],
    sources: [
      source("official", nintendoHome, "Nintendo Museum official home and current notices"),
      source("official", nintendoAccess, "Nintendo Museum official access (Ogura stations, bus, parking restrictions)"),
      source("official", nintendoVisitFlow, "Nintendo Museum official ticket reservation and visit flow"),
    ],
    heroImage: nintendoImage,
    imageSourceUrl: nintendoImagePage,
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Wikimedia Commons contributor; File:Nintendo Museum Entrance.jpg",
    duration: { min: 2, max: 3, confidence: "medium", basis: "Manual destination-only estimate for the museum exhibits and one optional hands-on experience; excludes approach travel, ticketing, and queue time." },
    reservation: "Advance date/time-specific tickets are required. The official process uses a Nintendo Account and a drawing, with possible first-come/first-served releases; Craft & Play requires a same-day reservation and separate fee.",
    parking: "The official access page says not to arrive by car, motorcycle, bicycle, or taxi, except accessibility arrangements; use public transport.",
    parentDestinationId: "uji-city",
  }),
  makeRecord({
    id: "miyama-kayabuki-no-sato",
    name: "Miyama Kayabuki no Sato",
    nameJa: "美山かやぶきの里",
    aliases: ["Kayabuki no Sato", "Miyama Thatched Village"],
    officialWebsite: miyamaHome,
    officialWebsiteRequirement: "required",
    kind: "historic_town",
    importance: "major",
    municipalityId: "Kyoto:nantan",
    coordinates: { lat: 35.2733, lng: 135.5594 },
    location: { address: "Miyama-cho Kita, Nantan-shi, Kyoto 601-0712, Japan" },
    categories: ["Culture", "History", "Nature"],
    tags: ["Heritage", "Historic Site", "Nature", "Scenic", "Village", "Kyoto Travel"],
    description: "A preserved Miyama mountain village of traditional thatched houses, small cultural facilities, and rural scenery. The village itself is the experience; its houses, museum context, shrine, and seasonal events are not split into synthetic destination cards.",
    descriptionJa: "伝統的なかやぶき民家が残る美山の山間集落で、民家の町並みや小さな文化施設、農村景観を歩いて楽しめます。民家・資料館・社寺・季節行事は一つの集落体験として扱います。",
    highlights: ["Preserved thatched-house streetscape", "Miyama Thatched Museum context", "Mountain-village scenery and local food"],
    highlightsJa: ["保存されたかやぶき民家の町並み", "かやぶきの里資料館周辺", "山里の景観と地域の食"],
    notes: "The village is a living community. Respect private homes and use the designated parking area; vehicles are not allowed inside the village except for residents and related parties.",
    notesJa: "住民が暮らす集落のため、私有地への立ち入りを避け、指定駐車場を利用してください。住民・関係者以外の車両は集落内に入れません。",
    localAccessModes: ["train", "bus", "car"],
    sources: [
      source("official", miyamaHome, "Kyoto Miyama Kayabukinosato official site"),
      source("official", miyamaAccess, "Kyoto Miyama Kayabukinosato official access and parking guidance"),
      source("tourism_board", "https://miyamanavi.com/en/information/", "Kyoto Miyama official travel guide access information"),
    ],
    heroImage: miyamaImage,
    imageSourceUrl: miyamaImagePage,
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Indiana jo; Wikimedia Commons File:Miyama Kayabuki(Thatched) Museum.jpg",
    duration: { min: 2, max: 3, confidence: "medium", basis: "Manual destination-only estimate for walking the preserved village and visiting its small cultural context; excludes Kyoto/Hiyoshi transit." },
    reservation: "Ordinary village walking does not use a timed admission ticket; large-bus and group parking reservations may be required. Check the official visitor guidance for current event/facility rules.",
    parking: "Use the designated parking lot in front of the village. The official site publishes seasonal opening hours and cooperation fees; do not park in the village or neighborhood without permission.",
  }),
  makeRecord({
    id: "maizuru-red-brick-park",
    name: "Maizuru Red Brick Park",
    nameJa: "舞鶴赤れんがパーク",
    aliases: ["Maizuru Red Brick Warehouse Park", "Akarenga Park"],
    officialWebsite: maizuruHome,
    officialWebsiteRequirement: "required",
    kind: "historic",
    importance: "major",
    role: "standalone",
    municipalityId: "Kyoto:maizuru",
    coordinates: { lat: 35.474666, lng: 135.385435 },
    location: { address: "1039-2 Kitasui, Maizuru City, Kyoto Prefecture, Japan" },
    categories: ["Culture", "History", "Museum", "Nature"],
    tags: ["Heritage", "Historic Site", "Museum", "Scenic", "Kyoto Travel"],
    description: "A waterfront group of former Maizuru Naval District red-brick warehouses, now a cultural park with museum, café, exhibition, and event spaces. The warehouse group is one coherent historic-park outing, not seven separate cards.",
    descriptionJa: "旧海軍舞鶴鎮守府の赤れんが倉庫群を活用した港の文化公園で、博物館・カフェ・展示・イベント空間がまとまっています。倉庫群は一つの歴史公園の体験として扱います。",
    highlights: ["Former naval warehouse architecture", "Red Brick Museum and exhibition spaces", "Waterfront café and event setting"],
    highlightsJa: ["旧海軍倉庫の赤れんが建築", "赤れんが博物館・展示空間", "港を望むカフェとイベント空間"],
    notes: "The official regional guide identifies seven renovated warehouses and notes that buildings 2 and 3 contain café/exhibition space while buildings 4 and 5 host events and art festivals. Maintenance closures can affect the museum.",
    notesJa: "公式観光案内では七棟の倉庫が活用され、2・3号棟はカフェ・展示、4・5号棟はイベントやアート会場として紹介されています。博物館は保守や工事で休館する場合があります。",
    localAccessModes: ["train", "bus", "car"],
    sources: [
      source("tourism_board", maizuruGuide, "Another Kyoto official travel guide — Maizuru Red Brick Park identity, address, access, hours"),
      source("government", maizuruCity, "Maizuru City current sightseeing loop-bus notice including Red Brick Park"),
      source("official", maizuruHome, "Maizuru Red Brick Park official operator site"),
    ],
    heroImage: maizuruImage,
    imageSourceUrl: maizuruImagePage,
    imageLicense: "CC BY-SA 4.0",
    imageAttribution: "Wikimedia Commons contributor; File:Maizuru Red Brick Warehouses 2021-03 ac (2).jpg",
    duration: { min: 1.5, max: 2.5, confidence: "medium", basis: "Manual destination-only estimate for the warehouse park and museum/exhibition context; excludes rail/bus approach and event-specific time." },
    reservation: "General park access follows the official visitor guidance; events, rentals, and special activities may require separate reservations. Check current museum closures before visiting.",
    parking: "The official regional guide identifies private parking about 150 m west of the park; use current on-site signage and public transport where practical.",
  }),
];

const mergeIneFunaya = (record: DestinationWithLocation): DestinationWithLocation => {
  if (record.id !== "ine-funaya-boathouses") return record;
  const currentContent = record.content ?? { en: {}, ja: {} };
  const currentSources: SourceReference[] = Array.isArray(record.editorial?.sources) ? record.editorial.sources : [];
  const additions = [
    source("official", "https://www.ine-kankou.jp/en/actives", "Ine Tourist Information current activities index (sea taxi, walking/cruising, local activities)"),
    source("official", "https://www.ine-kankou.jp/seataxi/", "Ine Tourist Information current sea-taxi operating-status link"),
  ];
  const mergedSources = [...currentSources, ...additions.filter((item) => !currentSources.some((existing) => existing.url === item.url))];
  const enDescription = "A living coastal village of traditional wooden boathouses built directly over Ine Bay. Visitors can view the streetscape respectfully, take a current-status-checked sea-taxi tour, or choose guided walking/cruising experiences; private homes remain off-limits without permission.";
  const jaDescription = "伊根湾に面して舟屋が連なる、今も住民が暮らす海辺の集落です。町並みを節度をもって散策し、運航状況を確認した海上タクシーやガイド付きのまち歩き・クルージングを楽しめます。許可なく舟屋へ立ち入らないでください。";
  return {
    ...record,
    description: enDescription,
    notes: "Ine Tourist Information currently lists sea taxi, walking/cruising, and other local activities. Check the operating-status link and respect private homes: visitors must not enter a Funaya without permission.",
    notesJa: "伊根町観光協会は海上タクシー、まち歩き・クルージングなどを案内しています。運航状況を確認し、許可なく舟屋へ立ち入らないでください。",
    reservation: "Sea taxi and guided activities follow operator availability; check the current operating-status and activity pages before visiting.",
    content: {
      ...currentContent,
      en: { ...currentContent.en, description: enDescription, notes: "Sea taxi and guided walking/cruising options are listed by current Ine Tourist Information. Check operator status and respect residents' privacy." },
      ja: { ...currentContent.ja, description: jaDescription, notes: "伊根町観光協会の最新案内で海上タクシーやガイドツアーの運航状況を確認し、住民の暮らしに配慮してください。" },
    },
    editorial: {
      ...record.editorial,
      checkedAt: REVIEW_DATE,
      reviewedAt: REVIEW_DATE,
      freshness: "current",
      changeSummary: "Enriched existing Ine Funaya record with current official visitor-conduct, sea-taxi, and guided-activity evidence; no duplicate cruise card added.",
      sources: mergedSources,
      fieldSources: {
        ...(record.editorial?.fieldSources ?? {}),
        content: additions,
        notes: additions,
        reservation: additions,
      },
      changes: [
        ...(record.editorial?.changes ?? []).filter(
          (change) =>
            change.summary !==
            "Refreshed Ine visitor and activity guidance from current Ine Tourist Information pages.",
        ),
        {
          changedAt: REVIEW_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Refreshed Ine visitor and activity guidance from current Ine Tourist Information pages.",
          method: "manual",
        },
      ],
    },
  } as DestinationWithLocation;
};

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as DestinationWithLocation[];
const byId = new Map(index.map((item) => [item.id, item]));
for (const record of records) {
  const existing = byId.get(record.id);
  if (existing) {
    if (existing.name !== record.name || existing.nameJa !== record.nameJa) {
      throw new Error(`KAI-161 identity conflict: ${record.id}`);
    }
    continue;
  }
  byId.set(record.id, record);
}
const ine = byId.get("ine-funaya-boathouses");
if (!ine) throw new Error("KAI-161 expected existing ine-funaya-boathouses record");
byId.set("ine-funaya-boathouses", mergeIneFunaya(ine));
const next = Array.from(byId.values());
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(next, null, 2)}\n`);
console.log(`KAI-161 processed ${records.length} canonical records and enriched ine-funaya-boathouses; total=${next.length}`);
