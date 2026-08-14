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
  comfort?: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  };
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
  if (
    [
      "museum",
      "aquarium",
      "shopping",
      "market",
      "theme_park",
      "amusement_park",
    ].includes(kind)
  )
    base += 1;
  if (["mountain", "nature", "natural", "beach"].includes(kind)) base -= 1;
  return Math.max(1, Math.min(10, base));
}

function heatToleranceFromIndoor(indoorPercent: number, kind: string): number {
  let band: number;
  if (indoorPercent >= 70) band = 8;
  else if (indoorPercent >= 31) band = 6;
  else band = 5;
  if (["mountain", "garden", "nature", "natural", "lake"].includes(kind))
    band += 2; // cool retreat
  if (["beach", "market", "onsen", "street", "district"].includes(kind))
    band -= 1;
  return Math.max(1, Math.min(10, band));
}

export function comfortModel(
  dest: Destination,
  eligibleIds: Set<string>,
  walkingMinutes: number | undefined,
): ComfortModelOutput {
  if (!eligibleIds.has(dest.id)) {
    return {
      action: "keep",
      reason: "outside model scope (override precedence)",
      confidence: "unknown",
      modelVersion: "comfort-model-v1",
    };
  }
  const indoorPercent = dest.indoorPercent;
  const kind = dest.kind ?? "";
  // indoorPercent is the ONLY strong input for heat/rain bands. Without it
  // the model refuses to manufacture bands from kind alone (the legacy
  // default `indoorPercent ?? 0` fabricated a heatTolerance/rainFriendly
  // claim for every record).
  if (indoorPercent === undefined) {
    return {
      action: "unknown",
      reason: "no indoorPercent input; comfort neutralized (UNKNOWN_NOT_FREE)",
      confidence: "unknown",
      modelVersion: "comfort-model-v1",
    };
  }
  const walkingIntensity =
    walkingMinutes !== undefined
      ? walkingIntensityScore(walkingMinutes)
      : undefined;
  return {
    action: "set",
    reason: `derived from indoorPercent=${indoorPercent}, kind='${kind}', walkingMin=${walkingMinutes ?? "unknown"}`,
    comfort: {
      heatTolerance: heatToleranceFromIndoor(indoorPercent, kind),
      rainFriendly: rainFriendlyFromIndoor(indoorPercent, kind),
      ...(walkingIntensity !== undefined ? { walkingIntensity } : {}),
    },
    confidence: "low",
    modelVersion: "comfort-model-v1",
  };
}

function crowdBaseWeekday(kind: string, isHub: boolean): number {
  if (isHub) return 6;
  switch (kind) {
    case "theme_park":
    case "amusement_park":
    case "aquarium":
    case "zoo":
      return 8;
    case "museum":
    case "temple":
    case "shrine":
    case "castle":
    case "palace":
    case "garden":
      return 5;
    case "park":
    case "nature":
    case "natural":
    case "mountain":
    case "lake":
    case "beach":
    case "island":
      return 3;
    case "shopping":
    case "market":
    case "street":
    case "district":
      return 6;
    default:
      return 4;
  }
}

const OUTDOOR_KINDS = new Set([
  "park",
  "nature",
  "natural",
  "mountain",
  "lake",
  "beach",
  "island",
  "garden",
  "viewpoint",
]);

export function crowdModel(
  dest: Destination,
  eligibleIds: Set<string>,
): CrowdModelOutput {
  if (!eligibleIds.has(dest.id)) {
    return {
      action: "keep",
      reason: "outside model scope (override precedence)",
      confidence: "unknown",
      modelVersion: "crowd-model-v1",
    };
  }
  // KAI-89 review: crowd has ZERO runtime/UI consumers, and a vector derived
  // from kind alone is manufactured evidence. Template crowd vectors on
  // eligible records are neutralized to the explicit unknown state instead
  // of being replaced with new fabricated bands. (The legacy holiday rule
  // `weekday + 1` also inverted the real relationship — holidays are as
  // busy as weekends; with the model neutralized no corrected claim is
  // needed.)
  return {
    action: "unknown",
    reason:
      "crowd has no runtime consumer; kind-derived band would be manufactured evidence; neutralized (UNKNOWN_NOT_FREE)",
    confidence: "unknown",
    modelVersion: "crowd-model-v1",
  };
}
