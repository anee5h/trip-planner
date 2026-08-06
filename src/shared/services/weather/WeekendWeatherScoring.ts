import type { ActualWeatherCondition } from "@/shared/services/recommendation/RecommendationContext";

export interface WeekendWeatherEvaluation {
  score: number;
  summary: "good" | "mixed" | "poor" | "unknown";
  badDayIndices: number[]; // 0-based indices of rainy/stormy/snowy days
}

/**
 * Evaluates weekend weather for a destination.
 *
 * Per-day score contribution (LOCKED formula):
 *   "clear" | "cloudy" | "unknown" → 0
 *   "rainy"                       → -(10 + ((100 - indoor) / 100) * 12) + (indoor / 100) * 8
 *   "stormy" | "snowy"            → -(15 + ((100 - indoor) / 100) * 20) + (indoor / 100) * 8
 *   indoor = dest.indoorPercent ?? 0 (clamped 0..100)
 *
 * score = sum across days.
 * badDayIndices = 0-based indices of days whose condition is rainy/stormy/snowy.
 * summary:
 *   days.length === 0                      → "unknown"
 *   badDayIndices.length > 0 && indoor >= 70 → "mixed"
 *   badDayIndices.length > 0               → "poor"
 *   otherwise                              → "good"
 */
export function evaluateWeekendWeather(
  dest: { indoorPercent?: number },
  days: readonly { condition: ActualWeatherCondition }[],
): WeekendWeatherEvaluation {
  const rawIndoor = dest.indoorPercent ?? 0;
  const indoor = Math.max(0, Math.min(100, rawIndoor));

  if (days.length === 0) {
    return { score: 0, summary: "unknown", badDayIndices: [] };
  }

  const badDayIndices: number[] = [];
  let score = 0;
  const outdoorPct = (100 - indoor) / 100;

  for (let i = 0; i < days.length; i++) {
    const condition = days[i].condition;
    switch (condition) {
      case "rainy": {
        const penalty = -(10 + outdoorPct * 12) + (indoor / 100) * 8;
        score += penalty;
        badDayIndices.push(i);
        break;
      }
      case "stormy":
      case "snowy": {
        const penalty = -(15 + outdoorPct * 20) + (indoor / 100) * 8;
        score += penalty;
        badDayIndices.push(i);
        break;
      }
      default: {
        // clear, cloudy, unknown → 0
        break;
      }
    }
  }

  let summary: WeekendWeatherEvaluation["summary"];
  if (badDayIndices.length > 0 && indoor >= 70) {
    summary = "mixed";
  } else if (badDayIndices.length > 0) {
    summary = "poor";
  } else {
    summary = "good";
  }

  return { score, summary, badDayIndices };
}
