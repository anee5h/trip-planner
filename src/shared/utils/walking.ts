import type { Destination } from "../types/destination";

export type WalkingIntensityLevel = "low" | "medium" | "high";

/**
 * Derives or retrieves the walking intensity level for a destination.
 * - walkingMin <= 4000 steps -> "low"
 * - 4000 < walkingMin <= 8000 steps -> "medium"
 * - walkingMin > 8000 steps -> "high"
 */
export function getWalkingIntensity(
  dest: Partial<Destination>,
): WalkingIntensityLevel {
  if (
    dest.walkingIntensity === "low" ||
    dest.walkingIntensity === "medium" ||
    dest.walkingIntensity === "high"
  ) {
    return dest.walkingIntensity;
  }

  const steps = dest.walkingMin ?? 4000;
  if (steps <= 4000) return "low";
  if (steps <= 8000) return "medium";
  return "high";
}

export function getWalkingIntensityMetadata(
  level: WalkingIntensityLevel,
  locale?: string,
) {
  const isJa = locale === "ja";
  switch (level) {
    case "low":
      return {
        level: "low" as const,
        label: isJa ? "少なめ" : "Low",
        fullLabel: isJa ? "歩行量少なめ" : "Low Walking",
        description: isJa
          ? "平坦で歩行が少ない（約4,000歩以下）"
          : "Easy, minimal walking (~4k steps or less)",
        badgeClass:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
        indicatorColor: "bg-emerald-700",
        icon: "🟢",
      };
    case "medium":
      return {
        level: "medium" as const,
        label: isJa ? "普通" : "Moderate",
        fullLabel: isJa ? "標準的な歩行量" : "Moderate Walking",
        description: isJa
          ? "標準的な街歩き（約4,000〜8,000歩）"
          : "Standard walking (~4k–8k steps)",
        badgeClass:
          "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
        indicatorColor: "bg-amber-500",
        icon: "🟡",
      };
    case "high":
      return {
        level: "high" as const,
        label: isJa ? "多め" : "High",
        fullLabel: isJa ? "歩行量多め" : "High Walking",
        description: isJa
          ? "坂道・階段・長距離移動（8,000歩以上）"
          : "Active, heavy walking (> 8k steps / slopes / stairs)",
        badgeClass:
          "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800",
        indicatorColor: "bg-rose-500",
        icon: "🔴",
      };
  }
}
