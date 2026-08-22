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

const HUB_KINDS = new Set(["city", "ward", "town", "village"]);

const SNOW_RE = /\b(ski|snow|winter sport)\b|スキー|スノー/i;
const BEACH_RE = /\b(beach|coast|sea)\b|ビーチ|海|海岸/i;
const FOLIAGE_RE = /\b(autumn|foliage|momiji)\b|紅葉|もみじ/i;
const SPRING_RE =
  /\b(cherry blossom|sakura|spring flower|plum blossom)\b|花見|桜|梅/i;
// Bare kanji 桜/梅 are place-name components (桜島 Sakurajima volcano,
// 青梅 Ome town) and are NOT spring signals in NAMES — only the full
// signal set applies to curated categories/tags, while names accept only
// unambiguous spring tokens (花見/さくら/桜花 or explicit English terms).
const SPRING_NAME_SAFE_RE =
  /\b(cherry blossom|sakura|spring flower|plum blossom)\b|花見|さくら|桜花/i;

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
  if (dest.seasonMetadata?.method === "unknown") {
    return {
      action: "keep",
      reason: "explicit unknown metadata is authoritative",
      metadata: {
        method: "unknown",
        modelVersion: "season-model-v1",
        confidence: "unknown",
        basis: "explicit owner-declared unknown; no model replacement",
      },
    };
  }

  const cats = (dest.categories ?? []).join(" ");
  const tags = (dest.tags ?? []).join(" ");
  const haystack = `${cats} ${tags} ${dest.name ?? ""} ${dest.nameJa ?? ""}`;
  // Spring uses a two-tier signal: full regex (incl. kanji 桜/梅) on the
  // curated categories/tags, name-safe regex on the name/nameJa (bare kanji
  // place names like 桜島/青梅 are NOT spring signals).
  const springSignal =
    SPRING_RE.test(`${cats} ${tags}`) ||
    SPRING_NAME_SAFE_RE.test(`${dest.name ?? ""} ${dest.nameJa ?? ""}`);
  const indoorPercent = dest.indoorPercent ?? 0;
  const kind = dest.kind ?? "";
  const latBand = latitudeBand(dest);

  // R0 contract: city/ward/town/village HUBS receive NO experience-season
  // vectors — a municipality spans many microclimates and a single vector
  // would be a fabricated claim (design decision; the 3 source-corrected
  // bestMonths hubs are handled by the orchestrator's ledger override).
  // Enforced BEFORE any heuristic so a hub's tags (e.g. Ishigaki "Beach")
  // cannot produce a vector.
  if (HUB_KINDS.has(kind)) {
    return {
      action: "neutralize",
      reason: "hub record: no experience-season vector (R0 contract)",
      metadata: {
        method: "unknown",
        modelVersion: "season-model-v1",
        confidence: "unknown",
        basis:
          "hub records span multiple microclimates; single vector would be fabricated",
      },
    };
  }

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

  // R4 foliage + spring DUAL SIGNAL: both signals present, so BOTH peaks
  // are claimed. Must precede the foliage-only and spring-only rules —
  // otherwise the earlier rule returns first and the dual branch is
  // unreachable (review fix: rule order is
  // hub → snow → beach → indoor → dual → foliage-only → spring-only).
  if (springSignal && FOLIAGE_RE.test(haystack)) {
    return {
      action: "set",
      reason: "spring-flower with independent foliage signal (R4 dual)",
      season: { spring: 10, summer: 6, autumn: 9, winter: 4 },
      bestMonths: [4, 5, 10, 11],
      bestSeason: "Spring & Autumn",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "medium",
        basis:
          "independent spring + foliage signals; both peaks claimed, autumn never inferred from spring alone",
      },
    };
  }

  // R5 foliage-only: autumn peak. (Foliage matched above without spring.)
  if (FOLIAGE_RE.test(haystack)) {
    return {
      action: "set",
      reason: "autumn-foliage destination (R5)",
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

  // R6 spring-flower: SPRING ONLY. The legacy rule always emitted the
  // dual-peak vector [4,5,10,11] "Spring & Autumn" from a bare spring
  // signal — fabricating an autumn peak (Miharu Takizakura peaks
  // mid-April but claimed Oct/Nov). Autumn requires an independent foliage
  // signal (handled by the dual rule above).
  if (springSignal) {
    return {
      action: "set",
      reason: "spring-flower destination (R6)",
      season: { spring: 10, summer: 6, autumn: 5, winter: 4 },
      bestMonths: [4, 5],
      bestSeason: "Spring",
      metadata: {
        method: "model",
        modelVersion: "season-model-v1",
        confidence: "medium",
        basis:
          "spring-flower signal; spring-only months 4-5 (autumn never inferred)",
      },
    };
  }

  // R7 events/illumination: source-backed only — no model claim without a
  // source fact, so falls through to unknown.

  // R8 UNKNOWN: neutralize templates and leave genuinely missing records
  // unknown, with an explicit marker (never a fabricated vector).
  return {
    action: "neutralize",
    reason:
      "no defensible seasonal model signal; template vector neutralized to unknown (R8)",
    metadata: {
      method: "unknown",
      modelVersion: "season-model-v1",
      confidence: "unknown",
      basis: "no rule matched; owner policy: unknown stays unknown",
    },
  };
}
