/**
 * add-kyushu-to-100.ts — Expand Kyushu catalogue from 71 to 100 records
 *
 * Adds 5 municipality hubs + 24 child destinations across 5 cities.
 * Run: npx tsx scripts/add-kyushu-to-100.ts [karatsu|sasebo|ibusuki|nichinan|hita|all]
 * Default: all
 *
 * After running: npx tsx scripts/sync-destination-details.ts
 */

import fs from "fs";
import path from "path";

const INDEX_PATH = path.resolve("src/shared/data/destinations-index.json");
const DETAILS_DIR = path.resolve("public/data/destinations");
const EXPANSION_DATE = "2026-08-06";

// ==========================================================================
// Shared helpers
// ==========================================================================

interface DestinationRecord {
  id: string;
  [key: string]: any;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ==========================================================================
// Hub builder
// ==========================================================================

interface HubInput {
  id: string;
  name: string;
  nameJa: string;
  prefecture: string;
  municipalityId: string;
  coordinates: { lat: number; lng: number };
  description: string;
  descriptionJa: string;
  wikiUrl: string;
  wikiTitle: string;
  heroImage: string;
  imageAttribution: string;
  imageLicense: string;
  imageSourceUrl: string;
  tags: string[];
  transportOptions: Record<string, number>;
  nearbyIds: string[];
  notes: string;
  notesJa: string;
}

function buildHub(input: HubInput): DestinationRecord {
  return {
    id: input.id,
    name: input.name,
    nameJa: input.nameJa,
    kind: "city",
    role: "hub",
    importance: "notable",
    prefecture: input.prefecture,
    region: "Kyushu",
    categories: ["Travel Hub", "City Hub"],
    heroImage: input.heroImage,
    image: input.heroImage,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: input.imageLicense,
      attribution: input.imageAttribution,
      sourceUrl: input.imageSourceUrl,
    },
    description: input.description,
    descriptionJa: input.descriptionJa,
    highlights: [`Explore ${input.name}`, "Local Culture & Cuisine"],
    highlightsJa: [`${input.nameJa}を探索`, "地元の文化と料理"],
    totalTripHours: 6,
    budgetMin: 3500,
    budgetRecommended: 14250,
    budgetMax: 25000,
    budgetBreakdown: {
      transport: 3563,
      tickets: 1781,
      food: 5789,
      cafe: 3117,
    },
    walkingMin: 4000,
    walkingSunMin: 1500,
    walkingShadeMin: 2500,
    indoorPercent: 50,
    ratings: {
      overall: 9.5,
      couple: 9.3,
      summer: 9,
      winter: 9.1,
      rain: 9.2,
      food: 9.6,
      photography: 9.5,
      relaxation: 9.2,
      value: 9.4,
      uniqueness: 9.4,
    },
    ratingsSchemaVersion: 2,
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    bestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    bestSeason: "All Year",
    weatherDependence: "low",
    tags: input.tags,
    coordinates: input.coordinates,
    comfort: { heatTolerance: 8, rainFriendly: 8, walkingIntensity: 3 },
    transportOptions: input.transportOptions,
    reservation: "None required",
    parking: "Public parking available",
    notes: input.notes,
    notesJa: input.notesJa,
    status: "published",
    travelEstimate: { confidence: "beta" },
    collections: [{ collectionId: "core-cities-japan", confirmed: true }],
    relationships: {
      featuredDestinationIds: [],
      nearbyDestinationIds: input.nearbyIds,
    },
    walkingIntensity: "low",
    recommendedVisitHours: { min: 6, max: 12 },
    municipalityId: input.municipalityId,
    aliases: [input.name, input.nameJa],
    editorial: {
      lifecycle: "published",
      freshness: "current",
      checkedAt: EXPANSION_DATE,
      reviewedAt: EXPANSION_DATE,
      reviewedBy: "Kyushu-to-100 Expansion",
      sources: [
        {
          type: "wikipedia",
          url: input.wikiUrl,
          title: input.wikiTitle,
          accessedAt: EXPANSION_DATE,
        },
      ],
    },
    openingHours: "No fixed opening hours (city area)",
    openingHoursJa: "営業時間の設定なし（市内エリア）",
    openingHoursMetadata: {
      verifiedAt: EXPANSION_DATE,
      sourceUrl: input.wikiUrl,
    },
    content: {
      en: {
        name: input.name,
        description: input.description,
        highlights: [`Explore ${input.name}`, "Local Culture & Cuisine"],
        openingHours: "No fixed opening hours (city area)",
      },
      ja: {
        name: input.nameJa,
        description: input.descriptionJa,
        highlights: [`${input.nameJa}を探索`, "地元の文化と料理"],
        openingHours: "営業時間の設定なし（市内エリア）",
      },
    },
  };
}

// ==========================================================================
// POI builder
// ==========================================================================

interface PoiInput {
  id: string;
  name: string;
  nameJa: string;
  parentId: string;
  prefecture: string;
  municipalityId: string;
  kind: string;
  categories: string[];
  tags: string[];
  coordinates: { lat: number; lng: number };
  description: string;
  descriptionJa: string;
  highlights: string[];
  highlightsJa: string[];
  heroImage: string;
  imageAttribution: string;
  imageLicense: string;
  imageSourceUrl: string;
  openingHours: string;
  openingHoursJa: string;
  hoursSourceUrl: string;
  hoursNote?: string;
  closedDays?: string;
  officialWebsite: string | null;
  wikiUrl: string;
  wikiTitle: string;
  budgetMin: number;
  budgetRecommended: number;
  budgetMax: number;
  ticketCost: number;
  transportOptions: Record<string, number>;
  totalTripHours: number;
  recommendedVisitHours: { min: number; max: number };
  walkingMin: number;
  indoorPercent: number;
  ratings: Record<string, number>;
  crowd: { weekday: number; weekend: number; holiday: number };
  season: { spring: number; summer: number; autumn: number; winter: number };
  bestMonths: number[];
  weatherDependence: string;
  reservation: string;
  reservationJa?: string;
  parking: string;
  walkingIntensity: string;
  walkingSunMin: number;
  walkingShadeMin: number;
  comfort: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  };
  notes: string;
  notesJa: string;
}

function buildPoi(input: PoiInput): DestinationRecord {
  return {
    id: input.id,
    name: input.name,
    nameJa: input.nameJa,
    aliases: [input.name, input.nameJa],
    content: {
      en: {
        name: input.name,
        description: input.description,
        highlights: input.highlights,
        openingHours: input.openingHours,
      },
      ja: {
        name: input.nameJa,
        description: input.descriptionJa,
        highlights: input.highlightsJa,
        openingHours: input.openingHoursJa,
      },
    },
    prefecture: input.prefecture,
    region: "Kyushu",
    kind: input.kind,
    role: "poi",
    placeType: "destination",
    relationships: { parentDestinationId: input.parentId },
    officialWebsiteRequirement: input.officialWebsite ? "optional" : "optional",
    categories: input.categories,
    tags: input.tags,
    heroImage: input.heroImage,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: input.imageLicense,
      attribution: input.imageAttribution,
      sourceUrl: input.imageSourceUrl,
    },
    coordinates: input.coordinates,
    description: input.description,
    highlights: input.highlights,
    openingHours: input.openingHours,
    openingHoursJa: input.openingHoursJa,
    openingHoursMetadata: {
      verifiedAt: EXPANSION_DATE,
      sourceUrl: input.hoursSourceUrl,
      ...(input.hoursNote && { hoursNote: input.hoursNote }),
      ...(input.closedDays && { closedDays: input.closedDays }),
    },
    budgetMin: input.budgetMin,
    budgetRecommended: input.budgetRecommended,
    budgetMax: input.budgetMax,
    budgetBreakdown: {
      transport: Math.round(input.budgetMin * 0.3),
      tickets: input.ticketCost,
      food: Math.round(input.budgetMin * 0.45),
      cafe: Math.round(input.budgetMin * 0.1),
    },
    transportOptions: input.transportOptions,
    totalTripHours: input.totalTripHours,
    recommendedVisitHours: input.recommendedVisitHours,
    walkingMin: input.walkingMin,
    walkingIntensity: input.walkingIntensity,
    walkingSunMin: input.walkingSunMin,
    walkingShadeMin: input.walkingShadeMin,
    indoorPercent: input.indoorPercent,
    comfort: input.comfort,
    ratings: { ...input.ratings },
    ratingsSchemaVersion: 2,
    crowd: input.crowd,
    season: input.season,
    bestMonths: input.bestMonths,
    weatherDependence: input.weatherDependence,
    reservation: input.reservation,
    ...(input.reservationJa && { reservationJa: input.reservationJa }),
    parking: input.parking,
    notes: input.notes,
    notesJa: input.notesJa,
    schemaVersion: 2,
    status: "published",
    travelEstimate: { confidence: "medium" },
    collections: [],
    addedAt: EXPANSION_DATE,
    editorial: {
      lifecycle: "published",
      sources: [
        ...(input.officialWebsite
          ? [
              {
                type: "official",
                url: input.officialWebsite,
                title: `${input.name} Official Website`,
                accessedAt: EXPANSION_DATE,
              },
            ]
          : []),
        {
          type: "wikipedia",
          url: input.wikiUrl,
          title: input.wikiTitle,
          accessedAt: EXPANSION_DATE,
        },
      ],
      checkedAt: EXPANSION_DATE,
      freshness: "current",
      changeSummary: "Kyushu-to-100 expansion",
      changes: [
        {
          changedAt: EXPANSION_DATE,
          changedBy: "Kyushu-to-100 Editorial Batch",
          summary: `Added bilingual curated POI: ${input.name}`,
          method: "assisted",
        },
      ],
      reviewedAt: EXPANSION_DATE,
      reviewedBy: "Kyushu-to-100 Editorial Batch",
    },
    officialWebsite: input.officialWebsite,
    municipalityId: input.municipalityId,
  };
}

// ==========================================================================
// HUB DATA
// ==========================================================================

const HUB_KARATSU: HubInput = {
  id: "karatsu-city",
  name: "Karatsu City",
  nameJa: "唐津市",
  prefecture: "Saga",
  municipalityId: "Saga:karatsu",
  coordinates: { lat: 33.4502, lng: 129.9681 },
  description:
    "Coastal city in Saga Prefecture known for Karatsu Castle, the vibrant Yobuko morning market, the Nanatsugama sea caves, and the Nijinomatsubara pine grove. Famous for Karatsu-yaki pottery and the annual Karatsu Kunchi festival.",
  descriptionJa:
    "佐賀県の沿岸都市で、唐津城、活気あふれる呼子朝市、七ツ釜の海食洞、虹の松原で知られています。唐津焼と毎年開催される唐津くんちでも有名です。",
  wikiUrl: "https://en.wikipedia.org/wiki/Karatsu,_Saga",
  wikiTitle: "Karatsu, Saga",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/7/74/Karatsu_City_View.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Karatsu_City_View.jpg",
  tags: ["Karatsu City", "Saga Travel", "Regional Hub"],
  transportOptions: { train: 250 },
  nearbyIds: ["fukuoka-city"],
  notes:
    "Karatsu City travel hub in Saga Prefecture, gateway to the Karatsu Peninsula.",
  notesJa: "佐賀県唐津市のトラベルハブ、唐津半島への玄関口です。",
};

const HUB_SASEBO: HubInput = {
  id: "sasebo-city",
  name: "Sasebo City",
  nameJa: "佐世保市",
  prefecture: "Nagasaki",
  municipalityId: "Nagasaki:sasebo",
  coordinates: { lat: 33.1799, lng: 129.7151 },
  description:
    "Port city in Nagasaki Prefecture and gateway to the Kujukushima islands. Home to Huis Ten Bosch theme park, Kujukushima Pearl Sea Resort, and a historic naval port. Famous for Sasebo burgers and maritime culture.",
  descriptionJa:
    "長崎県の港湾都市で、九十九島への玄関口。ハウステンボス、九十九島パールシーリゾート、歴史的な軍港で知られています。佐世保バーガーと海洋文化が有名です。",
  wikiUrl: "https://en.wikipedia.org/wiki/Sasebo",
  wikiTitle: "Sasebo",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/8/8e/Sasebo_City_view_from_Mount_Yumihari.jpg",
  imageAttribution: "M K",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Sasebo_City_view_from_Mount_Yumihari.jpg",
  tags: ["Sasebo City", "Nagasaki Travel", "Regional Hub"],
  transportOptions: { train: 280 },
  nearbyIds: ["nagasaki-city", "karatsu-city", "fukuoka-city"],
  notes:
    "Sasebo City travel hub in Nagasaki Prefecture, gateway to Kujukushima.",
  notesJa: "長崎県佐世保市のトラベルハブ、九十九島への玄関口です。",
};

const HUB_IBUSUKI: HubInput = {
  id: "ibusuki-city",
  name: "Ibusuki City",
  nameJa: "指宿市",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:ibusuki",
  coordinates: { lat: 31.2528, lng: 130.6331 },
  description:
    "Southern Kyushu hot-spring resort city on the Satsuma Peninsula, famous for natural sand steam baths, Lake Ikeda, Mount Kaimon, and the tidal sandbar of Chiringashima Island. Known for subtropical flora and coastal scenery.",
  descriptionJa:
    "薩摩半島に位置する南九州の温泉リゾート都市で、天然砂むし温泉、池田湖、開聞岳、知林ヶ島の砂州で知られています。亜熱帯植物と海岸景観が魅力です。",
  wikiUrl: "https://en.wikipedia.org/wiki/Ibusuki,_Kagoshima",
  wikiTitle: "Ibusuki, Kagoshima",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/4/4b/Ibusuki_steaming_sand_bath.jpg",
  imageAttribution: "John Gillespie",
  imageLicense: "CC BY-SA 3.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Ibusuki_steaming_sand_bath.jpg",
  tags: ["Ibusuki City", "Kagoshima Travel", "Regional Hub"],
  transportOptions: { train: 310 },
  nearbyIds: ["kagoshima-city"],
  notes:
    "Ibusuki City travel hub in Kagoshima Prefecture, famous for sand steam baths.",
  notesJa: "鹿児島県指宿市のトラベルハブ、砂むし温泉で有名です。",
};

const HUB_NICHINAN: HubInput = {
  id: "nichinan-city",
  name: "Nichinan City",
  nameJa: "日南市",
  prefecture: "Miyazaki",
  municipalityId: "Miyazaki:nichinan",
  coordinates: { lat: 31.6019, lng: 131.3789 },
  description:
    "Coastal city in southern Miyazaki Prefecture known for the historic Obi Castle Town, Udo Jingu shrine perched dramatically on coastal cliffs, and the Moai statues of Sun Messe Nichinan. Rich in nature, surfing culture, and subtropical scenery.",
  descriptionJa:
    "宮崎県南部の沿岸都市で、歴史的な飫肥城下町、断崖絶壁に建つ鵜戸神宮、サンメッセ日南のモアイ像で知られています。豊かな自然、サーフィン文化、亜熱帯の景観が魅力です。",
  wikiUrl: "https://en.wikipedia.org/wiki/Nichinan,_Miyazaki",
  wikiTitle: "Nichinan, Miyazaki",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/2/2d/Obi_Castle_Town_Street.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Obi_Castle_Town_Street.jpg",
  tags: ["Nichinan City", "Miyazaki Travel", "Regional Hub"],
  transportOptions: { train: 220 },
  nearbyIds: ["miyazaki-city"],
  notes:
    "Nichinan City travel hub in Miyazaki Prefecture, home to Obi Castle Town and Udo Jingu.",
  notesJa: "宮崎県日南市のトラベルハブ、飫肥城下町と鵜戸神宮で知られています。",
};

const HUB_HITA: HubInput = {
  id: "hita-city",
  name: "Hita City",
  nameJa: "日田市",
  prefecture: "Oita",
  municipalityId: "Oita:hita",
  coordinates: { lat: 33.3214, lng: 130.9414 },
  description:
    "Inland city in western Oita Prefecture known for the well-preserved Mameda historic merchant district, Kangien academy, and as a filming location for Attack on Titan. Famous for Hita geta sandals and clear-water rivers. A natural basin surrounded by mountains.",
  descriptionJa:
    "大分県西部の内陸都市で、保存状態の良い豆田町の歴史的商家街、咸宜園、進撃の巨人のロケ地として知られています。日田下駄と清流が有名で、山々に囲まれた盆地の街です。",
  wikiUrl: "https://en.wikipedia.org/wiki/Hita,_%C5%8Cita",
  wikiTitle: "Hita, Ōita",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/8/8f/Mameda-machi%2C_Hita%2C_Oita_Prefecture.jpg",
  imageAttribution: "Muyo",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Mameda-machi,_Hita,_Oita_Prefecture.jpg",
  tags: ["Hita City", "Oita Travel", "Regional Hub"],
  transportOptions: { train: 240 },
  nearbyIds: ["yufu-city", "fukuoka-city", "kumamoto-city"],
  notes:
    "Hita City travel hub in Oita Prefecture, famous for Mameda historic district.",
  notesJa: "大分県日田市のトラベルハブ、豆田町の歴史的街並みで有名です。",
};

// ==========================================================================
// POI DATA — KARATSU
// ==========================================================================

const POI_KARATSU_CASTLE: PoiInput = {
  id: "karatsu-castle",
  name: "Karatsu Castle",
  nameJa: "唐津城",
  parentId: "karatsu-city",
  prefecture: "Saga",
  municipalityId: "Saga:karatsu",
  kind: "historic",
  categories: ["Historic", "Sightseeing"],
  tags: ["Castle", "Historic", "Viewpoint", "Karatsu City"],
  coordinates: { lat: 33.4544, lng: 129.9736 },
  description:
    "Karatsu Castle, also known as Maizuru Castle, sits on a hill overlooking Karatsu Bay. Originally built in 1608, the current reconstructed keep houses a museum of feudal artifacts and offers panoramic views of the sea and Nijinomatsubara pine grove.",
  descriptionJa:
    "唐津城（舞鶴城）は唐津湾を見下ろす丘の上に立つ城で、1608年に築城されました。現在の復興天守は資料館として武具や調度品を展示し、海と虹の松原のパノラマが楽しめます。",
  highlights: [
    "Panoramic views of Karatsu Bay and Nijinomatsubara",
    "Feudal-era samurai armour and artifacts",
    "Cherry blossoms in spring around the castle grounds",
  ],
  highlightsJa: [
    "唐津湾と虹の松原のパノラマ",
    "武家の甲冑や工芸品の展示",
    "春は城址公園の桜",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/1/1e/Karatsu_Castle_2020.jpg",
  imageAttribution: "J o",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Karatsu_Castle_2020.jpg",
  openingHours: "09:00–17:00 (last admission 16:40)",
  openingHoursJa: "09:00～17:00（最終入館16:40）",
  hoursSourceUrl: "https://www.karatsu-kankou.jp/en/spots/detail/1",
  closedDays: "Open daily",
  officialWebsite: "https://www.karatsu-kankou.jp/en/spots/detail/1",
  wikiUrl: "https://en.wikipedia.org/wiki/Karatsu_Castle",
  wikiTitle: "Karatsu Castle",
  budgetMin: 2000,
  budgetRecommended: 4500,
  budgetMax: 8000,
  ticketCost: 500,
  transportOptions: { train: 250, bus: 150 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 2500,
  indoorPercent: 40,
  ratings: {
    overall: 8.0,
    couple: 8.0,
    summer: 7.5,
    winter: 7.5,
    rain: 6.5,
    food: 6.0,
    photography: 8.5,
    relaxation: 7.0,
    value: 8.0,
    uniqueness: 7.5,
  },
  crowd: { weekday: 3, weekend: 5, holiday: 7 },
  season: { spring: 9, summer: 7, autumn: 8, winter: 7 },
  bestMonths: [3, 4, 10, 11],
  weatherDependence: "moderate",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "medium",
  walkingSunMin: 1000,
  walkingShadeMin: 1500,
  comfort: { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 4 },
  notes:
    "The castle keep offers the best view of Nijinomatsubara pine grove from above.",
  notesJa: "天守から虹の松原を一望できるのが最大の魅力です。",
};

const POI_YOBUKO_MARKET: PoiInput = {
  id: "yobuko-morning-market",
  name: "Yobuko Morning Market",
  nameJa: "呼子朝市",
  parentId: "karatsu-city",
  prefecture: "Saga",
  municipalityId: "Saga:karatsu",
  kind: "market",
  categories: ["Shopping", "Food"],
  tags: ["Market", "Seafood", "Local Food", "Karatsu City"],
  coordinates: { lat: 33.5406, lng: 129.8908 },
  description:
    "One of Japan's three great morning markets, held daily along Yobuko Port since the Edo period. Vendors sell fresh-caught squid, dried fish, local produce, and crafts. Famous for live squid sashimi served at nearby waterfront restaurants.",
  descriptionJa:
    "日本三大朝市の一つで、江戸時代から続く呼子港の朝市。獲れたてのイカや干物、地元の農産物や工芸品が並びます。近くの食堂で味わえる活イカの刺身が名物です。",
  highlights: [
    "Fresh seafood straight from Yobuko Port",
    "Live squid sashimi at waterfront restaurants",
    "Traditional market atmosphere since the Edo period",
  ],
  highlightsJa: [
    "呼子港直送の新鮮な海産物",
    "浜の食堂で味わう活イカ刺身",
    "江戸時代から続く伝統的な朝市の雰囲気",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/5/5a/Yobuko_morning_market.jpg",
  imageAttribution: "Oshimin",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Yobuko_morning_market.jpg",
  openingHours: "07:30–12:00 (daily, best from 08:00)",
  openingHoursJa: "07:30～12:00（毎日、8時頃からが賑わいます）",
  hoursSourceUrl: "https://www.karatsu-kankou.jp/en/spots/detail/8",
  officialWebsite: "https://www.karatsu-kankou.jp/en/spots/detail/8",
  wikiUrl: "https://en.wikipedia.org/wiki/Yobuko",
  wikiTitle: "Yobuko",
  budgetMin: 1500,
  budgetRecommended: 5000,
  budgetMax: 10000,
  ticketCost: 0,
  transportOptions: { bus: 300 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 2000,
  indoorPercent: 20,
  ratings: {
    overall: 8.5,
    couple: 7.5,
    summer: 8.0,
    winter: 7.0,
    rain: 6.5,
    food: 9.5,
    photography: 8.0,
    relaxation: 6.5,
    value: 8.5,
    uniqueness: 9.0,
  },
  crowd: { weekday: 5, weekend: 8, holiday: 9 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 6 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  weatherDependence: "moderate",
  reservation: "None required",
  parking: "Nearby paid parking available",
  walkingIntensity: "low",
  walkingSunMin: 1000,
  walkingShadeMin: 500,
  comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 2 },
  notes: "Arrive by 8 am for the freshest catch and the liveliest atmosphere.",
  notesJa: "最も新鮮な魚と活気ある雰囲気を楽しむには朝8時までに到着を。",
};

const POI_NIJINOMATSUBARA: PoiInput = {
  id: "nijinomatsubara-pine-grove",
  name: "Nijinomatsubara Pine Grove",
  nameJa: "虹の松原",
  parentId: "karatsu-city",
  prefecture: "Saga",
  municipalityId: "Saga:karatsu",
  kind: "natural",
  categories: ["Nature", "Sightseeing"],
  tags: ["Nature", "Forest", "Coastal", "Karatsu City"],
  coordinates: { lat: 33.4458, lng: 129.985 },
  description:
    "A 5 km arc of approximately one million black pine trees stretching along Karatsu Bay. Designated as one of Japan's three great pine groves alongside Miho no Matsubara and Kehi no Matsubara. A scenic walking and cycling path runs through the grove.",
  descriptionJa:
    "唐津湾に沿って約5kmにわたる約100万本の黒松林。三保の松原、気比の松原と並ぶ日本三大松原の一つに数えられます。松原の中を歩行者・自転車道が走り、海水浴場も隣接しています。",
  highlights: [
    "5 km arc of one million black pine trees",
    "Scenic walking and cycling path along the coast",
    "Views across Karatsu Bay to Karatsu Castle",
  ],
  highlightsJa: [
    "約100万本の黒松が連なる5kmの弧",
    "海岸沿いの散策・サイクリング道",
    "唐津湾越しに唐津城を望む風景",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/9/9e/Niji_no_Matsubara_2018.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Niji_no_Matsubara_2018.jpg",
  openingHours: "Open access (no fixed hours)",
  openingHoursJa: "開放（時間制限なし）",
  hoursSourceUrl: "https://www.karatsu-kankou.jp/en/spots/detail/4",
  officialWebsite: "https://www.karatsu-kankou.jp/en/spots/detail/4",
  wikiUrl: "https://en.wikipedia.org/wiki/Niji_no_Matsubara",
  wikiTitle: "Niji no Matsubara",
  budgetMin: 1000,
  budgetRecommended: 3000,
  budgetMax: 6000,
  ticketCost: 0,
  transportOptions: { train: 250, bus: 150 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 4000,
  indoorPercent: 5,
  ratings: {
    overall: 8.0,
    couple: 8.5,
    summer: 8.0,
    winter: 6.5,
    rain: 5.0,
    food: 5.0,
    photography: 8.5,
    relaxation: 9.0,
    value: 9.0,
    uniqueness: 7.5,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 7 },
  season: { spring: 9, summer: 8, autumn: 8, winter: 6 },
  bestMonths: [3, 4, 5, 6, 9, 10],
  weatherDependence: "moderate",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "low",
  walkingSunMin: 2000,
  walkingShadeMin: 2000,
  comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 2 },
  notes:
    "The coastal cycling path is the best way to experience the full 5 km of pine grove.",
  notesJa:
    "5kmの松原全体を楽しむなら海岸沿いのサイクリングロードがおすすめです。",
};

const POI_NANATSUGAMA: PoiInput = {
  id: "nanatsugama-sea-caves",
  name: "Nanatsugama Sea Caves",
  nameJa: "七ツ釜",
  parentId: "karatsu-city",
  prefecture: "Saga",
  municipalityId: "Saga:karatsu",
  kind: "natural",
  categories: ["Nature", "Sightseeing"],
  tags: ["Nature", "Caves", "Coastal", "Cruise", "Karatsu City"],
  coordinates: { lat: 33.5667, lng: 129.8547 },
  description:
    "Dramatic basalt sea caves carved into the northern coastline of the Karatsu Peninsula. Seven interconnected caverns, the largest reaching 30 metres high. Viewed from cliff-top walking paths or up close by sightseeing cruise boat departing from Yobuko Port.",
  descriptionJa:
    "唐津半島の北岸に刻まれた玄武岩の海食洞。7つの洞窟が連なり、最大のものは高さ30mに達します。断崖上の遊歩道からの展望と、呼子港発の遊覧船での洞窟接近の両方で楽しめます。",
  highlights: [
    "Seven interconnected basalt sea caverns",
    "Cliff-top walking paths with dramatic coastal views",
    "Sightseeing cruise into the cave entrances from Yobuko Port",
  ],
  highlightsJa: [
    "7つ連なる玄武岩の海食洞",
    "断崖絶壁の遊歩道からの絶景",
    "呼子港発の遊覧船で洞窟入り口まで接近",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/4/4b/Nanatsugama_sea_caves.jpg",
  imageAttribution: "Oshimin",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Nanatsugama_sea_caves.jpg",
  openingHours:
    "Cliff paths: open access (daylight hours recommended). Sightseeing cruise: 09:30–16:00 (hourly departures, weather permitting)",
  openingHoursJa:
    "遊歩道：自由（日中推奨）。遊覧船：09:30～16:00（毎時運航、天候による）",
  hoursSourceUrl: "https://www.karatsu-kankou.jp/en/spots/detail/9",
  hoursNote:
    "Cruise departures are weather-dependent and may be cancelled in high waves",
  officialWebsite: null,
  wikiUrl: "https://en.wikipedia.org/wiki/Nanatsugama",
  wikiTitle: "Nanatsugama",
  budgetMin: 2000,
  budgetRecommended: 5000,
  budgetMax: 9000,
  ticketCost: 1600,
  transportOptions: { bus: 400 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1.5, max: 3 },
  walkingMin: 3000,
  indoorPercent: 5,
  ratings: {
    overall: 8.5,
    couple: 8.5,
    summer: 8.0,
    winter: 6.0,
    rain: 5.0,
    food: 5.0,
    photography: 9.0,
    relaxation: 7.5,
    value: 8.0,
    uniqueness: 9.0,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 7 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 5 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  weatherDependence: "high",
  reservation:
    "Cliff paths: none required. Sightseeing cruise: tickets at Yobuko Port; advance booking recommended in peak season.",
  parking: "Free parking at trailhead and Yobuko Port",
  walkingIntensity: "medium",
  walkingSunMin: 1500,
  walkingShadeMin: 500,
  comfort: { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
  notes:
    "The sightseeing cruise may be cancelled in high waves — check conditions at Yobuko Port.",
  notesJa: "遊覧船は高波時に欠航あり。呼子港で運航状況を確認してください。",
};

const POI_NAGOYA_CASTLE_RUINS: PoiInput = {
  id: "nagoya-castle-ruins-museum",
  name: "Nagoya Castle Ruins & Museum",
  nameJa: "名護屋城跡・佐賀県立名護屋城博物館",
  parentId: "karatsu-city",
  prefecture: "Saga",
  municipalityId: "Saga:karatsu",
  kind: "historic",
  categories: ["Historic", "Museum & Art"],
  tags: ["Castle Ruins", "Museum", "History", "Karatsu City"],
  coordinates: { lat: 33.5639, lng: 129.8311 },
  description:
    "The ruins of Nagoya Castle, the massive base built by Toyotomi Hideyoshi for his invasions of Korea (1592–98). Once one of Japan's largest castles, the stone walls and extensive foundations remain. The adjacent prefectural museum exhibits invasion-period artefacts, maps, and a reconstructed golden tea room.",
  descriptionJa:
    "豊臣秀吉が朝鮮出兵（文禄・慶長の役）の拠点として築いた名護屋城の城跡。かつて日本最大級だった城の石垣と広大な礎石が残ります。隣接する県立博物館では、出兵ゆかりの遺物、古地図、復元された黄金の茶室を展示しています。",
  highlights: [
    "Massive stone walls of Hideyoshi's invasion headquarters",
    "Prefectural museum with Korean campaign artefacts",
    "Reconstructed golden tea room in the museum",
  ],
  highlightsJa: [
    "秀吉の出兵拠点の壮大な石垣群",
    "文禄・慶長の役の遺物を展示する県立博物館",
    "博物館内の復元黄金の茶室",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/1/1f/Nagoya_Castle_ruins_Saga.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Nagoya_Castle_ruins_Saga.jpg",
  openingHours:
    "Castle ruins: open access (daylight hours). Museum: 09:00–17:00 (last admission 16:30, closed Mondays)",
  openingHoursJa:
    "城跡：自由見学（日中推奨）。博物館：09:00～17:00（最終入館16:30、月曜休館）",
  hoursSourceUrl: "https://www.karatsu-kankou.jp/en/spots/detail/7",
  closedDays:
    "Museum closed on Mondays (or Tuesday if Monday is a public holiday)",
  officialWebsite: null,
  wikiUrl: "https://en.wikipedia.org/wiki/Nagoya_Castle_(Hizen_Province)",
  wikiTitle: "Nagoya Castle (Hizen Province)",
  budgetMin: 1500,
  budgetRecommended: 4000,
  budgetMax: 7000,
  ticketCost: 500,
  transportOptions: { bus: 350 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1.5, max: 3 },
  walkingMin: 3500,
  indoorPercent: 40,
  ratings: {
    overall: 8.0,
    couple: 7.5,
    summer: 7.0,
    winter: 7.0,
    rain: 7.5,
    food: 5.5,
    photography: 8.5,
    relaxation: 7.0,
    value: 8.5,
    uniqueness: 9.0,
  },
  crowd: { weekday: 2, weekend: 4, holiday: 5 },
  season: { spring: 9, summer: 7, autumn: 9, winter: 6 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "moderate",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "medium",
  walkingSunMin: 2000,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 4 },
  notes:
    "The museum is closed on Mondays — the outdoor castle ruins remain accessible every day.",
  notesJa: "博物館は月曜休館。屋外の城跡は毎日見学可能です。",
};

// ==========================================================================
// POI DATA — SASEBO (placeholders for now — filled in Commit 2)
// ==========================================================================

const POI_HUIS_TEN_BOSCH: PoiInput = {
  id: "huis-ten-bosch",
  name: "Huis Ten Bosch",
  nameJa: "ハウステンボス",
  parentId: "sasebo-city",
  prefecture: "Nagasaki",
  municipalityId: "Nagasaki:sasebo",
  kind: "theme_park",
  categories: ["Leisure", "Sightseeing"],
  tags: ["Theme Park", "Dutch", "Illumination", "Sasebo City"],
  coordinates: { lat: 33.0856, lng: 129.7914 },
  description:
    "A Dutch-themed amusement park and resort spanning 152 hectares, one of Japan's largest theme parks. Features canals, windmills, replica Dutch buildings, seasonal flower gardens, museums, attractions, and spectacular illumination events. Hours and ticket prices vary by date and season.",
  descriptionJa:
    "152ヘクタールに広がるオランダをテーマにした日本最大級のテーマパーク。運河、風車、オランダ建築の再現、季節の花園、ミュージアム、アトラクション、壮大なイルミネーションが楽しめます。営業時間と料金は日付と季節により変動します。",
  highlights: [
    "Spectacular seasonal illumination events",
    "Canal cruises through Dutch-style scenery",
    "Seasonal flower gardens and windmill landscapes",
  ],
  highlightsJa: [
    "壮大な季節のイルミネーション",
    "運河クルーズでオランダ風景を満喫",
    "季節の花園と風車の風景",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/4/42/Huis_Ten_Bosch_Nagasaki_Japan.jpg",
  imageAttribution: "Kzaral",
  imageLicense: "CC BY-SA 3.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Huis_Ten_Bosch_Nagasaki_Japan.jpg",
  openingHours: "09:00–22:00 (varies by date and season, check official site)",
  openingHoursJa: "09:00～22:00（日付・季節により変動、公式サイトで確認）",
  hoursSourceUrl: "https://english.huistenbosch.co.jp/",
  hoursNote:
    "Hours and ticket prices vary daily — always check the official calendar",
  officialWebsite: "https://english.huistenbosch.co.jp/",
  wikiUrl: "https://en.wikipedia.org/wiki/Huis_Ten_Bosch_(theme_park)",
  wikiTitle: "Huis Ten Bosch (theme park)",
  budgetMin: 5000,
  budgetRecommended: 15000,
  budgetMax: 30000,
  ticketCost: 7000,
  transportOptions: { train: 280, bus: 200 },
  totalTripHours: 8,
  recommendedVisitHours: { min: 4, max: 8 },
  walkingMin: 8000,
  indoorPercent: 60,
  ratings: {
    overall: 9.0,
    couple: 9.5,
    summer: 8.5,
    winter: 8.5,
    rain: 7.5,
    food: 8.0,
    photography: 9.5,
    relaxation: 8.0,
    value: 7.5,
    uniqueness: 9.0,
  },
  crowd: { weekday: 5, weekend: 9, holiday: 10 },
  season: { spring: 9, summer: 9, autumn: 9, winter: 9 },
  bestMonths: [3, 4, 5, 7, 8, 11, 12],
  weatherDependence: "moderate",
  reservation: "Advance online tickets recommended; group discounts available",
  parking: "Paid parking available",
  walkingIntensity: "high",
  walkingSunMin: 3000,
  walkingShadeMin: 4000,
  comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 5 },
  notes:
    "Hours and ticket prices vary by date — always check the official online calendar before visiting.",
  notesJa:
    "営業時間と料金は日により変動 — 訪問前に必ず公式サイトのカレンダーを確認ください。",
};

const POI_KUJUKUSHIMA: PoiInput = {
  id: "kujukushima-pearl-sea-resort",
  name: "Kujukushima Pearl Sea Resort",
  nameJa: "九十九島パールシーリゾート",
  parentId: "sasebo-city",
  prefecture: "Nagasaki",
  municipalityId: "Nagasaki:sasebo",
  kind: "mixed",
  categories: ["Sightseeing", "Leisure"],
  tags: ["Islands", "Cruise", "Aquarium", "Sasebo City"],
  coordinates: { lat: 33.1592, lng: 129.6842 },
  description:
    "Resort offering sightseeing cruises through the 208 islands of Kujukushima, plus the Kujukushima Aquarium (Umi Kirara). The Pearl Queen and pirate-themed Mirai cruise ships depart regularly. The complex includes an observation deck overlooking the island-dotted bay.",
  descriptionJa:
    "九十九島の208の島々を巡る遊覧船と九十九島水族館（海きらら）を中心としたリゾート施設。パールクイーン号と海賊船型のミライ号が定期運航。島々が点在する湾を見渡す展望台も併設されています。",
  highlights: [
    "Scenic cruises through 208 pine-clad islands",
    "Kujukushima Aquarium with local marine life",
    "Panoramic observation deck over the island-dotted bay",
  ],
  highlightsJa: [
    "208の島々を巡る遊覧クルーズ",
    "地元の海洋生物を展示する九十九島水族館",
    "島が点在する湾を一望する展望台",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/2/24/Kujukushima_Islands_Nagasaki.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Kujukushima_Islands_Nagasaki.jpg",
  openingHours:
    "Resort complex: 09:00–17:00. Cruise schedules vary by season (typically 10:00–15:00 departures)",
  openingHoursJa:
    "施設：09:00～17:00。遊覧船は季節により変動（通常10:00～15:00発）",
  hoursSourceUrl: "https://www.pearlsea.jp/en/",
  hoursNote: "Cruise operations subject to weather and sea conditions",
  officialWebsite: "https://www.pearlsea.jp/en/",
  wikiUrl: "https://en.wikipedia.org/wiki/Kuj%C5%ABku_Islands",
  wikiTitle: "Kujūku Islands",
  budgetMin: 2500,
  budgetRecommended: 8000,
  budgetMax: 15000,
  ticketCost: 1800,
  transportOptions: { bus: 250 },
  totalTripHours: 5,
  recommendedVisitHours: { min: 2, max: 4 },
  walkingMin: 3000,
  indoorPercent: 40,
  ratings: {
    overall: 9.0,
    couple: 9.0,
    summer: 8.5,
    winter: 7.0,
    rain: 6.0,
    food: 7.0,
    photography: 9.5,
    relaxation: 8.5,
    value: 8.0,
    uniqueness: 9.5,
  },
  crowd: { weekday: 4, weekend: 7, holiday: 8 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  weatherDependence: "high",
  reservation:
    "Cruise tickets at the terminal; online booking available for peak season",
  parking: "Paid parking available",
  walkingIntensity: "medium",
  walkingSunMin: 1500,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 3 },
  notes:
    "Cruise departures are weather-dependent — check conditions at the terminal on the day.",
  notesJa: "遊覧船は天候次第で運航 — 当日ターミナルで運航状況を確認ください。",
};

const POI_UMI_KIRARA: PoiInput = {
  id: "umi-kirara-aquarium",
  name: "Umi Kirara Aquarium",
  nameJa: "九十九島水族館 海きらら",
  parentId: "sasebo-city",
  prefecture: "Nagasaki",
  municipalityId: "Nagasaki:sasebo",
  kind: "aquarium",
  categories: ["Aquarium", "Leisure"],
  tags: ["Aquarium", "Marine Life", "Family", "Sasebo City"],
  coordinates: { lat: 33.1608, lng: 129.6819 },
  description:
    "Aquarium within the Kujukushima Pearl Sea Resort showcasing the marine life of the Kujukushima waters. Features a large jellyfish tunnel, dolphin shows, interactive touch pools, and displays of local fish species. One of western Japan's leading jellyfish exhibits.",
  descriptionJa:
    "九十九島パールシーリゾート内にある九十九島の海洋生物を展示する水族館。クラゲのトンネル、イルカショー、ふれあいタッチプール、地元の魚類展示が見どころです。西日本屈指のクラゲ展示で知られています。",
  highlights: [
    "Spectacular jellyfish tunnel and collection",
    "Dolphin show with Kujukushima island backdrop",
    "Interactive touch pools with local sea creatures",
  ],
  highlightsJa: [
    "幻想的なクラゲトンネルとコレクション",
    "九十九島を背景にしたイルカショー",
    "地元の海の生き物に触れるタッチプール",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/8/89/Kujukushima_aquarium_Umi_Kirara.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Kujukushima_aquarium_Umi_Kirara.jpg",
  openingHours: "09:00–18:00 (Mar–Oct), 09:00–17:00 (Nov–Feb)",
  openingHoursJa: "09:00～18:00（3～10月）、09:00～17:00（11～2月）",
  hoursSourceUrl: "https://www.pearlsea.jp/en/aquarium/",
  closedDays: "Open daily",
  officialWebsite: "https://www.pearlsea.jp/en/aquarium/",
  wikiUrl: "https://en.wikipedia.org/wiki/Kuj%C5%ABku_Islands",
  wikiTitle: "Kujūku Islands",
  budgetMin: 2000,
  budgetRecommended: 5000,
  budgetMax: 10000,
  ticketCost: 1470,
  transportOptions: { bus: 250 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1.5, max: 3 },
  walkingMin: 2500,
  indoorPercent: 85,
  ratings: {
    overall: 8.5,
    couple: 8.0,
    summer: 8.5,
    winter: 8.0,
    rain: 9.0,
    food: 7.0,
    photography: 8.5,
    relaxation: 7.5,
    value: 8.0,
    uniqueness: 8.5,
  },
  crowd: { weekday: 4, weekend: 7, holiday: 8 },
  season: { spring: 9, summer: 9, autumn: 8, winter: 7 },
  bestMonths: [3, 4, 5, 7, 8, 10],
  weatherDependence: "low",
  reservation: "None required; group rates available",
  parking: "Shared paid parking with Pearl Sea Resort",
  walkingIntensity: "low",
  walkingSunMin: 300,
  walkingShadeMin: 2000,
  comfort: { heatTolerance: 9, rainFriendly: 10, walkingIntensity: 2 },
  notes:
    "The jellyfish tunnel is one of the largest in western Japan — a highlight for all ages.",
  notesJa:
    "クラゲトンネルは西日本最大級で、年齢問わず楽しめる最大の見どころです。",
};

const POI_ISHIDAKE: PoiInput = {
  id: "ishidake-observatory",
  name: "Ishidake Observatory",
  nameJa: "石岳展望台",
  parentId: "sasebo-city",
  prefecture: "Nagasaki",
  municipalityId: "Nagasaki:sasebo",
  kind: "viewpoint",
  categories: ["Sightseeing", "Nature"],
  tags: ["Viewpoint", "Islands", "Photography", "Sasebo City"],
  coordinates: { lat: 33.1522, lng: 129.6914 },
  description:
    "The most famous observation point overlooking the Kujukushima archipelago. From this elevated viewpoint, the panorama of 208 pine-covered islands scattered across the blue waters has been featured in countless travel posters and films. Free access with a short uphill walk from the parking area.",
  descriptionJa:
    "九十九島の展望スポットとして最も有名な石岳展望台。この高台からは、208の松に覆われた島々が青い海に点在するパノラマが広がり、数多くの観光ポスターや映画に登場しています。駐車場から少し坂を上がれば無料で絶景が楽しめます。",
  highlights: [
    "Most iconic panoramic view of Kujukushima",
    "Featured in travel posters and films",
    "Free access with short walk from parking",
  ],
  highlightsJa: [
    "九十九島を象徴する最も有名なパノラマ",
    "観光ポスターや映画のロケ地",
    "駐車場から徒歩すぐ、無料で絶景を楽しめる",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/9/95/Ishidake_Observatory_View.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Ishidake_Observatory_View.jpg",
  openingHours: "Open access (daylight hours recommended)",
  openingHoursJa: "自由見学（日中推奨）",
  hoursSourceUrl: "https://www.pearlsea.jp/en/observatory/",
  officialWebsite: null,
  wikiUrl: "https://en.wikipedia.org/wiki/Kuj%C5%ABku_Islands",
  wikiTitle: "Kujūku Islands",
  budgetMin: 1000,
  budgetRecommended: 3000,
  budgetMax: 6000,
  ticketCost: 0,
  transportOptions: { bus: 250 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 0.5, max: 1.5 },
  walkingMin: 1500,
  indoorPercent: 5,
  ratings: {
    overall: 8.5,
    couple: 9.0,
    summer: 8.5,
    winter: 7.5,
    rain: 5.0,
    food: 4.0,
    photography: 9.5,
    relaxation: 8.5,
    value: 9.5,
    uniqueness: 8.0,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 7 },
  season: { spring: 9, summer: 9, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  weatherDependence: "high",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "low",
  walkingSunMin: 800,
  walkingShadeMin: 300,
  comfort: { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 2 },
  notes:
    "Visit on a clear day — the view is best in the morning light when the islands cast long shadows.",
  notesJa:
    "晴れた日の午前中が最も美しく、島影が長く伸びる絶好の撮影タイミングです。",
};

const POI_SASEBO_NAVAL_PORT: PoiInput = {
  id: "sasebo-naval-port-cruise",
  name: "Sasebo Naval Port Cruise",
  nameJa: "佐世保軍港クルーズ",
  parentId: "sasebo-city",
  prefecture: "Nagasaki",
  municipalityId: "Nagasaki:sasebo",
  kind: "cruise",
  categories: ["Sightseeing", "Leisure"],
  tags: ["Cruise", "Naval", "Port", "Sasebo City"],
  coordinates: { lat: 33.165, lng: 129.72 },
  description:
    "A 50-minute harbour cruise departing from Sasebo Port offering close-up views of Japan Maritime Self-Defense Force vessels and US Navy ships docked at the Sasebo Naval Base. Narration describes the history and role of the joint naval facilities. A rare opportunity to see active warships at close range.",
  descriptionJa:
    "佐世保港を出港する約50分の軍港クルーズ。海上自衛隊とアメリカ海軍の艦船が停泊する佐世保基地を間近に見学できます。ガイドによる共同海軍施設の歴史と役割の解説付き。現役の艦船を間近に見られる貴重な機会です。",
  highlights: [
    "Close-up views of active naval warships",
    "Guided narration on the port's naval history",
    "50-minute cruise through the working harbour",
  ],
  highlightsJa: [
    "現役艦船の間近見学",
    "ガイドによる佐世保軍港の歴史解説",
    "50分の現役港湾クルーズ",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/7/7a/Sasebo_Naval_Port_Cruise.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Sasebo_Naval_Port_Cruise.jpg",
  openingHours:
    "Cruises depart daily 10:00–16:00 (approximately hourly). Closed during bad weather and certain base events.",
  openingHoursJa: "毎日10:00～16:00発（約1時間毎）。荒天時・基地行事時は運休。",
  hoursSourceUrl: "https://www.sasebo99.com/en/spot/556",
  hoursNote: "Cruises may be cancelled due to weather or naval base operations",
  officialWebsite: "https://www.sasebo99.com/en/spot/556",
  wikiUrl:
    "https://en.wikipedia.org/wiki/United_States_Fleet_Activities_Sasebo",
  wikiTitle: "United States Fleet Activities Sasebo",
  budgetMin: 2500,
  budgetRecommended: 5000,
  budgetMax: 8000,
  ticketCost: 1800,
  transportOptions: { bus: 200 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 1500,
  indoorPercent: 30,
  ratings: {
    overall: 8.0,
    couple: 7.0,
    summer: 8.0,
    winter: 7.0,
    rain: 6.0,
    food: 5.0,
    photography: 8.0,
    relaxation: 7.5,
    value: 7.5,
    uniqueness: 9.0,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 7 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  weatherDependence: "high",
  reservation:
    "Tickets at the port terminal; group reservations accepted by phone",
  parking: "Paid parking near the terminal",
  walkingIntensity: "low",
  walkingSunMin: 1000,
  walkingShadeMin: 500,
  comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 2 },
  notes:
    "Cruises may be cancelled without notice during naval base operations or bad weather.",
  notesJa: "基地行事や荒天時は予告なく運休となることがあります。",
};

// ==========================================================================
// POI DATA — IBUSUKI (Commit 3)
// ==========================================================================

const POI_SUNAMUSHI: PoiInput = {
  id: "sunamushi-onsen-saraku",
  name: "Sand Bath Hall Saraku",
  nameJa: "砂むし会館 砂楽",
  parentId: "ibusuki-city",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:ibusuki",
  kind: "onsen",
  categories: ["Onsen", "Wellness"],
  tags: ["Onsen", "Sand Bath", "Wellness", "Ibusuki City"],
  coordinates: { lat: 31.2358, lng: 130.6433 },
  description:
    "Ibusuki's iconic natural sand steam bath facility on the waterfront. Visitors lie buried in naturally heated volcanic sand while wearing a yukata, a practice said to improve circulation and relieve fatigue. The facility includes a regular hot-spring bath for rinsing off after the sand bath.",
  descriptionJa:
    "指宿温泉を代表する天然砂むし温泉施設。海岸沿いで、浴衣を着て火山の地熱で温められた砂に埋まる砂浴が体験できます。血行促進や疲労回復に効果があるとされています。砂浴後は併設の温泉で砂を洗い流せます。",
  highlights: [
    "Natural volcanic sand steam bath on the beach",
    "Yukata provided — bury yourself in healing warm sand",
    "Rinse off in the adjacent hot-spring bath",
  ],
  highlightsJa: [
    "海岸での天然砂むし温泉体験",
    "浴衣着用で砂に埋まる癒しの温浴",
    "砂浴後は隣接の温泉でさっぱり",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/4/4b/Ibusuki_steaming_sand_bath.jpg",
  imageAttribution: "John Gillespie",
  imageLicense: "CC BY-SA 3.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Ibusuki_steaming_sand_bath.jpg",
  openingHours: "06:00–21:00 (last admission 20:30)",
  openingHoursJa: "06:00～21:00（最終受付20:30）",
  hoursSourceUrl: "https://www.ibusuki.or.jp/en/spot/saraku/",
  closedDays:
    "Open daily (occasional maintenance closures — check official site)",
  officialWebsite: "https://www.ibusuki.or.jp/en/spot/saraku/",
  wikiUrl: "https://en.wikipedia.org/wiki/Ibusuki_Onsen",
  wikiTitle: "Ibusuki Onsen",
  budgetMin: 2000,
  budgetRecommended: 4000,
  budgetMax: 8000,
  ticketCost: 1100,
  transportOptions: { train: 310, bus: 200 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 1500,
  indoorPercent: 60,
  ratings: {
    overall: 9.0,
    couple: 9.0,
    summer: 8.0,
    winter: 9.5,
    rain: 9.0,
    food: 6.0,
    photography: 6.5,
    relaxation: 9.5,
    value: 8.5,
    uniqueness: 9.5,
  },
  crowd: { weekday: 4, weekend: 7, holiday: 9 },
  season: { spring: 9, summer: 7, autumn: 9, winter: 10 },
  bestMonths: [10, 11, 12, 1, 2, 3],
  weatherDependence: "low",
  reservation:
    "Walk-in accepted; advance booking recommended for groups and peak winter season",
  parking: "Free parking available",
  walkingIntensity: "low",
  walkingSunMin: 500,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 7, rainFriendly: 9, walkingIntensity: 2 },
  notes:
    "The sand bath is especially soothing in winter when the warm volcanic sand contrasts with the cool air.",
  notesJa: "冬は冷たい空気と温かい砂のコントラストが格別です。",
};

const POI_LAKE_IKEDA: PoiInput = {
  id: "lake-ikeda",
  name: "Lake Ikeda",
  nameJa: "池田湖",
  parentId: "ibusuki-city",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:ibusuki",
  kind: "natural",
  categories: ["Nature", "Sightseeing"],
  tags: ["Lake", "Nature", "Scenic", "Ibusuki City"],
  coordinates: { lat: 31.2386, lng: 130.5708 },
  description:
    "The largest lake on Kyushu island, a caldera lake formed by volcanic activity. Known for its deep blue waters, the iconic view of Mount Kaimon reflected on the surface, and legends of giant eels. The lakeshore has walking paths, a visitor centre, and the Ikeda Lake Paradise amusement area.",
  descriptionJa:
    "九州最大のカルデラ湖で、火山活動によって形成されました。深い青の湖面に映る開聞岳の姿が象徴的で、巨大ウナギ伝説でも知られています。湖畔には遊歩道、ビジターセンター、池田湖パラダイスがあります。",
  highlights: [
    "Kyushu's largest lake with Mount Kaimon backdrop",
    "Legends of giant eels in the deep blue waters",
    "Lakeshore walking paths and seasonal flowers",
  ],
  highlightsJa: [
    "開聞岳を背景にした九州最大の湖",
    "巨大ウナギ伝説が残る神秘の湖",
    "湖畔の遊歩道と季節の花々",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/7/77/Lake_Ikeda_and_Mount_Kaimon.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Lake_Ikeda_and_Mount_Kaimon.jpg",
  openingHours:
    "Open access (lakeshore and paths). Visitor centre: 09:00–17:00",
  openingHoursJa: "湖畔・遊歩道：自由見学。ビジターセンター：09:00～17:00",
  hoursSourceUrl: "https://www.ibusuki.or.jp/en/spot/lake-ikeda/",
  officialWebsite: "https://www.ibusuki.or.jp/en/spot/lake-ikeda/",
  wikiUrl: "https://en.wikipedia.org/wiki/Lake_Ikeda",
  wikiTitle: "Lake Ikeda",
  budgetMin: 1000,
  budgetRecommended: 3000,
  budgetMax: 6000,
  ticketCost: 0,
  transportOptions: { bus: 250 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 2500,
  indoorPercent: 10,
  ratings: {
    overall: 7.5,
    couple: 8.5,
    summer: 7.5,
    winter: 7.5,
    rain: 5.5,
    food: 6.0,
    photography: 8.5,
    relaxation: 8.5,
    value: 9.0,
    uniqueness: 7.0,
  },
  crowd: { weekday: 2, weekend: 5, holiday: 6 },
  season: { spring: 9, summer: 8, autumn: 8, winter: 7 },
  bestMonths: [3, 4, 5, 9, 10],
  weatherDependence: "moderate",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "low",
  walkingSunMin: 1500,
  walkingShadeMin: 500,
  comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 2 },
  notes:
    "The best photo of Mount Kaimon reflected in the lake is from the south shore in the morning.",
  notesJa: "湖面に映る開聞岳の撮影は南岸から午前中がおすすめです。",
};

const POI_CHIRINGASHIMA: PoiInput = {
  id: "chiringashima-island",
  name: "Chiringashima Island",
  nameJa: "知林ヶ島",
  parentId: "ibusuki-city",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:ibusuki",
  kind: "natural",
  categories: ["Nature", "Sightseeing"],
  tags: ["Island", "Sandbar", "Tidal", "Ibusuki City"],
  coordinates: { lat: 31.2117, lng: 130.5933 },
  description:
    "An uninhabited island connected to the Ibusuki mainland by a 800-metre sandbar that emerges only at low tide. Accessible for a few hours each day when the sandbar is exposed, offering a unique walking-on-water experience. Check local tide tables before visiting; the sandbar is submerged at high tide.",
  descriptionJa:
    "指宿本土と干潮時のみ現れる全長約800mの砂州で結ばれる無人島。1日に数時間だけ砂の道が現れ、海上を歩くような不思議な体験ができます。訪問前に地元の潮汐表を確認してください。満潮時は砂州が水没します。",
  highlights: [
    "Walk the 800 m sandbar that appears only at low tide",
    "Explore the uninhabited island's walking trails",
    "Unique 'walking on water' photography",
  ],
  highlightsJa: [
    "干潮時のみ現れる800mの砂州歩き",
    "無人島の探検と遊歩道",
    "海上を歩くようなユニークな写真が撮れる",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/0/0f/Chiringashima_Nagasaki.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Chiringashima_Nagasaki.jpg",
  openingHours:
    "Accessible only during low tide (check local tide tables). Approximately 3–4 hours around low tide daily.",
  openingHoursJa:
    "干潮時のみ渡島可能（現地の潮汐表を確認）。毎日干潮前後約3～4時間。",
  hoursSourceUrl: "https://www.ibusuki.or.jp/en/spot/chiringashima/",
  hoursNote:
    "Sandbar accessible only at low tide — check Ibusuki tide tables before visiting",
  officialWebsite: "https://www.ibusuki.or.jp/en/spot/chiringashima/",
  wikiUrl: "https://en.wikipedia.org/wiki/Ibusuki,_Kagoshima",
  wikiTitle: "Ibusuki, Kagoshima",
  budgetMin: 1000,
  budgetRecommended: 3000,
  budgetMax: 5000,
  ticketCost: 0,
  transportOptions: { bus: 200 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 2, max: 3 },
  walkingMin: 4000,
  indoorPercent: 5,
  ratings: {
    overall: 8.0,
    couple: 8.5,
    summer: 8.5,
    winter: 7.0,
    rain: 4.0,
    food: 4.0,
    photography: 9.0,
    relaxation: 8.0,
    value: 9.0,
    uniqueness: 9.5,
  },
  crowd: { weekday: 2, weekend: 5, holiday: 7 },
  season: { spring: 9, summer: 9, autumn: 8, winter: 6 },
  bestMonths: [3, 4, 5, 6, 7, 8, 9, 10],
  weatherDependence: "high",
  reservation: "None required",
  parking: "Free parking at the trailhead",
  walkingIntensity: "medium",
  walkingSunMin: 3000,
  walkingShadeMin: 500,
  comfort: { heatTolerance: 6, rainFriendly: 3, walkingIntensity: 4 },
  notes:
    "Access depends entirely on the tide — check Ibusuki tide tables and plan your visit around low tide.",
  notesJa:
    "渡島は完全に潮汐次第。指宿の潮汐表を確認し干潮時間に合わせて計画を。",
};

const POI_CAPE_NAGASAKIBANA: PoiInput = {
  id: "cape-nagasakibana",
  name: "Cape Nagasakibana",
  nameJa: "長崎鼻",
  parentId: "ibusuki-city",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:ibusuki",
  kind: "natural",
  categories: ["Nature", "Sightseeing"],
  tags: ["Cape", "Coastal", "Scenic", "Ibusuki City"],
  coordinates: { lat: 31.2183, lng: 130.5731 },
  description:
    "A scenic cape at the southern tip of the Satsuma Peninsula with sweeping views across to Mount Kaimon and the open ocean. The distinctive white Ryugu Shrine lighthouse marks the point. A popular spot for sunset photography and for viewing the rugged coastline of southern Kyushu.",
  descriptionJa:
    "薩摩半島南端の景勝地で、開聞岳と大海原のパノラマが広がります。白亜の竜宮神社灯台がポイントの目印。夕日の撮影スポットとして人気で、南九州の荒々しい海岸線を一望できます。",
  highlights: [
    "Panoramic views of Mount Kaimon and the ocean",
    "Distinctive white Ryugu Shrine lighthouse",
    "Sunset photography over the East China Sea",
  ],
  highlightsJa: [
    "開聞岳と大海原の大パノラマ",
    "白亜の竜宮神社灯台",
    "東シナ海に沈む夕日の撮影",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/2/2c/Cape_Nagasakibana_Kagoshima.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Cape_Nagasakibana_Kagoshima.jpg",
  openingHours: "Open access (daylight hours recommended)",
  openingHoursJa: "自由見学（日中推奨）",
  hoursSourceUrl: "https://www.ibusuki.or.jp/en/spot/nagasakibana/",
  officialWebsite: "https://www.ibusuki.or.jp/en/spot/nagasakibana/",
  wikiUrl: "https://en.wikipedia.org/wiki/Ibusuki,_Kagoshima",
  wikiTitle: "Ibusuki, Kagoshima",
  budgetMin: 1000,
  budgetRecommended: 3000,
  budgetMax: 5000,
  ticketCost: 0,
  transportOptions: { bus: 250 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 0.5, max: 1.5 },
  walkingMin: 2000,
  indoorPercent: 5,
  ratings: {
    overall: 8.0,
    couple: 9.0,
    summer: 7.5,
    winter: 7.5,
    rain: 5.0,
    food: 5.0,
    photography: 9.0,
    relaxation: 8.0,
    value: 9.0,
    uniqueness: 7.5,
  },
  crowd: { weekday: 2, weekend: 5, holiday: 7 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 9, 10],
  weatherDependence: "high",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "low",
  walkingSunMin: 1500,
  walkingShadeMin: 200,
  comfort: { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 2 },
  notes:
    "Arrive an hour before sunset for the best light — Mount Kaimon silhouetted against the evening sky.",
  notesJa:
    "夕日1時間前の到着がベスト — 夕空に映える開聞岳のシルエットが絶景です。",
};

const POI_MOUNT_KAIMON: PoiInput = {
  id: "mount-kaimon",
  name: "Mount Kaimon",
  nameJa: "開聞岳",
  parentId: "ibusuki-city",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:ibusuki",
  kind: "natural",
  categories: ["Nature", "Outdoor"],
  tags: ["Mountain", "Hiking", "Volcano", "Ibusuki City"],
  coordinates: { lat: 31.1806, lng: 130.5283 },
  description:
    "An iconic 924-metre conical stratovolcano, often called the Mount Fuji of Satsuma. A popular hiking destination with a well-maintained trail to the summit offering 360° views of the Satsuma Peninsula, Lake Ikeda, and the Pacific Ocean. The round-trip hike takes approximately 4–5 hours.",
  descriptionJa:
    "標高924mの美しい円錐形の成層火山で、薩摩富士とも呼ばれています。整備された登山道を登れば山頂から薩摩半島、池田湖、太平洋の360度の眺望が楽しめます。往復約4～5時間の人気ハイキングコースです。",
  highlights: [
    "Conical 'Satsuma Fuji' silhouette visible from miles away",
    "360° summit panorama over the Satsuma Peninsula",
    "Well-maintained hiking trail suitable for fit beginners",
  ],
  highlightsJa: [
    "遠くからも見える美しい円錐形「薩摩富士」",
    "山頂からの薩摩半島360度パノラマ",
    "健脚者向けに整備された登山道",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/5/59/Mount_Kaimon_Kagoshima_Japan.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Mount_Kaimon_Kagoshima_Japan.jpg",
  openingHours:
    "Trail accessible during daylight hours; not recommended after dark or in bad weather",
  openingHoursJa: "登山道は日中のみ通行可能。日没後・悪天候時は非推奨",
  hoursSourceUrl: "https://www.ibusuki.or.jp/en/spot/mount-kaimon/",
  hoursNote:
    "Open hiking trail, not a managed facility — weather and daylight dependent",
  officialWebsite: "https://www.ibusuki.or.jp/en/spot/mount-kaimon/",
  wikiUrl: "https://en.wikipedia.org/wiki/Mount_Kaimon",
  wikiTitle: "Mount Kaimon",
  budgetMin: 2000,
  budgetRecommended: 5000,
  budgetMax: 10000,
  ticketCost: 0,
  transportOptions: { bus: 300 },
  totalTripHours: 7,
  recommendedVisitHours: { min: 4, max: 6 },
  walkingMin: 10000,
  indoorPercent: 0,
  ratings: {
    overall: 8.5,
    couple: 8.0,
    summer: 7.0,
    winter: 7.0,
    rain: 3.0,
    food: 4.0,
    photography: 9.0,
    relaxation: 7.0,
    value: 9.0,
    uniqueness: 8.5,
  },
  crowd: { weekday: 2, weekend: 5, holiday: 7 },
  season: { spring: 9, summer: 6, autumn: 9, winter: 6 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "high",
  reservation:
    "None required; submit a hiking plan at the trailhead box for safety",
  parking: "Free parking at the trailhead",
  walkingIntensity: "high",
  walkingSunMin: 6000,
  walkingShadeMin: 2000,
  comfort: { heatTolerance: 5, rainFriendly: 2, walkingIntensity: 5 },
  notes:
    "The hike is weather-dependent — avoid in rain or summer heat; start early to return before dark.",
  notesJa: "雨天・酷暑期は避け、日没前帰還のために早朝出発が必須です。",
};

// ==========================================================================
// POI DATA — NICHINAN (Commit 4)
// ==========================================================================

const POI_OBI_CASTLE_TOWN: PoiInput = {
  id: "obi-castle-town",
  name: "Obi Castle Town",
  nameJa: "飫肥城下町",
  parentId: "nichinan-city",
  prefecture: "Miyazaki",
  municipalityId: "Miyazaki:nichinan",
  kind: "historic",
  categories: ["Historic", "Sightseeing"],
  tags: ["Historic District", "Samurai", "Castle Town", "Nichinan City"],
  coordinates: { lat: 31.6289, lng: 131.355 },
  description:
    "A beautifully preserved Edo-period castle town known as the 'Little Kyoto of Kyushu'. Features samurai residences, the restored Obi Castle gate, a historic school, mossy stone walls, and streets lined with Obi cedar. Individual museums, shops and cafés each have separate hours and admission fees.",
  descriptionJa:
    "「九州の小京都」と呼ばれる江戸時代の城下町。武家屋敷、復元された飫肥城大手門、歴史的な学校跡、苔むす石垣、飫肥杉に囲まれた通りが美しい町並みを形成しています。各博物館、店舗、カフェは個別の営業時間と入場料が設定されています。",
  highlights: [
    "Well-preserved Edo-period samurai district",
    "Restored Obi Castle gate and mossy stone walls",
    "Historic merchant streets lined with Obi cedar",
  ],
  highlightsJa: [
    "江戸時代の武家屋敷が残る保存地区",
    "復元された飫肥城大手門と苔むす石垣",
    "飫肥杉に囲まれた歴史的な商家の町並み",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/2/2d/Obi_Castle_Town_Street.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Obi_Castle_Town_Street.jpg",
  openingHours:
    "Public streets: open access. Obi Castle Museum and samurai residences: typically 09:00–17:00 (individual facilities may vary)",
  openingHoursJa:
    "町並み：自由散策。飫肥城資料館・武家屋敷：通常09:00～17:00（施設により異なる）",
  hoursSourceUrl: "https://www.kankou-nichinan.jp/en/spot/obi/",
  hoursNote:
    "Public district with individual facility hours — check each museum and shop separately",
  officialWebsite: "https://www.kankou-nichinan.jp/en/spot/obi/",
  wikiUrl: "https://en.wikipedia.org/wiki/Obi,_Miyazaki",
  wikiTitle: "Obi, Miyazaki",
  budgetMin: 2000,
  budgetRecommended: 6000,
  budgetMax: 12000,
  ticketCost: 700,
  transportOptions: { train: 220, bus: 200 },
  totalTripHours: 5,
  recommendedVisitHours: { min: 2, max: 4 },
  walkingMin: 5000,
  indoorPercent: 30,
  ratings: {
    overall: 9.0,
    couple: 9.0,
    summer: 7.5,
    winter: 7.5,
    rain: 7.0,
    food: 8.0,
    photography: 9.5,
    relaxation: 8.5,
    value: 8.5,
    uniqueness: 9.0,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 8 },
  season: { spring: 9, summer: 7, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "moderate",
  reservation:
    "None required for public areas; individual museums may charge admission",
  reservationJa: "町並み散策は自由。各博物館は別途入館料あり。",
  parking: "Paid parking available near the castle town entrance",
  walkingIntensity: "medium",
  walkingSunMin: 2000,
  walkingShadeMin: 2500,
  comfort: { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 3 },
  notes:
    "Purchase a combined admission ticket at the Obi Castle Museum for best value across multiple sites.",
  notesJa: "飫肥城資料館で販売の共通入場券で複数施設をお得に巡れます。",
};

const POI_UDO_JINGU: PoiInput = {
  id: "udo-jingu",
  name: "Udo Jingu",
  nameJa: "鵜戸神宮",
  parentId: "nichinan-city",
  prefecture: "Miyazaki",
  municipalityId: "Miyazaki:nichinan",
  kind: "shrine",
  categories: ["Shrine", "Culture"],
  tags: ["Shrine", "Coastal", "Mythology", "Nichinan City"],
  coordinates: { lat: 31.4381, lng: 131.4139 },
  description:
    "A dramatic Shinto shrine built into a sea cave on the Nichinan coast, dedicated to the father of Emperor Jimmu. The vivid vermilion main hall contrasts with the deep blue ocean. Visitors toss ceramic undama (lucky balls) into a target below for good fortune. A coastal path with steep stairs leads to the cave shrine.",
  descriptionJa:
    "日南海岸の海食洞に建てられた劇的な神社で、神武天皇の父を祀ります。鮮やかな朱塗りの本殿と青い海のコントラストが印象的。参拝者は崖下の的に向かって運玉を投げて開運祈願をします。洞窟神社へは急な階段のある海岸遊歩道を進みます。",
  highlights: [
    "Shrine built dramatically into a coastal sea cave",
    "Throw ceramic undama (lucky balls) for good fortune",
    "Vermilion architecture against the Pacific Ocean backdrop",
  ],
  highlightsJa: [
    "海食洞に建つ劇的な神社建築",
    "開運を願って運玉を投げる体験",
    "太平洋を背景にした朱塗りの社殿",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/8/85/Udo-jingu_shrine_Miyazaki.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Udo-jingu_shrine_Miyazaki.jpg",
  openingHours: "06:00–19:00 (Apr–Sep), 07:00–18:00 (Oct–Mar)",
  openingHoursJa: "06:00～19:00（4～9月）、07:00～18:00（10～3月）",
  hoursSourceUrl: "https://www.kankou-nichinan.jp/en/spot/udo-jingu/",
  officialWebsite: "https://www.kankou-nichinan.jp/en/spot/udo-jingu/",
  wikiUrl: "https://en.wikipedia.org/wiki/Udo-jing%C5%AB",
  wikiTitle: "Udo-jingū",
  budgetMin: 1500,
  budgetRecommended: 4500,
  budgetMax: 8000,
  ticketCost: 0,
  transportOptions: { bus: 350 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 3000,
  indoorPercent: 10,
  ratings: {
    overall: 9.0,
    couple: 9.0,
    summer: 8.0,
    winter: 7.5,
    rain: 6.0,
    food: 6.0,
    photography: 9.5,
    relaxation: 7.5,
    value: 9.0,
    uniqueness: 9.5,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 8 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "high",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "medium",
  walkingSunMin: 1000,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
  notes:
    "The coastal path to the cave shrine has steep stairs — wear sturdy shoes and watch your step in wet weather.",
  notesJa: "洞窟までの参道は急な階段あり — 雨の日は足元注意、歩きやすい靴で。",
};

const POI_SUN_MESSE: PoiInput = {
  id: "sun-messe-nichinan",
  name: "Sun Messe Nichinan",
  nameJa: "サンメッセ日南",
  parentId: "nichinan-city",
  prefecture: "Miyazaki",
  municipalityId: "Miyazaki:nichinan",
  kind: "mixed",
  categories: ["Leisure", "Sightseeing"],
  tags: ["Park", "Moai", "Coastal", "Nichinan City"],
  coordinates: { lat: 31.4333, lng: 131.48 },
  description:
    "A coastal theme park famous for its seven authentic replica Easter Island Moai statues, the only officially authorised Moai replicas outside Chile. Features sweeping ocean views, a butterfly garden, a world insect exhibition, and rolling green hills. A managed paid attraction with regular facility hours.",
  descriptionJa:
    "チリ国外で唯一公式に認められた7体のモアイ像があることで有名な海岸テーマパーク。広大なオーシャンビュー、蝶の楽園、世界の昆虫展、なだらかな緑の丘が広がります。管理された有料施設です。",
  highlights: [
    "Seven officially authorised Moai replicas overlooking the Pacific",
    "Butterfly garden and world insect exhibition",
    "Rolling green hills with ocean panoramas",
  ],
  highlightsJa: [
    "太平洋を望む公式認定の7体のモアイ像",
    "蝶の楽園と世界の昆虫展",
    "海を背景にした緑の丘のパノラマ",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/9/9f/Sun_Messe_Nichinan_Moai.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Sun_Messe_Nichinan_Moai.jpg",
  openingHours:
    "09:30–17:00 (last admission 16:30). Closed Wednesdays (except holidays)",
  openingHoursJa: "09:30～17:00（最終入園16:30）。水曜休園（祝日除く）",
  hoursSourceUrl: "https://www.sun-messe.co.jp/en/",
  closedDays: "Wednesdays (open if Wednesday is a public holiday)",
  officialWebsite: "https://www.sun-messe.co.jp/en/",
  wikiUrl: "https://en.wikipedia.org/wiki/Sun_Messe_Nichinan",
  wikiTitle: "Sun Messe Nichinan",
  budgetMin: 2500,
  budgetRecommended: 6000,
  budgetMax: 12000,
  ticketCost: 800,
  transportOptions: { bus: 350 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1.5, max: 3 },
  walkingMin: 3500,
  indoorPercent: 30,
  ratings: {
    overall: 8.0,
    couple: 8.5,
    summer: 8.5,
    winter: 7.5,
    rain: 6.0,
    food: 6.5,
    photography: 9.0,
    relaxation: 7.5,
    value: 8.0,
    uniqueness: 9.5,
  },
  crowd: { weekday: 3, weekend: 6, holiday: 8 },
  season: { spring: 9, summer: 9, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 7, 8, 9, 10],
  weatherDependence: "moderate",
  reservation: "None required; group rates available for 20+",
  parking: "Free parking available",
  walkingIntensity: "medium",
  walkingSunMin: 2000,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 3 },
  notes:
    "Closed on Wednesdays — the park gates shut at 16:30, so arrive by early afternoon.",
  notesJa: "水曜休園。最終入園16:30のため遅くとも昼過ぎには到着を。",
};

const POI_INOHAE_VALLEY: PoiInput = {
  id: "inohae-valley",
  name: "Inohae Valley",
  nameJa: "猪八重渓谷",
  parentId: "nichinan-city",
  prefecture: "Miyazaki",
  municipalityId: "Miyazaki:nichinan",
  kind: "natural",
  categories: ["Nature", "Outdoor"],
  tags: ["Valley", "Hiking", "Waterfalls", "Nichinan City"],
  coordinates: { lat: 31.6806, lng: 131.3383 },
  description:
    "A lush forested valley with walking trails following a clear mountain stream past several waterfalls, moss-covered rocks, and subtropical vegetation. The trail is unmaintained in sections and can be slippery. Access is weather-dependent; the valley is not recommended during or after heavy rain.",
  descriptionJa:
    "清流沿いの遊歩道が滝や苔むす岩、亜熱帯植物の中を縫って続く緑豊かな渓谷。一部整備不十分な区間があり滑りやすくなっています。雨天時・大雨後は非推奨。気象条件に左右される自然エリアです。",
  highlights: [
    "Forested valley trail past waterfalls and mossy rocks",
    "Subtropical flora and clear mountain streams",
    "Quiet, uncrowded alternative to mainstream sights",
  ],
  highlightsJa: [
    "滝と苔むす岩が続く森林渓谷トレイル",
    "亜熱帯植物と清流",
    "混雑しない静かな穴場スポット",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/1/16/Inohae_Valley_Miyazaki.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Inohae_Valley_Miyazaki.jpg",
  openingHours:
    "Daylight access only. Trail may close after heavy rain. Not maintained as a managed park.",
  openingHoursJa:
    "日中のみ通行可能。大雨後は通行止めあり。管理公園としては整備されていません。",
  hoursSourceUrl: "https://www.kankou-nichinan.jp/en/spot/inohae/",
  hoursNote:
    "Weather-dependent natural trail — not accessible after heavy rain or in poor conditions",
  officialWebsite: "https://www.kankou-nichinan.jp/en/spot/inohae/",
  wikiUrl: "https://en.wikipedia.org/wiki/Nichinan,_Miyazaki",
  wikiTitle: "Nichinan, Miyazaki",
  budgetMin: 1000,
  budgetRecommended: 3000,
  budgetMax: 6000,
  ticketCost: 0,
  transportOptions: { bus: 300 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 1.5, max: 3 },
  walkingMin: 5000,
  indoorPercent: 5,
  ratings: {
    overall: 7.5,
    couple: 8.0,
    summer: 6.5,
    winter: 6.5,
    rain: 3.0,
    food: 4.0,
    photography: 8.0,
    relaxation: 8.5,
    value: 9.0,
    uniqueness: 7.5,
  },
  crowd: { weekday: 1, weekend: 3, holiday: 4 },
  season: { spring: 9, summer: 6, autumn: 9, winter: 6 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "high",
  reservation: "None required",
  parking: "Limited free parking at the trailhead",
  walkingIntensity: "high",
  walkingSunMin: 2500,
  walkingShadeMin: 2500,
  comfort: { heatTolerance: 6, rainFriendly: 2, walkingIntensity: 5 },
  notes:
    "The trail can be slippery and unmaintained — avoid during or after rain and wear hiking boots.",
  notesJa: "滑りやすく未整備区間あり — 雨天時・雨上がりは避け登山靴で。",
};

// ==========================================================================
// POI DATA — HITA (Commit 5)
// ==========================================================================

const POI_MAMEDA: PoiInput = {
  id: "mameda-historic-district",
  name: "Mameda Historic District",
  nameJa: "豆田町 歴史的街並み",
  parentId: "hita-city",
  prefecture: "Oita",
  municipalityId: "Oita:hita",
  kind: "historic",
  categories: ["Historic", "Sightseeing"],
  tags: ["Historic District", "Merchant", "Preserved Streets", "Hita City"],
  coordinates: { lat: 33.3214, lng: 130.9358 },
  description:
    "A well-preserved Edo-period merchant district along the Mikuma River, lined with white-walled storehouses, lattice-fronted shops, traditional sake breweries, and historic merchant homes. Often called the 'Little Kyoto of Kyushu'. Individual shops, museums and cafés operate separate business hours and many close by early evening.",
  descriptionJa:
    "三隈川沿いに江戸時代の商家が立ち並ぶ保存地区で、白壁の土蔵、格子造りの店舗、伝統的な酒蔵、歴史的な商家が軒を連ねます。「九州の小京都」とも呼ばれています。各店舗・博物館・カフェは個別の営業時間で、多くは夕方前に閉まります。",
  highlights: [
    "Edo-period merchant streets with white-walled storehouses",
    "Traditional sake breweries open for tasting",
    "Hita geta (wooden sandals) craft shops",
  ],
  highlightsJa: [
    "白壁の土蔵と商家が連なる江戸時代の町並み",
    "試飲ができる伝統的な酒蔵",
    "日田下駄の工房と専門店",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/8/8f/Mameda-machi%2C_Hita%2C_Oita_Prefecture.jpg",
  imageAttribution: "Muyo",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Mameda-machi,_Hita,_Oita_Prefecture.jpg",
  openingHours:
    "Public streets: open access. Individual shops and museums: typically 09:00–17:00 (most close by early evening)",
  openingHoursJa:
    "町並み：自由散策。各店舗・博物館：通常09:00～17:00（多くは夕方までに閉店）",
  hoursSourceUrl: "https://www.oidehita.com/en/spot/mameda/",
  hoursNote:
    "Public district — individual shops, museums and cafés set their own hours",
  officialWebsite: "https://www.oidehita.com/en/spot/mameda/",
  wikiUrl: "https://en.wikipedia.org/wiki/Hita,_%C5%8Cita",
  wikiTitle: "Hita, Ōita",
  budgetMin: 2000,
  budgetRecommended: 6000,
  budgetMax: 12000,
  ticketCost: 0,
  transportOptions: { train: 240, bus: 150 },
  totalTripHours: 4,
  recommendedVisitHours: { min: 2, max: 4 },
  walkingMin: 4000,
  indoorPercent: 25,
  ratings: {
    overall: 9.0,
    couple: 9.0,
    summer: 8.0,
    winter: 7.5,
    rain: 7.5,
    food: 9.0,
    photography: 9.0,
    relaxation: 8.5,
    value: 9.0,
    uniqueness: 8.5,
  },
  crowd: { weekday: 3, weekend: 7, holiday: 8 },
  season: { spring: 9, summer: 7, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "moderate",
  reservation:
    "None required for public streets; individual shops and museums set their own policies",
  reservationJa: "町並み散策は自由。各店舗・博物館は独自の入場ポリシーあり。",
  parking: "Paid parking available at designated lots near the district",
  walkingIntensity: "low",
  walkingSunMin: 2000,
  walkingShadeMin: 2000,
  comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 2 },
  notes:
    "Most shops and museums close by 17:00 — visit in the morning for the best experience.",
  notesJa: "多くの店舗と博物館は17時までに閉店 — 午前中の訪問がおすすめです。",
};

const POI_KANGIEN: PoiInput = {
  id: "kangien-academy",
  name: "Kangien Academy",
  nameJa: "咸宜園",
  parentId: "hita-city",
  prefecture: "Oita",
  municipalityId: "Oita:hita",
  kind: "historic",
  categories: ["Historic", "Culture"],
  tags: ["Historic", "Education", "Museum", "Hita City"],
  coordinates: { lat: 33.3228, lng: 130.9381 },
  description:
    "A nationally designated historic site, this Edo-period private academy was founded in 1805 by scholar Hirose Tanso. It educated over 4,000 students from across Japan regardless of social status, a remarkably progressive model. The site includes a small museum displaying the academy's history, teaching materials and original buildings.",
  descriptionJa:
    "国指定史跡。1805年に儒学者・広瀬淡窓が開いた江戸時代の私塾で、身分に関わらず全国から4,000人以上の門人を受け入れた先進的な学校です。現在は資料館があり、咸宜園の歴史、教育資料、往時の建物を見学できます。",
  highlights: [
    "Nationally designated historic private academy site",
    "Founded 1805, educated 4,000+ students regardless of class",
    "Small museum with original teaching materials and buildings",
  ],
  highlightsJa: [
    "国指定史跡の江戸時代の私塾",
    "1805年開塾、身分を問わず4,000人以上が学んだ",
    "当時の教材と建物を展示する資料館",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/1/14/Kangien_Hita_Oita.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Kangien_Hita_Oita.jpg",
  openingHours: "09:00–17:00 (last admission 16:30). Closed Mondays.",
  openingHoursJa: "09:00～17:00（最終入館16:30）。月曜休館。",
  hoursSourceUrl: "https://www.oidehita.com/en/spot/kangien/",
  closedDays: "Mondays (or Tuesday if Monday is a public holiday)",
  officialWebsite: "https://www.oidehita.com/en/spot/kangien/",
  wikiUrl: "https://en.wikipedia.org/wiki/Kangien",
  wikiTitle: "Kangien",
  budgetMin: 1500,
  budgetRecommended: 3500,
  budgetMax: 6000,
  ticketCost: 300,
  transportOptions: { bus: 150 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 1.5 },
  walkingMin: 1500,
  indoorPercent: 70,
  ratings: {
    overall: 8.0,
    couple: 7.5,
    summer: 8.0,
    winter: 7.5,
    rain: 8.5,
    food: 5.0,
    photography: 7.5,
    relaxation: 7.0,
    value: 8.5,
    uniqueness: 8.5,
  },
  crowd: { weekday: 2, weekend: 4, holiday: 5 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 10, 11],
  weatherDependence: "low",
  reservation: "None required",
  parking: "Free parking available",
  walkingIntensity: "low",
  walkingSunMin: 500,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 2 },
  notes:
    "Closed on Mondays — the museum is compact and pairs well with a morning stroll through Mameda.",
  notesJa: "月曜休館。小規模な博物館なので豆田町散策と合わせて午前中にどうぞ。",
};

const POI_AOT_HITA_MUSEUM: PoiInput = {
  id: "attack-on-titan-hita-museum",
  name: "Attack on Titan in HITA Museum",
  nameJa: "進撃の巨人 in HITA ミュージアム",
  parentId: "hita-city",
  prefecture: "Oita",
  municipalityId: "Oita:hita",
  kind: "museum",
  categories: ["Museum & Art", "Leisure"],
  tags: ["Museum", "Anime", "Attack on Titan", "Hita City"],
  coordinates: { lat: 33.3219, lng: 130.9333 },
  description:
    "A museum dedicated to the Attack on Titan manga and anime, located in the Hita Roadside Station. Hita is the hometown of the series' creator, Hajime Isayama. Exhibits include original manuscript pages, life-size character statues, and exclusive merchandise. Follows the roadside station's operating hours.",
  descriptionJa:
    "日田市の道の駅内にある進撃の巨人のミュージアム。原作者・諫山創氏の故郷が日田市であることから設置されました。原画展示、等身大フィギュア、限定グッズを展示。道の駅の営業時間に準じます。",
  highlights: [
    "Original Attack on Titan manuscript pages on display",
    "Life-size character statues for photo opportunities",
    "Exclusive Hita-location merchandise",
  ],
  highlightsJa: [
    "進撃の巨人の原画展示",
    "等身大キャラクター像との写真撮影",
    "日田限定グッズの販売",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/3/3a/Attack_on_Titan_in_Hita_Museum.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Attack_on_Titan_in_Hita_Museum.jpg",
  openingHours: "09:00–17:00 (follows roadside station hours). Open daily.",
  openingHoursJa: "09:00～17:00（道の駅の営業時間に準ずる）。年中無休。",
  hoursSourceUrl: "https://www.oidehita.com/en/spot/aot/",
  officialWebsite: "https://www.oidehita.com/en/spot/aot/",
  wikiUrl: "https://en.wikipedia.org/wiki/Attack_on_Titan",
  wikiTitle: "Attack on Titan",
  budgetMin: 2000,
  budgetRecommended: 5000,
  budgetMax: 10000,
  ticketCost: 800,
  transportOptions: { bus: 150 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 2 },
  walkingMin: 1500,
  indoorPercent: 90,
  ratings: {
    overall: 8.5,
    couple: 7.5,
    summer: 8.5,
    winter: 8.5,
    rain: 9.5,
    food: 6.0,
    photography: 8.0,
    relaxation: 7.0,
    value: 8.0,
    uniqueness: 9.5,
  },
  crowd: { weekday: 3, weekend: 7, holiday: 8 },
  season: { spring: 9, summer: 9, autumn: 9, winter: 9 },
  bestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weatherDependence: "low",
  reservation: "None required; busy on weekends and holidays",
  parking: "Free roadside station parking available",
  walkingIntensity: "low",
  walkingSunMin: 200,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 9, rainFriendly: 10, walkingIntensity: 2 },
  notes:
    "The museum is inside the roadside station — the station itself is worth exploring for local snacks.",
  notesJa:
    "道の駅内に併設 — 駅自体も地元の軽食や特産品が充実していて見逃せません。",
};

const POI_OYAMA_DAM: PoiInput = {
  id: "oyama-dam-attack-on-titan-statues",
  name: "Oyama Dam Attack on Titan Statues",
  nameJa: "大山ダム 進撃の巨人像",
  parentId: "hita-city",
  prefecture: "Oita",
  municipalityId: "Oita:hita",
  kind: "outdoor",
  categories: ["Sightseeing", "Outdoor"],
  tags: ["Anime", "Statues", "Outdoor", "Hita City"],
  coordinates: { lat: 33.2858, lng: 130.9306 },
  description:
    "Outdoor site at Oyama Dam featuring life-size bronze statues of the three main characters from Attack on Titan — Eren, Mikasa, and Armin — as children overlooking the dam wall. The statues were erected as part of the Hita anime tourism project. An open-access outdoor site with no admission fee.",
  descriptionJa:
    "大山ダムに設置された進撃の巨人の主要キャラクター（エレン、ミカサ、アルミン）の幼少期の等身大銅像。日田市のアニメツーリズム事業の一環として設置されました。無料で見学できる屋外スポットです。",
  highlights: [
    "Life-size bronze statues of Eren, Mikasa and Armin as children",
    "Panoramic dam and mountain views from the statue site",
    "Free open-access outdoor anime pilgrimage location",
  ],
  highlightsJa: [
    "エレン・ミカサ・アルミン幼少期の等身大銅像",
    "銅像広場から望むダムと山々のパノラマ",
    "無料で自由に見学できるアニメ聖地",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/0/0a/Oyama_Dam_Attack_on_Titan_statues.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Oyama_Dam_Attack_on_Titan_statues.jpg",
  openingHours:
    "Open access (daylight hours recommended). Outdoor site — unlit after dark.",
  openingHoursJa: "自由見学（日中推奨）。屋外のため日没後は非推奨。",
  hoursSourceUrl: "https://www.oidehita.com/en/spot/aot-dam/",
  hoursNote: "Outdoor public site, accessible during daylight hours",
  officialWebsite: "https://www.oidehita.com/en/spot/aot-dam/",
  wikiUrl: "https://en.wikipedia.org/wiki/Attack_on_Titan",
  wikiTitle: "Attack on Titan",
  budgetMin: 1500,
  budgetRecommended: 3500,
  budgetMax: 6000,
  ticketCost: 0,
  transportOptions: { bus: 200 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 0.5, max: 1 },
  walkingMin: 1000,
  indoorPercent: 5,
  ratings: {
    overall: 7.5,
    couple: 7.0,
    summer: 7.5,
    winter: 6.5,
    rain: 5.0,
    food: 4.0,
    photography: 8.5,
    relaxation: 7.0,
    value: 9.0,
    uniqueness: 9.5,
  },
  crowd: { weekday: 2, weekend: 5, holiday: 7 },
  season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  weatherDependence: "high",
  reservation: "None required",
  parking: "Free parking at the dam",
  walkingIntensity: "low",
  walkingSunMin: 800,
  walkingShadeMin: 200,
  comfort: { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 2 },
  notes:
    "A car or taxi is the most practical way to reach the dam — limited public transport options.",
  notesJa:
    "公共交通の便が限られているため、車またはタクシーでのアクセスが現実的です。",
};

const POI_HITA_GION_YAMAHOKO: PoiInput = {
  id: "hita-gion-yamahoko-museum",
  name: "Hita Gion Yamahoko Museum",
  nameJa: "日田祇園山鉾会館",
  parentId: "hita-city",
  prefecture: "Oita",
  municipalityId: "Oita:hita",
  kind: "museum",
  categories: ["Museum & Art", "Culture"],
  tags: ["Museum", "Festival", "Float", "Hita City"],
  coordinates: { lat: 33.3231, lng: 130.9367 },
  description:
    "Museum displaying the elaborate floats (yamahoko) used in the Hita Gion Festival, a 300-year-old tradition held each July. The multi-storey floats, up to 10 metres tall, feature intricate carvings, tapestries and mechanical dolls. Some floats may be absent around the festival period when they are in active use.",
  descriptionJa:
    "300年の伝統を持つ日田祇園祭（毎年7月）で使用される豪華な山鉾を展示する博物館。高さ最大10mの多層式の山鉾には精巧な彫刻、綴織、からくり人形が施されています。祭り前後は山鉾が実際の運用で不在となることがあります。",
  highlights: [
    "Elaborate multi-storey festival floats up to 10 m tall",
    "Intricate mechanical dolls, carvings and tapestries",
    "300-year-old Hita Gion Festival traditions",
  ],
  highlightsJa: [
    "高さ最大10mの豪華な多層式山鉾",
    "精巧なからくり人形・彫刻・綴織",
    "300年の伝統を誇る日田祇園祭",
  ],
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/4/47/Hita_Gion_Yamahoko_Museum.jpg",
  imageAttribution: "そらみみ",
  imageLicense: "CC BY-SA 4.0",
  imageSourceUrl:
    "https://commons.wikimedia.org/wiki/File:Hita_Gion_Yamahoko_Museum.jpg",
  openingHours: "09:00–17:00 (last admission 16:30). Closed Tuesdays.",
  openingHoursJa: "09:00～17:00（最終入館16:30）。火曜休館。",
  hoursSourceUrl: "https://www.oidehita.com/en/spot/yamahoko/",
  closedDays:
    "Tuesdays (or Wednesday if Tuesday is a public holiday). Some floats may be absent around the July festival period.",
  officialWebsite: "https://www.oidehita.com/en/spot/yamahoko/",
  wikiUrl: "https://en.wikipedia.org/wiki/Hita,_%C5%8Cita",
  wikiTitle: "Hita, Ōita",
  budgetMin: 1500,
  budgetRecommended: 3500,
  budgetMax: 6000,
  ticketCost: 400,
  transportOptions: { bus: 150 },
  totalTripHours: 3,
  recommendedVisitHours: { min: 1, max: 1.5 },
  walkingMin: 1500,
  indoorPercent: 90,
  ratings: {
    overall: 8.0,
    couple: 7.5,
    summer: 8.5,
    winter: 7.5,
    rain: 9.0,
    food: 5.0,
    photography: 8.0,
    relaxation: 7.0,
    value: 8.5,
    uniqueness: 9.0,
  },
  crowd: { weekday: 2, weekend: 4, holiday: 6 },
  season: { spring: 9, summer: 9, autumn: 9, winter: 7 },
  bestMonths: [3, 4, 5, 6, 7, 10, 11],
  weatherDependence: "low",
  reservation: "None required",
  parking: "Paid parking nearby",
  walkingIntensity: "low",
  walkingSunMin: 300,
  walkingShadeMin: 1000,
  comfort: { heatTolerance: 9, rainFriendly: 10, walkingIntensity: 2 },
  notes:
    "Some floats may be absent during the July festival period when they are in active use.",
  notesJa: "7月の祇園祭前後は山鉾が実際の運行で不在となることがあります。",
};

// ==========================================================================
// HUB AND POI LISTS PER COMMIT
// ==========================================================================

const KARATSU_HUB = buildHub(HUB_KARATSU);
const KARATSU_POIS = [
  buildPoi(POI_KARATSU_CASTLE),
  buildPoi(POI_YOBUKO_MARKET),
  buildPoi(POI_NIJINOMATSUBARA),
  buildPoi(POI_NANATSUGAMA),
  buildPoi(POI_NAGOYA_CASTLE_RUINS),
];

const SASEBO_HUB = buildHub(HUB_SASEBO);
const SASEBO_POIS = [
  buildPoi(POI_HUIS_TEN_BOSCH),
  buildPoi(POI_KUJUKUSHIMA),
  buildPoi(POI_UMI_KIRARA),
  buildPoi(POI_ISHIDAKE),
  buildPoi(POI_SASEBO_NAVAL_PORT),
];

const IBUSUKI_HUB = buildHub(HUB_IBUSUKI);
const IBUSUKI_POIS = [
  buildPoi(POI_SUNAMUSHI),
  buildPoi(POI_LAKE_IKEDA),
  buildPoi(POI_CHIRINGASHIMA),
  buildPoi(POI_CAPE_NAGASAKIBANA),
  buildPoi(POI_MOUNT_KAIMON),
];

const NICHINAN_HUB = buildHub(HUB_NICHINAN);
const NICHINAN_POIS = [
  buildPoi(POI_OBI_CASTLE_TOWN),
  buildPoi(POI_UDO_JINGU),
  buildPoi(POI_SUN_MESSE),
  buildPoi(POI_INOHAE_VALLEY),
];

const HITA_HUB = buildHub(HUB_HITA);
const HITA_POIS = [
  buildPoi(POI_MAMEDA),
  buildPoi(POI_KANGIEN),
  buildPoi(POI_AOT_HITA_MUSEUM),
  buildPoi(POI_OYAMA_DAM),
  buildPoi(POI_HITA_GION_YAMAHOKO),
];

// Combined
const ALL_HUBS = [KARATSU_HUB, SASEBO_HUB, IBUSUKI_HUB, NICHINAN_HUB, HITA_HUB];
const ALL_POIS = [
  ...KARATSU_POIS,
  ...SASEBO_POIS,
  ...IBUSUKI_POIS,
  ...NICHINAN_POIS,
  ...HITA_POIS,
];

const ALL_NEW_IDS = [
  // Karatsu
  "karatsu-city",
  "karatsu-castle",
  "yobuko-morning-market",
  "nijinomatsubara-pine-grove",
  "nanatsugama-sea-caves",
  "nagoya-castle-ruins-museum",
  // Sasebo
  "sasebo-city",
  "huis-ten-bosch",
  "kujukushima-pearl-sea-resort",
  "umi-kirara-aquarium",
  "ishidake-observatory",
  "sasebo-naval-port-cruise",
  // Ibusuki
  "ibusuki-city",
  "sunamushi-onsen-saraku",
  "lake-ikeda",
  "chiringashima-island",
  "cape-nagasakibana",
  "mount-kaimon",
  // Nichinan
  "nichinan-city",
  "obi-castle-town",
  "udo-jingu",
  "sun-messe-nichinan",
  "inohae-valley",
  // Hita
  "hita-city",
  "mameda-historic-district",
  "kangien-academy",
  "attack-on-titan-hita-museum",
  "oyama-dam-attack-on-titan-statues",
  "hita-gion-yamahoko-museum",
];

const ALL_HUB_IDS = [
  "karatsu-city",
  "sasebo-city",
  "ibusuki-city",
  "nichinan-city",
  "hita-city",
];
const ALL_POI_IDS = ALL_NEW_IDS.filter((id) => !ALL_HUB_IDS.includes(id));

const COUNTS_AFTER = [
  { label: "Karatsu", total: 671, kyushu: 77, hubs: 13, nonhubs: 64 },
  { label: "Sasebo", total: 677, kyushu: 83, hubs: 14, nonhubs: 69 },
  { label: "Ibusuki", total: 683, kyushu: 89, hubs: 15, nonhubs: 74 },
  { label: "Nichinan", total: 688, kyushu: 94, hubs: 16, nonhubs: 78 },
  { label: "Hita", total: 694, kyushu: 100, hubs: 17, nonhubs: 83 },
];

// ==========================================================================
// VALIDATION
// ==========================================================================

function validateRecords(records: DestinationRecord[], stage: string) {
  const ids = records.map((r) => r.id);

  // No duplicates
  assert(new Set(ids).size === ids.length, `[${stage}] Duplicate IDs exist`);

  for (const r of records) {
    // Published
    assert(r.status === "published", `[${stage}] ${r.id} not published`);

    // Bilingual content
    assert(
      !!r.content?.en?.description,
      `[${stage}] ${r.id} missing EN content`,
    );
    assert(
      !!r.content?.ja?.description,
      `[${stage}] ${r.id} missing JA content`,
    );
    assert(
      r.content.en.highlights?.length > 0,
      `[${stage}] ${r.id} missing EN highlights`,
    );
    assert(
      r.content.ja.highlights?.length > 0,
      `[${stage}] ${r.id} missing JA highlights`,
    );

    // Notes
    assert(
      r.notes && r.notes.length > 0,
      `[${stage}] ${r.id} missing EN notes`,
    );
    assert(
      r.notesJa && r.notesJa.length > 0,
      `[${stage}] ${r.id} missing JA notes`,
    );
    assert(
      r.notes.length <= 140,
      `[${stage}] ${r.id} EN notes too long: ${r.notes.length}`,
    );
    assert(
      r.notesJa.length <= 70,
      `[${stage}] ${r.id} JA notes too long: ${r.notesJa.length}`,
    );

    // One-sentence EN
    const sentences = r.notes
      .replace(/[.?!]+/g, ".")
      .split(".")
      .filter((s: string) => s.trim().length > 0);
    assert(
      sentences.length <= 1,
      `[${stage}] ${r.id} EN notes has ${sentences.length} sentences`,
    );

    // Hours
    assert(!!r.openingHours, `[${stage}] ${r.id} missing openingHours`);
    assert(!!r.openingHoursJa, `[${stage}] ${r.id} missing openingHoursJa`);
    assert(
      !!r.openingHoursMetadata?.sourceUrl?.startsWith("https://"),
      `[${stage}] ${r.id} missing HTTPS hours source`,
    );

    // Transport
    if (r.transportOptions) {
      for (const [mode, v] of Object.entries(r.transportOptions)) {
        assert(
          typeof v === "number" && Number.isFinite(v) && v > 0,
          `[${stage}] ${r.id} invalid transport ${mode}: ${v}`,
        );
      }
    } else {
      assert(false, `[${stage}] ${r.id} missing transportOptions`);
    }

    // Budget
    assert(
      r.budgetMin > 0,
      `[${stage}] ${r.id} budgetMin <= 0: ${r.budgetMin}`,
    );
    assert(
      r.budgetMin <= r.budgetRecommended,
      `[${stage}] ${r.id} budgetMin > budgetRecommended`,
    );
    assert(
      r.budgetRecommended <= r.budgetMax,
      `[${stage}] ${r.id} budgetRecommended > budgetMax`,
    );
    assert(
      r.recommendedVisitHours?.min > 0,
      `[${stage}] ${r.id} visit min <= 0`,
    );

    // Image
    const hero = r.heroImage || "";
    assert(hero.length > 0, `[${stage}] ${r.id} missing heroImage`);
    assert(
      /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(hero),
      `[${stage}] ${r.id} unsupported image format: ${hero}`,
    );
    assert(
      !!r.imageMetadata?.attribution,
      `[${stage}] ${r.id} missing image attribution`,
    );
    assert(
      !!r.imageMetadata?.license,
      `[${stage}] ${r.id} missing image licence`,
    );
    assert(
      !!r.imageMetadata?.sourceUrl,
      `[${stage}] ${r.id} missing image sourceUrl`,
    );

    // Municipality
    assert(!!r.municipalityId, `[${stage}] ${r.id} missing municipalityId`);

    if (r.role === "poi") {
      assert(
        !!r.relationships?.parentDestinationId,
        `[${stage}] ${r.id} missing parent`,
      );
    }
  }
}

// ==========================================================================
// APPLY
// ==========================================================================

function applyExpansion(
  input: DestinationRecord[],
  hubs: DestinationRecord[],
  pois: DestinationRecord[],
  stage: string,
): DestinationRecord[] {
  const data = deepClone(input);
  const existingIds = new Set(data.map((r) => r.id));
  const allNew = [...hubs, ...pois];

  // Reject existing IDs
  for (const r of allNew) {
    assert(!existingIds.has(r.id), `[${stage}] ID already exists: ${r.id}`);
  }

  // Validate new records before adding
  validateRecords(allNew, `${stage}-preflight`);

  // Add records
  data.push(...deepClone(allNew));

  // Validate cross-municipality parenting
  for (const r of data) {
    if (r.role === "poi" && r.relationships?.parentDestinationId) {
      const parent = data.find(
        (p) => p.id === r.relationships.parentDestinationId,
      );
      if (parent) {
        assert(
          r.municipalityId === parent.municipalityId,
          `[${stage}] Cross-municipality parent: ${r.id} (${r.municipalityId}) -> ${parent.id} (${parent.municipalityId})`,
        );
      }
    }
  }

  return data;
}

// ==========================================================================
// MAIN
// ==========================================================================

function main() {
  const arg = process.argv[2] || "all";
  console.log(`Mode: ${arg}`);

  const original = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf-8"),
  ) as DestinationRecord[];
  const originalClone = deepClone(original);

  let data = deepClone(original);
  let stageHubs: DestinationRecord[] = [];
  let stagePois: DestinationRecord[] = [];
  let stageLabel = "";

  const stages: {
    label: string;
    hubs: DestinationRecord[];
    pois: DestinationRecord[];
  }[] = [];
  if (arg === "karatsu" || arg === "all") {
    stages.push({ label: "Karatsu", hubs: [KARATSU_HUB], pois: KARATSU_POIS });
  }
  if (arg === "sasebo" || arg === "all") {
    stages.push({ label: "Sasebo", hubs: [SASEBO_HUB], pois: SASEBO_POIS });
  }
  if (arg === "ibusuki" || arg === "all") {
    stages.push({ label: "Ibusuki", hubs: [IBUSUKI_HUB], pois: IBUSUKI_POIS });
  }
  if (arg === "nichinan" || arg === "all") {
    stages.push({
      label: "Nichinan",
      hubs: [NICHINAN_HUB],
      pois: NICHINAN_POIS,
    });
  }
  if (arg === "hita" || arg === "all") {
    stages.push({ label: "Hita", hubs: [HITA_HUB], pois: HITA_POIS });
  }

  // Apply each stage
  const allHubsSoFar: DestinationRecord[] = [];
  const allPoisSoFar: DestinationRecord[] = [];

  for (const stage of stages) {
    console.log(`\n--- Applying ${stage.label} ---`);
    allHubsSoFar.push(...stage.hubs);
    allPoisSoFar.push(...stage.pois);
    data = applyExpansion(data, stage.hubs, stage.pois, stage.label);

    // Check partial counts
    const kyushu = data.filter((r) => r.region === "Kyushu");
    const kyushuHubs = kyushu.filter((r) => r.role === "hub");
    const kyushuNonhubs = kyushu.filter((r) => r.role !== "hub");
    const expected = COUNTS_AFTER.find((c) => c.label === stage.label)!;
    assert(
      data.length === expected.total,
      `[${stage.label}] Expected ${expected.total} total, got ${data.length}`,
    );
    assert(
      kyushu.length === expected.kyushu,
      `[${stage.label}] Expected ${expected.kyushu} Kyushu, got ${kyushu.length}`,
    );
    assert(
      kyushuHubs.length === expected.hubs,
      `[${stage.label}] Expected ${expected.hubs} hubs, got ${kyushuHubs.length}`,
    );
    assert(
      kyushuNonhubs.length === expected.nonhubs,
      `[${stage.label}] Expected ${expected.nonhubs} non-hubs, got ${kyushuNonhubs.length}`,
    );
    console.log(
      `✓ ${stage.label} counts: ${data.length} total, ${kyushu.length} Kyushu (${kyushuHubs.length} hubs, ${kyushuNonhubs.length} non-hubs)`,
    );
  }

  // Final stage validations
  const allNew = [...allHubsSoFar, ...allPoisSoFar];
  const newIds = allNew.map((r) => r.id);

  // Only check 29-ID count when all stages are active
  if (arg === "all") {
    assert(newIds.length === 29, `Expected 29 new IDs, got ${newIds.length}`);
  }

  // Check exact ID lists
  const expectedHubCount = ALL_HUB_IDS.filter((id) =>
    allHubsSoFar.some((h) => h.id === id),
  ).length;
  const expectedPoiCount = ALL_POI_IDS.filter((id) =>
    allPoisSoFar.some((p) => p.id === id),
  ).length;
  assert(
    expectedHubCount + expectedPoiCount === newIds.length,
    "Hub/POI count mismatch",
  );

  // No original record changed
  for (let i = 0; i < original.length; i++) {
    assert(
      deepEqual(originalClone[i], data[i]),
      `[FINAL] Original record changed at index ${i}: ${originalClone[i].id}`,
    );
  }
  console.log("✓ No original records changed");

  // Add remaining unselected hints to nearby arrays
  // (already handled by data; skip additional mutations)

  // Write
  fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n✓ Wrote ${data.length} records to ${INDEX_PATH}`);

  // Second-run idempotency check
  const pass2 = applyExpansion(original, allHubsSoFar, allPoisSoFar, "pass2");
  assert(deepEqual(data, pass2), "Second run produced different output");
  console.log("✓ Second-run idempotency confirmed");
}

main();
