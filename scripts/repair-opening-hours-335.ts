/**
 * KAI-335 PR C — source-backed opening-hours repair.
 *
 * Two defect classes:
 *   A) kind-invalid blanket windows on open areas (20 records) → replaced
 *      with kind-appropriate open-access prose (no verification needed —
 *      the claim "one window for a whole street/town/peninsula" is false
 *      by construction).
 *   B) real gated facilities with plausible hours (24 records) → verified
 *      against official sources on 2026-09-05 (openingHoursMetadata:
 *      sourceUrl + verifiedAt). Two records (kasamatsu-park-view,
 *      showa-kinen-park) also get corrected hours matching the source.
 *
 * 2 records stay allowlisted as residuals (chiba-zoological-park,
 * keio-mogusaen): official pages were not reachable/verifiable today —
 * they keep their current hours text and the validator treats them as
 * documented debt. tama-forest-science-garden was verified via the
 * official FFPRI visit page on 2026-09-05.
 *
 * Also rewrites opening-hours-allowlist.json (47 → 2).
 *
 * Usage: npx tsx scripts/repair-opening-hours-335.ts
 * Deterministic: stable key order, fixed verifiedAt, idempotent (records
 * already repaired are skipped).
 */
import { readFileSync, writeFileSync } from "node:fs";

const INDEX = "src/shared/data/destinations-index.json";
const ALLOWLIST = "scripts/validators/opening-hours-allowlist.json";
const VERIFIED_AT = "2026-09-05";

interface Repair {
  businessHours?: string;
  meta?: { sourceUrl: string; verifiedAt: string };
}

const repairs: Record<string, Repair> = {
  // ── Group A: open-area kinds with a blanket window → open-access prose ──
  "gifu-gujo-hachiman": {
    businessHours:
      "Open access (historic town); individual facilities have their own hours",
  },
  "gunma-ikaho-onsen": {
    businessHours:
      "Open access (onsen district); ryokan and public bath hours vary",
  },
  izu: {
    businessHours:
      "Open access (peninsula); individual attractions and facilities have their own hours",
  },
  "izushi-castle-town": {
    businessHours:
      "Open access (castle town); individual facilities have their own hours",
  },
  "jozenji-dori": {
    businessHours:
      "Open access (street); individual facilities have their own hours",
  },
  "kinugawa-onsen": {
    businessHours:
      "Open access (onsen district); ryokan and facility hours vary",
  },
  kiso: {
    businessHours:
      "Open access (valley); individual attractions have their own hours",
  },
  "kouri-island-okinawa": {
    businessHours: "Open access (island); ferry and facility schedules vary",
  },
  "lake-biwa-shiga": {
    businessHours: "Open access (lake); cruise and facility schedules vary",
  },
  "lake-hamanako": {
    businessHours: "Open access (lake); cruise and facility schedules vary",
  },
  "nagano-bessho-onsen": {
    businessHours:
      "Open access (onsen district); ryokan and facility hours vary",
  },
  "nagano-narai-juku": {
    businessHours:
      "Open access (historic town); individual facilities have their own hours",
  },
  "nankinmachi-chinatown": {
    businessHours:
      "Open access (street); individual shops have their own hours",
  },
  "okage-yokocho-oharai-machi": {
    businessHours:
      "Open access (street); individual shops have their own hours",
  },
  "omi-hachiman-canal": {
    businessHours: "Open access (canal district); boat ride schedules vary",
  },
  "senjojiki-sandanbeki-cliffs": {
    businessHours: "Open access (cliffs); observation deck 08:00 - 17:00",
  },
  "shingashi-river": {
    businessHours: "Open access (riverbank); boat cruise schedule varies",
  },
  "tanukikoji-shopping-street": {
    businessHours:
      "Open access (arcade); individual shops have their own hours",
  },
  "tomogashima-islands": {
    businessHours: "Open access (islands); ferry schedule varies by season",
  },
  zushi: {
    businessHours:
      "Open access (coastal town); individual facilities have their own hours",
  },

  // ── Group B: verified against official sources, 2026-09-05 ──
  "abeno-harukas-300-osaka": {
    meta: {
      sourceUrl: "https://www.abenoharukas-300.jp/observatory/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "bizan-ropeway-tokushima": {
    meta: {
      sourceUrl:
        "https://www.city.tokushima.tokushima.jp/multilingual/english_portal/tourism_culture/mt_bizan/ropeway.html",
      verifiedAt: VERIFIED_AT,
    },
  },
  "fujita-memorial-garden": {
    meta: {
      sourceUrl: "http://www.hirosakipark.or.jp/hujita/",
      verifiedAt: VERIFIED_AT,
    },
  },
  fukuurajima: {
    meta: {
      sourceUrl: "https://www.town.miyagi-matsushima.lg.jp/page/1578.html",
      verifiedAt: VERIFIED_AT,
    },
  },
  "genbudo-cave-park": {
    meta: { sourceUrl: "https://genbudo-park.jp/", verifiedAt: VERIFIED_AT },
  },
  "genkyuen-garden": {
    meta: {
      sourceUrl:
        "https://www.hikoneshi.com/ee5/index.php/sightseeing/articles/genkyuen",
      verifiedAt: VERIFIED_AT,
    },
  },
  "hamarikyu-gardens": {
    meta: {
      sourceUrl: "https://www.tokyo-park.or.jp/park/hama-rikyu/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "hiei-zan-driveway-observatory": {
    businessHours: "07:00 – 23:00 (varies by season; see official site)",
    meta: {
      sourceUrl: "https://www.hieizan-way.com/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "jindai-botanical-gardens": {
    meta: {
      sourceUrl: "https://www.tokyo-park.or.jp/park/jindai/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "kasamatsu-park-view": {
    businessHours:
      "09:00 – 18:00 (Mar–Nov); 09:00 – 17:30 (Feb); 09:00 – 17:00 (Dec–Jan); no closed days",
    meta: {
      sourceUrl: "https://www.amanohashidate.jp/spot/kasamatsu/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "kenroku-en": {
    meta: {
      sourceUrl: "https://www.pref.ishikawa.jp/siro-niwa/kenrokuen/info.html",
      verifiedAt: VERIFIED_AT,
    },
  },
  "kiyosumi-gardens": {
    businessHours: "09:00 - 17:00 (Last entry 16:30; closed Dec 29 - Jan 1)",
    meta: {
      sourceUrl: "https://www.tokyo-park.or.jp/park/kiyosumi/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "koiwai-farm": {
    businessHours:
      "09:00 - 17:00 (Last entry 16:00; winter Dec–Feb weekends/holidays only per official calendar)",
    meta: { sourceUrl: "https://www.koiwaifarm.com/", verifiedAt: VERIFIED_AT },
  },
  "koko-en-garden": {
    businessHours: "09:00 - 17:00 (Last entry 16:30; closed Dec 29 - 30)",
    meta: {
      sourceUrl: "http://himeji-machishin.jp/ryokka/kokoen/guidance/index.html",
      verifiedAt: VERIFIED_AT,
    },
  },
  "makino-botanical-garden": {
    meta: {
      sourceUrl: "https://www.makino.or.jp/multilingual/?lang=en",
      verifiedAt: VERIFIED_AT,
    },
  },
  "matsue-vogel-park": {
    meta: {
      sourceUrl: "https://www.ichibata.co.jp/vogelpark/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "mukojima-hyakkaen": {
    businessHours: "09:00 - 17:00 (Last entry 16:30; closed Mon)",
    meta: {
      sourceUrl: "https://www.tokyo-park.or.jp/park/mukojima-hyakkaen/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "nakazu-banshoen-marugame": {
    meta: {
      sourceUrl: "https://www.city.marugame.lg.jp/page/3065.html",
      verifiedAt: VERIFIED_AT,
    },
  },
  "orizuru-tower": {
    meta: {
      sourceUrl: "https://www.orizurutower.jp/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "shinjuku-gyo-en": {
    meta: {
      sourceUrl: "https://www.env.go.jp/garden/shinjukugyoen/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "showa-kinen-park": {
    businessHours:
      "09:30 - 17:00 (Mar–Oct), 09:30 - 16:30 (Nov–Feb), closed Dec 31 - Jan 1 + February maintenance period; extended hours during festivals (see official calendar)",
    meta: {
      sourceUrl: "https://www.showakinen-koen.jp/",
      verifiedAt: VERIFIED_AT,
    },
  },
  shukkeien: {
    businessHours:
      "09:00–18:00 (Mar 16–Sep 15); 09:00–17:00 (Sep 16–Mar 15); entry until 30 min before close; closed Dec 29–31",
    meta: { sourceUrl: "https://shukkeien.jp/en/", verifiedAt: VERIFIED_AT },
  },
  "tenshaen-garden-uwajima": {
    meta: {
      sourceUrl:
        "https://www.city.uwajima.ehime.jp/site/datehaku-top/datehaku-riyou.html",
      verifiedAt: VERIFIED_AT,
    },
  },
  "uzu-no-michi-naruto": {
    meta: {
      sourceUrl: "https://www.uzunomichi.jp/usage-guide-uzu-no-michi/",
      verifiedAt: VERIFIED_AT,
    },
  },
  "tama-forest-science-garden": {
    businessHours:
      "09:30 - 16:00 (Last entry 15:30; opens 09:00 in April); closed Mondays (unless public holiday) and Dec 26 - Jan 6",
    meta: {
      sourceUrl: "https://www.ffpri.go.jp/tmk/visit/index.html",
      verifiedAt: VERIFIED_AT,
    },
  },
};

const index = JSON.parse(readFileSync(INDEX, "utf8"));
const list = Array.isArray(index) ? index : Object.values(index);
const byId = new Map(list.map((d: { id: string }) => [d.id, d]));

let groupA = 0;
let groupB = 0;
let skipped = 0;
for (const [id, repair] of Object.entries(repairs)) {
  const d = byId.get(id);
  if (!d) {
    console.error(`missing record: ${id}`);
    process.exitCode = 1;
    continue;
  }
  const hoursSame =
    !repair.businessHours || d.businessHours === repair.businessHours;
  const metaSame =
    !repair.meta ||
    (d.openingHoursMetadata?.sourceUrl === repair.meta.sourceUrl &&
      d.openingHoursMetadata?.verifiedAt === repair.meta.verifiedAt);
  if (hoursSame && metaSame) {
    skipped += 1;
    continue;
  }
  if (repair.businessHours) {
    d.businessHours = repair.businessHours;
    groupA += 1;
  }
  if (repair.meta) {
    d.openingHoursMetadata = { ...repair.meta };
    groupB += 1;
  }
}

writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");

const residuals = ["chiba-zoological-park", "keio-mogusaen"];
writeFileSync(ALLOWLIST, JSON.stringify(residuals, null, 2) + "\n");

console.log(
  JSON.stringify({ groupA, groupB, skipped, allowlistAfter: residuals.length }),
);
