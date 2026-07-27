const fs = require("fs");
const path = require("path");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
let destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

// Map of destination ID -> corrected image URL (reassembled from user's line-broken URLs, upscaled to 960px)
const updates = {
  "gunkanjima-hashima-nagasaki":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Hashima_Nagasaki_Japan.jpg/960px-Hashima_Nagasaki_Japan.jpg",
  "asuka-fujiwara-nara":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Takamat1.jpg/960px-Takamat1.jpg",
  "hiroshima-peace-memorial":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Genbaku_Dome04-r.JPG/960px-Genbaku_Dome04-r.JPG",
  "hiraizumi-chusonji-iwate":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/230728_Motsuji_Hiraizumi_Iwate_pref_Japan04s3.jpg/960px-230728_Motsuji_Hiraizumi_Iwate_pref_Japan04s3.jpg",
  "horyuji-temple-nara":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Horyu-ji10s3200.jpg/960px-Horyu-ji10s3200.jpg",
  "iwami-ginzan-shimane":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Shimizudani_Refinery_Ruins_at_Iwami_Ginzan_Silver_Mine_001.jpg/960px-Shimizudani_Refinery_Ruins_at_Iwami_Ginzan_Silver_Mine_001.jpg",
  "kumano-kodo-koya-wakayama":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Danjogaran_Koyasan12n3200.jpg/960px-Danjogaran_Koyasan12n3200.jpg",
  "miyajima-itsukushima":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Itsukushima_Shrine_Torii_Gate_%2813890465459%29.jpg/960px-Itsukushima_Shrine_Torii_Gate_%2813890465459%29.jpg",
  "mozufuruichi-kofun-osaka":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Kondagobyoyama_Kofun_air.jpg/960px-Kondagobyoyama_Kofun_air.jpg",
  "okinoshima-munakata-fukuoka":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/%E5%AE%97%E5%83%8F%E5%A4%A7%E7%A4%BE%E6%B2%96%E6%B4%A5%E5%AE%AE.JPG/960px-%E5%AE%97%E5%83%8F%E5%A4%A7%E7%A4%BE%E6%B2%96%E6%B4%A5%E5%AE%AE.JPG",
  "sado-island":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/%E4%BA%8C%E3%83%84%E4%BA%80.jpg/960px-%E4%BA%8C%E3%83%84%E4%BA%80.jpg",
  "oura-church-nagasaki":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Nh%C3%A0_th%E1%BB%9D_ch%C3%ADnh_t%C3%B2a_Oura.jpg/960px-Nh%C3%A0_th%E1%BB%9D_ch%C3%ADnh_t%C3%B2a_Oura.jpg",
  "shuri-castle-okinawa":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Naha_Shuri_Castle16s5s3200.jpg/960px-Naha_Shuri_Castle16s5s3200.jpg",
  "tomioka-silk-mill-gunma":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/%E5%AF%8C%E5%B2%A1%E8%A3%BD%E7%B3%B8%E5%A0%B4%E3%83%BB%E7%B9%B0%E7%B3%B8%E5%A0%B4.jpg/960px-%E5%AF%8C%E5%B2%A1%E8%A3%BD%E7%B3%B8%E5%A0%B4%E3%83%BB%E7%B9%B0%E7%B3%B8%E5%A0%B4.jpg",
  "yakushima-town":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Miyanoura_%2832273795996%29.jpg/960px-Miyanoura_%2832273795996%29.jpg",
};

let updatedCount = 0;
for (const [id, url] of Object.entries(updates)) {
  const dest = destinations.find((d) => d.id === id);
  if (dest) {
    const oldUrl = dest.heroImage || dest.image || "";
    dest.heroImage = url;
    dest.image = url;
    dest.gallery = [url];
    updatedCount++;
    console.log(`✅ [${id}] ${dest.name}`);
    console.log(`   OLD: ${oldUrl.substring(0, 80)}...`);
    console.log(`   NEW: ${url.substring(0, 80)}...`);
  } else {
    console.log(`❌ NOT FOUND: ${id}`);
  }
}

fs.writeFileSync(destPath, JSON.stringify(destinations, null, 2));
console.log(
  `\n🎯 Successfully updated ${updatedCount}/${Object.keys(updates).length} destination images.`,
);
