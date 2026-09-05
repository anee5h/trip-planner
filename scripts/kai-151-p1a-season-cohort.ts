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
  "scripts/audit/kai-151-p1a-season-review.json",
);
const catalogue = JSON.parse(
  fs.readFileSync(cataloguePath, "utf8"),
) as JsonObject[];
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8")) as JsonObject;
const kinds = new Set(["castle", "temple", "shrine"]);

function fail(message: string): never {
  throw new Error(`KAI-151 P1-A validation failed: ${message}`);
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
function requireMonths(value: unknown, id: string): asserts value is number[] {
  assert(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) &&
      value.every((m, i) => i === 0 || m > value[i - 1]),
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
  for (const key of ["spring", "summer", "autumn", "winter"]) {
    assert(
      typeof value[key] === "number" &&
        Number.isFinite(value[key]) &&
        value[key] >= 0 &&
        value[key] <= 10,
      `${id}: proposed.seasonVector.${key} must be 0..10`,
    );
  }
}
function validateEvidence(row: JsonObject): void {
  assert(
    Array.isArray(row.officialEvidence) && row.officialEvidence.length > 0,
    `${row.id}: evidence required`,
  );
  for (const entry of row.officialEvidence) {
    assert(isObject(entry), `${row.id}: evidence entry must be an object`);
    assert(
      typeof entry.authority === "string" && entry.authority.trim(),
      `${row.id}: evidence authority required`,
    );
    assert(
      Array.isArray(entry.urls) && entry.urls.length > 0,
      `${row.id}: evidence URLs required`,
    );
    assert(
      entry.urls.every(
        (url: unknown) => typeof url === "string" && /^https?:\/\//.test(url),
      ),
      `${row.id}: invalid evidence URL`,
    );
    assert(
      Array.isArray(entry.observations) && entry.observations.length > 0,
      `${row.id}: evidence observations required`,
    );
    assert(
      entry.observations.every(
        (text: unknown) => typeof text === "string" && text.trim(),
      ),
      `${row.id}: invalid evidence observation`,
    );
  }
}

export function validateP1AReview(): "pre" | "post" {
  assert(review.ticket === "KAI-151", "ticket mismatch");
  assert(review.phase === "P1-A", "phase mismatch");
  assert(
    review.baseCommit === "07ea8de3bbbbca3a53962c4211703acb27432346",
    "unexpected base commit",
  );
  assert(Array.isArray(review.records), "records must be an array");
  const rows = review.records as JsonObject[];
  const ids = rows.map((row) => String(row.id)).sort();
  assert(new Set(ids).size === ids.length, "review has duplicate IDs");
  assert(
    ids.length === review.summary.candidateCount,
    `candidate count ${review.summary.candidateCount} != ${ids.length}`,
  );
  const byId = new Map(catalogue.map((d) => [d.id, d]));
  let mutations = 0;
  let pre = true;
  let post = true;
  for (const row of rows) {
    const id = String(row.id);
    const destination = byId.get(id);
    assert(destination, `${id}: missing from catalogue`);
    const actual = {
      bestSeason: destination.bestSeason ?? null,
      bestMonths: destination.bestMonths ?? null,
      season: destination.season ?? null,
      seasonMetadata: destination.seasonMetadata ?? null,
    };
    const expectedPost = row.mutationAllowed
      ? {
          bestSeason: row.proposed.bestSeason,
          bestMonths: row.proposed.bestMonths,
          season: row.proposed.seasonVector,
          seasonMetadata: expectedSeasonMetadata(
            "P1-A",
            row.proposed.bestSeason,
            row.proposed.bestMonths,
          ),
        }
      : row.currentFields;
    pre = pre && stable(actual) === stable(row.currentFields);
    post = post && stable(actual) === stable(expectedPost);
    assert(
      typeof row.cohortReason === "string" && row.cohortReason.trim(),
      `${id}: cohortReason required`,
    );
    validateEvidence(row);
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
      assert(
        typeof proposed.bestSeason === "string" && proposed.bestSeason.trim(),
        `${id}: proposed.bestSeason required`,
      );
      requireMonths(proposed.bestMonths, id);
      requireVector(proposed.seasonVector, id);
      mutations += 1;
    } else {
      assert(
        row.classification === "insufficient_evidence" ||
          row.classification === "conflicting_or_ambiguous",
        `${id}: invalid non-mutation classification`,
      );
      assert(
        proposed.apply === false,
        `${id}: non-mutation must have proposed.apply=false`,
      );
      assert(
        proposed.bestSeason === null &&
          proposed.bestMonths === null &&
          proposed.seasonVector === null,
        `${id}: non-mutation proposal must be null`,
      );
    }
  }
  assert(
    pre || post,
    "catalogue is neither complete pre-state nor complete post-state",
  );
  const selectionNow = catalogue
    .filter(
      (d) => kinds.has(d.kind) && d.season == null && d.bestMonths == null,
    )
    .map((d) => d.id)
    .sort();
  const expectedNow = (
    pre
      ? ids
      : rows.filter((row) => !row.mutationAllowed).map((row) => String(row.id))
  ).sort();
  assert(
    stable(selectionNow) === stable(expectedNow),
    `selection drift: expected ${expectedNow.length}, got ${selectionNow.length}`,
  );
  assert(
    review.summary.mutatedCount === mutations,
    `summary mutatedCount ${review.summary.mutatedCount} != ${mutations}`,
  );
  assert(
    review.summary.candidateCount === rows.length,
    "summary candidateCount mismatch",
  );
  const alreadyApplied = rows.every((row) => {
    if (!row.mutationAllowed) return true;
    const destination = byId.get(row.id)!;
    return (
      destination.bestSeason === row.proposed.bestSeason &&
      stable(destination.bestMonths) === stable(row.proposed.bestMonths) &&
      stable(destination.season) === stable(row.proposed.seasonVector) &&
      stable(destination.seasonMetadata) ===
        stable(
          expectedSeasonMetadata(
            "P1-A",
            row.proposed.bestSeason,
            row.proposed.bestMonths,
          ),
        )
    );
  });
  return alreadyApplied ? "post" : "pre";
}

export function applyP1AReview(): void {
  const before = JSON.parse(JSON.stringify(catalogue)) as JsonObject[];
  const state = validateP1AReview();
  if (state === "post") {
    console.log("KAI-151 P1-A already applied; no changes needed");
    return;
  }
  const byId = new Map(
    (review.records as JsonObject[]).map((row) => [String(row.id), row]),
  );
  let mutations = 0;
  for (const destination of catalogue) {
    const row = byId.get(destination.id);
    if (!row?.mutationAllowed) continue;
    destination.bestSeason = row.proposed.bestSeason;
    destination.bestMonths = [...row.proposed.bestMonths];
    destination.season = { ...row.proposed.seasonVector };
    destination.seasonMetadata = expectedSeasonMetadata(
      "P1-A",
      row.proposed.bestSeason,
      row.proposed.bestMonths,
    );
    mutations += 1;
  }
  assert(
    mutations === review.summary.mutatedCount,
    `applied ${mutations}, expected ${review.summary.mutatedCount}`,
  );
  for (let i = 0; i < catalogue.length; i += 1) {
    if (!byId.has(catalogue[i].id))
      assert(
        stable(catalogue[i]) === stable(before[i]),
        `${catalogue[i].id}: out-of-scope mutation`,
      );
  }
  fs.writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);
  console.log(
    `KAI-151 P1-A applied ${mutations} source-backed season mutations`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) applyP1AReview();
