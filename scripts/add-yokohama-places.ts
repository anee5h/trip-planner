import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const seeds = [
  [
    "minato-mirai-yokohama",
    "Minato Mirai",
    "みなとみらい",
    "横浜みなとみらい21",
    35.457,
    139.632,
    ["Waterfront", "Architecture", "Shopping"],
  ],
  [
    "yokohama-cosmo-world",
    "Yokohama Cosmo World",
    "よこはまコスモワールド",
    "よこはまコスモワールド",
    35.456,
    139.636,
    ["Amusement Park", "Family", "Waterfront"],
  ],
  [
    "kannai-yokohama",
    "Kannai",
    "関内",
    "関内",
    35.445,
    139.637,
    ["History", "Food", "Baseball"],
  ],
  [
    "yokohama-chinatown",
    "Yokohama Chinatown",
    "横浜中華街",
    "横浜中華街",
    35.443,
    139.65,
    ["Food", "Culture", "Shopping"],
  ],
  [
    "cup-noodles-museum-yokohama",
    "Cup Noodles Museum Yokohama",
    "カップヌードルミュージアム 横浜",
    "カップヌードルミュージアム 横浜",
    35.455,
    139.637,
    ["Museum", "Family", "Food"],
  ],
  [
    "shin-yokohama-ramen-museum",
    "Shin-Yokohama Ramen Museum",
    "新横浜ラーメン博物館",
    "新横浜ラーメン博物館",
    35.509,
    139.617,
    ["Museum", "Food", "Indoor"],
  ],
  [
    "yamashita-park-yokohama",
    "Yamashita Park",
    "山下公園",
    "山下公園",
    35.45,
    139.65,
    ["Park", "Waterfront", "Views"],
  ],
  [
    "soji-ji-yokohama",
    "Soji-ji Temple",
    "總持寺",
    "總持寺",
    35.501,
    139.674,
    ["Temple", "History", "Culture"],
  ],
  [
    "yokohama-red-brick-warehouse",
    "Yokohama Red Brick Warehouse",
    "横浜赤レンガ倉庫",
    "横浜赤レンガ倉庫",
    35.453,
    139.641,
    ["Architecture", "Shopping", "Waterfront"],
  ],
] as const;

const FEATURED_YOKOHAMA_DESTINATION_IDS = [
  "yokohama-landmark-tower-sky-garden",
  "yokohama-marine-tower",
  "yokohama-zoorasia",
  "hakkeijima",
  ...seeds.map(([id]) => id),
];

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];
const template = destinations.find(
  (destination) => destination.id === "yokohama-marine-tower",
);
if (!template) throw new Error("Missing Yokohama POI template");
const yokohama = destinations.find(
  (destination) => destination.id === "yokohama-city",
);
if (!yokohama) throw new Error("Missing Yokohama City hub");

for (const [id, name, nameJa, title, lat, lng, tags] of seeds) {
  if (destinations.some((destination) => destination.id === id)) continue;
  destinations.push({
    ...template,
    id,
    name,
    nameJa,
    coordinates: { lat, lng },
    tags: [...tags],
    categories: [...tags],
    description: `${name} is a curated destination within Yokohama City.`,
    highlights: [...tags],
    relationships: { parentDestinationId: "yokohama-city" },
    collections: [],
    role: "poi",
    placeType: "destination",
    addedAt: "2026-07-28",
    imageNeedsReview: true,
    notes: `${template.notes} Image placeholder: replace in QA before editorial approval.`,
  });
}

yokohama.relationships = {
  ...yokohama.relationships,
  featuredDestinationIds: FEATURED_YOKOHAMA_DESTINATION_IDS,
};
fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
