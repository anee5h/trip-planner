/**
 * comfort-model-v1 + crowd-model-v1 — KAI-89 derived comfort/crowd models.
 *
 * COMFORT: rainFriendly is monotone in indoorPercent (runtime-consumed by
 * SeasonalSuitabilityService); heatTolerance is a coarse 3-5 band from
 * indoorPercent + climate/kind adjustments; walkingIntensity is ALWAYS
 * derived from walkingMin (never independently authored), so the two
 * representations cannot contradict.
 *
 * CROWD: informational only (verified: zero runtime/UI consumers). The
 * model replaces fabricated template vectors with deterministic band values
 * (2-3 low, 4-5 moderate, 6-7 busy, 8 very busy, 9-10 peak) so any future
 * display never shows template data; provenance is recorded as method model.
 */
import type { Destination } from "../../src/shared/types/destination";
import { walkingIntensityScore } from "./walking-model-v1";

export interface ComfortModelOutput {
  action: "set" | "keep" | "unknown";
  reason: string;
  comfort?: { heatTolerance: number; rainFriendly: number; walkingIntensity: number };
  confidence: "high" | "medium" | "low" | "unknown";
  modelVersion: "comfort-model-v1";
}

export interface CrowdModelOutput {
  action: "set" | "keep" | "unknown";
  reason: string;
  crowd?: { weekday: number; weekend: number; holiday: number };
  confidence: "high" | "medium" | "low" | "unknown";
  modelVersion: "crowd-model-v1";
}

function rainFriendlyFromIndoor(indoorPercent: number, kind: string): number {
  let base: number;
  if (indoorPercent >= 86) base = 9;
  else if (indoorPercent >= 70) base = 8;
  else if (indoorPercent >= 50) base = 6;
  else if (indoorPercent >= 30) base = 5;
  else if (indoorPercent >= 16) base = 4;
  else base = 2;
  if (["museum", "aquarium", "shopping", "market", "theme_park", "amusement_park"].includes(kind)) base += 1;
  if (["mountain", "nature", "natural", "beach"].includes(kind)) base -= 1;
  return Math.max(1, Math.min(10, base));
}

function heatToleranceFromIndoor(indoorPercent: number, kind: string): number {
  let band: number;
  if (indoorPercent >= 70) band = 8;
  else if (indoorPercent >= 31) band = 6;
  else band = 5;
  if (["mountain", "garden", "nature", "natural", "lake"].includes(kind)) band += 2; // cool retreat
  if (["beach", "market", "onsen", "street", "district"].includes(kind)) band -= 1;
  return Math.max(1, Math.min(10, band));
}

export function comfortModel(
  dest: Destination,
  eligibleIds: Set<string>,
  walkingMinutes: number | undefined,
): ComfortModelOutput {
  if (!eligibleIds.has(dest.id)) {
    return { action: "keep", reason: "outside model scope (override precedence)", confidence: "unknown", modelVersion: "comfort-model-v1" };
  }
  const indoorPercent = dest.indoorPercent ?? 0;
  const kind = dest.kind ?? "";
  if (dest.indoorPercent === undefined && !kind) {
    return { action: "unknown", reason: "no indoorPercent/kind inputs; comfort hidden (UNKNOWN)", confidence: "unknown", modelVersion: "comfort-model-v1" };
  }
  const walkingIntensity = walkingMinutes !== undefined ? walkingIntensityScore(walkingMinutes) : 5;
  return {
    action: "set",
    reason: `derived from indoorPercent=${indoorPercent}, kind='${kind}', walkingMin=${walkingMinutes ?? "unknown"}`,
    comfort: {
      heatTolerance: heatToleranceFromIndoor(indoorPercent, kind),
      rainFriendly: rainFriendlyFromIndoor(indoorPercent, kind),
      walkingIntensity,
    },
    confidence: "low",
    modelVersion: "comfort-model-v1",
  };
}

function crowdBaseWeekday(kind: string, isHub: boolean): number {
  if (isHub) return 6;
  switch (kind) {
    case "theme_park": case "amusement_park": case "aquarium": case "zoo": return 8;
    case "museum": case "temple": case "shrine": case "castle": case "palace": case "garden": return 5;
    case "park": case "nature": case "natural": case "mountain": case "lake": case "beach": case "island": return 3;
    case "shopping": case "market": case "street": case "district": return 6;
    default: return 4;
  }
}

const OUTDOOR_KINDS = new Set(["park", "nature", "natural", "mountain", "lake", "beach", "island", "garden", "viewpoint"]);

export function crowdModel(
  dest: Destination,
  eligibleIds: Set<string>,
): CrowdModelOutput {
  if (!eligibleIds.has(dest.id)) {
    return { action: "keep", reason: "outside model scope (override precedence)", confidence: "unknown", modelVersion: "crowd-model-v1" };
  }
  const kind = dest.kind ?? "";
  const isHub = ["city", "ward", "town", "village"].includes(kind);
  let weekday = crowdBaseWeekday(kind, isHub);
  if (dest.importance === "major") weekday += 1;
  if (dest.collections?.length) weekday += 1;
  if (dest.reservation && /reservation|booking|advance/i.test(dest.reservation)) weekday += 1;
  const outdoorBonus = OUTDOOR_KINDS.has(kind) ? 1 : 0;
  const weekend = Math.min(10, weekday + 2 + outdoorBonus);
  let holiday = Math.min(10, weekday + 1);
  if (isHub) holiday = Math.max(weekday, weekend - 1); // metro hubs dip on holidays
  return {
    action: "set",
    reason: `derived from kind='${kind}', importance=${dest.importance ?? "standard"}, collections=${dest.collections?.length ?? 0}`,
    crowd: { weekday: Math.min(10, weekday), weekend, holiday },
    confidence: "low",
    modelVersion: "crowd-model-v1",
  };
}
