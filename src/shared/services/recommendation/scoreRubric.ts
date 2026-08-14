/**
 * scoreRubric — KAI-89 Overall-Destination Score Rubric v1.
 *
 * ALIAS-FREE shared module (no `@/` imports) so BOTH the runtime
 * (RecommendationScorer re-exports) and the deterministic generator
 * (scripts/derive-destination-models.ts) compute the SAME score. The
 * generator persists scoreMetadata; gates verify persisted == runtime.
 *
 * Contract (see scripts/audit/kai-89-score-rubric-v1.json):
 *  - verified: ratingMetadata.confidence high/medium → editorial score
 *    (ratings.overall), never re-estimated;
 *  - estimated: the deterministic rubric over trusted, non-gated catalogue
 *    fields; visibly labeled estimated, never presented as editorial;
 *  - unavailable: only when the rubric cannot run (safety state).
 * NEVER uses the gated ratings vector or the seasonal-suitability vector
 * (seasonal consistency is NOT destination quality).
 */
import type { Destination } from "@/shared/types/destination";

export type RatingDisplayState = "verified" | "estimated" | "unavailable";

export const OVERALL_SCORE_RUBRIC_VERSION = "kai-89-overall-v1";

export interface ScoreMetadata {
  state: RatingDisplayState;
  /** The numeric value to display (null when unavailable). */
  value: number | null;
  /** Present for estimated scores; n/a for verified editorial scores. */
  rubricVersion?: string;
  confidence?: "high" | "medium" | "low" | "unknown";
  /** Human/JSON basis explaining what produced the value. */
  basis?: string;
  method: "editorial" | "calculated";
  /** i18n key for the localized note (both locales must define it). */
  noteKey: string;
}

export function getRatingDisplayState(
  destination: Destination,
): RatingDisplayState {
  const confidence = destination.ratingMetadata?.confidence;
  if (confidence === "high" || confidence === "medium") return "verified";
  // The rubric scores any Destination-shaped record (missing inputs →
  // documented neutral 5), so published records resolve to estimated.
  return "estimated";
}

function clampScore(v: number): number {
  return Math.max(1, Math.min(10, Math.round(v * 10) / 10));
}

/**
 * Deterministic ESTIMATED overall score (0-10) from the Overall-Destination
 * Rubric v1 — a composite over trusted, non-gated catalogue fields that each
 * measure a defensible dimension of destination VALUE:
 *
 *  - SIGNIFICANCE (w 0.35): importance tier + heritage designations.
 *  - RECOGNITION  (w 0.25): external designations (UNESCO, national parks,
 *    heritage programmes).
 *  - RICHNESS     (w 0.20): category variety, highlights, indoor/outdoor
 *    balance.
 *  - ACCESSIBILITY(w 0.10): public-transport modes, visit window, walking.
 *  - CURATION     (w 0.10): official website + catalogue status.
 *
 * Missing input → component neutral 5 (documented). NEVER the gated ratings
 * vector, NEVER the seasonal-suitability vector.
 */
export function getEstimatedOverallScore(destination: Destination): number {
  const importanceTier: Record<string, number> = {
    major: 9,
    notable: 7,
    standard: 5,
    minor: 3,
  };
  const tags = (destination.tags ?? []).join(" ");
  const collectionIds = (destination.collections ?? []).map(
    (c) => c.collectionId,
  );

  // 1. SIGNIFICANCE: importance tier + heritage designations.
  let significance = importanceTier[destination.importance ?? ""] ?? 5;
  if (collectionIds.includes("unesco-japan")) significance += 1;
  if (/national treasure|important cultural property/i.test(tags))
    significance += 1;
  if (/top 100 castle|three great|three famous/i.test(tags)) significance += 1;
  significance = clampScore(significance);

  // 2. RECOGNITION: external designations.
  let recognition = 4;
  if (collectionIds.includes("unesco-japan")) recognition = 8;
  else if (
    /japan heritage|national park|world heritage/i.test(tags) ||
    collectionIds.includes("national-parks-japan") ||
    collectionIds.includes("quasi-national-parks-japan")
  )
    recognition = 7;
  else if (
    collectionIds.length > 0 ||
    /prefectural heritage|registered/i.test(tags)
  )
    recognition = 6;

  // 3. RICHNESS: category variety + highlights + indoor/outdoor balance.
  const categoryCount = new Set(
    (destination.categories ?? []).map((c) => c.toLowerCase()),
  ).size;
  let richness = categoryCount >= 4 ? 8 : categoryCount >= 2 ? 6 : 4;
  const highlightCount = (destination.highlights ?? []).length;
  if (highlightCount >= 3) richness += 1;
  else if (highlightCount >= 1) richness += 0.5;
  const indoor = destination.indoorPercent;
  if (typeof indoor === "number" && indoor >= 20 && indoor <= 80)
    richness += 0.5;
  richness = clampScore(richness);

  // 4. ACCESSIBILITY: transport modes + visit window + walking data.
  const transportModes = Object.entries(
    destination.transportOptions ?? {},
  ).filter(([, v]) => Number.isFinite(v)).length;
  let accessibility = transportModes >= 3 ? 8 : transportModes >= 1 ? 6 : 3;
  if (destination.recommendedVisitHours) accessibility += 1;
  if (Number.isFinite(destination.walkingMin)) accessibility += 0.5;
  accessibility = clampScore(accessibility);

  // 5. CURATION: official website + catalogue status (evidence maturity).
  let curation = 5;
  if (destination.officialWebsite) curation += 1.5;
  if (destination.status === "verified") curation += 1.5;
  else if (destination.status === "published") curation += 0.5;
  curation = clampScore(curation);

  const score =
    significance * 0.35 +
    recognition * 0.25 +
    richness * 0.2 +
    accessibility * 0.1 +
    curation * 0.1;
  return clampScore(Math.round(score * 10) / 10);
}

export function getRubricBasis(): string {
  return JSON.stringify({
    rubric: OVERALL_SCORE_RUBRIC_VERSION,
    significance: "importance+heritage",
    recognition: "collections+tags",
    richness: "categories+highlights+indoorPercent",
    accessibility: "transportOptions+visitHours+walkingMin",
    curation: "officialWebsite+status",
  });
}

/**
 * One shared presentation resolution so every surface stays in lockstep.
 * Reads PERSISTED scoreMetadata when present (generated by the derive
 * generator) and falls back to computing it — the two must agree (gated).
 */
export function getScorePresentation(destination: Destination): {
  state: RatingDisplayState;
  value: number | null;
  estimated: boolean;
  noteKey: string;
} {
  const meta = destination.scoreMetadata;
  if (meta) {
    return {
      state: meta.state,
      value: meta.value,
      estimated: meta.state === "estimated",
      noteKey: meta.noteKey,
    };
  }
  const state = getRatingDisplayState(destination);
  if (state === "verified")
    return {
      state,
      value:
        typeof destination.ratings?.overall === "number"
          ? destination.ratings.overall
          : null,
      estimated: false,
      noteKey: "destination.scoreVerifiedNote",
    };
  if (state === "estimated")
    return {
      state,
      value: getEstimatedOverallScore(destination),
      estimated: true,
      noteKey: "destination.scoreEstimatedNote",
    };
  return {
    state,
    value: null,
    estimated: false,
    noteKey: "destination.scoreUnavailable",
  };
}

/** Canonical persisted scoreMetadata for a record (generator emission). */
export function buildScoreMetadata(destination: Destination): ScoreMetadata {
  const state = getRatingDisplayState(destination);
  if (state === "verified") {
    const value =
      typeof destination.ratings?.overall === "number"
        ? destination.ratings.overall
        : null;
    return {
      state,
      value,
      method: "editorial",
      basis: `editorial ratingMetadata ${destination.ratingMetadata?.rubricVersion ?? "?"} ${destination.ratingMetadata?.method ?? "?"} confidence ${destination.ratingMetadata?.confidence ?? "?"}`,
      noteKey: "destination.scoreVerifiedNote",
    };
  }
  return {
    state,
    value: getEstimatedOverallScore(destination),
    rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
    confidence: "low",
    method: "calculated",
    basis: getRubricBasis(),
    noteKey: "destination.scoreEstimatedNote",
  };
}
