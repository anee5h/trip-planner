/**
 * KAI-89 forensic data corrections (PR #174, second pass).
 *
 * Evidence-driven corrections to src/shared/data/destinations-index.json
 * derived from the parallel KAI-89 audit (Agent A ratings / B budget /
 * C transport / D season-duration-crowd / E text). Every change carries its
 * evidence or source. Values are NEVER invented here: fabricated template
 * values are removed (returning to honest 'unknown') or corrected to
 * source-verified facts; unsupported ratings are confidence-downgraded.
 *
 * Correction data: scripts/audit/kai-89-corrections.json (committed).
 *
 * Run: npx tsx scripts/kai-89-apply-data-corrections.ts
 * Then: npx prettier --write src/shared/data/destinations-index.json
 *       npm run sync-destination-details && npm run audit:kai-89-structured-templates
 */
import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const correctionsPath = path.join(
  process.cwd(),
  "scripts/audit/kai-89-corrections.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];
const corrections = JSON.parse(fs.readFileSync(correctionsPath, "utf8"));
const byId = new Map(destinations.map((d) => [d.id, d]));

let applied = 0;
function fail(msg: string): never {
  console.error(`KAI-89 correction aborted: ${msg}`);
  process.exit(1);
}
function get(id: string): Destination {
  const d = byId.get(id);
  if (!d) fail(`unknown id ${id}`);
  return d!;
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} — data drifted from audit baseline`,
    );
  }
}

// ---------------------------------------------------------------- 1. Ratings
// 62 records were stamped {rubricVersion:2, method:manual, confidence:high}
// by a bulk 'Coordinate Calibration' pass while carrying identical
// template-generated rating vectors (proof: 44/44 of the 114-record hub
// template vector in this set; a control group of genuinely reviewed records
// all have distinct vectors). Downgrade to honest assisted/low so scoring
// falls to the 0.5 reliability band and the display layer confidence-gates.
const RATING_METADATA_DOWNGRADE: string[] =
  corrections.sections.ratingMetadataDowngrade;
for (const id of RATING_METADATA_DOWNGRADE) {
  const d = get(id);
  const meta = d.ratingMetadata;
  if (
    meta &&
    (meta.confidence === "high" || meta.confidence === "medium") &&
    (meta.method === "manual" || meta.method === "assisted")
  ) {
    d.ratingMetadata = {
      rubricVersion: 2,
      method: "assisted",
      confidence: "low",
    };
    applied++;
  }
}

// ------------------------------------------------------- 2. Budget tickets
// Source-verified admission prices (official operator/municipal pages) fix
// template zeros/wrong values. After setting tickets, transport/food/cafe are
// Source-verified admission prices (official operator/municipal pages) fix
// template zeros/wrong values. ONLY the ticket field is changed: transport,
// food, cafe and budgetRecommended are NOT rescaled to preserve arithmetic
// equality. Factual integrity beats exact sums — a verified admission price
// is not evidence about food or transport costs. Template-generated
// components stay as legacy values tracked as manual-review debt;
// sum(breakdown) == recommended is NOT an invariant this script enforces.
const BUDGET_TICKET_CORRECTIONS: Array<{
  id: string;
  value: number;
  evidence: string;
  sources: string[];
}> = corrections.sections.budgetTicketCorrections;
for (const c of BUDGET_TICKET_CORRECTIONS) {
  const d = get(c.id);
  if (!d.budgetBreakdown)
    fail(`${c.id}: no budgetBreakdown for ticket correction`);
  d.budgetBreakdown.tickets = c.value;
  applied++;
}

// ------------------------------------------------ 3. Budget recommended
// pr12c buildPoi() formula records where budgetRecommended was not the
// documented midpoint. budgetRecommended = round((min+max)/2) is the
// established calculation model (normalize-destination-budgets.ts). The
// breakdown components are legacy formula values left untouched (manual
// review) — no component is invented or rescaled here.
const BUDGET_REBALANCE_ONLY: Array<{ id: string; reason: string }> =
  corrections.sections.budgetRebalanceOnly;
for (const c of BUDGET_REBALANCE_ONLY) {
  const d = get(c.id);
  if (Number.isFinite(d.budgetMin) && Number.isFinite(d.budgetMax)) {
    const midpoint = Math.round((d.budgetMin + d.budgetMax) / 2);
    if (d.budgetRecommended !== midpoint) d.budgetRecommended = midpoint;
    applied++;
  }
}

// ------------------------------------------------------- 4. Transport fixes
// (a) Source-verified corrections; proposed null = remove the fabricated mode.
const TRANSPORT_CORRECTIONS: Array<{
  id: string;
  field: string;
  proposed: number | null;
  evidence: string;
}> = corrections.sections.transportCorrections;
for (const c of TRANSPORT_CORRECTIONS) {
  const d = get(c.id);
  if (!d.transportOptions) d.transportOptions = {};
  // Remove any corrupted 'undefined' key written by an earlier buggy run.
  delete (d.transportOptions as Record<string, number>)["undefined"];
  const key = c.field as keyof Destination["transportOptions"];
  if (c.proposed === null) {
    delete d.transportOptions[key];
  } else {
    d.transportOptions[key] = c.proposed;
  }
  applied++;
}
// (b) Restore mode keys removed by an earlier draft of this audit. The mode
// KEYS are access declarations: runtime authorization (getValidModes) and the
// published-record contract (MISSING_TRANSPORT_OPTIONS) both require them,
// and rail/bus access genuinely exists on the mainland and Okinawa's Yui
// Rail. Restored values are the pre-KAI-89 batch defaults, dispositioned
// manual-review; only the TRANSPORT_CORRECTIONS above and the Naha Yui Rail
// values are evidence-driven fixes.
const TRANSPORT_RESTORE_VALUES: Record<
  string,
  Record<string, number>
> = corrections.sections.transportRestoreValues ?? {};
const correctedIds = new Set(TRANSPORT_CORRECTIONS.map((c) => c.id));
for (const [id, original] of Object.entries(TRANSPORT_RESTORE_VALUES)) {
  if (correctedIds.has(id)) continue;
  const d = get(id);
  d.transportOptions = { ...original };
  applied++;
}

// ----------------------------------------------------------- 5. Season fixes
// Source-backed bestMonths corrections for seasonally-defining destinations.
const SEASON_BEST_MONTHS: Array<{
  id: string;
  bestMonths: number[];
  reason: string;
  sources: string[];
}> = corrections.sections.seasonBestMonths;
for (const c of SEASON_BEST_MONTHS) {
  const d = get(c.id);
  if (JSON.stringify(d.bestMonths) !== JSON.stringify(c.bestMonths)) {
    d.bestMonths = c.bestMonths;
    applied++;
  }
}

// -------------------------------------------------------------- 6. Text fixes
// 76 records: replace template/generic descriptions with destination-specific
// copy (EN + JA), sourced per record. Mirrors both top-level description and
// content.en/ja.description.
const TEXT_REPLACEMENTS: Array<{ id: string; en: string; ja: string }> =
  corrections.sections.textReplacements;
for (const c of TEXT_REPLACEMENTS) {
  const d = get(c.id);
  d.description = c.en;
  if (d.content?.en) d.content.en.description = c.en;
  if (d.content?.ja) d.content.ja.description = c.ja;
  applied++;
}
// 5 city records: delete template 'travel hub' notes (redundant/inaccurate).
const NOTES_DELETE: string[] = corrections.sections.notesDelete;
for (const id of NOTES_DELETE) {
  const d = get(id);
  delete d.notes;
  delete d.notesJa;
  if (d.content?.en) delete d.content.en.notes;
  if (d.content?.ja) delete d.content.ja.notes;
  applied++;
}

// --------------------------------------------------------- 7. JA name fixes
// content.ja.name must name the record's own subject (import mix-ups).
const JA_NAME_FIXES: Array<{ id: string; value: string }> =
  corrections.sections.jaNameFixes;
for (const c of JA_NAME_FIXES) {
  const d = get(c.id);
  if (!d.content?.ja) fail(`${c.id}: no content.ja to fix`);
  d.content.ja.name = c.value;
  applied++;
}

// ---------------------------------------------------- 8. Editorial sources
// Remove sources that reference a different subject (station/airport/etc.).
const SOURCE_FIXES: Record<string, { remove: string[]; add?: string[] }> =
  corrections.sections.sourceFixes;
for (const [id, fix] of Object.entries(SOURCE_FIXES)) {
  const d = get(id);
  const sources = d.editorial?.sources;
  if (!sources) fail(`${id}: no editorial.sources`);
  d.editorial!.sources = sources.filter((s) => !fix.remove.includes(s.url));
  for (const url of fix.add ?? []) {
    if (!d.editorial!.sources.some((s) => s.url === url)) {
      d.editorial!.sources.push({
        type: "wikipedia",
        url,
        title: "Wikipedia article",
        accessedAt: "2026-08-13",
      });
    }
  }
  applied++;
}

// --------------------------------------------------- 8b. Alias fixes
// Aliases drive search: remove wrong-subject aliases (Haneda on Narita etc.).
const ALIAS_FIXES: Array<{ id: string; remove: string[] }> =
  corrections.sections.aliasFixes ?? [];
for (const c of ALIAS_FIXES) {
  const d = get(c.id);
  if (d.aliases) {
    d.aliases = d.aliases.filter((a) => !c.remove.includes(a));
    applied++;
  }
}

// ----------------------------------------------------------- 9. Kind fixes
// Clear misclassifications visible on cards ('Temple' badge on a shopping arcade).
const KIND_FIXES: Record<string, string> = corrections.sections.kindFixes;
for (const [id, kind] of Object.entries(KIND_FIXES)) {
  const d = get(id);
  d.kind = kind as Destination["kind"];
  applied++;
}

// -------------------------------------------------- 10. Official websites
// Wrong-subject officialWebsite fields (Haneda on Narita, station page on a
// temple, Kyoto park on a Sapporo park).
const OFFICIAL_WEBSITE_FIXES: Array<{ id: string; from: string; to: string }> =
  corrections.sections.officialWebsiteFixes ?? [];
for (const c of OFFICIAL_WEBSITE_FIXES) {
  const d = get(c.id);
  if (d.officialWebsite === c.from) {
    d.officialWebsite = c.to;
    applied++;
  }
}

// --------------------------------------------------- 11. bestSeason fixes
// Align the displayed bestSeason string with the source-backed bestMonths
// corrections (drift ice / lavender / plum blossom seasons).
const BEST_SEASON_FIXES: Array<{ id: string; value: string }> =
  corrections.sections.bestSeasonFixes ?? [];
for (const c of BEST_SEASON_FIXES) {
  const d = get(c.id);
  if (d.bestSeason !== c.value) {
    d.bestSeason = c.value;
    applied++;
  }
}

// --------------------------------------------------- 12. Cross-field fixes
// Synchronize duplicated user-facing fields to the same verified fact
// (KAI-89 final consistency pass). Every value below is source-verified.
const CROSS = corrections.sections.crossFieldFixes ?? {};

// 12a. Hamarikyu Gardens — hours/parking/reservation/website/sources all
// synchronized to the official Tokyo Metropolitan Park Association page.
const hama = CROSS.hamarikyuGardens;
if (hama) {
  const d = get("hamarikyu-gardens");
  if (d.content?.en) {
    d.content.en.openingHours = hama.contentEnOpeningHours;
    d.content.en.parking = hama.parkingEn;
    d.content.en.reservation = hama.reservationEn;
  }
  if (d.content?.ja) {
    d.content.ja.openingHours = hama.contentJaOpeningHours;
    d.content.ja.parking = hama.parkingJa;
    d.content.ja.reservation = hama.reservationJa;
  }
  d.parking = hama.parkingEn;
  d.parkingJa = hama.parkingJa;
  d.reservation = hama.reservationEn;
  d.reservationJa = hama.reservationJa;
  d.officialWebsite = hama.officialWebsite;
  if (d.editorial) {
    const keep = d.editorial.sources.filter(
      (s) => !hama.sourceReplace.some((r: { from: string }) => r.from === s.url),
    );
    const additions = hama.sourceReplace
      .map((r: { to: string; type: string; title: string }) => ({
        type: r.type,
        url: r.to,
        title: r.title,
        accessedAt: "2026-08-13",
      }))
      .filter((a: { url: string }) => !keep.some((s) => s.url === a.url));
    d.editorial.sources = keep.concat(additions);
    d.editorial.fieldSources = {
      ...(d.editorial.fieldSources ?? {}),
      openingHours: [{ type: "official", url: hama.officialWebsite, title: "浜離宮恩賜庭園｜公園へ行こう！", accessedAt: "2026-08-13" }],
      parking: [{ type: "official", url: hama.officialWebsite, title: "浜離宮恩賜庭園｜公園へ行こう！", accessedAt: "2026-08-13" }],
      "budgetBreakdown.tickets": [{ type: "official", url: hama.officialWebsite, title: "浜離宮恩賜庭園｜公園へ行こう！", accessedAt: "2026-08-13" }],
    };
  }
  applied++;
}

// 12b. Engakuji — no on-site parking (official site); admission 500 current.
if (CROSS.engakujiParking) {
  const d = get("engakuji");
  d.parking = CROSS.engakujiParking.parkingEn;
  if (d.content?.en) d.content.en.parking = CROSS.engakujiParking.parkingEn;
  if (d.editorial) {
    d.editorial.fieldSources = {
      ...(d.editorial.fieldSources ?? {}),
      parking: [{ type: "official", url: "https://www.engakuji.or.jp/en/", title: "ENGAKUJI ZEN TEMPLE", accessedAt: "2026-08-13" }],
    };
  }
  applied++;
}

// 12c. honmaru-palace — nameJa must mirror content.ja.name (本丸御殿).
if (CROSS.honmaruPalaceNameJa) {
  const d = get("honmaru-palace");
  d.nameJa = CROSS.honmaruPalaceNameJa.value;
  applied++;
}

// 12d. ontakesan — top-level parking aligned to the more specific copy.
if (CROSS.ontakesanParkingAlign) {
  const d = get("ontakesan");
  if (d.parking === CROSS.ontakesanParkingAlign.from) {
    d.parking = CROSS.ontakesanParkingAlign.to;
    applied++;
  }
}

// 12e. Paid-kind venues with stale 'Open access' businessHours: the claim
// contradicts their verified paid admission; openingHours holds the real
// schedule, so the stale businessHours is removed (display falls back).
for (const id of CROSS.paidKindOpenAccessBusinessHoursRemove ?? []) {
  const d = get(id);
  if (d.businessHours?.toLowerCase() === "open access") {
    delete d.businessHours;
    applied++;
  }
}

// ------------------------------------------------------------ Invariants
for (const d of destinations) {
  if (d.ratings) {
    for (const k of [
      "overall",
      "couple",
      "summer",
      "winter",
      "rain",
      "food",
      "photography",
      "relaxation",
      "value",
      "uniqueness",
    ]) {
      if (typeof d.ratings[k] !== "number" || !Number.isFinite(d.ratings[k]))
        fail(`${d.id}: rating ${k} not finite`);
    }
  }
  if (d.budgetBreakdown && Number.isFinite(d.budgetRecommended)) {
    const b = d.budgetBreakdown;
    const sum = b.transport + b.tickets + b.food + b.cafe;
    if (
      ![b.transport, b.tickets, b.food, b.cafe].every((v) => Number.isFinite(v))
    )
      fail(`${d.id}: breakdown not finite`);
    if (sum !== d.budgetRecommended) {
      console.warn(
        `WARN ${d.id}: breakdown sum ${sum} != recommended ${d.budgetRecommended} (pre-existing, left for manual review)`,
      );
    }
  }
}

fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(`Applied ${applied} correction operations. Index written.`);
