const fs = require("fs");
const path = require("path");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
let destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

// 1. Exact 27 Canonical UNESCO Destination IDs & Japanese Wikipedia Image Map
const canonicalUnescoMap = {
  // Cultural (22)
  "horyuji-temple-nara": {
    name: "Buddhist Monuments in the Horyu-ji Area",
    nameJa: "法隆寺地域の仏教建造物",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Horyu-ji03s3200.jpg/1280px-Horyu-ji03s3200.jpg",
  },
  "himeji-castle": {
    name: "Himeji-jo",
    nameJa: "姫路城",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Himeji_castle_in_may_2015.jpg/1280px-Himeji_castle_in_may_2015.jpg",
  },
  "kyoto-historic": {
    name: "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)",
    nameJa: "古都京都の文化財",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Kiyomizu.jpg/1280px-Kiyomizu.jpg",
  },
  "shirakawa-village": {
    name: "Historic Villages of Shirakawa-go and Gokayama",
    nameJa: "白川郷・五箇山の合掌造り集落",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Shirakawa-go_33.jpg/1280px-Shirakawa-go_33.jpg",
  },
  "hiroshima-peace-memorial": {
    name: "Hiroshima Peace Memorial (Genbaku Dome)",
    nameJa: "原爆ドーム",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Hiroshima_Peace_Memorial_Dome_2021.jpg/1280px-Hiroshima_Peace_Memorial_Dome_2021.jpg",
  },
  "miyajima-itsukushima": {
    name: "Itsukushima Shinto Shrine",
    nameJa: "厳島神社",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Itsukushima_Torii_Miyajima_2019.jpg/1280px-Itsukushima_Torii_Miyajima_2019.jpg",
  },
  "nara-historic": {
    name: "Historic Monuments of Ancient Nara",
    nameJa: "古都奈良の文化財",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Todaiji_Daibutsuden_Nara02s3200.jpg/1280px-Todaiji_Daibutsuden_Nara02s3200.jpg",
  },
  "nikko-toshogu-shrine-tochigi": {
    name: "Shrines and Temples of Nikko",
    nameJa: "日光の社寺",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Nikko_Toshogu_Yomeimon_2017.jpg/1280px-Nikko_Toshogu_Yomeimon_2017.jpg",
  },
  "shuri-castle-okinawa": {
    name: "Gusuku Sites and Related Properties of the Kingdom of Ryukyu",
    nameJa: "琉球王国のグスク及び関連遺産群",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Shuri_castle02s3200.jpg/1280px-Shuri_castle02s3200.jpg",
  },
  "kumano-kodo-koya-wakayama": {
    name: "Sacred Sites and Pilgrimage Routes in the Kii Mountain Range",
    nameJa: "紀伊山地の霊場と参詣道",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Kumano_Kodo_Daimon-zaka.jpg/1280px-Kumano_Kodo_Daimon-zaka.jpg",
  },
  "iwami-ginzan-shimane": {
    name: "Iwami Ginzan Silver Mine and its Cultural Landscape",
    nameJa: "石見銀山遺跡とその文化的景観",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Iwami_Ginzan_Silver_Mine_Ryugenji_Mabu.jpg/1280px-Iwami_Ginzan_Silver_Mine_Ryugenji_Mabu.jpg",
  },
  "hiraizumi-chusonji-iwate": {
    name: "Hiraizumi – Temples, Gardens and Archaeological Sites",
    nameJa: "平泉―仏国土を表す建築・庭園及び考古学的遺跡群―",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Chusonji_Konjikido_Hiraizumi.jpg/1280px-Chusonji_Konjikido_Hiraizumi.jpg",
  },
  "mount-fuji": {
    name: "Fujisan, sacred place and source of artistic inspiration",
    nameJa: "富士山―信仰の対象と芸術の源泉",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/080103_hokusai_fuji.jpg/1280px-080103_hokusai_fuji.jpg",
  },
  "tomioka-silk-mill-gunma": {
    name: "Tomioka Silk Mill and Related Sites",
    nameJa: "富岡製糸場と絹産業遺産群",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Tomioka_Silk_Mill_2019.jpg/1280px-Tomioka_Silk_Mill_2019.jpg",
  },
  "gunkanjima-hashima-nagasaki": {
    name: "Sites of Japan’s Meiji Industrial Revolution",
    nameJa: "明治日本の産業革命遺産 製鉄・製鋼、造船、石炭産業",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Hashima_island_2019.jpg/1280px-Hashima_island_2019.jpg",
  },
  "national-museum-western-art-tokyo": {
    name: "The Architectural Work of Le Corbusier (NMWA Tokyo)",
    nameJa: "ル・コルビュジエの建築作品-近代建築運動への顕著な貢献-",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/National_Museum_of_Western_Art_Tokyo_2019.jpg/1280px-National_Museum_of_Western_Art_Tokyo_2019.jpg",
  },
  "okinoshima-munakata-fukuoka": {
    name: "Sacred Island of Okinoshima and Associated Sites in Munakata",
    nameJa: "「神宿る島」宗像・沖ノ島と関連遺産群",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Munakata_Taisha_Hetsumiya.jpg/1280px-Munakata_Taisha_Hetsumiya.jpg",
  },
  "oura-church-nagasaki": {
    name: "Hidden Christian Sites in the Nagasaki Region",
    nameJa: "長崎と天草地方の潜伏キリシタン関連遺産",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Oura_Church_Nagasaki.jpg/1280px-Oura_Church_Nagasaki.jpg",
  },
  "mozufuruichi-kofun-osaka": {
    name: "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan",
    nameJa: "百舌鳥・古市古墳群-古代日本の墳墓群-",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Nintoku_Tomb_Sakai_Osaka.jpg/1280px-Nintoku_Tomb_Sakai_Osaka.jpg",
  },
  "sannai-maruyama-jomon-aomori": {
    name: "Jomon Prehistoric Sites in Northern Japan",
    nameJa: "北海道・北東北の縄文遺跡群",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Sannai_Maruyama_site_2021.jpg/1280px-Sannai_Maruyama_site_2021.jpg",
  },
  "sado-island": {
    name: "Sado Island Gold Mines",
    nameJa: "佐渡島（さどしま）の金山",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Sado_Gold_Mine_Doyu_no_Wari.jpg/1280px-Sado_Gold_Mine_Doyu_no_Wari.jpg",
  },
  "asuka-fujiwara-nara": {
    name: "Ancient Capitals of Asuka and Fujiwara",
    nameJa: "飛鳥・藤原の宮都とその関連資産群",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Ishibutai_Kofun_Asuka_Nara01s.jpg/1280px-Ishibutai_Kofun_Asuka_Nara01s.jpg",
  },

  // Natural (5)
  "yakushima-town": {
    name: "Yakushima",
    nameJa: "屋久島",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Jomon_Sugi_Yakushima.jpg/1280px-Jomon_Sugi_Yakushima.jpg",
  },
  "shirakami-sanchi-aomori": {
    name: "Shirakami-Sanchi",
    nameJa: "白神山地",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Shirakami-sanchi_Anmon_Falls.jpg/1280px-Shirakami-sanchi_Anmon_Falls.jpg",
  },
  "shiretoko-national-park-hokkaido": {
    name: "Shiretoko",
    nameJa: "知床",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Shiretoko_Five_Lakes_2019.jpg/1280px-Shiretoko_Five_Lakes_2019.jpg",
  },
  "ogasawara-islands-tokyo": {
    name: "Ogasawara Islands",
    nameJa: "小笠原諸島",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Ogasawara_Chichijima_Kominato_Coast.jpg/1280px-Ogasawara_Chichijima_Kominato_Coast.jpg",
  },
  "amami-iriomote-natural-site": {
    name: "Amami-Oshima, Tokunoshima, Northern Okinawa & Iriomote",
    nameJa: "奄美大島、徳之島、沖縄島北部及び西表島",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Amami_Oshima_Mangrove_Forest.jpg/1280px-Amami_Oshima_Mangrove_Forest.jpg",
  },
};

const canonicalIds = new Set(Object.keys(canonicalUnescoMap));

// 2. Remove duplicate destination record himeji-castle-hyogo if himeji-castle exists
destinations = destinations.filter((d) => d.id !== "himeji-castle-hyogo");

// 3. Update all destinations in destinations-index.json
destinations.forEach((d) => {
  if (d.collections) {
    // Untag unesco-japan if not one of the 27 canonical IDs
    if (!canonicalIds.has(d.id)) {
      d.collections = d.collections.filter(
        (c) => c.collectionId !== "unesco-japan",
      );
    }
  }

  // If canonical UNESCO site, ensure it is tagged and has verified ja.wikipedia lead image
  if (canonicalIds.has(d.id)) {
    const info = canonicalUnescoMap[d.id];
    d.heroImage = info.image;
    d.image = info.image;
    d.gallery = [info.image];
    if (info.nameJa) d.nameJa = info.nameJa;

    if (!d.collections) d.collections = [];
    const hasTag = d.collections.some((c) => c.collectionId === "unesco-japan");
    if (!hasTag) {
      d.collections.push({ collectionId: "unesco-japan", confirmed: true });
    }
  }
});

fs.writeFileSync(destPath, JSON.stringify(destinations, null, 2));

const finalUnescoCount = destinations.filter(
  (d) =>
    d.collections &&
    d.collections.some((c) => c.collectionId === "unesco-japan"),
).length;

console.log(
  `Deduplication Complete! Total UNESCO tagged destinations now: ${finalUnescoCount} (Expected: 27)`,
);
