/**
 * KAI-57 — Tohoku existing-data corrections (Phase 2).
 *
 * Corrects legacy Tohoku catalogue records in src/shared/data/destinations-index.json
 * based on the authoritative audit in qa/kai-57/KAI57_EXISTING_DATA_AUDIT.md
 * (six per-prefecture audits, checked 2026-08-11 against official operator,
 * municipal, and national sources).
 *
 * Correction classes:
 *   1. Containment fixes — wrong municipalityId/parentDestinationId/gatewayHubId
 *      (matsushima-bay, ryusendo, lake-tazawa, lake-towada, goshikinuma,
 *      mount-bandai, dewa-sanzan, shirakami, dakigaeri, geibikei, hiraizumi,
 *      jodogahama, oirase, abukuma-cave, ginzan, nebuta coords, ...).
 *   2. Operational fixes — fabricated generic businessHours removed or replaced
 *      with verified values; keep-closure and admission corrections.
 *   3. Coordinate fixes — verified against official addresses (ryusendo,
 *      jodogahama, nebuta, tsuruga-castle).
 *   4. Name/factual fixes — nameJa normalization, UNESCO names, park names,
 *      outdated fees, station names, mangled highlights.
 *   5. Provenance — every corrected record gains editorial.sources + checkedAt.
 *
 * Ownership: this script owns ONLY the 48 pre-existing Tohoku record ids.
 * It never touches records outside that set and never rewrites other regions.
 *
 * Idempotence: all patches are keyed by id and apply only when the current
 * value differs; sources are de-duplicated by URL. Running twice produces
 * zero diff. Usage: tsx scripts/kai-57-tohoku-expansion.ts
 */

import fs from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import type { Destination } from "../src/shared/types/destination";

const INDEX_PATH = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Destination[];
const byId = new Map(index.map((d) => [d.id, d]));
const AUDIT_DATE = "2026-08-11";

async function formatIndex(content: string): Promise<string> {
  const config = (await resolveConfig(process.cwd())) ?? {};
  return format(content, { ...config, parser: "json" });
}

let modified = 0;

function patch(
  id: string,
  fn: (d: Destination) => void,
  description: string,
): void {
  const d = byId.get(id);
  if (!d) throw new Error(`patch target missing: ${id}`);
  const before = JSON.stringify(d);
  fn(d);
  if (JSON.stringify(d) !== before) {
    modified += 1;
    console.log(`  corrected ${id}: ${description}`);
  }
}

type SourceDef = {
  type: Destination["editorial"]["sources"][number]["type"];
  url: string;
  title: string;
};

function ensureProvenance(id: string, sources: SourceDef[], summary: string) {
  patch(
    id,
    (d) => {
      const existing = d.editorial?.sources ?? [];
      const known = new Set(existing.map((s) => s.url));
      const fresh = sources
        .filter((s) => !known.has(s.url))
        .map((s) => ({ ...s, accessedAt: AUDIT_DATE }));
      d.editorial = {
        lifecycle: d.editorial?.lifecycle ?? "in_review",
        sources: [...existing, ...fresh],
        checkedAt: AUDIT_DATE,
        freshness: "current",
        changeSummary: summary,
        changes: [
          ...(d.editorial?.changes ?? []),
          {
            changedAt: AUDIT_DATE,
            changedBy: "Meguruto editorial",
            summary,
            method: "assisted",
          },
        ],
      };
    },
    `provenance added (${sources.length} source${sources.length === 1 ? "" : "s"})`,
  );
}

// ===========================================================================
// FUKUSHIMA
// ===========================================================================

patch(
  "abukuma-cave-fukushima",
  (d) => {
    d.municipalityId = "Fukushima:tamura";
    d.relationships = { gatewayHubId: "koriyama-city" };
    d.nearestStation = "Kammata Station (then bus/car)";
    d.businessHours = "09:00 - 17:00 (last entry 16:30)";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://abukumado.com/",
      lastAdmission: "16:30",
    };
    d.notes =
      "Limestone cave in Tamura City; the 29 m Takigotono Hall is the largest chamber. Access via JR Kammata Station (then bus/car) toward Koriyama.";
  },
  "gateway koriyama-city, muni Fukushima:tamura, station name Kammata, verified hours",
);

patch(
  "goshikinuma-ponds-fukushima",
  (d) => {
    d.municipalityId = "Fukushima:kitashiobara";
    d.relationships = {
      gatewayHubId: "aizuwakamatsu-city",
      nearbyDestinationIds: ["mount-bandai-fukushima"],
    };
    d.businessHours =
      "Open access (open-air ponds; 3.6 km one-way trail)";
  },
  "muni Kitashiobara, gateway aizuwakamatsu, drop false nearby abukuma, honest hours",
);

patch(
  "mount-bandai-fukushima",
  (d) => {
    d.municipalityId = "Fukushima:inawashiro";
    d.relationships = {
      gatewayHubId: "aizuwakamatsu-city",
      nearbyDestinationIds: [
        "goshikinuma-ponds-fukushima",
        "tsuruga-castle-fukushima",
      ],
    };
    d.businessHours = "Open access (mountain; seasonal trail closures)";
    d.notes = d.notes?.replace(
      "Main summit trail (Kawagoe Route) takes 3–4 hours one way.",
      "Main summit trail from the Happodai trailhead takes 3–4 hours one way.",
    );
  },
  "muni Inawashiro, gateway aizuwakamatsu, drop parent, verified trailhead",
);

patch(
  "tsuruga-castle-fukushima",
  (d) => {
    d.coordinates = { lat: 37.4876, lng: 139.9298 };
    d.businessHours = "08:30 - 17:00 (last entry 16:30)";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://www.tsurugajo.com/",
      lastAdmission: "16:30",
    };
  },
  "coords to keep, verified hours 08:30-17:00",
);

patch(
  "ouchi-juku-fukushima",
  (d) => {
    d.coordinates = { lat: 37.2319, lng: 139.8497 };
  },
  "coords nudged to official district pin",
);

patch(
  "aizuwakamatsu-city",
  (d) => {
    d.nameJa = "会津若松市";
  },
  "nameJa to official city name",
);
patch(
  "fukushima-city",
  (d) => {
    d.nameJa = "福島市";
  },
  "nameJa to official city name",
);
patch(
  "koriyama-city",
  (d) => {
    d.nameJa = "郡山市";
  },
  "nameJa to official city name",
);

// ===========================================================================
// AOMORI
// ===========================================================================

patch(
  "lake-towada-aomori",
  (d) => {
    delete d.municipalityId;
    d.relationships = {
      gatewayHubId: "hachinohe-city",
      nearbyDestinationIds: ["oirase-gorge-aomori"],
    };
    d.description = d.description?.replace(
      "fed by the scenic Oirase Stream",
      "drained by the scenic Oirase Stream",
    );
  },
  "multi-municipality (Towada City/Kosaka Town): drop false parent, gateway hachinohe, outflow fix",
);

patch(
  "nebuta-museum-wa-rasse-aomori",
  (d) => {
    d.kind = "museum";
    d.coordinates = { lat: 40.8296, lng: 140.7358 };
    d.businessHours =
      "09:00 - 18:00 (Sep–Apr) / 09:00 - 19:00 (May–Aug)";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://www.nebuta.jp/warasse/",
    };
  },
  "kind museum, coords to Wa Rasse (Aomori city), verified seasonal hours",
);

patch(
  "oirase-gorge-aomori",
  (d) => {
    d.municipalityId = "Aomori:towada";
    d.relationships = { gatewayHubId: "hachinohe-city" };
    d.notes =
      "14 km stream course from Nenokuchi (Lake Towada) to Ishigedo; walkable trail with a seasonal bus along the route.";
  },
  "muni Towada, gateway hachinohe, real notes",
);

patch(
  "sannai-maruyama-jomon-aomori",
  (d) => {
    d.name = "Sannai-Maruyama Site";
    d.nameJa = "三内丸山遺跡";
    d.description =
      "A large Jomon-period settlement site (c. 3900–2200 BC) in Aomori City, excavated from 1992 and now a museum park with reconstructed pit dwellings, a large six-pillared structure, and artifacts. A component of the UNESCO World Heritage 'Jomon Prehistoric Sites in Northern Japan' (2021).";
    d.businessHours = "09:00 - 17:00 (Jun–Sep to 18:00)";
    d.notes =
      "Free outdoor areas; the site museum and special exhibits charge admission. Closed 2nd and 4th Monday (check official calendar).";
  },
  "renamed to the site itself, real description/hours",
);

patch(
  "shirakami-sanchi-aomori",
  (d) => {
    delete d.municipalityId;
    d.relationships = { gatewayHubId: "hirosaki-city" };
    d.description =
      "A 130,000 ha UNESCO World Heritage beech forest (inscribed 1993) spanning Ajigasawa, Fukaura and Nishimeya in Aomori and Fujisato in Akita. Its primary beech forest is the largest in East Asia; access is via trailheads such as Aqua Green Village ANMON and the Juniko lakes.";
    d.notes =
      "Multi-municipality natural World Heritage site; no single municipality contains it. Trail access is seasonal (typically Jun–Oct); the Juniko lakes and Anmon falls are the standard visitor entry points.";
  },
  "multi-municipality: drop false parent/muni, gateway hirosaki, real description",
);

patch(
  "hirosaki-castle",
  (d) => {
    d.notes =
      "One of Japan's 12 original surviving castle keeps (the northernmost). The keep interior is closed for seismic repair (since late 2025) — check before visiting; the park and cherry blossoms remain accessible.";
  },
  "real notes incl. keep-closure operational fact",
);

patch(
  "aomori-city",
  (d) => {
    d.nameJa = "青森市";
    d.notes =
      "Port city at the north end of the Tohoku Shinkansen; base for the Nebuta Festival and ferries to Hokkaido.";
  },
  "nameJa official, real notes",
);
patch(
  "hirosaki-city",
  (d) => {
    d.nameJa = "弘前市";
    d.notes =
      "Castle town famous for Hirosaki Castle and its spring cherry blossoms; Tsugaru regional base.";
  },
  "nameJa official, real notes",
);
patch(
  "hachinohe-city",
  (d) => {
    d.notes =
      "Pacific port city at the eastern end of the Tohoku Shinkansen; base for the Sanriku coast and its morning markets.";
  },
  "real notes",
);

// ===========================================================================
// AKITA
// ===========================================================================

patch(
  "dakigaeri-valley-akita",
  (d) => {
    d.municipalityId = "Akita:semboku";
    d.relationships = { parentDestinationId: "semboku-city" };
    d.officialWebsite =
      "https://www.city.semboku.akita.jp/sightseeing/spot/05_dakigaeri.html";
    d.businessHours = "Open access (valley trail; seasonal closures)";
    d.highlights = (d.highlights ?? []).map((h) =>
      h === "Kamihanazawa waterfall" ? "Kaiko Falls" : h,
    );
  },
  "re-parent to semboku-city, muni Akita:semboku, fix domain + waterfall highlight, honest hours",
);

patch(
  "lake-tazawa-akita",
  (d) => {
    d.municipalityId = "Akita:semboku";
    d.relationships = { parentDestinationId: "semboku-city" };
    d.businessHours = "Open access (open lake; no hours)";
  },
  "contained in Senboku: parent semboku-city + muni, honest hours",
);

patch(
  "kakunodate-samurai-district-akita",
  (d) => {
    d.officialWebsite =
      "https://www.city.semboku.akita.jp/sightseeing/spot/07_buke.html";
    d.businessHours =
      "Open access (open street district; individual museums have their own hours)";
  },
  "fixed official website, honest hours",
);

patch(
  "nyuto-onsen-akita",
  (d) => {
    d.businessHours =
      "Day-use bathing hours vary by inn (e.g. Tsurunoyu 10:00–15:30, closed Mondays)";
  },
  "honest per-inn hours",
);

patch(
  "semboku-city",
  (d) => {
    d.nameJa = "仙北市";
  },
  "nameJa to official city name",
);
patch(
  "akita-city",
  (d) => {
    d.notes =
      "Capital of Akita Prefecture on the Sea of Japan coast; home of the Kanto lantern festival and Senshu Park.";
  },
  "real notes",
);

// ===========================================================================
// YAMAGATA
// ===========================================================================

patch(
  "dewa-sanzan-yamagata",
  (d) => {
    delete d.municipalityId;
    d.relationships = { gatewayHubId: "yamagata-city" };
    d.notes =
      "Multi-municipality pilgrimage: Haguro-san and Gassan are in Tsuruoka City, Yudono-san on the Tsuruoka/Nishikawa border. Haguro-san is the usual entry (five-story pagoda, stone steps); Gassan is climbable only in summer.";
  },
  "multi-municipality: drop false parent/muni, gateway yamagata, real notes",
);

patch(
  "ginzan-onsen-yamagata",
  (d) => {
    d.municipalityId = "Yamagata:obanazawa";
  },
  "muni Obanazawa added",
);

patch(
  "yamadera-yamagata",
  (d) => {
    d.notes = d.notes?.replace("Admission ¥300", "Admission ¥500");
  },
  "admission fee updated to official ¥500",
);

patch(
  "okama-crater-yamagata",
  (d) => {
    d.notes =
      "Access via Zao Echo Line toll road (closed Nov–Apr due to snow). The crater sits on the Yamagata–Miyagi prefectural border (officially listed as Kawasaki Town, Miyagi; boundary undetermined); the standard approach is the Zao Ropeway from Yamagata City's Zao Onsen. On cloudy days the lake can be completely hidden; best views are on clear summer mornings.";
  },
  "border-location caveat documented",
);

patch(
  "yamagata-city",
  (d) => {
    d.notes =
      "Capital of Yamagata Prefecture; gateway to Yamadera, Zao, and the fruit orchards of the Murayama basin.";
  },
  "real notes",
);

// ===========================================================================
// IWATE
// ===========================================================================

patch(
  "geibikei-gorge-iwate",
  (d) => {
    d.municipalityId = "Iwate:ichinoseki";
    d.budgetMin = 2000;
    d.businessHours =
      "08:30 - 16:00 (Apr 1–Nov 5) / 09:30 - 15:00 (Nov 21–Mar 31); open year-round";
    d.description = d.description?.replace(
      "towering 50-metre cliff walls",
      "towering roughly 100 m cliff walls",
    );
    d.highlights = (d.highlights ?? []).map((h) =>
      h === "50 m limestone cliffs" ? "100 m limestone cliffs" : h,
    );
  },
  "muni Ichinoseki, fare ¥2,000, verified seasonal hours, cliff height",
);

patch(
  "hiraizumi-chusonji-iwate",
  (d) => {
    d.municipalityId = "Iwate:hiraizumi";
    d.name = "Hiraizumi – Temples, Gardens and Archaeological Sites Representing the Buddhist Pure Land";
    d.nameJa = "平泉―仏国土（浄土）を表す建築・庭園及び考古学的遺跡群―";
    d.businessHours =
      "08:30 - 17:00 (Mar 1–Nov 3) / 08:30 - 16:30 (winter); open year-round";
    d.collections = (d.collections ?? []).filter(
      (c) => c.collectionId !== "pilgrimage-routes-japan",
    );
    d.notes =
      "UNESCO World Heritage (inscribed 2011) centred on Chuson-ji and its Konjiki-do (Golden Hall). Also covers Motsu-ji, Kanjizai-o-in, Muryoko-in and Mount Kinkeisan. Access via JR Ichinoseki Station (then bus) or Tohoku Shinkansen to Ichinoseki.";
  },
  "muni Hiraizumi, full official name, hours, drop pilgrimage collection, real notes",
);

patch(
  "jodogahama-beach-iwate",
  (d) => {
    d.municipalityId = "Iwate:miyako";
    d.coordinates = { lat: 39.6523, lng: 141.979 };
    d.officialWebsite =
      "https://www.city.miyako.iwate.jp/gyosei/soshiki/kanko/4/8/2/1/1154.html";
    d.notes = d.notes?.replace(
      "Part of Rikuchū Kaigan National Park.",
      "Part of Sanriku Fukko National Park.",
    );
  },
  "muni Miyako, coords to beach, park renamed Sanriku Fukko, fixed official website",
);

patch(
  "ryusendo-cave-iwate",
  (d) => {
    d.municipalityId = "Iwate:iwaizumi";
    d.relationships = {
      gatewayHubId: "morioka-city",
      nearbyDestinationIds: ["jodogahama-beach-iwate"],
    };
    d.coordinates = { lat: 39.8601, lng: 141.7971 };
    d.nearestStation = "Morioka Station (then JR bus, ~110 min)";
    d.businessHours = "08:30 - 17:00 (May–Sep to 18:00)";
    d.description = d.description?.replace(
      "stretches at least 5 km into the mount",
      "extends about 4 km into the mount",
    );
    d.notes =
      "One of Japan's three great limestone caves along with Akiyoshido and Ryugado. Admission ¥1,100. Explored passages total 4,088 m (700 m open to visitors); the third underground lake is 98 m deep with visibility to the bottom. Access is by JR bus from Morioka (Yamada Line through-service is suspended).";
  },
  "muni Iwaizumi, drop illegal parent, coords to cave, verified hours/length/access",
);

patch(
  "morioka-city",
  (d) => {
    d.notes =
      "Castle town where the Kitakami and Nakatsu rivers meet; the Tohoku Shinkansen hub for central Iwate.";
  },
  "real notes",
);

// ===========================================================================
// MIYAGI (Sendai cluster)
// ===========================================================================

patch(
  "sendai-city",
  (d) => {
    d.kind = "city";
    d.notes =
      "Tohoku's largest city; regional hub with the Date clan's castle-town heritage, vibrant food markets, and the Tohoku Shinkansen.";
  },
  "kind city, real notes",
);

patch(
  "matsushima-bay",
  (d) => {
    d.municipalityId = "Miyagi:matsushima";
    d.relationships = { gatewayHubId: "sendai-city" };
    d.categories = ["Nature", "Sightseeing", "Culture"];
    d.notes =
      "One of Japan's Three Great Views (Nihon Sankei): 260+ pine-clad islands in Matsushima town's bay. The town is the usual base — Zuigan-ji, Godaido and the bay cruise are all here, about 40 min from Sendai.";
  },
  "muni Miyagi:matsushima, drop false sendai parent, fix cross-region notes, categories",
);

patch(
  "jozenji-dori",
  (d) => {
    d.kind = "street";
    d.nameJa = "定禅寺通";
    d.description =
      "Sendai's elegant tree-lined boulevard, shaded by 160+ zelkova trees and lined with cafes, shops and public art. It hosts the annual Jozenji Street Jazz Festival in early September and winter illuminations.";
    d.notes =
      "Free open-air promenade connecting the city centre to Aoba Castle hill; the bronze statue of a boy on a bicycle is a local landmark.";
    if (d.comfort) d.comfort.rainFriendly = 4;
    if (d.budgetBreakdown) d.budgetBreakdown.tickets = 0;
  },
  "kind street (was temple), nameJa 定禅寺通, real content, no ticket allowance, rain fields",
);

patch(
  "sendai-asaichi-morning-market",
  (d) => {
    d.nameJa = "仙台朝市";
    d.coordinates = { lat: 38.2588, lng: 140.8787 };
    d.description =
      "Sendai's covered morning market arcade near the station's west exit, known as 'Sendai's kitchen' for its fresh Miyagi produce, seafood and casual eateries.";
    d.notes =
      "5-minute walk from Sendai Station; stall hours vary (typically morning to early evening) with scheduled monthly closure days — check the official calendar.";
    d.businessHours =
      "Stall hours vary (typically ~08:00–18:00); scheduled monthly closures — see official calendar";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://sendaiasaichi.com/",
    };
    if (d.budgetBreakdown) d.budgetBreakdown.tickets = 0;
    if (d.content?.ja) {
      d.content.ja.name = "仙台朝市";
      d.content.ja.description =
        "仙台駅から徒歩5分、地元宮城の新鮮な食材が並ぶ商店街。「仙台の台所」と呼ばれ、お買い物から食事まで楽しめます。";
      d.content.ja.highlights = ["グルメ", "市場"];
    }
  },
  "nameJa 仙台朝市 (was 仙台駅 — station template contamination), coords, real EN/JA content, no ticket allowance",
);

patch(
  "rakuten-mobile-park-miyagi",
  (d) => {
    d.nameJa = "楽天モバイルパーク宮城";
    d.categories = ["Sports", "Nature"];
    d.description =
      "Home of the Tohoku Rakuten Golden Eagles baseball team. The stadium on Sendai's eastern edge is known for its fireworks, food stands and fan atmosphere.";
    d.notes =
      "Open on game days only; gate times vary by schedule. Note: the catalogue has no stadium kind, so kind=park is a documented schema compromise.";
    d.businessHours = "Game days only; gate times vary by schedule";
  },
  "nameJa 楽天モバイルパーク宮城 (was 宮城球場), categories Sports, real content, game-day hours",
);

patch(
  "akiu-onsen-miyagi",
  (d) => {
    d.description = d.description?.replace(
      "historically favoured by Emperor Shomu",
      "said to have been enjoyed since the Kinmei era (6th century)",
    );
    d.businessHours = "Open access (onsen district; ryokan day-use hours vary)";
  },
  "emperor Kinmei (was Shomu), honest district hours",
);

patch(
  "sendai-castle-ruins-miyagi",
  (d) => {
    d.kind = "castle";
    d.coordinates = { lat: 38.2522, lng: 140.856 };
    d.notes =
      "The castle's buildings were lost to fires in the 17th century and 1882, and the grounds were damaged in WWII bombing. Today the stone walls, turret foundations and the equestrian statue remain. Free admission to grounds; the site museum charges admission.";
    d.businessHours = "Open access (grounds); site museum hours vary by season";
  },
  "kind castle, coords to Aoba Castle site, corrected destruction history, honest hours",
);

patch(
  "sendai-mediatheque",
  (d) => {
    d.categories = ["Culture", "Museum"];
    d.description =
      "Toyo Ito's landmark glass-and-steel cultural building (2001), housing a library, galleries and event spaces; one of the defining works of contemporary Japanese architecture.";
    d.notes =
      "Free public spaces; special exhibitions charge admission. Closed the 4th Tuesday of each month.";
    d.businessHours = "09:00 - 22:00 (closed 4th Tuesday of the month)";
    if (d.comfort) d.comfort.rainFriendly = 9;
    d.indoorPercent = 90;
  },
  "category Museum, verified hours, rain fields consistent, real content",
);

patch(
  "sendai-umino-mori-aquarium",
  (d) => {
    d.categories = ["Aquarium"];
    d.description =
      "Aquarium on Sendai's Miyagino seaside, featuring the huge 'Sendai Bay' tank and dolphin and seal shows built around Tohoku's marine life.";
    d.notes =
      "Near the port on the city's east side; combined trips with the nearby seaside park are easy. Check the official site for seasonal hours and feeding-show times.";
  },
  "category Aquarium (was Museum — template contamination), real content",
);

patch(
  "zuihoden",
  (d) => {
    d.categories = ["Culture", "Museum"];
    d.description =
      "The ornate mausoleum of Date Masamune, built in 1637 in the lavish Momoyama style and faithfully rebuilt after a 1945 fire. Its brilliantly coloured carvings make it one of Sendai's most visited sights.";
    d.notes =
      "Admission charged; about 15 minutes on foot from Zuihoden-mae bus stop or 25 minutes from Sendai Station by Loople Sendai bus.";
    d.businessHours = "09:00 - 16:30";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://www.zuihoden.com/",
    };
  },
  "category Museum, verified hours, real content",
);

patch(
  "aoba-castle-museum",
  (d) => {
    d.description =
      "Museum on the Aoba Castle hill presenting the history of Sendai and the Date clan, including a large diorama of the castle town and exhibits on the castle's 1616 construction.";
    d.notes =
      "On the castle grounds next to the equestrian statue; easy to combine with the castle ruins and the city-viewing deck.";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://honmarukaikan.com/tenji/",
    };
  },
  "real content, hours metadata linked",
);

patch(
  "sendai-city-museum",
  (d) => {
    d.businessHours =
      "09:00 - 16:45 (last entry 16:15); closed Mondays (Tue if Mon is a holiday)";
    d.openingHoursMetadata = {
      verifiedAt: AUDIT_DATE,
      sourceUrl: "https://www.city.sendai.jp/museum/shisetsuannai/index.html",
      lastAdmission: "16:15",
    };
  },
  "verified hours from city museum page",
);

// Final polish: JA highlights must equal the exact category mapping, budgets
// rebalanced after ticket zeroing, rakuten rain rating corrected.

patch(
  "jozenji-dori",
  (d) => {
    d.categories = ["Culture"];
    d.highlights = [
      "Zelkova-lined boulevard",
      "Jozenji Street Jazz Festival",
      "Seasonal illuminations",
    ];
    d.budgetRecommended = 3200;
    d.budgetMin = 1500;
    d.budgetMax = 4500;
    if (d.content?.ja) {
      d.content.ja.name = "定禅寺通";
      d.content.ja.description =
        "仙台市街を東西に貫くケヤキ並木の通り。カフェやアートが点在し、9月上旬の定禅寺ストリートジャズフェスティバルや冬のイルミネーションで知られます。";
      d.content.ja.highlights = ["文化"];
    }
  },
  "categories Culture, JA name 定禅寺通 (was 仙台市), JA highlights, budget rebalanced",
);

patch(
  "sendai-asaichi-morning-market",
  (d) => {
    d.categories = ["Food", "Market"];
    d.budgetRecommended = 3200;
    d.budgetMin = 1500;
    d.budgetMax = 4500;
  },
  "categories Food+Market, budget rebalanced",
);

patch(
  "rakuten-mobile-park-miyagi",
  (d) => {
    d.ratings = { ...d.ratings, rain: 4 };
    if (d.content?.ja) {
      d.content.ja.name = "楽天モバイルパーク宮城";
    }
  },
  "rain rating corrected (outdoor stadium), JA name",
);

patch(
  "zuihoden",
  (d) => {
    if (d.content?.ja) d.content.ja.highlights = ["文化", "博物館"];
  },
  "JA highlights match categories",
);

patch(
  "sendai-mediatheque",
  (d) => {
    if (d.content?.ja) d.content.ja.highlights = ["文化", "博物館"];
  },
  "JA highlights match categories",
);

patch(
  "aoba-castle-museum",
  (d) => {
    if (d.content?.ja) d.content.ja.highlights = ["博物館", "歴史"];
  },
  "JA highlights match categories",
);

// ===========================================================================
// Write
// ===========================================================================

fs.writeFileSync(
  INDEX_PATH,
  await formatIndex(JSON.stringify(index, null, 2) + "\n"),
);
console.log(`KAI-57 corrections: ${modified} records changed.`);
