import type { Destination } from "@/shared/types/destination";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import { matchesVisitDuration } from "./TripDurationService";
import { createRecommendationMatch } from "./RecommendationExplainability";
import {
  calculateConfidence,
  calculateScore,
  getValidModes,
} from "./RecommendationScorer";
import type { PipelineRecommendation } from "./RecommendationTypes";
import { evaluateWeekendCandidate } from "./WeekendPolicy";
import type { WeekendCandidateEvaluation } from "./WeekendPolicy";
import { evaluateTravelConditions } from "./TravelConditions";
import { isTripDatesTransportEligible } from "./TravelConditions";
import { resolveOriginMunicipalityId } from "./OriginAreaService";
import { consolidateTokyoWards } from "./TokyoWardsConsolidation";
import { getOriginAwareTransportEstimate } from "@/shared/services/transport/OriginAwareTransportService";
import {
  consolidateWeekendAreas,
  type WeekendAreaConsolidation,
} from "./WeekendAreaPolicy";

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
  // Resolved for every mode: weekend uses it for the origin-local
  // exclusion, and the Tokyo wards consolidation uses the origin region.
  const originMunicipalityId = resolveOriginMunicipalityId(
    context.homeStationCoords ?? undefined,
    destinations,
  );

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
    // Canonical trip-date transport eligibility: a ferry-only trip must be
    // covered on every travel day (outbound Day 1 / return Day 2).
    if (
      context.travelDates &&
      !isTripDatesTransportEligible(
        destination,
        modes,
        context.homeStationCoords ?? undefined,
        context.travelDates,
      )
    ) {
      return false;
    }

    // Weekend mode: skip duration-band match; use evaluateWeekendCandidate.
    // Day-trip mode uses pure visit-duration matching (origin must not change
    // the time-at-destination classification).
    if (isWeekend) {
      const eval_ = evaluateWeekendCandidate(
        destination,
        context,
        candidates,
        modes,
        originMunicipalityId,
      );
      weekendEvalCache.set(destination.id, eval_);
      if (!eval_.eligible) return false;
    } else {
      if (!matchesVisitDuration(destination, context.tripDuration ?? "any"))
        return false;
    }

    if (context.budgetTier === "luxury") return true;

    // Call getEstimatedBudgetRange once per mode; it derives that mode's own
    // trip duration internally.
    const modeBudgetEstimates = modes.map((mode) =>
      getEstimatedBudgetRange(
        destination,
        mode,
        context.partySize,
        context.budgetTier,
        context.homeStationCoords || undefined,
        context.ferryTemporal,
      ),
    );

    // Filter by budget only using complete verified estimates (origin
    // transport included and mode-specific duration known).
    const verifiedEstimates = modeBudgetEstimates.filter(
      (b) => b.transportIncluded && b.durationIncluded && b.range !== null,
    );
    if (verifiedEstimates.length > 0) {
      const lowestVerifiedCost = Math.min(
        ...verifiedEstimates.map((b) => b.range![1]),
      );
      return lowestVerifiedCost <= context.budget;
    }

    // Retain as affordability-unknown under the neutral policy (do NOT filter out,
    // and do NOT classify as affordable based on an on-site-only range)
    return true;
  });

  // Hub-first consolidation: 2D1N primary results are coherent trip areas
  // (hubs / standalone areas); child POIs and standalone POIs are dropped.
  let weekendAreas: WeekendAreaConsolidation | undefined;
  if (isWeekend) {
    weekendAreas = consolidateWeekendAreas(eligible, candidates);
  }
  const weekendPrimaryIds = weekendAreas
    ? new Set(weekendAreas.areas.map((area) => area.id))
    : null;

  const scored = eligible
    .filter(
      (candidate) =>
        !isWeekend || (weekendPrimaryIds?.has(candidate.id) ?? false),
    )
    .map((candidate) => {
      const scoreResult = calculateScore(candidate, context);
      const weekend = isWeekend
        ? weekendEvalCache.get(candidate.id)
        : undefined;
      // Shared forecast/seasonal/unknown evaluation for explicit trip dates.
      // Forecast-covered days keep their existing scoring paths (weekend
      // weatherDays / ENV actual); only uncovered days contribute a delta,
      // so existing in-window behaviour is byte-for-byte unchanged.
      const condition = context.travelDates
        ? evaluateTravelConditions(
            candidate,
            context.travelDates,
            context.forecastMap,
          )
        : undefined;
      const totalScore =
        scoreResult.score +
        (weekend?.scoreDelta ?? 0) +
        (condition?.scoreDelta ?? 0);
      const match = createRecommendationMatch(candidate, context, totalScore);

      // Append weekend reasons
      if (weekend) {
        match.reasons.push(...weekend.reasons);
      }
      // Append forecast/seasonal condition reasons (labelled, never
      // fabricated as forecast).
      if (condition) {
        match.reasons.push(...condition.reasons);
      }

      // The exact estimate used for ranking/budget; cards and roulette read
      // it from the recommendation instead of recomputing transport.
      const transportEstimate = getOriginAwareTransportEstimate(
        candidate,
        {
          homeStationCoords: context.homeStationCoords ?? undefined,
          ferryTemporal: context.ferryTemporal,
        },
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
        context.homeStationCoords || undefined,
        context.ferryTemporal,
      );
      const estimatedCostRange =
        budgetResult.durationIncluded && budgetResult.range
          ? budgetResult.range
          : undefined;
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
        transportEstimate,
        bestTransportMode: scoreResult.bestMode,
        estimatedCostRange,
        estimatedCostTransportIncluded,
        condition,
        weekend: weekend
          ? {
              travelFit: weekend.travelFit,
              capacity: weekend.capacity,
              weatherDays: weekend.weatherDays,
              accommodationAllowance: context.accommodationAllowance,
              estimatedCostTransportIncluded,
              areaKind: weekendAreas?.kindById.get(candidate.id),
              placeCount: weekendAreas?.placeCountById.get(candidate.id) ?? 0,
            }
          : undefined,
        pipeline: {
          eligible: true,
          estimatedCost: estimatedCostRange?.[0],
          estimatedCostRange,
          estimatedCostTransportIncluded,
          bestTransportMode: scoreResult.bestMode,
          scoreContributions,
          confidence: calculateConfidence(totalScore),
          reasons: match.reasons,
        },
      } as PipelineRecommendation;
    });

  // Conditional Tokyo 23 Wards consolidation: outside Kanto, eligible ward
  // hubs collapse into one virtual super-hub result.
  const consolidated = consolidateTokyoWards({
    results: scored,
    originPrefecture: originMunicipalityId?.split(":")[0]?.toLowerCase(),
    pool: destinations,
    tripMode,
  });

  return diversifyRecommendations(consolidated);
}
