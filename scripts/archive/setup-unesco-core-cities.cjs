const fs = require("fs");
const path = require("path");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const collPath = path.join(
  __dirname,
  "../src/shared/data/collections-index.json",
);

const destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));
const collections = JSON.parse(fs.readFileSync(collPath, "utf8"));

// 1. Add "core-cities-japan" collection definition if missing
let coreCitiesColl = collections.find((c) => c.id === "core-cities-japan");
if (!coreCitiesColl) {
  coreCitiesColl = {
    id: "core-cities-japan",
    slug: "core-cities-japan",
    name: "Core Designated Cities of Japan",
    description:
      "Japan's 20 major government ordinance-designated metropolis hubs with statutory city-level autonomy.",
    category: "Cities & Metropolis",
    type: "official",
    isAchievement: true,
    icon: "Building",
    badgeColor: "sky",
    sortOrder: 16,
    officialSource:
      "Ministry of Internal Affairs and Communications (政令指定都市)",
    sourceUrl: "https://www.soumu.go.jp/",
    metadata: {
      authority: "government",
      status: "active",
      lastVerified: "2026-07",
      verificationSource: "Ministry of Internal Affairs and Communications",
      reviewIntervalMonths: 12,
      expectedMembers: 20,
    },
  };
  collections.push(coreCitiesColl);
  fs.writeFileSync(collPath, JSON.stringify(collections, null, 2));
  console.log("Added core-cities-japan collection definition.");
}

// Update unesco-japan expected members to 27
const unescoColl = collections.find((c) => c.id === "unesco-japan");
if (unescoColl) {
  unescoColl.metadata.expectedMembers = 27;
  fs.writeFileSync(collPath, JSON.stringify(collections, null, 2));
  console.log("Updated unesco-japan expectedMembers to 27.");
}

// 2. Core Cities List
const coreCitiesMap = [
  {
    id: "chiba-city",
    name: "Chiba City",
    pref: "Chiba",
    region: "Kanto",
    lat: 35.6074,
    lng: 140.1065,
  },
  {
    id: "fukuoka-city",
    name: "Fukuoka City",
    pref: "Fukuoka",
    region: "Kyushu",
    lat: 33.5902,
    lng: 130.4017,
  },
  {
    id: "hamamatsu-city",
    name: "Hamamatsu City",
    pref: "Shizuoka",
    region: "Chubu",
    lat: 34.7108,
    lng: 137.7261,
  },
  {
    id: "hiroshima-city",
    name: "Hiroshima City",
    pref: "Hiroshima",
    region: "Chugoku",
    lat: 34.3853,
    lng: 132.4553,
  },
  {
    id: "kawasaki-city",
    name: "Kawasaki City",
    pref: "Kanagawa",
    region: "Kanto",
    lat: 35.5308,
    lng: 139.7029,
  },
  {
    id: "kitakyushu-city",
    name: "Kitakyushu City",
    pref: "Fukuoka",
    region: "Kyushu",
    lat: 33.8834,
    lng: 130.8752,
  },
  {
    id: "kobe-city",
    name: "Kobe City",
    pref: "Hyogo",
    region: "Kansai",
    lat: 34.6901,
    lng: 135.1955,
  },
  {
    id: "kumamoto-city",
    name: "Kumamoto City",
    pref: "Kumamoto",
    region: "Kyushu",
    lat: 32.7898,
    lng: 130.7417,
  },
  {
    id: "kyoto-city",
    name: "Kyoto City",
    pref: "Kyoto",
    region: "Kansai",
    lat: 35.0116,
    lng: 135.7681,
  },
  {
    id: "nagoya-city",
    name: "Nagoya City",
    pref: "Aichi",
    region: "Chubu",
    lat: 35.1815,
    lng: 136.9066,
  },
  {
    id: "niigata-city",
    name: "Niigata City",
    pref: "Niigata",
    region: "Chubu",
    lat: 37.9161,
    lng: 139.0364,
  },
  {
    id: "okayama-city",
    name: "Okayama City",
    pref: "Okayama",
    region: "Chugoku",
    lat: 34.6551,
    lng: 133.9195,
  },
  {
    id: "osaka-city",
    name: "Osaka City",
    pref: "Osaka",
    region: "Kansai",
    lat: 34.6937,
    lng: 135.5023,
  },
  {
    id: "sagamihara-city",
    name: "Sagamihara City",
    pref: "Kanagawa",
    region: "Kanto",
    lat: 35.5714,
    lng: 139.3732,
  },
  {
    id: "saitama-city",
    name: "Saitama City",
    pref: "Saitama",
    region: "Kanto",
    lat: 35.8617,
    lng: 139.6455,
  },
  {
    id: "sakai-city",
    name: "Sakai City",
    pref: "Osaka",
    region: "Kansai",
    lat: 34.5732,
    lng: 135.4831,
  },
  {
    id: "sapporo-city",
    name: "Sapporo City",
    pref: "Hokkaido",
    region: "Hokkaido",
    lat: 43.0618,
    lng: 141.3545,
  },
  {
    id: "sendai-city",
    name: "Sendai City",
    pref: "Miyagi",
    region: "Tohoku",
    lat: 38.2682,
    lng: 140.8694,
  },
  {
    id: "shizuoka-city",
    name: "Shizuoka City",
    pref: "Shizuoka",
    region: "Chubu",
    lat: 34.9756,
    lng: 138.3828,
  },
  {
    id: "yokohama-city",
    name: "Yokohama",
    pref: "Kanagawa",
    region: "Kanto",
    lat: 35.4437,
    lng: 139.638,
  },
];

console.log("Checking Core Cities...");
coreCitiesMap.forEach((cc) => {
  let dest = destinations.find((d) => d.id === cc.id);
  if (!dest) {
    console.log(`Creating missing core city: ${cc.id}`);
  }
});
