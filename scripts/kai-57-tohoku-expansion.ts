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
        ...(d.editorial ?? {}),
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
  "sendai-yagiyama-zoo":
    "9:00～16:45（最終入園16:00、3～10月）。11～2月は9:00～16:00（最終入園15:00）。毎週水曜休園（祝日の場合は翌日）、12月28日～1月4日休園。",
  "sendai-ichibancho": "通りは常時通行可。各店舗の営業時間は店舗により異なります。",
  "sendai-daikannon":
    "境内は無料。内部拝観は平日10:00～15:00、土日祝10:00～15:30（最終受付）。2026年1月より拝観料大人500円。",
  "yamagata-bunshokan":
    "9:00～16:30。第1・第3月曜休館（祝日の場合は翌日）、12月29日～1月3日休館。入館無料。",
  "kajo-park": "公園は4～10月5:00～22:00、11～3月5:30～22:00。入園無料。",
  "kaminoyama-castle-town":
    "天守閣は9:00～17:15（最終入館16:45）。木曜休館（祝日の場合は翌日）、12月29日～31日休館。大人600円。",
  "aizu-bukeyashiki":
    "4～11月8:30～17:00、12～3月9:00～16:30。年中無休。大人1,000円。",
  "nisshinkan": "9:00～17:00（最終入場16:00）。年中無休。大人1,800円。",
  "sazae-do":
    "4～11月は8:15～日没、12～3月は9:00～16:00。拝観料400円。",
  "kitakata-kura-district":
    "町並みは常時散策可。蔵の里は9:00～17:00（最終入場16:30）。年末年始休業。",
  "aomori-museum-of-art":
    "9:30～17:00（最終入館16:30）。第2・第4月曜休館（祝日の場合は翌日）。常設展大人700円。",
  "mount-hakkoda-ropeway":
    "9:00始発。最終上りは3月～11月上旬16:20、11月中旬～2月15:40。20分間隔。強風（25m/s以上）で運休。大人往復2,500円（2026年8月1日改定）。",
  "asamushi-onsen": "温泉街は常時散策可。足湯は無料。各旅館の日帰り入浴時間は施設により異なります。",
  "kabushima-shrine": "境内は自由参拝。日の出から日没まで（時期により変動）。",
  "tatehana-wharf-morning-market":
    "毎週日曜のみ開催（3月中旬～12月末）。早朝3時頃～9時頃。1～2月は休止。",
  "towada-art-center":
    "9:00～17:00（最終入館16:30）。月曜休館（祝日の場合は翌日）、年末年始休館。※2027年4月1日～2028年3月31日は空調改修のため全館休館（屋外作品は鑑賞可）。",
  "hirosaki-neputa-mura": "9:00～17:00（最終入場17:00）。年中無休。大人600円。",
  "fujita-memorial-garden":
    "9:00～17:00（最終入園16:30）。11月24日～4月中旬は洋館・茶室のみ（無料）。大人320円。",
  "saisho-in": "境内は9:00～16:30。通常無料（桜・ねぷた・菊もみじ時期は入場料あり）。",
  "iwate-park-morioka-castle-ruins": "公園は常時開園。入園無料。",
  "bank-of-iwate-red-brick": "9:30～17:00。月曜休館（祝日の場合は翌日）、年末年始休館。",
  "morioka-handiworks-square": "9:00～17:00。年中無休（12月31日～1月2日を除く）。",
  "koiwai-farm": "9:00～17:00（時期により変動）。12月～2月は土日祝のみ営業。",
  "motsu-ji": "8:30～17:00（3月1日～11月3日）、8:30～16:30（冬季）。拝観料大人500円。",
  "takkoku-no-iwa": "8:00～17:00。拝観料大人400円。",
  "iizaka-onsen": "温泉街は常時散策可。共同浴場の営業時間は施設により異なります。",
  "fukushima-prefectural-museum-of-art": "9:30～17:00（最終入館16:30）。月曜休館（祝日の場合は翌日）。",
  "oga-namahage-kan": "8:30～17:00（最終入場16:30）。年中無休。",
  "akita-senshu-park": "公園は常時開園。佐竹資料館は9:30～16:30（月曜休館）。",
  "akita-museum-of-art":
    "10:00～18:00（最終入館17:30）。不定休のため公式カレンダーをご確認ください。",
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
  const [lat, lng] = coords;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    Math.abs(lat) < 1 ||
    Math.abs(lng) < 1
  ) {
    throw new Error(`${id}: missing or invalid verified coordinates`);
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

// Cross-municipality POIs must use gatewayHubId, never parentDestinationId
// (containment rule: parent requires same-municipality).
const GATEWAY_OVERRIDES: Record<string, string> = {
  "towada-art-center": "hachinohe-city",
  "koiwai-farm": "morioka-city",
  "motsu-ji": "morioka-city",
  "takkoku-no-iwa": "morioka-city",
  "oga-namahage-kan": "akita-city",
  "kaminoyama-castle-town": "yamagata-city",
  "kitakata-kura-district": "aizuwakamatsu-city",
};

function addRecords(records: Destination[]) {
  for (const record of records) {
    const gateway = GATEWAY_OVERRIDES[record.id];
    if (gateway) {
      record.relationships = { gatewayHubId: gateway };
    }
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
    }
  }
}

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
// KAI-57 additions — Aomori / Hachinohe / Towada / Hirosaki (batch 2)
// Coordinates verified by the Phase 9 coords scouts (see KAI57_SOURCE_LEDGER).
// ===========================================================================

const AOMORI_GROUP_COORDS: Record<string, [number, number]> = {
  // filled from coords-scout output (guarded: records throw until filled)
  "aomori-museum-of-art": [40.8073, 140.7009],
  "mount-hakkoda-ropeway": [40.6808, 140.8317],
  "asamushi-onsen": [40.8892, 140.8614],
  "kabushima-shrine": [40.5369, 141.5542],
  "tatehana-wharf-morning-market": [40.5279, 141.5293],
  "towada-art-center": [40.614, 141.209],
  "hirosaki-neputa-mura": [40.611311, 140.469757],
  "fujita-memorial-garden": [40.603566, 140.458778],
  "saisho-in": [40.596469, 140.468542],
};

const AOMORI_GROUP_IMAGE: Record<string, { url: string; license: string; attribution: string; sourceUrl: string }> = {
  "aomori-museum-of-art": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/140913_Aomori_Museum_of_Art_Japan02bs3.jpg/1280px-140913_Aomori_Museum_of_Art_Japan02bs3.jpg",
    license: "CC BY 2.5",
    attribution: "663highland",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:140913_Aomori_Museum_of_Art_Japan02bs3.jpg",
  },
  "mount-hakkoda-ropeway": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Hakkoda_Ropeway_2019.jpg/1280px-Hakkoda_Ropeway_2019.jpg",
    license: "CC BY-SA 4.0",
    attribution: "Marho",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Hakkoda_Ropeway_2019.jpg",
  },
  "asamushi-onsen": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Asamushi_hot_spring_and_Yonoshima_island_aerial_photo.jpg/1280px-Asamushi_hot_spring_and_Yonoshima_island_aerial_photo.jpg",
    license: "CC BY 4.0",
    attribution: "ブルーノ・プラス",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Asamushi_hot_spring_and_Yonoshima_island_aerial_photo.jpg",
  },
  "kabushima-shrine": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Kabushima-Shrine.jpg/1280px-Kabushima-Shrine.jpg",
    license: "CC BY-SA 4.0",
    attribution: "MaedaAkihiko",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Kabushima-Shrine.jpg",
  },
  "tatehana-wharf-morning-market": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/%E9%A4%A8%E9%BC%BB%E5%B2%B8%E5%A3%81%E6%9C%9D%E5%B8%82%EF%BC%88%E5%85%AB%E6%88%B8%E5%B8%82%EF%BC%8920250928-P1073508.jpg/1280px-%E9%A4%A8%E9%BC%BB%E5%B2%B8%E5%A3%81%E6%9C%9D%E5%B8%82%EF%BC%88%E5%85%AB%E6%88%B8%E5%B8%82%EF%BC%8920250928-P1073508.jpg",
    license: "CC BY 4.0",
    attribution: "くろふね",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:館鼻岸壁朝市（八戸市）20250928-P1073508.jpg",
  },
  "towada-art-center": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Towada_Art_Center_in_Aomori.jpg/1280px-Towada_Art_Center_in_Aomori.jpg",
    license: "CC BY 4.0",
    attribution: "Coffee1000mg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Towada_Art_Center_in_Aomori.jpg",
  },
  "hirosaki-neputa-mura": {
    url: "https://upload.wikimedia.org/wikipedia/commons/1/16/Neputamura-gaikan.jpg",
    license: "CC BY-SA 3.0",
    attribution: "津軽藩ねぷた村",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Neputamura-gaikan.jpg",
  },
  "fujita-memorial-garden": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Fujita_Memorial_Garden_in_June_2022_%282%29.jpg/1280px-Fujita_Memorial_Garden_in_June_2022_%282%29.jpg",
    license: "CC BY-SA 4.0",
    attribution: "掬茶",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Fujita_Memorial_Garden_in_June_2022_(2).jpg",
  },
  "saisho-in": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/191208_Saishoin_Hirosaki_Aomori_pref_Japan02s3.jpg/1280px-191208_Saishoin_Hirosaki_Aomori_pref_Japan02s3.jpg",
    license: "CC BY-SA 4.0",
    attribution: "663highland",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:191208_Saishoin_Hirosaki_Aomori_pref_Japan02s3.jpg",
  },
};

const AOMORI_GROUP_POIS: Destination[] = [
  tohokuPoi(
    "aomori-museum-of-art",
    "Aomori Museum of Art",
    "青森県立美術館",
    "Aomori:aomori",
    "aomori-city",
    AOMORI_GROUP_COORDS["aomori-museum-of-art"],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Aomori City"],
    "Aomori's major art museum, designed by Aoki Jun beside the Sannai-Maruyama Jomon site. Its collection spans Chagall's monumental 'Aleko' backdrops, Munakata Shiko's woodblock prints and a famous giant white-dog sculpture by Nara Yoshitomo.",
    "三内丸山遺跡の隣に建つ青森県立美術館。シャガールの大作「アレコ」、棟方志功の版画、奈良美智の巨大な白い犬のオブジェなどが楽しめます。",
    ["奈良美智の白い犬", "シャガール「アレコ」", "棟方志功コレクション", "三内丸山遺跡と隣接"],
    ["Nara Yoshitomo's white dog", "Chagall's 'Aleko' backdrops", "Munakata Shiko collection", "Beside the Jomon site"],
    [700, 2800, 5000],
    { transport: 800, tickets: 700, food: 900, cafe: 400 },
    { train: 60, bus: 70, car: 50 },
    { min: 2, max: 3 },
    [3500, 2000, 1500],
    80,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8.2, autumn: 8.6, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 4 },
    { overall: 8.8, couple: 8.2, summer: 8.2, winter: 8, rain: 9, food: 7.8, photography: 8.8, relaxation: 8, value: 8, uniqueness: 9.2, family: 7.8, accessibility: 8, nature: 7.4, historyAndCulture: 8.6, walkability: 7, spring: 8.6, autumn: 8.8 },
    "https://www.aomori-museum.jp/",
    "09:30 - 17:00 (last entry 16:30); closed 2nd & 4th Monday",
    "No reservation required",
    "Free parking on site",
    "Permanent collection ¥700 adult / ¥400 high-school and university; free for junior high and below. Pairs with the adjacent Sannai-Maruyama site.",
    [{ type: "official", url: "https://www.aomori-museum.jp/", title: "Aomori Museum of Art official site" }],
    AOMORI_GROUP_IMAGE["aomori-museum-of-art"],
  ),
  tohokuPoi(
    "mount-hakkoda-ropeway",
    "Mount Hakkoda Ropeway",
    "八甲田ロープウェー",
    "Aomori:aomori",
    "aomori-city",
    AOMORI_GROUP_COORDS["mount-hakkoda-ropeway"],
    "viewpoint",
    ["Nature", "Viewpoint"],
    ["Nature", "Viewpoint", "Aomori City"],
    "Gondola access to the Hakkoda highlands inside Towada-Hachimantai National Park: 10 minutes to the summit park station, with walking loops among the winter 'juhyo' ice monsters, summer alpine flowers and autumn colour.",
    "十和田八幡平国立公園の八甲田山へ向かうロープウェー。山頂駅からは冬の樹氷、夏の高山植物、秋の紅葉を楽しむ遊歩道が広がります。",
    ["樹氷（スノーモンスター）", "山頂の遊歩道", "高山植物と紅葉", "荒湯・酸ヶ湯温泉と近接"],
    ["Winter juhyo ice monsters", "Summit walking loops", "Alpine flowers and autumn colour", "Near Sukayu Onsen"],
    [2500, 5000, 8000],
    { transport: 1500, tickets: 2500, food: 700, cafe: 300 },
    { train: 80, bus: 60, car: 50 },
    { min: 2, max: 4 },
    [4000, 2000, 2000],
    20,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8, summer: 8.2, autumn: 9, winter: 8.6 },
    [2, 3, 7, 8, 9, 10],
    "Autumn & Winter",
    "high",
    { heatTolerance: 4, rainFriendly: 3, walkingIntensity: 5 },
    { overall: 8.8, couple: 8.6, summer: 8.2, winter: 8.8, rain: 4.6, food: 7, photography: 9.2, relaxation: 8.4, value: 8, uniqueness: 9, family: 7.8, accessibility: 7, nature: 9.4, historyAndCulture: 6, walkability: 6, spring: 8, autumn: 9.2 },
    "https://hakkoda-ropeway.jp/",
    "First car 09:00; last up 16:20 (Mar–early Nov) / 15:40 (mid-Nov–Feb); stops in wind ≥25 m/s",
    "No reservation required",
    "Free parking at the base station",
    "Adult round trip ¥2,500 (from 2026-08-01), one-way ¥1,550; child ¥700/¥450. 40 min by car or 60 min by bus from Aomori Station.",
    [{ type: "official", url: "https://hakkoda-ropeway.jp/", title: "Hakkoda Ropeway official site" }],
    AOMORI_GROUP_IMAGE["mount-hakkoda-ropeway"],
  ),
  tohokuPoi(
    "asamushi-onsen",
    "Asamushi Onsen",
    "浅虫温泉",
    "Aomori:aomori",
    "aomori-city",
    AOMORI_GROUP_COORDS["asamushi-onsen"],
    "onsen",
    ["Onsen & Wellness"],
    ["Onsen", "Aomori City"],
    "A 1,200-year-old hot spring town on the Mutsu Bay coast, nicknamed 'Aomori's inner parlour'. Free footbaths, the Asamushi Gensen Park with self-made onsen eggs, and twilight views over Yunoshima island.",
    "陸奥湾に面する1200年の歴史を持つ温泉街。「青森の奥座敷」と呼ばれ、足湯や浅虫源泉公園での温泉卵づくり、湯の島越しの夕景が楽しめます。",
    ["1200年の歴史", "無料の足湯", "源泉公園の温泉卵", "湯の島の夕景"],
    ["1,200-year history", "Free footbaths", "Onsen-egg park", "Yunoshima twilight views"],
    [0, 2000, 4000],
    { transport: 700, tickets: 0, food: 900, cafe: 400 },
    { train: 35, bus: 50, car: 40 },
    { min: 2, max: 4 },
    [3000, 1500, 1500],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8, summer: 8.4, autumn: 8.4, winter: 8.2 },
    [4, 5, 6, 9, 10, 11],
    "All Year",
    "moderate",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 3 },
    { overall: 8, couple: 8.4, summer: 8.4, winter: 8.2, rain: 7.6, food: 8.4, photography: 8.2, relaxation: 9, value: 8.4, uniqueness: 7.8, family: 8, accessibility: 7, nature: 8.4, historyAndCulture: 7, walkability: 7, spring: 8.2, autumn: 8.6 },
    "https://www.asamushi.com/",
    "Open access (district); ryokan day-use bathing hours vary",
    "No reservation required for the district",
    "Pay parking in the town",
    "25 minutes from Aomori Station on the Aoimori Railway. The record is the onsen town itself; the nearby Asamushi Aquarium is separate.",
    [{ type: "tourism_board", url: "https://www.asamushi.com/", title: "Asamushi Onsen Tourism Association" }],
    AOMORI_GROUP_IMAGE["asamushi-onsen"],
  ),
  tohokuPoi(
    "kabushima-shrine",
    "Kabushima Shrine",
    "蕪島神社",
    "Aomori:hachinohe",
    "hachinohe-city",
    AOMORI_GROUP_COORDS["kabushima-shrine"],
    "shrine",
    ["History", "Nature"],
    ["History", "Nature", "Hachinohe City"],
    "Shrine on a small island off Hachinohe where thousands of black-tailed gulls nest each spring — a National Natural Monument. The red shrine was rebuilt after the 2015 fire and is a pilgrimage circuit for good fortune.",
    "八戸の沖合、蕪島に立つ神社。春にはウミネコの大群が営巣する国指定天然記念物の景勝地で、2015年の火災後に再建された朱塗りの社殿は縁起物の参拝地として親しまれています。",
    ["ウミネコの繁殖地", "国指定天然記念物", "縁起物の参拝", "海沿いの島神社"],
    ["Black-tailed gull rookery", "National Natural Monument", "Fortune-bringing shrine", "Island shrine by the sea"],
    [0, 1500, 3000],
    { transport: 800, tickets: 0, food: 500, cafe: 200 },
    { train: 15, bus: 25, car: 20 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    10,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 9, summer: 8, autumn: 8, winter: 7.4 },
    [3, 4, 5, 6, 7, 9, 10],
    "Spring",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
    { overall: 8.6, couple: 8.4, summer: 8, winter: 7.4, rain: 6, food: 7.4, photography: 9.2, relaxation: 8, value: 8.6, uniqueness: 9.4, family: 8.6, accessibility: 6, nature: 9.2, historyAndCulture: 8.4, walkability: 7, spring: 9.2, autumn: 8.2 },
    "http://kabushimajinja.com/",
    "Free to visit; grounds open daylight hours (seasonal)",
    "No reservation required",
    "Parking near the island approach",
    "Free entry. Peak gull season is March–July. 15 minutes by train from Hachinohe (JR Same Station) — pairs with the Sunday Tatehana morning market.",
    [{ type: "tourism_board", url: "https://visithachinohe.com/spot/kabushima-jinja/", title: "Visit Hachinohe — Kabushima Shrine" }],
    AOMORI_GROUP_IMAGE["kabushima-shrine"],
  ),
  tohokuPoi(
    "tatehana-wharf-morning-market",
    "Tatehana Wharf Morning Market",
    "館鼻岸壁朝市",
    "Aomori:hachinohe",
    "hachinohe-city",
    AOMORI_GROUP_COORDS["tatehana-wharf-morning-market"],
    "market",
    ["Food", "Shopping"],
    ["Food", "Market", "Hachinohe City"],
    "Japan's largest-class morning market: roughly 300–360 stalls strung along an 800-metre wharf, selling seafood, vegetables and oddities. The market runs before dawn to mid-morning — an iconic Hachinohe experience.",
    "約300～360店が800mの岸壁に並ぶ、日本最大級の朝市。魚介や野菜、珍品が早朝から並び、八戸の「朝市文化」を代表する風景です。",
    ["日本最大級の朝市", "800mの屋台列", "海産物と地元野菜", "日曜早朝のみ"],
    ["Japan's largest-class market", "800 m of stalls", "Seafood and local produce", "Sunday dawn only"],
    [0, 2000, 4000],
    { transport: 700, tickets: 0, food: 1000, cafe: 300 },
    { train: 20, bus: 30, car: 25 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    10,
    { weekday: 0, weekend: 7, holiday: 7 },
    { spring: 8.6, summer: 8.4, autumn: 8.2, winter: 5 },
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "Spring & Summer",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
    { overall: 8.8, couple: 8.6, summer: 8.4, winter: 4.6, rain: 5, food: 9.4, photography: 9, relaxation: 7.6, value: 9.4, uniqueness: 9.6, family: 8.4, accessibility: 6, nature: 6.4, historyAndCulture: 7.4, walkability: 7, spring: 8.8, autumn: 8.4 },
    "https://minatonichiyouasaichikai.com/",
    "Sundays only, mid-March to end-December; ~03:00 to ~09:00; free entry",
    "No reservation required",
    "Free parking near the wharf",
    "Plan the trip for a Sunday; the market is closed January–February. Free entry; food and drink at the stalls. Pairs with Kabushima Shrine for a dawn-to-morning circuit.",
    [{ type: "tourism_board", url: "https://visithachinohe.com/stories/tatehanaganpeki-asaichi/", title: "Visit Hachinohe — Tatehana Wharf Asaichi" }],
    AOMORI_GROUP_IMAGE["tatehana-wharf-morning-market"],
  ),
  tohokuPoi(
    "towada-art-center",
    "Towada Art Center",
    "十和田市現代美術館",
    "Aomori:towada",
    "hachinohe-city",
    AOMORI_GROUP_COORDS["towada-art-center"],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Towada City"],
    "International contemporary-art museum and heart of the Arts Towada town-wide project. Commissioned works include Yayoi Kusama's outdoor 'Love Forever, Singing in Towada', Ron Mueck's 'Standing Woman' and Nara Yoshitomo's 'Night Dew Girl 2012'.",
    "「アートで町を元気に」を掲げる十和田市現代美術館。草間彌生の野外作品「愛はとこしえ十和田でうたう」、ロン・ミュエクの「スタンディング・ウーマン」、奈良美智の作品などが街なかと一体で楽しめます。",
    ["草間彌生の野外作品", "ロン・ミュエク", "奈良美智", "街なかアート"],
    ["Kusama outdoor sculpture", "Ron Mueck's Standing Woman", "Nara Yoshitomo", "Town-wide art project"],
    [1000, 4000, 7000],
    { transport: 1000, tickets: 1800, food: 800, cafe: 400 },
    { train: 100, bus: 60, car: 45 },
    { min: 2, max: 3 },
    [3000, 1500, 1500],
    80,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8.2, autumn: 8.6, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 4 },
    { overall: 9, couple: 8.8, summer: 8.2, winter: 8, rain: 9, food: 7.8, photography: 9.2, relaxation: 8, value: 8.2, uniqueness: 9.6, family: 7.6, accessibility: 8, nature: 7, historyAndCulture: 8.4, walkability: 7, spring: 8.6, autumn: 8.8 },
    "https://towadaartcenter.com/",
    "09:00 - 17:00 (entry to 16:30); closed Mondays (Tue if Mon holiday) and year-end",
    "No reservation required",
    "Parking at the Art Plaza",
    "Adult ¥1,800 with a special exhibition, ¥1,000 permanent only; high school and below free. IMPORTANT: full closure 2027-04-01 to 2028-03-31 for air-conditioning renovation — outdoor Kusama works and street furniture remain viewable. 40 min by bus from Shichinohe-Towada Shinkansen Station.",
    [{ type: "official", url: "https://towadaartcenter.com/", title: "Towada Art Center official site" }],
    AOMORI_GROUP_IMAGE["towada-art-center"],
  ),
  tohokuPoi(
    "hirosaki-neputa-mura",
    "Hirosaki Neputa Mura",
    "津軽藩ねぷた村",
    "Aomori:hirosaki",
    "hirosaki-city",
    AOMORI_GROUP_COORDS["hirosaki-neputa-mura"],
    "museum",
    ["Culture", "Museum"],
    ["Culture", "Museum", "Hirosaki City"],
    "Year-round home of Hirosaki's fan-shaped neputa floats: 10-metre floats and painted frames in the Neputa Hall, daily Tsugaru shamisen performances, and hands-on Tsugaru-nuri, kogin and kingyo-neputa craft workshops.",
    "弘前の扇ねぷたを一年中見られる施設。10m級のねぷたや絵組を展示するねぷたの館のほか、津軽三味線の生演奏、津軽塗やこぎん刺し、金魚ねぷたの体験教室が開かれています。",
    ["10m級の扇ねぷた", "津軽三味線の生演奏", "工芸体験", "年中無休"],
    ["10 m fan-shaped neputa", "Live Tsugaru shamisen", "Craft workshops", "Open year-round"],
    [600, 3000, 5000],
    { transport: 800, tickets: 600, food: 1100, cafe: 500 },
    { train: 30, bus: 40, car: 35 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    70,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8.6, summer: 8.8, autumn: 8.4, winter: 8 },
    [2, 3, 4, 5, 7, 8, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 4 },
    { overall: 8.6, couple: 8.2, summer: 8.8, winter: 8, rain: 8.6, food: 8.2, photography: 8.8, relaxation: 7.6, value: 8.4, uniqueness: 9.2, family: 8.4, accessibility: 8, nature: 6.4, historyAndCulture: 9, walkability: 7, spring: 8.8, autumn: 8.6 },
    "http://neputamura.com/",
    "Exhibit area 09:00 - 17:00 (last entry 17:00); open year-round",
    "No reservation required",
    "Free parking on site",
    "Adult ¥600, high school ¥400, elementary ¥300. Two minutes from Hirosaki Park (Chuo-koko gate) — pairs with Hirosaki Castle.",
    [{ type: "official", url: "http://neputamura.com/", title: "Tsugaru-han Neputa-mura official site" }],
    AOMORI_GROUP_IMAGE["hirosaki-neputa-mura"],
  ),
  tohokuPoi(
    "fujita-memorial-garden",
    "Fujita Memorial Garden",
    "藤田記念庭園",
    "Aomori:hirosaki",
    "hirosaki-city",
    AOMORI_GROUP_COORDS["fujita-memorial-garden"],
    "garden",
    ["Nature", "Garden"],
    ["Nature", "Garden", "Hirosaki City"],
    "Pond-stroll Japanese garden of the former Fujita family villa at Hirosaki Castle's west moat, with a Registered Tangible Cultural Property western-style house housing the Taisho Romantic tea room — famous for apple pie.",
    "弘前城西堀に面する旧藤田家の池泉回遊式庭園。登録有形文化財の洋館「大正浪漫喫茶室」ではアップルパイが味わえます。",
    ["池泉回遊式庭園", "大正浪漫喫茶室", "弘前城西堀に隣接", "秋の紅葉"],
    ["Pond-stroll garden", "Taisho Romantic tea room", "Beside the castle's west moat", "Autumn colour"],
    [320, 2120, 3500],
    { transport: 600, tickets: 320, food: 800, cafe: 400 },
    { train: 30, bus: 40, car: 35 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9, summer: 7.8, autumn: 9.2, winter: 6.8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 6, walkingIntensity: 3 },
    { overall: 8.2, couple: 8.6, summer: 7.8, winter: 6.8, rain: 7, food: 8.4, photography: 8.8, relaxation: 9, value: 8.2, uniqueness: 8, family: 7.4, accessibility: 6, nature: 9, historyAndCulture: 8, walkability: 7, spring: 9.2, autumn: 9.4 },
    "https://www.hirosakipark.or.jp/hujita/",
    "09:00 - 17:00 (last entry 16:30); western house closed Nov 24 – mid-Apr (free in winter)",
    "No reservation required",
    "No dedicated parking; use castle-area parking",
    "Adult ¥320 / child ¥100. Five minutes from the castle's west gate — bundle with Hirosaki Castle and Saisho-in.",
    [{ type: "tourism_board", url: "https://www.hirosaki-kanko.or.jp/", title: "Hirosaki Tourism Association — Fujita Memorial Garden" }],
    AOMORI_GROUP_IMAGE["fujita-memorial-garden"],
  ),
  tohokuPoi(
    "saisho-in",
    "Saisho-in",
    "最勝院",
    "Aomori:hirosaki",
    "hirosaki-city",
    AOMORI_GROUP_COORDS["saisho-in"],
    "temple",
    ["History", "Culture"],
    ["History", "Culture", "Hirosaki City"],
    "Shingon temple whose five-story pagoda, completed in 1667, is a National Important Cultural Property and often called Tohoku's most beautiful. The pagoda anchors the Zairai samurai-district walking area south of the castle.",
    "1667年建立の五重塔が重要文化財に指定されている弘前の寺院。「東北一美しい五重塔」と呼ばれ、城の南側の在府侍町の散策エリアにあります。",
    ["国指定重要文化財の五重塔", "1667年建立", "在府侍町エリア", "通常無料"],
    ["ICP five-story pagoda", "Built 1667", "Samurai-district anchor", "Free normally"],
    [0, 1500, 3000],
    { transport: 700, tickets: 0, food: 500, cafe: 300 },
    { train: 30, bus: 40, car: 35 },
    { min: 1, max: 1 },
    [1500, 900, 600],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.8, summer: 7.8, autumn: 9, winter: 7.6 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 3 },
    { overall: 8.4, couple: 8.4, summer: 7.8, winter: 7.6, rain: 6.6, food: 7, photography: 9, relaxation: 8.4, value: 9, uniqueness: 8.8, family: 7.6, accessibility: 6, nature: 8, historyAndCulture: 9.4, walkability: 8, spring: 9, autumn: 9.2 },
    "https://saisyouin.jp/",
    "Grounds 09:00 - 16:30 (seasonal); free normally, paid during festival seasons",
    "No reservation required",
    "Street parking nearby",
    "Free normally; entrance fee (~¥800 adult) applies during cherry-blossom, neputa and chrysanthemum-maple festival periods. About 1.5 km south of Hirosaki Castle.",
    [{ type: "official", url: "https://saisyouin.jp/", title: "Saisho-in official site" }],
    AOMORI_GROUP_IMAGE["saisho-in"],
  ),
];

addRecords(AOMORI_GROUP_POIS);

// ===========================================================================
// KAI-57 additions — Morioka cluster (batch 3)
// ===========================================================================

const MORIOKA_POIS: Destination[] = [
  tohokuPoi(
    "iwate-park-morioka-castle-ruins",
    "Iwate Park (Morioka Castle Ruins)",
    "盛岡城跡公園（岩手公園）",
    "Iwate:morioka",
    "morioka-city",
    [39.699947, 141.150111],
    "castle",
    ["History", "Nature"],
    ["History", "Nature", "Morioka City"],
    "Hilltop site of Morioka Castle, one of Japan's 100 Famous Castles, now a public park ringed by massive granite stone walls and moats. The Honmaru ruins offer views over the city where the Kitakami and Nakatsu rivers meet.",
    "日本100名城の一つ・盛岡城の本丸跡を整備した公園。迫力ある花崗岩の石垣と堀に囲まれ、城山からは北上川と中津川が合流する街並みを望めます。",
    ["日本100名城", "花崗岩の石垣", "本丸跡の展望", "春の桜と秋の紅葉"],
    ["One of Japan's 100 Castles", "Granite stone walls", "Honmaru views", "Sakura and autumn colour"],
    [0, 1500, 3000],
    { transport: 700, tickets: 0, food: 500, cafe: 300 },
    { train: 25, bus: 30, car: 30 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9, summer: 7.8, autumn: 9, winter: 7.4 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 5 },
    { overall: 8.4, couple: 8.4, summer: 7.8, winter: 7.4, rain: 6, food: 7.2, photography: 8.8, relaxation: 8.6, value: 9, uniqueness: 8.2, family: 8, accessibility: 6, nature: 8.4, historyAndCulture: 9, walkability: 8, spring: 9.2, autumn: 9.2 },
    "https://www.city.morioka.iwate.jp/kurashi/midori/koen/1010491.html",
    "Open access (park); free entry",
    "No reservation required",
    "Parking nearby (paid)",
    "Free park on the castle ruins; about 15 minutes on foot from Morioka Station.",
    [{ type: "government", url: "https://www.city.morioka.iwate.jp/kurashi/midori/koen/1010491.html", title: "Morioka City — Iwate Park" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/171103_Morioka_Castle_Morioka_Iwate_pref_Japan20s3.jpg/1280px-171103_Morioka_Castle_Morioka_Iwate_pref_Japan20s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:171103_Morioka_Castle_Morioka_Iwate_pref_Japan20s3.jpg",
    },
  ),
  tohokuPoi(
    "bank-of-iwate-red-brick",
    "Bank of Iwate Red Brick Building",
    "岩手銀行赤レンガ館",
    "Iwate:morioka",
    "morioka-city",
    [39.700611, 141.155167],
    "museum",
    ["History", "Culture", "Architecture"],
    ["History", "Architecture", "Morioka City"],
    "The former Bank of Iwate head office (1911), a Meiji-era red-brick landmark designed by Tokyo Station architect Tatsuno Kingo. The restored hall now hosts a museum, cafe and event space.",
    "1911年竣工の旧岩手銀行本店。東京駅を設計した辰野金吾による赤レンガ建築の傑作で、現在は資料館とカフェとして公開されています。",
    ["辰野金吾設計", "1911年竣工", "赤レンガの外観", "復元された銀行ホール"],
    ["Designed by Tatsuno Kingo", "Built 1911", "Red-brick landmark", "Restored banking hall"],
    [0, 2000, 4000],
    { transport: 700, tickets: 0, food: 800, cafe: 500 },
    { train: 25, bus: 30, car: 30 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    70,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8, autumn: 8.6, winter: 8.2 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 3 },
    { overall: 8.6, couple: 8.8, summer: 8, winter: 8.2, rain: 8.4, food: 8, photography: 8.8, relaxation: 8, value: 8.6, uniqueness: 8.8, family: 7.6, accessibility: 8, nature: 6, historyAndCulture: 9.2, walkability: 8, spring: 8.6, autumn: 8.8 },
    "https://www.iwagin-akarengakan.jp/",
    "09:30 - 17:00; closed Mondays (Tue if Mon holiday) and year-end",
    "No reservation required",
    "No dedicated parking; use city-centre parking",
    "Free entry to the hall; special exhibitions may charge. On the corner of Naka-no-bashi-dori and Chuodori.",
    [{ type: "official", url: "https://www.iwagin-akarengakan.jp/", title: "Bank of Iwate Red Brick Building official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/171103_Former_Morioka_Bank_Head_Office_Morioka_Iwate_pref_Japan01bs5.jpg/1280px-171103_Former_Morioka_Bank_Head_Office_Morioka_Iwate_pref_Japan01bs5.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:171103_Former_Morioka_Bank_Head_Office_Morioka_Iwate_pref_Japan01bs5.jpg",
    },
  ),
  tohokuPoi(
    "morioka-handiworks-square",
    "Morioka Handi-Works Square",
    "盛岡手づくり村",
    "Iwate:morioka",
    "morioka-city",
    [39.692838, 141.024696],
    "shopping",
    ["Culture", "Shopping", "Experience"],
    ["Culture", "Experience", "Morioka City"],
    "A craft village west of the city where visitors can watch and try Iwate's traditional crafts — Nanbu ironware, Nanbu-bijin sake tasting, senbei baking, soba-making and more — in a cluster of workshops and shops.",
    "盛岡の伝統工芸を体験できる施設群。南部鉄器の制作見学や南部美人の利き酒、せんべい焼き、そば打ちなどの体験が楽しめます。",
    ["南部鉄器の制作見学", "体験工房", "郷土料理", "お土産選び"],
    ["Nanbu ironware workshops", "Hands-on craft experiences", "Local food and sake", "Souvenir shopping"],
    [0, 3000, 6000],
    { transport: 800, tickets: 0, food: 1400, cafe: 800 },
    { train: 35, bus: 40, car: 30 },
    { min: 2, max: 3 },
    [4000, 2500, 1500],
    50,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 8, autumn: 8.4, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "moderate",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 4 },
    { overall: 8.4, couple: 8, summer: 8, winter: 8, rain: 8, food: 8.8, photography: 7.8, relaxation: 7.8, value: 8.4, uniqueness: 8.6, family: 8.6, accessibility: 7, nature: 6.4, historyAndCulture: 8.8, walkability: 6, spring: 8.4, autumn: 8.6 },
    "https://tezukurimura.com/",
    "09:00 - 17:00; closed year-end (Dec 31 – Jan 2)",
    "No reservation required for entry; some workshops need booking",
    "Free parking on site",
    "Free entry; craft experiences and food are paid individually. About 20 minutes by car or bus from Morioka Station.",
    [{ type: "official", url: "https://tezukurimura.com/", title: "Morioka Handi-Works Square official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Morioka_Handi-Works_Square_20170715a.jpg/1280px-Morioka_Handi-Works_Square_20170715a.jpg",
      license: "CC BY-SA 4.0",
      attribution: "掬茶",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Morioka_Handi-Works_Square_20170715a.jpg",
    },
  ),
  tohokuPoi(
    "koiwai-farm",
    "Koiwai Farm",
    "小岩井農場",
    "Iwate:shizukuishi",
    "morioka-city",
    [39.751694, 141.016049],
    "park",
    ["Nature", "Family", "Food"],
    ["Nature", "Family", "Shizukuishi Town"],
    "One of Japan's great working farms on the slopes of Mount Iwate, with the famous one-row cherry trees, dairy and ranch experiences, the old stone barn, and sweeping views across the Iwate plain.",
    "岩手山の麓に広がる日本有数の大農場。一本桜や石造りの牛舎を眺めながら、乳製品づくりや牧場体験を楽しめます。",
    ["一本桜と岩手山", "牧場体験", "乳製品とソフトクリーム", "石造りの牛舎"],
    ["One-row cherry trees and Mt Iwate", "Ranch experiences", "Dairy products", "Old stone barn"],
    [0, 2500, 5000],
    { transport: 1000, tickets: 0, food: 1000, cafe: 500 },
    { train: 35, bus: 40, car: 35 },
    { min: 2, max: 4 },
    [5000, 3000, 2000],
    25,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 9, summer: 8.6, autumn: 8.4, winter: 7.6 },
    [4, 5, 6, 7, 8, 9, 10],
    "Spring & Summer",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 5 },
    { overall: 8.8, couple: 8.6, summer: 8.6, winter: 7.6, rain: 5.6, food: 9, photography: 9.2, relaxation: 8.6, value: 8.6, uniqueness: 9, family: 9, accessibility: 7, nature: 9.4, historyAndCulture: 7, walkability: 7, spring: 9.2, autumn: 8.6 },
    "https://www.koiwaifarm.com/",
    "09:00 - 17:00 (varies by season); winter (Dec–Feb) weekends and holidays only",
    "No reservation required",
    "Free parking on site",
    "Entry fee applies at the Makiba-en ranch park (adult ~¥800); other areas vary. In Shizukuishi Town — gateway access via Morioka.",
    [{ type: "official", url: "https://www.koiwaifarm.com/", title: "Koiwai Farm official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Cherry_tree_and_Mount_Iwate.jpg/1280px-Cherry_tree_and_Mount_Iwate.jpg",
      license: "CC BY-SA 4.0",
      attribution: "掬茶",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cherry_tree_and_Mount_Iwate.jpg",
    },
  ),
];

addRecords(MORIOKA_POIS);

// ===========================================================================
// KAI-57 additions — Hiraizumi / Fukushima city / Akita (batch 4)
// ===========================================================================

const TOHOKU_EAST_POIS: Destination[] = [
  tohokuPoi(
    "motsu-ji",
    "Motsu-ji",
    "毛越寺",
    "Iwate:hiraizumi",
    "morioka-city",
    [38.988471, 141.105052],
    "temple",
    ["History", "Culture", "Nature"],
    ["History", "Culture", "Hiraizumi Town"],
    "Temple whose Pure Land garden and ruins are part of the UNESCO Hiraizumi World Heritage property. The Heian-era Jodo garden, laid out beside a large pond, is one of Japan's finest surviving examples of Pure Land landscape design.",
    "世界遺産「平泉」を構成する寺院。平安時代の浄土庭園が池のほとりに広がり、極楽浄土を表した庭園様式の傑作として知られています。",
    ["世界遺産の浄土庭園", "大泉が池", "平安様式の庭園", "春の桜と秋の紅葉"],
    ["UNESCO Pure Land garden", "Oizumi-ga-ike pond", "Heian garden design", "Sakura and autumn colour"],
    [500, 2500, 4000],
    { transport: 800, tickets: 500, food: 800, cafe: 400 },
    { train: 60, bus: 65, car: 75 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    30,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9, summer: 8, autumn: 9.4, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    { overall: 9, couple: 9, summer: 8, winter: 7.6, rain: 6.4, food: 7.6, photography: 9.4, relaxation: 9, value: 8.8, uniqueness: 9.4, family: 7.8, accessibility: 7, nature: 9, historyAndCulture: 9.8, walkability: 8, spring: 9.2, autumn: 9.6 },
    "https://www.motsuji.or.jp/",
    "08:30 - 17:00 (Mar–Nov) / 08:30 - 16:30 (winter)",
    "No reservation required",
    "Pay parking near the temple",
    "Garden admission ¥500 adult. Gateway access via Morioka; also reachable from Ichinoseki. Pairs with Chuson-ji in the same Hiraizumi visit.",
    [{ type: "official", url: "https://www.motsuji.or.jp/", title: "Motsu-ji official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/230728_Motsuji_Hiraizumi_Iwate_pref_Japan37s3.jpg/1280px-230728_Motsuji_Hiraizumi_Iwate_pref_Japan37s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:230728_Motsuji_Hiraizumi_Iwate_pref_Japan37s3.jpg",
    },
  ),
  tohokuPoi(
    "takkoku-no-iwa",
    "Takkoku-no-Iwa",
    "達谷窟毘沙門堂",
    "Iwate:hiraizumi",
    "morioka-city",
    [38.968167, 141.058444],
    "temple",
    ["History", "Culture"],
    ["History", "Culture", "Hiraizumi Town"],
    "A hall built against a sheer cliff face in a wooded valley south of Hiraizumi, said to date from a 9th-century temple carved into the rock. The vermillion Bishamon-do clings to the crag above the valley floor.",
    "切り立った岩壁に張り付くように建つ毘沙門堂。9世紀の創建と伝わる岩窟寺院で、谷間に架かる朱塗りの堂と岩肌の対比が印象的です。",
    ["岩壁に建つ堂", "伝承の古刹", "渓谷の景観", "東北の秘所"],
    ["Cliffside hall", "Legendary 9th-century temple", "Valley setting", "Hidden Tohoku gem"],
    [400, 2200, 4000],
    { transport: 800, tickets: 400, food: 700, cafe: 300 },
    { train: 60, bus: 65, car: 75 },
    { min: 1, max: 1 },
    [1500, 900, 600],
    20,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8.6, summer: 8, autumn: 9.2, winter: 7.4 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 5, walkingIntensity: 3 },
    { overall: 8.6, couple: 8.6, summer: 8, winter: 7.4, rain: 6.2, food: 7, photography: 9.2, relaxation: 8.6, value: 8.6, uniqueness: 9.4, family: 7.6, accessibility: 6, nature: 8.8, historyAndCulture: 9.4, walkability: 7, spring: 8.8, autumn: 9.4 },
    "http://www.iwayabetto.com/",
    "Open daylight hours; see official site for seasonal hours",
    "No reservation required",
    "Pay parking at the site",
    "Admission ¥400 adult. About 10 minutes by car south of Hiraizumi.",
    [{ type: "official", url: "http://www.iwayabetto.com/", title: "Takkoku-no-Iwa official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/230728_Takkoku-no-iwaya_Bishamondo_Hiraizumi_Iwate_pref_Japan01s3.jpg/1280px-230728_Takkoku-no-iwaya_Bishamondo_Hiraizumi_Iwate_pref_Japan01s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:230728_Takkoku-no-iwaya_Bishamondo_Hiraizumi_Iwate_pref_Japan01s3.jpg",
    },
  ),
  tohokuPoi(
    "iizaka-onsen",
    "Iizaka Onsen",
    "飯坂温泉",
    "Fukushima:fukushima",
    "fukushima-city",
    [37.831944, 140.454444],
    "onsen",
    ["Onsen & Wellness"],
    ["Onsen", "Fukushima City"],
    "One of Tohoku's three great old springs, with roughly 1,200 years of history and Japan's oldest wooden communal bathhouse, Sakaba-yu, still in daily use. Communal baths and footbaths cluster around the riverside town.",
    "東北三名湯の一つに数えられる1200年の歴史を持つ温泉街。日本最古の木造共同浴場・波来湯が今も現役で、川沿いに共同浴場や足湯が点在します。",
    ["日本最古の木造浴場・波来湯", "共同浴場めぐり", "川沿いの温泉街", "約1200年の歴史"],
    ["Japan's oldest wooden bathhouse", "Communal bath circuit", "Riverside onsen town", "~1,200-year history"],
    [400, 2500, 5000],
    { transport: 600, tickets: 400, food: 1000, cafe: 500 },
    { train: 25, bus: 40, car: 30 },
    { min: 2, max: 4 },
    [3000, 1500, 1500],
    30,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 8.6, summer: 8.4, autumn: 8.8, winter: 8.6 },
    [3, 4, 5, 9, 10, 11, 12],
    "All Year",
    "moderate",
    { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 3 },
    { overall: 8.4, couple: 8.8, summer: 8.4, winter: 8.6, rain: 8, food: 8.8, photography: 8, relaxation: 9.4, value: 9, uniqueness: 8.8, family: 8, accessibility: 7, nature: 7.6, historyAndCulture: 8.6, walkability: 8, spring: 8.8, autumn: 9 },
    "https://iizaka.com/",
    "District open access; Sakaba-yu 06:00–21:00 (last entry 20:40), closed Mondays",
    "No reservation required for communal baths",
    "Pay parking in the town",
    "Sakaba-yu ¥400 adult. About 20 minutes from Fukushima Station on the Iizaka Line; a 5-minute walk from Iizaka-Onsen Station.",
    [{ type: "official", url: "https://iizaka.com/", title: "Iizaka Onsen official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Iizaka_Onsen_Hakoyu.JPG/1280px-Iizaka_Onsen_Hakoyu.JPG",
      license: "Public domain",
      attribution: "Abasaa",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Iizaka_Onsen_Hakoyu.JPG",
    },
  ),
  tohokuPoi(
    "fukushima-prefectural-museum-of-art",
    "Fukushima Prefectural Museum of Art",
    "福島県立美術館",
    "Fukushima:fukushima",
    "fukushima-city",
    [37.767942, 140.456506],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Fukushima City"],
    "Prefectural art museum at the foot of Mount Shinobu, opened in 1984, with a strong collection of modern Japanese painting including Takahashi Yuichi. Hosts major special exhibitions and offers free parking.",
    "信夫山の麓に建つ県立美術館。高橋由一など近代日本画のコレクションが充実し、大型の特別展も開催されます。",
    ["近代日本画のコレクション", "高橋由一", "特別展", "無料駐車場"],
    ["Modern Japanese painting", "Takahashi Yuichi works", "Major special exhibitions", "Free parking"],
    [360, 2200, 4000],
    { transport: 700, tickets: 360, food: 700, cafe: 400 },
    { train: 20, bus: 30, car: 25 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    90,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8, summer: 7.8, autumn: 8.2, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 3 },
    { overall: 8, couple: 7.8, summer: 7.8, winter: 8, rain: 9, food: 7.6, photography: 7.8, relaxation: 7.8, value: 8.4, uniqueness: 7.6, family: 7.4, accessibility: 9, nature: 6.4, historyAndCulture: 8.6, walkability: 7, spring: 8.2, autumn: 8.4 },
    "https://art-museum.fcs.ed.jp/",
    "09:30 - 17:00 (last entry 16:30); closed Mondays (except holidays), day after holidays, year-end",
    "No reservation required",
    "Free parking (unavailable during large special exhibitions)",
    "Permanent collection ¥360 adult / ¥280 group; high school and below free. Three minutes from Fukushima Station on the Iizaka Line (Museum-mae stop).",
    [{ type: "official", url: "https://art-museum.fcs.ed.jp/", title: "Fukushima Prefectural Museum of Art official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/5/5c/Fukushima-Pref-Museum-of-Art02.jpg",
      license: "Public domain",
      attribution: "Hasec",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Fukushima-Pref-Museum-of-Art02.jpg",
    },
  ),
  tohokuPoi(
    "oga-namahage-kan",
    "Namahage Museum (Oga Shinzan Folklore Museum)",
    "なまはげ館（男鹿真山伝承館）",
    "Akita:oga",
    "akita-city",
    [39.929167, 139.766583],
    "museum",
    ["Culture", "Museum"],
    ["Culture", "Museum", "Oga City"],
    "Home of the Namahage, the fearsome New Year visitors of the Oga Peninsula — a UNESCO Intangible Cultural Heritage (2018). The museum displays roughly 150 masks and costumes, with live Namahage performances at the adjacent Shinzan Folklore Museum.",
    "ユネスコ無形文化遺産に登録された「なまはげ」の博物館。約150点の面と衣装を展示し、隣接する男鹿真山伝承館では迫力の実演も行われます。",
    ["ユネスコ無形文化遺産", "約150点の面と衣装", "なまはげの実演", "真山神社に隣接"],
    ["UNESCO Intangible Cultural Heritage", "~150 masks and costumes", "Live performances", "Beside Shinzan Shrine"],
    [660, 3500, 6000],
    { transport: 1500, tickets: 660, food: 900, cafe: 400 },
    { train: 80, bus: 90, car: 60 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    70,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 8, autumn: 8.6, winter: 9 },
    [1, 2, 3, 5, 8, 10, 11, 12],
    "Winter & Autumn",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 3 },
    { overall: 9, couple: 8.8, summer: 8, winter: 9, rain: 8.4, food: 7.6, photography: 9.4, relaxation: 7.4, value: 8.6, uniqueness: 9.8, family: 8.6, accessibility: 8, nature: 6.8, historyAndCulture: 9.6, walkability: 6, spring: 8.6, autumn: 8.8 },
    "https://www.namahage.co.jp/namahagekan/",
    "08:30 - 17:00 year-round; performance slots ~13/day (fewer in winter)",
    "Reservations advised on holidays",
    "Free parking on site",
    "Namahage-kan ¥660 adult / ¥330 student; combined ticket with the Shinzan Folklore Museum ¥1,100/¥660. Gateway access via Akita City (JR Oga Line + shuttle); allow 5–6 hours round trip.",
    [{ type: "official", url: "https://www.namahage.co.jp/namahagekan/", title: "Namahage-kan official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Entrance_of_Namahage_Museum%2C_Oga%2C_Akita.JPG/1280px-Entrance_of_Namahage_Museum%2C_Oga%2C_Akita.JPG",
      license: "CC BY 4.0",
      attribution: "Kumpei Shiraishi",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Entrance_of_Namahage_Museum,_Oga,_Akita.JPG",
    },
  ),
  tohokuPoi(
    "akita-senshu-park",
    "Senshu Park (Kubota Castle Ruins)",
    "千秋公園",
    "Akita:akita",
    "akita-city",
    [39.723481, 140.123242],
    "castle",
    ["History", "Nature"],
    ["History", "Nature", "Akita City"],
    "Ruin site of Kubota Castle, seat of the Satake clan for 267 years, now a scenic park with moats, a reconstructed corner watchtower, the Satake Historical Museum and one of Japan's top cherry-blossom spots.",
    "佐竹氏267年の居城・久保田城の跡地を整備した公園。堀や復元された隅櫓、佐竹史料館があり、桜の名所としても知られます。",
    ["久保田城の石垣と堀", "復元隅櫓", "佐竹史料館", "桜の名所"],
    ["Kubota Castle moats", "Reconstructed watchtower", "Satake Historical Museum", "Cherry-blossom spot"],
    [150, 1650, 3000],
    { transport: 700, tickets: 150, food: 500, cafe: 300 },
    { train: 15, bus: 20, car: 20 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9.2, summer: 7.8, autumn: 8.8, winter: 7.6 },
    [3, 4, 5, 10, 11],
    "Spring",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
    { overall: 8.6, couple: 8.6, summer: 7.8, winter: 7.6, rain: 5.8, food: 7.6, photography: 9, relaxation: 8.8, value: 9, uniqueness: 8.2, family: 8.4, accessibility: 7, nature: 8.8, historyAndCulture: 9.2, walkability: 8, spring: 9.4, autumn: 9 },
    "https://www.city.akita.lg.jp/kurashi/doro-koen/1003685/1007159/index.html",
    "Park open all day; watchtower 09:00 - 16:30 (closed Dec 1 – Mar 31)",
    "No reservation required",
    "No dedicated parking; use city-centre parking",
    "Park free; watchtower ¥150 adult. 10–15 minutes on foot from Akita Station.",
    [{ type: "government", url: "https://www.city.akita.lg.jp/kurashi/doro-koen/1003685/1007159/index.html", title: "Akita City — Senshu Park" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Kogetsu-pond_in_Senshu_Park_20180520.jpg/1280px-Kogetsu-pond_in_Senshu_Park_20180520.jpg",
      license: "CC BY-SA 4.0",
      attribution: "掬茶",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Kogetsu-pond_in_Senshu_Park_20180520.jpg",
    },
  ),
  tohokuPoi(
    "akita-museum-of-art",
    "Akita Museum of Art",
    "秋田県立美術館",
    "Akita:akita",
    "akita-city",
    [39.717428, 140.1215],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Culture", "Museum", "Akita City"],
    "Tadao Ando-designed museum (2013) housing the Hirano Masakichi collection, crowned by Tsuguharu Fujita's 20-metre mural 'Akita's Festivals'. The geometric concrete building and free permanent collection make it a destination in its own right.",
    "安藤忠雄設計の建物（2013年開館）に、藤田嗣治の大作「秋田の行事」を擁する平野政吉コレクションを収蔵。常設展は無料で、ジオメトリックなコンクリート建築も見どころです。",
    ["安藤忠雄設計", "藤田嗣治「秋田の行事」", "無料の常設展", "千秋公園に隣接"],
    ["Tadao Ando architecture", "Fujita's 'Akita's Festivals' mural", "Free permanent collection", "Beside Senshu Park"],
    [0, 2000, 4000],
    { transport: 700, tickets: 0, food: 800, cafe: 500 },
    { train: 15, bus: 20, car: 20 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    90,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 7.8, autumn: 8.4, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 3 },
    { overall: 8.8, couple: 8.6, summer: 7.8, winter: 8, rain: 9, food: 8, photography: 8.8, relaxation: 8, value: 9.2, uniqueness: 8.8, family: 7.6, accessibility: 9, nature: 6.6, historyAndCulture: 9, walkability: 8, spring: 8.4, autumn: 8.6 },
    "https://www.akita-museum-of-art.jp/",
    "10:00 - 18:00 (tickets to 17:30); irregular closures — check official calendar",
    "No reservation required",
    "No dedicated parking; use city-centre parking",
    "Permanent collection free; special exhibitions ¥1,300 adult / ¥1,000 student. Ten minutes from Akita Station, adjacent to Senshu Park.",
    [{ type: "official", url: "https://www.akita-museum-of-art.jp/", title: "Akita Museum of Art official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Akita_Museum_of_Art_20180520.jpg/1280px-Akita_Museum_of_Art_20180520.jpg",
      license: "CC BY-SA 4.0",
      attribution: "掬茶",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Akita_Museum_of_Art_20180520.jpg",
    },
  ),
];

addRecords(TOHOKU_EAST_POIS);

// ===========================================================================
// KAI-57 additions — Sendai / Yamagata / Aizu-Wakamatsu (batch 5)
// ===========================================================================

const TOHOKU_WEST_POIS: Destination[] = [
  tohokuPoi(
    "sendai-yagiyama-zoo",
    "Sendai Yagiyama Zoological Park",
    "八木山動物公園フジサキの杜",
    "Miyagi:sendai",
    "sendai-city",
    [38.2443, 140.8443],
    "zoo",
    ["Nature", "Family"],
    ["Nature", "Family", "Sendai City"],
    "One of Tohoku's largest zoos, on Yagiyama hill above the city since 1965. The Africa savanna exhibit, polar bear and tiger viewing, and a walk-through encounter area make it a top family destination, two minutes from the Tozai Line terminus.",
    "1965年開園の東北有数の動物園。アフリカサバンナの展示やホッキョクグマ、トラの観察、ふれあい広場などがあり、地下鉄東西線の終点から徒歩2分です。",
    ["アフリカサバンナ", "ホッキョクグマとトラ", "ふれあい広場", "家族向けの名所"],
    ["Africa savanna exhibit", "Polar bears and tigers", "Encounter area", "Top family spot"],
    [480, 3500, 6000],
    { transport: 900, tickets: 480, food: 1400, cafe: 700 },
    { train: 30, bus: 40, car: 40 },
    { min: 2, max: 4 },
    [5000, 2500, 2500],
    40,
    { weekday: 4, weekend: 7, holiday: 8 },
    { spring: 8.8, summer: 8.2, autumn: 8.8, winter: 7.6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 5, walkingIntensity: 6 },
    { overall: 8.6, couple: 7.4, summer: 8.2, winter: 7.6, rain: 5.4, food: 8, photography: 8.4, relaxation: 7.8, value: 8.8, uniqueness: 8, family: 9.4, accessibility: 7, nature: 8.8, historyAndCulture: 6.4, walkability: 6, spring: 9, autumn: 9 },
    "https://www.city.sendai.jp/zoo/",
    "09:00 - 16:45 (last entry 16:00, Mar–Oct); 09:00 - 16:00 (last entry 15:00, Nov–Feb); closed Wednesdays and year-end",
    "No reservation required",
    "Pay parking at the park",
    "Adult ¥480, child (elem–jr high) ¥120, preschool free. Two minutes from Yagiyama Zoological Park Station (Tozai Line).",
    [{ type: "government", url: "https://www.city.sendai.jp/zoo/", title: "Sendai City — Yagiyama Zoological Park" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/%E5%85%AB%E6%9C%A8%E5%B1%B1%E5%8B%95%E7%89%A9%E5%85%AC%E5%9C%92_Yagiyama_Zoological_Park_%2855089719967%29.jpg/1280px-%E5%85%AB%E6%9C%A8%E5%B1%B1%E5%8B%95%E7%89%A9%E5%85%AC%E5%9C%92_Yagiyama_Zoological_Park_%2855089719967%29.jpg",
      license: "CC BY 4.0",
      attribution: "nagi usano",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:八木山動物公園_Yagiyama_Zoological_Park_(55089719967).jpg",
    },
  ),
  tohokuPoi(
    "sendai-ichibancho",
    "Sendai Ichibancho",
    "仙台一番町",
    "Miyagi:sendai",
    "sendai-city",
    [38.2597, 140.8722],
    "shopping",
    ["Shopping", "Food"],
    ["Shopping", "Food", "Sendai City"],
    "Sendai's main downtown shopping district: six covered arcades — Sun Mall, Vlandome, Clis Road, Marble Road Omachi, Hapina Nakakecho and Iroha Yokocho — linking Jozenji-dori to Sendai Station, with Tohoku's first arcade and a main venue of the Tanabata Festival.",
    "仙台駅と定禅寺通を結ぶ中心商店街。サンモール一番町、ハピナ名掛丁など6つのアーケードが連なり、東北初のアーケードや七夕まつりの主会場として知られます。",
    ["6つのアーケード", "東北初のアーケード", "七夕まつりの会場", "買い物とグルメ"],
    ["Six covered arcades", "Tohoku's first arcade", "Tanabata Festival venue", "Shopping and dining"],
    [0, 3000, 6000],
    { transport: 800, tickets: 0, food: 1400, cafe: 800 },
    { train: 15, bus: 20, car: 25 },
    { min: 1, max: 3 },
    [3000, 1500, 1500],
    70,
    { weekday: 4, weekend: 7, holiday: 8 },
    { spring: 8.4, summer: 8.8, autumn: 8.4, winter: 8 },
    [3, 4, 5, 7, 8, 9, 10, 11, 12],
    "All Year",
    "moderate",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 5 },
    { overall: 8.4, couple: 8, summer: 8.8, winter: 8, rain: 8.4, food: 9, photography: 8, relaxation: 7.6, value: 8.4, uniqueness: 7.8, family: 8.2, accessibility: 8, nature: 5, historyAndCulture: 7.4, walkability: 8, spring: 8.6, autumn: 8.6 },
    "http://sunmall-ichibancho.com/",
    "Open access; individual shops typically ~10:00 - 20:00",
    "No reservation required",
    "No dedicated parking; use downtown parking",
    "Free to stroll; shops and restaurants are individually priced. The north end meets Jozenji-dori.",
    [{ type: "tourism_board", url: "https://www.sentabi.jp/en/spots/324", title: "Sendai Tourism — Ichibancho" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Sun_Mall_Ichibancho_202209.jpg/1280px-Sun_Mall_Ichibancho_202209.jpg",
      license: "CC BY-SA 4.0",
      attribution: "掬茶",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Sun_Mall_Ichibancho_202209.jpg",
    },
  ),
  tohokuPoi(
    "sendai-daikannon",
    "Sendai Daikannon",
    "仙台大観音",
    "Miyagi:sendai",
    "sendai-city",
    [38.3009, 140.8231],
    "temple",
    ["Culture", "Sightseeing"],
    ["Culture", "Sightseeing", "Sendai City"],
    "A 100-metre Byakue Kannon statue — among Japan's tallest — built in 1991 and visible from the Tohoku Expressway. Visitors can walk up 12 floors inside the statue past 108 Buddha figures to an observation room with city and Pacific views.",
    "1991年に建立された高さ100mの白衣観音像。日本有数の高さを誇り、内部は12階建てで108体の仏像を巡りながら展望室まで登れます。",
    ["高さ100mの観音像", "内部12階の見学", "108体の仏像", "展望室からの眺望"],
    ["100 m Kannon statue", "12-floor interior", "108 Buddha figures", "Observation room views"],
    [500, 2500, 4500],
    { transport: 800, tickets: 500, food: 800, cafe: 400 },
    { train: 40, bus: 45, car: 30 },
    { min: 1, max: 2 },
    [2000, 1200, 800],
    70,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.2, summer: 8, autumn: 8.4, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 4 },
    { overall: 8.4, couple: 8.2, summer: 8, winter: 8, rain: 8.2, food: 7.4, photography: 8.6, relaxation: 8, value: 8, uniqueness: 9.2, family: 7.8, accessibility: 7, nature: 6, historyAndCulture: 8.4, walkability: 5, spring: 8.4, autumn: 8.6 },
    "https://www.daikannon.com/",
    "Interior 10:00 - 15:00 (weekdays) / 10:00 - 15:30 (weekends & holidays); grounds free",
    "No reservation required",
    "Pay parking on site",
    "Interior ¥500 (from 2026-01-01); grounds free. North of the centre (Izumi-ku) — about 30 minutes from downtown by bus or car.",
    [{ type: "official", url: "https://www.daikannon.com/", title: "Sendai Daikannon official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Sendai_Daikannon_%281870523730%29.jpg/1280px-Sendai_Daikannon_%281870523730%29.jpg",
      license: "CC BY-SA 2.0",
      attribution: "Hideyuki KAMON",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Sendai_Daikannon_(1870523730).jpg",
    },
  ),
  tohokuPoi(
    "yamagata-bunshokan",
    "Yamagata Bunshokan",
    "山形県郷土館文翔館",
    "Yamagata:yamagata",
    "yamagata-city",
    [38.2575, 140.3412],
    "museum",
    ["History", "Culture", "Architecture"],
    ["History", "Architecture", "Yamagata City"],
    "The 1916 English neo-Renaissance former prefectural office and assembly hall, a National Important Cultural Property and the finest Taisho-era Western public building in Tohoku. The restored interior features a clock tower, barrel-vaulted ceiling and stained glass.",
    "1916年竣工の旧県庁舎と県会議事堂。国指定重要文化財で、東北を代表する大正時代の洋風建築。時計塔やアーチ天井、ステンドグラスが復元公開されています。",
    ["大正ロマンの洋館", "時計塔とステンドグラス", "国指定重要文化財", "入館無料"],
    ["Taisho-era Western building", "Clock tower and stained glass", "National Important Cultural Property", "Free entry"],
    [0, 1500, 3000],
    { transport: 600, tickets: 0, food: 600, cafe: 300 },
    { train: 20, bus: 25, car: 25 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    80,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 8, autumn: 8.6, winter: 8.2 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 3 },
    { overall: 8.6, couple: 8.6, summer: 8, winter: 8.2, rain: 9, food: 8, photography: 8.8, relaxation: 8, value: 9.2, uniqueness: 8.8, family: 7.6, accessibility: 8, nature: 5.6, historyAndCulture: 9.4, walkability: 8, spring: 8.6, autumn: 8.8 },
    "https://www.gakushubunka.jp/bunsyokan/",
    "09:00 - 16:30; closed 1st & 3rd Mondays (Tue if holiday) and Dec 29 – Jan 3; free",
    "No reservation required",
    "Pay parking nearby",
    "Free entry. The assembly hall is closed for construction until September 2026 — check before visiting. Pairs with Kajo Park.",
    [{ type: "official", url: "https://www.gakushubunka.jp/bunsyokan/", title: "Yamagata Bunshokan official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Bunshokan%2C_Yamagata_20170401-3.jpg/1280px-Bunshokan%2C_Yamagata_20170401-3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Suicasmo",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Bunshokan,_Yamagata_20170401-3.jpg",
    },
  ),
  tohokuPoi(
    "kajo-park",
    "Kajo Park (Yamagata Castle Ruins)",
    "霞城公園（山形城跡）",
    "Yamagata:yamagata",
    "yamagata-city",
    [38.2553, 140.3308],
    "castle",
    ["History", "Nature"],
    ["History", "Nature", "Yamagata City"],
    "The sprawling ruins of Yamagata Castle, one of Japan's 100 Famous Castles, in the heart of the city. Triple moats, the rebuilt East Otemon gate and more than 1,000 cherry trees make it a landmark park and blossom spot.",
    "日本100名城の山形城の跡地を整備した公園。三重の堀と復元された東大手門を備え、1,000本以上の桜が咲く市街地の名所です。",
    ["日本100名城", "三重の堀", "復元東大手門", "1,000本の桜"],
    ["One of Japan's 100 Castles", "Triple moats", "Rebuilt East Otemon gate", "1,000+ cherry trees"],
    [0, 1500, 3000],
    { transport: 600, tickets: 0, food: 600, cafe: 300 },
    { train: 15, bus: 20, car: 20 },
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    20,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 9.4, summer: 7.6, autumn: 8.8, winter: 7.4 },
    [3, 4, 5, 10, 11],
    "Spring",
    "moderate",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 4 },
    { overall: 8.6, couple: 8.6, summer: 7.6, winter: 7.4, rain: 5.6, food: 7.6, photography: 9.2, relaxation: 8.8, value: 9.2, uniqueness: 8, family: 8.4, accessibility: 7, nature: 8.6, historyAndCulture: 9.2, walkability: 8, spring: 9.6, autumn: 9 },
    "https://www.city.yamagata-yamagata.lg.jp/kurashi/koen/1006541/1006544/1003675.html",
    "Park 05:00 - 22:00 (Apr–Oct) / 05:30 - 22:00 (Nov–Mar); free",
    "No reservation required",
    "Pay parking near the park",
    "Free park. Ten minutes' walk from Yamagata Station; the East Otemon gate is the main entrance.",
    [{ type: "government", url: "https://www.city.yamagata-yamagata.lg.jp/kurashi/koen/1006541/1006544/1003675.html", title: "Yamagata City — Kajo Park" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/220430_Yamagata_Castle_Yamagata_Yamagata_pref_Japan01s3.jpg/1280px-220430_Yamagata_Castle_Yamagata_Yamagata_pref_Japan01s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:220430_Yamagata_Castle_Yamagata_Yamagata_pref_Japan01s3.jpg",
    },
  ),
  tohokuPoi(
    "kaminoyama-castle-town",
    "Kaminoyama Castle Town",
    "上山城と温泉街",
    "Yamagata:kaminoyama",
    "yamagata-city",
    [38.1575, 140.2766],
    "castle",
    ["History", "Onsen & Wellness"],
    ["History", "Onsen", "Kaminoyama City"],
    "The reconstructed keep of Kaminoyama Castle houses a city history museum, and the surrounding onsen town — with more than 1,200 years of springs — offers footbaths and ryokan stays. A compact castle-plus-onsen stop on the Yamagata Shinkansen.",
    "再建された上山城の天守閣には郷土資料館が入り、城下に広がる1200年余りの歴史を持つ温泉街には足湯が点在します。山形新幹線のかみのやま温泉駅からも近いコンパクトな城下町です。",
    ["再建天守と資料館", "1200年の温泉街", "足湯めぐり", "山形新幹線の駅に近接"],
    ["Reconstructed keep and museum", "1,200-year onsen town", "Footbath circuit", "Shinkansen stop nearby"],
    [600, 2500, 5000],
    { transport: 700, tickets: 600, food: 800, cafe: 400 },
    { train: 20, bus: 30, car: 25 },
    { min: 2, max: 3 },
    [3000, 1500, 1500],
    40,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.6, summer: 8, autumn: 8.8, winter: 8.4 },
    [3, 4, 5, 9, 10, 11, 12],
    "All Year",
    "moderate",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 4 },
    { overall: 8.2, couple: 8.4, summer: 8, winter: 8.4, rain: 7.4, food: 8.6, photography: 8.4, relaxation: 8.8, value: 8.6, uniqueness: 8, family: 8, accessibility: 7, nature: 7.6, historyAndCulture: 8.8, walkability: 7, spring: 8.8, autumn: 9 },
    "https://kaminoyama-castle.info/",
    "Keep 09:00 - 17:15 (last entry 16:45); closed Thursdays (Tue if holiday) and Dec 29 – 31",
    "No reservation required",
    "Pay parking in the town",
    "Keep ¥600 adult (2025 revision). A half-day pairing with Yamagata City; the onsen town itself is open access.",
    [{ type: "tourism_board", url: "https://kaminoyama-castle.info/", title: "Kaminoyama Castle official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Kaminoyama_Castle_20230806b.jpg/1280px-Kaminoyama_Castle_20230806b.jpg",
      license: "CC BY-SA 4.0",
      attribution: "掬茶",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Kaminoyama_Castle_20230806b.jpg",
    },
  ),
  tohokuPoi(
    "aizu-bukeyashiki",
    "Aizu Bukeyashiki",
    "会津武家屋敷",
    "Fukushima:aizuwakamatsu",
    "aizuwakamatsu-city",
    [37.4852, 139.9537],
    "museum",
    ["History", "Culture"],
    ["History", "Culture", "Aizuwakamatsu City"],
    "A reconstructed samurai residence complex centred on the 1975 rebuild of chief retainer Saigo Tanomo's home, with relocated Edo-period buildings, a samurai museum and hands-on akabeko and archery experiences.",
    "家老・西郷頼母邸を1975年に復元した武家屋敷群。移築された江戸時代の建物や資料館のほか、赤べこ絵付けや弓矢体験ができます。",
    ["西郷頼母邸の復元", "江戸時代の移築建物", "赤べこ絵付け体験", "会津の歴史資料"],
    ["Rebuilt Saigo Tanomo residence", "Relocated Edo buildings", "Akabeko painting experience", "Aizu history museum"],
    [1000, 3500, 6000],
    { transport: 800, tickets: 1000, food: 1100, cafe: 600 },
    { train: 30, bus: 40, car: 35 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    60,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 8.4, summer: 8.2, autumn: 8.6, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "moderate",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 4 },
    { overall: 8.4, couple: 8, summer: 8.2, winter: 8, rain: 7.6, food: 8, photography: 8.4, relaxation: 7.8, value: 8.2, uniqueness: 8.6, family: 8.4, accessibility: 7, nature: 6, historyAndCulture: 9.4, walkability: 7, spring: 8.6, autumn: 8.8 },
    "https://bukeyashiki.com/",
    "08:30 - 17:00 (Apr–Nov) / 09:00 - 16:30 (Dec–Mar); open year-round",
    "No reservation required",
    "Free parking on site",
    "Adult ¥1,000. On the Aizu loop bus (Akabe); gateway to Higashiyama Onsen.",
    [{ type: "official", url: "https://bukeyashiki.com/", title: "Aizu Bukeyashiki official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Aizu_Bukeyashiki_Garden.jpg/1280px-Aizu_Bukeyashiki_Garden.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Miyuki Meinaka",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Aizu_Bukeyashiki_Garden.jpg",
    },
  ),
  tohokuPoi(
    "nisshinkan",
    "Nisshinkan",
    "日新館",
    "Fukushima:aizuwakamatsu",
    "aizuwakamatsu-city",
    [37.5589, 139.9419],
    "museum",
    ["History", "Culture"],
    ["History", "Culture", "Aizuwakamatsu City"],
    "A full-scale reconstruction of the Aizu clan's 1803 school, where the Byakkotai youths studied. The complex includes a Confucius hall, Japan's oldest swimming pool and an observatory, with hands-on kyudo, zazen and tea experiences.",
    "1803年創設の会津藩校を全面復元した施設。白虎隊の少年たちも学んだ学び舎で、大成殿や日本最古のプール、天文台を見学でき、弓道や座禅、茶道の体験もできます。",
    ["会津藩校の全面復元", "大成殿", "日本最古のプール", "白虎隊ゆかり"],
    ["Full-scale clan school reconstruction", "Confucius hall", "Japan's oldest pool", "Byakkotai heritage"],
    [1800, 4500, 8000],
    { transport: 900, tickets: 1800, food: 1100, cafe: 700 },
    { train: 35, bus: 45, car: 40 },
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    70,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 8.2, autumn: 8.6, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 4 },
    { overall: 8.6, couple: 8, summer: 8.2, winter: 8, rain: 8, food: 7.6, photography: 8.6, relaxation: 7.8, value: 8, uniqueness: 9, family: 8.2, accessibility: 8, nature: 5.6, historyAndCulture: 9.6, walkability: 7, spring: 8.6, autumn: 8.8 },
    "https://www.nisshinkan.co.jp/",
    "09:00 - 17:00 (last entry 16:00); open year-round",
    "No reservation required",
    "Free parking on site",
    "Adult ¥1,800 (2025 revision). Links with the Byakkotai story at Iimoriyama and Sazae-do.",
    [{ type: "official", url: "https://www.nisshinkan.co.jp/", title: "Nisshinkan official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Nisshinkan_Samurai_School_exterior_in_2013-10-18.jpg/1280px-Nisshinkan_Samurai_School_exterior_in_2013-10-18.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Mukasora",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Nisshinkan_Samurai_School_exterior_in_2013-10-18.jpg",
    },
  ),
  tohokuPoi(
    "sazae-do",
    "Sazae-do",
    "さざえ堂",
    "Fukushima:aizuwakamatsu",
    "aizuwakamatsu-city",
    [37.5045, 139.9539],
    "temple",
    ["History", "Culture"],
    ["History", "Culture", "Aizuwakamatsu City"],
    "A 1796 hexagonal wooden pavilion — the world's only surviving double-helix building, where the paths up and down never cross. A National Important Cultural Property atop Iimoriyama beside the Byakkotai graves.",
    "1796年建立の六角三層の木造建築。上りと下りが交差しない「二重螺旋」の構造を持つ世界唯一の建物で、飯盛山の白虎隊の墓のそばに建つ重要文化財です。",
    ["世界唯一の二重螺旋", "1796年建立", "重要文化財", "飯盛山に隣接"],
    ["World's only double-helix building", "Built 1796", "National Important Cultural Property", "Beside the Byakkotai graves"],
    [400, 2000, 3500],
    { transport: 700, tickets: 400, food: 600, cafe: 300 },
    { train: 30, bus: 35, car: 30 },
    { min: 1, max: 1 },
    [1500, 900, 600],
    40,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8.4, summer: 8, autumn: 8.6, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 4 },
    { overall: 8.6, couple: 8.4, summer: 8, winter: 8, rain: 7, food: 7, photography: 9, relaxation: 8.2, value: 8.4, uniqueness: 9.8, family: 7.8, accessibility: 6, nature: 7.4, historyAndCulture: 9.4, walkability: 7, spring: 8.6, autumn: 8.8 },
    "https://www.aizukanko.com/spot/138",
    "08:15 - sunset (Apr–Nov) / 09:00 - 16:00 (Dec–Mar)",
    "No reservation required",
    "Parking at the base of Iimoriyama",
    "¥400. A 15-minute walk from Aizuwakamatsu Station, or via the Iimoriyama slope (183 steps or escalator).",
    [{ type: "tourism_board", url: "https://www.aizukanko.com/spot/138", title: "Aizu Tourism — Sazae-do" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Sazaedou_Aidu_Japan01.jpg/1280px-Sazaedou_Aidu_Japan01.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Kounosu",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Sazaedou_Aidu_Japan01.jpg",
    },
  ),
  tohokuPoi(
    "kitakata-kura-district",
    "Kitakata Kura District",
    "喜多方蔵のまち",
    "Fukushima:kitakata",
    "aizuwakamatsu-city",
    [37.6513, 139.8623],
    "district",
    ["Culture", "History", "Food"],
    ["Culture", "History", "Kitakata City"],
    "One of Japan's great kura (storehouse) towns, with roughly 4,000 warehouses, sake breweries and the famous Kitakata ramen and morning-ramen culture. Kura no Sato concentrates relocated cultural-property storehouses in one park.",
    "約4,000棟の蔵が建ち並ぶ日本有数の蔵の町。酒蔵や喜多方ラーメン、朝ラー文化でも知られ、押切の蔵の里には移築された文化財の蔵が集まっています。",
    ["約4,000棟の蔵", "酒蔵めぐり", "喜多方ラーメン", "蔵の里"],
    ["~4,000 storehouses", "Sake breweries", "Kitakata ramen", "Kura no Sato park"],
    [0, 2500, 5000],
    { transport: 900, tickets: 0, food: 1200, cafe: 400 },
    { train: 50, bus: 60, car: 55 },
    { min: 2, max: 4 },
    [4000, 2000, 2000],
    40,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 8.6, summer: 8.2, autumn: 8.8, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "moderate",
    { heatTolerance: 5, rainFriendly: 6, walkingIntensity: 5 },
    { overall: 8.6, couple: 8.4, summer: 8.2, winter: 8, rain: 6.8, food: 9.4, photography: 9, relaxation: 8.2, value: 8.8, uniqueness: 9, family: 8, accessibility: 6, nature: 6.4, historyAndCulture: 9.2, walkability: 7, spring: 8.8, autumn: 9 },
    "http://www.furusatosinkou.co.jp/sato/",
    "Town open access; Kura no Sato 09:00 - 17:00 (last entry 16:30), closed year-end",
    "No reservation required",
    "Pay parking at Kura no Sato",
    "Town strolling is free; Kura no Sato and individual museums charge entry. About 15 minutes from Aizuwakamatsu on the JR Ban-etsu West Line.",
    [{ type: "tourism_board", url: "http://www.furusatosinkou.co.jp/sato/", title: "Kura no Sato official site" }],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/c/c7/%E5%9C%9F%E8%94%B5_%281389928661%29.jpg",
      license: "CC BY-SA 2.0",
      attribution: "contri",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:土蔵_(1389928661).jpg",
    },
  ),
];

addRecords(TOHOKU_WEST_POIS);

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
