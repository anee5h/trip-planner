import type { Destination } from "@/shared/types/destination";
import { findNearbyCombinations } from "./DestinationCombinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
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
import {
  getOpeningHoursAssessment,
  hasVerifiedOpeningHours,
} from "./OpeningHoursPolicy";
import { getDistance } from "@/shared/utils/distance";

export type ReturnMode = "anchor" | "nearest_station" | "none";
export type DayPlanPace = "relaxed" | "balanced" | "packed";
export type DayPlanType = "half_day" | "full_day";
export type CatchmentScope = "nearby" | "wider";

export interface RouteLeg {
  fromDestinationId?: string;
  toDestinationId?: string;
  durationMinutes: number;
  source: TransitEstimateResult["source"];
  confidence: TransitEstimateResult["confidence"];
}

export interface PlanAssumption {
  type:
    | "unverified_hours"
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
  uncertainHoursDisclosures: Array<{ destinationId: string; name: string }>;
}

export interface DayPlanOptions {
  planType?: DayPlanType;
  startTime?: string;
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

function formatTimeFromMidnight(mins: number): string {
  const normalized = Math.max(0, mins) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function resolveReturnEndpoint(
  finalStop: Destination,
  mode: ReturnMode,
  anchor: Destination,
  catalogue: Destination[] = [],
): Destination | null {
  if (mode === "anchor") return anchor;
  if (mode === "none") return null;

  // 1. Explicit station relationship
  const rels = finalStop.relationships as Record<string, unknown> | undefined;
  const nearestStationId = rels?.nearestStationId as string | undefined;
  if (nearestStationId) {
    const st = catalogue.find((d) => d.id === nearestStationId);
    if (st) return st;
  }
  // 2. Parent transit hub
  if (finalStop.relationships?.parentDestinationId) {
    const parent = catalogue.find(
      (d) => d.id === finalStop.relationships?.parentDestinationId,
    );
    if (parent && (parent.role === "hub" || parent.kind === "city")) {
      return parent;
    }
  }
  // 3. Nearest catalogue station within 5 km
  if (hasCoordinates(finalStop)) {
    const nearbyStations = catalogue.filter(
      (d) => d.kind === "station" && hasCoordinates(d),
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

  // 4. Fallback: end at final POI
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

  const isPrimaryHub = primary.role === "hub" || primary.kind === "city";
  const planType: DayPlanType = options?.planType || "full_day";
  const pace: DayPlanPace = options?.pace || "balanced";
  const partySize = Math.max(1, options?.partySize || 1);
  const catchmentScope: CatchmentScope = options?.catchmentScope || "nearby";
  const returnMode: ReturnMode = options?.returnMode || "anchor";
  const catalogue = options?.catalogue || [];

  const startMinsFromMidnight = parseTimeToMinutes(
    options?.startTime || "09:00",
  );

  const planCeiling = planType === "half_day" ? 5 * 60 : 10 * 60;
  let maxEndTimeMins: number | null = null;
  if (options?.maxEndTime) {
    maxEndTimeMins = parseTimeToMinutes(options.maxEndTime);
  }
  const requestedWindow =
    maxEndTimeMins !== null
      ? maxEndTimeMins - startMinsFromMidnight
      : planCeiling;
  const hardAvailableMinutes = Math.min(planCeiling, requestedWindow);

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
    const transitMins = transitEst.durationMinutes;
    const ratingVal = dest.ratings?.overall ?? 4.5;
    const baseScore = ratingVal * 20;
    const routeScore = baseScore - transitMins * 0.8;

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

  plannedCandidates.sort((a, b) => {
    if (b.routeScore !== a.routeScore) return b.routeScore - a.routeScore;
    if (a.recommendationScore !== b.recommendationScore)
      return b.recommendationScore - a.recommendationScore;
    return a.destination.id.localeCompare(b.destination.id);
  });

  const maxPoiCount = planType === "full_day" ? 3 : 2;
  const selectedCandidates: PlannedCandidate[] = [];

  const requiredCandidate = plannedCandidates.find((c) => c.required);
  if (requiredCandidate) {
    selectedCandidates.push(requiredCandidate);
  }

  for (const cand of plannedCandidates) {
    if (selectedCandidates.length >= maxPoiCount) break;
    if (
      !selectedCandidates.some((c) => c.destination.id === cand.destination.id)
    ) {
      selectedCandidates.push(cand);
    }
  }

  const minRequiredRealStops = planType === "half_day" ? 2 : 3;
  const availableRealStops = selectedCandidates.length;

  const uncertainHoursDisclosures: Array<{
    destinationId: string;
    name: string;
  }> = [];
  const assumptions: PlanAssumption[] = [];

  selectedCandidates.forEach((c) => {
    const assessment = getOpeningHoursAssessment(c.destination);
    if (assessment.requiresWarning || assessment.status === "unverified") {
      const loc = getLocalizedPlace(c.destination, "en");
      uncertainHoursDisclosures.push({
        destinationId: c.destination.id,
        name: loc.name,
      });
      assumptions.push({
        type: "unverified_hours",
        destinationId: c.destination.id,
        message: {
          en: `Opening hours for ${loc.name} are unverified.`,
          ja: `${loc.name}の営業時間は未確認です。`,
        },
      });
    }
  });

  if (planType === "full_day" && availableRealStops === 2) {
    return {
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
      totalDurationMinutes: 0,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      isUnfeasible: true,
      canFallbackToHalfDay: true,
      unfeasibleErrorMessage: {
        en: "We couldn’t build a realistic full-day plan, but a half-day plan is available.",
        ja: "1日コースには十分な立ち寄り先が見つかりませんでしたが、半日プラン（2スポット）が利用可能です。",
      },
      uncertainHoursDisclosures,
    };
  }

  if (availableRealStops < minRequiredRealStops) {
    return {
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
      totalDurationMinutes: 0,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      isUnfeasible: true,
      canFallbackToHalfDay: false,
      unfeasibleErrorMessage: {
        en: "We couldn’t find enough suitable nearby stops for this schedule. Try a wider area or a shorter plan.",
        ja: "このスケジュールに適合する周辺スポットが不足しています。エリア範囲を広げるか、短時間のプランをお試しください。",
      },
      uncertainHoursDisclosures,
    };
  }

  const activeCandidates = [...selectedCandidates];
  let useMinimumVisitTimes = false;

  let builtRoute: {
    steps: DayPlanStep[];
    routeLegs: RouteLeg[];
    totalMins: number;
    returnEndpoint: Destination | null;
  } | null = null;

  while (activeCandidates.length >= minRequiredRealStops) {
    builtRoute = simulateRoute(
      primary,
      isPrimaryHub,
      activeCandidates,
      useMinimumVisitTimes,
      startMinsFromMidnight,
      catchmentScope,
      returnMode,
      catalogue,
      assumptions,
    );

    if (builtRoute.totalMins <= hardAvailableMinutes) {
      break;
    }

    if (!useMinimumVisitTimes) {
      useMinimumVisitTimes = true;
      continue;
    }

    const prunableIndex = activeCandidates.findIndex((c) => !c.required);
    if (prunableIndex !== -1) {
      activeCandidates.splice(prunableIndex, 1);
      useMinimumVisitTimes = false;
    } else {
      break;
    }
  }

  if (!builtRoute || builtRoute.totalMins > hardAvailableMinutes) {
    return {
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
      totalDurationMinutes: 0,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      isUnfeasible: true,
      canFallbackToHalfDay:
        planType === "full_day" && activeCandidates.length >= 2,
      unfeasibleErrorMessage: {
        en: "We couldn’t create a realistic plan within this time window.",
        ja: "この時間枠内に現実的なプランを作成できませんでした。",
      },
      uncertainHoursDisclosures,
    };
  }

  let minCost = 0;
  let maxCost = 0;
  builtRoute.steps.forEach((s) => {
    if (s.destination) {
      minCost += s.destination.budgetMin ?? 0;
      maxCost += s.destination.budgetMax ?? 0;
    } else if (s.type === "meal") {
      minCost += 1200;
      maxCost += 2500;
    }
  });

  const primLocEn = getLocalizedPlace(primary, "en");
  const primLocJa = getLocalizedPlace(primary, "ja");

  return {
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
    assumptions,
    returnMode,
    returnEndpointId: builtRoute.returnEndpoint?.id,
    totalDurationMinutes: builtRoute.totalMins,
    totalBudgetRange: [minCost * partySize, maxCost * partySize],
    isOverfilled: false,
    uncertainHoursDisclosures,
  };
}

function simulateRoute(
  primary: Destination,
  isPrimaryHub: boolean,
  candidates: PlannedCandidate[],
  useMinVisits: boolean,
  startMins: number,
  scope: CatchmentScope,
  returnMode: ReturnMode,
  catalogue: Destination[],
  assumptions: PlanAssumption[],
) {
  const steps: DayPlanStep[] = [];
  const routeLegs: RouteLeg[] = [];
  let currentMins = startMins;

  if (isPrimaryHub) {
    steps.push({
      id: "step-hub-anchor",
      type: "buffer",
      timeBlock: "morning",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + 30),
      durationMinutes: 30,
      destination: primary,
      title: {
        en: `Start at ${getLocalizedPlace(primary, "en").name}`,
        ja: `${getLocalizedPlace(primary, "ja").name}集合・出発`,
      },
    });
    currentMins += 30;
  }

  let prevLocation: Destination = primary;
  let lunchInserted = false;

  candidates.forEach((cand) => {
    const dest = cand.destination;
    if (prevLocation.id !== dest.id) {
      const transit = estimateLocalTransitMinutes(prevLocation, dest, scope);
      if (transit.durationMinutes > 0) {
        const destLocEn = getLocalizedPlace(dest, "en");
        const destLocJa = getLocalizedPlace(dest, "ja");
        steps.push({
          id: `travel-${prevLocation.id}-${dest.id}`,
          type: "travel",
          timeBlock: currentMins < 12 * 60 ? "morning" : "afternoon",
          startTime: formatTimeFromMidnight(currentMins),
          endTime: formatTimeFromMidnight(
            currentMins + transit.durationMinutes,
          ),
          durationMinutes: transit.durationMinutes,
          title: {
            en: `Transit to ${destLocEn.name}`,
            ja: `${destLocJa.name}へ移動`,
          },
        });
        routeLegs.push({
          fromDestinationId: prevLocation.id,
          toDestinationId: dest.id,
          durationMinutes: transit.durationMinutes,
          source: transit.source,
          confidence: transit.confidence,
        });
        if (transit.confidence === "estimated") {
          assumptions.push({
            type: "estimated_transit",
            destinationId: dest.id,
            message: {
              en: `Transit to ${destLocEn.name} is estimated.`,
              ja: `${destLocJa.name}への移動時間は推定値です。`,
            },
          });
        }
        currentMins += transit.durationMinutes;
      }
    }

    if (
      !lunchInserted &&
      currentMins >= 11 * 60 + 30 &&
      currentMins <= 13 * 60
    ) {
      steps.push({
        id: "meal-lunch",
        type: "meal",
        timeBlock: "afternoon",
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

    const visitMins = useMinVisits
      ? cand.minVisitMins
      : cand.preferredVisitMins;
    const locEn = getLocalizedPlace(dest, "en");
    const locJa = getLocalizedPlace(dest, "ja");

    steps.push({
      id: `step-${dest.id}`,
      type: "destination",
      timeBlock:
        currentMins < 12 * 60
          ? "morning"
          : currentMins < 17 * 60
            ? "afternoon"
            : "evening",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + visitMins),
      durationMinutes: visitMins,
      destination: dest,
      title: {
        en: formatPlaceName(locEn, "en"),
        ja: formatPlaceName(locJa, "ja"),
      },
      hasUncertainHours: !hasVerifiedOpeningHours(dest),
    });
    currentMins += visitMins;
    prevLocation = dest;
  });

  const returnEndpoint = resolveReturnEndpoint(
    prevLocation,
    returnMode,
    primary,
    catalogue,
  );
  if (returnEndpoint && returnEndpoint.id !== prevLocation.id) {
    const retTransit = estimateLocalTransitMinutes(
      prevLocation,
      returnEndpoint,
      scope,
    );
    if (retTransit.durationMinutes > 0) {
      const retEn = getLocalizedPlace(returnEndpoint, "en");
      const retJa = getLocalizedPlace(returnEndpoint, "ja");
      steps.push({
        id: `travel-return-${returnEndpoint.id}`,
        type: "travel",
        timeBlock: "evening",
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
        fromDestinationId: prevLocation.id,
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
    totalMins: currentMins - startMins,
    returnEndpoint,
  };
}

export function removeStepFromPlan(plan: DayPlan, stepId: string): DayPlan {
  const newSteps = plan.steps.filter((s) => s.id !== stepId);

  let currentMins =
    plan.steps.length > 0
      ? parseTimeToMinutes(plan.steps[0].startTime)
      : 9 * 60;
  let newMinCost = 0;
  let newMaxCost = 0;

  const updatedSteps = newSteps.map((step) => {
    const start = formatTimeFromMidnight(currentMins);
    currentMins += step.durationMinutes;
    const end = formatTimeFromMidnight(currentMins);

    if (step.destination) {
      newMinCost += step.destination.budgetMin ?? 0;
      newMaxCost += step.destination.budgetMax ?? 0;
    } else if (step.type === "meal") {
      newMinCost += 1200;
      newMaxCost += 2500;
    }

    return {
      ...step,
      startTime: start,
      endTime: end,
    };
  });

  return {
    ...plan,
    steps: updatedSteps,
    totalDurationMinutes:
      updatedSteps.length > 0
        ? parseTimeToMinutes(updatedSteps[updatedSteps.length - 1].endTime) -
          parseTimeToMinutes(updatedSteps[0].startTime)
        : 0,
    totalBudgetRange: [newMinCost, newMaxCost],
  };
}

export function reorderPlanSteps(
  plan: DayPlan,
  fromIndex: number,
  toIndex: number,
): DayPlan {
  const steps = [...plan.steps];
  const [moved] = steps.splice(fromIndex, 1);
  steps.splice(toIndex, 0, moved);

  let currentMins =
    steps.length > 0 ? parseTimeToMinutes(steps[0].startTime) : 9 * 60;

  const updatedSteps = steps.map((step) => {
    const start = formatTimeFromMidnight(currentMins);
    currentMins += step.durationMinutes;
    const end = formatTimeFromMidnight(currentMins);

    return {
      ...step,
      startTime: start,
      endTime: end,
    };
  });

  return {
    ...plan,
    steps: updatedSteps,
  };
}
