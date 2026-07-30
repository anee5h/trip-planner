import type { Destination } from "@/shared/types/destination";
import { findNearbyCombinations } from "./DestinationCombinationService";
import type { RecommendationContext } from "./RecommendationContext";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";

export interface DayPlanStep {
  id: string;
  type: "destination" | "travel" | "meal" | "buffer";
  timeBlock: "morning" | "afternoon" | "evening";
  startTime: string; // e.g. "09:30"
  endTime: string; // e.g. "11:30"
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
  overfillWarning?: { en: string; ja: string };
  uncertainHoursDisclosures: Array<{ destinationId: string; name: string }>;
}

/**
  Formats a minute offset from 09:00 into "HH:MM" string.
 */
function formatTime(minutesFromNineAM: number): string {
  const totalMinutes = 9 * 60 + minutesFromNineAM;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const hStr = hours.toString().padStart(2, "0");
  const mStr = mins.toString().padStart(2, "0");
  return `${hStr}:${mStr}`;
}

export function generateDayPlan(
  primary: Destination,
  context?: Partial<RecommendationContext>,
): DayPlan {
  if (!primary) {
    return {
      id: "empty-plan",
      title: { en: "Empty Day Plan", ja: "空のモデルコース" },
      steps: [],
      totalDurationMinutes: 0,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    };
  }

  const combos = findNearbyCombinations(primary, context, 2);
  const secondary = combos[0]?.secondary ?? null;
  const tertiary = combos[1]?.secondary ?? null;

  const steps: DayPlanStep[] = [];
  let currentTimeMins = 0;
  let totalMinCost = primary.budgetMin ?? 0;
  let totalMaxCost = primary.budgetMax ?? 0;

  const uncertainDisclosures: Array<{ destinationId: string; name: string }> =
    [];

  function checkHours(dest: Destination) {
    const localized = getLocalizedPlace(dest, "en");
    if (!dest.openingHours && !dest.businessHours) {
      uncertainDisclosures.push({
        destinationId: dest.id,
        name: localized.name,
      });
    }
  }

  checkHours(primary);
  if (secondary) checkHours(secondary);
  if (tertiary) checkHours(tertiary);

  // 1. MORNING (09:00 - 12:00)
  // Step A: Primary Destination
  const primaryVisitMins = Math.round(
    ((primary.recommendedVisitHours?.min ?? 2) +
      (primary.recommendedVisitHours?.max ?? 3)) *
      30,
  );

  const startPrimaryTime = formatTime(currentTimeMins);
  currentTimeMins += primaryVisitMins;
  const endPrimaryTime = formatTime(currentTimeMins);

  const primLocEn = getLocalizedPlace(primary, "en");
  const primLocJa = getLocalizedPlace(primary, "ja");

  steps.push({
    id: `step-${primary.id}`,
    type: "destination",
    timeBlock: "morning",
    startTime: startPrimaryTime,
    endTime: endPrimaryTime,
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

  // Transit/buffer to lunch
  steps.push({
    id: "buffer-morning",
    type: "buffer",
    timeBlock: "morning",
    startTime: formatTime(currentTimeMins),
    endTime: formatTime(currentTimeMins + 15),
    durationMinutes: 15,
    title: { en: "15 min short break / walk", ja: "15分 休憩・移動" },
  });
  currentTimeMins += 15;

  // 2. LUNCH BREAK (12:00 - 13:00)
  steps.push({
    id: "meal-lunch",
    type: "meal",
    timeBlock: "afternoon",
    startTime: formatTime(currentTimeMins),
    endTime: formatTime(currentTimeMins + 60),
    durationMinutes: 60,
    title: {
      en: "Lunch Break — Local Dining",
      ja: "昼食 — 地元の人気グルメ",
    },
    description: {
      en: "Enjoy regional specialties or ramen in the surrounding district.",
      ja: "周辺エリアで名物料理やランチを楽しむ。",
    },
  });
  currentTimeMins += 60;
  totalMinCost += 1500;
  totalMaxCost += 2500;

  // 3. AFTERNOON (13:00 - 17:00)
  if (secondary) {
    const secDistKm = combos[0]?.interDistanceKm ?? 1.5;
    const travelMins = Math.max(
      15,
      Math.round((combos[0]?.estimatedInterTravelMinutes ?? 20) / 5) * 5,
    );

    steps.push({
      id: `travel-${secondary.id}`,
      type: "travel",
      timeBlock: "afternoon",
      startTime: formatTime(currentTimeMins),
      endTime: formatTime(currentTimeMins + travelMins),
      durationMinutes: travelMins,
      title: {
        en: `Transit to ${secondary.name} (${secDistKm} km)`,
        ja: `${secondary.name}へ移動 (${secDistKm}km)`,
      },
    });
    currentTimeMins += travelMins;

    const secVisitMins = Math.round(
      ((secondary.recommendedVisitHours?.min ?? 1.5) +
        (secondary.recommendedVisitHours?.max ?? 2.5)) *
        30,
    );
    const startSecTime = formatTime(currentTimeMins);
    currentTimeMins += secVisitMins;
    const endSecTime = formatTime(currentTimeMins);

    const secLocEn = getLocalizedPlace(secondary, "en");
    const secLocJa = getLocalizedPlace(secondary, "ja");

    steps.push({
      id: `step-${secondary.id}`,
      type: "destination",
      timeBlock: "afternoon",
      startTime: startSecTime,
      endTime: endSecTime,
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

    totalMinCost += secondary.budgetMin ?? 0;
    totalMaxCost += secondary.budgetMax ?? 0;
  }

  // 4. EVENING (17:00 - 20:30)
  steps.push({
    id: "meal-dinner",
    type: "meal",
    timeBlock: "evening",
    startTime: formatTime(currentTimeMins),
    endTime: formatTime(currentTimeMins + 75),
    durationMinutes: 75,
    title: { en: "Dinner & Evening Relaxation", ja: "夕食 & 夜のひととき" },
    description: {
      en: "Relax over a evening dinner or izakaya atmosphere.",
      ja: "ディナーや居酒屋の雰囲気を楽しむ。",
    },
  });
  currentTimeMins += 75;
  totalMinCost += 3000;
  totalMaxCost += 5000;

  if (tertiary) {
    const tertLocEn = getLocalizedPlace(tertiary, "en");
    const tertLocJa = getLocalizedPlace(tertiary, "ja");
    const tertVisitMins = 60;

    steps.push({
      id: `step-${tertiary.id}`,
      type: "destination",
      timeBlock: "evening",
      startTime: formatTime(currentTimeMins),
      endTime: formatTime(currentTimeMins + tertVisitMins),
      durationMinutes: tertVisitMins,
      destination: tertiary,
      title: {
        en: formatPlaceName(tertLocEn, "en"),
        ja: formatPlaceName(tertLocJa, "ja"),
      },
      description: {
        en: `Night stroll or illumination view at ${tertLocEn.name}.`,
        ja: `${tertLocJa.name}で夜景や夜の散策。`,
      },
      hasUncertainHours: !tertiary.openingHours && !tertiary.businessHours,
    });
    currentTimeMins += tertVisitMins;
    totalMinCost += tertiary.budgetMin ?? 0;
    totalMaxCost += tertiary.budgetMax ?? 0;
  }

  // Check overfill limits (> 10 hours or > availableTimeHours)
  const totalHours = currentTimeMins / 60;
  const maxAllowedHours = context?.availableTimeHours ?? 10;
  const isOverfilled = totalHours > maxAllowedHours;

  let overfillWarning: { en: string; ja: string } | undefined;
  if (isOverfilled) {
    const formattedTotal = Math.round(totalHours * 10) / 10;
    overfillWarning = {
      en: `Tight schedule: total plan (${formattedTotal}h) exceeds the ${maxAllowedHours}h limit. Consider removing a step.`,
      ja: `スケジュールが過密です: 合計 (${formattedTotal}時間) が制限 ${maxAllowedHours}時間を超えています。ステップの削減をご検討ください。`,
    };
  }

  const primaryLocEn = getLocalizedPlace(primary, "en");
  const primaryLocJa = getLocalizedPlace(primary, "ja");

  return {
    id: `plan-${primary.id}`,
    title: {
      en: `Suggested Day Outing around ${primaryLocEn.name}`,
      ja: `${primaryLocJa.name} 周辺のおすすめ1日モデルコース`,
    },
    steps,
    totalDurationMinutes: currentTimeMins,
    totalBudgetRange: [totalMinCost, totalMaxCost],
    isOverfilled,
    overfillWarning,
    uncertainHoursDisclosures: uncertainDisclosures,
  };
}

export function removeStepFromPlan(plan: DayPlan, stepId: string): DayPlan {
  const newSteps = plan.steps.filter((s) => s.id !== stepId);

  // Recalculate duration & start times
  let currentTime = 0;
  let newMinCost = 0;
  let newMaxCost = 0;

  const updatedSteps = newSteps.map((step) => {
    const start = formatTime(currentTime);
    currentTime += step.durationMinutes;
    const end = formatTime(currentTime);

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

  const totalHours = currentTime / 60;
  const isOverfilled = totalHours > 10;

  return {
    ...plan,
    steps: updatedSteps,
    totalDurationMinutes: currentTime,
    totalBudgetRange: [newMinCost, newMaxCost],
    isOverfilled,
    overfillWarning: isOverfilled
      ? {
          en: `Tight schedule: total plan (${Math.round(totalHours * 10) / 10}h) exceeds 10h limit.`,
          ja: `スケジュールが過密です: 合計 (${Math.round(totalHours * 10) / 10}時間) が10時間の制限を超えています。`,
        }
      : undefined,
  };
}

export function reorderPlanSteps(
  plan: DayPlan,
  fromIndex: number,
  toIndex: number,
): DayPlan {
  if (
    fromIndex < 0 ||
    fromIndex >= plan.steps.length ||
    toIndex < 0 ||
    toIndex >= plan.steps.length
  ) {
    return plan;
  }

  const newSteps = [...plan.steps];
  const [moved] = newSteps.splice(fromIndex, 1);
  newSteps.splice(toIndex, 0, moved);

  // Recalculate timing
  let currentTime = 0;
  const updatedSteps = newSteps.map((step) => {
    const start = formatTime(currentTime);
    currentTime += step.durationMinutes;
    const end = formatTime(currentTime);
    return {
      ...step,
      startTime: start,
      endTime: end,
    };
  });

  return {
    ...plan,
    steps: updatedSteps,
    totalDurationMinutes: currentTime,
  };
}
