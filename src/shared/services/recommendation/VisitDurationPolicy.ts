import type { Destination } from "@/shared/types/destination";

export type PlanningCategory =
  | "theme_park"
  | "entertainment_complex"
  | "indoor_attraction"
  | "observation_deck"
  | "museum"
  | "shrine_temple"
  | "district_park"
  | "generic";

export interface TypeDurationFallback {
  minMins: number;
  prefMins: number;
  maxMins: number;
  hardMinMins: number;
  hardMaxMins: number;
}

export interface VisitDuration {
  minMins: number;
  prefMins: number;
  maxMins: number;
  source: "curated" | "type_fallback";
}

export function resolvePlanningCategory(dest: Destination): PlanningCategory {
  const k = (dest.kind || "").toLowerCase();
  const cats = (dest.categories || []).map((c) => c.toLowerCase());

  if (k === "theme_park" || cats.includes("theme park")) return "theme_park";
  if (
    cats.includes("entertainment") ||
    k === "entertainment_complex" ||
    cats.includes("entertainment complex")
  ) {
    return "entertainment_complex";
  }
  if (k === "indoor_attraction") return "indoor_attraction";
  if (
    cats.includes("observation deck") ||
    cats.includes("observatory") ||
    k === "viewpoint"
  ) {
    return "observation_deck";
  }
  if (k === "museum" || cats.includes("museum")) return "museum";
  if (cats.includes("shrine") || cats.includes("temple") || k === "shrine") {
    return "shrine_temple";
  }
  if (
    k === "district" ||
    k === "neighborhood" ||
    k === "park" ||
    k === "street"
  ) {
    return "district_park";
  }
  return "generic";
}

export function getTypeFallback(dest: Destination): TypeDurationFallback {
  const category = resolvePlanningCategory(dest);
  switch (category) {
    case "theme_park":
      return {
        minMins: 300,
        prefMins: 420,
        maxMins: 600,
        hardMinMins: 180,
        hardMaxMins: 600,
      };
    case "entertainment_complex":
      return {
        minMins: 120,
        prefMins: 180,
        maxMins: 240,
        hardMinMins: 60,
        hardMaxMins: 300,
      };
    case "indoor_attraction":
      return {
        minMins: 90,
        prefMins: 150,
        maxMins: 180,
        hardMinMins: 45,
        hardMaxMins: 240,
      };
    case "observation_deck":
      return {
        minMins: 60,
        prefMins: 90,
        maxMins: 180,
        hardMinMins: 30,
        hardMaxMins: 240,
      };
    case "museum":
      return {
        minMins: 90,
        prefMins: 150,
        maxMins: 240,
        hardMinMins: 45,
        hardMaxMins: 300,
      };
    case "shrine_temple":
      return {
        minMins: 30,
        prefMins: 60,
        maxMins: 120,
        hardMinMins: 20,
        hardMaxMins: 180,
      };
    case "district_park":
      return {
        minMins: 90,
        prefMins: 150,
        maxMins: 240,
        hardMinMins: 45,
        hardMaxMins: 300,
      };
    default:
      return {
        minMins: 45,
        prefMins: 90,
        maxMins: 120,
        hardMinMins: 20,
        hardMaxMins: 180,
      };
  }
}

export function getEffectiveVisitDuration(dest: Destination): VisitDuration {
  const min = dest.recommendedVisitHours?.min;
  const max = dest.recommendedVisitHours?.max;
  const hasValidCuratedDuration =
    Number.isFinite(min) && Number.isFinite(max) && min! > 0 && max! >= min!;

  const fallback = getTypeFallback(dest);

  if (hasValidCuratedDuration) {
    const curatedMin = Math.round(min! * 60);
    const curatedMax = Math.round(max! * 60);

    const curatedIsPlausible =
      curatedMin >= fallback.hardMinMins && curatedMax <= fallback.hardMaxMins;

    if (curatedIsPlausible) {
      return {
        minMins: curatedMin,
        prefMins: Math.round((curatedMin + curatedMax) / 2),
        maxMins: curatedMax,
        source: "curated",
      };
    }
  }

  return {
    minMins: fallback.minMins,
    prefMins: fallback.prefMins,
    maxMins: fallback.maxMins,
    source: "type_fallback",
  };
}
