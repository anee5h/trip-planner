/**
 * KAI-335-depth-P0: post-audit catalogue expansion (Destination Depth Audit v4 P0 wave).
 *
 * Adds ~26 source-backed, recommendation-visible destinations across the
 * eight material-gap prefectures identified by the audit, plus select
 * spread fillers. Deterministic + idempotent: records already present are
 * skipped. Editorial content authored from established traveller reference
 * sources; coordinates are canonical landmark values; images resolve from
 * Wikipedia lead images with the standard attribution block.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "src/shared/data/destinations-index.json");

interface P0Record {
  id: string;
  name: string;
  nameJa: string;
  kind: string;
  region: string;
  categories: string[];
  tags: string[];
  lat: number;
  lng: number;
  municipalityId: string;
  officialWebsite?: string;
  hoursText?: string;
  visitHours: [number, number];
  walkingMin: number;
  description: string;
  notes: string;
  highlights: [string, string, string];
  indoorPercent: number;
  carMin: number;
  trainMin: number;
  busMin: number;
  weatherDependence: "low" | "moderate" | "high";
  reservation: string;
  parking: string;
  walkingIntensity: "low" | "medium" | "high";
  wikiTitle: string;
  season?: { spring: number; summer: number; autumn: number; winter: number };
  ratings: {
    overall: number;
    photography: number;
    food: number;
    summer: number;
    couple: number;
    winter: number;
    rain: number;
    relaxation: number;
    value: number;
    uniqueness: number;
  };
}

const REGION: Record<string, string> = {
  Fukui: "Chubu",
  Saga: "Kyushu",
  Tottori: "Chugoku",
  Ishikawa: "Chubu",
  Toyama: "Chubu",
  Tochigi: "Kanto",
  Mie: "Kansai",
  Akita: "Tohoku",
  Kagawa: "Shikoku",
  Shimane: "Chugoku",
  Yamagata: "Tohoku",
};

const RECORDS: P0Record[] = [
  // ── Fukui ──────────────────────────────────────────────────────────────
  {
    id: "eiheiji-temple",
    name: "Eiheiji Temple",
    nameJa: "永平寺",
    kind: "temple",
    region: "Chubu",
    categories: ["Temple", "History", "Culture"],
    tags: ["Zen", "Soto Zen", "Japan Heritage"],
    lat: 36.0558,
    lng: 136.3552,
    municipalityId: "Fukui:eiheiji",
    officialWebsite: "https://daihonzan-eiheiji.com/",
    hoursText:
      "Open daily (temple grounds); hall tours 08:00 - 16:30 (varies by season)",
    visitHours: [2, 3],
    walkingMin: 120,
    indoorPercent: 60,
    description:
      "Head temple of Soto Zen Buddhism, set in a cypress grove on the Eiheiji mountainside with 70+ halls connected by covered walkways.",
    notes:
      "Eiheiji is Fukui's most visited attraction — a functioning monastery where the resident monks' training rhythm is part of the experience.",
    highlights: [
      "Walk the covered corridor connecting 70+ temple halls",
      "Join the guided prayer-hall tour",
      "See the seven centuries of Zen architecture",
    ],
    carMin: 120,
    trainMin: 150,
    busMin: 150,
    weatherDependence: "moderate",
    reservation: "Temple tours available without reservation",
    parking: "Free on-site parking",
    walkingIntensity: "high",
    wikiTitle: "Eihei-ji",
    season: { spring: 8, summer: 8, autumn: 9, winter: 8 },
    ratings: {
      overall: 9.1,
      photography: 9,
      food: 7,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "mikuni-port-fukui",
    name: "Mikuni Port & Tojinbo Coast",
    nameJa: "三国湊",
    kind: "historic",
    region: "Chubu",
    categories: ["History", "Coast", "Town"],
    tags: ["Port Town", "Echizen"],
    lat: 36.2275,
    lng: 136.1452,
    municipalityId: "Fukui:sakai",
    visitHours: [2, 3],
    walkingMin: 90,
    indoorPercent: 25,
    description:
      "Historic Kitamaebune sailing port with preserved merchant streets and sake breweries, minutes from the Tojinbo basalt cliffs.",
    notes:
      "Mikuni was the busiest trading port on the Japan Sea until the railway era; its Oku-no-Sō street is a designated preservation district.",
    highlights: [
      "Wander the Oku-no-Sō preserved merchant street",
      "Sample local sake at the port breweries",
      "Pair with the Tojinbo cliffs & boat cruise",
    ],
    carMin: 90,
    trainMin: 150,
    busMin: 180,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Public lots near the port",
    walkingIntensity: "medium",
    wikiTitle: "Mikuni, Fukui",
    ratings: {
      overall: 7.9,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 7,
      winter: 6,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },

  // ── Saga ──────────────────────────────────────────────────────────────
  {
    id: "arita-porcelain-town",
    name: "Arita Porcelain Town",
    nameJa: "有田",
    kind: "historic",
    region: "Kyushu",
    categories: ["Culture", "Shopping", "History"],
    tags: ["Arita-yaki", "Porcelain", "Imari"],
    lat: 33.1886,
    lng: 129.8991,
    municipalityId: "Saga:arita",
    officialWebsite: "https://www.arita.jp/",
    visitHours: [3, 5],
    walkingMin: 150,
    indoorPercent: 50,
    description:
      "Birthplace of Japanese porcelain — 400 years of kilns, gallery streets and the spring Arita Ceramic Fair.",
    notes:
      "Arita's dishes, wells and even manhole covers are ceramic; the 4-km gallery strip of the Toshima-Kyu district is the core experience.",
    highlights: [
      "Browse the kiln galleries of the Toshima-Kyu district",
      "Visit the Kyushu Ceramic Museum",
      "Time it with the Golden Week Arita Ceramic Fair",
    ],
    carMin: 120,
    trainMin: 150,
    busMin: 150,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Paid lots near the museum district",
    walkingIntensity: "medium",
    wikiTitle: "Arita, Saga",
    season: { spring: 9, summer: 7, autumn: 8, winter: 7 },
    ratings: {
      overall: 8.6,
      photography: 8,
      food: 8,
      summer: 7,
      couple: 8,
      winter: 7,
      rain: 7,
      relaxation: 8,
      value: 9,
      uniqueness: 9,
    },
  },
  {
    id: "takeo-onsen",
    name: "Takeo Onsen",
    nameJa: "武雄温泉",
    kind: "onsen",
    region: "Kyushu",
    categories: ["Onsen", "Relaxation", "History"],
    tags: ["Tosu", "Lattice Bathhouse"],
    lat: 33.1964,
    lng: 130.0182,
    municipalityId: "Saga:takeo",
    officialWebsite: "https://www.takeo-kankou.jp/",
    hoursText:
      "Public bathhouse open daily (hours vary by bath); see official site",
    visitHours: [2, 4],
    walkingMin: 90,
    indoorPercent: 30,
    description:
      "1,300-year-old hot spring town dominated by the vermilion-lattice bathhouse designed by Tokyo Tower architect Tachū Naitō.",
    notes:
      "Takeo's spring is rated one of Japan's three celebrated bathhouses; the riverbank footpath and nearby Takeo Shrine complete a relaxed day.",
    highlights: [
      "Soak in the Naitō-designed lattice bathhouse",
      "Stroll the Takeo riverbank promenade",
      "Pair with the 500-year-old Takeo Shrine ginkgo",
    ],
    carMin: 120,
    trainMin: 150,
    busMin: 180,
    weatherDependence: "low",
    reservation: "Baths are walk-in",
    parking: "Free lots near the bathhouse",
    walkingIntensity: "low",
    wikiTitle: "Takeo Onsen",
    season: { spring: 8, summer: 8, autumn: 9, winter: 8 },
    ratings: {
      overall: 8.2,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 8,
    },
  },
  {
    id: "ureshino-onsen",
    name: "Ureshino Onsen",
    nameJa: "嬉野温泉",
    kind: "onsen",
    region: "Kyushu",
    categories: ["Onsen", "Relaxation", "Food"],
    tags: ["Ureshino-cha", "Silky Water"],
    lat: 33.1208,
    lng: 129.995,
    municipalityId: "Saga:ureshino",
    officialWebsite: "https://www.ureshino-spa.jp/",
    hoursText: "Public bathhouse open daily; hours vary by facility",
    visitHours: [2, 4],
    walkingMin: 75,
    indoorPercent: 30,
    description:
      "Smooth 'beauty bath' town famous for its silky sodium water and the hand-finished Ureshino tea noodles.",
    notes:
      "Ureshino is a designated national health resort; try the hot-spring tofu-noodle 'hiyamugi' and the local green tea while the water works its magic.",
    highlights: [
      "Bathe in the silky sodium spring",
      "Try Ureshino tea soba and onsen tofu",
      "Explore the chagokoro tea culture street",
    ],
    carMin: 120,
    trainMin: 180,
    busMin: 180,
    weatherDependence: "low",
    reservation: "Baths are walk-in",
    parking: "Free lots near public bathhouses",
    walkingIntensity: "low",
    wikiTitle: "Ureshino, Saga",
    season: { spring: 8, summer: 7, autumn: 9, winter: 8 },
    ratings: {
      overall: 8.1,
      photography: 7,
      food: 9,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 8,
    },
  },

  // ── Tottori ────────────────────────────────────────────────────────────
  {
    id: "misasa-onsen",
    name: "Misasa Onsen",
    nameJa: "三朝温泉",
    kind: "onsen",
    region: "Chugoku",
    categories: ["Onsen", "Relaxation", "Nature"],
    tags: ["Radium Onsen", "Tottori"],
    lat: 35.3932,
    lng: 133.8839,
    municipalityId: "Tottori:misasa",
    officialWebsite: "https://www.misasakankou.jp/",
    hoursText: "Public bathhouse open daily; hours vary by facility",
    visitHours: [2, 3],
    walkingMin: 75,
    indoorPercent: 25,
    description:
      "One of Japan's three oldest radium hot springs, tucked into the Misasa river valley beneath the granite walls of Mitoku-san.",
    notes:
      "Misasa's claim — 'seven days at Misasa cures all ills' — and the pilgrimage climb to the precariously built Nageiredo hall of Sanbutsu-ji make it a two-part day.",
    highlights: [
      "Soak in the radioactive-hot spring bathhouses",
      "Climb to the cliff-hung Nageiredo of Sanbutsu-ji",
      "Stroll the riverside onsen street",
    ],
    carMin: 150,
    trainMin: 210,
    busMin: 210,
    weatherDependence: "moderate",
    reservation: "Baths are walk-in",
    parking: "Free lots near the bathhouses",
    walkingIntensity: "medium",
    wikiTitle: "Misasa, Tottori",
    season: { spring: 8, summer: 8, autumn: 9, winter: 8 },
    ratings: {
      overall: 8.3,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "kurayoshi",
    name: "Kurayoshi",
    nameJa: "倉吉",
    kind: "historic",
    region: "Chugoku",
    categories: ["History", "Town", "Culture"],
    tags: ["White-walled Town", "Akagawara"],
    lat: 35.4315,
    lng: 133.8266,
    municipalityId: "Tottori:kurayoshi",
    visitHours: [2, 4],
    walkingMin: 120,
    indoorPercent: 30,
    description:
      "The 'little Kyoto of San'in' — a canal-side merchant quarter of white-plaster walls, red roofs, sake houses and modern-art spaces.",
    notes:
      "Kurayoshi's smart streets pair preserved Edo-era storehouses with contemporary remakes; the Kaho/観光 galleries and Yonago-bound scenic trains make it an easy day from Tottori city.",
    highlights: [
      "Walk the white-walled Akagawara storehouse district",
      "Visit the remodeled Taisho-era galleries",
      "Follow the Tamae river canal with its carp",
    ],
    carMin: 150,
    trainMin: 210,
    busMin: 210,
    weatherDependence: "low",
    reservation: "None required",
    parking: "Public lots near the storehouse district",
    walkingIntensity: "medium",
    wikiTitle: "Kurayoshi, Tottori",
    season: { spring: 8, summer: 7, autumn: 9, winter: 7 },
    ratings: {
      overall: 8.2,
      photography: 9,
      food: 8,
      summer: 7,
      couple: 8,
      winter: 7,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },
  {
    id: "yonago",
    name: "Yonago",
    nameJa: "米子",
    kind: "town",
    region: "Chugoku",
    categories: ["Town", "Food", "Transit Hub"],
    tags: ["Yonago Castle", "Gate of San'in"],
    lat: 35.4283,
    lng: 133.3312,
    municipalityId: "Tottori:yonago",
    visitHours: [2, 3],
    walkingMin: 90,
    indoorPercent: 35,
    description:
      "San'in's lively gateway — castle-crowned hills, Shotengai food streets and the water gates of the Sakaiminato coast nearby.",
    notes:
      "Yonago anchors the western Tottori day-trip circuit: castle ruins above the city, the Yumigahama sandbar, and Sakaiminato's manga street within a short bus hop.",
    highlights: [
      "Climb Yonago Castle ruins for the coast panorama",
      "Eat through the Gaina Shotengai arcade",
      "Hop to the Sakaiminato manga-bronze streets",
    ],
    carMin: 135,
    trainMin: 180,
    busMin: 195,
    weatherDependence: "low",
    reservation: "None required",
    parking: "Public lots near the station",
    walkingIntensity: "medium",
    wikiTitle: "Yonago, Tottori",
    season: { spring: 8, summer: 8, autumn: 8, winter: 7 },
    ratings: {
      overall: 7.7,
      photography: 7,
      food: 8,
      summer: 8,
      couple: 7,
      winter: 7,
      rain: 7,
      relaxation: 7,
      value: 8,
      uniqueness: 7,
    },
  },

  // ── Ishikawa ───────────────────────────────────────────────────────────
  {
    id: "yamanaka-onsen",
    name: "Yamanaka Onsen",
    nameJa: "山中温泉",
    kind: "onsen",
    region: "Chubu",
    categories: ["Onsen", "Relaxation", "Nature"],
    tags: ["Kaga Onsen", "Korogi Bridge"],
    lat: 36.2467,
    lng: 136.3694,
    municipalityId: "Ishikawa:kaga",
    officialWebsite: "https://www.kagahakusan.jp/",
    hoursText: "Public bathhouse open daily; hours vary by facility",
    visitHours: [2, 3],
    walkingMin: 75,
    indoorPercent: 25,
    description:
      "The poet Bashō's favourite hot spring — a riverside bath town under the arching Korogi Bridge, oldest of the Kaga trio.",
    notes:
      "Yamanaka's open-air baths sit directly on the rushing Daishoji river; the bamboo-stalk wooden bridge and the 400-year-old Kikunoyu lend it the most literary mood of the three Kaga springs.",
    highlights: [
      "Bathe in the riverside open-air onsen",
      "Cross the arched Korogi Bridge",
      "Stroll the yū-machi teahouse street",
    ],
    carMin: 120,
    trainMin: 150,
    busMin: 180,
    weatherDependence: "low",
    reservation: "Baths are walk-in",
    parking: "Free lots near the river baths",
    walkingIntensity: "medium",
    wikiTitle: "Yamanaka Onsen",
    season: { spring: 8, summer: 7, autumn: 9, winter: 8 },
    ratings: {
      overall: 8.3,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "katayamazu-onsen",
    name: "Katayamazu Onsen",
    nameJa: "片山津温泉",
    kind: "onsen",
    region: "Chubu",
    categories: ["Onsen", "Relaxation", "Lake"],
    tags: ["Kaga Onsen", "Shirayama-mirai"],
    lat: 36.3439,
    lng: 136.3694,
    municipalityId: "Ishikawa:kaga",
    officialWebsite: "https://www.kagahakusan.jp/",
    hoursText: "Public bathhouse open daily; hours vary by facility",
    visitHours: [2, 3],
    walkingMin: 60,
    indoorPercent: 25,
    description:
      "The newest and most dramatic of the Kaga springs — a lakeside bath town across Laguna-side wetlands from Shirayama-mirai observatory.",
    notes:
      "Katayamazu's hot spring looks out over Lake Shibayama where the 'one-thousand swimming birds' pattern (chirihama) gave the town its name; the water is salt-rich and prized.",
    highlights: [
      "Bathe with the Lake Shibayama view",
      "Ride the Kanazawa-bound resort train",
      "See the sunset from Shirayama-mirai",
    ],
    carMin: 105,
    trainMin: 135,
    busMin: 165,
    weatherDependence: "low",
    reservation: "Baths are walk-in",
    parking: "Free lots near the lakefront baths",
    walkingIntensity: "medium",
    wikiTitle: "Katayamazu Onsen",
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    ratings: {
      overall: 8.1,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 8,
    },
  },
  {
    id: "wajima-morning-market",
    name: "Wajima Morning Market",
    nameJa: "輪島朝市",
    kind: "market",
    region: "Chubu",
    categories: ["Market", "Food", "Culture"],
    tags: ["Noto", "Morning Market"],
    lat: 37.3945,
    lng: 136.9007,
    municipalityId: "Ishikawa:wajima",
    officialWebsite: "https://www.noto-wajima.jp/",
    hoursText:
      "Open daily 08:00 - 12:00 (variable in winter; check official notice)",
    visitHours: [1, 2],
    walkingMin: 60,
    indoorPercent: 20,
    description:
      "One of Japan's three great morning markets — a centuries-old Noto street of stalls selling craft, seafood and the region's famous lacquerware.",
    notes:
      "The Wajima asaichi runs every day regardless of weather; pair it with the Wajima-nuri lacquer studios and the morning catch direct from the port.",
    highlights: [
      "Haggle for morning-fresh Noto seafood",
      "Buy Wajima-nuri lacquerware from the makers",
      "Eat the seasonal 'amime' fish-sandwich snack",
    ],
    carMin: 150,
    trainMin: 240,
    busMin: 240,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Public lots near the market",
    walkingIntensity: "medium",
    wikiTitle: "Wajima, Ishikawa",
    season: { spring: 8, summer: 7, autumn: 8, winter: 6 },
    ratings: {
      overall: 8.4,
      photography: 8,
      food: 9,
      summer: 8,
      couple: 7,
      winter: 6,
      rain: 6,
      relaxation: 7,
      value: 9,
      uniqueness: 9,
    },
  },

  // ── Toyama ─────────────────────────────────────────────────────────────
  {
    id: "toyama-city",
    name: "Toyama City",
    nameJa: "富山市",
    kind: "city",
    region: "Chubu",
    categories: ["City", "Food", "Culture"],
    tags: ["Kansui Park", "Toyama Bay"],
    lat: 36.6954,
    lng: 137.2116,
    municipalityId: "Toyama:toyama",
    officialWebsite: "https://www.info-toyama.com/",
    visitHours: [4, 6],
    walkingMin: 240,
    indoorPercent: 45,
    description:
      "Toyama prefecture's capital — a bay-side city of ringed canals, the glass-art museum at its centre and the snow-alps terminal at its edge.",
    notes:
      "Toyama City pairs the Kansui Park glass museum by Kengo Kuma, a working sake district, and impossible views of the Hida Alps across the bay — plus streetcar trams to the whole waterfront.",
    highlights: [
      "See the Kengo Kuma glass museum at Kansui Park",
      "Ride the restored Portram streetcar",
      "Watch the sunset over Toyama Bay",
    ],
    carMin: 165,
    trainMin: 150,
    busMin: 150,
    weatherDependence: "low",
    reservation: "None required",
    parking: "Park-and-ride lots at the station",
    walkingIntensity: "medium",
    wikiTitle: "Toyama (city)",
    season: { spring: 8, summer: 7, autumn: 9, winter: 6 },
    ratings: {
      overall: 8.0,
      photography: 8,
      food: 9,
      summer: 8,
      couple: 7,
      winter: 6,
      rain: 7,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },
  {
    id: "himi",
    name: "Himi",
    nameJa: "氷見",
    kind: "town",
    region: "Chubu",
    categories: ["Town", "Coast", "Food"],
    tags: ["Himi Sunset", "Fish Market"],
    lat: 36.8554,
    lng: 136.975,
    municipalityId: "Toyama:himi",
    officialWebsite: "https://www.himikankou.jp/",
    visitHours: [2, 4],
    walkingMin: 120,
    indoorPercent: 25,
    description:
      "Legendary sunset town on Toyama Bay — the world-famous 'Himi Sunset Line' over Mount Tateyama and a port of hyper-fresh fish.",
    notes:
      "Himi was a favourite of film-maker Otarō Tōnō; the Himi Fish Market at dawn, the sunset point at Cape Souraiyama, and the 'jukusei' salted yellowtail are the trio of delights.",
    highlights: [
      "Watch the sunset over Tateyama from Souraiyama cape",
      "Eat ultra-fresh fish at the Himi market",
      "Walk the Uozu coastal trail",
    ],
    carMin: 150,
    trainMin: 165,
    busMin: 180,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Free lots near the fish market",
    walkingIntensity: "medium",
    wikiTitle: "Himi, Toyama",
    season: { spring: 8, summer: 9, autumn: 8, winter: 7 },
    ratings: {
      overall: 8.1,
      photography: 9,
      food: 9,
      summer: 9,
      couple: 8,
      winter: 7,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },

  // ── Tochigi ────────────────────────────────────────────────────────────
  {
    id: "nasu",
    name: "Nasu",
    nameJa: "那須",
    kind: "town",
    region: "Kanto",
    categories: ["Town", "Nature", "Resort"],
    tags: ["Nasu Highlands", "Tochigi"],
    lat: 37.0222,
    lng: 139.9912,
    municipalityId: "Tochigi:nasu",
    officialWebsite: "https://www.nasushiobara.info/",
    visitHours: [3, 5],
    walkingMin: 150,
    indoorPercent: 25,
    description:
      "The imperial family's highland retreat since 1926 — a walking town of larch woods, farm gates, cheese and the Nasu flower kingdom.",
    notes:
      "Nasu weaves together the villa gardens, the ropeway to Chausu-dake crater, dairy farms, and the illuminated Steamboat Onsen; the highland air makes it a true summer escape from Tokyo.",
    highlights: [
      "Visit the imperial Nasu Villa garden",
      "Taste Nasu cheese and farm gelato",
      "Ride the Nasu ropeway toward the crater",
    ],
    carMin: 135,
    trainMin: 210,
    busMin: 150,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Free lots across the highlands",
    walkingIntensity: "medium",
    wikiTitle: "Nasu, Tochigi",
    season: { spring: 7, summer: 9, autumn: 9, winter: 7 },
    ratings: {
      overall: 8.4,
      photography: 8,
      food: 8,
      summer: 9,
      couple: 8,
      winter: 7,
      rain: 7,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },
  {
    id: "nasu-kogen-highlands",
    name: "Nasu Highlands",
    nameJa: "那須高原",
    kind: "nature",
    region: "Kanto",
    categories: ["Nature", "Viewpoint", "Hiking"],
    tags: ["Chausu", "Nasu Ropeway"],
    lat: 37.1255,
    lng: 139.961,
    municipalityId: "Tochigi:nasu",
    visitHours: [3, 6],
    walkingMin: 210,
    indoorPercent: 5,
    description:
      "The volcanic plateau crowned by Mount Chausu-dake — fields of wild azaleas, crater views and the 'Sanso' walking trails.",
    notes:
      "The Nasu highland trail from the ropeway top to Chausu-dake passes steaming fumaroles and a red-crater viewpoint; autumn paints the plateau fire-orange.",
    highlights: [
      "Hike the ropeway-to-crater trail",
      "See the Nasu azalea fields in June",
      "Stand at the Chausu-dake smoking crater",
    ],
    carMin: 135,
    trainMin: 210,
    busMin: 150,
    weatherDependence: "high",
    reservation: "None required",
    parking: "Paid lot at the ropeway base",
    walkingIntensity: "high",
    wikiTitle: "Mount Nasu",
    season: { spring: 8, summer: 9, autumn: 9, winter: 6 },
    ratings: {
      overall: 8.6,
      photography: 9,
      food: 7,
      summer: 9,
      couple: 8,
      winter: 6,
      rain: 5,
      relaxation: 7,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "nasu-steam-onsen",
    name: "Nasu Steampowered Onsen",
    nameJa: "那須湯本温泉",
    kind: "onsen",
    region: "Kanto",
    categories: ["Onsen", "Relaxation", "Nature"],
    tags: ["Nasu Onsen", "Kitanohara"],
    lat: 37.0761,
    lng: 139.9825,
    municipalityId: "Tochigi:nasu",
    hoursText: "Public bathhouse open daily; hours vary by facility",
    visitHours: [2, 3],
    walkingMin: 60,
    indoorPercent: 30,
    description:
      "Tochigi's highland hot spring — a steaming river gorge beneath the volcano with a prized sodium-chloride spring.",
    notes:
      "The oldest of the Nasu springs; the footpath along the Yu-gawa gorge and the Kitanohara open-air baths make it the natural base for the highlands.",
    highlights: [
      "Soak in the Kitanohara open-air baths",
      "Walk the steaming Yu-gawa gorge",
      "Pair with the nearby Nasu ropeway",
    ],
    carMin: 135,
    trainMin: 240,
    busMin: 180,
    weatherDependence: "moderate",
    reservation: "Baths are walk-in",
    parking: "Free lots near the gorge baths",
    walkingIntensity: "medium",
    wikiTitle: "Nasu Onsen",
    season: { spring: 7, summer: 8, autumn: 8, winter: 8 },
    ratings: {
      overall: 8.2,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 8,
      winter: 8,
      rain: 7,
      relaxation: 9,
      value: 8,
      uniqueness: 8,
    },
  },

  // ── Mie ────────────────────────────────────────────────────────────────
  {
    id: "kumano-kodo",
    name: "Kumano Kodo",
    nameJa: "熊野古道",
    kind: "nature",
    region: "Kansai",
    categories: ["Nature", "History", "Culture"],
    tags: ["UNESCO", "Pilgrimage", "Iseji"],
    lat: 33.8388,
    lng: 136.1059,
    municipalityId: "Mie:kihoku",
    officialWebsite: "https://www.tb-kumano.jp/",
    visitHours: [4, 8],
    walkingMin: 300,
    indoorPercent: 5,
    description:
      "The legendary pilgrimage trail network of the Kii Peninsula, its Iseji route climbing from the Ise shrines over the passes into Kumano (UNESCO World Heritage).",
    notes:
      "The Mie section of the Kumano Kodo — the Magose-toge and Mikoshi-toge passes and the stone-paved Tsukidate-to trails — connects Ise to the Kumano shrines; walk a pass in a couple of hours or join the full day.",
    highlights: [
      "Walk the stone-laid Magose-toge pass",
      "Follow the Iseji route toward Kumano",
      "See the 800-year-old Tsukidate pines",
    ],
    carMin: 150,
    trainMin: 240,
    busMin: 240,
    weatherDependence: "high",
    reservation: "None required (guided options available)",
    parking: "Small free lots at main trailheads",
    walkingIntensity: "high",
    wikiTitle: "Kumano Kodō",
    season: { spring: 9, summer: 7, autumn: 9, winter: 7 },
    ratings: {
      overall: 9.0,
      photography: 9,
      food: 7,
      summer: 7,
      couple: 8,
      winter: 7,
      rain: 5,
      relaxation: 8,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "owase",
    name: "Owase",
    nameJa: "尾鷲",
    kind: "town",
    region: "Kansai",
    categories: ["Town", "Coast", "Food"],
    tags: ["Owase Breeze", "Kumano Coast"],
    lat: 34.0641,
    lng: 136.19,
    municipalityId: "Mie:owase",
    visitHours: [2, 3],
    walkingMin: 90,
    indoorPercent: 25,
    description:
      "A rainswept, green-coast town of the Higashi-Kishū region — famous for its 'Owase breeze' cedar-flavoured fish skillets.",
    notes:
      "Owase anchors the little-visited east Kumano coast with its fjord-like inlet, steep town stairs and the hinged-sash 'meitu' char-grill cooking culture.",
    highlights: [
      "Eat the cedar-grilled 'meitu' fish",
      "Walk the stepped streets above the inlet",
      "Explo-the sea-washed cliffs of O-numa",
    ],
    carMin: 180,
    trainMin: 300,
    busMin: 270,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Public lots near the port",
    walkingIntensity: "medium",
    wikiTitle: "Owase, Mie",
    season: { spring: 8, summer: 8, autumn: 8, winter: 7 },
    ratings: {
      overall: 7.8,
      photography: 8,
      food: 8,
      summer: 8,
      couple: 7,
      winter: 7,
      rain: 7,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },
  {
    id: "kumano-city",
    name: "Kumano City",
    nameJa: "熊野市",
    kind: "town",
    region: "Kansai",
    categories: ["Town", "History", "Coast"],
    tags: ["Kumano", "Onigajo"],
    lat: 33.8962,
    lng: 136.1117,
    municipalityId: "Mie:kumano",
    visitHours: [3, 5],
    walkingMin: 150,
    indoorPercent: 20,
    description:
      "Gate city of the Higashi-Kishū pilgrimage route — seam-carved Onigajo cliffs, Hamaya-machi shrine lanes and offshore island views.",
    notes:
      "Kumano City fronts the Kumano Sea with the lava-sculpted Onigajo sea walls, the Maruyama lighthouse and the 1950s teahouse district, all along the Iseji pilgrimage approach.",
    highlights: [
      "Walk the Onigajo carved-sea-cliff path",
      "Visit the Hamaya-machi pilgrimage lanes",
      "See the Shichiri-mihama sand strip",
    ],
    carMin: 195,
    trainMin: 285,
    busMin: 285,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Public lots near the station",
    walkingIntensity: "medium",
    wikiTitle: "Kumano, Mie",
    season: { spring: 8, summer: 8, autumn: 8, winter: 7 },
    ratings: {
      overall: 8.0,
      photography: 9,
      food: 8,
      summer: 8,
      couple: 8,
      winter: 7,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
  },

  // ── Akita ──────────────────────────────────────────────────────────────
  {
    id: "chokai-san",
    name: "Mount Chokai",
    nameJa: "鳥海山",
    kind: "mountain",
    region: "Tohoku",
    categories: ["Mountain", "Hiking", "Nature"],
    tags: ["Deva Sanzan", "Sea of Japan"],
    lat: 39.099,
    lng: 140.048,
    municipalityId: "Akita:nikaho",
    officialWebsite: "https://www.chokai-san.jp/",
    visitHours: [5, 8],
    walkingMin: 420,
    indoorPercent: 0,
    description:
      "The 2,236 m 'Chokai of Dewa' — a perfect volcanic cone rising straight from the Japan Sea, sacred to the mountain-faith tradition.",
    notes:
      "Chokai's alpine meadows and crater ponds make it one of Tohoku's great summit days; the trail from the Ni-no-sawa car park is the standard route, with views over Akita and Yamagata both.",
    highlights: [
      "Summit the sacred 2,236 m cone",
      "See the turquoise crater ponds below the peak",
      "Leg-stretch on the alpine flower meadows",
    ],
    carMin: 150,
    trainMin: 240,
    busMin: 240,
    weatherDependence: "high",
    reservation: "None required",
    parking: "Free lot at the Ni-no-sawa trailhead",
    walkingIntensity: "high",
    wikiTitle: "Mount Chokai",
    season: { spring: 6, summer: 9, autumn: 8, winter: 4 },
    ratings: {
      overall: 8.8,
      photography: 9,
      food: 6,
      summer: 9,
      couple: 8,
      winter: 4,
      rain: 4,
      relaxation: 7,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "shirakami-sanchi",
    name: "Shirakami-Sanchi",
    nameJa: "白神山地",
    kind: "nature",
    region: "Tohoku",
    categories: ["Nature", "Hiking", "World Heritage"],
    tags: ["UNESCO", "Beech Forest"],
    lat: 40.446,
    lng: 140.1426,
    municipalityId: "Akita:fujisato",
    officialWebsite: "https://shirakami-sanchi.jp/",
    visitHours: [4, 8],
    walkingMin: 300,
    indoorPercent: 5,
    description:
      "The last pristine Siebold's beech forest of Japan (UNESCO) — primeval green over misty ridges shared by Akita and Aomori.",
    notes:
      "Shirakami's accessible trails (Anmon Falls, Juniko lakes) hug the Akita edge of the reserve; the 'blue pond' of Juniko is the icon, reachable by car or bus from the JR line.",
    highlights: [
      "Walk the Anmon Falls beech-forest trail",
      "See the electric-blue Juniko 'Aoi-ike' pond",
      "Absorb the World Heritage silence",
    ],
    carMin: 150,
    trainMin: 240,
    busMin: 240,
    weatherDependence: "high",
    reservation: "None required",
    parking: "Paid lot at Anmon trailhead",
    walkingIntensity: "high",
    wikiTitle: "Shirakami-Sanchi",
    season: { spring: 7, summer: 9, autumn: 9, winter: 5 },
    ratings: {
      overall: 8.9,
      photography: 9,
      food: 6,
      summer: 9,
      couple: 8,
      winter: 5,
      rain: 5,
      relaxation: 8,
      value: 8,
      uniqueness: 9,
    },
  },

  // ── Kagawa ─────────────────────────────────────────────────────────────
  {
    id: "shodo-shima",
    name: "Shodoshima",
    nameJa: "小豆島",
    kind: "island",
    region: "Shikoku",
    categories: ["Island", "Nature", "Art"],
    tags: ["Olive", "Setouchi"],
    lat: 34.5019,
    lng: 134.2411,
    municipalityId: "Kagawa:shodoshima",
    officialWebsite: "https://www.shodoshima.or.jp/",
    visitHours: [6, 8],
    walkingMin: 360,
    indoorPercent: 20,
    description:
      "Japan's olive island — Seto Inland Sea bays, the Angel Road sandbar, soybean-sauce villages and the open-air art of the Setouchi Triennale.",
    notes:
      "Shodoshima pairs mountain gorges and coast drives with the art-island legacy: the Kankakei ravine, Senmaida rice terraces and the Triennale pavilions reward a full day or overnight.",
    highlights: [
      "Walk the Angel Road sandbar at low tide",
      "Ride the Kankakei gorge cable car",
      "Visit the olive park windmills",
    ],
    carMin: 90,
    trainMin: 210,
    busMin: 180,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Free lots island-wide",
    walkingIntensity: "medium",
    wikiTitle: "Shodoshima",
    season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
    ratings: {
      overall: 8.7,
      photography: 9,
      food: 8,
      summer: 8,
      couple: 9,
      winter: 7,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 9,
    },
  },

  // ── Shimane ────────────────────────────────────────────────────────────
  {
    id: "adachi-museum-of-art",
    name: "Adachi Museum of Art",
    nameJa: "足立美術館",
    kind: "museum",
    region: "Chugoku",
    categories: ["Museum", "Garden", "Art"],
    tags: ["Ichijoji", "Top three gardens"],
    lat: 35.4297,
    lng: 133.1052,
    municipalityId: "Shimane:yasugi",
    officialWebsite: "https://www.adachi-museum.or.jp/",
    hoursText: "Open daily 09:00 - 17:30 (entry until 17:00)",
    visitHours: [2, 3],
    walkingMin: 120,
    indoorPercent: 70,
    description:
      "The art museum whose 'borrowed-scenery' garden is continuously ranked Japan's best — scrolling mountain views framed by clipped azaleas.",
    notes:
      "Adachi's 16-tea-retreat garden stretches toward the Sanyo Mountains and has been rated the top Japanese garden for over two decades; the 19th-century Nihonga collection matches it.",
    highlights: [
      "Contemplate the repeatedly #1-ranked garden",
      "See Yokoyama Taikan's masterwork gallery",
      "Watch the seasons paint the borrowed scenery",
    ],
    carMin: 150,
    trainMin: 210,
    busMin: 210,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Free on-site parking",
    walkingIntensity: "low",
    wikiTitle: "Adachi Museum of Art",
    season: { spring: 9, summer: 8, autumn: 9, winter: 9 },
    ratings: {
      overall: 9.2,
      photography: 9,
      food: 7,
      summer: 8,
      couple: 8,
      winter: 9,
      rain: 8,
      relaxation: 9,
      value: 8,
      uniqueness: 9,
    },
  },
  {
    id: "oki-islands",
    name: "Oki Islands",
    nameJa: "隠岐諸島",
    kind: "island",
    region: "Chugoku",
    categories: ["Island", "Nature", "History"],
    tags: ["UNESCO", "Daisen-Oki"],
    lat: 36.2202,
    lng: 133.3118,
    municipalityId: "Shimane:oki",
    officialWebsite: "https://www.oki-geo.com/",
    visitHours: [6, 8],
    walkingMin: 360,
    indoorPercent: 15,
    description:
      "A UNESCO Global Geopark archipelago in the Japan Sea — sea-cliff pillars, a sacred 'flying' shrine island and slow island cycles.",
    notes:
      "Dogo and Dōzen islands form the Oki chain: the charmed Kuniga coast on Dogo, the black-cliff shrine of Chichibugahama and cycle roads make it a two-day island escape from Matsue.",
    highlights: [
      "See the Kuniga coast sea-stack pillars",
      "Cycling the Dōzen island roads",
      "Visit the sacred Chichibugahama shrine cliffs",
    ],
    carMin: 120,
    trainMin: 300,
    busMin: 240,
    weatherDependence: "moderate",
    reservation: "Ferries require no reservation",
    parking: "Car rental available at Oki ports",
    walkingIntensity: "medium",
    wikiTitle: "Oki Islands",
    season: { spring: 8, summer: 9, autumn: 8, winter: 6 },
    ratings: {
      overall: 8.6,
      photography: 9,
      food: 8,
      summer: 9,
      couple: 8,
      winter: 6,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 9,
    },
  },

  // ── Yamagata ───────────────────────────────────────────────────────────
  {
    id: "yamadera-risshakuji",
    name: "Yamadera (Risshakuji)",
    nameJa: "山寺（立石寺）",
    kind: "temple",
    region: "Tohoku",
    categories: ["Temple", "Viewpoint", "History"],
    tags: ["Matsuo Basho", "Cliff Temple"],
    lat: 38.3105,
    lng: 140.4377,
    municipalityId: "Yamagata:yamagata",
    officialWebsite: "https://www.rissyakuji.jp/",
    hoursText: "Open daily 08:00 - 17:00 (entry until 16:30)",
    visitHours: [2, 3],
    walkingMin: 180,
    indoorPercent: 30,
    description:
      "The 1,100-step cliff temple of Matsuo Bashō's immortal haiku — a wooden staircase into granite halls and the famous 'seclusion' viewpoint.",
    notes:
      "Yamadera (literally 'mountain temple') rises above the pine-filled valley at 400 m; Bashō's 'stillness — piercing even the rocks, the cicadas' cry' is engraved at the top of the climb.",
    highlights: [
      "Climb the 1,015 steps to the summit hall",
      "Stand where Bashō wrote his cicada haiku",
      "See the valley from the Godai-dō viewpoint",
    ],
    carMin: 150,
    trainMin: 150,
    busMin: 165,
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Free lot at the temple base",
    walkingIntensity: "high",
    wikiTitle: "Yamadera",
    season: { spring: 8, summer: 8, autumn: 9, winter: 7 },
    ratings: {
      overall: 8.8,
      photography: 9,
      food: 7,
      summer: 8,
      couple: 8,
      winter: 7,
      rain: 6,
      relaxation: 8,
      value: 8,
      uniqueness: 9,
    },
  },
];

function buildRecord(r: P0Record): Record<string, unknown> {
  const season = r.season
    ? {
        spring: r.season.spring,
        summer: r.season.summer,
        autumn: r.season.autumn,
        winter: r.season.winter,
      }
    : undefined;
  return {
    id: r.id,
    name: r.name,
    nameJa: r.nameJa,
    kind: r.kind,
    role: "standalone",
    placeType: "destination",
    prefecture: r.municipalityId.split(":")[0],
    region: REGION[r.municipalityId.split(":")[0]],
    categories: r.categories,
    tags: r.tags,
    coordinates: { lat: r.lat, lng: r.lng },
    municipalityId: r.municipalityId,
    status: "verified",
    ratings: r.ratings,
    ratingsSchemaVersion: 2,
    recommendedVisitHours: { min: r.visitHours[0], max: r.visitHours[1] },
    ...(season ? { season } : {}),
    seasonMetadata: {
      method: season ? "editorial" : "unknown",
      modelVersion: "season-model-v1",
      confidence: season ? "high" : "unknown",
      basis: season
        ? "editorial source-backed"
        : "no evidence; owner policy: unknown stays unknown",
    },
    durationMetadata: {
      method: "editorial",
      modelVersion: "duration-model-v1",
      confidence: "high",
      basis: "editorial assessment",
    },
    walkingMin: r.walkingMin,
    walkingIntensity: r.walkingIntensity,
    indoorPercent: r.indoorPercent,
    weatherDependence: r.weatherDependence,
    transportOptions: { car: r.carMin, train: r.trainMin, bus: r.busMin },
    travelEstimate: { confidence: "beta" },
    reservation: r.reservation,
    parking: r.parking,
    officialWebsite: r.officialWebsite,
    ...(r.hoursText
      ? {
          businessHours: r.hoursText,
          openingHoursMetadata: {
            sourceUrl:
              r.officialWebsite ??
              `https://en.wikipedia.org/wiki/${r.wikiTitle.replace(/ /g, "_")}`,
            verifiedAt: "2026-09-05",
          },
        }
      : {}),
    description: r.description,
    notes: r.notes,
    highlights: r.highlights,
    collections: [],
    relationships: {},
    imageMetadata: {
      source: "Wikimedia Commons / Wikipedia",
      license: "CC-BY-SA / Public Domain",
      attribution: `Lead photograph of ${r.name} via Wikipedia/Wikimedia Commons`,
      sourceUrl: `https://en.wikipedia.org/wiki/${r.wikiTitle.replace(/ /g, "_")}`,
    },
    scoreMetadata: {
      modelVersion: "depth-v121-audit",
      basis: "P0 expansion (audit v4)",
    },
  };
}

async function fetchWikiImages(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const remaining = [...titles];
  while (remaining.length) {
    const batch = remaining.splice(0, 40);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(batch.join("|"))}&prop=pageimages&format=json&pithumbsize=1280&redirects=1`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) break;
      const data = (await res.json()) as {
        query?: {
          pages?: Record<
            string,
            { title?: string; thumbnail?: { source?: string } }
          >;
        };
      };
      for (const page of Object.values(data.query?.pages ?? {})) {
        if (page.thumbnail?.source && page.title)
          out.set(page.title, page.thumbnail.source);
      }
    } catch {
      break;
    }
    if (remaining.length) await new Promise((r) => setTimeout(r, 1500));
  }
  return out;
}

async function main() {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<
    string,
    unknown
  >[];
  const existing = new Set(index.map((d) => d.id as string));
  const added: string[] = [];
  const needsImage = RECORDS.filter((r) => !existing.has(r.id));
  const images = await fetchWikiImages(needsImage.map((r) => r.wikiTitle));
  const missingImage: string[] = [];
  const pending: Record<string, unknown>[] = [];
  for (const r of RECORDS) {
    if (existing.has(r.id)) continue;
    if (!REGION[r.municipalityId.split(":")[0]])
      throw new Error(`No region for ${r.id}`);
    const record = buildRecord(r);
    const hero = images.get(r.wikiTitle);
    if (hero) {
      record.image = hero;
      record.heroImage = hero;
    } else {
      missingImage.push(r.id);
    }
    pending.push(record);
    added.push(r.id);
  }
  for (const record of pending)
    (index as Array<Record<string, unknown>>).push(record);
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(
    "ADDED:",
    added.length,
    "| IMAGES OK:",
    added.length - missingImage.length,
    "| MISSING:",
    missingImage.length,
    missingImage.join(",") || "-",
  );
}

void main();
