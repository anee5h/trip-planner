import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Destination } from "@/shared/types/destination";
import type { RecommendationContext } from "@/shared/services/recommendation/RecommendationContext";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { evaluateSeasonalSuitability } from "@/shared/services/recommendation/SeasonalSuitabilityService";
import { validateThematicReview, type ThematicPhase } from "./kai-151-thematic-validator";

type JsonObject = Record<string, any>;
type Duration = "shortOuting" | "halfDay" | "fullDay" | "2d1n" | "3d2n";
const root = process.cwd();
const phase = String(process.argv[2] ?? "") as ThematicPhase;
const config: Record<string, { review: string; output: string; peak: string; off: string }> = {
  "2B": { review: "scripts/audit/kai-151-foliage-phase2b-review.json", output: "scripts/audit/kai-151-foliage-phase2b-impact.json", peak: "2026-11-10", off: "2026-07-20" },
  "2C": { review: "scripts/audit/kai-151-winter-phase2c-review.json", output: "scripts/audit/kai-151-winter-phase2c-impact.json", peak: "2026-01-20", off: "2026-07-20" },
  "2D": { review: "scripts/audit/kai-151-alpine-phase2d-review.json", output: "scripts/audit/kai-151-alpine-phase2d-impact.json", peak: "2026-08-15", off: "2026-01-20" },
  "2E": { review: "scripts/audit/kai-151-summer-phase2e-review.json", output: "scripts/audit/kai-151-summer-phase2e-impact.json", peak: "2026-07-20", off: "2026-01-20" },
};
if (!config[phase]) throw new Error(`unknown KAI-151 thematic phase: ${phase}`);

const REAL_DATE = Date;
const frozenClockMs = REAL_DATE.parse("2026-09-02T12:00:00+09:00");
class FrozenDate extends REAL_DATE {
  constructor(...args: ConstructorParameters<typeof REAL_DATE>) {
    if (args.length === 0) super(frozenClockMs);
    else super(...args);
  }
  static now() { return frozenClockMs; }
}
process.env.TZ = "Asia/Tokyo";
globalThis.Date = FrozenDate as unknown as DateConstructor;

const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const review = readJson(config[phase].review) as JsonObject;
const after = readJson("src/shared/data/destinations-index.json") as Destination[];
validateThematicReview(review, after, phase);
const before = JSON.parse(execFileSync("git", ["show", `${review.baseCommit}:src/shared/data/destinations-index.json`], { cwd: root, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 })) as Destination[];
const origins = [
  { id: "tokyo", coords: { lat: 35.6812, lng: 139.7671 } },
  { id: "osaka", coords: { lat: 34.7025, lng: 135.4959 } },
  { id: "fukuoka", coords: { lat: 33.5897, lng: 130.4207 } },
];
const durations: Duration[] = ["shortOuting", "halfDay", "fullDay", "2d1n", "3d2n"];
const ids = (review.records as JsonObject[]).map((row) => String(row.id)).sort();
const beforeById = new Map(before.map((row) => [row.id, row]));
const afterById = new Map(after.map((row) => [row.id, row]));

function context(origin: (typeof origins)[number], date: string, duration: Duration): RecommendationContext {
  return {
    vibe: "any", budget: 100000, budgetTier: "standard", carMode: "none",
    publicModes: ["train", "shinkansen", "bus", "flight", "ferry"], partySize: 2,
    visitedIds: [], homeStationCoords: origin.coords, tripDuration: duration,
    travelDates: { day1: date, startDate: date, endDate: date },
    ferryTemporal: { travelDate: new Date(`${date}T03:00:00.000Z`) },
  };
}
function rank(rows: any[], id: string): number | null {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const index = sorted.findIndex((row) => row.id === id);
  return index < 0 ? null : index + 1;
}
function round(value: number): number { return Math.round(value * 100) / 100; }
function classify(delta: number, seasonalDelta: number, beforeRank: number | null, afterRank: number | null, date: string): string {
  if (beforeRank === null || afterRank === null) return "insufficient_evidence";
  const movement = Math.abs(afterRank - beforeRank);
  if (seasonalDelta === 0 && movement > 0) return "unrelated_ranking_effect";
  if (date === config[phase].off && seasonalDelta > 0 && movement > 60) return "possible_seasonality_overweighting";
  if (movement > 80 && seasonalDelta > 0) return "large_but_explainable_change";
  if (Math.abs(delta) > 15 || movement > 35) return "large_but_explainable_change";
  return "proportionate_expected_change";
}

const rows: JsonObject[] = [];
for (const date of [config[phase].peak, config[phase].off]) {
  for (const origin of origins) {
    for (const duration of durations) {
      const ctx = context(origin, date, duration);
      const beforeRows = getRecommendations(before, ctx) as any[];
      const afterRows = getRecommendations(after, ctx) as any[];
      for (const id of ids) {
        const oldDest = beforeById.get(id)!;
        const newDest = afterById.get(id)!;
        const beforeRow = beforeRows.find((row) => row.id === id);
        const afterRow = afterRows.find((row) => row.id === id);
        const beforeSeason = evaluateSeasonalSuitability(oldDest, [date]);
        const afterSeason = evaluateSeasonalSuitability(newDest, [date]);
        const beforeRank = rank(beforeRows, id);
        const afterRank = rank(afterRows, id);
        const scoreDelta = round((afterRow?.score ?? 0) - (beforeRow?.score ?? 0));
        const seasonalDelta = round(afterSeason.scoreDelta - beforeSeason.scoreDelta);
        rows.push({ phase, id, date, origin: origin.id, duration, beforeRank, afterRank, rankDelta: beforeRank !== null && afterRank !== null ? beforeRank - afterRank : null, beforeScore: beforeRow ? round(beforeRow.score) : null, afterScore: afterRow ? round(afterRow.score) : null, scoreDelta, beforeSeasonalDelta: round(beforeSeason.scoreDelta), afterSeasonalDelta: round(afterSeason.scoreDelta), seasonalDelta, beforeSeasonalEvidence: beforeSeason.evidence, afterSeasonalEvidence: afterSeason.evidence, classification: classify(scoreDelta, seasonalDelta, beforeRank, afterRank, date) });
      }
    }
  }
}
const counts: Record<string, number> = {};
for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
const output = { ticket: "KAI-151", phase, baseCommit: review.baseCommit, checkedAt: "2026-09-02", scenarioDefinition: "3 representative origins × 5 planner durations × one in-season and one materially off-season date; existing recommendation pipeline only", targetIds: ids, summary: { scenarioRows: rows.length, classifications: Object.fromEntries(Object.entries(counts).sort()) }, rows };
writeFileSync(resolve(root, config[phase].output), `${JSON.stringify(output, null, 2)}\n`, "utf8");
const markdownPath = config[phase].output.replace(".json", ".md");
const md = [
  `# KAI-151 Phase ${phase} recommendation sensitivity`,
  "",
  `- Base commit: \`${review.baseCommit}\``,
  `- Scenarios: ${output.scenarioDefinition}`,
  `- Target IDs: ${ids.length}`,
  "",
  "## Classification counts",
  "",
  "| Classification | Rows |",
  "| --- | ---: |",
  ...Object.entries(output.summary.classifications).map(([key, value]) => `| ${key} | ${value} |`),
  "",
  "## Method",
  "",
  "The report compares the existing recommendation pipeline before and after the authorized canonical seasonality mutations. It records rank, score, seasonal attribution, date position, origin, and planner duration. It does not modify ranking weights or production code.",
  "",
  "## Review gate",
  "",
  "A rank change is treated as expected only when it is attributable to the new structured seasonal fields and remains compatible with the selected date and duration. Missing or unavailable rows are retained as `insufficient_evidence`; no data was changed to force rank movement.",
];
writeFileSync(resolve(root, markdownPath), `${md.join("\n")}\n`, "utf8");
console.log(`KAI-151 Phase ${phase} impact rows=${rows.length} classifications=${JSON.stringify(output.summary.classifications)}`);
