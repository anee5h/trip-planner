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

/**
 * ONE authoritative ownership test: is a (possibly large) walkingMin value
 * model-generated MINUTES, or legacy data?
 *
 * KAI-89 provenance contract: "provenance is the unit". A model-generated
 * value (300/360/480/576 min…) must NEVER be re-detected as metre-typed on a
 * second run. Two equivalent evidence paths:
 *
 *  A. structured provenance: walkingMetadata { method: "model", unit:
 *     "minutes" } — canonical KAI-89 marker, works WITHOUT an editorial
 *     block (records that never had editorial provenance);
 *  B. legacy field source: editorial.fieldSources.walkingMin contains a
 *     walking-model-v1 calculated source (records written before
 *     walkingMetadata existed).
 *
 * Use THIS function everywhere metre-vs-minute detection happens
 * (walking-model-v1, derive-destination-models split-integrity guard,
 * validators) — never duplicate a slightly different ownership test.
 */
export function isModelOwnedWalkingMinutes(dest: Destination): boolean {
  const structured =
    dest.walkingMetadata?.method === "model" &&
    dest.walkingMetadata?.unit === "minutes";
  if (structured) return true;
  // Legacy field sources are titled "walking-model-v1; <reason>"; match the
  // model name as a whole token (no prefix collision with e.g. a future
  // "walking-model-v10") and tolerate malformed/missing titles.
  return (dest.editorial?.fieldSources?.walkingMin ?? []).some((s) =>
    /^walking-model-v1(?:;|$)/.test(s.title ?? ""),
  );
}

export function walkingIntensityFromMinutes(
  minutes: number,
): "low" | "medium" | "high" {
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
  const outdoorKinds = new Set([
    "mountain",
    "nature",
    "natural",
    "lake",
    "waterfall",
    "park",
    "garden",
    "island",
    "beach",
    "viewpoint",
  ]);
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
    return {
      action: "keep",
      reason: "outside model scope (override precedence)",
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }
  const visitMax = dest.recommendedVisitHours?.max;

  // ---- Model-owned minutes: skip metre detection ----
  // Values written by this model are minutes BY CONSTRUCTION (roundTo5 of
  // a pace/walk-share product). Without this guard a legitimately large
  // fill (e.g. 0.8 × 12h = 576 min) would be re-detected as metre-typed
  // on the next run and mis-converted/corrupted. Provenance is the unit:
  // structured walkingMetadata OR legacy fieldSources (isModelOwnedWalkingMinutes).
  const modelOwnedMinutes = isModelOwnedWalkingMinutes(dest);

  // ---- Un-sourced / unit-invalid sun-shade splits: clear ----
  // walkingSunMin/walkingShadeMin are SUBSETS of walkingMin: a split can
  // never exceed the total, and a metre-typed total (>= 300) cannot have
  // minute splits. Batch-template splits (incl. Abashiri's
  // 360/1500/2500 — sun+shade ≫ total) are cleared, never kept.
  // (Metre-typed totals carry their split-clearing in the convert/fill/clear
  // outputs below — one-pass convergence — so only the minute-scale subset
  // violation clears the splits here.)
  const splitSubsetViolation =
    (Number.isFinite(dest.walkingSunMin) &&
      Number.isFinite(dest.walkingShadeMin) &&
      dest.walkingSunMin + dest.walkingShadeMin > dest.walkingMin) ||
    (Number.isFinite(dest.walkingSunMin) &&
      Number.isFinite(dest.walkingShadeMin) === false &&
      dest.walkingSunMin > dest.walkingMin) ||
    (Number.isFinite(dest.walkingShadeMin) &&
      Number.isFinite(dest.walkingSunMin) === false &&
      dest.walkingShadeMin > dest.walkingMin);
  if (
    splitSubsetViolation &&
    (Number.isFinite(dest.walkingMin) === false || dest.walkingMin < METRE_LIKE)
  ) {
    return {
      action: "clear",
      reason: `sun/shade split exceeds walkingMin total; cleared (REMOVE_UNSOURCED_SPLIT)`,
      walkingSunMin: 0,
      walkingShadeMin: 0,
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Synthetic sun/shade splits: clear (REMOVE_SYNTHETIC_SPLIT) ----
  // Two batch-template signatures: the 60/40 proportional split and the
  // complementary partition (sun + shade ≈ total). Genuine independent
  // measurements would not partition the total exactly.
  const hasSyntheticSplit =
    Number.isFinite(dest.walkingMin) &&
    dest.walkingMin > 0 &&
    Number.isFinite(dest.walkingSunMin) &&
    Number.isFinite(dest.walkingShadeMin) &&
    (Math.abs(dest.walkingSunMin + dest.walkingShadeMin - dest.walkingMin) <=
      Math.max(1, dest.walkingMin * 0.05) ||
      (Math.abs(dest.walkingSunMin / dest.walkingMin - SYNTHETIC_SPLIT) <
        0.05 &&
        Math.abs(
          dest.walkingShadeMin / dest.walkingMin - (1 - SYNTHETIC_SPLIT),
        ) < 0.05));
  if (hasSyntheticSplit) {
    return {
      action: "clear",
      reason:
        "synthetic 60/40 sun/shade split removed (REMOVE_SYNTHETIC_SPLIT)",
      walkingSunMin: 0,
      walkingShadeMin: 0,
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Real-distance metres -> minutes (trusted provenance only) ----
  if (
    !modelOwnedMinutes &&
    Number.isFinite(dest.walkingMin) &&
    dest.walkingMin >= METRE_LIKE &&
    trustedWalkingIds.has(dest.id)
  ) {
    const minutes = roundTo5(dest.walkingMin / PACE_M);
    const clamped =
      visitMax && minutes > visitMax * 60 ? roundTo5(visitMax * 60) : minutes;
    return {
      action: "convert",
      reason: `real-distance metres ${dest.walkingMin} -> minutes (pace ${PACE_M} m/min, clamped to visit window)`,
      walkingMin: clamped,
      walkingIntensity: walkingIntensityFromMinutes(clamped),
      // Any splits on a converted record were metre-typed alongside the
      // total: unsourced, cleared with the conversion.
      walkingSunMin: 0,
      walkingShadeMin: 0,
      confidence: "medium",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Formulaic TEMPLATE metres: replace with a walk-share estimate ----
  // (FIX_UNIT P0). The wrong-unit value is not converted (that would launder
  // templates) and not left empty: the visit-duration walk-share estimate is
  // the defensible minute-scale replacement. Without a visit duration, clear.
  if (
    !modelOwnedMinutes &&
    Number.isFinite(dest.walkingMin) &&
    dest.walkingMin >= METRE_LIKE
  ) {
    const share = walkShare(dest);
    if (
      share !== undefined &&
      visitMax !== undefined &&
      Number.isFinite(visitMax)
    ) {
      const minutes = roundTo5(visitMax * 60 * share);
      return {
        action: "fill",
        reason: `template metre value ${dest.walkingMin} replaced by walk-share estimate (FIX_UNIT): ${Math.round(share * 100)}% of ${visitMax}h visit`,
        walkingMin: minutes,
        walkingIntensity: walkingIntensityFromMinutes(minutes),
        // Un-sourced splits (metre-typed with the total) cleared with the fill.
        walkingSunMin: 0,
        walkingShadeMin: 0,
        confidence: "low",
        modelVersion: "walking-model-v1",
      };
    }
    return {
      action: "clear",
      reason: `template metre value ${dest.walkingMin} cleared (FIX_UNIT); no visit duration for a walk-share estimate`,
      walkingMin: 0,
      walkingSunMin: 0,
      walkingShadeMin: 0,
      confidence: "unknown",
      modelVersion: "walking-model-v1",
    };
  }

  // ---- Missing walkingMin: walk-share estimate ----
  if (!Number.isFinite(dest.walkingMin)) {
    const share = walkShare(dest);
    if (
      share !== undefined &&
      visitMax !== undefined &&
      Number.isFinite(visitMax)
    ) {
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

  return {
    action: "keep",
    reason: "minute value outside model scope",
    confidence: "unknown",
    modelVersion: "walking-model-v1",
  };
}
