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

  const planType: DayPlanType = options?.planType || "full_day";
  const pace: DayPlanPace = options?.pace || "balanced";
  const partySize = Math.max(1, options?.partySize || 1);
  const catchmentScope: CatchmentScope = options?.catchmentScope || "nearby";
  const startMinsFromMidnight = parseTimeToMinutes(
    options?.startTime || "09:00",
  );

  // Target max duration in minutes: Half-day = 300 mins (5h), Full-day = 600 mins (10h)
  const maxTargetMins = planType === "half_day" ? 300 : 600;

  let maxEndTimeMins: number | null = null;
  if (options?.maxEndTime) {
    maxEndTimeMins = parseTimeToMinutes(options.maxEndTime);
  }

  // Calculate pace multiplier
  const paceMultiplier =
    pace === "relaxed" ? 1.25 : pace === "packed" ? 0.8 : 1.0;

  // Max search count based on catchment scope
  const maxComboCount = catchmentScope === "wider" ? 5 : 3;
  const combos = findNearbyCombinations(
    primary,
    options?.context,
    maxComboCount,
    catchmentScope,
  );

  // Filter combos to strictly valid real destination stops (excluding cities/hubs)
  const validCombos = combos.filter(
    (c) =>
      c.secondary && c.secondary.role !== "hub" && c.secondary.kind !== "city",
  );

  const secondary = validCombos[0]?.secondary ?? null;
  const tertiary =
    planType === "full_day" ? (validCombos[1]?.secondary ?? null) : null;

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

  if (primary.role !== "hub" && primary.kind !== "city") checkHours(primary);
  if (secondary) checkHours(secondary);
  if (tertiary) checkHours(tertiary);

  // Determine Primary Destination Visit Duration
  let primaryVisitMins = 30; // Default 30 min orientation for hubs
  if (primary.role !== "hub" && primary.kind !== "city") {
    const basePrimaryVisit = Math.round(
      ((primary.recommendedVisitHours?.min ?? 1.5) +
        (primary.recommendedVisitHours?.max ?? 2.5)) *
        30,
    );
    primaryVisitMins = Math.min(
      120,
      Math.max(45, Math.round(basePrimaryVisit * paceMultiplier)),
    );
  }

  // Check real destination count available
  let availableRealStops = 0;
  if (primary.role !== "hub" && primary.kind !== "city") availableRealStops++;
  if (secondary) availableRealStops++;
  if (tertiary) availableRealStops++;

  const minRequiredRealStops = planType === "half_day" ? 2 : 3;

  // Handle Full-day fallback to Half-day when exactly 2 stops exist
  if (planType === "full_day" && availableRealStops === 2) {
    return {
      id: `plan-${primary.id}`,
      title: {
        en: `Suggested Day Outing around ${getLocalizedPlace(primary, "en").name}`,
        ja: `${getLocalizedPlace(primary, "ja").name} 周辺のモデルコース`,
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
        en: `Suggested Day Outing around ${getLocalizedPlace(primary, "en").name}`,
        ja: `${getLocalizedPlace(primary, "ja").name} 周辺のモデルコース`,
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

  // Build Final Steps with Time Feasibility & Return Allowance
  const steps: DayPlanStep[] = [];
  let currentMins = startMinsFromMidnight;
  let minCostPerPerson = primary.budgetMin ?? 0;
  let maxCostPerPerson = primary.budgetMax ?? 0;

  const primLocEn = getLocalizedPlace(primary, "en");
  const primLocJa = getLocalizedPlace(primary, "ja");

  // Step A: Primary Destination / Hub Orientation Anchor
  const startPrimStr = formatTimeFromMidnight(currentMins);
  currentMins += primaryVisitMins;
  const endPrimStr = formatTimeFromMidnight(currentMins);

  if (primary.role !== "hub" && primary.kind !== "city") {
    steps.push({
      id: `step-${primary.id}`,
      type: "destination",
      timeBlock: "morning",
      startTime: startPrimStr,
      endTime: endPrimStr,
      durationMinutes: primaryVisitMins,
      destination: primary,
      title: {
        en: formatPlaceName(primLocEn, "en"),
        ja: formatPlaceName(primLocJa, "ja"),
      },
      description: {
        en: `Explore ${primLocEn.name} and top highlights.`,
        ja: `${primLocJa.name}の主要ハイライトを巡る。`,
      },
      hasUncertainHours: !primary.openingHours && !primary.businessHours,
    });
  } else {
    // Hub Anchor orientation node (30 min)
    steps.push({
      id: `step-hub-anchor`,
      type: "buffer",
      timeBlock: "morning",
      startTime: startPrimStr,
      endTime: endPrimStr,
      durationMinutes: 30,
      destination: primary,
      title: {
        en: `Start at ${primLocEn.name}`,
        ja: `${primLocJa.name}集合・出発`,
      },
    });
  }

  // Transit / short break after primary stop
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

  // Secondary Destination
  if (secondary) {
    const secDistKm = validCombos[0]?.interDistanceKm ?? 1.5;
    const travelMins = Math.min(
      45,
      Math.max(
        15,
        Math.round((validCombos[0]?.estimatedInterTravelMinutes ?? 20) / 5) * 5,
      ),
    );

    steps.push({
      id: `travel-${secondary.id}`,
      type: "travel",
      timeBlock: "afternoon",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + travelMins),
      durationMinutes: travelMins,
      title: {
        en: `Transit to ${secondary.name} (${secDistKm} km)`,
        ja: `${secondary.name}へ移動 (${secDistKm}km)`,
      },
    });
    currentMins += travelMins;

    const secVisitMins = Math.min(
      120,
      Math.max(
        45,
        Math.round(
          ((secondary.recommendedVisitHours?.min ?? 1) +
            (secondary.recommendedVisitHours?.max ?? 2)) *
            30 *
            paceMultiplier,
        ),
      ),
    );
    const startSecStr = formatTimeFromMidnight(currentMins);
    currentMins += secVisitMins;
    const endSecStr = formatTimeFromMidnight(currentMins);

    const secLocEn = getLocalizedPlace(secondary, "en");
    const secLocJa = getLocalizedPlace(secondary, "ja");

    steps.push({
      id: `step-${secondary.id}`,
      type: "destination",
      timeBlock: "afternoon",
      startTime: startSecStr,
      endTime: endSecStr,
      durationMinutes: secVisitMins,
      destination: secondary,
      title: {
        en: formatPlaceName(secLocEn, "en"),
        ja: formatPlaceName(secLocJa, "ja"),
      },
      description: {
        en: `Visit ${secLocEn.name} nearby.`,
        ja: `近隣の${secLocJa.name}をあわせて散策。`,
      },
      hasUncertainHours: !secondary.openingHours && !secondary.businessHours,
    });

    minCostPerPerson += secondary.budgetMin ?? 0;
    maxCostPerPerson += secondary.budgetMax ?? 0;
  }

  // Tertiary Destination for full day
  if (planType === "full_day" && tertiary) {
    const tertDistKm = validCombos[1]?.interDistanceKm ?? 2.0;
    const travelMins = 15;

    steps.push({
      id: `travel-${tertiary.id}`,
      type: "travel",
      timeBlock: "afternoon",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + travelMins),
      durationMinutes: travelMins,
      title: {
        en: `Transit to ${tertiary.name} (${tertDistKm} km)`,
        ja: `${tertiary.name}へ移動 (${tertDistKm}km)`,
      },
    });
    currentMins += travelMins;

    const tertLocEn = getLocalizedPlace(tertiary, "en");
    const tertLocJa = getLocalizedPlace(tertiary, "ja");
    const tertVisitMins = 60;

    steps.push({
      id: `step-${tertiary.id}`,
      type: "destination",
      timeBlock: "afternoon",
      startTime: formatTimeFromMidnight(currentMins),
      endTime: formatTimeFromMidnight(currentMins + tertVisitMins),
      durationMinutes: tertVisitMins,
      destination: tertiary,
      title: {
        en: formatPlaceName(tertLocEn, "en"),
        ja: formatPlaceName(tertLocJa, "ja"),
      },
      description: {
        en: `Explore ${tertLocEn.name} in the late afternoon.`,
        ja: `夕方にかけて${tertLocJa.name}を散策。`,
      },
      hasUncertainHours: !tertiary.openingHours && !tertiary.businessHours,
    });
    currentMins += tertVisitMins;
    minCostPerPerson += tertiary.budgetMin ?? 0;
    maxCostPerPerson += tertiary.budgetMax ?? 0;
  }

  // Evening & Dinner (with return transit allowance and buffer)
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

    // Return to anchor allowance
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

  // Hard maximum ceiling check (10 hours = 600 mins for full day, 5 hours = 300 mins for half day)
  if (totalDurationMinutes > maxTargetMins + 30 || exceedsMaxEndTime) {
    return {
      id: `plan-${primary.id}`,
      title: {
        en: `Suggested Day Outing around ${primLocEn.name}`,
        ja: `${primLocJa.name} 周辺のモデルコース`,
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
      en:
        primary.role === "hub" || primary.kind === "city"
          ? `Plan a day from ${primLocEn.name}`
          : `Plan around ${primLocEn.name}`,
      ja:
        primary.role === "hub" || primary.kind === "city"
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
