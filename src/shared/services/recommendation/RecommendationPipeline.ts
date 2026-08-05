import type { Destination } from "@/shared/types/destination";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import {
  estimateTripDuration,
  matchesTripDurationEstimate,
} from "./TripDurationService";
import { createRecommendationMatch } from "./RecommendationExplainability";
import {
  calculateConfidence,
  calculateScore,
  getValidModes,
} from "./RecommendationScorer";
import type { PipelineRecommendation } from "./RecommendationTypes";
import { evaluateWeekendCandidate } from "./WeekendPolicy";
import type { WeekendCandidateEvaluation } from "./WeekendPolicy";

function coordinatesWithinOneKm(
  a: PipelineRecommendation,
  b: PipelineRecommendation,
) {
  if (!a.coordinates || !b.coordinates) return false;
  return (
    getDistance(
      a.coordinates.lat,
      a.coordinates.lng,
      b.coordinates.lat,
      b.coordinates.lng,
    ) < 1
  );
}

export function diversifyRecommendations(
  recommendations: PipelineRecommendation[],
): PipelineRecommendation[] {
  const remaining = [...recommendations].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const selected: PipelineRecommendation[] = [];

  // ponytail: O(n²) is deliberate for a sub-1k catalogue; add spatial indexes only if profiling requires it.
  const visibleLimit = Math.min(20, remaining.length);
  while (remaining.length > 0 && selected.length < visibleLimit) {
    let bestIndex = -1;
    let bestAdjustedScore = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const parentId = candidate.relationships?.parentDestinationId;
      const conflictsWithHub = selected.some(
        (place) =>
          place.id === parentId ||
          place.relationships?.parentDestinationId === candidate.id,
      );
      if (conflictsWithHub) continue;

      const adjustedScore =
        candidate.score -
        Math.min(
          30,
          Math.max(
            0,
            ...selected.map((place) => {
              const sameArea =
                candidate.areaId && candidate.areaId === place.areaId ? 18 : 0;
              const sameParent =
                parentId &&
                parentId === place.relationships?.parentDestinationId
                  ? 8
                  : 0;
              const sameCategory =
                candidate.categories[0] &&
                candidate.categories[0] === place.categories[0]
                  ? 6
                  : 0;
              return (
                sameArea +
                sameParent +
                sameCategory +
                (coordinatesWithinOneKm(candidate, place) ? 8 : 0)
              );
            }),
          ),
        );

      if (
        adjustedScore > bestAdjustedScore ||
        (adjustedScore === bestAdjustedScore &&
          (bestIndex < 0 ||
            candidate.id.localeCompare(remaining[bestIndex].id) < 0))
      ) {
        bestIndex = index;
        bestAdjustedScore = adjustedScore;
      }
    }

    if (bestIndex < 0) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return [
    ...selected,
    ...remaining.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
  ];
}

export interface CandidateContext {
  homeStationCoords?: { lat: number; lng: number } | null;
  originZoneId?: RecommendationContext["originZoneId"];
}

export function buildRecommendationCandidate(
  destination: Destination,
  _context: CandidateContext,
): Destination {
  // Distance never authorizes or distorts transport data: the canonical
  // catalogue times are authoritative. The origin is carried separately in
  // the context for eligibility checks.
  return destination;
}

/**
 * Phase 1 pipeline contract. The existing ranking remains the baseline while
 * later phases can improve individual stages without changing callers.
 */
export function runRecommendationPipeline(
  destinations: Destination[],
  context: RecommendationContext,
): PipelineRecommendation[] {
  const tripMode = context.tripMode ?? "day_trip";
  const isWeekend = tripMode === "weekend_2d1n";

  const candidates = destinations.map((destination) =>
    buildRecommendationCandidate(destination, context),
  );

  // Cache weekend evaluations keyed by destination id
  const weekendEvalCache = new Map<string, WeekendCandidateEvaluation>();

  const eligible = candidates.filter((destination) => {
    if (!destination.id || context.visitedIds.includes(destination.id))
      return false;
    const modes = getValidModes(
      destination,
      context.carMode,
      context.publicModes,
      context.homeStationCoords || undefined,
      context.budgetTier,
      context.originZoneId,
      context.ferryTemporal,
    );
    if (modes.length === 0) return false;

    // Weekend mode: skip duration-band match; use evaluateWeekendCandidate.
    // Day-trip mode keeps the existing duration-band estimate unchanged.
    let durationEst = estimateTripDuration(destination, context, modes);
    if (isWeekend) {
      const eval_ = evaluateWeekendCandidate(
        destination,
        context,
        candidates,
        modes,
      );
      weekendEvalCache.set(destination.id, eval_);
      if (!eval_.eligible) return false;
    } else {
      if (!matchesTripDurationEstimate(durationEst, context.tripDuration))
        return false;
    }

    if (context.budgetTier === "luxury") return true;

    // Call getEstimatedBudgetRange once per mode
    const modeBudgetEstimates = modes.map((mode) =>
      getEstimatedBudgetRange(
        destination,
        mode,
        context.partySize,
        context.budgetTier,
        durationEst?.representativeHours,
        context.homeStationCoords || undefined,
        context.ferryTemporal,
      ),
    );

    // Filter by budget only using verified estimates where origin transport is included
    const verifiedEstimates = modeBudgetEstimates.filter(
      (b) => b.transportIncluded,
    );
    if (verifiedEstimates.length > 0) {
      const lowestVerifiedCost = Math.min(
        ...verifiedEstimates.map((b) => b.range[1]),
      );
      return lowestVerifiedCost <= context.budget;
    }

    // Retain as affordability-unknown under the neutral policy (do NOT filter out,
    // and do NOT classify as affordable based on an on-site-only range)
    return true;
  });

  const scored = eligible.map((candidate) => {
    const scoreResult = calculateScore(candidate, context);
    const weekend = isWeekend ? weekendEvalCache.get(candidate.id) : undefined;
    const totalScore = scoreResult.score + (weekend?.scoreDelta ?? 0);
    const match = createRecommendationMatch(candidate, context, totalScore);

    // Append weekend reasons
    if (weekend) {
      match.reasons.push(...weekend.reasons);
    }

    const durationEstimate = estimateTripDuration(
      candidate,
      context,
      getValidModes(
        candidate,
        context.carMode,
        context.publicModes,
        context.homeStationCoords || undefined,
        context.budgetTier,
        context.originZoneId,
        context.ferryTemporal,
      ),
    );
    const budgetResult = getEstimatedBudgetRange(
      candidate,
      scoreResult.bestMode || "train",
      context.partySize,
      context.budgetTier,
      durationEstimate?.representativeHours,
      context.homeStationCoords || undefined,
      context.ferryTemporal,
    );
    const estimatedCostRange = budgetResult.range;
    const estimatedCostTransportIncluded = budgetResult.transportIncluded;

    // Append weekendTransportExcluded reason if applicable
    if (weekend && !budgetResult.transportIncluded) {
      match.reasons.push({
        type: "Transport",
        code: "weekendTransportExcluded",
        title: "Transport Excluded",
        description:
          "Transport cost unavailable; total excludes origin transport",
      });
    }

    // Build scoreContributions
    const scoreContributions: Record<string, number> = {
      total: totalScore,
      transport: scoreResult.bestModeScore,
    };
    if (weekend) {
      scoreContributions["weekendTravel"] = weekend.travelScore;
      scoreContributions["weekendCapacity"] = weekend.capacityScore;
      scoreContributions["weekendWeather"] = weekend.weatherScore;
    }

    return {
      ...candidate,
      score: totalScore,
      match,
      bestTransportMode: scoreResult.bestMode,
      estimatedCostRange,
      estimatedCostTransportIncluded,
      weekend: weekend
        ? {
            travelFit: weekend.travelFit,
            capacity: weekend.capacity,
            weatherDays: weekend.weatherDays,
            accommodationAllowance: context.accommodationAllowance,
            estimatedCostTransportIncluded,
          }
        : undefined,
      pipeline: {
        eligible: true,
        estimatedCost: estimatedCostRange[0],
        estimatedCostRange,
        estimatedCostTransportIncluded,
        bestTransportMode: scoreResult.bestMode,
        scoreContributions,
        confidence: calculateConfidence(totalScore),
        reasons: match.reasons,
      },
    } as PipelineRecommendation;
  });

  return diversifyRecommendations(scored);
}
