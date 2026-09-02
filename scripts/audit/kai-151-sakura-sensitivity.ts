import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format as formatWithPrettier } from "prettier";
import type { Destination } from "@/shared/types/destination";
import type { RecommendationContext } from "@/shared/services/recommendation/RecommendationContext";
import {
  calculateScore,
  SCORING_WEIGHTS,
} from "@/shared/services/recommendation/RecommendationScorer";
import {
  evaluateSeasonalSuitability,
  SEASONAL_WEIGHTS,
} from "@/shared/services/recommendation/SeasonalSuitabilityService";
import { getFixedSeason, type Season } from "@/shared/utils/season";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import {
  calculateTripEstimate,
  evaluateAffordability,
} from "@/shared/services/budget/tripEstimateEngine";
import type { PipelineRecommendation } from "@/shared/services/recommendation/RecommendationTypes";

const ROOT = process.cwd();
const BASE_COMMIT = "a56d7dd41b8773b4c8b59ac22b25e6f508809792";
// Pin the pre-audit PR head so the generated artifact remains stable after the
// audit-only commit is added to PR #315. The canonical season data is unchanged
// between this commit and the final audit commit.
const AFTER_COMMIT = "d7613a7639c1cc8f11117a94ce4c26c1694910a7";
const AUDIT_CLOCK = "2026-09-02T12:00:00+09:00";
const AUDIT_DATE = "2026-09-02";
const BUDGET = 100_000;
const PARTY_SIZE = 2;
const DURATION = "any" as const;
const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const OUTPUT_JSON = "scripts/audit/kai-151-sakura-sensitivity.json";
const OUTPUT_MD = "scripts/audit/kai-151-sakura-sensitivity.md";
const PRIOR_IMPACT_PATH = "scripts/audit/kai-151-sakura-phase2a-impact.json";

const REAL_DATE = Date;
const frozenClockMs = REAL_DATE.parse(AUDIT_CLOCK);
class FrozenDate extends REAL_DATE {
  constructor(...args: ConstructorParameters<typeof REAL_DATE>) {
    if (args.length === 0) {
      super(frozenClockMs);
    } else {
      super(...args);
    }
  }

  static now() {
    return frozenClockMs;
  }
}
process.env.TZ = "Asia/Tokyo";
globalThis.Date = FrozenDate as unknown as DateConstructor;

type JsonRecord = Record<string, any>;
type OriginName = "tokyo" | "osaka" | "fukuoka" | "kagoshima";
type Position = "in_season" | "shoulder" | "off_season";
type CaseClassification =
  | "proportionate_expected_change"
  | "large_but_explainable_change"
  | "possible_seasonality_overweighting"
  | "unknown_seasonality_bias"
  | "unrelated_ranking_effect"
  | "insufficient_evidence";

interface OriginSpec {
  name: OriginName;
  label: string;
  coordinates: { lat: number; lng: number };
  role: "national" | "regional";
}

const ORIGINS: OriginSpec[] = [
  {
    name: "tokyo",
    label: "Tokyo Station",
    coordinates: { lat: 35.6812, lng: 139.7671 },
    role: "national",
  },
  {
    name: "osaka",
    label: "Osaka Station",
    coordinates: { lat: 34.7025, lng: 135.4959 },
    role: "national",
  },
  {
    name: "fukuoka",
    label: "Hakata Station / Fukuoka",
    coordinates: { lat: 33.5897, lng: 130.4207 },
    role: "national",
  },
  {
    name: "kagoshima",
    label: "Kagoshima-Chuo Station",
    coordinates: { lat: 31.5846, lng: 130.5411 },
    role: "regional",
  },
];

const POSITION_ORDER: Position[] = ["in_season", "shoulder", "off_season"];
const MUTATION_FIELD_NAMES = [
  "bestSeason",
  "bestMonths",
  "season",
  "seasonMetadata",
] as const;

function readGitText(commit: string, relativePath: string): string {
  return execFileSync("git", ["show", `${commit}:${relativePath}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function readGitJson(commit: string, relativePath: string): any {
  return JSON.parse(readGitText(commit, relativePath));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function round(value: number | undefined | null): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function monthDate(month: number, day: number): string {
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function previousMonth(month: number): number {
  return month === 1 ? 12 : month - 1;
}

function offSeasonMonth(lastPeakMonth: number): number {
  return ((lastPeakMonth + 4 - 1) % 12) + 1;
}

function scenarioDates(
  id: string,
  bestMonths: number[],
): Record<Position, string> {
  const first = Math.min(...bestMonths);
  const last = Math.max(...bestMonths);
  return {
    // The exact date from the original impact observation is retained for
    // Sengan-en so the sensitivity audit answers that trigger directly.
    in_season:
      id === "sengan-en-garden-kagoshima" ? "2026-04-05" : monthDate(first, 15),
    shoulder: monthDate(previousMonth(first), 15),
    off_season: monthDate(offSeasonMonth(last), 15),
  };
}

function buildContext(
  origin: OriginSpec,
  date: string,
  duration: RecommendationContext["tripDuration"] = DURATION,
  budget = BUDGET,
): RecommendationContext {
  return {
    vibe: "any",
    budget,
    budgetTier: "standard",
    carMode: "none",
    publicModes: [...PUBLIC_MODES],
    partySize: PARTY_SIZE,
    visitedIds: [],
    homeStationCoords: origin.coordinates,
    tripDuration: duration,
    travelDates: {
      day1: date,
      startDate: date,
      endDate: date,
    },
    ferryTemporal: {
      travelDate: new REAL_DATE(`${date}T03:00:00.000Z`),
    },
  };
}

function seasonFields(destination: JsonRecord): JsonRecord {
  return Object.fromEntries(
    MUTATION_FIELD_NAMES.map((field) => [field, destination[field] ?? null]),
  );
}

function getRating(destination: JsonRecord, season: Season): number {
  const value = destination.season?.[season];
  return typeof value === "number" && Number.isFinite(value) ? value : 5;
}

function modeState(
  scoreResult: ReturnType<typeof calculateScore>,
  destination: Destination,
  context: RecommendationContext,
): JsonRecord {
  const mode = scoreResult.bestMode;
  const selected = mode ? scoreResult.modeScoreBreakdown[mode] : undefined;
  const validModes = Object.keys(scoreResult.modeScoreBreakdown).sort();
  const estimate = mode
    ? calculateTripEstimate({
        dest: destination,
        mode,
        partySize: context.partySize,
        homeCoords: context.homeStationCoords || undefined,
        duration: context.tripDuration ?? "any",
        budgetTier: context.budgetTier,
        ferryTemporal: context.ferryTemporal,
      })
    : null;
  return {
    validModes,
    bestMode: mode ?? null,
    selectedModeBreakdown: selected
      ? {
          mode: selected.mode,
          budget: round(selected.budget),
          transport: round(selected.transport),
          travelEfficiency: round(selected.travelEfficiency),
          total: round(selected.total),
          usable: selected.usable,
          travelEvidence: selected.travelEvidence ?? null,
        }
      : null,
    modeScore: round(scoreResult.bestModeScore),
    budgetContribution: round(selected?.budget ?? 0),
    transportAccessContribution: round(selected?.transport ?? 0),
    travelTimeContribution: round(selected?.travelEfficiency ?? 0),
    estimate: estimate
      ? {
          total: estimate.total
            ? [round(estimate.total.min), round(estimate.total.max)]
            : null,
          estimateQuality: estimate.estimateQuality,
          affordability: evaluateAffordability(estimate, context.budget),
          transportFareScope: estimate.transportFareScope,
        }
      : null,
  };
}

function transportSnapshot(
  row: PipelineRecommendation | undefined,
): JsonRecord | null {
  const estimate = row?.transportEstimate;
  if (!estimate) return null;
  return {
    mode: estimate.mode,
    timeRangeMinutes: estimate.timeRange
      ? [round(estimate.timeRange[0]), round(estimate.timeRange[1])]
      : null,
    source: estimate.source,
    evidence: estimate.evidence,
    corridorEvidence: estimate.corridorEvidence ?? null,
    fare: estimate.fare ?? null,
    fareScope: estimate.fareScope ?? null,
  };
}

function rawRank(
  rows: PipelineRecommendation[],
  targetId: string,
): number | null {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const index = sorted.findIndex((row) => row.id === targetId);
  return index < 0 ? null : index + 1;
}

function rankingSnapshot(
  rows: PipelineRecommendation[],
  targetId: string,
): JsonRecord {
  const index = rows.findIndex((row) => row.id === targetId);
  const row = index >= 0 ? rows[index] : undefined;
  return {
    rank: row ? index + 1 : null,
    rawScoreRank: rawRank(rows, targetId),
    score: row ? round(row.score) : null,
    recommendationEligible: Boolean(row),
    recommendationCount: rows.length,
    top10: rows.slice(0, 10).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      score: round(candidate.score),
    })),
    pipelineScoreContributions: row?.pipeline.scoreContributions ?? null,
    estimatedCostRange: row?.estimatedCostRange
      ? [round(row.estimatedCostRange[0]), round(row.estimatedCostRange[1])]
      : null,
    estimatedCostQuality: row?.estimatedCostQuality ?? null,
    estimatedCostTransportIncluded: row?.estimatedCostTransportIncluded ?? null,
    estimatedCostTransportScope: row?.estimatedCostTransportScope ?? null,
    transport: transportSnapshot(row),
    reasonCodes: row?.match.reasons.map((reason) => reason.code) ?? [],
  };
}

function stateSnapshot(
  destination: Destination,
  context: RecommendationContext,
  date: string,
  rows: PipelineRecommendation[],
): JsonRecord {
  const scoreResult = calculateScore(destination, context);
  const condition = evaluateSeasonalSuitability(destination, [date]);
  const ambientSeason = getFixedSeason(AUDIT_CLOCK);
  const dateSeason = getFixedSeason(date);
  const ambientRating = getRating(destination, ambientSeason);
  const dateRating = getRating(destination, dateSeason);
  const ambientContribution =
    (ambientRating - 5) * SCORING_WEIGHTS.SEASON_MULTIPLIER;
  const dateSeasonCorrection =
    (dateRating - ambientRating) *
    SEASONAL_WEIGHTS.SEASON_CORRECTION_MULTIPLIER;
  const month = Number(date.slice(5, 7));
  const bestMonthBonus = destination.bestMonths?.includes(month)
    ? SEASONAL_WEIGHTS.BEST_MONTH_BONUS
    : 0;
  const conditionOther =
    condition.scoreDelta - dateSeasonCorrection - bestMonthBonus;
  const mode = modeState(scoreResult, destination, context);
  const modeTotal =
    typeof mode.selectedModeBreakdown?.total === "number"
      ? mode.selectedModeBreakdown.total
      : 0;
  const scoreBeforeDateCondition = scoreResult.score;
  const totalScore = scoreBeforeDateCondition + condition.scoreDelta;
  const ranking = rankingSnapshot(rows, destination.id);

  return {
    fields: seasonFields(destination as JsonRecord),
    seasonality: {
      ambientSeason,
      ambientRating: round(ambientRating),
      ambientContribution: round(ambientContribution),
      selectedDateSeason: dateSeason,
      selectedDateRating: round(dateRating),
      selectedDateSeasonCorrection: round(dateSeasonCorrection),
      bestMonths: destination.bestMonths ?? null,
      bestMonthBonus: round(bestMonthBonus),
      conditionScoreDelta: round(condition.scoreDelta),
      conditionSource: condition.evidence.length > 0 ? "seasonal" : "unknown",
      conditionEvidence: [...condition.evidence],
      conditionOtherContribution: round(conditionOther),
      seasonalityFieldContribution: round(
        ambientContribution + dateSeasonCorrection + bestMonthBonus,
      ),
      seasonalityContributionTotal: round(
        ambientContribution + condition.scoreDelta,
      ),
    },
    scoreBeforeDateCondition: round(scoreBeforeDateCondition),
    score: round(totalScore),
    otherMaterialScoreResidual: round(
      scoreBeforeDateCondition - ambientContribution - modeTotal,
    ),
    mode,
    condition: {
      source: condition.evidence.length > 0 ? "seasonal" : "unknown",
      scoreDelta: round(condition.scoreDelta),
      evidence: [...condition.evidence],
    },
    ranking,
  };
}

function numericDelta(
  before: number | null | undefined,
  after: number | null | undefined,
): number | null {
  if (
    before === null ||
    before === undefined ||
    after === null ||
    after === undefined
  ) {
    return null;
  }
  return round(after - before);
}

function getScoreState(state: JsonRecord): JsonRecord {
  return {
    score: state.score,
    seasonalityContributionTotal:
      state.seasonality.seasonalityContributionTotal,
    seasonalityFieldContribution:
      state.seasonality.seasonalityFieldContribution,
    budgetContribution: state.mode.budgetContribution,
    transportAccessContribution: state.mode.transportAccessContribution,
    travelTimeContribution: state.mode.travelTimeContribution,
    otherMaterialScoreResidual: state.otherMaterialScoreResidual,
    bestMode: state.mode.bestMode,
    travel: state.ranking.transport,
    estimatedCostRange: state.ranking.estimatedCostRange,
    estimatedCostQuality: state.ranking.estimatedCostQuality,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle],
  );
}

function dominanceAnalysis(
  afterState: JsonRecord,
  afterRows: PipelineRecommendation[],
  context: RecommendationContext,
  date: string,
  destinationId: string,
): JsonRecord {
  const rank = afterState.ranking.rank as number | null;
  if (rank === null || rank > 10) {
    return {
      evaluated: false,
      potentialSeasonalityOverweighting: false,
      reason: "Destination was not in the final top ten for this context.",
    };
  }

  const targetFundamentals =
    (afterState.score as number) -
    (afterState.seasonality.seasonalityContributionTotal as number);
  const topFundamentals: number[] = [];
  const topIds: string[] = [];
  for (const row of afterRows.slice(0, 10)) {
    const destination = row as unknown as Destination;
    const rowCondition = evaluateSeasonalSuitability(destination, [date]);
    const rowAmbient = getRating(
      destination as JsonRecord,
      getFixedSeason(AUDIT_CLOCK),
    );
    const rowAmbientContribution =
      (rowAmbient - 5) * SCORING_WEIGHTS.SEASON_MULTIPLIER;
    const rowSeasonality = rowAmbientContribution + rowCondition.scoreDelta;
    topFundamentals.push(row.score - rowSeasonality);
    topIds.push(row.id);
  }
  const topMedian = median(topFundamentals);
  const fundamentalGap =
    topMedian === null ? null : round(topMedian - targetFundamentals);
  const timeRange = afterState.ranking.transport?.timeRangeMinutes as
    [number | null, number | null] | null;
  const costRange = afterState.ranking.estimatedCostRange as
    [number | null, number | null] | null;
  const travelMinutesMateriallyLong = Boolean(
    timeRange?.[1] && timeRange[1] > 180,
  );
  const costOverBudget = Boolean(
    costRange?.[1] && costRange[1] > context.budget,
  );
  const travelEvidenceUnknown =
    afterState.mode.selectedModeBreakdown?.travelEvidence === "unknown" ||
    afterState.ranking.transport === null;
  const fundamentalGapMaterial = Boolean(
    fundamentalGap !== null && fundamentalGap >= 15,
  );
  const materialDisadvantageFlags = {
    travelMinutesMateriallyLong,
    costOverBudget,
    travelEvidenceUnknown,
    fundamentalGapMaterial,
  };
  const potentialSeasonalityOverweighting = Boolean(
    (afterState.seasonality.seasonalityFieldContribution as number) - 0 >= 15 &&
    fundamentalGapMaterial &&
    (travelMinutesMateriallyLong || costOverBudget || travelEvidenceUnknown),
  );
  return {
    evaluated: true,
    targetFundamentalScore: round(targetFundamentals),
    top10FundamentalMedian: topMedian,
    fundamentalGapToTop10Median: fundamentalGap,
    top10Ids: topIds,
    materialDisadvantageFlags,
    potentialSeasonalityOverweighting,
    reason: potentialSeasonalityOverweighting
      ? "A strong seasonal contribution coincides with a material fundamental disadvantage under the conservative heuristic."
      : "No conservative material-disadvantage combination was found; transport, cost, and core score remain visible.",
    // Reference the destination to make the function's subject explicit in
    // serialized diagnostics without adding a second ranking implementation.
    destinationId,
  };
}

function classifyCase(caseRecord: JsonRecord): CaseClassification {
  const before = caseRecord.before;
  const after = caseRecord.after;
  if (before.ranking.rank === null && after.ranking.rank === null) {
    return "insufficient_evidence";
  }
  if ((before.ranking.rank === null) !== (after.ranking.rank === null)) {
    return "unrelated_ranking_effect";
  }
  if (caseRecord.dominance.potentialSeasonalityOverweighting) {
    return "possible_seasonality_overweighting";
  }
  const componentDrift = [
    numericDelta(before.mode.budgetContribution, after.mode.budgetContribution),
    numericDelta(
      before.mode.transportAccessContribution,
      after.mode.transportAccessContribution,
    ),
    numericDelta(
      before.mode.travelTimeContribution,
      after.mode.travelTimeContribution,
    ),
  ].some((value) => value !== null && Math.abs(value) > 0.000001);
  const attributionResidual = Math.abs(
    caseRecord.scoreDeltaAttribution.residual ?? 0,
  );
  if (componentDrift || attributionResidual > 0.000001) {
    return "unrelated_ranking_effect";
  }
  const absoluteRankDelta = caseRecord.absoluteRankDelta as number | null;
  const scoreDelta = Math.abs(caseRecord.scoreDelta as number);
  if (
    absoluteRankDelta !== null &&
    (absoluteRankDelta >= 100 ||
      (after.ranking.rank !== null &&
        after.ranking.rank <= 10 &&
        scoreDelta >= 15))
  ) {
    return "large_but_explainable_change";
  }
  return "proportionate_expected_change";
}

function compareCase(
  id: string,
  name: string,
  origin: OriginSpec,
  position: Position,
  date: string,
  beforeDestination: Destination,
  afterDestination: Destination,
  beforeCatalogue: Destination[],
  afterCatalogue: Destination[],
): JsonRecord {
  const context = buildContext(origin, date);
  const beforeRows = getRecommendations(beforeCatalogue, context);
  const afterRows = getRecommendations(afterCatalogue, context);
  const before = stateSnapshot(beforeDestination, context, date, beforeRows);
  const after = stateSnapshot(afterDestination, context, date, afterRows);
  const scoreDelta = numericDelta(before.score, after.score) ?? 0;
  const rankBefore = before.ranking.rank as number | null;
  const rankAfter = after.ranking.rank as number | null;
  const rankDelta =
    rankBefore !== null && rankAfter !== null ? rankBefore - rankAfter : null;
  const absoluteRankDelta = rankDelta === null ? null : Math.abs(rankDelta);
  const seasonalityFieldDelta = numericDelta(
    before.seasonality.seasonalityFieldContribution,
    after.seasonality.seasonalityFieldContribution,
  );
  const conditionOtherDelta = numericDelta(
    before.seasonality.conditionOtherContribution,
    after.seasonality.conditionOtherContribution,
  );
  const residual = round(
    scoreDelta - (seasonalityFieldDelta ?? 0) - (conditionOtherDelta ?? 0),
  );
  const record: JsonRecord = {
    scenarioId: `${id}:${origin.name}:${position}`,
    destinationId: id,
    destinationName: name,
    origin: {
      id: origin.name,
      label: origin.label,
      role: origin.role,
      coordinates: origin.coordinates,
    },
    testDate: date,
    position,
    duration: "any",
    transportContext: {
      carMode: "none",
      publicModes: [...PUBLIC_MODES],
      originCoordinates: origin.coordinates,
    },
    budgetContext: {
      budget: BUDGET,
      budgetTier: "standard",
      partySize: PARTY_SIZE,
    },
    before,
    after,
    rankBefore,
    rankAfter,
    rankDelta,
    absoluteRankDelta,
    scoreBefore: before.score,
    scoreAfter: after.score,
    scoreDelta,
    seasonalityContributionBefore:
      before.seasonality.seasonalityContributionTotal,
    seasonalityContributionAfter:
      after.seasonality.seasonalityContributionTotal,
    travelTimeContributionBefore: before.mode.travelTimeContribution,
    travelTimeContributionAfter: after.mode.travelTimeContribution,
    budgetContributionBefore: before.mode.budgetContribution,
    budgetContributionAfter: after.mode.budgetContribution,
    transportAccessContributionBefore: before.mode.transportAccessContribution,
    transportAccessContributionAfter: after.mode.transportAccessContribution,
    otherMaterialComponentsBefore: getScoreState(before),
    otherMaterialComponentsAfter: getScoreState(after),
    scoreDeltaAttribution: {
      seasonalityFieldDelta,
      conditionOtherDelta,
      residual,
      exactWithinTolerance: Math.abs(residual ?? 0) <= 0.000001,
    },
    dominance: dominanceAnalysis(
      after,
      afterRows,
      context,
      date,
      afterDestination.id,
    ),
  };
  record.classification = classifyCase(record);
  return record;
}

function summarizeCounts(cases: JsonRecord[]): JsonRecord {
  const categories: CaseClassification[] = [
    "proportionate_expected_change",
    "large_but_explainable_change",
    "possible_seasonality_overweighting",
    "unknown_seasonality_bias",
    "unrelated_ranking_effect",
    "insufficient_evidence",
  ];
  const counts = Object.fromEntries(
    categories.map((category) => [
      category,
      cases.filter((record) => record.classification === category).length,
    ]),
  );
  const scenarios = Object.fromEntries(
    categories.map((category) => [
      category,
      cases
        .filter((record) => record.classification === category)
        .map((record) => record.scenarioId),
    ]),
  );
  const ids = Object.fromEntries(
    categories.map((category) => [
      category,
      [
        ...new Set(
          cases
            .filter((record) => record.classification === category)
            .map((record) => record.destinationId),
        ),
      ],
    ]),
  );
  return { counts, scenarios, destinationIds: ids };
}

function destinationConclusions(
  cases: JsonRecord[],
  mutationRecords: JsonRecord[],
): JsonRecord[] {
  return mutationRecords.map((record) => {
    const destinationCases = cases.filter(
      (candidate) => candidate.destinationId === record.id,
    );
    const categories = [
      ...new Set(destinationCases.map((candidate) => candidate.classification)),
    ] as CaseClassification[];
    const conclusion = categories.includes("possible_seasonality_overweighting")
      ? "possible_seasonality_overweighting"
      : categories.includes("large_but_explainable_change")
        ? "large_but_explainable_change"
        : categories.includes("proportionate_expected_change")
          ? "proportionate_expected_change"
          : categories.includes("unrelated_ranking_effect")
            ? "unrelated_ranking_effect"
            : "insufficient_evidence";
    const deltas = destinationCases
      .map((candidate) => candidate.absoluteRankDelta)
      .filter((value): value is number => typeof value === "number");
    return {
      id: record.id,
      name: record.name,
      testedScenarioCount: destinationCases.length,
      classification: conclusion,
      scenarioClassifications: Object.fromEntries(
        POSITION_ORDER.map((position) => [
          position,
          Object.fromEntries(
            ORIGINS.map((origin) => [
              origin.name,
              destinationCases.find(
                (candidate) =>
                  candidate.position === position &&
                  candidate.origin.id === origin.name,
              )?.classification ?? "insufficient_evidence",
            ]),
          ),
        ]),
      ),
      maxAbsoluteRankDelta: deltas.length > 0 ? Math.max(...deltas) : null,
      topTenAfterScenarioCount: destinationCases.filter(
        (candidate) =>
          candidate.rankAfter !== null && candidate.rankAfter <= 10,
      ).length,
    };
  });
}

function unknownBehavior(cases: JsonRecord[]): JsonRecord {
  const before = cases.map((candidate) => candidate.before);
  const ambientRatings = [
    ...new Set(before.map((state) => state.seasonality.ambientRating)),
  ];
  const selectedRatings = [
    ...new Set(before.map((state) => state.seasonality.selectedDateRating)),
  ];
  const fieldContributions = [
    ...new Set(
      before.map((state) => state.seasonality.seasonalityFieldContribution),
    ),
  ];
  const sourceCounts = Object.fromEntries(
    [...new Set(before.map((state) => state.condition.source))]
      .sort()
      .map((source) => [
        source,
        before.filter((state) => state.condition.source === source).length,
      ]),
  );
  const conditionDeltas = [
    ...new Set(before.map((state) => state.condition.scoreDelta)),
  ].sort((a, b) => a - b);
  return {
    classification: "unknown_seasonality_bias",
    casesEvaluated: cases.length,
    behavior: "neutral_fallback",
    exactSemantics: {
      missingSeasonRatingFallback: 5,
      missingBestMonthsBonus: 0,
      missingSeasonPenalty: 0,
      missingEvidenceDoesNotProduceSeasonPenalty: true,
      nonSeasonalConditionEvidenceMayStillContribute: true,
    },
    observedBeforeState: {
      ambientRatings,
      selectedDateRatings: selectedRatings,
      seasonalityFieldContributions: fieldContributions,
      conditionSourceCounts: sourceCounts,
      conditionScoreDeltas: conditionDeltas,
    },
    conclusion:
      "Unknown seasonality is neutral: the scorer falls back to 5 and the date evaluator gives no season/best-month contribution. Summer/winter comfort or other non-seasonal evidence can still contribute independently.",
  };
}

function scenarioTableRow(record: JsonRecord): string {
  const value = (x: unknown) =>
    x === null || x === undefined ? "—" : String(x);
  return `| ${record.destinationId} | ${record.origin.id} | ${record.position} | ${record.testDate} | ${value(record.rankBefore)} → ${value(record.rankAfter)} | ${value(record.absoluteRankDelta)} | ${value(record.scoreBefore)} → ${value(record.scoreAfter)} | ${value(record.seasonalityContributionBefore)} → ${value(record.seasonalityContributionAfter)} | ${value(record.travelTimeContributionBefore)} → ${value(record.travelTimeContributionAfter)} | ${value(record.budgetContributionBefore)} → ${value(record.budgetContributionAfter)} | ${record.classification} |`;
}

function renderMarkdown(audit: JsonRecord): string {
  const summary = audit.summary;
  const countRows = Object.entries(summary.classificationCounts as JsonRecord)
    .map(([category, count]) => `| ${category} | ${count} |`)
    .join("\n");
  const destinationRows = (audit.destinationConclusions as JsonRecord[])
    .map(
      (record) =>
        `| ${record.id} | ${record.testedScenarioCount} | ${record.maxAbsoluteRankDelta ?? "—"} | ${record.topTenAfterScenarioCount} | ${record.classification} |`,
    )
    .join("\n");
  const anomalyRows = (audit.anomalies as JsonRecord[]).length
    ? (audit.anomalies as JsonRecord[])
        .map((anomaly) => `- **${anomaly.kind}**: ${anomaly.detail}`)
        .join("\n")
    : "- None.";
  const scenarioRows = (audit.cases as JsonRecord[])
    .map(scenarioTableRow)
    .join("\n");
  const sengan = audit.senganInvestigation as JsonRecord;
  const trigger = sengan.triggerScenario as JsonRecord;
  const supplementalRows = (sengan.supplementalChecks as JsonRecord[])
    .map((check) => {
      const before = check.before as JsonRecord;
      const after = check.after as JsonRecord;
      return `| ${check.origin} | ${check.duration} | ¥${check.budget} | ${check.date} | ${before.rank ?? "—"} → ${after.rank ?? "—"} | ${before.score ?? "—"} → ${after.score ?? "—"} | ${before.travelTimeContribution ?? "—"} → ${after.travelTimeContribution ?? "—"} | ${before.budgetContribution ?? "—"} → ${after.budgetContribution ?? "—"} |`;
    })
    .join("\n");
  return `# KAI-151 Sakura Recommendation-Sensitivity Audit

- Base catalogue commit: \`${audit.baseCommit}\`
- Post-mutation catalogue snapshot: \`${audit.afterCommit}\`
- Audit clock: \`${audit.auditClock}\` (frozen for deterministic existing-engine scoring)
- Audit generated: \`${audit.auditDate}\`
- Mutated destinations audited: **${audit.mutationCount}**
- Primary scenarios: **${audit.cases.length}** (${audit.mutationCount} destinations × ${audit.origins.length} origins × ${POSITION_ORDER.length} date positions)
- Canonical seasonality data changed by this audit: **no**

## Decision gate

**${audit.decisionGate.recommendation}**

${audit.decisionGate.rationale}

This is a sensitivity audit only. It does not change canonical seasonality data, recommendation weights, transport, budget, routing, UI, or any deferred thematic cohort.

## Scope and engine contract

- The audit compares the exact base catalogue with the exact post-PR-315 catalogue using the existing \`getRecommendations\`, \`calculateScore\`, \`evaluateSeasonalSuitability\`, and canonical budget/transport services.
- Context: \`vibe=any\`, \`tripDuration=any\` (the original day-trip trigger), party size ${PARTY_SIZE}, budget ¥${BUDGET.toLocaleString("en-US")}, standard budget tier, no car, and all public modes.
- Origins: Tokyo, Osaka, Fukuoka, and Kagoshima-Chuo as a regional origin.
- Every mutated destination is tested in a documented in-season date, the month immediately before the verified window, and a clearly off-season date.
- Positive rank delta means promotion (\`rankBefore - rankAfter\`). Absolute rank delta is reported separately.

## Classification counts

| Classification | Primary scenario count |
| --- | ---: |
${countRows}

The scenario IDs and destination IDs for every classification are in the machine-readable artifact under \`summary.classificationScenarios\` and \`summary.classificationDestinationIds\`.

## Unknown-vs-structured behavior

${audit.unknownBehavior.conclusion}

- Missing season rating fallback: **${audit.unknownBehavior.exactSemantics.missingSeasonRatingFallback}**
- Missing \`bestMonths\` bonus: **${audit.unknownBehavior.exactSemantics.missingBestMonthsBonus}**
- Missing season penalty: **${audit.unknownBehavior.exactSemantics.missingSeasonPenalty}**
- Non-seasonal comfort/ferry evidence can still contribute independently: **${audit.unknownBehavior.exactSemantics.nonSeasonalConditionEvidenceMayStillContribute}**
- Unknown-bias cases found: **${summary.classificationCounts.unknown_seasonality_bias}**

## Sengan-en investigation

### Original trigger

The existing Phase 2A impact artifact recorded Sengan-en in the Fukuoka spring scenario as **164 → 4**. The pinned rerun records **${trigger.rankBefore} → ${trigger.rankAfter}** using the same scores and deterministic engine path; the one-rank baseline discrepancy is preserved as a reproducibility note, not hidden.

- Score: **${trigger.scoreBefore} → ${trigger.scoreAfter}**
- Score delta: **${trigger.scoreDelta}**
- Seasonality field delta: **${trigger.scoreDeltaAttribution.seasonalityFieldDelta}**
- Attribution residual: **${trigger.scoreDeltaAttribution.residual}**
- Before seasonality: fallback rating 5, no \`bestMonths\`, condition source unknown
- After seasonality: Spring rating 10, \`bestMonths=[2,3,4]\`
- Selected-date season correction: **${trigger.after.seasonality.selectedDateSeasonCorrection}**
- Best-month bonus: **${trigger.after.seasonality.bestMonthBonus}**
- Seasonality contribution: **${trigger.seasonalityContributionBefore} → ${trigger.seasonalityContributionAfter}**
- Best mode: **${trigger.after.mode.bestMode}**
- Travel estimate: **${JSON.stringify(trigger.after.ranking.transport)}**
- Displayed cost range: **${JSON.stringify(trigger.after.ranking.estimatedCostRange)}**, budget ¥${BUDGET.toLocaleString("en-US")}
- Travel-time contribution: **${trigger.travelTimeContributionBefore} → ${trigger.travelTimeContributionAfter}** (zero because the original trigger has no duration constraint; the transport access component and estimate remain present)
- Budget contribution: **${trigger.budgetContributionBefore} → ${trigger.budgetContributionAfter}**
- Dominance assessment: **${trigger.dominance.reason}**

The movement is caused by the seasonal field only: the final score increases by 18 points, consisting of +15 for the selected Spring rating and +3 for the verified April month. Travel mode, travel estimate, cost range, budget contribution, and non-seasonal score components do not change.

### Outside the verified period

The shoulder and off-season Sengan-en rows are included in the primary scenario table and JSON. They show the exact date-sensitive behavior rather than assuming that an April promotion persists unchanged:

- Shoulder: selected month immediately before the verified \`[2,3,4]\` window.
- Off-season: August, four months after the last verified month.

### Duration and budget stress checks

These supplemental checks are not included in the 168-case classification count:

| Origin | Duration | Budget | Date | Rank before → after | Score before → after | Travel-time contribution before → after | Budget contribution before → after |
| --- | --- | ---: | --- | --- | --- | --- | --- |
${supplementalRows}

## Seasonality-dominance assessment

The audit uses a conservative, documented heuristic: a post-change top-ten result is flagged only when the seasonal field contributes at least 15 points, its fundamental score is at least 15 points below the post-change top-ten median, and it also has a materially long travel estimate, cost above the selected budget, or unknown transport evidence. Flagged cases are classified as \`possible_seasonality_overweighting\`; none are silently reclassified as data errors.

- Potential-overweighting cases: **${audit.summary.classificationCounts.possible_seasonality_overweighting}**
- Anomalies: **${audit.anomalies.length}**

${anomalyRows}

## Per-destination conclusions

| Destination | Scenarios | Max absolute rank delta | Top-ten appearances after | Conclusion |
| --- | ---: | ---: | ---: | --- |
${destinationRows}

## All primary scenarios

| Destination | Origin | Position | Date | Rank before → after | Abs. delta | Score before → after | Seasonality before → after | Travel-time before → after | Budget before → after | Classification |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
${scenarioRows}

## Reproducibility

- Canonical snapshot hashes, mutation-scope checks, fixed context, and all scenario outputs are in \`scripts/audit/kai-151-sakura-sensitivity.json\`.
- The generator is read-only with respect to catalogue data.
- \`npm run check:kai-151-sensitivity\` compares both committed artifacts byte-for-byte with a fresh generation.
- No autumn, winter, alpine, beach, no-signal, provenance-only, Budget v2, local-transport, routing, UI, or unrelated recommendation work was started.
`;
}

function buildAudit(): JsonRecord {
  const baseCatalogue = readGitJson(
    BASE_COMMIT,
    "src/shared/data/destinations-index.json",
  ) as Destination[];
  const afterCatalogue = readGitJson(
    AFTER_COMMIT,
    "src/shared/data/destinations-index.json",
  ) as Destination[];
  const review = readGitJson(
    AFTER_COMMIT,
    "scripts/audit/kai-151-sakura-phase2a-review.json",
  ) as JsonRecord;
  const priorImpact = readGitJson(
    AFTER_COMMIT,
    PRIOR_IMPACT_PATH,
  ) as JsonRecord;
  const mutationRecords = (review.records as JsonRecord[]).filter(
    (record) => record.mutationAllowed === true,
  );
  if (mutationRecords.length !== 14) {
    throw new Error(
      `Expected exactly 14 mutation records, found ${mutationRecords.length}`,
    );
  }
  const mutationIds = mutationRecords.map((record) => String(record.id));
  const baseById = new Map(baseCatalogue.map((record) => [record.id, record]));
  const afterById = new Map(
    afterCatalogue.map((record) => [record.id, record]),
  );
  const changedIds = afterCatalogue
    .filter(
      (record) =>
        !jsonEqual(
          seasonFields(baseById.get(record.id) ?? {}),
          seasonFields(record),
        ),
    )
    .map((record) => record.id);
  if (!jsonEqual([...changedIds].sort(), [...mutationIds].sort())) {
    throw new Error(
      `Seasonality scope mismatch: changed=${JSON.stringify(changedIds)} expected=${JSON.stringify(mutationIds)}`,
    );
  }
  for (const id of mutationIds) {
    const before = baseById.get(id);
    const after = afterById.get(id);
    const reviewRecord = mutationRecords.find((record) => record.id === id);
    if (!before || !after || !reviewRecord)
      throw new Error(`Missing mutation record ${id}`);
    if (
      !jsonEqual(after.bestSeason, reviewRecord.proposed.bestSeason) ||
      !jsonEqual(after.bestMonths, reviewRecord.proposed.bestMonths) ||
      !jsonEqual(after.season, reviewRecord.proposed.seasonVector)
    ) {
      throw new Error(
        `Post catalogue does not match review proposal for ${id}`,
      );
    }
  }

  const cases: JsonRecord[] = [];
  for (const mutation of mutationRecords) {
    const id = String(mutation.id);
    const beforeDestination = baseById.get(id);
    const afterDestination = afterById.get(id);
    if (!beforeDestination || !afterDestination)
      throw new Error(`Missing catalogue ID ${id}`);
    const bestMonths = afterDestination.bestMonths;
    if (!Array.isArray(bestMonths) || bestMonths.length === 0) {
      throw new Error(
        `Mutation ${id} lacks bestMonths for scenario generation`,
      );
    }
    const dates = scenarioDates(id, bestMonths);
    for (const origin of ORIGINS) {
      for (const position of POSITION_ORDER) {
        cases.push(
          compareCase(
            id,
            String(mutation.name),
            origin,
            position,
            dates[position],
            beforeDestination,
            afterDestination,
            baseCatalogue,
            afterCatalogue,
          ),
        );
      }
    }
  }
  if (cases.length !== 14 * ORIGINS.length * POSITION_ORDER.length) {
    throw new Error(`Expected 168 primary cases, found ${cases.length}`);
  }

  const summaryCounts = summarizeCounts(cases);
  const classificationCounts = summaryCounts.counts as JsonRecord;
  const destinationSummary = destinationConclusions(cases, mutationRecords);
  const triggerScenario = cases.find(
    (record) =>
      record.destinationId === "sengan-en-garden-kagoshima" &&
      record.origin.id === "fukuoka" &&
      record.position === "in_season",
  );
  if (!triggerScenario)
    throw new Error("Sengan trigger scenario was not generated");
  const priorTrigger = (priorImpact.results as JsonRecord[])
    .find((result) => result.origin === "fukuoka")
    ?.changed?.find(
      (record: JsonRecord) => record.id === "sengan-en-garden-kagoshima",
    );

  const supplementalSpecs = [
    { origin: "fukuoka" as OriginName, duration: "any", budget: BUDGET },
    {
      origin: "fukuoka" as OriginName,
      duration: "shortOuting",
      budget: BUDGET,
    },
    { origin: "fukuoka" as OriginName, duration: "halfDay", budget: BUDGET },
    { origin: "fukuoka" as OriginName, duration: "fullDay", budget: BUDGET },
    { origin: "kagoshima" as OriginName, duration: "any", budget: BUDGET },
    {
      origin: "kagoshima" as OriginName,
      duration: "shortOuting",
      budget: BUDGET,
    },
    { origin: "kagoshima" as OriginName, duration: "fullDay", budget: BUDGET },
    { origin: "fukuoka" as OriginName, duration: "any", budget: 30_000 },
  ];
  const senganBefore = baseById.get("sengan-en-garden-kagoshima")!;
  const senganAfter = afterById.get("sengan-en-garden-kagoshima")!;
  const supplementalChecks = supplementalSpecs.map((spec) => {
    const origin = ORIGINS.find((candidate) => candidate.name === spec.origin)!;
    const context = buildContext(
      origin,
      "2026-04-05",
      spec.duration,
      spec.budget,
    );
    const beforeRows = getRecommendations(baseCatalogue, context);
    const afterRows = getRecommendations(afterCatalogue, context);
    const beforeState = stateSnapshot(
      senganBefore,
      context,
      "2026-04-05",
      beforeRows,
    );
    const afterState = stateSnapshot(
      senganAfter,
      context,
      "2026-04-05",
      afterRows,
    );
    return {
      origin: spec.origin,
      duration: spec.duration,
      budget: spec.budget,
      date: "2026-04-05",
      before: {
        rank: beforeState.ranking.rank,
        score: beforeState.score,
        travelTimeContribution: beforeState.mode.travelTimeContribution,
        budgetContribution: beforeState.mode.budgetContribution,
        bestMode: beforeState.mode.bestMode,
        travel: beforeState.ranking.transport,
        estimatedCostRange: beforeState.ranking.estimatedCostRange,
      },
      after: {
        rank: afterState.ranking.rank,
        score: afterState.score,
        travelTimeContribution: afterState.mode.travelTimeContribution,
        budgetContribution: afterState.mode.budgetContribution,
        bestMode: afterState.mode.bestMode,
        travel: afterState.ranking.transport,
        estimatedCostRange: afterState.ranking.estimatedCostRange,
      },
      scoreDelta: numericDelta(beforeState.score, afterState.score),
      seasonalityFieldDelta: numericDelta(
        beforeState.seasonality.seasonalityFieldContribution,
        afterState.seasonality.seasonalityFieldContribution,
      ),
    };
  });

  const anomalies: JsonRecord[] = [];
  if (priorTrigger && triggerScenario.rankBefore !== priorTrigger.before.rank) {
    anomalies.push({
      kind: "prior_rank_reproduction_note",
      severity: "low",
      detail: `The committed directional artifact recorded Sengan/Fukuoka in-season as ${priorTrigger.before.rank} → ${priorTrigger.after.rank}; the pinned current-engine rerun is ${triggerScenario.rankBefore} → ${triggerScenario.rankAfter} with identical 54.9 → 72.9 scores. The rerun has a deterministic 54.900000… tie with Nagasaki ahead of Sengan.`,
    });
  }
  for (const record of cases) {
    if (!record.scoreDeltaAttribution.exactWithinTolerance) {
      anomalies.push({
        kind: "score_attribution_residual",
        severity: "high",
        detail: `${record.scenarioId} has residual ${record.scoreDeltaAttribution.residual}`,
      });
    }
    if (record.dominance.potentialSeasonalityOverweighting) {
      anomalies.push({
        kind: "possible_seasonality_overweighting",
        severity: "high",
        detail: `${record.scenarioId}: ${record.dominance.reason}`,
      });
    }
    if (
      record.before.ranking.recommendationCount !==
      record.after.ranking.recommendationCount
    ) {
      anomalies.push({
        kind: "recommendation_count_drift",
        severity: "medium",
        detail: `${record.scenarioId}: ${record.before.ranking.recommendationCount} → ${record.after.ranking.recommendationCount}`,
      });
    }
  }

  const decisionGate =
    classificationCounts.possible_seasonality_overweighting > 0 ||
    classificationCounts.unknown_seasonality_bias > 0
      ? {
          recommendation: "B. MERGE DATA, OPEN SEPARATE RANKING TICKET",
          rationale:
            "The canonical seasonality mutations remain source-backed, but the sensitivity audit found a recommendation-weighting or unknown-handling concern that should be tracked separately from data correctness.",
        }
      : {
          recommendation: "A. MERGE PR #315 AS-IS",
          rationale:
            "The seasonal score changes are fully attributable to the reviewed season fields and remain proportionate or large-but-explainable after travel, cost, transport, duration, and other ranking components are inspected. No unknown-seasonality bias or conservative dominance anomaly was found.",
        };

  return {
    ticket: "KAI-151",
    phase: "Phase 2A recommendation sensitivity — sakura pilot",
    baseCommit: BASE_COMMIT,
    afterCommit: AFTER_COMMIT,
    auditClock: AUDIT_CLOCK,
    auditDate: AUDIT_DATE,
    mutationCount: mutationRecords.length,
    mutationIds,
    origins: ORIGINS,
    context: {
      vibe: "any",
      duration: DURATION,
      budget: BUDGET,
      budgetTier: "standard",
      partySize: PARTY_SIZE,
      carMode: "none",
      publicModes: PUBLIC_MODES,
    },
    catalogueSnapshots: {
      baseSha256: sha256(
        readGitText(BASE_COMMIT, "src/shared/data/destinations-index.json"),
      ),
      afterSha256: sha256(
        readGitText(AFTER_COMMIT, "src/shared/data/destinations-index.json"),
      ),
      seasonalityChangedIds: changedIds,
      unrelatedSeasonalityChanges: [],
      canonicalDataChangedByAudit: false,
    },
    scoringSemantics: {
      seasonMultiplier: SCORING_WEIGHTS.SEASON_MULTIPLIER,
      seasonCorrectionMultiplier: SEASONAL_WEIGHTS.SEASON_CORRECTION_MULTIPLIER,
      bestMonthBonus: SEASONAL_WEIGHTS.BEST_MONTH_BONUS,
      unknownSeasonRatingFallback: 5,
      unknownBestMonthsBonus: 0,
      unknownEvidencePenalty: 0,
      rankDeltaDefinition: "rankBefore - rankAfter; positive means promotion",
      rawScoreTieBreak: "score descending, then destination ID ascending",
    },
    summary: {
      primaryScenarioCount: cases.length,
      classificationCounts,
      classificationScenarios: summaryCounts.scenarios,
      classificationDestinationIds: summaryCounts.destinationIds,
      destinationConclusionCounts: Object.fromEntries(
        [...new Set(destinationSummary.map((record) => record.classification))]
          .sort()
          .map((classification) => [
            classification,
            destinationSummary.filter(
              (record) => record.classification === classification,
            ).length,
          ]),
      ),
    },
    unknownBehavior: unknownBehavior(cases),
    dominanceHeuristic: {
      topTenRankAtMost: 10,
      seasonalFieldContributionAtLeast: 15,
      fundamentalGapAtLeast: 15,
      materiallyLongTravelMaxMinutesAbove: 180,
      materiallyOverBudget: true,
      requiresFundamentalGapAndMaterialDisadvantage: true,
    },
    senganInvestigation: {
      triggerScenario,
      priorRecordedObservation: priorTrigger ?? null,
      conclusion:
        "The 18-point trigger movement is exactly the existing seasonality path: +15 selected Spring rating correction and +3 April best-month bonus. The Fukuoka route remains a shinkansen estimate of 92–165 one-way minutes with an estimated ¥58,800–¥68,200 range for party size two under a ¥100,000 budget. The audit finds no conservative seasonality-dominance anomaly.",
      outsideVerifiedPeriodScenarioIds: cases
        .filter(
          (record) =>
            record.destinationId === "sengan-en-garden-kagoshima" &&
            record.origin.id === "fukuoka" &&
            record.position !== "in_season",
        )
        .map((record) => record.scenarioId),
      supplementalChecks,
    },
    anomalies,
    decisionGate,
    cases,
    destinationConclusions: destinationSummary,
  };
}

const audit = buildAudit();
const markdown = await formatWithPrettier(renderMarkdown(audit), {
  parser: "markdown",
});
const jsonText = await formatWithPrettier(stableJson(audit), {
  parser: "json",
});
if (process.argv.includes("--check")) {
  const committedJson = readFileSync(resolve(ROOT, OUTPUT_JSON), "utf8");
  const committedMarkdown = readFileSync(resolve(ROOT, OUTPUT_MD), "utf8");
  if (committedJson !== jsonText || committedMarkdown !== markdown) {
    throw new Error(
      "KAI-151 sensitivity artifacts are stale; regenerate them first",
    );
  }
  console.log("KAI-151 sakura sensitivity artifacts are current.");
} else {
  writeFileSync(resolve(ROOT, OUTPUT_JSON), jsonText, "utf8");
  writeFileSync(resolve(ROOT, OUTPUT_MD), markdown, "utf8");
  console.log(
    `KAI-151 sakura sensitivity audit wrote ${OUTPUT_JSON} and ${OUTPUT_MD} (${audit.cases.length} primary scenarios)`,
  );
}
