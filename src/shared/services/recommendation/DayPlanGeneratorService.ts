import type { Destination } from "@/shared/types/destination";
import type { CatchmentScope } from "@/shared/types/planner";
import { findNearbyCombinations } from "./DestinationCombinationService";
import {
  getLocalizedPlace,
  getCanonicalPlaces,
} from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import type { RecommendationContext } from "./RecommendationContext";
import {
  getEffectiveVisitDuration,
  type VisitDuration,
} from "./VisitDurationPolicy";
import {
  estimateLocalTransitMinutes,
  hasCoordinates,
  type TransitEstimateResult,
} from "./LocalTransitEstimator";
import { getOpeningHoursAssessment } from "./OpeningHoursPolicy";
import { getDistance } from "@/shared/utils/distance";
import { calculateGeneratedPlanCost } from "../budget/GeneratedPlanCostService";

export type ReturnMode = "anchor" | "nearest_station" | "none";
export type DayPlanPace = "relaxed" | "balanced" | "packed";
export type DayPlanType = "half_day" | "full_day";
export type { CatchmentScope } from "@/shared/types/planner";

export function isHubPrimary(destination: Destination): boolean {
  return destination.role === "hub" || destination.kind === "city";
}

export interface RouteLeg {
  fromDestinationId?: string;
  toDestinationId?: string;
  durationMinutes: number;
  distanceKm?: number;
  curatedFare?: { min: number; max: number };
  source: TransitEstimateResult["source"];
  confidence: TransitEstimateResult["confidence"];
}

export interface PlanAssumption {
  type:
    | "unverified_hours"
    | "stale_hours"
    | "estimated_transit"
    | "estimated_cost"
    | "seasonal_access";
  destinationId?: string;
  message: { en: string; ja: string };
}

export interface DayPlanStep {
  id: string;
  type: "destination" | "meal" | "buffer" | "travel";
  timeBlock: "morning" | "afternoon" | "evening";
  startTime: string;
  endTime: string;
  durationMinutes: number;
  destination?: Destination;
  title: { en: string; ja: string };
  description?: { en: string; ja: string };
  hasUncertainHours?: boolean;
}

export type PlanFailureReason =
  | "anchor_exceeds_time_window"
  | "insufficient_real_pois"
  | "no_feasible_candidate_pair"
  | "unusable_transit_leg"
  | "unusable_return_leg";

export interface DayPlan {
  id: string;
  title: { en: string; ja: string };
  steps: DayPlanStep[];
  routeLegs?: RouteLeg[];
  assumptions?: PlanAssumption[];
  returnMode?: ReturnMode;
  returnEndpointId?: string;
  totalDurationMinutes: number;
  totalBudgetRange: [number, number];
  isOverfilled: boolean;
  isUnfeasible?: boolean;
  canFallbackToHalfDay?: boolean;
  unfeasibleErrorMessage?: { en: string; ja: string };
  anchor_exceeds_time_window?: boolean;
  failureReason?: PlanFailureReason;
  generatedWith?: {
    planType: DayPlanType;
    startTime: string;
    availableMinutes: number;
    returnMode: ReturnMode;
    pace: DayPlanPace;
    catchmentScope: CatchmentScope;
  };
  uncertainHoursDisclosures: Array<{ destinationId: string; name: string }>;
}

export interface DayPlanOptions {
  planType?: DayPlanType;
  startTime?: string;
  availableMinutes?: number;
  pace?: DayPlanPace;
  partySize?: number;
  maxEndTime?: string;
  catchmentScope?: CatchmentScope;
  returnMode?: ReturnMode;
  context?: Partial<RecommendationContext>;
  catalogue?: Destination[];
}

export interface PlannedCandidate {
  destination: Destination;
  recommendationScore: number;
  routeScore: number;
  minVisitMins: number;
  preferredVisitMins: number;
  maxVisitMins: number;
  durationSource: VisitDuration["source"];
  required: boolean;
}

export {
  getEffectiveVisitDuration,
  getTypeFallback,
  resolvePlanningCategory,
} from "./VisitDurationPolicy";
export {
  estimateLocalTransitMinutes,
  hasCoordinates,
} from "./LocalTransitEstimator";
export {
  getOpeningHoursAssessment,
  requiresOpeningHours,
  hasVerifiedOpeningHours,
} from "./OpeningHoursPolicy";

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== "string") return 9 * 60;
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 9 * 60;
  const validH = Math.min(23, Math.max(0, h));
  const validM = Math.min(59, Math.max(0, m));
  return validH * 60 + validM;
}

export function isRealDestinationStop(step: DayPlanStep): boolean {
  if (
    step.type !== "destination" ||
    !step.destination ||
    !step.destination.id
  ) {
    return false;
  }
  if (step.destination.role === "hub" || step.destination.kind === "city") {
    return false;
  }
  return step.durationMinutes > 0;
}

export function getTimeBlock(
  minutes: number,
): "morning" | "afternoon" | "evening" {
  const norm = Math.max(0, minutes) % (24 * 60);
  if (norm < 12 * 60) return "morning";
  if (norm < 17 * 60) return "afternoon";
  return "evening";
}

function formatTimeFromMidnight(mins: number): string {
  const normalized = Math.max(0, mins) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isStationDestination(
  dest: Destination | undefined,
): dest is Destination {
  return dest?.kind === "station";
}

export function resolveReturnEndpoint(
  finalStop: Destination,
  mode: ReturnMode,
  anchor: Destination,
  catalogue: Destination[] = [],
): Destination | null {
  if (mode === "anchor") return anchor;
  if (mode === "none") return null;

  const catsToUse = catalogue.length ? catalogue : getCanonicalPlaces();

  const rels = finalStop.relationships as Record<string, unknown> | undefined;
  const nearestStationId = rels?.nearestStationId as string | undefined;
  if (nearestStationId) {
    const st = catsToUse.find((d) => d.id === nearestStationId);
    if (isStationDestination(st)) return st;
  }

  if (finalStop.relationships?.parentDestinationId) {
    const parent = catsToUse.find(
      (d) => d.id === finalStop.relationships?.parentDestinationId,
    );
    if (isStationDestination(parent)) {
      return parent;
    }
  }

  if (hasCoordinates(finalStop)) {
    const nearbyStations = catsToUse.filter(
      (d) => isStationDestination(d) && hasCoordinates(d),
    );
    let closest: Destination | null = null;
    let minD = 5.0;
    for (const st of nearbyStations) {
      if (hasCoordinates(st)) {
        const d = getDistance(
          finalStop.coordinates.lat,
          finalStop.coordinates.lng,
          st.coordinates.lat,
          st.coordinates.lng,
        );
        if (d < minD) {
          minD = d;
          closest = st;
        }
      }
    }
    if (closest) return closest;
  }

  return null;
}

export function generateDayPlan(
  primary: Destination,
  options?: DayPlanOptions,
): DayPlan {
  if (!primary) {
    return {
      id: "empty-plan",
      title: { en: "Day Plan", ja: "日帰りプラン" },
      steps: [],
      totalDurationMinutes: 0,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      isUnfeasible: false,
      uncertainHoursDisclosures: [],
    };
  }

  const isPrimaryHub = isHubPrimary(primary);
  const planType: DayPlanType = options?.planType || "full_day";
  const pace: DayPlanPace = options?.pace || "balanced";
  const partySize = Math.max(1, options?.partySize || 1);
  const catchmentScope: CatchmentScope = options?.catchmentScope || "nearby";
  const returnMode: ReturnMode =
    options?.returnMode ?? (isPrimaryHub ? "anchor" : "nearest_station");
  const catalogue =
    options?.catalogue && options.catalogue.length
      ? options.catalogue
      : getCanonicalPlaces();

  const startMinsFromMidnight = parseTimeToMinutes(
    options?.startTime || "09:00",
  );

  const defaultWindow = planType === "half_day" ? 5 * 60 : 9 * 60;
  const legacyEndWindow = options?.maxEndTime
    ? (parseTimeToMinutes(options.maxEndTime) -
        startMinsFromMidnight +
        24 * 60) %
      (24 * 60)
    : defaultWindow;
  const hardAvailableMinutes = Math.max(
    1,
    options?.availableMinutes ?? legacyEndWindow,
  );

  const paceMultiplier =
    pace === "relaxed" ? 1.25 : pace === "packed" ? 0.8 : 1.0;

  const maxComboCount = catchmentScope === "wider" ? 8 : 6;
  const combos = findNearbyCombinations(
    primary,
    options?.context,
    maxComboCount,
    catchmentScope,
  );

  const candidatesMap = new Map<string, Destination>();
  if (!isPrimaryHub) {
    candidatesMap.set(primary.id, primary);
  }
  combos.forEach((c) => {
    if (
      c.secondary &&
      c.secondary.role !== "hub" &&
      c.secondary.kind !== "city"
    ) {
      candidatesMap.set(c.secondary.id, c.secondary);
    }
  });

  const plannedCandidates: PlannedCandidate[] = Array.from(
    candidatesMap.values(),
  ).map((dest) => {
    const dur = getEffectiveVisitDuration(dest);
    const minMins = Math.round(dur.minMins * paceMultiplier);
    const prefMins = Math.round(dur.prefMins * paceMultiplier);
    const maxMins = Math.round(dur.maxMins * paceMultiplier);
    const isAnchor = !isPrimaryHub && dest.id === primary.id;

    const transitEst = estimateLocalTransitMinutes(
      primary,
      dest,
      catchmentScope,
    );
    const transitMins = transitEst.usable ? transitEst.durationMinutes : 999;
    const ratingVal = dest.ratings?.overall ?? 4.5;
    const baseScore = ratingVal * 20;
    const routeScore = transitEst.usable ? baseScore - transitMins * 0.8 : -999;

    return {
      destination: dest,
      recommendationScore: baseScore,
      routeScore,
      minVisitMins: minMins,
      preferredVisitMins: prefMins,
      maxVisitMins: maxMins,
      durationSource: dur.source,
      required: isAnchor,
    };
  });

  const usableCandidates = plannedCandidates.filter(
    (c) => c.required || c.routeScore > -999,
  );

  const realStopThreshold = planType === "half_day" ? 2 : 3;

  const requiredCandidates = usableCandidates.filter(
    (c) =>
      c.required &&
      c.destination.role !== "hub" &&
      c.destination.kind !== "city" &&
      c.destination.kind !== "district",
  );
  const optionalCandidates = usableCandidates
    .filter((c) => !c.required)
    .sort((a, b) => b.routeScore - a.routeScore);

  const optionalStopsNeeded = Math.max(
    0,
    realStopThreshold - requiredCandidates.length,
  );

  const buildUnfeasiblePlan = (failureReason: PlanFailureReason): DayPlan => ({
    id: `plan-${primary.id}`,
    title: {
      en: isPrimaryHub
        ? `Plan a day from ${getLocalizedPlace(primary, "en").name}`
        : `Plan around ${getLocalizedPlace(primary, "en").name}`,
      ja: isPrimaryHub
        ? `${getLocalizedPlace(primary, "ja").name}発モデルコース`
        : `${getLocalizedPlace(primary, "ja").name} 周辺モデルコース`,
    },
    steps: [],
    returnMode,
    totalDurationMinutes: 0,
    totalBudgetRange: [0, 0],
    isOverfilled: false,
    isUnfeasible: true,
    canFallbackToHalfDay:
      planType === "full_day" && usableCandidates.length >= 2,
    failureReason,
    unfeasibleErrorMessage: {
      en:
        failureReason === "anchor_exceeds_time_window"
          ? "This place needs more time than the selected window."
          : failureReason === "unusable_return_leg"
            ? "We couldn’t reach a nearby station from the final stop."
            : failureReason === "insufficient_real_pois"
              ? "We couldn’t find enough suitable nearby stops for this schedule."
              : "We couldn’t create a realistic plan within this time window.",
      ja: "この時間枠内に現実的なプランを作成できませんでした。",
    },
    uncertainHoursDisclosures: [],
  });

  if (
    !isPrimaryHub &&
    getEffectiveVisitDuration(primary).minMins > hardAvailableMinutes
  ) {
    return buildUnfeasiblePlan("anchor_exceeds_time_window");
  }
  if (optionalCandidates.length < optionalStopsNeeded) {
    return buildUnfeasiblePlan("insufficient_real_pois");
  }

  interface SubsetSimulation {
    candidates: PlannedCandidate[];
    route: any;
    usedMinimumDurations: boolean;
    preferredTotal: number;
    actualTotal: number;
    score: number;
    transitTotal: number;
  }

  const validSimulations: SubsetSimulation[] = [];
  const simulationFailures: Array<
    "unusable_transit_leg" | "unusable_return_leg"
  > = [];

  function evaluateSubset(subset: PlannedCandidate[]) {
    let route = simulateRouteIncremental(
      primary,
      isPrimaryHub,
      subset,
      false,
      startMinsFromMidnight,
      catchmentScope,
      returnMode,
      catalogue,
    );
    let usedMin = false;
    let actual = route.totalMins;

    if (!route.feasible || route.totalMins > hardAvailableMinutes) {
      route = simulateRouteIncremental(
        primary,
        isPrimaryHub,
        subset,
        true,
        startMinsFromMidnight,
        catchmentScope,
        returnMode,
        catalogue,
      );
      usedMin = true;
      actual = route.totalMins;
    }

    if (route.feasible && route.totalMins <= hardAvailableMinutes) {
      const preferredTotal = subset.reduce(
        (acc, c) => acc + c.preferredVisitMins,
        0,
      );
      const score = subset.reduce((acc, c) => acc + c.recommendationScore, 0);
      const transitTotal = route.routeLegs.reduce(
        (acc, l) => acc + l.durationMinutes,
        0,
      );

      validSimulations.push({
        candidates: subset,
        route,
        usedMinimumDurations: usedMin,
        preferredTotal,
        actualTotal: actual,
        score,
        transitTotal,
      });
    } else if ("failureReason" in route && route.failureReason) {
      simulationFailures.push(route.failureReason);
    }
  }

  const getSubsets = (arr: PlannedCandidate[], size: number) => {
    const result: PlannedCandidate[][] = [];
    const run = (curr: PlannedCandidate[], idx: number) => {
      if (curr.length === size) {
        result.push([...curr]);
        return;
      }
      for (let i = idx; i < arr.length; i++) {
        run([...curr, arr[i]], i + 1);
      }
    };
    run([], 0);
    return result;
  };

  const phase1Subsets = getSubsets(optionalCandidates, optionalStopsNeeded);
  for (const sub of phase1Subsets) {
    evaluateSubset([...requiredCandidates, ...sub]);
  }

  if (
    planType === "full_day" &&
    optionalCandidates.length >= optionalStopsNeeded + 1
  ) {
    const phase2Subsets = getSubsets(
      optionalCandidates,
      optionalStopsNeeded + 1,
    );
    for (const sub of phase2Subsets) {
      evaluateSubset([...requiredCandidates, ...sub]);
    }
  }

  if (validSimulations.length === 0) {
    const failureReason =
      simulationFailures.length > 0 &&
      simulationFailures.every((reason) => reason === "unusable_return_leg")
        ? "unusable_return_leg"
        : simulationFailures.includes("unusable_transit_leg")
          ? "unusable_transit_leg"
          : "no_feasible_candidate_pair";
    return buildUnfeasiblePlan(failureReason);
  }

  validSimulations.sort((a, b) => {
    if (a.usedMinimumDurations !== b.usedMinimumDurations)
      return a.usedMinimumDurations ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.transitTotal !== b.transitTotal)
      return a.transitTotal - b.transitTotal;
    const aComp = a.usedMinimumDurations
      ? a.preferredTotal -
        a.candidates.reduce((sum, candidate) => sum + candidate.minVisitMins, 0)
      : 0;
    const bComp = b.usedMinimumDurations
      ? b.preferredTotal -
        b.candidates.reduce((sum, candidate) => sum + candidate.minVisitMins, 0)
      : 0;
    if (aComp !== bComp) return aComp - bComp;
    const aIds = a.candidates
      .map((c) => c.destination.id)
      .sort()
      .join(",");
    const bIds = b.candidates
      .map((c) => c.destination.id)
      .sort()
      .join(",");
    return aIds.localeCompare(bIds);
  });

  const bestSim = validSimulations[0];
  const builtRoute = bestSim.route;
  const activeCandidates = bestSim.candidates;

  const uncertainHoursDisclosures: Array<{
    destinationId: string;
    name: string;
  }> = [];

  activeCandidates.forEach((c) => {
    const assessment = getOpeningHoursAssessment(c.destination);
    if (assessment.status === "stale" || assessment.status === "unverified") {
      const loc = getLocalizedPlace(c.destination, "en");
      uncertainHoursDisclosures.push({
        destinationId: c.destination.id,
        name: loc.name,
      });
    }
  });

  const primLocEn = getLocalizedPlace(primary, "en");
  const primLocJa = getLocalizedPlace(primary, "ja");

  const rawPlan: DayPlan = {
    id: `plan-${primary.id}`,
    title: {
      en: isPrimaryHub
        ? `Plan a day from ${primLocEn.name}`
        : `Plan around ${primLocEn.name}`,
      ja: isPrimaryHub
        ? `${primLocJa.name}発 1日モデルコース`
        : `${primLocJa.name} 周辺モデルコース`,
    },
    steps: builtRoute.steps,
    routeLegs: builtRoute.routeLegs,
    assumptions: builtRoute.assumptions,
    returnMode,
    returnEndpointId: builtRoute.returnEndpoint?.id,
    totalDurationMinutes: builtRoute.totalMins,
    totalBudgetRange: [0, 0],
    isOverfilled: false,
    isUnfeasible: false,
    uncertainHoursDisclosures,
    generatedWith: {
      planType,
      startTime: formatTimeFromMidnight(startMinsFromMidnight),
      availableMinutes: hardAvailableMinutes,
      returnMode,
      pace,
      catchmentScope,
    },
  };

  const planCost = calculateGeneratedPlanCost(rawPlan, partySize);
  rawPlan.totalBudgetRange = planCost.totalRange;
  if (planCost.assumptions.length > 0) {
    rawPlan.assumptions = [
      ...(rawPlan.assumptions || []),
      ...planCost.assumptions,
    ];
  }

  return rawPlan;
}

function simulateRouteIncremental(
  primary: Destination,
  isPrimaryHub: boolean,
  candidates: PlannedCandidate[],
  useMinVisits: boolean,
  startMins: number,
  scope: CatchmentScope,
  returnMode: ReturnMode,
  catalogue: Destination[],
  preserveOrder: boolean = false,
) {
  const steps: DayPlanStep[] = [];
  const routeLegs: RouteLeg[] = [];
  const assumptions: PlanAssumption[] = [];
  let currentMins = startMins;

  if (isPrimaryHub) {
    steps.push({
      id: "step-hub-anchor",
      type: "buffer",
      timeBlock: getTimeBlock(currentMins),
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins),
      durationMinutes: 0,
      destination: primary,
      title: {
        en: `Start at ${getLocalizedPlace(primary, "en").name}`,
        ja: `${getLocalizedPlace(primary, "ja").name}集合・出発`,
      },
    });
  }

  let currentLocation: Destination = primary;
  let lunchInserted = false;
  let visitedPoiCount = 0;
  const remaining = [...candidates];
  const categoryCounts = new Map<string, number>();

  while (remaining.length > 0) {
    let nextCand: PlannedCandidate;
    let bestTransitMins = 0;
    let bestTransitResult: TransitEstimateResult | null = null;

    const isFirstHubPoi = isPrimaryHub && visitedPoiCount === 0;

    if (preserveOrder) {
      nextCand = remaining.shift()!;
      const dest = nextCand.destination;
      const transit = estimateLocalTransitMinutes(currentLocation, dest, scope);
      if (!transit.usable && currentLocation.id !== dest.id) {
        return {
          steps: [],
          routeLegs: [],
          assumptions: [],
          totalMins: 0,
          returnEndpoint: null,
          feasible: false,
          failureReason: "unusable_transit_leg" as const,
        };
      }
      bestTransitMins =
        currentLocation.id === dest.id ? 0 : transit.durationMinutes;
      bestTransitResult = transit;
    } else {
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const dest = cand.destination;
        const transit = estimateLocalTransitMinutes(
          currentLocation,
          dest,
          scope,
        );

        if (!transit.usable && currentLocation.id !== dest.id) {
          continue;
        }

        const tMins =
          currentLocation.id === dest.id ? 0 : transit.durationMinutes;
        const cat = dest.categories?.[0] || dest.kind || "attraction";
        const catPenalty = (categoryCounts.get(cat) || 0) * 15;
        const seqScore = cand.recommendationScore - tMins * 0.8 - catPenalty;

        if (seqScore > bestScore) {
          bestScore = seqScore;
          bestIdx = i;
          bestTransitMins = tMins;
          bestTransitResult = transit;
        }
      }

      if (bestIdx === -1) {
        return {
          steps: [],
          routeLegs: [],
          assumptions: [],
          totalMins: 0,
          returnEndpoint: null,
          feasible: false,
          failureReason: "unusable_transit_leg" as const,
        };
      }

      [nextCand] = remaining.splice(bestIdx, 1);
    }

    const dest = nextCand.destination;
    const cat = dest.categories?.[0] || dest.kind || "attraction";
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);

    if (!isFirstHubPoi && currentLocation.id !== dest.id && bestTransitResult) {
      const destLocEn = getLocalizedPlace(dest, "en");
      const destLocJa = getLocalizedPlace(dest, "ja");

      let distKm: number | undefined = undefined;
      if (hasCoordinates(currentLocation) && hasCoordinates(dest)) {
        distKm = getDistance(
          currentLocation.coordinates.lat,
          currentLocation.coordinates.lng,
          dest.coordinates.lat,
          dest.coordinates.lng,
        );
      }

      steps.push({
        id: `travel-${currentLocation.id}-${dest.id}`,
        type: "travel",
        timeBlock: getTimeBlock(currentMins),
        startTime: formatTimeFromMidnight(currentMins),
        endTime: formatTimeFromMidnight(currentMins + bestTransitMins),
        durationMinutes: bestTransitMins,
        title: {
          en: `Transit to ${destLocEn.name}`,
          ja: `${destLocJa.name}へ移動`,
        },
      });
      routeLegs.push({
        fromDestinationId: currentLocation.id,
        toDestinationId: dest.id,
        durationMinutes: bestTransitMins,
        distanceKm: distKm,
        source: bestTransitResult.source,
        confidence: bestTransitResult.confidence,
      });

      if (bestTransitResult.confidence === "estimated") {
        assumptions.push({
          type: "estimated_transit",
          destinationId: dest.id,
          message: {
            en: `Transit to ${destLocEn.name} is estimated.`,
            ja: `${destLocJa.name}への移動時間は推定値です。`,
          },
        });
      }
      currentMins += bestTransitMins;
    }

    currentLocation = dest;
    visitedPoiCount += 1;

    const visitMins = useMinVisits
      ? nextCand.minVisitMins
      : nextCand.preferredVisitMins;
    const projectedEnd = currentMins + visitMins;

    // Lunch Scheduling Contract (Max 30m idle gap)
    if (!lunchInserted && startMins < 13 * 60) {
      if (currentMins >= 11 * 60 + 30 && currentMins <= 13 * 60) {
        steps.push({
          id: "meal-lunch",
          type: "meal",
          timeBlock: getTimeBlock(currentMins),
          startTime: formatTimeFromMidnight(currentMins),
          endTime: formatTimeFromMidnight(currentMins + 60),
          durationMinutes: 60,
          title: {
            en: "Lunch Break — Local Dining",
            ja: "昼食 — 地元の人気グルメ",
          },
        });
        currentMins += 60;
        lunchInserted = true;
      } else if (currentMins < 11 * 60 + 30 && projectedEnd > 12 * 60) {
        const gap = 11 * 60 + 30 - currentMins;
        if (gap > 0 && gap <= 30) {
          steps.push({
            id: "buffer-lunch",
            type: "buffer",
            timeBlock: getTimeBlock(currentMins),
            startTime: formatTimeFromMidnight(currentMins),
            endTime: formatTimeFromMidnight(11 * 60 + 30),
            durationMinutes: gap,
            title: {
              en: "Short Break",
              ja: "小休憩",
            },
          });
          currentMins = 11 * 60 + 30;
          steps.push({
            id: "meal-lunch",
            type: "meal",
            timeBlock: getTimeBlock(currentMins),
            startTime: formatTimeFromMidnight(currentMins),
            endTime: formatTimeFromMidnight(currentMins + 60),
            durationMinutes: 60,
            title: {
              en: "Lunch Break — Local Dining",
              ja: "昼食 — 地元の人気グルメ",
            },
          });
          currentMins += 60;
          lunchInserted = true;
        }
      }
    }

    const locEn = getLocalizedPlace(dest, "en");
    const locJa = getLocalizedPlace(dest, "ja");
    const assessment = getOpeningHoursAssessment(dest);

    steps.push({
      id: `step-${dest.id}`,
      type: "destination",
      timeBlock: getTimeBlock(currentMins),
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + visitMins),
      durationMinutes: visitMins,
      destination: dest,
      title: {
        en: formatPlaceName(locEn, "en"),
        ja: formatPlaceName(locJa, "ja"),
      },
      hasUncertainHours:
        assessment.requiresWarning && assessment.status !== "not_required",
    });
    currentMins += visitMins;
    currentLocation = dest;
  }

  const returnEndpoint = resolveReturnEndpoint(
    currentLocation,
    returnMode,
    primary,
    catalogue,
  );

  if (returnEndpoint && returnEndpoint.id !== currentLocation.id) {
    const retTransit = estimateLocalTransitMinutes(
      currentLocation,
      returnEndpoint,
      scope,
    );

    if (!retTransit.usable && returnMode !== "none") {
      return {
        steps: [],
        routeLegs: [],
        assumptions: [],
        totalMins: 0,
        returnEndpoint: null,
        feasible: false,
        failureReason: "unusable_return_leg" as const,
      };
    }

    if (retTransit.usable && retTransit.durationMinutes > 0) {
      const retEn = getLocalizedPlace(returnEndpoint, "en");
      const retJa = getLocalizedPlace(returnEndpoint, "ja");
      steps.push({
        id: `travel-return-${returnEndpoint.id}`,
        type: "travel",
        timeBlock: getTimeBlock(currentMins),
        startTime: formatTimeFromMidnight(currentMins),
        endTime: formatTimeFromMidnight(
          currentMins + retTransit.durationMinutes,
        ),
        durationMinutes: retTransit.durationMinutes,
        title: {
          en: `Return transit to ${retEn.name}`,
          ja: `${retJa.name}へ帰路移動`,
        },
      });
      routeLegs.push({
        fromDestinationId: currentLocation.id,
        toDestinationId: returnEndpoint.id,
        durationMinutes: retTransit.durationMinutes,
        source: retTransit.source,
        confidence: retTransit.confidence,
      });
      currentMins += retTransit.durationMinutes;
    }
  }

  return {
    steps,
    routeLegs,
    assumptions,
    totalMins: currentMins - startMins,
    returnEndpoint,
    feasible: true,
  };
}

export function rebuildPlanFromEditedStops(
  originalPlan: DayPlan,
  updatedSteps: DayPlanStep[],
  scope: CatchmentScope = "nearby",
  partySize: number = 1,
  preserveOrder: boolean = false,
): DayPlan {
  const destinationSteps = updatedSteps.filter(isRealDestinationStop);
  if (destinationSteps.length === 0) {
    let currentMins = parseTimeToMinutes(updatedSteps[0]?.startTime || "09:00");
    const recalculated = updatedSteps.map((step) => {
      const start = formatTimeFromMidnight(currentMins);
      currentMins += step.durationMinutes;
      const end = formatTimeFromMidnight(currentMins);
      return { ...step, startTime: start, endTime: end };
    });

    return {
      ...originalPlan,
      steps: recalculated,
      routeLegs: [],
      totalDurationMinutes:
        recalculated.length > 0
          ? parseTimeToMinutes(recalculated[recalculated.length - 1].endTime) -
            parseTimeToMinutes(recalculated[0].startTime)
          : 0,
    };
  }

  const primary = destinationSteps[0].destination!;
  const newCandidates: PlannedCandidate[] = destinationSteps.map((step) => {
    const dest = step.destination!;
    const dur = getEffectiveVisitDuration(dest);
    return {
      destination: dest,
      recommendationScore: (dest.ratings?.overall ?? 4.5) * 20,
      routeScore: 80,
      minVisitMins: dur.minMins,
      preferredVisitMins: step.durationMinutes || dur.prefMins,
      maxVisitMins: dur.maxMins,
      durationSource: dur.source,
      required: true,
    };
  });

  const startMins = parseTimeToMinutes(
    originalPlan.steps[0]?.startTime || "09:00",
  );
  const returnMode = originalPlan.returnMode || "anchor";

  const rebuilt = simulateRouteIncremental(
    primary,
    isHubPrimary(primary),
    newCandidates,
    false,
    startMins,
    scope,
    returnMode,
    getCanonicalPlaces(),
    preserveOrder,
  );

  if (!rebuilt.feasible) {
    return {
      ...originalPlan,
      isUnfeasible: true,
    };
  }

  const newPlan: DayPlan = {
    ...originalPlan,
    steps: rebuilt.steps,
    routeLegs: rebuilt.routeLegs,
    assumptions: rebuilt.assumptions,
    totalDurationMinutes: rebuilt.totalMins,
    isUnfeasible: false,
  };

  const planCost = calculateGeneratedPlanCost(newPlan, partySize);
  newPlan.totalBudgetRange = planCost.totalRange;

  return newPlan;
}

export function removeStepFromPlan(
  plan: DayPlan,
  stepId: string,
  scope: CatchmentScope = "nearby",
  partySize: number = 1,
): DayPlan {
  const filtered = plan.steps.filter((s) => s.id !== stepId);
  return rebuildPlanFromEditedStops(plan, filtered, scope, partySize, true);
}

export function reorderPlanSteps(
  plan: DayPlan,
  fromIndex: number,
  toIndex: number,
  scope: CatchmentScope = "nearby",
  partySize: number = 1,
): DayPlan {
  const steps = [...plan.steps];
  const [moved] = steps.splice(fromIndex, 1);
  steps.splice(toIndex, 0, moved);
  return rebuildPlanFromEditedStops(plan, steps, scope, partySize, true);
}
