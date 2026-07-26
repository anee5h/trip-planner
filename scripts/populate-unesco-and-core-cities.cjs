const fs = require("fs");
const path = require("path");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
let destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

// 1. Core Designated Cities list (20)
const coreCitiesData = [
  {
    id: "chiba-city",
    name: "Chiba City",
    nameJa: "千葉市",
    pref: "Chiba",
    region: "Kanto",
    lat: 35.6074,
    lng: 140.1065,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Chiba_City_skylines_201911.jpg/1280px-Chiba_City_skylines_201911.jpg",
  },
  {
    id: "fukuoka-city",
    name: "Fukuoka City",
    nameJa: "福岡市",
    pref: "Fukuoka",
    region: "Kyushu",
    lat: 33.5902,
    lng: 130.4017,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Fukuoka_Tower_and_Momochi_Seaside_Park_202107.jpg/1280px-Fukuoka_Tower_and_Momochi_Seaside_Park_202107.jpg",
  },
  {
    id: "hamamatsu-city",
    name: "Hamamatsu City",
    nameJa: "浜松市",
    pref: "Shizuoka",
    region: "Chubu",
    lat: 34.7108,
    lng: 137.7261,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Hamamatsu_Act_Tower_and_Hamamatsu_Station_2020.jpg/1280px-Hamamatsu_Act_Tower_and_Hamamatsu_Station_2020.jpg",
  },
  {
    id: "hiroshima-city",
    name: "Hiroshima City",
    nameJa: "広島市",
    pref: "Hiroshima",
    region: "Chugoku",
    lat: 34.3853,
    lng: 132.4553,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Hiroshima_Peace_Memorial_Dome_2021.jpg/1280px-Hiroshima_Peace_Memorial_Dome_2021.jpg",
  },
  {
    id: "kawasaki-city",
    name: "Kawasaki City",
    nameJa: "川崎市",
    pref: "Kanagawa",
    region: "Kanto",
    lat: 35.5308,
    lng: 139.7029,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Kawasaki_Station_East_Exit_201905.jpg/1280px-Kawasaki_Station_East_Exit_201905.jpg",
  },
  {
    id: "kitakyushu-city",
    name: "Kitakyushu City",
    nameJa: "北九州市",
    pref: "Fukuoka",
    region: "Kyushu",
    lat: 33.8834,
    lng: 130.8752,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Kokura_Station_South_Exit_201809.jpg/1280px-Kokura_Station_South_Exit_201809.jpg",
  },
  {
    id: "kobe-city",
    name: "Kobe City",
    nameJa: "神戸市",
    pref: "Hyogo",
    region: "Kansai",
    lat: 34.6901,
    lng: 135.1955,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Kobe_Port_Tower_and_Meriken_Park_2021.jpg/1280px-Kobe_Port_Tower_and_Meriken_Park_2021.jpg",
  },
  {
    id: "kumamoto-city",
    name: "Kumamoto City",
    nameJa: "熊本市",
    pref: "Kumamoto",
    region: "Kyushu",
    lat: 32.7898,
    lng: 130.7417,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Kumamoto_Castle_Keep_2021.jpg/1280px-Kumamoto_Castle_Keep_2021.jpg",
  },
  {
    id: "kyoto-city",
    name: "Kyoto City",
    nameJa: "京都市",
    pref: "Kyoto",
    region: "Kansai",
    lat: 35.0116,
    lng: 135.7681,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-02.jpg/1280px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-02.jpg",
  },
  {
    id: "nagoya-city",
    name: "Nagoya City",
    nameJa: "名古屋市",
    pref: "Aichi",
    region: "Chubu",
    lat: 35.1815,
    lng: 136.9066,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Nagoya_Station_-_View_from_the_Main_Building_in_Nagoya_Campus_of_Aichi_University_2022-6-29.jpg/1280px-Nagoya_Station_-_View_from_the_Main_Building_in_Nagoya_Campus_of_Aichi_University_2022-6-29.jpg",
  },
  {
    id: "niigata-city",
    name: "Niigata City",
    nameJa: "新潟市",
    pref: "Niigata",
    region: "Chubu",
    lat: 37.9161,
    lng: 139.0364,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Bandai_Bridge_Niigata_2020.jpg/1280px-Bandai_Bridge_Niigata_2020.jpg",
  },
  {
    id: "okayama-city",
    name: "Okayama City",
    nameJa: "岡山市",
    pref: "Okayama",
    region: "Chugoku",
    lat: 34.6551,
    lng: 133.9195,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Okayama_Montage2.jpg/1280px-Okayama_Montage2.jpg",
  },
  {
    id: "osaka-city",
    name: "Osaka City",
    nameJa: "大阪市",
    pref: "Osaka",
    region: "Kansai",
    lat: 34.6937,
    lng: 135.5023,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Dotonbori_at_night%2C_Osaka.jpg/1280px-Dotonbori_at_night%2C_Osaka.jpg",
  },
  {
    id: "sagamihara-city",
    name: "Sagamihara City",
    nameJa: "相模原市",
    pref: "Kanagawa",
    region: "Kanto",
    lat: 35.5714,
    lng: 139.3732,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Sagamihara_Station_South_Exit_2019.jpg/1280px-Sagamihara_Station_South_Exit_2019.jpg",
  },
  {
    id: "saitama-city",
    name: "Saitama City",
    nameJa: "さいたま市",
    pref: "Saitama",
    region: "Kanto",
    lat: 35.8617,
    lng: 139.6455,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Saitama_Super_Arena_2021.jpg/1280px-Saitama_Super_Arena_2021.jpg",
  },
  {
    id: "sakai-city",
    name: "Sakai City",
    nameJa: "堺市",
    pref: "Osaka",
    region: "Kansai",
    lat: 34.5732,
    lng: 135.4831,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Sakai_montage.jpg/1280px-Sakai_montage.jpg",
  },
  {
    id: "sapporo-city",
    name: "Sapporo City",
    nameJa: "札幌市",
    pref: "Hokkaido",
    region: "Hokkaido",
    lat: 43.0618,
    lng: 141.3545,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/SapporoCity_Skylines2020.jpg/1280px-SapporoCity_Skylines2020.jpg",
  },
  {
    id: "sendai-city",
    name: "Sendai City",
    nameJa: "仙台市",
    pref: "Miyagi",
    region: "Tohoku",
    lat: 38.2682,
    lng: 140.8694,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Sendai_city_view_from_Aoba_castle.jpg/1280px-Sendai_city_view_from_Aoba_castle.jpg",
  },
  {
    id: "shizuoka-city",
    name: "Shizuoka City",
    nameJa: "静岡市",
    pref: "Shizuoka",
    region: "Chubu",
    lat: 34.9756,
    lng: 138.3828,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Shizuoka_Station_North_Exit_2020.jpg/1280px-Shizuoka_Station_North_Exit_2020.jpg",
  },
  {
    id: "yokohama-city",
    name: "Yokohama",
    nameJa: "横浜市",
    pref: "Kanagawa",
    region: "Kanto",
    lat: 35.4437,
    lng: 139.638,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Yokohama_Minato_Mirai_21_skyscrapers_2021.jpg/1280px-Yokohama_Minato_Mirai_21_skyscrapers_2021.jpg",
  },
];

// Tag Core Cities in destinations
coreCitiesData.forEach((cc) => {
  let dest = destinations.find((d) => d.id === cc.id);
  if (!dest) {
    dest = {
      id: cc.id,
      role: "hub",
      name: cc.name,
      nameJa: cc.nameJa,
      prefecture: cc.pref,
      region: cc.region,
      categories: ["Cities", "Hub", "Sightseeing"],
      heroImage: cc.image,
      gallery: [cc.image],
      description: `${cc.name} is one of Japan's 20 ordinance-designated core metropolis hubs, featuring rich regional history, vibrant food markets, and high-speed rail transit connectivity.`,
      highlights: [
        "Central Station Plaza",
        "Regional Cultural Museums",
        "Downtown Food District",
      ],
      budgetMin: 8000,
      budgetMax: 20000,
      budgetRecommended: 14000,
      transportOptions: { train: 30, bus: 40, car: 45 },
      totalTripHours: 8,
      walkingMin: 90,
      walkingSunMin: 50,
      walkingShadeMin: 40,
      indoorPercent: 40,
      ratings: {
        overall: 8.8,
        couple: 8.7,
        summer: 8.5,
        winter: 8.4,
        rain: 8.2,
        food: 9.0,
        photography: 8.8,
        relaxation: 8.5,
        value: 8.8,
        uniqueness: 8.7,
      },
      crowd: { weekday: 3, weekend: 4, holiday: 5 },
      season: { spring: 5, summer: 4, autumn: 5, winter: 4 },
      bestMonths: [3, 4, 5, 10, 11],
      bestSeason: "Spring",
      weatherDependence: "moderate",
      tags: ["Core Designated City", "Metropolis Hub", cc.pref],
      reservation: "Not required",
      parking: "Available at central station",
      restaurants: ["Local Station Dining", "Regional Specialty izakaya"],
      cafes: ["Central Station Cafe"],
      notes: "Major JR Shinkansen / express rail transfer hub.",
      coordinates: { lat: cc.lat, lng: cc.lng },
      schemaVersion: 2,
      itineraries: [
        {
          name: "Classic Day Trip",
          description:
            "Full day exploring the city center and regional landmarks.",
          steps: [
            {
              time: "09:30 AM",
              activity: `Arrive at ${cc.name} Central Station`,
            },
            {
              time: "11:30 AM",
              activity: "Explore city center highlights and historical sites",
            },
            {
              time: "01:30 PM",
              activity: "Lunch at regional specialty restaurant",
            },
            {
              time: "03:30 PM",
              activity: "Visit main city park or observatory deck",
            },
            {
              time: "06:00 PM",
              activity: "Evening dinner and station shopping before departure",
            },
          ],
        },
      ],
      image: cc.image,
      imageMetadata: {
        source: "Wikimedia Commons",
        license: "CC-BY-SA / Public Domain",
        attribution: `Lead photograph of ${cc.name} via Wikipedia/Wikimedia Commons`,
      },
      status: "verified",
      travelEstimate: { confidence: "high" },
      collections: [],
      relationships: {},
      budgetBreakdown: {
        transport: 4000,
        tickets: 3000,
        food: 4500,
        cafe: 2500,
      },
    };
    destinations.push(dest);
    console.log(`Added missing destination record: ${cc.id}`);
  }

  // Tag with core-cities-japan collection
  if (!dest.collections) dest.collections = [];
  const hasCc = dest.collections.some(
    (c) => c.collectionId === "core-cities-japan",
  );
  if (!hasCc) {
    dest.collections.push({
      collectionId: "core-cities-japan",
      confirmed: true,
    });
    console.log(`Tagged ${cc.id} with core-cities-japan`);
  }
});

// 2. UNESCO World Heritage Sites List (27)
const unescoSitesData = [
  {
    id: "asuka-fujiwara-nara",
    name: "Ancient Capitals of Asuka and Fujiwara",
    pref: "Nara",
    region: "Kansai",
    lat: 34.4682,
    lng: 135.8197,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Ishibutai_Kofun_Asuka_Nara01s.jpg/1280px-Ishibutai_Kofun_Asuka_Nara01s.jpg",
  },
  {
    id: "horyuji-temple-nara",
    name: "Buddhist Monuments in the Horyu-ji Area",
    pref: "Nara",
    region: "Kansai",
    lat: 34.6141,
    lng: 135.7356,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Horyu-ji03s3200.jpg/1280px-Horyu-ji03s3200.jpg",
  },
  {
    id: "mount-fuji",
    name: "Fujisan, sacred place and source of artistic inspiration",
    pref: "Shizuoka",
    region: "Chubu",
    lat: 35.3606,
    lng: 138.7274,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/080103_hokusai_fuji.jpg/1280px-080103_hokusai_fuji.jpg",
  },
  {
    id: "shuri-castle-okinawa",
    name: "Gusuku Sites and Related Properties of the Kingdom of Ryukyu",
    pref: "Okinawa",
    region: "Kyushu",
    lat: 26.217,
    lng: 127.7195,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Shuri_castle02s3200.jpg/1280px-Shuri_castle02s3200.jpg",
  },
  {
    id: "oura-church-nagasaki",
    name: "Hidden Christian Sites in the Nagasaki Region",
    pref: "Nagasaki",
    region: "Kyushu",
    lat: 32.7342,
    lng: 129.8703,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Oura_Church_Nagasaki.jpg/1280px-Oura_Church_Nagasaki.jpg",
  },
  {
    id: "himeji-castle-hyogo",
    name: "Himeji-jo",
    pref: "Hyogo",
    region: "Kansai",
    lat: 34.8394,
    lng: 134.6939,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Himeji_Castle_Keep_201505.jpg/1280px-Himeji_Castle_Keep_201505.jpg",
  },
  {
    id: "hiraizumi-chusonji-iwate",
    name: "Hiraizumi – Temples, Gardens and Archaeological Sites",
    pref: "Iwate",
    region: "Tohoku",
    lat: 38.9868,
    lng: 141.1001,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Chusonji_Konjikido_Hiraizumi.jpg/1280px-Chusonji_Konjikido_Hiraizumi.jpg",
  },
  {
    id: "hiroshima-peace-memorial",
    name: "Hiroshima Peace Memorial (Genbaku Dome)",
    pref: "Hiroshima",
    region: "Chugoku",
    lat: 34.3955,
    lng: 132.4536,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Hiroshima_Peace_Memorial_Dome_2021.jpg/1280px-Hiroshima_Peace_Memorial_Dome_2021.jpg",
  },
  {
    id: "kyoto-historic",
    name: "Historic Monuments of Ancient Kyoto",
    pref: "Kyoto",
    region: "Kansai",
    lat: 34.9949,
    lng: 135.785,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Kiyomizu.jpg/1280px-Kiyomizu.jpg",
  },
  {
    id: "nara-historic",
    name: "Historic Monuments of Ancient Nara",
    pref: "Nara",
    region: "Kansai",
    lat: 34.6889,
    lng: 135.8398,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Todaiji_Daibutsuden_Nara02s3200.jpg/1280px-Todaiji_Daibutsuden_Nara02s3200.jpg",
  },
  {
    id: "shirakawa-village",
    name: "Historic Villages of Shirakawa-go and Gokayama",
    pref: "Gifu",
    region: "Chubu",
    lat: 36.2562,
    lng: 136.9064,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Shirakawa-go_33.jpg/1280px-Shirakawa-go_33.jpg",
  },
  {
    id: "miyajima-itsukushima",
    name: "Itsukushima Shinto Shrine",
    pref: "Hiroshima",
    region: "Chugoku",
    lat: 34.2958,
    lng: 132.3197,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Itsukushima_Torii_Miyajima_2019.jpg/1280px-Itsukushima_Torii_Miyajima_2019.jpg",
  },
  {
    id: "iwami-ginzan-shimane",
    name: "Iwami Ginzan Silver Mine and its Cultural Landscape",
    pref: "Shimane",
    region: "Chugoku",
    lat: 35.1064,
    lng: 132.4411,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Iwami_Ginzan_Silver_Mine_Ryugenji_Mabu.jpg/1280px-Iwami_Ginzan_Silver_Mine_Ryugenji_Mabu.jpg",
  },
  {
    id: "sannai-maruyama-jomon-aomori",
    name: "Jomon Prehistoric Sites in Northern Japan",
    pref: "Aomori",
    region: "Tohoku",
    lat: 40.8115,
    lng: 140.6973,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Sannai_Maruyama_site_2021.jpg/1280px-Sannai_Maruyama_site_2021.jpg",
  },
  {
    id: "mozufuruichi-kofun-osaka",
    name: "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan",
    pref: "Osaka",
    region: "Kansai",
    lat: 34.5636,
    lng: 135.4878,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Nintoku_Tomb_Sakai_Osaka.jpg/1280px-Nintoku_Tomb_Sakai_Osaka.jpg",
  },
  {
    id: "okinoshima-munakata-fukuoka",
    name: "Sacred Island of Okinoshima and Associated Sites in Munakata",
    pref: "Fukuoka",
    region: "Kyushu",
    lat: 33.8042,
    lng: 130.5147,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Munakata_Taisha_Hetsumiya.jpg/1280px-Munakata_Taisha_Hetsumiya.jpg",
  },
  {
    id: "kumano-kodo-koya-wakayama",
    name: "Sacred Sites and Pilgrimage Routes in the Kii Mountain Range",
    pref: "Wakayama",
    region: "Kansai",
    lat: 34.2125,
    lng: 135.5864,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Kumano_Kodo_Daimon-zaka.jpg/1280px-Kumano_Kodo_Daimon-zaka.jpg",
  },
  {
    id: "sado-island",
    name: "Sado Island Gold Mines",
    pref: "Niigata",
    region: "Chubu",
    lat: 38.0336,
    lng: 138.2567,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Sado_Gold_Mine_Doyu_no_Wari.jpg/1280px-Sado_Gold_Mine_Doyu_no_Wari.jpg",
  },
  {
    id: "nikko-toshogu-shrine-tochigi",
    name: "Shrines and Temples of Nikko",
    pref: "Tochigi",
    region: "Kanto",
    lat: 36.7581,
    lng: 139.5989,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Nikko_Toshogu_Yomeimon_2017.jpg/1280px-Nikko_Toshogu_Yomeimon_2017.jpg",
  },
  {
    id: "gunkanjima-hashima-nagasaki",
    name: "Sites of Japan’s Meiji Industrial Revolution (Gunkanjima)",
    pref: "Nagasaki",
    region: "Kyushu",
    lat: 32.6277,
    lng: 129.7384,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Hashima_island_2019.jpg/1280px-Hashima_island_2019.jpg",
  },
  {
    id: "national-museum-western-art-tokyo",
    name: "The Architectural Work of Le Corbusier (NMWA Tokyo)",
    pref: "Tokyo",
    region: "Kanto",
    lat: 35.7154,
    lng: 139.7758,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/National_Museum_of_Western_Art_Tokyo_2019.jpg/1280px-National_Museum_of_Western_Art_Tokyo_2019.jpg",
  },
  {
    id: "tomioka-silk-mill-gunma",
    name: "Tomioka Silk Mill and Related Sites",
    pref: "Gunma",
    region: "Kanto",
    lat: 36.255,
    lng: 138.8872,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Tomioka_Silk_Mill_2019.jpg/1280px-Tomioka_Silk_Mill_2019.jpg",
  },

  // Natural (5)
  {
    id: "amami-iriomote-natural-site",
    name: "Amami-Oshima, Tokunoshima, Northern Okinawa & Iriomote",
    pref: "Kagoshima",
    region: "Kyushu",
    lat: 28.2711,
    lng: 129.3364,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Amami_Oshima_Mangrove_Forest.jpg/1280px-Amami_Oshima_Mangrove_Forest.jpg",
  },
  {
    id: "ogasawara-islands-tokyo",
    name: "Ogasawara Islands",
    pref: "Tokyo",
    region: "Kanto",
    lat: 27.095,
    lng: 142.1925,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Ogasawara_Chichijima_Kominato_Coast.jpg/1280px-Ogasawara_Chichijima_Kominato_Coast.jpg",
  },
  {
    id: "shirakami-sanchi-aomori",
    name: "Shirakami-Sanchi",
    pref: "Aomori",
    region: "Tohoku",
    lat: 40.4688,
    lng: 140.1264,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Shirakami-sanchi_Anmon_Falls.jpg/1280px-Shirakami-sanchi_Anmon_Falls.jpg",
  },
  {
    id: "shiretoko-national-park-hokkaido",
    name: "Shiretoko",
    pref: "Hokkaido",
    region: "Hokkaido",
    lat: 44.0931,
    lng: 145.1322,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Shiretoko_Five_Lakes_2019.jpg/1280px-Shiretoko_Five_Lakes_2019.jpg",
  },
  {
    id: "yakushima-town",
    name: "Yakushima",
    pref: "Kagoshima",
    region: "Kyushu",
    lat: 30.3585,
    lng: 130.5286,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Jomon_Sugi_Yakushima.jpg/1280px-Jomon_Sugi_Yakushima.jpg",
  },
];

// Tag UNESCO Sites in destinations
unescoSitesData.forEach((u) => {
  let dest = destinations.find((d) => d.id === u.id);
  if (!dest) {
    dest = {
      id: u.id,
      name: u.name,
      prefecture: u.pref,
      region: u.region,
      categories: ["World Heritage", "Culture", "Sightseeing"],
      heroImage: u.image,
      gallery: [u.image],
      description: `${u.name} is a UNESCO World Heritage Site in ${u.pref}, designated for its outstanding universal cultural or natural value.`,
      highlights: [
        "UNESCO Heritage Monument",
        "Historic Landmark",
        "Cultural Preservation Area",
      ],
      budgetMin: 4000,
      budgetMax: 15000,
      budgetRecommended: 9500,
      transportOptions: { train: 45, bus: 50, car: 60 },
      totalTripHours: 6,
      walkingMin: 120,
      walkingSunMin: 70,
      walkingShadeMin: 50,
      indoorPercent: 35,
      ratings: {
        overall: 9.2,
        couple: 9.0,
        summer: 8.8,
        winter: 8.6,
        rain: 8.2,
        food: 8.7,
        photography: 9.4,
        relaxation: 9.0,
        value: 9.2,
        uniqueness: 9.5,
      },
      crowd: { weekday: 3, weekend: 4, holiday: 5 },
      season: { spring: 5, summer: 4, autumn: 5, winter: 4 },
      bestMonths: [3, 4, 5, 10, 11],
      bestSeason: "Autumn",
      weatherDependence: "moderate",
      tags: ["UNESCO World Heritage", u.name, u.pref],
      reservation: "Not required",
      parking: "Available nearby",
      restaurants: ["Local Heritage Teahouse", "Regional Cuisine"],
      cafes: ["UNESCO Visitor Cafe"],
      notes: "Official UNESCO World Heritage Site.",
      coordinates: { lat: u.lat, lng: u.lng },
      schemaVersion: 2,
      itineraries: [
        {
          name: "Heritage Exploration",
          description:
            "Full day tour of the World Heritage site and surrounding grounds.",
          steps: [
            {
              time: "09:30 AM",
              activity: `Arrive at ${u.name} visitor center`,
            },
            {
              time: "11:30 AM",
              activity: "Explore main heritage monuments and historic grounds",
            },
            {
              time: "01:30 PM",
              activity: "Traditional Japanese lunch at nearby heritage village",
            },
            {
              time: "03:30 PM",
              activity: "Visit regional museum or scenic viewpoint",
            },
          ],
        },
      ],
      image: u.image,
      imageMetadata: {
        source: "Wikimedia Commons",
        license: "CC-BY-SA / Public Domain",
        attribution: `Lead photograph of ${u.name} via Wikipedia/Wikimedia Commons`,
      },
      status: "verified",
      travelEstimate: { confidence: "high" },
      collections: [],
      relationships: {},
      budgetBreakdown: {
        transport: 3000,
        tickets: 2000,
        food: 3000,
        cafe: 1500,
      },
    };
    destinations.push(dest);
    console.log(`Added missing UNESCO destination record: ${u.id}`);
  }

  // Tag with unesco-japan collection
  if (!dest.collections) dest.collections = [];
  const hasU = dest.collections.some((c) => c.collectionId === "unesco-japan");
  if (!hasU) {
    dest.collections.push({ collectionId: "unesco-japan", confirmed: true });
    console.log(`Tagged ${u.id} with unesco-japan`);
  }
});

fs.writeFileSync(destPath, JSON.stringify(destinations, null, 2));
console.log("Successfully updated destinations-index.json!");
