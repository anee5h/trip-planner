import type { Destination } from "@/shared/types/destination";
import { getEstimatedBudgetRange } from "@/shared/services/budget/BudgetService";
import {
  calculateTripCost,
  evaluateAffordability,
} from "@/shared/services/budget/tripCostEngine";
import { getDistance } from "@/shared/utils/distance";
import type { RecommendationContext } from "./RecommendationContext";
import {
  hasPersonalizedOrigin,
  getDayTripTravelDurationEvidence,
  matchesPersonalizedDayTripDuration,
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
  const scoreContext =
    context.tripMode === undefined ? { ...context, tripMode } : context;
  // Resolved for every mode: weekend uses it for the origin-local
  // exclusion, and the Tokyo wards consolidation uses the origin region.
  const originMunicipalityId = resolveOriginMunicipalityId(
    context.homeStationCoords ?? undefined,
    destinations,
  );

  const candidates = destinations
    .filter((destination) => destination.recommendationEligible !== false)
    .map((destination) => buildRecommendationCandidate(destination, context));
  const hasOrigin = hasPersonalizedOrigin(context);

  // Cache weekend evaluations keyed by destination id
  const weekendEvalCache = new Map<string, WeekendCandidateEvaluation>();

  const eligible = candidates.filter((destination) => {
    if (!destination.id || context.visitedIds.includes(destination.id))
      return false;
    // Without a personalized origin, day-trip browsing remains neutral: no
    // topology or canonical travel claim can be evaluated yet. Weekend mode
    // retains its existing conservative transport gate.
    const modes = hasOrigin
      ? getValidModes(
          destination,
          context.carMode,
          context.publicModes,
          context.homeStationCoords || undefined,
          context.budgetTier,
          context.originZoneId,
          context.ferryTemporal,
        )
      : [];
    if (modes.length === 0 && (hasOrigin || isWeekend)) return false;
    // Canonical trip-date transport eligibility: a ferry-only trip must be
    // covered on every travel day (outbound Day 1 / return Day 2).
    if (
      hasOrigin &&
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

    // Weekend mode: skip day-trip duration matching; use
    // evaluateWeekendCandidate. Day trips keep the pure visit band as their
    // on-site source, then apply verified-or-bounded-estimated origin-aware
    // feasibility when an origin and constrained duration are present.
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
      // KAI-63 D4: duration filtering applies only under an explicit
      // duration/trip-mode constraint — mirroring the Explore gate
      // (Destinations.tsx). An explicit tripMode=day_trip (even with
      // duration "any") applies the day-trip envelope; an explicit
      // duration applies that duration; absent both (no explicit trip
      // mode, duration absent/"any") eligibility stays pure reachability.
      const requestedDuration = context.tripDuration;
      const durationConstrained =
        context.tripMode === "day_trip" ||
        (requestedDuration !== undefined && requestedDuration !== "any");
      if (
        durationConstrained &&
        !matchesPersonalizedDayTripDuration(
          destination,
          context,
          modes,
          requestedDuration ?? "any",
        )
      ) {
        return false;
      }
    }

    if (context.budgetTier === "luxury") return true;

    // KAI-217B round-2: the budget gate evaluates the CANONICAL engine cost
    // per mode. SOFT recommendation eligibility (required):
    //   - fits       → retain
    //   - may_exceed → retain, exposed as a warning (a straddling range is
    //                  still ELIGIBLE in soft recommendations)
    //   - unknown    → neutral retain (KAI-12: never hard-fail on partial/
    //                  open-ended/unavailable evidence)
    //   - over       → hard-fail ONLY when there is no valid fits/
    //                  may_exceed/neutral alternative mode (per-mode, the
    //                  destination still has other usable modes).
    const modeResults = modes.map((mode) =>
      calculateTripCost({
        dest: destination,
        mode,
        partySize: context.partySize,
        homeCoords: context.homeStationCoords || undefined,
        tripMode: isWeekend ? "weekend_2d1n" : "day_trip",
        // KAI-217B repair: overnight recommendation affordability MUST
        // include the user's accommodation selection — the engine sees
        // missing accommodation as partial without it.
        accommodationAllowance: context.accommodationAllowance,
        ferryTemporal: context.ferryTemporal,
      }),
    );
    const affordances = modeResults.map((r) =>
      evaluateAffordability(r, context.budget),
    );
    // Any mode that COMPLETELY fits (max <= budget) hard-passes.
    if (affordances.some((a) => a === "fits")) return true;
    // may_exceed is ELIGIBLE in soft recommendations (retain + warning);
    // unknown is neutral-retain.
    if (affordances.some((a) => a === "may_exceed" || a === "unknown")) {
      return true;
    }
    // No usable modes (e.g. no origin context): neutral retain — never
    // hard-fail on the absence of a mode.
    if (affordances.length === 0) return true;
    // Only when EVERY mode is definitely over (complete, min > budget, and
    // no fits/may_exceed/neutral alternative exists) does the destination
    // hard-fail.
    if (affordances.every((a) => a === "over")) return false;
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
      const scoreResult = calculateScore(candidate, scoreContext);
      const weekend = isWeekend
        ? weekendEvalCache.get(candidate.id)
        : undefined;
      // Shared forecast/seasonal/unknown evaluation for explicit trip dates.
      // Forecast-covered days keep their existing scoring paths (weekend
      // weatherDays / ENV actual); only uncovered days contribute a delta,
      // so existing in-window behaviour is byte-for-byte unchanged.
      // KAI-130: no origin forecastMap is passed — the origin forecast is
      // display-only and never contributes a destination score delta.
      // Without it, every explicit date evaluates deterministically via
      // catalogue seasonal evidence (weather arrival cannot change
      // ranking, and ranking is stable across renders).
      const condition = context.travelDates
        ? evaluateTravelConditions(candidate, context.travelDates)
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

      // Cards and roulette read the shared day-trip evidence from the
      // recommendation instead of recomputing transport. Budget remains on
      // its separate verified-only path below.
      const validModes = getValidModes(
        candidate,
        context.carMode,
        context.publicModes,
        context.homeStationCoords || undefined,
        context.budgetTier,
        context.originZoneId,
        context.ferryTemporal,
      );
      // Day-trip cards may use the same bounded estimated evidence as the
      // feasibility gate. Weekend keeps its separate canonical-only policy.
      const transportEstimate = isWeekend
        ? getOriginAwareTransportEstimate(
            candidate,
            {
              homeStationCoords: context.homeStationCoords ?? undefined,
              originZoneId: context.originZoneId,
              ferryTemporal: context.ferryTemporal,
            },
            validModes,
          )
        : getDayTripTravelDurationEvidence(candidate, context, validModes)
            .estimate;
      // Card travel and cost must describe one transport choice. The scored
      // mode remains a ranking input; the displayed canonical estimate is the
      // source of truth for the card's mode and matching budget status. Its
      // evidence still distinguishes bounded access from a verified corridor.
      const cardTransportMode = transportEstimate?.mode ?? scoreResult.bestMode;
      // KAI-217B: the card's displayed cost range comes from the CANONICAL
      // engine — a COMPLETE result only (food/cafe/parking/5% excluded).
      // Partial/open-ended/unavailable results yield NO cost chip on the
      // card (honest: no strict cost claim on incomplete evidence).
      const cardEngineResult = cardTransportMode
        ? calculateTripCost({
            dest: candidate,
            mode: cardTransportMode,
            partySize: context.partySize,
            homeCoords: context.homeStationCoords || undefined,
            tripMode: isWeekend ? "weekend_2d1n" : "day_trip",
            // KAI-217B repair: pass the accommodation allowance so an
            // overnight card range is not falsely partial.
            accommodationAllowance: context.accommodationAllowance,
            ferryTemporal: context.ferryTemporal,
          })
        : null;
      const budgetResult = cardTransportMode
        ? getEstimatedBudgetRange(
            candidate,
            cardTransportMode,
            context.partySize,
            context.budgetTier,
            context.homeStationCoords || undefined,
            context.ferryTemporal,
          )
        : {
            range: null,
            transportIncluded: false,
            transportFareScope: "unknown" as const,
            durationIncluded: false,
            food: null,
          };
      const estimatedCostRange =
        cardEngineResult?.completeness === "complete" && cardEngineResult.total
          ? [cardEngineResult.total.min, cardEngineResult.total.max]
          : undefined;
      const estimatedCostTransportIncluded = budgetResult.transportIncluded;
      const estimatedCostTransportScope = budgetResult.transportFareScope;

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
      if (scoreResult.dayTripTravelEfficiency) {
        scoreContributions.dayTripTravelEfficiency =
          scoreResult.dayTripTravelEfficiency.contribution;
      }
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
        estimatedCostTransportScope,
        condition,
        weekend: weekend
          ? {
              travelFit: weekend.travelFit,
              capacity: weekend.capacity,
              weatherDays: weekend.weatherDays,
              accommodationAllowance: context.accommodationAllowance,
              estimatedCostTransportIncluded,
              estimatedCostTransportScope,
              areaKind: weekendAreas?.kindById.get(candidate.id),
              placeCount: weekendAreas?.placeCountById.get(candidate.id) ?? 0,
            }
          : undefined,
        pipeline: {
          eligible: true,
          estimatedCost: estimatedCostRange?.[0],
          estimatedCostRange,
          estimatedCostTransportIncluded,
          estimatedCostTransportScope,
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
