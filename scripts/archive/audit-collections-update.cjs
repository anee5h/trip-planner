const fs = require("fs");
const path = require("path");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

const unescoSites = [
  // Cultural (22)
  {
    name: "Ancient Capitals of Asuka and Fujiwara (2026)",
    search: ["asuka", "nara"],
    pref: "Nara",
  },
  {
    name: "Buddhist Monuments in the Horyu-ji Area (1993)",
    search: ["horyu", "horyu-ji"],
    pref: "Nara",
  },
  {
    name: "Fujisan, sacred place and source of artistic inspiration (2013)",
    search: ["fuji", "mt-fuji"],
    pref: "Shizuoka",
  },
  {
    name: "Gusuku Sites and Related Properties of the Kingdom of Ryukyu (2000)",
    search: ["gusuku", "shuri", "okinawa"],
    pref: "Okinawa",
  },
  {
    name: "Hidden Christian Sites in the Nagasaki Region (2018)",
    search: ["christian", "nagasaki"],
    pref: "Nagasaki",
  },
  { name: "Himeji-jo (1993)", search: ["himeji"], pref: "Hyogo" },
  {
    name: "Hiraizumi – Temples, Gardens and Archaeological Sites (2011)",
    search: ["hiraizumi"],
    pref: "Iwate",
  },
  {
    name: "Hiroshima Peace Memorial (Genbaku Dome) (1996)",
    search: ["hiroshima-peace", "atomic", "genbaku"],
    pref: "Hiroshima",
  },
  {
    name: "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities) (1994)",
    search: ["kyoto"],
    pref: "Kyoto",
  },
  {
    name: "Historic Monuments of Ancient Nara (1998)",
    search: ["nara-historic"],
    pref: "Nara",
  },
  {
    name: "Historic Villages of Shirakawa-go and Gokayama (1995)",
    search: ["shirakawa"],
    pref: "Gifu",
  },
  {
    name: "Itsukushima Shinto Shrine (1996)",
    search: ["itsukushima", "miyajima"],
    pref: "Hiroshima",
  },
  {
    name: "Iwami Ginzan Silver Mine and its Cultural Landscape (2007)",
    search: ["iwami", "ginzan"],
    pref: "Shimane",
  },
  {
    name: "Jomon Prehistoric Sites in Northern Japan (2021)",
    search: ["jomon"],
    pref: "Aomori",
  },
  {
    name: "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan (2019)",
    search: ["mozu", "kofun"],
    pref: "Osaka",
  },
  {
    name: "Sacred Island of Okinoshima and Associated Sites in the Munakata Region (2017)",
    search: ["okinoshima", "munakata"],
    pref: "Fukuoka",
  },
  {
    name: "Sacred Sites and Pilgrimage Routes in the Kii Mountain Range (2004)",
    search: ["kii", "koya", "kumano"],
    pref: "Wakayama",
  },
  { name: "Sado Island Gold Mines (2024)", search: ["sado"], pref: "Niigata" },
  {
    name: "Shrines and Temples of Nikko (1999)",
    search: ["nikko"],
    pref: "Tochigi",
  },
  {
    name: "Sites of Japan’s Meiji Industrial Revolution (2015)",
    search: ["meiji", "hashima", "gunkanjima"],
    pref: "Nagasaki",
  },
  {
    name: "The Architectural Work of Le Corbusier (2016)",
    search: ["corbusier", "nmwa", "ueno"],
    pref: "Tokyo",
  },
  {
    name: "Tomioka Silk Mill and Related Sites (2014)",
    search: ["tomioka"],
    pref: "Gunma",
  },

  // Natural (5)
  {
    name: "Amami-Oshima Island, Tokunoshima Island, Northern Okinawa, Iriomote (2021)",
    search: ["amami", "iriomote", "tokunoshima"],
    pref: "Kagoshima",
  },
  {
    name: "Ogasawara Islands (2011)",
    search: ["ogasawara", "bonin"],
    pref: "Tokyo",
  },
  { name: "Shirakami-Sanchi (1993)", search: ["shirakami"], pref: "Aomori" },
  { name: "Shiretoko (2005)", search: ["shiretoko"], pref: "Hokkaido" },
  { name: "Yakushima (1993)", search: ["yakushima"], pref: "Kagoshima" },
];

console.log("=== UNESCO SITES MATCH AUDIT ===");
unescoSites.forEach((site) => {
  const matches = destinations.filter((d) => {
    return site.search.some(
      (s) =>
        d.id.includes(s) ||
        d.name.toLowerCase().includes(s) ||
        (d.tags && d.tags.some((t) => t.toLowerCase().includes(s))),
    );
  });
  console.log(
    `[${site.name}] -> Matches: ${matches.map((m) => m.id).join(", ") || "NONE FOUND"}`,
  );
});

const coreCities = [
  "chiba-city",
  "fukuoka-city",
  "hamamatsu-city",
  "hiroshima-city",
  "kawasaki-city",
  "kitakyushu-city",
  "kobe-city",
  "kumamoto-city",
  "kyoto-city",
  "nagoya-city",
  "niigata-city",
  "okayama-city",
  "osaka-city",
  "sagamihara-city",
  "saitama-city",
  "sakai-city",
  "sapporo-city",
  "sendai-city",
  "shizuoka-city",
  "yokohama-city",
];

console.log("\n=== CORE CITIES MATCH AUDIT ===");
coreCities.forEach((cId) => {
  const match = destinations.find((d) => d.id === cId || d.id.startsWith(cId));
  console.log(
    `[${cId}] -> ${match ? match.id + " (" + match.name + ")" : "MISSING"}`,
  );
});
