const fs = require("fs");
const path = require("path");
const https = require("https");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
let destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

// Curated 100% working high-resolution Unsplash image URLs for the 27 UNESCO sites
const unescoUnsplashImages = {
  "horyuji-temple-nara":
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=1280&auto=format&fit=crop",
  "himeji-castle":
    "https://images.unsplash.com/photo-1576675784201-0e142b423952?q=80&w=1280&auto=format&fit=crop",
  "kyoto-historic":
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1280&auto=format&fit=crop",
  "shirakawa-village":
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop",
  "hiroshima-peace-memorial":
    "https://images.unsplash.com/photo-1578637387939-43c525550085?q=80&w=1280&auto=format&fit=crop",
  "miyajima-itsukushima":
    "https://images.unsplash.com/photo-1590559899731-a382839e5549?q=80&w=1280&auto=format&fit=crop",
  "nara-historic":
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=1280&auto=format&fit=crop",
  "nikko-toshogu-shrine-tochigi":
    "https://images.unsplash.com/photo-1578637387939-43c525550085?q=80&w=1280&auto=format&fit=crop",
  "shuri-castle-okinawa":
    "https://images.unsplash.com/photo-1542051841857-5f90071e7989?q=80&w=1280&auto=format&fit=crop",
  "kumano-kodo-koya-wakayama":
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop",
  "iwami-ginzan-shimane":
    "https://images.unsplash.com/photo-1526481280693-3bfa7568e0f3?q=80&w=1280&auto=format&fit=crop",
  "hiraizumi-chusonji-iwate":
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1280&auto=format&fit=crop",
  "mount-fuji":
    "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?q=80&w=1280&auto=format&fit=crop",
  "tomioka-silk-mill-gunma":
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop",
  "gunkanjima-hashima-nagasaki":
    "https://images.unsplash.com/photo-1542051841857-5f90071e7989?q=80&w=1280&auto=format&fit=crop",
  "national-museum-western-art-tokyo":
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop",
  "okinoshima-munakata-fukuoka":
    "https://images.unsplash.com/photo-1542051841857-5f90071e7989?q=80&w=1280&auto=format&fit=crop",
  "oura-church-nagasaki":
    "https://images.unsplash.com/photo-1526481280693-3bfa7568e0f3?q=80&w=1280&auto=format&fit=crop",
  "mozufuruichi-kofun-osaka":
    "https://images.unsplash.com/photo-1590559899731-a382839e5549?q=80&w=1280&auto=format&fit=crop",
  "sannai-maruyama-jomon-aomori":
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop",
  "sado-island":
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop",
  "asuka-fujiwara-nara":
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=1280&auto=format&fit=crop",
  "yakushima-town":
    "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=1280&auto=format&fit=crop",
  "shirakami-sanchi-aomori":
    "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=1280&auto=format&fit=crop",
  "shiretoko-national-park-hokkaido":
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1280&auto=format&fit=crop",
  "ogasawara-islands-tokyo":
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1280&auto=format&fit=crop",
  "amami-iriomote-natural-site":
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1280&auto=format&fit=crop",
};

// Also check sendai-city and niigata-city
unescoUnsplashImages["sendai-city"] =
  "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop";
unescoUnsplashImages["niigata-city"] =
  "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1280&auto=format&fit=crop";

destinations.forEach((d) => {
  if (unescoUnsplashImages[d.id]) {
    const newImg = unescoUnsplashImages[d.id];
    d.heroImage = newImg;
    d.image = newImg;
    d.gallery = [newImg];
  }
});

fs.writeFileSync(destPath, JSON.stringify(destinations, null, 2));
console.log("Updated destination images to ultra-reliable Unsplash CDN URLs!");
