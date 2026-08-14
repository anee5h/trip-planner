/**
 * walking-model-v1 — KAI-89 walking-minutes model.
 *
 * Canonical unit: MINUTES (validator contract). Three operations:
 * 1) Convert REAL-distance metre values (trusted/source-backed provenance
 *    only) to minutes via a documented pace model (round5(metres/80)),
 *    clamped to the visit window — formulaic TEMPLATE metres are cleared,
 *    never converted (that would launder templates).
 * 2) Remove SYNTHETIC 60/40 sun/shade splits (clear the split fields).
 * 3) Fill missing walkingMin with a walk-share estimate (share of visit
 *    duration by kind/indoorPercent, 5-min grid).
 * walkingIntensity string and comfort.walkingIntensity are BOTH derived
 * from walkingMin so the two representations can never contradict.
 */
import type { Destination } from "../../src/shared/types/destination";
import { roundTo5 } from "./calibration";

export interface WalkingModelOutput {
  action: "convert" | "fill" | "clear" | "keep" | "unknown";
  reason: string;
  walkingMin?: number;
  walkingSunMin?: number;
  walkingShadeMin?: number;
  walkingIntensity?: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low" | "unknown";
  modelVersion: "walking-model-v1";
}

const METRE_LIKE = 300; // >= 300 in a minute field is metre-typed
const PACE_M = 80; // documented pace: 80 m/min
const SYNTHETIC_SPLIT = 0.6; // sun = 0.6 * walkingMin signature

export function walkingIntensityFromMinutes(minutes: number): "low" | "medium" | "high" {
  if (minutes <= 45) return "low";
  if (minutes <= 95) return "medium";
  return "high";
}

export function walkingIntensityScore(minutes: number): number {
  if (minutes <= 45) return 3;
  if (minutes <= 95) return 5;
  return 8;
}

/** Walk-share of visit duration by kind/indoor (calibrated bands). */
function walkShare(dest: Destination): number | undefined {
  const kind = dest.kind ?? "";
  const indoor = dest.indoorPercent ?? 0;
  if (indoor >= 70) return 0.3;
  if (indoor >= 40) return 0.5;
  const outdoorKinds = new Set(["mountain", "nature", "natural", "lake", "waterfall", "park", "garden", "island", "beach", "viewpoint"]);
  if (outdoorKinds.has(kind)) return 0.8;
  if (["temple", "shrine", "castle", "palace"].includes(kind)) return 0.6;
  return 0.5;
}

export function walkingModel(
  dest: Destination,
  eligibleIds: Set<string>,
  trustedWalkingIds: Set<string>,
): WalkingModelOutput {
  if (!eligibleIds.has(dest.id)) {
    return { action: "keep", reason: "outside model scope (override precedence)", confidence: "unknown", modelVersion: "walking-model-v1" };
  }
  const visitMax = dest.recommendedVisitHours?.max;

  // ---- Synthetic 60/40 sun/shade splits: clear (REMOVE_SYNTHETIC_SPLIT) ----
  const hasSyntheticSplit =
    Number.isFinite(dest.walkingMin) &&
    dest.walkingMin > 0 &&
    Number.isFinite(dest.walkingSunMin) &&
    Number.isFinite(dest.walkingShadeMin) &&
    Math.abs(dest.walkingSunMin / dest.walkingMin - SYNTHETIC_SPLIT) < 0.05 &&
    Math.abs(dest.walkingShadeMin / dest.walkingMin - (1 - SYNTHETIC_SPLIT)) < 0.05;
  if (hasSyntheticSplit) {
    return {
      action: "clear",
      reason: "synthetic 60/40 sun/shade split removed (REMOVE_SYNTHETIC_SPLIT)",
      walkingSunMin: 0,
      walkingShadeMin: 0,
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Real-distance metres -> minutes (trusted provenance only) ----
  if (
    Number.isFinite(dest.walkingMin) &&
    dest.walkingMin >= METRE_LIKE &&
    trustedWalkingIds.has(dest.id)
  ) {
    const minutes = roundTo5(dest.walkingMin / PACE_M);
    const clamped = visitMax && minutes > visitMax * 60 ? roundTo5(visitMax * 60) : minutes;
    return {
      action: "convert",
      reason: `real-distance metres ${dest.walkingMin} -> minutes (pace ${PACE_M} m/min, clamped to visit window)`,
      walkingMin: clamped,
      walkingIntensity: walkingIntensityFromMinutes(clamped),
      confidence: "medium",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Formulaic TEMPLATE metres: replace with a walk-share estimate ----
  // (FIX_UNIT P0). The wrong-unit value is not converted (that would launder
  // templates) and not left empty: the visit-duration walk-share estimate is
  // the defensible minute-scale replacement. Without a visit duration, clear.
  if (Number.isFinite(dest.walkingMin) && dest.walkingMin >= METRE_LIKE) {
    const share = walkShare(dest);
    if (share !== undefined && visitMax !== undefined && Number.isFinite(visitMax)) {
      const minutes = roundTo5(visitMax * 60 * share);
      return {
        action: "fill",
        reason: `template metre value ${dest.walkingMin} replaced by walk-share estimate (FIX_UNIT): ${Math.round(share * 100)}% of ${visitMax}h visit`,
        walkingMin: minutes,
        walkingIntensity: walkingIntensityFromMinutes(minutes),
        confidence: "low",
        modelVersion: "walking-model-v1",
      };
    }
    return {
      action: "clear",
      reason: `template metre value ${dest.walkingMin} cleared (FIX_UNIT); no visit duration for a walk-share estimate`,
      walkingMin: 0,
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Missing walkingMin: walk-share estimate ----
  if (!Number.isFinite(dest.walkingMin)) {
    const share = walkShare(dest);
    if (share !== undefined && visitMax !== undefined && Number.isFinite(visitMax)) {
      const minutes = roundTo5(visitMax * 60 * share);
      return {
        action: "fill",
        reason: `walk-share estimate: ${Math.round(share * 100)}% of ${visitMax}h visit`,
        walkingMin: minutes,
        walkingIntensity: walkingIntensityFromMinutes(minutes),
        confidence: "low",
        modelVersion: "walking-model-v1",
      };
    }
    return {
      action: "unknown",
      reason: "no visit duration to base a walk-share estimate on",
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }

  return { action: "keep", reason: "minute value outside model scope", confidence: "unknown", modelVersion: "walking-model-v1" };
}
