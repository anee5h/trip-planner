import type { Destination } from "@/shared/types/destination";
import { findNearbyCombinations } from "./DestinationCombinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import type { RecommendationContext } from "./RecommendationContext";

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
  totalDurationMinutes: number;
  totalBudgetRange: [number, number];
  isOverfilled: boolean;
  isUnfeasible?: boolean;
  canFallbackToHalfDay?: boolean;
  unfeasibleErrorMessage?: { en: string; ja: string };
  uncertainHoursDisclosures: Array<{ destinationId: string; name: string }>;
}

export type DayPlanPace = "relaxed" | "balanced" | "packed";
export type DayPlanType = "half_day" | "full_day";
export type CatchmentScope = "nearby" | "wider";

export interface DayPlanOptions {
  planType?: DayPlanType;
  startTime?: string;
  pace?: DayPlanPace;
  partySize?: number;
  maxEndTime?: string;
  catchmentScope?: CatchmentScope;
  context?: Partial<RecommendationContext>;
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

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 9) * 60 + (m || 0);
}

function formatTimeFromMidnight(mins: number): string {
  const normalized = Math.max(0, mins) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
  const startMinsFromMidnight = parseTimeToMinutes(
    options?.startTime || "09:00",
  );

  const maxTargetMins = planType === "half_day" ? 300 : 600;

  let maxEndTimeMins: number | null = null;
  if (options?.maxEndTime) {
    maxEndTimeMins = parseTimeToMinutes(options.maxEndTime);
  }

  const paceMultiplier =
    pace === "relaxed" ? 1.25 : pace === "packed" ? 0.8 : 1.0;

  const maxComboCount = catchmentScope === "wider" ? 6 : 4;
  const combos = findNearbyCombinations(
    primary,
    options?.context,
    maxComboCount,
    catchmentScope,
  );

  const validCombos = combos.filter(
    (c) =>
      c.secondary && c.secondary.role !== "hub" && c.secondary.kind !== "city",
  );

  // Real POI stops selection based on primary role
  let stop1: Destination | null = null;
  let stop2: Destination | null = null;
  let stop3: Destination | null = null;

  if (isPrimaryHub) {
    stop1 = validCombos[0]?.secondary ?? null;
    stop2 = validCombos[1]?.secondary ?? null;
    stop3 =
      planType === "full_day" ? (validCombos[2]?.secondary ?? null) : null;
  } else {
    stop1 = primary;
    stop2 = validCombos[0]?.secondary ?? null;
    stop3 =
      planType === "full_day" ? (validCombos[1]?.secondary ?? null) : null;
  }

  const uncertainDisclosures: Array<{ destinationId: string; name: string }> =
    [];

  function checkHours(dest: Destination) {
    const localized = getLocalizedPlace(dest, "en");
    if (!dest.openingHours && !dest.businessHours && dest.role !== "hub") {
      if (!uncertainDisclosures.some((u) => u.destinationId === dest.id)) {
        uncertainDisclosures.push({
          destinationId: dest.id,
          name: localized.name,
        });
      }
    }
  }

  if (stop1) checkHours(stop1);
  if (stop2) checkHours(stop2);
  if (stop3) checkHours(stop3);

  // Count available real POI stops
  let availableRealStops = 0;
  if (stop1) availableRealStops++;
  if (stop2) availableRealStops++;
  if (stop3) availableRealStops++;

  const minRequiredRealStops = planType === "half_day" ? 2 : 3;

  // Handle Full-day fallback to Half-day when exactly 2 real POI stops exist
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
      uncertainHoursDisclosures: uncertainDisclosures,
    };
  }

  // Fail if fewer than minRequiredRealStops
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
        en: "We couldn’t find enough suitable nearby stops for this schedule. Try a wider area, different interests, or a shorter plan.",
        ja: "このスケジュールに適合する周辺スポットが不足しています。エリア範囲を広げるか、短時間のプランをお試しください。",
      },
      uncertainHoursDisclosures: uncertainDisclosures,
    };
  }

  // Build Final Timeline Steps
  const steps: DayPlanStep[] = [];
  let currentMins = startMinsFromMidnight;
  let minCostPerPerson = 0;
  let maxCostPerPerson = 0;

  const primLocEn = getLocalizedPlace(primary, "en");
  const primLocJa = getLocalizedPlace(primary, "ja");

  // Step 0: Hub Anchor orientation (if primary is a hub/city)
  if (isPrimaryHub) {
    steps.push({
      id: `step-hub-anchor`,
      type: "buffer",
      timeBlock: "morning",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + 30),
      durationMinutes: 30,
      destination: primary,
      title: {
        en: `Start at ${primLocEn.name}`,
        ja: `${primLocJa.name}集合・出発`,
      },
    });
    currentMins += 30;
  }

  // Helper to append a POI stop step
  function appendPoiStep(poi: Destination, block: "morning" | "afternoon") {
    const rawVisit = Math.round(
      ((poi.recommendedVisitHours?.min ?? 1.5) +
        (poi.recommendedVisitHours?.max ?? 2.5)) *
        30,
    );
    const visitMins = Math.min(
      120,
      Math.max(45, Math.round(rawVisit * paceMultiplier)),
    );
    const startStr = formatTimeFromMidnight(currentMins);
    currentMins += visitMins;
    const endStr = formatTimeFromMidnight(currentMins);

    const locEn = getLocalizedPlace(poi, "en");
    const locJa = getLocalizedPlace(poi, "ja");

    steps.push({
      id: `step-${poi.id}`,
      type: "destination",
      timeBlock: block,
      startTime: startStr,
      endTime: endStr,
      durationMinutes: visitMins,
      destination: poi,
      title: {
        en: formatPlaceName(locEn, "en"),
        ja: formatPlaceName(locJa, "ja"),
      },
      description: {
        en: `Explore ${locEn.name} and top highlights.`,
        ja: `${locJa.name}の主要ハイライトを巡る。`,
      },
      hasUncertainHours: !poi.openingHours && !poi.businessHours,
    });

    minCostPerPerson += poi.budgetMin ?? 0;
    maxCostPerPerson += poi.budgetMax ?? 0;
  }

  // Helper to append a transit step
  function appendTransitStep(
    toPoi: Destination,
    block: "morning" | "afternoon",
  ) {
    const travelMins = 15;
    const locEn = getLocalizedPlace(toPoi, "en");
    const locJa = getLocalizedPlace(toPoi, "ja");

    steps.push({
      id: `travel-${toPoi.id}`,
      type: "travel",
      timeBlock: block,
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + travelMins),
      durationMinutes: travelMins,
      title: {
        en: `Transit to ${locEn.name}`,
        ja: `${locJa.name}へ移動`,
      },
    });
    currentMins += travelMins;
  }

  // Render Stop 1
  if (stop1) {
    appendPoiStep(stop1, "morning");
  }

  // Morning Break
  steps.push({
    id: "buffer-morning",
    type: "buffer",
    timeBlock: "morning",
    startTime: formatTimeFromMidnight(currentMins),
    endTime: formatTimeFromMidnight(currentMins + 15),
    durationMinutes: 15,
    title: { en: "15 min short break / walk", ja: "15分 休憩・移動" },
  });
  currentMins += 15;

  // Lunch Break
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
    description: {
      en: "Enjoy regional specialties or local dining.",
      ja: "周辺エリアで名物料理やランチを楽しむ。",
    },
  });
  currentMins += 60;
  minCostPerPerson += 1500;
  maxCostPerPerson += 2500;

  // Render Stop 2
  if (stop2) {
    appendTransitStep(stop2, "afternoon");
    appendPoiStep(stop2, "afternoon");
  }

  // Render Stop 3 for full day
  if (planType === "full_day" && stop3) {
    appendTransitStep(stop3, "afternoon");
    appendPoiStep(stop3, "afternoon");
  }

  // Evening & Dinner
  if (planType === "full_day") {
    if (currentMins < 17 * 60) {
      const eveningBufferMins = 17 * 60 - currentMins;
      steps.push({
        id: "buffer-evening",
        type: "buffer",
        timeBlock: "evening",
        startTime: formatTimeFromMidnight(currentMins),
        endTime: formatTimeFromMidnight(17 * 60),
        durationMinutes: eveningBufferMins,
        title: {
          en: "Free Evening Exploration / Area Stroll",
          ja: "散策・夕方の自由時間",
        },
      });
      currentMins = 17 * 60;
    }

    steps.push({
      id: "meal-dinner",
      type: "meal",
      timeBlock: "evening",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + 60),
      durationMinutes: 60,
      title: { en: "Dinner & Evening Relaxation", ja: "夕食 & 夜のひととき" },
      description: {
        en: "Relax over an evening dinner or local atmosphere.",
        ja: "ディナーや居酒屋の雰囲気を楽しむ。",
      },
    });
    currentMins += 60;

    steps.push({
      id: "buffer-return",
      type: "buffer",
      timeBlock: "evening",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + 30),
      durationMinutes: 30,
      title: {
        en: `Return transit to ${primLocEn.name} / Station`,
        ja: `${primLocJa.name} / 駅への帰路移動`,
      },
    });
    currentMins += 30;

    minCostPerPerson += 3000;
    maxCostPerPerson += 5000;
  }

  const totalDurationMinutes = currentMins - startMinsFromMidnight;

  const exceedsMaxEndTime =
    maxEndTimeMins !== null &&
    startMinsFromMidnight + totalDurationMinutes > maxEndTimeMins;

  if (totalDurationMinutes > maxTargetMins + 30 || exceedsMaxEndTime) {
    return {
      id: `plan-${primary.id}`,
      title: {
        en: isPrimaryHub
          ? `Plan a day from ${primLocEn.name}`
          : `Plan around ${primLocEn.name}`,
        ja: isPrimaryHub
          ? `${primLocJa.name}発モデルコース`
          : `${primLocJa.name} 周辺モデルコース`,
      },
      steps: [],
      totalDurationMinutes: 0,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      isUnfeasible: true,
      canFallbackToHalfDay: false,
      unfeasibleErrorMessage: {
        en: "We couldn’t create a realistic plan within this time window. Try a later end time or a faster pace.",
        ja: "この時間枠内に現実的なプランを作成できませんでした。終了時間を遅くするか、速いペースをお試しください。",
      },
      uncertainHoursDisclosures: uncertainDisclosures,
    };
  }

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
    steps,
    totalDurationMinutes,
    totalBudgetRange: [
      minCostPerPerson * partySize,
      maxCostPerPerson * partySize,
    ],
    isOverfilled: false,
    uncertainHoursDisclosures: uncertainDisclosures,
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
      newMinCost += 2000;
      newMaxCost += 3500;
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
