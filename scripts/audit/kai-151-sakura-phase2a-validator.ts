export type JsonObject = Record<string, unknown>;

const CLASSIFICATIONS = new Set([
  "verified_seasonal_window",
  "verified_year_round_with_seasonal_peak",
  "insufficient_evidence",
  "conflicting_ambiguous",
]);

const HUB_KINDS = new Set(["city", "ward", "town", "village"]);
const VECTOR_KEYS = ["spring", "summer", "autumn", "winter"] as const;

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function asRecord(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function seasonFields(value: JsonObject): JsonObject {
  if ("current" in value) return asRecord(value.current, "current fields");
  if ("currentFields" in value)
    return asRecord(value.currentFields, "current fields");
  return {
    bestSeason: value.bestSeason ?? null,
    bestMonths: value.bestMonths ?? null,
    season: value.season ?? null,
    seasonMetadata: value.seasonMetadata ?? null,
  };
}

function assertMonthWindow(
  value: unknown,
  id: string,
): asserts value is number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${id} bestMonths must be a non-empty month array`);
  }
  if (
    value.some(
      (month) =>
        typeof month !== "number" ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12,
    )
  ) {
    throw new Error(`${id} bestMonths contains an invalid month`);
  }
  if (value.some((month, index) => index > 0 && month <= value[index - 1])) {
    throw new Error(`${id} bestMonths must be strictly ascending and unique`);
  }
}

function assertSeasonVector(
  value: unknown,
  id: string,
): asserts value is JsonObject {
  const vector = asRecord(value, `${id} season vector`);
  const keys = Object.keys(vector).sort();
  if (stable(keys) !== stable([...VECTOR_KEYS].sort())) {
    throw new Error(
      `${id} season vector must contain exactly spring, summer, autumn, winter`,
    );
  }
  for (const key of VECTOR_KEYS) {
    const score = vector[key];
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10
    ) {
      throw new Error(
        `${id} season vector ${key} must be a finite score from 0 to 10`,
      );
    }
  }
}

export function expectedSeasonMetadata(months: number[]): JsonObject {
  return {
    method: "manual",
    modelVersion: "season-model-v1",
    confidence: "high",
    basis: `KAI-151 Phase 2A official sakura evidence; preferred months ${months.join(",")}; spring peak with year-round nonzero vector`,
  };
}

function expectedAppliedFields(record: JsonObject): JsonObject {
  const proposed = asRecord(record.proposed, `${String(record.id)} proposed`);
  const months = proposed.bestMonths;
  assertMonthWindow(months, String(record.id));
  assertSeasonVector(proposed.seasonVector, String(record.id));
  return {
    bestSeason: proposed.bestSeason,
    bestMonths: months,
    season: proposed.seasonVector,
    seasonMetadata: expectedSeasonMetadata(months),
  };
}

function actualSeasonFields(catalogueRecord: JsonObject): JsonObject {
  if ("current" in catalogueRecord) return seasonFields(catalogueRecord);
  return {
    bestSeason: catalogueRecord.bestSeason ?? null,
    bestMonths: catalogueRecord.bestMonths ?? null,
    season: catalogueRecord.season ?? null,
    seasonMetadata: catalogueRecord.seasonMetadata ?? null,
  };
}

export function validatePhase2AReview(
  baseline: JsonObject,
  review: JsonObject,
  catalogue: unknown[],
): "pre" | "post" {
  const baselineRecords = baseline.records;
  const reviewRecords = review.records;
  if (!Array.isArray(baselineRecords) || !Array.isArray(reviewRecords)) {
    throw new Error("baseline and review records must be arrays");
  }
  const baselineRows = baselineRecords.map((row) =>
    asRecord(row, "baseline record"),
  );
  const reviewedRows = reviewRecords.map((row) =>
    asRecord(row, "review record"),
  );
  const baseIds = baselineRows.map((row) => String(row.id));
  const reviewIds = reviewedRows.map((row) => String(row.id));
  if (new Set(baseIds).size !== baseIds.length)
    throw new Error("baseline contains duplicate IDs");
  if (new Set(reviewIds).size !== reviewIds.length)
    throw new Error("review contains duplicate IDs");
  if (stable([...baseIds].sort()) !== stable([...reviewIds].sort())) {
    throw new Error("review must contain the exact baseline ID set");
  }
  if (
    review.candidateDefinition === undefined ||
    review.baseCommit === undefined
  ) {
    throw new Error("review must record candidate definition and baseCommit");
  }

  const summary = asRecord(review.summary, "review summary");
  const expectedCounts: Record<string, number> = {
    verified_seasonal_window: 0,
    verified_year_round_with_seasonal_peak: 0,
    insufficient_evidence: 0,
    conflicting_ambiguous: 0,
  };
  let mutationCount = 0;
  const baselineById = new Map(
    baseIds.map((id, index) => [id, baselineRows[index]]),
  );
  const reviewById = new Map(reviewedRows.map((row) => [String(row.id), row]));

  for (const row of reviewedRows) {
    const id = String(row.id);
    const base = baselineById.get(id);
    if (!base) throw new Error(`${id} is not in baseline`);
    if (stable(row.currentFields) !== stable(seasonFields(base))) {
      throw new Error(`${id} currentFields drift from frozen baseline`);
    }
    const classification = row.classification;
    if (
      typeof classification !== "string" ||
      !CLASSIFICATIONS.has(classification)
    ) {
      throw new Error(`${id} has an invalid classification`);
    }
    expectedCounts[classification] += 1;
    const evidence = row.officialEvidence;
    if (!Array.isArray(evidence) || evidence.length === 0) {
      throw new Error(`${id} must contain official evidence entries`);
    }
    for (const sourceValue of evidence) {
      const source = asRecord(sourceValue, `${id} evidence`);
      if (
        typeof source.authority !== "string" ||
        source.authority.length === 0
      ) {
        throw new Error(`${id} evidence must name an authority`);
      }
      if (
        !Array.isArray(source.urls) ||
        source.urls.length === 0 ||
        source.urls.some(
          (url) => typeof url !== "string" || !/^https?:\/\//.test(url),
        )
      ) {
        throw new Error(`${id} evidence must contain official URLs`);
      }
      if (
        !Array.isArray(source.observations) ||
        source.observations.length === 0 ||
        source.observations.some(
          (observation) =>
            typeof observation !== "string" || observation.length === 0,
        )
      ) {
        throw new Error(`${id} evidence must contain observed text`);
      }
    }
    const proposed = asRecord(row.proposed, `${id} proposed`);
    const mutationAllowed = row.mutationAllowed === true;
    if (row.mutationAllowed !== true && row.mutationAllowed !== false) {
      throw new Error(`${id} mutationAllowed must be boolean`);
    }
    const baselineShape = asRecord(base, `${id} baseline`);
    const isHub =
      baselineShape.role === "hub" || HUB_KINDS.has(String(baselineShape.kind));
    if (mutationAllowed && isHub)
      throw new Error(`${id} hub cannot receive a season vector mutation`);
    if (mutationAllowed) {
      if (!classification.startsWith("verified_"))
        throw new Error(`${id} mutation requires verified evidence`);
      if (proposed.apply !== true)
        throw new Error(`${id} mutationAllowed requires proposed.apply=true`);
      if (
        typeof proposed.bestSeason !== "string" ||
        proposed.bestSeason.length === 0
      )
        throw new Error(`${id} proposed bestSeason is required`);
      assertMonthWindow(proposed.bestMonths, id);
      assertSeasonVector(proposed.seasonVector, id);
      mutationCount += 1;
    } else {
      if (proposed.apply !== false)
        throw new Error(`${id} non-mutation must set proposed.apply=false`);
      if (
        classification === "insufficient_evidence" ||
        classification === "conflicting_ambiguous"
      ) {
        if (
          proposed.bestSeason !== null ||
          proposed.bestMonths !== null ||
          proposed.seasonVector !== null
        ) {
          throw new Error(
            `${id} insufficient/conflicting evidence cannot carry a proposal`,
          );
        }
      }
    }
  }

  const summaryExpected: Record<string, number> = {
    candidateCount: reviewedRows.length,
    verifiedSeasonalWindow: expectedCounts.verified_seasonal_window,
    verifiedYearRoundWithSeasonalPeak:
      expectedCounts.verified_year_round_with_seasonal_peak,
    insufficientEvidence: expectedCounts.insufficient_evidence,
    conflictingAmbiguous: expectedCounts.conflicting_ambiguous,
    proposedMutationCount: mutationCount,
    canonicalSeasonalityMutationCount: mutationCount,
  };
  for (const [key, expected] of Object.entries(summaryExpected)) {
    if (summary[key] !== expected)
      throw new Error(
        `summary ${key}=${String(summary[key])} expected ${expected}`,
      );
  }

  const catalogueRows = catalogue.map((row) =>
    asRecord(row, "catalogue record"),
  );
  const catalogueById = new Map(
    catalogueRows.map((row) => [String(row.id), row]),
  );
  let allPre = true;
  let allPost = true;
  let preCount = 0;
  let postCount = 0;
  for (const id of baseIds) {
    const reviewRow = reviewById.get(id)!;
    const current = catalogueById.get(id);
    if (!current) throw new Error(`${id} is missing from catalogue`);
    const actual = actualSeasonFields(current);
    const baseFields = seasonFields(baselineById.get(id)!);
    const isMutation = reviewRow.mutationAllowed === true;
    const expectedPost = isMutation
      ? expectedAppliedFields(reviewRow)
      : baseFields;
    const isPre = stable(actual) === stable(baseFields);
    const isPost = stable(actual) === stable(expectedPost);
    allPre = allPre && isPre;
    allPost = allPost && isPost;
    if (isPre) preCount += 1;
    if (isPost) postCount += 1;
    if (!isPre && !isPost)
      throw new Error(
        `${id} is neither the frozen pre-state nor the expected post-state`,
      );
  }
  if (allPre) return "pre";
  if (allPost) return "post";
  throw new Error(
    `mixed Phase 2A state: pre=${preCount}/${baseIds.length}, post=${postCount}/${baseIds.length}`,
  );
}
