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
  unfeasibleErrorMessage?: { en: string; ja: string };
  uncertainHoursDisclosures: Array<{ destinationId: string; name: string }>;
}

export type DayPlanPace = "relaxed" | "balanced" | "packed";
export type DayPlanType = "half_day" | "full_day";

export interface DayPlanOptions {
  planType?: DayPlanType;
  startTime?: string;
  pace?: DayPlanPace;
  partySize?: number;
  maxEndTime?: string;
  context?: Partial<RecommendationContext>;
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

  const combos = findNearbyCombinations(primary, options?.context, 3);
  const secondary = combos[0]?.secondary ?? null;
  const tertiary =
    planType === "full_day" ? (combos[1]?.secondary ?? null) : null;

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

  checkHours(primary);
  if (secondary) checkHours(secondary);
  if (tertiary) checkHours(tertiary);

  // Step 1: Primary Destination Visit Duration
  const basePrimaryVisit = Math.round(
    ((primary.recommendedVisitHours?.min ?? 1.5) +
      (primary.recommendedVisitHours?.max ?? 2.5)) *
      30,
  );
  let primaryVisitMins = Math.max(
    45,
    Math.round(basePrimaryVisit * paceMultiplier),
  );

  // Determine which optional stops fit within target duration
  let includeTertiary = Boolean(tertiary) && planType === "full_day";
  let includeSecondary = Boolean(secondary);
  let includeDinner = planType === "full_day";

  // Simulate total minutes calculation with deterministic pruning
  function calculateTotalPlanMinutes(
    incSec: boolean,
    incTert: boolean,
    incDin: boolean,
    primMins: number,
  ): number {
    let mins = primMins + 15 + 60; // primary + buffer + lunch
    if (incSec && secondary) {
      const travelMins = Math.max(
        15,
        Math.round((combos[0]?.estimatedInterTravelMinutes ?? 20) / 5) * 5,
      );
      const secVisitMins = Math.max(
        30,
        Math.round(
          ((secondary.recommendedVisitHours?.min ?? 1) +
            (secondary.recommendedVisitHours?.max ?? 2)) *
            30 *
            paceMultiplier,
        ),
      );
      mins += travelMins + secVisitMins;
    }
    if (incTert && tertiary) {
      mins += 15 + 45; // travel + tertiary visit
    }
    if (incDin) {
      mins += 60; // dinner
    }
    return mins;
  }

  // Prune Tertiary if exceeding target or maxEndTime
  if (includeTertiary) {
    const estimatedMins = calculateTotalPlanMinutes(
      includeSecondary,
      true,
      includeDinner,
      primaryVisitMins,
    );
    const exceedsWindow =
      maxEndTimeMins !== null &&
      startMinsFromMidnight + estimatedMins > maxEndTimeMins;
    if (estimatedMins > maxTargetMins || exceedsWindow) {
      includeTertiary = false;
    }
  }

  // Prune Secondary if still exceeding target or maxEndTime
  if (includeSecondary) {
    const estimatedMins = calculateTotalPlanMinutes(
      true,
      includeTertiary,
      includeDinner,
      primaryVisitMins,
    );
    const exceedsWindow =
      maxEndTimeMins !== null &&
      startMinsFromMidnight + estimatedMins > maxEndTimeMins;
    if (estimatedMins > maxTargetMins || exceedsWindow) {
      includeSecondary = false;
    }
  }

  // Reduce Primary Visit duration to minimum if needed
  let estimatedMins = calculateTotalPlanMinutes(
    includeSecondary,
    includeTertiary,
    includeDinner,
    primaryVisitMins,
  );
  let exceedsWindow =
    maxEndTimeMins !== null &&
    startMinsFromMidnight + estimatedMins > maxEndTimeMins;
  if (
    (estimatedMins > maxTargetMins || exceedsWindow) &&
    primaryVisitMins > 60
  ) {
    primaryVisitMins = 60;
    estimatedMins = calculateTotalPlanMinutes(
      includeSecondary,
      includeTertiary,
      includeDinner,
      primaryVisitMins,
    );
    exceedsWindow =
      maxEndTimeMins !== null &&
      startMinsFromMidnight + estimatedMins > maxEndTimeMins;
  }

  // Check if even minimal plan fails window
  if (estimatedMins > maxTargetMins + 30 || exceedsWindow) {
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
      unfeasibleErrorMessage: {
        en: "We couldn’t create a realistic plan within this time window. Try a later end time or a faster pace.",
        ja: "この時間枠内に現実的なプランを作成できませんでした。終了時間を遅くするか、速いペースをお試しください。",
      },
      uncertainHoursDisclosures: uncertainDisclosures,
    };
  }

  // Build Final Steps
  const steps: DayPlanStep[] = [];
  let currentMins = startMinsFromMidnight;
  let minCostPerPerson = primary.budgetMin ?? 0;
  let maxCostPerPerson = primary.budgetMax ?? 0;

  const primLocEn = getLocalizedPlace(primary, "en");
  const primLocJa = getLocalizedPlace(primary, "ja");

  // Step A: Primary Destination
  const startPrimStr = formatTimeFromMidnight(currentMins);
  currentMins += primaryVisitMins;
  const endPrimStr = formatTimeFromMidnight(currentMins);

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
    hasUncertainHours:
      !primary.openingHours && !primary.businessHours && primary.role !== "hub",
  });

  // Transit/buffer
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

  // Secondary Destination if included
  if (includeSecondary && secondary) {
    const secDistKm = combos[0]?.interDistanceKm ?? 1.5;
    const travelMins = Math.max(
      15,
      Math.round((combos[0]?.estimatedInterTravelMinutes ?? 20) / 5) * 5,
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

    const secVisitMins = Math.max(
      30,
      Math.round(
        ((secondary.recommendedVisitHours?.min ?? 1) +
          (secondary.recommendedVisitHours?.max ?? 2)) *
          30 *
          paceMultiplier,
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
      hasUncertainHours:
        !secondary.openingHours &&
        !secondary.businessHours &&
        secondary.role !== "hub",
    });

    minCostPerPerson += secondary.budgetMin ?? 0;
    maxCostPerPerson += secondary.budgetMax ?? 0;
  }

  // Tertiary Destination if included
  if (includeTertiary && tertiary) {
    const tertDistKm = combos[1]?.interDistanceKm ?? 2.0;
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
    const tertVisitMins = 45;

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
      hasUncertainHours:
        !tertiary.openingHours &&
        !tertiary.businessHours &&
        tertiary.role !== "hub",
    });
    currentMins += tertVisitMins;
    minCostPerPerson += tertiary.budgetMin ?? 0;
    maxCostPerPerson += tertiary.budgetMax ?? 0;
  }

  // Dinner & Evening if included (placed in Evening block)
  if (includeDinner) {
    // If current time is earlier than 17:00, add evening transition buffer
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
    minCostPerPerson += 3000;
    maxCostPerPerson += 5000;
  }

  const totalDurationMinutes = currentMins - startMinsFromMidnight;

  return {
    id: `plan-${primary.id}`,
    title: {
      en: `Suggested Day Outing around ${primLocEn.name}`,
      ja: `${primLocJa.name} 周辺のモデルコース`,
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
