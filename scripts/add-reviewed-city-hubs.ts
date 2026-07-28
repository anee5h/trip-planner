import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

type HubSeed = Pick<
  Destination,
  | "id"
  | "name"
  | "nameJa"
  | "prefecture"
  | "region"
  | "coordinates"
  | "description"
  | "highlights"
  | "tags"
> & {
  wikipediaTitle: string;
  wikipediaLanguage?: "en" | "ja";
  imageFromDestinationId?: string;
};

const HUBS: HubSeed[] = [
  {
    id: "toyooka-city",
    name: "Toyooka",
    nameJa: "豊岡",
    prefecture: "Hyogo",
    region: "Kansai",
    coordinates: { lat: 35.544, lng: 134.82 },
    wikipediaTitle: "Toyooka,_Hyōgo",
    imageFromDestinationId: "kinosaki-onsen",
    description:
      "A northern Hyogo city known for Kinosaki Onsen, the San'in coast, and the reintroduction of Oriental storks.",
    highlights: ["Kinosaki Onsen", "Oriental stork habitat", "San'in coast"],
    tags: ["Onsen", "Nature", "Culture"],
  },
  {
    id: "hino-city",
    name: "Hino",
    nameJa: "日野",
    prefecture: "Tokyo",
    region: "Kanto",
    coordinates: { lat: 35.671, lng: 139.395 },
    wikipediaTitle: "Hino,_Tokyo",
    imageFromDestinationId: "tama-zoological-park",
    description:
      "A Tama-area city west of central Tokyo, home to Tama Zoological Park and the Tama Hills landscape.",
    highlights: ["Tama Zoological Park", "Tama Hills", "Shinsengumi history"],
    tags: ["Family", "Nature", "History"],
  },
  {
    id: "fujiyoshida-city",
    name: "Fujiyoshida",
    nameJa: "富士吉田",
    prefecture: "Yamanashi",
    region: "Chubu",
    coordinates: { lat: 35.487, lng: 138.807 },
    wikipediaTitle: "Fujiyoshida",
    imageFromDestinationId: "arakurayama-sengen-park-yamanashi",
    description:
      "A Fuji foothill city with classic views of Mount Fuji, including the Chureito Pagoda at Arakurayama Sengen Park.",
    highlights: [
      "Arakurayama Sengen Park",
      "Chureito Pagoda",
      "Mount Fuji views",
    ],
    tags: ["Nature", "Photography", "Culture"],
  },
  {
    id: "aomori-city",
    name: "Aomori",
    nameJa: "青森",
    prefecture: "Aomori",
    region: "Tohoku",
    coordinates: { lat: 40.822, lng: 140.747 },
    wikipediaTitle: "Aomori",
    imageFromDestinationId: "nebuta-museum-wa-rasse-aomori",
    description:
      "A northern port city and the home of the Aomori Nebuta Festival, with important Jomon archaeological sites nearby.",
    highlights: [
      "Nebuta Festival",
      "Nebuta Museum WA RASSE",
      "Sannai-Maruyama",
    ],
    tags: ["Culture", "Museums", "Festivals"],
  },
  {
    id: "hirosaki-city",
    name: "Hirosaki",
    nameJa: "弘前",
    prefecture: "Aomori",
    region: "Tohoku",
    coordinates: { lat: 40.603, lng: 140.464 },
    wikipediaTitle: "Hirosaki",
    description:
      "A former castle town best known for Hirosaki Castle and one of Japan's most celebrated cherry-blossom festivals.",
    highlights: ["Hirosaki Castle", "Hirosaki Park", "Apple culture"],
    tags: ["Castle", "Cherry Blossoms", "History"],
  },
  {
    id: "ise-city",
    name: "Ise",
    nameJa: "伊勢",
    prefecture: "Mie",
    region: "Kansai",
    coordinates: { lat: 34.49, lng: 136.709 },
    wikipediaTitle: "Ise,_Mie",
    description:
      "A shrine city in Mie Prefecture and the location of Ise Jingu, Japan's most important Shinto shrine complex.",
    highlights: ["Ise Jingu", "Okage Yokocho", "Shinto culture"],
    tags: ["Shrines", "Culture", "History"],
  },
  {
    id: "iwakuni-city",
    name: "Iwakuni",
    nameJa: "岩国",
    prefecture: "Yamaguchi",
    region: "Chugoku",
    coordinates: { lat: 34.166, lng: 132.219 },
    wikipediaTitle: "Iwakuni",
    imageFromDestinationId: "kintai-bridge-yamaguchi",
    description:
      "A Yamaguchi city on the Nishiki River, best known for Kintai Bridge and Iwakuni Castle.",
    highlights: ["Kintai Bridge", "Iwakuni Castle", "Nishiki River"],
    tags: ["Bridge", "Castle", "History"],
  },
  {
    id: "aizuwakamatsu-city",
    name: "Aizuwakamatsu",
    nameJa: "会津若松",
    prefecture: "Fukushima",
    region: "Tohoku",
    coordinates: { lat: 37.494, lng: 139.929 },
    wikipediaTitle: "Aizuwakamatsu",
    description:
      "A historic castle city in western Fukushima, known for Tsuruga Castle, samurai heritage, and Aizu craft traditions.",
    highlights: ["Tsuruga Castle", "Samurai history", "Aizu lacquerware"],
    tags: ["Castle", "History", "Culture"],
  },
  {
    id: "ashikaga-city",
    name: "Ashikaga",
    nameJa: "足利",
    prefecture: "Tochigi",
    region: "Kanto",
    coordinates: { lat: 36.341, lng: 139.449 },
    wikipediaTitle: "Ashikaga,_Tochigi",
    description:
      "A historic Tochigi city with the Ashikaga School and Ashikaga Flower Park, famous for seasonal wisteria.",
    highlights: ["Ashikaga Flower Park", "Ashikaga School", "Wisteria"],
    tags: ["Gardens", "History", "Flowers"],
  },
  {
    id: "semboku-city",
    name: "Semboku",
    nameJa: "仙北",
    prefecture: "Akita",
    region: "Tohoku",
    coordinates: { lat: 39.7, lng: 140.73 },
    wikipediaTitle: "Semboku,_Akita",
    description:
      "A large inland city in Akita containing Kakunodate's samurai district and Lake Tazawa.",
    highlights: ["Kakunodate", "Lake Tazawa", "Samurai district"],
    tags: ["History", "Nature", "Culture"],
  },
  {
    id: "mine-city",
    name: "Mine",
    nameJa: "美祢",
    prefecture: "Yamaguchi",
    region: "Chugoku",
    coordinates: { lat: 34.166, lng: 131.206 },
    wikipediaTitle: "Mine,_Yamaguchi",
    description:
      "A Yamaguchi city containing the Akiyoshidai karst plateau and Akiyoshido Cave.",
    highlights: ["Akiyoshido Cave", "Akiyoshidai", "Karst landscape"],
    tags: ["Caves", "Nature", "Geology"],
  },
  {
    id: "asago-city",
    name: "Asago",
    nameJa: "朝来",
    prefecture: "Hyogo",
    region: "Kansai",
    coordinates: { lat: 35.34, lng: 134.85 },
    wikipediaTitle: "Asago,_Hyōgo",
    description:
      "A rural Hyogo city known for the Takeda Castle Ruins, often seen above a sea of clouds in autumn.",
    highlights: ["Takeda Castle Ruins", "Sea of clouds", "Historic landscape"],
    tags: ["Castle", "Photography", "History"],
  },
  {
    id: "takahashi-city",
    name: "Takahashi",
    nameJa: "高梁",
    prefecture: "Okayama",
    region: "Chugoku",
    coordinates: { lat: 34.792, lng: 133.617 },
    wikipediaTitle: "Takahashi,_Okayama",
    description:
      "An Okayama castle town with Bitchu Matsuyama Castle, Japan's only surviving mountain-top castle keep.",
    highlights: ["Bitchu Matsuyama Castle", "Castle town", "Mountain views"],
    tags: ["Castle", "History", "Nature"],
  },
  {
    id: "marugame-city",
    name: "Marugame",
    nameJa: "丸亀",
    prefecture: "Kagawa",
    region: "Shikoku",
    coordinates: { lat: 34.289, lng: 133.797 },
    wikipediaTitle: "Marugame,_Kagawa",
    description:
      "A Setouchi city centered on Marugame Castle, one of Japan's twelve surviving original castle keeps.",
    highlights: ["Marugame Castle", "Stone walls", "Sanuki udon"],
    tags: ["Castle", "History", "Food"],
  },
  {
    id: "katori-city",
    name: "Katori",
    nameJa: "香取",
    prefecture: "Chiba",
    region: "Kanto",
    coordinates: { lat: 35.897, lng: 140.499 },
    wikipediaTitle: "Katori,_Chiba",
    description:
      "A historic Chiba city containing the preserved canal town of Sawara and Katori Jingu shrine.",
    highlights: ["Sawara historic town", "Katori Jingu", "Canal district"],
    tags: ["History", "Shrines", "Culture"],
  },
  {
    id: "choshi-city",
    name: "Choshi",
    nameJa: "銚子",
    prefecture: "Chiba",
    region: "Kanto",
    coordinates: { lat: 35.734, lng: 140.826 },
    wikipediaTitle: "Chōshi,_Chiba",
    description:
      "An eastern Chiba fishing city on the Pacific, known for coastal scenery, seafood, and the Choshi Electric Railway.",
    highlights: ["Inubohsaki", "Coastal scenery", "Choshi Electric Railway"],
    tags: ["Coast", "Food", "Scenic Rail"],
  },
  {
    id: "fukushima-city",
    name: "Fukushima",
    nameJa: "福島",
    prefecture: "Fukushima",
    region: "Tohoku",
    coordinates: { lat: 37.76, lng: 140.474 },
    wikipediaTitle: "福島市",
    wikipediaLanguage: "ja",
    description:
      "The capital of Fukushima Prefecture, set in a basin between mountain ranges and known for fruit growing and onsen districts.",
    highlights: ["Fruit orchards", "Iizaka Onsen", "Azuma Mountains"],
    tags: ["City", "Onsen", "Nature"],
  },
  {
    id: "koriyama-city",
    name: "Koriyama",
    nameJa: "郡山",
    prefecture: "Fukushima",
    region: "Tohoku",
    coordinates: { lat: 37.4, lng: 140.36 },
    wikipediaTitle: "郡山市",
    wikipediaLanguage: "ja",
    description:
      "A central Fukushima transport and commercial hub with access to Lake Inawashiro and the Bandai area.",
    highlights: ["Asaka Canal", "Lake Inawashiro access", "Bandai gateway"],
    tags: ["City", "Transport", "Nature"],
  },
  {
    id: "akita-city",
    name: "Akita City",
    nameJa: "秋田市",
    prefecture: "Akita",
    region: "Tohoku",
    coordinates: { lat: 39.72, lng: 140.103 },
    wikipediaTitle: "秋田市",
    wikipediaLanguage: "ja",
    description:
      "The capital of Akita Prefecture, known for the Kanto Matsuri festival and access to the Sea of Japan coast.",
    highlights: ["Kanto Matsuri", "Senshu Park", "Akita food culture"],
    tags: ["City", "Culture", "Festivals"],
  },
  {
    id: "morioka-city",
    name: "Morioka City",
    nameJa: "盛岡市",
    prefecture: "Iwate",
    region: "Tohoku",
    coordinates: { lat: 39.7036, lng: 141.1527 },
    wikipediaTitle: "盛岡市",
    wikipediaLanguage: "ja",
    description:
      "The capital of Iwate Prefecture, a castle-town city where the Kitakami and Nakatsu rivers meet.",
    highlights: [
      "Morioka Castle Site Park",
      "Morioka noodles",
      "Riverfront walks",
    ],
    tags: ["City", "History", "Food"],
  },
  {
    id: "yamagata-city",
    name: "Yamagata City",
    nameJa: "山形市",
    prefecture: "Yamagata",
    region: "Tohoku",
    coordinates: { lat: 38.2554, lng: 140.3396 },
    wikipediaTitle: "山形市",
    wikipediaLanguage: "ja",
    description:
      "The capital of Yamagata Prefecture, a gateway to Yamadera and the Zao mountain area.",
    highlights: ["Kajo Park", "Yamadera access", "Yamagata food culture"],
    tags: ["City", "Culture", "Nature"],
  },
  {
    id: "hachinohe-city",
    name: "Hachinohe City",
    nameJa: "八戸市",
    prefecture: "Aomori",
    region: "Tohoku",
    coordinates: { lat: 40.5123, lng: 141.4884 },
    wikipediaTitle: "八戸市",
    wikipediaLanguage: "ja",
    description:
      "A Pacific port city in southeastern Aomori, known for seafood, morning markets, and access to the Tanesashi Coast.",
    highlights: ["Hachinohe morning market", "Tanesashi Coast", "Seafood"],
    tags: ["City", "Coast", "Food"],
  },
];

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];
const IMAGE_DESTINATION_BY_HUB_ID: Record<string, string> = {
  "hirosaki-city": "hirosaki-castle",
  "ise-city": "ise-grand-shrine",
  "aizuwakamatsu-city": "tsuruga-castle-fukushima",
  "ashikaga-city": "ashikaga-flower-park-tochigi",
  "semboku-city": "kakunodate-samurai-district-akita",
  "mine-city": "akiyoshido-cave-yamaguchi",
  "asago-city": "takeda-castle-ruins-hyogo",
  "takahashi-city": "bitchu-matsuyama-castle",
  "marugame-city": "marugame-castle",
  "katori-city": "chiba-sawara",
  "choshi-city": "choshi-chiba",
};

async function getLeadImage(
  title: string,
  language: "en" | "ja" = "en",
): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(
      `https://${language}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original|thumbnail&pithumbsize=1600&format=json&origin=*`,
      { headers: { "User-Agent": "TabiMap-city-hub-audit/1.8.1" } },
    );
    if (response.ok) {
      const data = await response.json();
      const page = Object.values(data.query?.pages || {})[0] as {
        original?: { source?: string };
        thumbnail?: { source?: string };
      };
      const image = page?.original?.source || page?.thumbnail?.source;
      if (image) return image;
      throw new Error(`Wikipedia page has no lead image: ${title}`);
    }
    if (response.status !== 429 || attempt === 3) {
      throw new Error(
        `Wikipedia image lookup failed for ${title}: ${response.status}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw new Error(`Wikipedia image lookup failed for ${title}`);
}

for (const seed of HUBS) {
  if (destinations.some((destination) => destination.id === seed.id)) continue;
  const imageDestinationId =
    seed.imageFromDestinationId || IMAGE_DESTINATION_BY_HUB_ID[seed.id];
  const existingImage = imageDestinationId
    ? destinations.find((destination) => destination.id === imageDestinationId)
        ?.heroImage
    : undefined;
  const heroImage =
    existingImage ||
    (await getLeadImage(seed.wikipediaTitle, seed.wikipediaLanguage));
  destinations.push({
    ...seed,
    heroImage,
    role: "hub",
    placeType: "hub",
    kind: "city",
    importance: "notable",
    categories: ["City", "Culture", "Food"],
    budgetMin: 7000,
    budgetMax: 14000,
    budgetRecommended: 10500,
    budgetBreakdown: { transport: 3000, tickets: 1500, food: 4500, cafe: 1500 },
    transportOptions: { train: 120, car: 120, shinkansen: 120, bus: 150 },
    totalTripHours: 8,
    walkingMin: 70,
    walkingSunMin: 35,
    walkingShadeMin: 35,
    walkingIntensity: "medium",
    indoorPercent: 35,
    comfort: { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 6 },
    ratings: {
      overall: 7.8,
      couple: 7.5,
      summer: 7.2,
      winter: 7.2,
      rain: 5.5,
      food: 7.5,
      photography: 7.8,
      relaxation: 7.2,
      value: 8,
      uniqueness: 7.6,
    },
    crowd: { weekday: 2, weekend: 3, holiday: 4 },
    season: { spring: 8, summer: 7, autumn: 8, winter: 6 },
    bestMonths: [4, 5, 10, 11],
    bestSeason: "Spring & Autumn",
    weatherDependence: "moderate",
    reservation:
      "Not usually required; reserve popular accommodation in advance.",
    parking: "Available around major attractions; confirm local restrictions.",
    restaurants: [],
    cafes: [],
    notes:
      "Municipal hub record reviewed for strict city-boundary relationships.",
    relationships: { featuredDestinationIds: [] },
    status: "verified",
    travelEstimate: { confidence: "beta" },
    collections: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(
  `Added ${HUBS.filter((hub) => destinations.some((destination) => destination.id === hub.id)).length} reviewed municipal hubs.`,
);
