import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../src/shared/types/destination";

const overrides: Record<
  string,
  { url: string; sourceUrl: string; attribution: string; license: string }
> = {
  "meiji-jingu": {
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Meiji_Jingu_Shrine_Tokyo_Japan.jpg?width=1600",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Meiji_Jingu_Shrine_Tokyo_Japan.jpg",
    attribution: "MediaByPanda",
    license: "CC BY-SA 4.0",
  },
  kabukiza: {
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Ginza_Kabukiza_2013_0428.jpg?width=1600",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Ginza_Kabukiza_2013_0428.jpg",
    attribution: "Tak1701d",
    license: "Public domain",
  },
  "takaosan-yakuoin": {
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Tokaosan-Yakuouin.jpg?width=1600",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tokaosan-Yakuouin.jpg",
    attribution: "Stanislaus",
    license: "Public domain",
  },
  "seiko-museum-ginza": {
    url: "https://museum.seiko.co.jp/common/img/ogp.jpg",
    sourceUrl: "https://museum.seiko.co.jp/en/",
    attribution: "Seiko Museum Ginza",
    license: "Official website image; all rights reserved",
  },
  "sugamo-jizo-dori": {
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sugamo_Jizodori_Sh%C5%8Dtengai.jpg?width=1600",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Sugamo_Jizodori_Sh%C5%8Dtengai.jpg",
    attribution: "Charlie fong",
    license: "CC BY-SA 4.0",
  },
  "yakushi-ike-park": {
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Yakushi-ike_Park.jpg?width=1600",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Yakushi-ike_Park.jpg",
    attribution: "machiro",
    license: "CC BY-SA 3.0 / GFDL",
  },
  "chofu-historic-jindaiji-district": {
    url: "https://upload.wikimedia.org/wikipedia/commons/1/17/Cyofushiyakusyo.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cyofushiyakusyo.jpg",
    attribution: "Wikimedia Commons contributor",
    license: "CC BY-SA / Public domain status as marked on source",
  },
  "tachikawa-manga-park": {
    url: "https://mangapark.jp/img/page/about/img01.jpg",
    sourceUrl: "https://mangapark.jp/about/",
    attribution: "Tachikawa Manga Park",
    license: "Official website image; all rights reserved",
  },
  "nozuta-park": {
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/NozutaPark.jpg?width=1600",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NozutaPark.jpg",
    attribution: "Wikimedia Commons contributor",
    license: "See source page",
  },
};

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailDir = path.join(process.cwd(), "public/data/destinations");
const catalog = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Destination[];
for (const destination of catalog) {
  const override = overrides[destination.id];
  if (!override) continue;
  destination.heroImage = override.url;
  (destination as Destination & { image?: string }).image = override.url;
  destination.imageMetadata = {
    source: override.sourceUrl.startsWith("https://commons.wikimedia.org")
      ? "Wikimedia Commons"
      : "Official venue website",
    license: override.license,
    attribution: override.attribution,
    sourceUrl: override.sourceUrl,
  };
  fs.writeFileSync(
    path.join(detailDir, `${destination.id}.json`),
    `${JSON.stringify(destination, null, 2)}\n`,
  );
}
const officialWebsites: Record<string, string> = {
  "seiko-museum-ginza": "https://museum.seiko.co.jp/en/",
  "ginza-itoya": "https://www.ito-ya.co.jp/",
  "teamlab-planets": "https://planets.teamlab.art/tokyo/en/",
  "tokiwaso-manga-museum": "https://tokiwasomm.jp/en/",
  "machida-graphic-arts-museum": "https://hanga-museum.jp/",
  "jindai-botanical-gardens": "https://www.tokyo-park.or.jp/park/jindai/",
  "showa-kinen-park": "https://www.showakinen-koen.jp/",
  "hiroshima-castle": "https://www.rijo-castle.jp/rijo/",
  "hiroshima-museum-art": "https://www.hiroshima-museum.jp/en/",
  shukkeien: "https://shukkeien.jp/en/",
  "nakanoshima-museum-art-osaka": "https://nakka-art.jp/en/",
  "osaka-central-public-hall": "https://osaka-chuokokaido.jp/english/",
  "tachikawa-manga-park": "https://mangapark.jp/",
};
for (const [id, officialWebsite] of Object.entries(officialWebsites)) {
  const destination = catalog.find((item) => item.id === id);
  if (destination) {
    destination.officialWebsite = officialWebsite;
    fs.writeFileSync(
      path.join(detailDir, `${destination.id}.json`),
      `${JSON.stringify(destination, null, 2)}\n`,
    );
  }
}
fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
