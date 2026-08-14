/**
 * season-model-v1 — KAI-89 experience-season model.
 *
 * The `season` vector is EXPERIENCE-season suitability (machine-consumed by
 * the scorer and SeasonalSuitabilityService). ACCESS season stays
 * source-backed; WEATHER suitability stays with the live weather service.
 *
 * Rules (R0 > R7): source facts > owner workbook triage > snow > beach
 * (latitude bands) > indoor (year-round marker) > foliage > spring-flower >
 * events (source-backed only) > UNKNOWN. City/ward hubs and onsens get NO
 * vectors. Template vectors (all-12 hub, flat-4, fractional hash) are
 * NEUTRALIZED to null with an explicit seasonMetadata.method "unknown"
 * marker — never backfilled with a template (owner policy).
 */
import type { Destination } from "../../src/shared/types/destination";
import { latitudeBand } from "./calibration";

export interface SeasonModelOutput {
  action: "set" | "neutralize" | "keep" | "unknown";
  reason: string;
  season?: { spring: number; summer: number; autumn: number; winter: number };
  bestMonths?: number[];
  bestSeason?: string;
  metadata: {
    method: "manual" | "assisted" | "model" | "unknown";
    modelVersion: "season-model-v1";
    confidence: "high" | "medium" | "low" | "unknown";
    basis: string;
  };
}

const INDOOR_KINDS = new Set([
  "museum",
  "aquarium",
  "theme_park",
  "amusement_park",
  "shopping",
  "market",
  "entertainment",
  "cultural",
]);

const SNOW_RE = /\b(ski|snow|winter sport)\b|スキー|スノー/i;
const BEACH_RE = /\b(beach|coast|sea)\b|ビーチ|海|海岸/i;
const FOLIAGE_RE = /\b(autumn|foliage|momiji)\b|紅葉|もみじ/i;
const SPRING_RE =
  /\b(cherry blossom|sakura|spring flower|plum blossom)\b|花見|桜|梅/i;

/** Eligibility: template/missing season records this model may touch. */
export function seasonModel(
  dest: Destination,
  eligibleIds: Set<string>,
): SeasonModelOutput {
  const never = {
    action: "keep" as const,
    reason: "outside model scope (override precedence)",
    metadata: {
      method: "unknown" as const,
      modelVersion: "season-model-v1" as const,
      confidence: "unknown" as const,
      basis: "n/a",
    },
  };
  if (!eligibleIds.has(dest.id)) return never;

  const cats = (dest.categories ?? []).join(" ");
  const tags = (dest.tags ?? []).join(" ");
  const haystack = `${cats} ${tags} ${dest.name ?? ""} ${dest.nameJa ?? ""}`;
  const indoorPercent = dest.indoorPercent ?? 0;
  const kind = dest.kind ?? "";
  const latBand = latitudeBand(dest);

  // R1 snow: winter peak, bestMonths Dec-Mar.
  if (SNOW_RE.test(haystack)) {
    return {
      action: "set",
      reason: "snow/ski destination (R1)",
      season: { spring: 4, summer: 2, autumn: 6, winter: 10 },
      bestMonths: [12, 1, 2, 3],
      bestSeason: "Winter",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "medium",
        basis: "snow/ski category signal; calibrated 4/4 trusted winter peaks",
      },
    };
  }

  // R2 beach: warm-season peak, latitude-adjusted.
  if (BEACH_RE.test(haystack) || kind === "beach") {
    if (latBand === "tropical") {
      return {
        action: "set",
        reason: "tropical beach (R2, lat<28)",
        season: { spring: 9, summer: 10, autumn: 9, winter: 6 },
        bestMonths: [5, 6, 7, 8, 9, 10],
        bestSeason: "Summer",
        metadata: {
          method: "model",
          modelVersion: "season-model-v1",
          confidence: "medium",
          basis: "tropical latitude band; calibrated 6/7 trusted summer peaks",
        },
      };
    }
    return {
      action: "set",
      reason: "temperate beach (R2)",
      season: { spring: 7, summer: 10, autumn: 6, winter: 3 },
      bestMonths: [7, 8],
      bestSeason: "Summer",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "medium",
        basis: "temperate latitude band; calibrated beach peaks",
      },
    };
  }

  // R3 indoor: year-round suitability with an explicit marker, NOT a flat
  // fake vector and NOT all-12-as-template — [1..12] here is the documented
  // year-round representation.
  if (indoorPercent >= 70 || INDOOR_KINDS.has(kind)) {
    return {
      action: "set",
      reason: "indoor destination (R3): year-round marker",
      season: { spring: 7, summer: 6, autumn: 7, winter: 7 },
      bestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      bestSeason: "All Year (indoor)",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "low",
        basis:
          "indoorPercent/kind; year-round marker; calibration gap documented",
      },
    };
  }

  // R4 foliage: autumn peak.
  if (FOLIAGE_RE.test(haystack)) {
    return {
      action: "set",
      reason: "autumn-foliage destination (R4)",
      season: { spring: 8, summer: 6, autumn: 10, winter: 5 },
      bestMonths: [10, 11],
      bestSeason: "Autumn",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "medium",
        basis: "foliage category; calibrated 4/4 trusted autumn peaks",
      },
    };
  }

  // R5 spring-flower (incl. dual-peak variant).
  if (SPRING_RE.test(haystack)) {
    return {
      action: "set",
      reason: "spring-flower destination (R5)",
      season: { spring: 10, summer: 6, autumn: 7, winter: 4 },
      bestMonths: [4, 5, 10, 11],
      bestSeason: "Spring & Autumn",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "medium",
        basis: "spring-flower category; calibrated 8/9 trusted",
      },
    };
  }

  // R6 events/illumination: source-backed only — no model claim without a
  // source fact, so falls through to unknown.

  // R7 UNKNOWN: neutralize templates and leave genuinely missing records
  // unknown, with an explicit marker (never a fabricated vector).
  return {
    action: "neutralize",
    reason:
      "no defensible seasonal model signal; template vector neutralized to unknown (R7)",
    metadata: {
      method: "unknown",
      modelVersion: "season-model-v1",
      confidence: "unknown",
      basis: "no rule matched; owner policy: unknown stays unknown",
    },
  };
}
