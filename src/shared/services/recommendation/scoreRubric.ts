/**
 * scoreRubric — KAI-89 Overall-Destination Score Rubric v2.
 *
 * ALIAS-FREE shared module (no `@/` imports) so BOTH the runtime
 * (RecommendationScorer re-exports) and the deterministic generator
 * (scripts/derive-destination-models.ts) compute the SAME score. The
 * generator persists scoreMetadata; gates verify persisted == runtime.
 *
 * Contract (see scripts/audit/kai-89-score-rubric-v2.json):
 *
 *  - ONE rubric computes the user-facing overall destination score for
 *    every destination that has enough evidence. `verified` and
 *    `estimated` are PROVENANCE/confidence states over that same formula —
 *    never different formulas on the same scale. A verified score and an
 *    estimated score are numerically comparable because they come from the
 *    identical rubric.
 *  - verified  → rubric value whose inputs were editorially verified
 *    against authoritative sources (score-specific provenance: date +
 *    source URLs). Never derived from generic ratingMetadata.confidence.
 *  - estimated → rubric value over catalogue fields with model provenance
 *    (sourceClass "model"); visibly labeled estimated.
 *  - unavailable → weighted evidence coverage below SCORE_EVIDENCE_THRESHOLD.
 *    Sparse records show a localized unavailable state, never a neutral-5
 *    estimate. A lack of evidence is not evidence of average quality.
 *
 * Anti-double-counting: a designation (UNESCO, national park, top-100
 * castle, …) is credited in exactly ONE dimension — RECOGNITION.
 * SIGNIFICANCE reads ONLY the catalogue `importance` tier. Importance and
 * external designations are disjoint inputs; nothing is credited twice.
 *
 * Catalogue-completeness guard: officialWebsite, status, fieldSources,
 * highlight count, visit-window presence and walking-data presence NEVER
 * affect the numeric value. They are evidence-maturity signals that belong
 * to confidence/provenance, not destination quality.
 *
 * NEVER uses the gated legacy ratings vector or the seasonal-suitability
 * vector (seasonal consistency is NOT destination quality).
 */
import type { Destination } from "@/shared/types/destination";

export type ScoreState = "verified" | "estimated" | "unavailable";

export const OVERALL_SCORE_RUBRIC_VERSION = "kai-89-overall-v2";

/**
 * Weighted evidence-coverage threshold (0..1) below which a destination has
 * NO numeric overall score. With weights 0.40/0.30/0.20/0.10, 0.5 means at
 * least half of the rubric weight must be backed by direct evidence —
 * equivalently SIGNIFICANCE plus any secondary dimension, or RECOGNITION
 * plus RICHNESS. Chosen so a two-dimension evidence pair (the minimum
 * defensible basis) scores, while a single sparse dimension does not.
 */
export const SCORE_EVIDENCE_THRESHOLD = 0.5;

export interface ScoreProvenance {
  /** editorial-review = rubric inputs verified against authoritative sources. */
  sourceClass: "editorial-review" | "model";
  /** ISO date of the editorial verification (editorial-review only). */
  verifiedAt?: string;
  /** Authoritative source URLs backing the verification (editorial-review only). */
  sources?: string[];
  /** Human/JSON basis describing what produced the score. */
  basis: string;
}

export interface ScoreMetadata {
  state: ScoreState;
  /** Rubric value (1-10, null when unavailable). */
  value: number | null;
  rubricVersion: string;
  confidence: "high" | "low" | "unknown";
  /** Weighted evidence coverage 0..1; value present only when >= threshold. */
  coverage: number;
  provenance: ScoreProvenance;
  /** i18n key for the localized note (both locales must define it). */
  noteKey: string;
}

const IMPORTANCE_TIER: Record<string, number> = {
  major: 9,
  notable: 7,
  standard: 5,
  minor: 3,
};

export interface RubricDimensions {
  significance: number;
  recognition: number;
  richness: number;
  accessibility: number;
}

export interface RubricResult {
  /** null when weighted evidence coverage < SCORE_EVIDENCE_THRESHOLD. */
  value: number | null;
  /** Weighted evidence coverage 0..1 (2 decimals). */
  coverage: number;
  dimensions: RubricDimensions;
}

const WEIGHTS = {
  significance: 0.4,
  recognition: 0.3,
  richness: 0.2,
  accessibility: 0.1,
};

function clampScore(v: number): number {
  return Math.max(1, Math.min(10, Math.round(v * 10) / 10));
}

/**
 * External-designation tier used by RECOGNITION ONLY (single credit:
 * highest tier wins, never stacked). Returns null when the record carries
 * no designation evidence at all (collections and tags both empty).
 */
function designationTier(destination: Destination): number | null {
  const collectionIds = new Set(
    (destination.collections ?? []).map((c) => c.collectionId),
  );
  const tags = (destination.tags ?? []).join(" ");

  if (
    collectionIds.has("unesco-japan") ||
    /\bunesco\b|\bworld heritage\b/i.test(tags)
  ) {
    return 9;
  }
  if (
    collectionIds.has("national-parks-japan") ||
    collectionIds.has("quasi-national-parks-japan") ||
    collectionIds.has("japan-top-castles") ||
    collectionIds.has("original-12-castles") ||
    /national park|japan heritage|national treasure|top 100 castle|japan's top castles|three great|three famous|national scenic|natural monument/i.test(
      tags,
    )
  ) {
    return 7;
  }
  if (
    collectionIds.size > 0 ||
    /prefectural|registered|historic site/i.test(tags)
  ) {
    return 6;
  }
  return null;
}

/**
 * Deterministic Overall-Destination Rubric v2 (0-10).
 *
 * Dimensions (weights sum to 1.0; every dimension needs DIRECT evidence —
 * an absent input leaves the dimension uncovered and contributes neither
 * value nor weight):
 *
 *  - SIGNIFICANCE (0.40): catalogue `importance` tier (major/notable/
 *    standard/minor). No designation bonuses — designations belong to
 *    RECOGNITION.
 *  - RECOGNITION  (0.30): external designation tier (UNESCO 9; national
 *    park / Japan heritage / national treasure / top-100 castle / three-
 *    great 7; other curated collection or prefectural/registered 6; tags
 *    present without designation → 4, absence of designation is evidence).
 *  - RICHNESS     (0.20): distinct category count + indoor/outdoor balance
 *    (indoorPercent 20-80). Highlight count is evidence-maturity, NOT
 *    quality: it never changes the value.
 *  - ACCESSIBILITY(0.10): finite transport-mode count (3+ → 8, 1-2 → 6).
 *    visit-window / walking data are provenance signals, not value.
 *
 * Missing input never manufactures a neutral 5 in the numerator: uncovered
 * dimensions are excluded from both numerator and denominator, and the
 * result is re-normalized over covered weight. Below the coverage
 * threshold the result is unavailable (value null).
 */
export function computeOverallScore(destination: Destination): RubricResult {
  const importance = destination.importance;
  const significancePresent =
    typeof importance === "string" && IMPORTANCE_TIER[importance] !== undefined;

  const collectionIds = (destination.collections ?? []).map(
    (c) => c.collectionId,
  );
  const tags = destination.tags ?? [];
  const recognitionPresent = collectionIds.length > 0 || tags.length > 0;

  const categories = new Set(
    (destination.categories ?? []).map((c) => c.toLowerCase()),
  );
  const highlights = destination.highlights ?? [];
  const indoorPercent = destination.indoorPercent;
  const richnessPresent =
    categories.size > 0 ||
    highlights.length > 0 ||
    typeof indoorPercent === "number";

  const transportCount = Object.entries(
    destination.transportOptions ?? {},
  ).filter(([, v]) => Number.isFinite(v)).length;
  const accessibilityPresent = transportCount > 0;

  const coverage =
    Math.round(
      ((significancePresent ? WEIGHTS.significance : 0) +
        (recognitionPresent ? WEIGHTS.recognition : 0) +
        (richnessPresent ? WEIGHTS.richness : 0) +
        (accessibilityPresent ? WEIGHTS.accessibility : 0)) *
        100,
    ) / 100;

  if (coverage < SCORE_EVIDENCE_THRESHOLD) {
    return {
      value: null,
      coverage,
      dimensions: {
        significance: 0,
        recognition: 0,
        richness: 0,
        accessibility: 0,
      },
    };
  }

  const significance = significancePresent ? IMPORTANCE_TIER[importance] : 0;
  const tier = designationTier(destination);
  const recognition = recognitionPresent ? (tier ?? 4) : 0;
  let richness = categories.size >= 4 ? 8 : categories.size >= 2 ? 6 : 4;
  if (
    typeof indoorPercent === "number" &&
    indoorPercent >= 20 &&
    indoorPercent <= 80
  ) {
    richness += 0.5;
  }
  const accessibility = transportCount >= 3 ? 8 : 6;

  const weighted =
    (significancePresent ? significance * WEIGHTS.significance : 0) +
    (recognitionPresent ? recognition * WEIGHTS.recognition : 0) +
    (richnessPresent ? richness * WEIGHTS.richness : 0) +
    (accessibilityPresent ? accessibility * WEIGHTS.accessibility : 0);

  return {
    value: clampScore(weighted / coverage),
    coverage,
    dimensions: {
      significance,
      recognition,
      richness,
      accessibility,
    },
  };
}

/**
 * REC-002 legacy rating-vector trust predicate: ratingMetadata confidence
 * high/medium means the legacy ratings vector (ratings.overall, food,
 * couple, …) may be presented as reviewed evidence. This is a DIFFERENT
 * concept from the overall-score state — it never decides score states.
 */
export function isRatingVerified(destination: Destination): boolean {
  const confidence = destination.ratingMetadata?.confidence;
  return confidence === "high" || confidence === "medium";
}

export interface EditorialScoreProvenance {
  /** ISO date of the editorial verification. */
  verifiedAt: string;
  /** Authoritative source URLs. */
  sources: string[];
}

function dimensionBasis(
  destination: Destination,
  result: RubricResult,
): string {
  const importance = destination.importance;
  const categories = new Set(
    (destination.categories ?? []).map((c) => c.toLowerCase()),
  ).size;
  const transportCount = Object.entries(
    destination.transportOptions ?? {},
  ).filter(([, v]) => Number.isFinite(v)).length;
  const tier = designationTier(destination);
  const hasRecognitionEvidence =
    (destination.collections ?? []).length > 0 ||
    (destination.tags ?? []).length > 0;
  return JSON.stringify({
    rubric: OVERALL_SCORE_RUBRIC_VERSION,
    coverage: result.coverage,
    significance:
      typeof importance === "string" &&
      IMPORTANCE_TIER[importance] !== undefined
        ? importance
        : "absent",
    recognition:
      tier !== null
        ? `designation-tier-${tier}`
        : hasRecognitionEvidence
          ? "no-designation"
          : "absent",
    richness: categories > 0 ? `categories-${categories}` : "absent",
    accessibility:
      transportCount > 0 ? `transport-${transportCount}` : "absent",
  });
}

/**
 * Canonical persisted scoreMetadata for a record (generator emission).
 * `editorial` (from the committed verification ledger) upgrades an
 * evidence-sufficient record to `verified`; without it the record is
 * `estimated` (model provenance) or `unavailable` (below threshold).
 */
export function buildScoreMetadata(
  destination: Destination,
  editorial?: EditorialScoreProvenance,
): ScoreMetadata {
  const r = computeOverallScore(destination);
  if (editorial && r.value !== null) {
    return {
      state: "verified",
      value: r.value,
      rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
      confidence: "high",
      coverage: r.coverage,
      provenance: {
        sourceClass: "editorial-review",
        verifiedAt: editorial.verifiedAt,
        sources: editorial.sources,
        basis: `editorially reviewed ${editorial.verifiedAt} against ${editorial.sources.length} authoritative source(s)`,
      },
      noteKey: "destination.scoreVerifiedNote",
    };
  }
  if (r.value === null) {
    return {
      state: "unavailable",
      value: null,
      rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
      confidence: "unknown",
      coverage: r.coverage,
      provenance: {
        sourceClass: "model",
        basis: `evidence coverage ${r.coverage.toFixed(2)} below threshold ${SCORE_EVIDENCE_THRESHOLD}`,
      },
      noteKey: "destination.scoreUnavailable",
    };
  }
  return {
    state: "estimated",
    value: r.value,
    rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
    confidence: "low",
    coverage: r.coverage,
    provenance: {
      sourceClass: "model",
      basis: dimensionBasis(destination, r),
    },
    noteKey: "destination.scoreEstimatedNote",
  };
}

/**
 * One shared presentation resolution so every surface stays in lockstep.
 * Reads PERSISTED scoreMetadata when present (generated by the derive
 * generator) and falls back to computing it — the two must agree (gated).
 * The fallback can never produce `verified`: that state requires persisted
 * editorial provenance.
 */
export function getScorePresentation(destination: Destination): {
  state: ScoreState;
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
  const r = computeOverallScore(destination);
  if (r.value === null) {
    return {
      state: "unavailable",
      value: null,
      estimated: false,
      noteKey: "destination.scoreUnavailable",
    };
  }
  return {
    state: "estimated",
    value: r.value,
    estimated: true,
    noteKey: "destination.scoreEstimatedNote",
  };
}
