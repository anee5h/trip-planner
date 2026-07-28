#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const INDEX_PATH = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);

// QA fixes: id -> new image URL
// yamanashi-shosenkyo-gorge: qaStatus OK, customUrl is junk — skip
// nebuta-museum-wa-rasse-aomori, nyuto-onsen-akita, mount-zao-yamagata:
//   URLs injected after Wikimedia research (see PLACEHOLDER comments)
const FIXES = {
  "lake-towada-aomori":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Lake_Towada_from_Ohanabe_2008.jpg/330px-Lake_Towada_from_Ohanabe_2008.jpg",
  "lake-tazawa-akita":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Lake_Tazawa_and_Kansa-g%C5%AB_20210213.jpg/1920px-Lake_Tazawa_and_Kansa-g%C5%AB_20210213.jpg",
  "kegon-falls-nikko":
    "https://upload.wikimedia.org/wikipedia/commons/8/8a/Lake_chuzenji_and_kegon_waterfall.jpg",
  "akiu-onsen-miyagi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/211029_Akiu_Onsen_Sendai_Miyagi_pref_Japan01s3.jpg/1920px-211029_Akiu_Onsen_Sendai_Miyagi_pref_Japan01s3.jpg",
  "dakigaeri-valley-akita":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Dakigaeri_Gorge_and_Kamino-iwahashi_20201101.jpg/1920px-Dakigaeri_Gorge_and_Kamino-iwahashi_20201101.jpg",
  "geibikei-gorge-iwate":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/230729_Geibikei_Ichinoseki_Iwate_pref_Japan19s3.jpg/1920px-230729_Geibikei_Ichinoseki_Iwate_pref_Japan19s3.jpg",
  "jodogahama-beach-iwate":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Jodogahama_Beach_%2851971544590%29.jpg/1920px-Jodogahama_Beach_%2851971544590%29.jpg",
  "ryusendo-cave-iwate":
    "https://upload.wikimedia.org/wikipedia/commons/c/c8/Ryusendo.jpg",
  "zao-fox-village-miyagi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Kitsune_mura_H26Dec13.JPG/1920px-Kitsune_mura_H26Dec13.JPG",
  "sendai-castle-ruins-miyagi":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Waki-yagura_of_Sendai_Castle_20220910b.jpg/1920px-Waki-yagura_of_Sendai_Castle_20220910b.jpg",
  "yamadera-yamagata":
    "https://upload.wikimedia.org/wikipedia/commons/1/18/Risshakuji_Nokyodo_on_winter.jpg",
  "okama-crater-yamagata":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Zao.jpg/250px-Zao.jpg",
  "ouchi-juku-fukushima":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Ouchijuku_2006-11-12.jpg/1920px-Ouchijuku_2006-11-12.jpg",
  "tsuruga-castle-fukushima":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Aizuwakamatsu_Castle_ac_%281%29.jpg/1920px-Aizuwakamatsu_Castle_ac_%281%29.jpg",
  "goshikinuma-ponds-fukushima":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Goshikinuma.jpg/330px-Goshikinuma.jpg",
  "mount-bandai-fukushima":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Mt._Bandaisan_0811.JPG/1920px-Mt._Bandaisan_0811.JPG",
  // 3 researched — verified 200 OK via Commons API:
  "nebuta-museum-wa-rasse-aomori":
    "https://upload.wikimedia.org/wikipedia/commons/8/86/Nebuta_Museum_Wa_Rasse_exterior.jpg",
  "nyuto-onsen-akita":
    "https://upload.wikimedia.org/wikipedia/commons/c/ca/Tsurunoyu_onsen_rotenburo.JPG",
  "mount-zao-yamagata":
    "https://upload.wikimedia.org/wikipedia/commons/4/43/Zao_juhyo.jpg",
};

function run() {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  let updated = 0;
  let notFound = [];

  for (const [id, url] of Object.entries(FIXES)) {
    const dest = index.find((d) => d.id === id);
    if (!dest) {
      notFound.push(id);
      continue;
    }
    dest.heroImage = url;
    dest.image = url;
    console.log(`  FIXED  ${id}`);
    updated++;
  }

  if (notFound.length) console.warn("  NOT FOUND:", notFound);

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  console.log(`\nDone. Updated ${updated} destinations.`);
}

run();
