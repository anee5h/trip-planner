import type { Destination } from "@/shared/types/destination";

export type ThematicPhase = "2B" | "2C" | "2D" | "2E";
export type ThematicClassification =
  | "verified_seasonal_window"
  | "verified_year_round_with_seasonal_peak"
  | "insufficient_evidence"
  | "conflicting_or_ambiguous"
  | "false_positive_theme"
  | "already_sufficient"
  | "not_applicable";

export const THEMATIC_CLASSIFICATIONS = new Set<ThematicClassification>([
  "verified_seasonal_window",
  "verified_year_round_with_seasonal_peak",
  "insufficient_evidence",
  "conflicting_or_ambiguous",
  "false_positive_theme",
  "already_sufficient",
  "not_applicable",
]);

const HUB_KINDS = new Set(["city", "ward", "town", "village"]);
const SEASON_KEYS = ["spring", "summer", "autumn", "winter"] as const;

type JsonObject = Record<string, any>;

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requireMonths(value: unknown, id: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${id} proposed.bestMonths must be a non-empty array`);
  }
  if (
    value.some(
      (month) =>
        typeof month !== "number" ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12,
    ) ||
    value.some((month, index) => index > 0 && month <= value[index - 1])
  ) {
    throw new Error(
      `${id} proposed.bestMonths must be sorted unique months 1-12`,
    );
  }
}

function requireVector(
  value: unknown,
  id: string,
): asserts value is JsonObject {
  const vector = object(value, `${id} proposed.seasonVector`);
  if (stable(Object.keys(vector).sort()) !== stable([...SEASON_KEYS].sort())) {
    throw new Error(`${id} proposed.seasonVector has invalid keys`);
  }
  for (const key of SEASON_KEYS) {
    if (
      typeof vector[key] !== "number" ||
      !Number.isFinite(vector[key]) ||
      vector[key] < 0 ||
      vector[key] > 10
    ) {
      throw new Error(`${id} proposed.seasonVector.${key} must be 0..10`);
    }
  }
}

function seasonFields(value: JsonObject): JsonObject {
  return {
    bestSeason: value.bestSeason ?? null,
    bestMonths: value.bestMonths ?? null,
    season: value.season ?? null,
    seasonMetadata: value.seasonMetadata ?? null,
  };
}

function proposedFields(row: JsonObject): JsonObject {
  const proposed = object(row.proposed, `${String(row.id)} proposed`);
  return {
    bestSeason: proposed.bestSeason,
    bestMonths: proposed.bestMonths,
    season: proposed.seasonVector,
    seasonMetadata: expectedSeasonMetadata(
      String(row.phase),
      proposed.bestSeason,
      proposed.bestMonths,
    ),
  };
}

export function expectedSeasonMetadata(
  phase: string,
  bestSeason: unknown,
  months: unknown,
): JsonObject {
  if (typeof bestSeason !== "string" || !Array.isArray(months)) {
    throw new Error(`cannot build season metadata for ${phase}`);
  }
  return {
    method: "manual",
    modelVersion: "season-model-v1",
    confidence: "high",
    basis: `KAI-151 Phase ${phase} authoritative thematic evidence; ${bestSeason}; preferred months ${months.join(",")}; structured experience seasonality with nonzero year-round vector`,
  };
}

function validateEvidence(row: JsonObject): void {
  const id = String(row.id);
  const evidence = row.officialEvidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error(`${id} must include officialEvidence`);
  }
  for (const entryValue of evidence) {
    const entry = object(entryValue, `${id} evidence`);
    if (typeof entry.authority !== "string" || !entry.authority.trim()) {
      throw new Error(`${id} evidence authority is required`);
    }
    if (
      !Array.isArray(entry.urls) ||
      entry.urls.length === 0 ||
      entry.urls.some(
        (url: unknown) => typeof url !== "string" || !/^https?:\/\//.test(url),
      )
    ) {
      throw new Error(`${id} evidence URLs are required`);
    }
    if (
      !Array.isArray(entry.observations) ||
      entry.observations.length === 0 ||
      entry.observations.some(
        (text: unknown) => typeof text !== "string" || !text.trim(),
      )
    ) {
      throw new Error(`${id} evidence observations are required`);
    }
  }
}

function isHub(row: JsonObject): boolean {
  return row.role === "hub" || HUB_KINDS.has(String(row.kind));
}

export function validateThematicReview(
  review: JsonObject,
  catalogue: unknown[],
  expectedPhase: ThematicPhase,
): "pre" | "post" {
  if (review.ticket !== "KAI-151" || review.phase !== expectedPhase) {
    throw new Error(`review must identify KAI-151 phase ${expectedPhase}`);
  }
  if (
    typeof review.baseCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(review.baseCommit)
  ) {
    throw new Error("review.baseCommit must be a full commit SHA");
  }
  if (
    typeof review.candidateDefinition !== "string" ||
    typeof review.selectionMethod !== "string"
  ) {
    throw new Error(
      "review must freeze candidateDefinition and selectionMethod",
    );
  }
  if (!Array.isArray(review.records) || review.records.length === 0) {
    throw new Error("review.records must be non-empty");
  }

  const records = review.records.map((value: unknown) =>
    object(value, "review record"),
  );
  const ids = records.map((row) => String(row.id));
  if (new Set(ids).size !== ids.length)
    throw new Error("review has duplicate IDs");
  const byId = new Map(
    catalogue.map((value: any) => [String(value.id), value as JsonObject]),
  );

  const counts: Record<string, number> = {};
  let mutations = 0;
  for (const row of records) {
    const id = String(row.id);
    const current = object(row.currentFields, `${id} currentFields`);
    const destination = byId.get(id);
    if (!destination) throw new Error(`${id} missing from catalogue`);
    // currentFields is the frozen pre-phase snapshot.  It is intentionally
    // compared with the base commit by the impact/scope checks, because the
    // same review must validate in both pre- and post-migration states.
    if (row.phase !== expectedPhase) throw new Error(`${id} phase mismatch`);
    if (!THEMATIC_CLASSIFICATIONS.has(row.classification)) {
      throw new Error(`${id} has invalid classification`);
    }
    counts[row.classification] = (counts[row.classification] ?? 0) + 1;
    if (typeof row.cohortReason !== "string" || !row.cohortReason.trim()) {
      throw new Error(`${id} cohortReason is required`);
    }
    validateEvidence(row);

    const mutationAllowed = row.mutationAllowed;
    if (mutationAllowed !== true && mutationAllowed !== false) {
      throw new Error(`${id} mutationAllowed must be boolean`);
    }
    const proposed = object(row.proposed, `${id} proposed`);
    if (mutationAllowed) {
      if (
        row.classification !== "verified_seasonal_window" &&
        row.classification !== "verified_year_round_with_seasonal_peak"
      ) {
        throw new Error(`${id} mutation requires verified classification`);
      }
      if (isHub(destination)) throw new Error(`${id} hub cannot be mutated`);
      if (proposed.apply !== true || typeof proposed.bestSeason !== "string") {
        throw new Error(`${id} verified mutation proposal is invalid`);
      }
      requireMonths(proposed.bestMonths, id);
      requireVector(proposed.seasonVector, id);
      mutations += 1;
    } else {
      if (proposed.apply !== false)
        throw new Error(`${id} non-mutation apply must be false`);
      if (
        proposed.bestSeason !== null ||
        proposed.bestMonths !== null ||
        proposed.seasonVector !== null
      ) {
        throw new Error(`${id} non-mutation must have null proposal fields`);
      }
    }
  }

  const summary = object(review.summary, "review.summary");
  if (
    summary.candidateCount !== records.length ||
    summary.researchedCount !== records.length
  ) {
    throw new Error("review summary candidate/researched count is stale");
  }
  if (summary.mutatedCount !== mutations)
    throw new Error("review summary mutatedCount is stale");
  if (
    summary.insufficientCount !==
    records.filter((row) => row.classification === "insufficient_evidence")
      .length
  ) {
    throw new Error("review summary insufficientCount is stale");
  }

  let pre = true;
  let post = true;
  for (const row of records) {
    const id = String(row.id);
    const destination = byId.get(id)!;
    const actual = seasonFields(destination);
    const expectedPost = row.mutationAllowed
      ? proposedFields(row)
      : object(row.currentFields, `${id} currentFields`);
    pre = pre && stable(actual) === stable(row.currentFields);
    post = post && stable(actual) === stable(expectedPost);
    if (
      !pre &&
      !post &&
      stable(actual) !== stable(row.currentFields) &&
      stable(actual) !== stable(expectedPost)
    ) {
      throw new Error(
        `${id} is neither phase pre-state nor expected post-state`,
      );
    }
  }
  if (pre) return "pre";
  if (post) return "post";
  throw new Error("mixed thematic migration state");
}

export function validateCatalogueMutationScope(
  before: Destination[],
  after: Destination[],
  review: JsonObject,
): void {
  const allowed = new Set(
    (review.records as JsonObject[])
      .filter((row) => row.mutationAllowed === true)
      .map((row) => String(row.id)),
  );
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterById = new Map(after.map((row) => [row.id, row]));
  if (before.length !== after.length)
    throw new Error("catalogue population changed");
  for (const [id, oldValue] of beforeById) {
    const newValue = afterById.get(id);
    if (!newValue) throw new Error(`${id} disappeared from catalogue`);
    const oldFields = seasonFields(oldValue as JsonObject);
    const newFields = seasonFields(newValue as JsonObject);
    if (!allowed.has(id) && stable(oldFields) !== stable(newFields)) {
      throw new Error(`${id} changed outside authorized thematic mutation set`);
    }
    if (allowed.has(id) && stable(oldFields) === stable(newFields)) {
      throw new Error(`${id} was authorized but not mutated`);
    }
  }
}
