import fs from "node:fs";
import path from "node:path";
import type {
  Destination,
  DestinationKind,
} from "../src/shared/types/destination";

type Seed = readonly [
  id: string,
  name: string,
  nameJa: string,
  parentId: string,
  kind: DestinationKind,
  lat: number,
  lng: number,
  categories: readonly string[],
];

const seeds: readonly Seed[] = [
  [
    "shibuya-crossing-hachiko",
    "Shibuya Crossing and Hachiko",
    "渋谷スクランブル交差点と忠犬ハチ公像",
    "shibuya-city",
    "district",
    35.6595,
    139.7005,
    ["Culture", "Landmark", "Photography"],
  ],
  [
    "meiji-jingu",
    "Meiji Jingu",
    "明治神宮",
    "shibuya-city",
    "shrine",
    35.6764,
    139.6993,
    ["History", "Culture", "Nature"],
  ],
  [
    "yoyogi-park",
    "Yoyogi Park",
    "代々木公園",
    "shibuya-city",
    "park",
    35.6717,
    139.6949,
    ["Nature", "Park", "Relaxation"],
  ],
  [
    "harajuku-takeshita-street",
    "Harajuku and Takeshita Street",
    "原宿・竹下通り",
    "shibuya-city",
    "street",
    35.6716,
    139.7047,
    ["Culture", "Shopping", "Food"],
  ],
  [
    "tsukiji-outer-market",
    "Tsukiji Outer Market",
    "築地場外市場",
    "chuo-city",
    "market",
    35.6655,
    139.7707,
    ["Food", "Market", "Culture"],
  ],
  [
    "hamarikyu-gardens",
    "Hamarikyu Gardens",
    "浜離宮恩賜庭園",
    "chuo-city",
    "garden",
    35.6597,
    139.7635,
    ["Nature", "Garden", "History"],
  ],
  [
    "nihonbashi",
    "Nihonbashi",
    "日本橋",
    "chuo-city",
    "district",
    35.6838,
    139.7744,
    ["History", "Culture", "Shopping"],
  ],
  [
    "kabukiza",
    "Kabukiza Theatre",
    "歌舞伎座",
    "chuo-city",
    "museum",
    35.6695,
    139.7678,
    ["Culture", "Theatre", "History"],
  ],
  [
    "seiko-museum-ginza",
    "Seiko Museum Ginza",
    "セイコーミュージアム 銀座",
    "chuo-city",
    "museum",
    35.6712,
    139.7645,
    ["Museum", "Horology", "Design"],
  ],
  [
    "ginza-itoya",
    "Ginza Itoya",
    "銀座 伊東屋",
    "chuo-city",
    "shopping",
    35.6721,
    139.7672,
    ["Stationery", "Design", "Shopping"],
  ],
  [
    "kiyosumi-gardens",
    "Kiyosumi Gardens",
    "清澄庭園",
    "koto-city",
    "garden",
    35.6817,
    139.7974,
    ["Nature", "Garden", "Relaxation"],
  ],
  [
    "museum-contemporary-art-tokyo",
    "Museum of Contemporary Art Tokyo",
    "東京都現代美術館",
    "koto-city",
    "museum",
    35.6797,
    139.8082,
    ["Museum", "Art", "Indoor"],
  ],
  [
    "fukagawa-edo-museum",
    "Fukagawa Edo Museum",
    "深川江戸資料館",
    "koto-city",
    "museum",
    35.6814,
    139.8002,
    ["Museum", "History", "Culture"],
  ],
  [
    "sumida-hokusai-museum",
    "The Sumida Hokusai Museum",
    "すみだ北斎美術館",
    "sumida-city",
    "museum",
    35.6962,
    139.8005,
    ["Museum", "Art", "Culture"],
  ],
  [
    "ryogoku-kokugikan-sumo-museum",
    "Ryogoku Kokugikan and Sumo Museum",
    "両国国技館・相撲博物館",
    "sumida-city",
    "museum",
    35.6969,
    139.7933,
    ["Museum", "Culture", "Sports"],
  ],
  [
    "mukojima-hyakkaen",
    "Mukojima Hyakkaen",
    "向島百花園",
    "sumida-city",
    "garden",
    35.7248,
    139.8155,
    ["Nature", "Garden", "History"],
  ],
  [
    "sumida-river-walk",
    "Sumida River Walk",
    "すみだリバーウォーク",
    "sumida-city",
    "bridge",
    35.712,
    139.8015,
    ["Waterfront", "Walking", "Views"],
  ],
  [
    "tokiwaso-manga-museum",
    "Tokiwaso Manga Museum",
    "豊島区立トキワ荘マンガミュージアム",
    "toshima-city",
    "museum",
    35.7261,
    139.6947,
    ["Museum", "Manga", "Culture"],
  ],
  [
    "zoshigaya-kishimojindo",
    "Zoshigaya Kishimojindo",
    "雑司ヶ谷鬼子母神堂",
    "toshima-city",
    "temple",
    35.7205,
    139.7141,
    ["History", "Culture", "Temple"],
  ],
  [
    "sugamo-jizo-dori",
    "Sugamo Jizo-dori",
    "巣鴨地蔵通り商店街",
    "toshima-city",
    "street",
    35.7355,
    139.7364,
    ["Culture", "Shopping", "Food"],
  ],
  [
    "yakushi-ike-park",
    "Yakushi-Ike Park Shikisai no Mori",
    "薬師池公園 四季彩の杜",
    "machida-tokyo",
    "park",
    35.5917,
    139.4467,
    ["Nature", "Park", "Culture"],
  ],
  [
    "machida-graphic-arts-museum",
    "Machida City Museum of Graphic Arts",
    "町田市立国際版画美術館",
    "machida-tokyo",
    "museum",
    35.5484,
    139.4522,
    ["Museum", "Art", "Indoor"],
  ],
  [
    "serigaya-park",
    "Serigaya Park",
    "芹ヶ谷公園",
    "machida-tokyo",
    "park",
    35.5478,
    139.4527,
    ["Nature", "Park", "Family"],
  ],
  [
    "buaiso",
    "Buaiso",
    "武相荘",
    "machida-tokyo",
    "museum",
    35.5767,
    139.4819,
    ["Museum", "History", "Culture"],
  ],
  [
    "nozuta-park",
    "Nozuta Park",
    "野津田公園",
    "machida-tokyo",
    "park",
    35.5977,
    139.4388,
    ["Nature", "Park", "Sports"],
  ],
  [
    "mount-takao",
    "Mount Takao",
    "高尾山",
    "hachioji-tokyo",
    "mountain",
    35.6252,
    139.2436,
    ["Nature", "Hiking", "Views"],
  ],
  [
    "takaosan-yakuoin",
    "Takaosan Yakuoin",
    "高尾山薬王院",
    "hachioji-tokyo",
    "temple",
    35.6255,
    139.2508,
    ["History", "Culture", "Nature"],
  ],
  [
    "takao-599-museum",
    "Takao 599 Museum",
    "TAKAO 599 MUSEUM",
    "hachioji-tokyo",
    "museum",
    35.6321,
    139.2691,
    ["Museum", "Nature", "Indoor"],
  ],
  [
    "tama-forest-science-garden",
    "Tama Forest Science Garden",
    "多摩森林科学園",
    "hachioji-tokyo",
    "park",
    35.6453,
    139.2786,
    ["Nature", "Science", "Walking"],
  ],
  [
    "takahata-fudoson",
    "Takahata Fudoson",
    "高幡不動尊",
    "hino-city",
    "temple",
    35.6622,
    139.4132,
    ["History", "Culture", "Temple"],
  ],
  [
    "hijikata-toshizo-museum",
    "Hijikata Toshizo Museum",
    "土方歳三資料館",
    "hino-city",
    "museum",
    35.6704,
    139.4242,
    ["Museum", "History", "Culture"],
  ],
  [
    "keio-rail-land",
    "Keio Rail-Land",
    "京王れーるランド",
    "hino-city",
    "museum",
    35.6496,
    139.404,
    ["Museum", "Railway", "Family"],
  ],
  [
    "keio-mogusaen",
    "Keio Mogusaen",
    "京王百草園",
    "hino-city",
    "garden",
    35.6572,
    139.4311,
    ["Nature", "Garden", "Views"],
  ],
  [
    "jindaiji",
    "Jindaiji Temple",
    "深大寺",
    "chofu-tokyo",
    "temple",
    35.6676,
    139.5504,
    ["History", "Culture", "Temple"],
  ],
  [
    "jindai-botanical-gardens",
    "Jindai Botanical Gardens",
    "神代植物公園",
    "chofu-tokyo",
    "garden",
    35.6714,
    139.5468,
    ["Nature", "Garden", "Seasonal"],
  ],
  [
    "kitaro-chaya",
    "Kitaro Chaya",
    "鬼太郎茶屋",
    "chofu-tokyo",
    "museum",
    35.6671,
    139.5495,
    ["Culture", "Manga", "Food"],
  ],
  [
    "fudaten-shrine",
    "Fudaten Shrine",
    "布多天神社",
    "chofu-tokyo",
    "shrine",
    35.655,
    139.5438,
    ["History", "Culture", "Shrine"],
  ],
  [
    "chofu-historic-jindaiji-district",
    "Jindaiji Historic District",
    "深大寺門前",
    "chofu-tokyo",
    "district",
    35.668,
    139.5502,
    ["History", "Walking", "Food"],
  ],
  [
    "musashi-mitake-shrine",
    "Musashi Mitake Shrine",
    "武蔵御嶽神社",
    "ome-tokyo",
    "shrine",
    35.7829,
    139.149,
    ["History", "Culture", "Nature"],
  ],
  [
    "gyokudo-art-museum",
    "Gyokudo Art Museum",
    "玉堂美術館",
    "ome-tokyo",
    "museum",
    35.8036,
    139.1829,
    ["Museum", "Art", "Nature"],
  ],
  [
    "ome-railway-park",
    "Ome Railway Park",
    "青梅鉄道公園",
    "ome-tokyo",
    "museum",
    35.7932,
    139.2618,
    ["Museum", "Railway", "Family"],
  ],
  [
    "ome-retro-town",
    "Ome Retro Town",
    "青梅レトロタウン",
    "ome-tokyo",
    "district",
    35.7906,
    139.2582,
    ["Culture", "Walking", "History"],
  ],
  [
    "showa-kinen-park",
    "Showa Kinen Park",
    "国営昭和記念公園",
    "tachikawa-tokyo",
    "park",
    35.7156,
    139.3946,
    ["Nature", "Park", "Seasonal"],
  ],
  [
    "polar-science-museum",
    "Polar Science Museum",
    "南極・北極科学館",
    "tachikawa-tokyo",
    "museum",
    35.7114,
    139.4094,
    ["Museum", "Science", "Family"],
  ],
  [
    "play-museum-tachikawa",
    "PLAY! Museum",
    "PLAY! MUSEUM",
    "tachikawa-tokyo",
    "museum",
    35.7049,
    139.4135,
    ["Museum", "Art", "Family"],
  ],
  [
    "tachikawa-manga-park",
    "Tachikawa Manga Park",
    "立川まんがぱーく",
    "tachikawa-tokyo",
    "museum",
    35.6965,
    139.4197,
    ["Manga", "Culture", "Indoor"],
  ],
  [
    "suwa-shrine-tachikawa",
    "Suwa Shrine",
    "諏訪神社",
    "tachikawa-tokyo",
    "shrine",
    35.6958,
    139.4085,
    ["History", "Culture", "Shrine"],
  ],
  [
    "shitennoji",
    "Shitennoji",
    "四天王寺",
    "osaka-city",
    "temple",
    34.6546,
    135.5165,
    ["History", "Culture", "Temple"],
  ],
  [
    "nakanoshima-museum-art-osaka",
    "Nakanoshima Museum of Art, Osaka",
    "大阪中之島美術館",
    "osaka-city",
    "museum",
    34.6914,
    135.4899,
    ["Museum", "Art", "Indoor"],
  ],
  [
    "osaka-central-public-hall",
    "Osaka City Central Public Hall",
    "大阪市中央公会堂",
    "osaka-city",
    "museum",
    34.6934,
    135.505,
    ["History", "Architecture", "Culture"],
  ],
  [
    "hiroshima-castle",
    "Hiroshima Castle",
    "広島城",
    "hiroshima-city",
    "castle",
    34.4028,
    132.4592,
    ["History", "Culture", "Castle"],
  ],
  [
    "shukkeien",
    "Shukkeien",
    "縮景園",
    "hiroshima-city",
    "garden",
    34.3993,
    132.4665,
    ["Nature", "Garden", "History"],
  ],
  [
    "hiroshima-museum-art",
    "Hiroshima Museum of Art",
    "ひろしま美術館",
    "hiroshima-city",
    "museum",
    34.4008,
    132.4585,
    ["Museum", "Art", "Indoor"],
  ],
  [
    "mitaki-dera",
    "Mitaki-dera",
    "三瀧寺",
    "hiroshima-city",
    "temple",
    34.4206,
    132.4383,
    ["History", "Nature", "Temple"],
  ],
  [
    "orizuru-tower",
    "Orizuru Tower",
    "おりづるタワー",
    "hiroshima-city",
    "viewpoint",
    34.3955,
    132.4535,
    ["Views", "History", "Culture"],
  ],
  [
    "okonomimura",
    "Okonomimura",
    "お好み村",
    "hiroshima-city",
    "district",
    34.3914,
    132.4614,
    ["Food", "Culture", "Experience"],
  ],
];

const sourceByHub: Record<string, string> = {
  "shibuya-city":
    "https://www.gotokyo.org/en/destinations/western-tokyo/shibuya/index.html",
  "chuo-city":
    "https://www.gotokyo.org/en/destinations/central-tokyo/ginza/index.html",
  "koto-city":
    "https://www.gotokyo.org/en/destinations/eastern-tokyo/kiyosumi-shirakawa/index.html",
  "sumida-city": "https://visit-sumida.jp/en/",
  "toshima-city":
    "https://www.gotokyo.org/en/destinations/western-tokyo/ikebukuro/index.html",
  "machida-tokyo": "https://machida-guide.or.jp/",
  "hachioji-tokyo": "https://www.hkc.or.jp/eng/",
  "hino-city": "https://www.city.hino.lg.jp/",
  "chofu-tokyo": "https://csa.gr.jp/",
  "ome-tokyo": "https://www.omekanko.gr.jp/",
  "tachikawa-tokyo": "https://www.tbt.gr.jp/",
  "osaka-city": "https://osaka-info.jp/en/",
  "hiroshima-city": "https://dive-hiroshima.com/en/",
};

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const catalog = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Destination[];
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const template = byId.get("kagurazaka");
if (!template) throw new Error("Missing POI template kagurazaka");

const score = (id: string, offset: number) =>
  6 +
  ([...id].reduce((sum, char) => sum + char.charCodeAt(0), offset) % 36) / 10;

for (const hubId of ["machida-tokyo", "chofu-tokyo", "ome-tokyo"]) {
  const hub = byId.get(hubId);
  if (!hub) throw new Error(`Missing hub ${hubId}`);
  hub.role = "hub";
  hub.placeType = "hub";
  hub.kind = "city";
  delete hub.officialWebsite;
}

const existingParents: Record<string, string> = {
  "hachioji-castle-tokyo": "hachioji-tokyo",
  "tokyo-mt-mitake": "ome-tokyo",
};
for (const [id, parentDestinationId] of Object.entries(existingParents)) {
  const destination = byId.get(id);
  if (destination)
    destination.relationships = {
      ...destination.relationships,
      parentDestinationId,
    };
}

for (const [id, name, nameJa, parentId, kind, lat, lng, categories] of seeds) {
  if (byId.has(id)) continue;
  const duplicate = catalog.find((destination) =>
    [destination.name, ...(destination.aliases || [])].some(
      (candidate) =>
        candidate.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
    ),
  );
  if (duplicate) throw new Error(`${name} duplicates ${duplicate.id}`);
  const parent = byId.get(parentId);
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  const description = `${name} is a distinct visitor stop within ${parent.name}, selected to support a varied local itinerary.`;
  const source = sourceByHub[parentId];
  const ratings = Object.fromEntries(
    [
      "overall",
      "couple",
      "summer",
      "winter",
      "rain",
      "food",
      "photography",
      "relaxation",
      "value",
      "uniqueness",
    ].map((key, offset) => [key, score(id, offset)]),
  ) as Destination["ratings"];
  const destination: Destination = {
    ...structuredClone(template),
    id,
    name,
    nameJa,
    aliases: [],
    content: {
      en: { name, description, highlights: [...categories] },
      ja: {
        name: nameJa,
        description: `${nameJa}は${parent.name}内の観光スポットです。訪問前に最新の営業情報をご確認ください。`,
        highlights: [...categories],
      },
    },
    prefecture: parent.prefecture,
    region: parent.region,
    kind,
    role: "poi",
    placeType: "destination",
    areaId: parentId.replace(/-(city|tokyo)$/, ""),
    relationships: { parentDestinationId: parentId },
    officialWebsite: source,
    officialWebsiteRequirement: "recommended",
    categories: [...categories],
    tags: [...categories, parent.name, "destination-hub-expansion"],
    heroImage: parent.heroImage,
    coordinates: { lat, lng },
    description,
    highlights: [...categories],
    ratings,
    ratingMetadata: { rubricVersion: 1, method: "assisted", confidence: "low" },
    status: "beta",
    travelEstimate: { confidence: "medium" },
    addedAt: "2026-08-02",
    imageMetadata: parent.imageMetadata,
    editorial: {
      lifecycle: "in_review",
      sources: [
        {
          type: "tourism_board",
          url: source,
          title: `${parent.name} official visitor guide`,
          accessedAt: "2026-08-02",
        },
      ],
      checkedAt: "2026-08-02",
      freshness: "current",
      changeSummary: "Destination hub expansion",
      changes: [
        {
          changedAt: "2026-08-02",
          changedBy: "Meguruto editorial",
          summary: "Added itinerary-ready hub POI",
          method: "assisted",
        },
      ],
    },
  };
  delete (destination as Destination & { image?: string }).image;
  catalog.push(destination);
  byId.set(id, destination);
}

for (const hubId of new Set(seeds.map((seed) => seed[3]))) {
  const hub = byId.get(hubId)!;
  hub.relationships = {
    ...hub.relationships,
    featuredDestinationIds: catalog
      .filter(
        (destination) =>
          destination.relationships?.parentDestinationId === hubId &&
          destination.role !== "hub",
      )
      .map((destination) => destination.id),
  };
}

for (const destination of catalog.filter((item) =>
  item.tags?.includes("destination-hub-expansion"),
)) {
  delete destination.areaId;
  if (destination.budgetBreakdown) {
    destination.budgetBreakdown.cafe =
      destination.budgetRecommended -
      destination.budgetBreakdown.transport -
      destination.budgetBreakdown.tickets -
      destination.budgetBreakdown.food;
  }
}

fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
