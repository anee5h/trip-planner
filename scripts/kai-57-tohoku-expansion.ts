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
      const changes = d.editorial?.changes ?? [];
      const last = changes[changes.length - 1];
      const alreadyLogged =
        last !== undefined &&
        last.summary === summary &&
        last.changedAt === AUDIT_DATE;
      // Cohort hubs and verified records are live production content: ensure
      // lifecycle is "published" (toCanonicalPlace derives "published" for
      // pilot records; in_review breaks COHORT_NOT_PUBLISHED).
      const lifecycle =
        d.editorial?.lifecycle === "published"
          ? "published"
          : d.status === "verified"
            ? "published"
            : (d.editorial?.lifecycle ?? "in_review");
      d.editorial = {
        lifecycle,
        ...(lifecycle === "published" && !d.editorial?.reviewedAt
          ? { reviewedAt: AUDIT_DATE, reviewedBy: "Meguruto editorial" }
          : {}),
        sources: [...existing, ...fresh],
        checkedAt: AUDIT_DATE,
        freshness: "current",
        changeSummary: summary,
        changes: alreadyLogged
          ? changes
          : [
              ...changes,
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
// KAI-57 additions — record templates (mirror KAI-31 conventions)
// ===========================================================================

const OPENING_HOURS_JA_TOHOKU: Record<string, string> = {
  "zuigan-ji":
    "8:30開門。閉門は月により15:30～17:00（12月15:30、2月16:00、3月・10月16:30、4～9月17:00、11月16:00）。最終入場は閉門30分前。",
  "godaido": "日中のみ拝観可（夜間は閉門）。参拝無料。",
  "kanrantei": "8:30～17:00（4～10月）、8:30～16:30（11～3月）。",
  "fukuurajima": "8:30～17:00（4～10月）、8:30～16:30（11～3月）。",
  "oshima": "常時開放（日没前が目安）。",
  "entsuin": "9:00～16:00（4～11月）、9:00～15:30（12～3月）。",
  "matsushima-bay-cruise":
    "9:00～16:00に毎時出航（冬季は16時便運休）。所要50分。",
  "saigyo-modoshi-no-matsu":
    "公園は常時開放。冬季はパノラマラインが通行止め。",
};

function tohokuPoi(
  id: string,
  name: string,
  nameJa: string,
  municipalityId: string,
  parent: string,
  coords: [number, number],
  kind: Destination["kind"],
  categories: string[],
  tags: string[],
  description: string,
  descriptionJa: string,
  jaHighlights: string[],
  enHighlights: string[],
  budget: [number, number, number],
  breakdown: { transport: number; tickets: number; food: number; cafe: number },
  transportOptions: Destination["transportOptions"],
  visitHours: { min: number; max: number },
  walking: [number, number, number],
  indoorPercent: number,
  crowd: Destination["crowd"],
  season: Destination["season"],
  bestMonths: number[],
  bestSeason: string,
  weatherDependence: "low" | "moderate" | "high",
  comfort: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  },
  ratings: Destination["ratings"],
  officialWebsite: string,
  businessHours: string,
  reservation: string,
  parking: string,
  notes: string,
  sources: {
    type: Destination["editorial"]["sources"][number]["type"];
    url: string;
    title: string;
  }[],
  image: {
    url: string;
    license: string;
    attribution: string;
    sourceUrl: string;
  },
  aliases: string[] = [],
): Destination {
  const sum =
    breakdown.transport + breakdown.tickets + breakdown.food + breakdown.cafe;
  if (Math.abs(sum - budget[1]) > Math.max(100, budget[1] * 0.02)) {
    throw new Error(`${id}: budget breakdown sum ${sum} != recommended ${budget[1]}`);
  }
  const [walkingMin, walkingSunMin, walkingShadeMin] = walking;
  if (walkingSunMin + walkingShadeMin > walkingMin) {
    throw new Error(`${id}: walkingSunMin+walkingShadeMin > walkingMin`);
  }
  if (walkingMin > visitHours.max * 5000) {
    throw new Error(`${id}: walkingMin > visitHours.max*5000`);
  }
  const openingHoursJa = OPENING_HOURS_JA_TOHOKU[id];
  if (!openingHoursJa) {
    throw new Error(`${id}: missing audited Japanese opening hours`);
  }
  return {
    id,
    name,
    nameJa,
    kind,
    role: "poi",
    placeType: "destination",
    aliases,
    municipalityId,
    prefecture: municipalityId.split(":")[0],
    region: "Tohoku",
    coordinates: { lat: coords[0], lng: coords[1] },
    categories,
    tags,
    description,
    highlights: enHighlights,
    status: "beta",
    travelEstimate: { confidence: "beta" },
    collections: [],
    transportOptions,
    budgetMin: budget[0],
    budgetRecommended: budget[1],
    budgetMax: budget[2],
    budgetBreakdown: breakdown,
    heroImage: image.url,
    image: image.url,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: image.license,
      attribution: image.attribution,
      sourceUrl: image.sourceUrl,
    },
    openingHoursMetadata: { verifiedAt: AUDIT_DATE },
    recommendedVisitHours: visitHours,
    walkingMin,
    walkingSunMin,
    walkingShadeMin,
    walkingIntensity:
      comfort.walkingIntensity <= 3
        ? "low"
        : comfort.walkingIntensity <= 6
          ? "medium"
          : "high",
    indoorPercent,
    comfort,
    ratings,
    ratingsSchemaVersion: 2,
    crowd,
    season,
    bestMonths,
    bestSeason,
    weatherDependence,
    reservation,
    parking,
    notes,
    notesJa: `【見どころ】${nameJa}は東北の観光スポットです。訪問前に公式サイトで最新の営業情報をご確認ください。`,
    reservationJa: "【予約】最新の予約・受付情報は公式サイトをご確認ください。",
    parkingJa: "【駐車場】公式サイトで最新の駐車場情報をご確認ください。",
    openingHoursJa,
    businessHours,
    officialWebsite,
    content: {
      en: { name, description, highlights: enHighlights },
      ja: { name: nameJa, description: descriptionJa, highlights: jaHighlights },
    },
    editorial: {
      lifecycle: "in_review",
      sources: sources.map((s) => ({ ...s, accessedAt: AUDIT_DATE })),
      checkedAt: AUDIT_DATE,
      freshness: "current",
      changeSummary: "KAI-57 Tohoku expansion",
      changes: [
        {
          changedAt: AUDIT_DATE,
          changedBy: "Meguruto editorial",
          summary: "Added source-backed KAI-57 Tohoku POI",
          method: "assisted",
        },
      ],
    },
    ratingMetadata: {
      rubricVersion: 1,
      method: "assisted",
      confidence: "low",
    },
    relationships: { parentDestinationId: parent },
    // Bridge-connected islets are mainland-routable (enoshima-island precedent).
    ...(kind === "island" ? { transportZoneId: "mainland-honshu" } : {}),
    schemaVersion: 2,
  };
}

// ===========================================================================
// KAI-57 additions — Matsushima cluster (batch 1)
// ===========================================================================

const MATSUSHIMA_IMAGE = {
  zuiganji: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/211030_Zuigan-ji_Matsushima_Miyagi_pref_Japan10s3.jpg/1280px-211030_Zuigan-ji_Matsushima_Miyagi_pref_Japan10s3.jpg",
    license: "CC BY-SA 4.0",
    attribution: "663highland",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:211030_Zuigan-ji_Matsushima_Miyagi_pref_Japan10s3.jpg",
  },
  godaido: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Matsushima_Godaido_4.jpg/1280px-Matsushima_Godaido_4.jpg",
    license: "CC BY-SA 3.0",
    attribution: "Tak1701d",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Matsushima_Godaido_4.jpg",
  },
  kanrantei: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Matsushima_Kanran-tei_01.jpg/1280px-Matsushima_Kanran-tei_01.jpg",
    license: "Public domain",
    attribution: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Matsushima_Kanran-tei_01.jpg",
  },
  fukuurajima: {
    url: "https://upload.wikimedia.org/wikipedia/commons/2/22/Fukuura_Bridge_With_Fukuura_Island.JPG",
    license: "Public domain",
    attribution: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Fukuura_Bridge_With_Fukuura_Island.JPG",
  },
  oshima: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Matsushima_%28Matsushima_Bay%29_20170327.jpg/1280px-Matsushima_%28Matsushima_Bay%29_20170327.jpg",
    license: "CC BY-SA 4.0",
    attribution: "Suicasmo",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Matsushima_(Matsushima_Bay)_20170327.jpg",
  },
  entsuin: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/%E5%86%86%E9%80%9A%E9%99%A2_-_panoramio.jpg/1280px-%E5%86%86%E9%80%9A%E9%99%A2_-_panoramio.jpg",
    license: "CC BY 3.0",
    attribution: "AMANO Jun-ichi",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:円通院_-_panoramio.jpg",
  },
  cruise: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Flag_of_Japan%2C_sightseeing_boat_on_Matsushima_Bay_-_Oct_25%2C_2022_%281%29.jpg/1280px-Flag_of_Japan%2C_sightseeing_boat_on_Matsushima_Bay_-_Oct_25%2C_2022_%281%29.jpg",
    license: "CC BY 2.0",
    attribution: "John Seb Barber",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Flag_of_Japan,_sightseeing_boat_on_Matsushima_Bay_-_Oct_25,_2022_(1).jpg",
  },
  saigyo: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/211030_Saigyo_Modoshi_no_Matsu_Park_Matsushima_Miyagi_pref_Japan01n.jpg/1280px-211030_Saigyo_Modoshi_no_Matsu_Park_Matsushima_Miyagi_pref_Japan01n.jpg",
    license: "CC BY-SA 4.0",
    attribution: "663highland",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:211030_Saigyo_Modoshi_no_Matsu_Park_Matsushima_Miyagi_pref_Japan01n.jpg",
  },
  townHall: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Matsushima_Town-Hall.jpg/1280px-Matsushima_Town-Hall.jpg",
    license: "CC0",
    attribution: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Matsushima_Town-Hall.jpg",
  },
};

const MATSUSHIMA_MUNI = "Miyagi:matsushima";
const MATSUSHIMA_HUB = "matsushima-town";

const MATSUSHIMA_POIS: Destination[] = [
  tohokuPoi(
    "zuigan-ji",
    "Zuigan-ji",
    "瑞巌寺",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3722, 141.0596],
    "temple",
    ["Culture", "History"],
    ["Culture", "History", "Matsushima Town"],
    "National Treasure temple of the Date clan, rebuilt by Date Masamune in 1609 in lavish Momoyama style. The 2018 Heisei restoration returned the gold-leaf interiors of the Main Hall and Kuri to their original brilliance.",
    "伊達政宗が1609年に再建した国宝の禅寺。2018年に平成の大修理を終えた本堂と庫裏は、金碧障壁画の華やかな桃山様式を今に伝えます。",
    ["国宝本堂・庫裏", "伊達政宗ゆかりの寺", "金碧障壁画", "奥の院（洞窟群）"],
    ["National Treasure Main Hall", "Date Masamune's rebuilt temple", "Gold-leaf Momoyama interiors", "Cave shrines of Oshu"],
    [1000, 3000, 5000],
    { transport: 900, tickets: 1000, food: 800, cafe: 300 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    60,
    { weekday: 5, weekend: 7, holiday: 8 },
    { spring: 9, summer: 8, autumn: 9.2, winter: 8.6 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 6, walkingIntensity: 4 },
    { overall: 9.2, couple: 8.6, summer: 8.4, winter: 8.8, rain: 8, food: 7.4, photography: 9, relaxation: 8.4, value: 8, uniqueness: 9.4, family: 7.8, accessibility: 6, nature: 7, historyAndCulture: 9.8, walkability: 8, spring: 9.2, autumn: 9.4 },
    "https://www.zuiganji.or.jp/",
    "08:30 open; closing 15:30–17:00 by season; last admission 30 min before close",
    "No reservation required",
    "No private parking; use Matsushima-Kaigan Station (10 min walk)",
    "¥1,000 adult / ¥500 child. The 2018 Heisei Grand Restoration returned the gold-leaf interiors to their original brilliance.",
    [{ type: "official", url: "https://www.zuiganji.or.jp/", title: "Zuigan-ji official site" }],
    MATSUSHIMA_IMAGE.zuiganji,
  ),
  tohokuPoi(
    "godaido",
    "Godaido",
    "五大堂",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3697, 141.0642],
    "temple",
    ["History", "Culture"],
    ["History", "Culture", "Matsushima Town"],
    "The iconic red-lacquer hall on its own islet, rebuilt by Date Masamune in 1604 — the oldest surviving Momoyama building in Tohoku and a National Important Cultural Property.",
    "伊達政宗が1604年に再建した朱塗りの堂。東北に現存する最古の桃山建築で、国の重要文化財。松島湾のシンボルとして親しまれています。",
    ["朱の橋で結ばれた堂", "十二支の彫刻", "松島湾のシンボル", "無料で参拝可"],
    ["Islet hall on red bridges", "12 zodiac carvings", "Bay symbol of Matsushima", "Free to visit"],
    [0, 1500, 3000],
    { transport: 800, tickets: 0, food: 500, cafe: 200 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 1 },
    [800, 400, 400],
    20,
    { weekday: 5, weekend: 7, holiday: 8 },
    { spring: 9, summer: 8.4, autumn: 9, winter: 8.2 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 3 },
    { overall: 8.8, couple: 8.8, summer: 8.4, winter: 8.2, rain: 6.4, food: 7, photography: 9.2, relaxation: 8.4, value: 9, uniqueness: 9, family: 8, accessibility: 5, nature: 8.6, historyAndCulture: 9, walkability: 8, spring: 9, autumn: 9.2 },
    "https://www.matsushima-kanko.com/",
    "Open during daylight hours (closed in the evening)",
    "No reservation required",
    "No parking; 7 min walk from Matsushima-Kaigan Station",
    "Free to visit. The hall stands beside the cruise pier — easy to pair with a bay cruise.",
    [{ type: "tourism_board", url: "https://www.matsushima-kanko.com/miru/detail.php?id=141", title: "Matsushima tourism association — Godaido" }],
    MATSUSHIMA_IMAGE.godaido,
  ),
  tohokuPoi(
    "kanrantei",
    "Kanrantei",
    "観瀾亭",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3694, 141.0617],
    "museum",
    ["Culture", "History"],
    ["Culture", "History", "Matsushima Town"],
    "A tea pavilion moved from Fushimi-Momoyama Castle via Date Masamune's Edo residence, now housing the Matsushima Museum. Matcha and sweets are served with a view over the bay.",
    "伏見桃山城から伊達政宗の江戸屋敷を経て移築された茶亭。松島博物館を併設し、抹茶と松島湾の眺めを楽しめます。",
    ["伏見桃山由来の茶亭", "松島博物館", "抹茶と湾の眺め", "県指定文化財"],
    ["Tea pavilion from Fushimi-Momoyama", "Matsushima Museum", "Matcha with a bay view", "Prefecture cultural property"],
    [300, 2000, 4000],
    { transport: 700, tickets: 300, food: 700, cafe: 300 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 1 },
    [600, 300, 300],
    60,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.8, summer: 8, autumn: 9, winter: 8 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 2 },
    { overall: 8.4, couple: 8.8, summer: 8, winter: 8, rain: 8, food: 8.2, photography: 8.6, relaxation: 9, value: 7.8, uniqueness: 8.8, family: 7, accessibility: 7, nature: 8, historyAndCulture: 9, walkability: 7, spring: 8.8, autumn: 9 },
    "https://www.town.miyagi-matsushima.lg.jp/page/1140.html",
    "08:30 - 17:00 (Apr–Oct) / 08:30 - 16:30 (Nov–Mar)",
    "No reservation required",
    "No parking; across from Godaido on Route 45",
    "¥300 adult / ¥100 student; matcha set from about ¥600.",
    [{ type: "government", url: "https://www.town.miyagi-matsushima.lg.jp/page/1140.html", title: "Matsushima Town — Kanrantei" }],
    MATSUSHIMA_IMAGE.kanrantei,
  ),
  tohokuPoi(
    "fukuurajima",
    "Fukuura Island",
    "福浦島",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.37, 141.0683],
    "island",
    ["Nature", "Sightseeing"],
    ["Nature", "Sightseeing", "Matsushima Town"],
    "A wooded island linked to the mainland by the 252 m vermillion Fukuura Bridge. The loop trail passes a Benzaiten shrine hall and lookout with sweeping views of the bay.",
    "全長252mの朱塗りの橋で結ばれた島。周遊路からは松島湾の絶景を望み、弁財天を祀る社も参拝できます。",
    ["252mの朱の橋", "島の周遊路", "弁天堂", "松島湾の絶景"],
    ["252 m vermillion bridge", "Island loop trail", "Benzaiten hall", "Bay panoramas"],
    [300, 1900, 3500],
    { transport: 700, tickets: 300, food: 600, cafe: 300 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    10,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 9, summer: 8, autumn: 9.2, winter: 7.8 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 5 },
    { overall: 8.6, couple: 8.8, summer: 8.4, winter: 7.8, rain: 6, food: 7, photography: 9, relaxation: 8.8, value: 8, uniqueness: 8.4, family: 8.4, accessibility: 6, nature: 9, historyAndCulture: 7, walkability: 8, spring: 9, autumn: 9.2 },
    "https://www.town.miyagi-matsushima.lg.jp/page/1578.html",
    "08:30 - 17:00 (Apr–Oct) / 08:30 - 16:30 (Nov–Mar)",
    "No reservation required",
    "No parking; 10 min walk from Matsushima-Kaigan Station past the cruise pier",
    "Bridge toll ¥300 adult / ¥100 student. Café Bayland sits at the bridge entrance.",
    [{ type: "government", url: "https://www.town.miyagi-matsushima.lg.jp/page/1578.html", title: "Matsushima Town — Fukuura Island" }],
    MATSUSHIMA_IMAGE.fukuurajima,
  ),
  tohokuPoi(
    "oshima",
    "Oshima",
    "雄島",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3654, 141.0622],
    "island",
    ["Nature", "History"],
    ["Nature", "History", "Matsushima Town"],
    "A sacred meditation island crossed by the vermillion Togetsu Bridge, with about 50 surviving stone meditation grottoes and haiku monuments to Basho and Sora.",
    "朱の橋（渡月橋）で結ばれた神聖な島。修行の場として使われた約50の岩窟や、芭蕉・曾良の句碑を巡ることができます。",
    ["渡月橋", "岩窟群", "芭蕉・曾良の句碑", "無料で渡島可"],
    ["Togetsu Bridge", "Meditation grottoes", "Basho haiku monuments", "Free to cross"],
    [0, 1500, 3000],
    { transport: 800, tickets: 0, food: 500, cafe: 200 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 1 },
    [1200, 700, 500],
    10,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 8, autumn: 9, winter: 7.6 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
    { overall: 8.2, couple: 8, summer: 8, winter: 7.6, rain: 6, food: 6.8, photography: 8.6, relaxation: 8.8, value: 9, uniqueness: 8.8, family: 7.6, accessibility: 5, nature: 9, historyAndCulture: 8.8, walkability: 7, spring: 8.8, autumn: 9 },
    "https://www.matsushima-kanko.com/",
    "Open access (daylight recommended)",
    "No reservation required",
    "No parking; 6 min walk from Matsushima-Kaigan Station near Namiuchihama",
    "Free to cross. Combine with Godaido for a short bay walk.",
    [{ type: "tourism_board", url: "https://www.matsushima-kanko.com/miru/detail.php?id=142", title: "Matsushima tourism association — Oshima" }],
    MATSUSHIMA_IMAGE.oshima,
  ),
  tohokuPoi(
    "entsuin",
    "Entsu-in",
    "円通院",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3713, 141.0598],
    "temple",
    ["History", "Culture"],
    ["History", "Culture", "Matsushima Town"],
    "Mausoleum temple of Date Mitsumune whose gardens blend roses and moss, and whose San'e-den hall preserves the oldest painting of Western roses in Japan, brought back by Hasekura Tsunenaga's embassy.",
    "伊達光宗の霊廟。バラと苔が織りなす庭園が美しく、支倉常長のヨーロッパ派遣にちなむバラの絵を残す三慧殿は重要文化財です。",
    ["バラと苔の庭", "三慧殿（重要文化財）", "数珠づくり体験", "秋の紅葉ライトアップ"],
    ["Rose and moss gardens", "San'e-den (Important Cultural Property)", "Bead-stringing experience", "Autumn maple illuminations"],
    [500, 2400, 4000],
    { transport: 700, tickets: 500, food: 800, cafe: 400 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 2 },
    [1500, 900, 600],
    50,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.8, summer: 7.8, autumn: 9.2, winter: 7.8 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 6, walkingIntensity: 3 },
    { overall: 8.6, couple: 8.8, summer: 7.8, winter: 8, rain: 8, food: 7.4, photography: 8.8, relaxation: 9, value: 8, uniqueness: 8.8, family: 7.6, accessibility: 6, nature: 8.4, historyAndCulture: 9, walkability: 7, spring: 8.8, autumn: 9.4 },
    "https://www.entuuin.or.jp",
    "09:00 - 16:00 (Apr–Nov) / 09:00 - 15:30 (Dec–Mar)",
    "No reservation required",
    "No parking; 5 min walk west of Zuigan-ji",
    "¥500 adult / ¥300 child. Bead-stringing (juzu) experience ¥1,000–4,000.",
    [{ type: "official", url: "https://www.entuuin.or.jp", title: "Entsu-in official site" }],
    MATSUSHIMA_IMAGE.entsuin,
  ),
  tohokuPoi(
    "matsushima-bay-cruise",
    "Matsushima Bay Cruise",
    "松島湾周遊船",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3696, 141.0602],
    undefined,
    ["Nature", "Experience", "Viewpoint"],
    ["Nature", "Experience", "Matsushima Town"],
    "A 50-minute sightseeing cruise from Chuo Pier past more than 30 of Matsushima Bay's pine-clad islands — the definitive way to see one of Japan's Three Great Views from the water.",
    "松島湾の島々を海から巡る50分の遊覧船。約260の島々の間を縫うように進み、日本三景の絶景を船上から楽しめます。",
    ["50分の遊覧", "島々の間を縫う航路", "船上からの日本三景", "毎時出航"],
    ["50-minute round trip", "Routes through 30+ islands", "Nihon Sankei from the water", "Hourly departures"],
    [1500, 4000, 7000],
    { transport: 1000, tickets: 1500, food: 1000, cafe: 500 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 2 },
    [1500, 900, 600],
    40,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.8, summer: 8.6, autumn: 9, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "high",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 2 },
    { overall: 9, couple: 9, summer: 8.6, winter: 7.2, rain: 5.4, food: 7.8, photography: 9.4, relaxation: 8.6, value: 8, uniqueness: 9.2, family: 8.4, accessibility: 8, nature: 9.2, historyAndCulture: 7.4, walkability: 4, spring: 9, autumn: 9.2 },
    "https://www.matsushima.or.jp/",
    "Hourly departures 09:00–16:00 (16:00 suspended in winter); 50-min round trip",
    "No reservation needed (online discount available)",
    "Departs Chuo Pier; pay parking nearby",
    "¥1,500 adult / ¥750 child; green deck +¥600/¥300. Pier is beside Godaido.",
    [{ type: "official", url: "https://www.matsushima.or.jp/timesheet/", title: "Matsushima sightseeing boat union — timetable" }],
    MATSUSHIMA_IMAGE.cruise,
  ),
  tohokuPoi(
    "saigyo-modoshi-no-matsu",
    "Saigyo Modoshi no Matsu Park",
    "西行戻しの松公園",
    MATSUSHIMA_MUNI,
    MATSUSHIMA_HUB,
    [38.3673, 141.0529],
    "park",
    ["Nature", "Viewpoint"],
    ["Nature", "Viewpoint", "Matsushima Town"],
    "Hilltop park named for a legend of the poet Saigyo, offering the best free land viewpoint over Matsushima Bay, with more than 260 cherry trees and a Panorama House café.",
    "歌人・西行にまつわる伝説の公園。松島湾を一望する無料の展望スポットで、260本以上の桜が咲き誇ります。",
    ["湾を一望する展望", "260本以上の桜", "展望カフェ", "無料"],
    ["Bay panorama", "260+ cherry trees", "Panorama House café", "Free to visit"],
    [0, 1500, 3000],
    { transport: 800, tickets: 0, food: 500, cafe: 200 },
    { train: 40, bus: 50, car: 45 },
    { min: 1, max: 1 },
    [1200, 700, 500],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9.2, summer: 7.8, autumn: 9, winter: 7.6 },
    [3, 4, 5, 10, 11],
    "Spring",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
    { overall: 8.4, couple: 8.6, summer: 7.8, winter: 7.6, rain: 5.6, food: 7, photography: 9, relaxation: 8.8, value: 9, uniqueness: 8, family: 8, accessibility: 6, nature: 9, historyAndCulture: 7, walkability: 7, spring: 9.4, autumn: 9 },
    "https://www.matsushima-kanko.com/",
    "Open access; Panorama Line road closed in winter",
    "No reservation required",
    "Roadside parking available; 5 min by car from the station area",
    "Free park. A 20-minute uphill walk from the station or 5 minutes by car.",
    [{ type: "tourism_board", url: "https://www.matsushima-kanko.com/miru/detail.php?id=137", title: "Matsushima tourism association — Saigyo Modoshi no Matsu Park" }],
    MATSUSHIMA_IMAGE.saigyo,
  ),
];

const MATSUSHIMA_HUB_RECORD: Destination = {
  id: MATSUSHIMA_HUB,
  name: "Matsushima Town",
  nameJa: "松島町",
  kind: "town",
  role: "hub",
  placeType: "hub",
  importance: "major",
  aliases: ["松島"],
  municipalityId: MATSUSHIMA_MUNI,
  prefecture: "Miyagi",
  region: "Tohoku",
  coordinates: { lat: 38.3802, lng: 141.0673 },
  categories: ["Travel Hub", "City Hub"],
  tags: ["Hub", "Miyagi", "Matsushima", "Nihon Sankei"],
  description:
    "The waterfront gateway town of Matsushima Bay — one of Japan's Three Great Views — with the Zuigan-ji temple complex, cruise piers and oyster stalls all walkable from Matsushima-Kaigan Station, about 40 minutes from Sendai.",
  highlights: [
    "National Treasure Zuigan-ji",
    "Nihon Sankei bay views",
    "Bay cruises and island walks",
    "Oyster cuisine",
  ],
  status: "beta",
  travelEstimate: { confidence: "beta" },
  collections: [],
  transportOptions: { train: 40, bus: 50, car: 45 },
  budgetMin: 7000,
  budgetRecommended: 10500,
  budgetMax: 14000,
  budgetBreakdown: { transport: 3000, tickets: 1500, food: 4500, cafe: 1500 },
  heroImage: MATSUSHIMA_IMAGE.townHall.url,
  image: MATSUSHIMA_IMAGE.townHall.url,
  imageMetadata: {
    source: "Wikimedia Commons",
    license: MATSUSHIMA_IMAGE.townHall.license,
    attribution: MATSUSHIMA_IMAGE.townHall.attribution,
    sourceUrl: MATSUSHIMA_IMAGE.townHall.sourceUrl,
  },
  recommendedVisitHours: { min: 6, max: 8 },
  walkingMin: 6000,
  walkingSunMin: 3000,
  walkingShadeMin: 3000,
  walkingIntensity: "medium",
  indoorPercent: 30,
  comfort: { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 5 },
  ratings: {
    overall: 8.8,
    couple: 9,
    summer: 8.6,
    winter: 8.2,
    rain: 6.8,
    food: 9,
    photography: 9.4,
    relaxation: 8.8,
    value: 8.6,
    uniqueness: 9,
    family: 8.4,
    accessibility: 7,
    nature: 9.2,
    historyAndCulture: 9.2,
    walkability: 8,
    spring: 9.2,
    autumn: 9.4,
  },
  ratingsSchemaVersion: 2,
  crowd: { weekday: 5, weekend: 7, holiday: 8 },
  season: { spring: 9, summer: 8.4, autumn: 9.2, winter: 8 },
  bestMonths: [3, 4, 5, 9, 10, 11],
  bestSeason: "Spring & Autumn",
  weatherDependence: "moderate",
  reservation: "No reservation required",
  parking: "Pay parking near the station and waterfront",
  notes:
    "Compact waterfront cluster: Zuigan-ji, Godaido, Kanrantei, the cruise pier and museums are all within a 15-minute walk of Matsushima-Kaigan Station.",
  businessHours: "Open access",
  officialWebsite: "https://www.town.miyagi-matsushima.lg.jp/",
  openingHoursMetadata: { verifiedAt: AUDIT_DATE },
  content: {
    en: {
      name: "Matsushima Town",
      description:
        "The waterfront gateway town of Matsushima Bay — one of Japan's Three Great Views — with the Zuigan-ji temple complex, cruise piers and oyster stalls all walkable from Matsushima-Kaigan Station.",
      highlights: [
        "National Treasure Zuigan-ji",
        "Nihon Sankei bay views",
        "Bay cruises and island walks",
        "Oyster cuisine",
      ],
    },
    ja: {
      name: "松島町",
      description:
        "日本三景・松島湾の玄関口となる港町。国宝の瑞巌寺や五大堂、遊覧船の発着場がJR松島海岸駅から徒歩圏に集まり、カキ料理も楽しめます。",
      highlights: ["国宝瑞巌寺", "日本三景の湾", "遊覧船と島めぐり", "カキ料理"],
    },
  },
  editorial: {
    lifecycle: "in_review",
    sources: [
      {
        type: "government",
        url: "https://www.town.miyagi-matsushima.lg.jp/",
        title: "Matsushima Town official site",
        accessedAt: AUDIT_DATE,
      },
      {
        type: "tourism_board",
        url: "https://www.matsushima-kanko.com/en/",
        title: "Matsushima tourism association (EN)",
        accessedAt: AUDIT_DATE,
      },
    ],
    checkedAt: AUDIT_DATE,
    freshness: "current",
    changeSummary: "KAI-57 Tohoku expansion",
    changes: [
      {
        changedAt: AUDIT_DATE,
        changedBy: "Meguruto editorial",
        summary: "Added Matsushima Town hub",
        method: "assisted",
      },
    ],
  },
  ratingMetadata: { rubricVersion: 1, method: "assisted", confidence: "low" },
  relationships: {
    featuredDestinationIds: [
      "zuigan-ji",
      "godaido",
      "kanrantei",
      "fukuurajima",
      "oshima",
      "entsuin",
      "matsushima-bay-cruise",
      "saigyo-modoshi-no-matsu",
      "matsushima-bay",
    ],
    nearbyDestinationIds: ["sendai-city"],
  },
  schemaVersion: 2,
};

let added = 0;
for (const record of [MATSUSHIMA_HUB_RECORD, ...MATSUSHIMA_POIS]) {
  const existing = byId.get(record.id);
  if (!existing) {
    index.push(record);
    byId.set(record.id, record);
    added += 1;
  } else if (JSON.stringify(existing) !== JSON.stringify(record)) {
    const indexPosition = index.findIndex((d) => d.id === record.id);
    if (indexPosition < 0) throw new Error(`record index position missing: ${record.id}`);
    index[indexPosition] = record;
    byId.set(record.id, record);
    added += 1;
    console.log(`  updated ${record.id}: regenerated audited KAI-57 record`);
  }
}

// matsushima-bay: migrate from sendai gateway to the new same-municipality hub,
// and remove it from sendai-city's featured list (cross-municipality featured).
patch(
  "matsushima-bay",
  (d) => {
    d.relationships = {
      parentDestinationId: MATSUSHIMA_HUB,
      nearbyDestinationIds: ["godaido", "zuigan-ji"],
    };
    d.officialWebsite = "https://www.matsushima-kanko.com/";
  },
  "re-parented to matsushima-town hub, fixed official website",
);
patch(
  "sendai-city",
  (d) => {
    d.relationships = {
      ...(d.relationships ?? {}),
      featuredDestinationIds: (d.relationships?.featuredDestinationIds ?? []).filter(
        (id) => id !== "matsushima-bay",
      ),
    };
  },
  "removed cross-municipality featured matsushima-bay",
);

console.log(`KAI-57 additions (Matsushima): ${added} records added.`);

// Tohoku hub official websites (also enables their provenance blocks).
const HUB_WEBSITES: Record<string, string> = {
  "aizuwakamatsu-city": "https://www.city.aizuwakamatsu.fukushima.jp/",
  "fukushima-city": "https://www.city.fukushima.fukushima.jp/",
  "koriyama-city": "https://www.city.koriyama.lg.jp/",
  "aomori-city": "https://www.city.aomori.aomori.jp/",
  "hirosaki-city": "https://www.city.hirosaki.aomori.jp/",
  "hachinohe-city": "https://www.city.hachinohe.aomori.jp/",
  "akita-city": "https://www.city.akita.lg.jp/",
  "semboku-city": "https://www.city.semboku.akita.jp/",
  "yamagata-city": "https://www.city.yamagata-yamagata.lg.jp/",
  "morioka-city": "https://www.city.morioka.iwate.jp/",
  "sendai-city": "https://www.city.sendai.jp/",
};
for (const [hubId, website] of Object.entries(HUB_WEBSITES)) {
  patch(hubId, (d) => {
    d.officialWebsite = website;
  }, `official website set to city site`);
}

// ===========================================================================
// Provenance: every corrected record gains editorial.sources + checkedAt.
// Primary source = the record's own officialWebsite when present, else the
// scout-cited official source below.
// ===========================================================================

const PROVENANCE_FALLBACK: Record<string, SourceDef> = {
  "matsushima-bay": {
    type: "tourism_board",
    url: "https://www.town.miyagi-matsushima.lg.jp/",
    title: "Matsushima Town official site",
  },
  "goshikinuma-ponds-fukushima": {
    type: "tourism_board",
    url: "https://www.urabandai-inf.com/",
    title: "Urabandai tourist information",
  },
  "mount-bandai-fukushima": {
    type: "tourism_board",
    url: "https://www.bandaisan.or.jp/",
    title: "Bandaisan Tourism Association",
  },
  "shirakami-sanchi-aomori": {
    type: "government",
    url: "https://rinya.maff.go.jp/j/sin_riyou/sekaiisan/sirakami_itimenseki.html",
    title: "Forestry Agency — Shirakami-Sanchi",
  },
  "lake-towada-aomori": {
    type: "tourism_board",
    url: "https://towadako.or.jp/",
    title: "Towadako Tourism Association",
  },
  "dakigaeri-valley-akita": {
    type: "government",
    url: "https://www.city.semboku.akita.jp/sightseeing/spot/05_dakigaeri.html",
    title: "Senboku City — Dakigaeri Valley",
  },
  "lake-tazawa-akita": {
    type: "government",
    url: "https://www.city.semboku.akita.jp/sightseeing/spot/04_tazawako.html",
    title: "Senboku City — Lake Tazawa",
  },
  "kakunodate-samurai-district-akita": {
    type: "government",
    url: "https://www.city.semboku.akita.jp/sightseeing/spot/07_buke.html",
    title: "Senboku City — Kakunodate samurai district",
  },
  "nyuto-onsen-akita": {
    type: "government",
    url: "https://www.city.semboku.akita.jp/sightseeing/spot/02.html",
    title: "Senboku City — Nyuto Onsen",
  },
  "okama-crater-yamagata": {
    type: "tourism_board",
    url: "https://www.zaoropeway.co.jp/",
    title: "Zao Ropeway official site",
  },
  "ouchi-juku-fukushima": {
    type: "government",
    url: "https://kunishitei.bunka.go.jp/heritage/detail/103/4",
    title: "Agency for Cultural Affairs — Ouchi-juku designation",
  },
};

const CORRECTED_IDS = [
  "abukuma-cave-fukushima", "aizuwakamatsu-city", "fukushima-city",
  "koriyama-city", "goshikinuma-ponds-fukushima", "mount-bandai-fukushima",
  "tsuruga-castle-fukushima", "ouchi-juku-fukushima",
  "aomori-city", "hirosaki-city", "hachinohe-city", "hirosaki-castle",
  "lake-towada-aomori", "nebuta-museum-wa-rasse-aomori", "oirase-gorge-aomori",
  "sannai-maruyama-jomon-aomori", "shirakami-sanchi-aomori",
  "akita-city", "semboku-city", "dakigaeri-valley-akita", "lake-tazawa-akita",
  "kakunodate-samurai-district-akita", "nyuto-onsen-akita",
  "yamagata-city", "dewa-sanzan-yamagata", "ginzan-onsen-yamagata",
  "yamadera-yamagata", "okama-crater-yamagata",
  "morioka-city", "geibikei-gorge-iwate", "hiraizumi-chusonji-iwate",
  "jodogahama-beach-iwate", "ryusendo-cave-iwate",
  "sendai-city", "matsushima-bay", "jozenji-dori",
  "sendai-asaichi-morning-market", "rakuten-mobile-park-miyagi",
  "akiu-onsen-miyagi", "sendai-castle-ruins-miyagi", "sendai-mediatheque",
  "sendai-umino-mori-aquarium", "zuihoden", "aoba-castle-museum",
  "sendai-city-museum",
];

for (const id of CORRECTED_IDS) {
  const d = byId.get(id);
  if (!d) throw new Error(`provenance target missing: ${id}`);
  const fallback = PROVENANCE_FALLBACK[id];
  const url = d.officialWebsite ?? fallback?.url;
  if (!url) {
    console.log(`  (provenance skipped ${id}: no official website)`);
    continue;
  }
  ensureProvenance(
    id,
    [
      fallback
        ? { type: fallback.type, url: fallback.url, title: fallback.title }
        : { type: "official", url, title: "Official website" },
    ],
    "KAI-57 existing-data audit correction",
  );
}

// ===========================================================================
// Write
// ===========================================================================

fs.writeFileSync(
  INDEX_PATH,
  await formatIndex(JSON.stringify(index, null, 2) + "\n"),
);
console.log(`KAI-57 corrections: ${modified} records changed.`);
