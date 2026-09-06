import fs from "node:fs";
import path from "node:path";
import { expectedSeasonMetadata } from "./audit/kai-151-thematic-validator";

type JsonObject = Record<string, any>;
const root = process.cwd();
const cataloguePath = path.join(
  root,
  "src/shared/data/destinations-index.json",
);
const reviewPath = path.join(
  root,
  "scripts/audit/kai-151-p1b-season-review.json",
);
const catalogue = JSON.parse(
  fs.readFileSync(cataloguePath, "utf8"),
) as JsonObject[];
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8")) as JsonObject;
const baseCommit = "609219e8dc69d56a3d11405840b3c06f6daa3b71";
const allowedGroups = new Set([
  "nature-scenic-high-value",
  "gardens-flower-parks",
  "onsen",
  "mountains-highlands",
]);
const classifications = new Set([
  "insufficient_evidence",
  "verified_seasonal_window",
  "verified_year_round_with_seasonal_peak",
  "conflicting_or_ambiguous",
]);

function fail(message: string): never {
  throw new Error(`KAI-151 P1-B validation failed: ${message}`);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}
function stable(value: unknown): string {
  return JSON.stringify(value);
}
function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function seasonFields(destination: JsonObject): JsonObject {
  return {
    bestSeason: destination.bestSeason ?? null,
    bestMonths: destination.bestMonths ?? null,
    season: destination.season ?? null,
    seasonMetadata: destination.seasonMetadata ?? null,
  };
}
function requireMonths(value: unknown, id: string): asserts value is number[] {
  assert(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (month) => Number.isInteger(month) && month >= 1 && month <= 12,
      ) &&
      value.every((month, index) => index === 0 || month > value[index - 1]),
    `${id}: proposed.bestMonths must be sorted unique months 1..12`,
  );
}
function requireVector(
  value: unknown,
  id: string,
): asserts value is JsonObject {
  assert(isObject(value), `${id}: proposed.seasonVector must be an object`);
  assert(
    stable(Object.keys(value).sort()) ===
      stable(["autumn", "spring", "summer", "winter"]),
    `${id}: proposed.seasonVector keys are invalid`,
  );
  for (const season of ["spring", "summer", "autumn", "winter"]) {
    assert(
      typeof value[season] === "number" &&
        Number.isFinite(value[season]) &&
        value[season] >= 0 &&
        value[season] <= 10,
      `${id}: proposed.seasonVector.${season} must be 0..10`,
    );
  }
}
function validateTrace(row: JsonObject): void {
  assert(
    Array.isArray(row.researchQueries) && row.researchQueries.length >= 2,
    `${row.id}: bounded research queries required`,
  );
  assert(
    Array.isArray(row.researchLeads),
    `${row.id}: researchLeads must be an array`,
  );
}
function validateOfficialEvidence(row: JsonObject): void {
  assert(
    Array.isArray(row.officialEvidence) && row.officialEvidence.length > 0,
    `${row.id}: official evidence required for mutation`,
  );
  for (const entry of row.officialEvidence) {
    assert(isObject(entry), `${row.id}: evidence entry must be an object`);
    assert(
      typeof entry.authority === "string" && entry.authority.trim(),
      `${row.id}: evidence authority required`,
    );
    assert(
      Array.isArray(entry.urls) &&
        entry.urls.length > 0 &&
        entry.urls.every(
          (url: unknown) =>
            typeof url === "string" && url.startsWith("https://"),
        ),
      `${row.id}: official https evidence URLs required`,
    );
    assert(
      Array.isArray(entry.observations) &&
        entry.observations.length > 0 &&
        entry.observations.every(
          (text: unknown) => typeof text === "string" && text.trim(),
        ),
      `${row.id}: evidence observations required`,
    );
  }
}
function proposedFields(row: JsonObject): JsonObject {
  return {
    bestSeason: row.proposed.bestSeason,
    bestMonths: row.proposed.bestMonths,
    season: row.proposed.seasonVector,
    seasonMetadata: expectedSeasonMetadata(
      "P1-B",
      row.proposed.bestSeason,
      row.proposed.bestMonths,
    ),
  };
}
function withoutSeasonFields(value: JsonObject): JsonObject {
  const copy = JSON.parse(JSON.stringify(value)) as JsonObject;
  delete copy.bestSeason;
  delete copy.bestMonths;
  delete copy.season;
  delete copy.seasonMetadata;
  return copy;
}

export function validateP1BReview(): "pre" | "post" {
  assert(review.ticket === "KAI-151", "ticket mismatch");
  assert(review.phase === "P1-B", "phase mismatch");
  assert(review.baseCommit === baseCommit, "unexpected base commit");
  assert(
    typeof review.candidateDefinition === "string" &&
      review.candidateDefinition.trim(),
    "candidateDefinition required",
  );
  assert(
    typeof review.selectionMethod === "string" && review.selectionMethod.trim(),
    "selectionMethod required",
  );
  assert(Array.isArray(review.records), "records must be an array");

  const rows = review.records as JsonObject[];
  const ids = rows.map((row) => String(row.id));
  assert(rows.length === 79, `expected 79 records, got ${rows.length}`);
  assert(new Set(ids).size === ids.length, "review has duplicate IDs");
  const byId = new Map(
    catalogue.map((destination) => [destination.id, destination]),
  );
  let pre = true;
  let post = true;
  let mutations = 0;
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const id = String(row.id);
    const destination = byId.get(id);
    assert(destination, `${id}: missing from catalogue`);
    assert(row.phase === "P1-B", `${id}: phase mismatch`);
    assert(allowedGroups.has(String(row.group)), `${id}: invalid group`);
    assert(
      typeof row.cohortReason === "string" && row.cohortReason.trim(),
      `${id}: cohortReason required`,
    );
    assert(
      classifications.has(String(row.classification)),
      `${id}: invalid classification`,
    );
    validateTrace(row);
    assert(isObject(row.currentFields), `${id}: currentFields required`);
    const actual = seasonFields(destination);
    const expectedPost = row.mutationAllowed
      ? proposedFields(row)
      : row.currentFields;
    pre = pre && stable(actual) === stable(row.currentFields);
    post = post && stable(actual) === stable(expectedPost);
    counts[row.classification] = (counts[row.classification] ?? 0) + 1;

    assert(
      typeof row.mutationAllowed === "boolean",
      `${id}: mutationAllowed required`,
    );
    const proposed = row.proposed;
    assert(isObject(proposed), `${id}: proposed required`);
    if (row.mutationAllowed) {
      assert(
        row.classification === "verified_seasonal_window" ||
          row.classification === "verified_year_round_with_seasonal_peak",
        `${id}: invalid mutation classification`,
      );
      assert(proposed.apply === true, `${id}: mutation proposal must apply`);
      assert(
        typeof proposed.bestSeason === "string" && proposed.bestSeason.trim(),
        `${id}: bestSeason required`,
      );
      requireMonths(proposed.bestMonths, id);
      requireVector(proposed.seasonVector, id);
      validateOfficialEvidence(row);
      if (row.classification === "verified_year_round_with_seasonal_peak") {
        assert(
          Array.isArray(row.yearRoundEvidence) &&
            row.yearRoundEvidence.length > 0,
          `${id}: year-round evidence required`,
        );
        assert(
          Array.isArray(row.peakEvidence) && row.peakEvidence.length > 0,
          `${id}: independent peak evidence required`,
        );
      }
      mutations += 1;
    } else {
      assert(
        row.classification === "insufficient_evidence" ||
          row.classification === "conflicting_or_ambiguous",
        `${id}: invalid non-mutation classification`,
      );
      assert(proposed.apply === false, `${id}: non-mutation must apply=false`);
      assert(
        proposed.bestSeason === null &&
          proposed.bestMonths === null &&
          proposed.seasonVector === null,
        `${id}: non-mutation proposal must be null`,
      );
      assert(
        row.yearRoundEvidence.length === 0 && row.peakEvidence.length === 0,
        `${id}: non-mutation cannot carry year-round/peak evidence`,
      );
    }
  }

  assert(
    pre || post,
    "catalogue is neither complete pre-state nor complete post-state",
  );
  assert(review.summary.candidateCount === rows.length, "candidateCount stale");
  assert(
    review.summary.researchedCount === rows.length,
    "researchedCount stale",
  );
  assert(review.summary.mutatedCount === mutations, "mutatedCount stale");
  assert(
    review.summary.insufficientCount === (counts.insufficient_evidence ?? 0),
    "insufficientCount stale",
  );
  assert(
    review.summary.conflictingCount === (counts.conflicting_or_ambiguous ?? 0),
    "conflictingCount stale",
  );
  assert(
    review.summary.yearRoundWithPeakCount ===
      (counts.verified_year_round_with_seasonal_peak ?? 0),
    "yearRoundWithPeakCount stale",
  );
  return pre ? "pre" : "post";
}

export function applyP1BReview(): void {
  const before = JSON.parse(JSON.stringify(catalogue)) as JsonObject[];
  const state = validateP1BReview();
  if (state === "post") {
    console.log("KAI-151 P1-B already applied; no changes needed");
    return;
  }
  const rows = new Map(
    (review.records as JsonObject[]).map((row) => [String(row.id), row]),
  );
  let mutations = 0;
  for (const destination of catalogue) {
    const row = rows.get(destination.id);
    if (!row?.mutationAllowed) continue;
    destination.bestSeason = row.proposed.bestSeason;
    destination.bestMonths = [...row.proposed.bestMonths];
    destination.season = { ...row.proposed.seasonVector };
    destination.seasonMetadata = expectedSeasonMetadata(
      "P1-B",
      row.proposed.bestSeason,
      row.proposed.bestMonths,
    );
    mutations += 1;
  }
  assert(
    mutations === review.summary.mutatedCount,
    `applied ${mutations}, expected ${review.summary.mutatedCount}`,
  );
  const afterById = new Map(
    catalogue.map((destination) => [destination.id, destination]),
  );
  for (const beforeDestination of before) {
    const afterDestination = afterById.get(beforeDestination.id)!;
    const row = rows.get(beforeDestination.id);
    if (!row?.mutationAllowed) {
      assert(
        stable(afterDestination) === stable(beforeDestination),
        `${beforeDestination.id}: out-of-scope mutation`,
      );
    } else {
      assert(
        stable(withoutSeasonFields(afterDestination)) ===
          stable(withoutSeasonFields(beforeDestination)),
        `${beforeDestination.id}: non-season fields changed`,
      );
    }
  }
  fs.writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);
  console.log(
    `KAI-151 P1-B applied ${mutations} source-backed season mutations`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) applyP1BReview();
