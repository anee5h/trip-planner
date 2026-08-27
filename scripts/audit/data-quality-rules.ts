/**
 * KAI-87 preventive data-quality rules (report §G, PR 6).
 *
 * Pure per-destination/per-collection rule functions shared by BOTH the
 * validator suite (scripts/validators/data-quality.ts — errors for the
 * preventive classes, warnings for accepted-debt classes) and the catalogue
 * audit (scripts/audit/catalog-integrity.ts — all codes as warnings behind
 * the check:catalog-warnings baseline gate). Keeping the logic here means
 * the two gating surfaces can never drift apart.
 *
 * Severity is decided by the caller, not here:
 *  - the validator marks PREVENTIVE_CODES as errors (validate:catalog-fast
 *    fails on any new instance — the classes are zero-debt after KAI-87);
 *  - the audit emits every code as a warning so check:catalog-warnings
 *    baselines existing debt and fails on new fingerprints.
 */

import type { Destination } from "../../src/shared/types/destination";
import type { Collection } from "../../src/shared/types/collection";
import type { TransportMode } from "../../src/shared/services/transport/types";
import { hasVerifiedFreeEvidence } from "../../src/shared/services/budget/freeEvidence";
import { hasValidStoredNumericBudget } from "../../src/shared/services/budget/numericBudgetShape";

export interface DataQualityIssue {
  code: string;
  message: string;
}

export interface DestinationRuleContext {
  /** zoneId → local modes (from transport-topology.json). */
  zoneLocalModes: ReadonlyMap<string, readonly TransportMode[]>;
  /** Catalogue-wide frequency of each rating vector (KAI-89 template detection). */
  ratingVectorFrequency?: ReadonlyMap<string, number>;
}

export const VALID_KINDS = new Set([
  "city",
  "ward",
  "town",
  "village",
  "district",
  "castle",
  "palace",
  "temple",
  "shrine",
  "museum",
  "park",
  "garden",
  "mountain",
  "lake",
  "waterfall",
  "island",
  "beach",
  "shopping",
  "market",
  "street",
  "viewpoint",
  "tower",
  "bridge",
  "station",
  "onsen",
  "zoo",
  "aquarium",
  // KAI-87: catalogue legacy kinds (schema contract extended, report §A).
  "nature",
  "historic_town",
  "historic",
  "natural",
  "mixed",
  "theme_park",
  "memorial",
  "monument",
  "cruise",
  "cemetery",
  "cliff",
  "rock_formation",
  "amusement_park",
  "cape",
  "observation",
  "event",
  "entertainment",
  "cultural",
]);

export const VALID_ROLES = new Set(["hub", "poi", "standalone"]);
export const VALID_STATUSES = new Set([
  "published",
  "beta",
  "verified",
  "planned",
]);
export const VALID_TRANSPORT_MODES: readonly TransportMode[] = [
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
  "flight",
  "ferry",
];

const PAID_KINDS = new Set([
  "museum",
  "tower",
  "zoo",
  "aquarium",
  "theme_park",
  "amusement_park",
  "castle",
  "garden",
  "onsen",
  "memorial",
  "monument",
]);

export const COLLECTION_MEMBERSHIP_KEYS = new Set([
  "collectionId",
  "sortOrder",
  "confirmed",
  // Provenance for evidence-backed memberships (UNESCO #142).
  "source",
]);

const SEASON_TO_MONTHS: Record<string, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

/**
 * Error-severity classes in the validator: deterministic violations that are
 * provably wrong whenever they appear. The catalogue is zero-debt on all of
 * them after KAI-87 PR 1-5, so a new instance failing validate:catalog-fast
 * is a real regression, never noise.
 */
export const PREVENTIVE_CODES = new Set([
  "ISLAND_RAIL_CLAIM",
  "LAM_TRANSPORT_CONTRADICTION",
  "QA_TEXT_LEAK",
  "NONFINITE_USER_NUMBER",
  "INVALID_BUDGET_RANGE",
  "BUDGET_RECOMMENDED_OUTSIDE_RANGE",
  "NONFINITE_TRANSPORT_VALUE",
  "INVALID_VISIT_HOURS_RANGE",
  "NONFINITE_RATING",
  "UNKNOWN_TRANSPORT_KEY",
  "HERO_LICENSE_HOST_MISMATCH",
  "MISSING_TRAVEL_ESTIMATE",
  "VERSION_TAG_ARTIFACT",
  "PLACEHOLDER_SOURCE",
  "OFF_UNION_KIND",
  "OFF_UNION_STATUS",
  "COLLECTION_SORTORDER_COLLISION",
  "COLLECTION_MEMBERSHIP_SHAPE",
  // KAI-89: template rating vector stamped high/medium confidence, and rail
  // access on islands whose zone has no rail. Both are provably wrong
  // whenever they appear (catalogue is zero-debt on both after KAI-89).
  "RATING_METADATA_UNSUPPORTED_HIGH",
  "OKINAWA_RAIL_VALUE",
  // KAI-214: budget-state taxonomy hard contract. These fire only when the
  // new explicit state/provenance/reasonCode fields are present — impossible
  // combinations are provably wrong and must fail CI. Existing records
  // (method-only metadata) never trigger them, so the current catalogue
  // stays zero-debt on these codes.
  "KAI214_TRUSTED_STATE_REQUIRES_VERIFIED_PROVENANCE",
  "KAI214_VERIFIED_FREE_REQUIRES_EVIDENCE",
  "KAI214_NON_NUMERIC_STATE_REQUIRES_REASON",
  "KAI214_LEGACY_UNVERIFIED_HIGH_CONFIDENCE",
  "KAI214_NOT_APPLICABLE_WITH_TICKETS",
  "KAI214_UNAVAILABLE_WITH_NUMERIC",
  "KAI214_CONTRADICTORY_STATE_PROVENANCE",
  "KAI214_NUMERIC_STATE_WITHOUT_NUMBERS",
  // KAI-218A: scoped cost-fact hard contract. These fire ONLY when the new
  // admission/localTransport facts are present — the current catalogue
  // (no facts authored) stays zero-debt. Impossible combinations are
  // provably wrong and must fail CI (verified_paid without provenance,
  // variable_price as a fabricated bounded range, walking without evidence,
  // etc.).
  "KAI218_ADMISSION_LEGACY_UNVERIFIED",
  "KAI218_ADMISSION_UNKNOWN_STATE",
  "KAI218_ADMISSION_MISSING_COST",
  "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_BOUNDED",
  "KAI218_ADMISSION_VERIFIED_PAID_ZERO_RANGE",
  "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_SOURCE",
  "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_PROVENANCE",
  "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_ZERO",
  "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_SOURCE",
  "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_EVIDENCE",
  "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_REQUIRES_MODEL",
  "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_COST",
  "KAI218_ADMISSION_VARIABLE_INVALID_COST",
  "KAI218_ADMISSION_VARIABLE_INVALID_FROM",
  "KAI218_ADMISSION_VARIABLE_BOUNDED_REQUIRES_SOURCE",
  "KAI218_ADMISSION_VARIABLE_REQUIRES_REASON",
  "KAI218_ADMISSION_NOT_APPLICABLE_COST",
  "KAI218_ADMISSION_NOT_APPLICABLE_REQUIRES_REASON",
  "KAI218_ADMISSION_UNAVAILABLE_COST",
  "KAI218_ADMISSION_UNAVAILABLE_REQUIRES_REASON",
  "KAI218_ADMISSION_LEGACY_DRIFT",
  "KAI218_ADMISSION_INVALID_REVIEW_INTERVAL",
  "KAI218_ADMISSION_INVALID_CHECKED_AT",
  "KAI218_LOCAL_TRANSPORT_INVALID_FARE",
  "KAI218_LOCAL_TRANSPORT_REQUIRES_SOURCE",
  "KAI218_LOCAL_TRANSPORT_REQUIRES_BASIS",
  "KAI218_LOCAL_TRANSPORT_REQUIRES_CHECKED_AT",
  "KAI218_LOCAL_TRANSPORT_REQUIRES_FARE_BASIS",
  "KAI218_LOCAL_TRANSPORT_REQUIRES_COVERAGE",
  "KAI218_LOCAL_TRANSPORT_INVALID_REVIEW_INTERVAL",
  "KAI218_LOCAL_TRANSPORT_INVALID_CHECKED_AT",
  "KAI218_LOCAL_TRANSPORT_BOUNDED_REQUIRES_SOURCE",
  "KAI218_LOCAL_TRANSPORT_INVALID_DISTANCE",
  "KAI218_LOCAL_TRANSPORT_WALKING_REQUIRES_EVIDENCE",
  "KAI218_LOCAL_TRANSPORT_UNAVAILABLE_REQUIRES_DETAIL",
  "KAI218_LOCAL_TRANSPORT_NOT_APPLICABLE_REQUIRES_REASON",
]);

export function firstTimeRange(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isCoarseGrid(v: number): boolean {
  return Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
}

const USER_VISIBLE_NUMERIC_FIELDS = [
  "budgetMin",
  "budgetRecommended",
  "budgetMax",
  "walkingMin",
  "walkingSunMin",
  "walkingShadeMin",
  "indoorPercent",
  "totalTripHours",
] as const;

const DETERMINISTIC_COPY_LEAK =
  /Source-backed|v1\.9\.2|KAI-31|city expansion record|Municipal hub record reviewed|Municipal hub created in/i;
const GENERIC_TEMPLATE_COPY =
  /visitor destination in|visitor hub in|travel hub in|A top recommended attraction in|訪問者向けの観光地|curated destination within|popular tourist spot in|popular tourist destination in|art and culture hub|有名な観光スポット|アートとカルチャーの拠点/i;

function destinationCopy(dest: Destination): string {
  return JSON.stringify({
    notes: dest.notes,
    description: dest.description,
    notesJa: dest.notesJa,
    content: dest.content,
  });
}

// Canonical 10-key rating vector (mirror of scripts/audit/rules.ts RULE-007).
export const REQUIRED_RATING_KEYS = [
  "overall",
  "couple",
  "summer",
  "winter",
  "rain",
  "food",
  "photography",
  "relaxation",
  "value",
  "uniqueness",
] as const;

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * KAI-219A contract (Fix 5): strict YYYY-MM-DD + calendar round-trip —
 * the SAME rule as the runtime validator (factValidation.ts). Rejects
 * impossible/ambiguous dates (2026-02-30, 01/02/2026) that Date.parse
 * would accept. Runtime and authoring stay aligned.
 */
function isStrictCalendarDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function collectDestinationIssues(
  dest: Destination,
  ctx: DestinationRuleContext,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const push = (code: string, message: string) =>
    issues.push({ code, message });

  // ---- G4: schema unions ----
  for (const field of USER_VISIBLE_NUMERIC_FIELDS) {
    const value = dest[field];
    if (value !== undefined && !finiteNonNegative(value)) {
      push(
        "NONFINITE_USER_NUMBER",
        `${field} must be a finite non-negative number`,
      );
    }
  }
  if (
    dest.budgetMin !== undefined &&
    dest.budgetMax !== undefined &&
    finiteNonNegative(dest.budgetMin) &&
    finiteNonNegative(dest.budgetMax) &&
    dest.budgetMin > dest.budgetMax
  ) {
    push("INVALID_BUDGET_RANGE", "budgetMin must not exceed budgetMax");
  }
  if (
    dest.budgetRecommended !== undefined &&
    finiteNonNegative(dest.budgetRecommended) &&
    dest.budgetMin !== undefined &&
    dest.budgetMax !== undefined &&
    finiteNonNegative(dest.budgetMin) &&
    finiteNonNegative(dest.budgetMax) &&
    (dest.budgetRecommended < dest.budgetMin ||
      dest.budgetRecommended > dest.budgetMax)
  ) {
    push(
      "BUDGET_RECOMMENDED_OUTSIDE_RANGE",
      "budgetRecommended must fall within budgetMin and budgetMax",
    );
  }
  for (const [mode, value] of Object.entries(dest.transportOptions ?? {})) {
    if (!finiteNonNegative(value)) {
      push(
        "NONFINITE_TRANSPORT_VALUE",
        `${mode} transport estimate must be finite and non-negative`,
      );
    }
  }
  if (dest.budgetBreakdown) {
    for (const [field, value] of Object.entries(dest.budgetBreakdown)) {
      if (!finiteNonNegative(value)) {
        push(
          "NONFINITE_USER_NUMBER",
          `budgetBreakdown.${field} must be finite and non-negative`,
        );
      }
    }
  }
  if (dest.recommendedVisitHours) {
    const { min, max } = dest.recommendedVisitHours;
    if (!finiteNonNegative(min) || !finiteNonNegative(max) || min > max) {
      push(
        "INVALID_VISIT_HOURS_RANGE",
        "recommendedVisitHours must be a finite ascending range",
      );
    }
  }
  for (const [field, value] of Object.entries(dest.ratings ?? {})) {
    if (value !== undefined && !finiteNonNegative(value)) {
      push(
        "NONFINITE_RATING",
        `ratings.${field} must be finite and non-negative`,
      );
    }
  }
  if (dest.kind && !VALID_KINDS.has(dest.kind)) {
    push(
      "OFF_UNION_KIND",
      `kind '${dest.kind}' is outside the DestinationKind union`,
    );
  }
  if (dest.role && !VALID_ROLES.has(dest.role)) {
    push(
      "OFF_UNION_ROLE",
      `role '${dest.role}' is outside the hub|poi|standalone union`,
    );
  }
  if (dest.role === undefined && dest.status === "published") {
    push("MISSING_ROLE", "published record has no role");
  }
  if (dest.status && !VALID_STATUSES.has(dest.status)) {
    push(
      "OFF_UNION_STATUS",
      `status '${dest.status}' is outside the published|beta|verified union`,
    );
  }
  if ((dest.tags ?? []).some((t) => /\bv\d+\.\d+\.\d+\b/.test(t))) {
    push(
      "VERSION_TAG_ARTIFACT",
      "tags contain a version artifact like 'v1.9.2'",
    );
  }

  // ---- G3: placeholder sources + QA text ----
  const sources = dest.editorial?.sources ?? [];
  if (
    sources.some(
      (s) =>
        typeof s === "string" || (s && typeof s === "object" && !("url" in s)),
    )
  ) {
    push(
      "PLACEHOLDER_SOURCE",
      "editorial.sources contains a dangling placeholder (string or url-less entry)",
    );
  }
  if (DETERMINISTIC_COPY_LEAK.test(destinationCopy(dest))) {
    push(
      "QA_TEXT_LEAK",
      "notes/description contain QA/provenance template text",
    );
  }
  if (GENERIC_TEMPLATE_COPY.test(destinationCopy(dest))) {
    push(
      "GENERIC_TEMPLATE_COPY",
      "description contains a repeated destination-template phrase",
    );
  }

  // ---- transport keys (H-67) ----
  for (const key of Object.keys(dest.transportOptions ?? {})) {
    if (!VALID_TRANSPORT_MODES.includes(key as TransportMode)) {
      push(
        "UNKNOWN_TRANSPORT_KEY",
        `transportOptions has off-schema key '${key}'`,
      );
    }
  }

  // ---- G5: island rail (precise: zone without rail local modes) ----
  const lam = dest.localAccessModes ?? [];
  const to = dest.transportOptions ?? {};
  const zoneModes = dest.transportZoneId
    ? ctx.zoneLocalModes.get(dest.transportZoneId)
    : undefined;
  if (
    zoneModes &&
    !zoneModes.includes("train") &&
    !zoneModes.includes("shinkansen")
  ) {
    if (to.train !== undefined || to.shinkansen !== undefined) {
      push(
        "ISLAND_RAIL_CLAIM",
        `zone '${dest.transportZoneId}' has no rail local mode but transportOptions lists train/shinkansen`,
      );
    }
  }
  // LAM comparison covers only local (land) modes: ferry/flight are access
  // modes that localAccessModes cannot express by schema design.
  if (
    lam.length &&
    Object.keys(to).some(
      (m) =>
        m !== "ferry" && m !== "flight" && !lam.includes(m as TransportMode),
    )
  ) {
    push(
      "LAM_TRANSPORT_CONTRADICTION",
      "transportOptions contains a mode excluded by localAccessModes",
    );
  }

  // ---- G2: hours ----
  const bhStart = firstTimeRange(dest.businessHours);
  const ohStart = firstTimeRange(dest.openingHours);
  if (
    bhStart !== null &&
    ohStart !== null &&
    Math.abs(bhStart - ohStart) > 30
  ) {
    push(
      "HOURS_CROSS_FIELD_CONFLICT",
      `businessHours (${dest.businessHours}) vs openingHours (${dest.openingHours}) disagree on opening time`,
    );
  }
  const openText =
    `${dest.businessHours ?? ""} ${dest.openingHours ?? ""}`.toLowerCase();
  if (
    PAID_KINDS.has(dest.kind ?? "") &&
    /open access|24 hours/.test(openText)
  ) {
    push(
      "OPEN_ACCESS_ON_PAID_KIND",
      `paid kind '${dest.kind}' claims 'open access'/'24 hours'`,
    );
  }

  // ---- KAI-89: template rating vectors ----
  // NOTE: heuristic classes (repeated vectors, budget-sum mismatches, season
  // contradictions, train/shinkansen inversion, walking sun+shade) are
  // intentionally NOT warning-gated here: the warning baseline gate refuses
  // growth, so broad heuristics over legacy debt would silently enshrine it.
  // They are tracked per-cluster in the KAI-89 structured audit
  // (scripts/audit/kai-89-structured-template-audit.json) with reviewed
  // dispositions (scripts/audit/kai-89-dispositions.json).
  const ratingVector = dest.ratings
    ? JSON.stringify(REQUIRED_RATING_KEYS.map((key) => dest.ratings?.[key]))
    : undefined;
  const vectorFrequency = ratingVector
    ? (ctx.ratingVectorFrequency?.get(ratingVector) ?? 1)
    : 0;
  if (
    vectorFrequency >= 10 &&
    dest.ratingMetadata &&
    dest.ratingMetadata.confidence !== "low"
  ) {
    push(
      "RATING_METADATA_UNSUPPORTED_HIGH",
      `rating vector shared by ${vectorFrequency} records is stamped ${dest.ratingMetadata.confidence}/${dest.ratingMetadata.method} — template data cannot be high/medium-confidence reviewed evidence`,
    );
  }

  // ---- KAI-89: transport value sanity (Okinawa Yui Rail) ----
  // Okinawa's only rail is the Yui Rail (Okinawa Urban Monorail). Official
  // runtimes (yui-rail.co.jp): Naha Airport → Shuri ≈ 27 min, → Kyozuka
  // ≈ 32 min, → Urasoe-Maeda ≈ 34 min, → Tedako-Uranishi (full line) ≈
  // 37 min. Door-to-door local access for ANY station is therefore well
  // under 90 minutes. This rule targets the KNOWN corruption class — the
  // v1.6.0 hub-batch `train: 200` default stamped on every Okinawa hub —
  // not a blanket rejection of longer (but real) monorail journeys, so
  // legitimate 32–37 min values pass.
  if (
    dest.transportZoneId === "okinawa-main" &&
    dest.transportOptions?.train !== undefined &&
    finiteNonNegative(dest.transportOptions.train) &&
    dest.transportOptions.train > 90
  ) {
    push(
      "OKINAWA_RAIL_VALUE",
      `train ${dest.transportOptions.train} min is impossible for Okinawa Yui Rail local access (full line Naha Airport → Tedako-Uranishi ≈ 37 min; legacy batch default was 200)`,
    );
  }

  // ---- G9: seasonality ----
  // An explicit neutral state (seasonMetadata.method "unknown", written by
  // the KAI-89 season model when no defensible seasonal signal exists) is
  // NOT missing data: it is a deliberate, marked absence.
  const seasonExplicitlyNeutral = dest.seasonMetadata?.method === "unknown";
  if (
    dest.status === "published" &&
    dest.role !== "hub" &&
    !seasonExplicitlyNeutral &&
    (!dest.season || !dest.bestMonths?.length)
  ) {
    push(
      "MISSING_SEASON_DATA",
      "published non-hub record lacks season/bestMonths",
    );
  }
  if (dest.season && dest.bestMonths?.length) {
    const seasonScores = Object.fromEntries(
      Object.entries(dest.season).map(([k, v]) => [k, Number(v)]),
    );
    for (const month of dest.bestMonths) {
      const season = (
        Object.entries(SEASON_TO_MONTHS) as Array<[string, number[]]>
      ).find(([, ms]) => ms.includes(month))?.[0];
      if (!season) continue;
      const score = seasonScores[season] ?? 0;
      const max = Math.max(...Object.values(seasonScores));
      if (max > 0 && score < max * 0.5) {
        push(
          "SEASON_BESTMONTHS_CONTRADICTION",
          `bestMonths includes ${month} (${season} score ${score}) while top season is ${max}`,
        );
        break;
      }
    }
  }

  // ---- G4/G7/A: completeness ----
  if (dest.status === "published" && !dest.travelEstimate) {
    push(
      "MISSING_TRAVEL_ESTIMATE",
      "published record lacks travelEstimate.confidence",
    );
  }
  if (
    dest.status === "published" &&
    dest.role !== "hub" &&
    dest.budgetRecommended === undefined &&
    // Explicit neutral state written by the KAI-89 budget model (template
    // budget deliberately returned to unknown) is NOT missing data, and a
    // "manual" state (verified ticket preserved, components accepted debt)
    // is a reviewed budget decision, not a missing one.
    dest.budgetMetadata?.method !== "unknown" &&
    dest.budgetMetadata?.method !== "manual"
  ) {
    push("MISSING_BUDGET", "published non-hub record lacks budgetRecommended");
  }

  // ---- KAI-204 phase 3: legacy budget trust guards (ratchet) ----
  // A number existing in old JSON is NOT provenance. These guards enforce
  // the trust boundary: numeric values without recoverable provenance must
  // carry the explicit "legacy" marker, and the legacy cohort must never
  // grow silently (new numeric values REQUIRE provenance).
  const budgetMethod = dest.budgetMetadata?.method;
  const hasNumericBudget =
    dest.budgetMin !== undefined ||
    dest.budgetRecommended !== undefined ||
    dest.budgetMax !== undefined ||
    dest.budgetBreakdown !== undefined;
  if (hasNumericBudget && !budgetMethod) {
    // A numeric budget with absent metadata is EITHER an untagged legacy
    // record (should have been tagged "legacy") or a NEW record added
    // without provenance. KAI-204 phase 3 (hub trust): the hub exemption is
    // REMOVED — a hub convention must be represented explicitly by model
    // provenance (tickets=0 + peer-cell medians), never by missing metadata.
    // Hub status alone is NOT provenance for transport/food/cafe/range.
    push(
      "NUMERIC_BUDGET_WITHOUT_PROVENANCE",
      "numeric budget fields without budgetMetadata — must carry explicit legacy/manual/model provenance (hub-class included)",
    );
  }
  if (
    dest.budgetMin === 0 &&
    dest.budgetMax === 0 &&
    budgetMethod !== "manual" &&
    budgetMethod !== "model"
  ) {
    push(
      "ZERO_RANGE_FREE_WITHOUT_PROVENANCE",
      "budgetMin=0 and budgetMax=0 without manual/model provenance — free must never be inferred from default zeros",
    );
  }
  if (budgetMethod === "unknown" && hasNumericBudget) {
    push(
      "UNKNOWN_METADATA_WITH_NUMERIC",
      "budgetMetadata.method 'unknown' coexists with numeric budget fields (two competing truths)",
    );
  }
  if (
    budgetMethod === "legacy" &&
    dest.budgetMetadata?.confidence !== "unknown"
  ) {
    push(
      "LEGACY_METADATA_BAD_CONFIDENCE",
      "legacy budget metadata must declare confidence 'unknown'",
    );
  }

  // ---- KAI-214: budget-state taxonomy hard contract (NEW data) ----
  // The permanent multi-axis contract (state/provenance/reasonCode) is
  // OPTIONAL for existing records (transitional normalization). But NEW
  // production data must author `state` explicitly, and impossible
  // combinations are hard errors. These guards only fire when the new
  // fields are present, so existing debt is untouched (ratchet).
  const budgetState = dest.budgetMetadata?.state;
  const budgetProvenance = dest.budgetMetadata?.provenance;
  const reasonCode = dest.budgetMetadata?.reasonCode;

  // KAI-214 Blocker 1: NEW transitional debt must be impossible. ANY record
  // with budgetMetadata but NO explicit state (method-only) relies on the
  // transitional normalization path — REGARDLESS of whether numeric budget
  // fields exist (method:"unknown" with no numbers is still transitional
  // debt: it must author state/provenance/reasonCode explicitly). Existing
  // records are baselined as accepted migration debt via the
  // catalog-warnings identity-level fingerprint ratchet
  // (KAI214_TRANSITIONAL_METHOD_ONLY:<id>); a NEW method-only record
  // produces a NEW fingerprint and fails CI.
  if (dest.budgetMetadata && !budgetState) {
    push(
      "KAI214_TRANSITIONAL_METHOD_ONLY",
      "budgetMetadata without explicit state relies on the transitional normalization path — new records must author state/provenance/reasonCode explicitly",
    );
  }

  // KAI-214 Blocker 2: completely absent budget state is also transitional
  // debt. A production record with NO budgetMetadata and NO explicit state
  // is unclassified. Identity-baselined; NEW missing-state records produce
  // a new fingerprint and fail CI. KAI-218 classifies these (state=...).
  if (!dest.budgetMetadata) {
    push(
      "KAI214_TRANSITIONAL_STATE_MISSING",
      "no budgetMetadata / explicit budget state — new records must author state/provenance/reasonCode explicitly",
    );
  }

  if (budgetState) {
    // Trusted states require explicit provenance.
    if (
      (budgetState === "verified_paid" || budgetState === "verified_free") &&
      budgetProvenance !== "verified_source"
    ) {
      push(
        "KAI214_TRUSTED_STATE_REQUIRES_VERIFIED_PROVENANCE",
        `state '${budgetState}' requires provenance 'verified_source' (got ${budgetProvenance ?? "none"})`,
      );
    }
    // verified_free must carry evidence — SHARED rule with the runtime
    // normalizer/isVerifiedFree (freeEvidence.ts), so the three layers
    // cannot drift. The shared rule rejects negations ("not free",
    // "admission applies", "tickets required") and positive ticket costs.
    if (
      budgetState === "verified_free" &&
      !hasVerifiedFreeEvidence(
        dest.budgetMetadata?.basis,
        dest.budgetBreakdown?.tickets,
      )
    ) {
      push(
        "KAI214_VERIFIED_FREE_REQUIRES_EVIDENCE",
        "state 'verified_free' requires explicit free evidence in basis (shared rule)",
      );
    }
    // unavailable/not-applicable/variable must carry a reasonCode.
    if (
      ["unavailable", "not_applicable", "variable_price"].includes(
        budgetState,
      ) &&
      !reasonCode
    ) {
      push(
        "KAI214_NON_NUMERIC_STATE_REQUIRES_REASON",
        `state '${budgetState}' requires a reasonCode`,
      );
    }
    // legacy_unverified must be untrusted (confidence unknown, no high).
    if (
      budgetState === "legacy_unverified" &&
      dest.budgetMetadata?.confidence === "high"
    ) {
      push(
        "KAI214_LEGACY_UNVERIFIED_HIGH_CONFIDENCE",
        "legacy_unverified must never carry high confidence",
      );
    }
    // not_applicable must not carry a required admission cost.
    if (
      budgetState === "not_applicable" &&
      dest.budgetBreakdown?.tickets !== undefined &&
      dest.budgetBreakdown.tickets > 0
    ) {
      push(
        "KAI214_NOT_APPLICABLE_WITH_TICKETS",
        "not_applicable must not carry a required admission cost",
      );
    }
    // unavailable must not carry trusted numeric fields.
    if (
      budgetState === "unavailable" &&
      hasNumericBudget &&
      budgetProvenance !== "legacy"
    ) {
      push(
        "KAI214_UNAVAILABLE_WITH_NUMERIC",
        "unavailable state coexists with numeric budget fields",
      );
    }
    // KAI-214 forward numeric-state invariant: verified_paid and
    // documented_estimate are NUMERIC states — they must carry a VALID
    // stored numeric budget (valid range OR complete breakdown), using the
    // SAME shape contract as the runtime semantic layer
    // (numericBudgetShape.hasValidStoredNumericBudget). Presence of a lone
    // budgetMin/budgetRecommended/budgetMax or partial breakdown is NOT a
    // valid shape — it would be internally contradictory (state says
    // numeric, runtime cannot consume it).
    if (
      (budgetState === "verified_paid" ||
        budgetState === "documented_estimate") &&
      !hasValidStoredNumericBudget(dest)
    ) {
      push(
        "KAI214_NUMERIC_STATE_WITHOUT_NUMBERS",
        `state '${budgetState}' requires a valid stored numeric budget (valid range or complete breakdown)`,
      );
    }
    // contradictory state+provenance — complete matrix (Blocker: CI
    // contract completeness). Trusted states require verified_source;
    // documented_estimate requires model; anything else is contradictory.
    if (
      (budgetState === "verified_paid" || budgetState === "verified_free") &&
      budgetProvenance !== "verified_source"
    ) {
      push(
        "KAI214_CONTRADICTORY_STATE_PROVENANCE",
        `state '${budgetState}' requires provenance 'verified_source' (got ${budgetProvenance ?? "none"})`,
      );
    }
    if (budgetState === "documented_estimate" && budgetProvenance !== "model") {
      push(
        "KAI214_CONTRADICTORY_STATE_PROVENANCE",
        `state 'documented_estimate' requires provenance 'model' (got ${budgetProvenance ?? "none"})`,
      );
    }
    if (
      budgetState === "legacy_unverified" &&
      budgetProvenance === "verified_source"
    ) {
      push(
        "KAI214_CONTRADICTORY_STATE_PROVENANCE",
        "state 'legacy_unverified' cannot pair with provenance 'verified_source'",
      );
    }
  }

  // ---- KAI-218A: shared fail-closed DestinationCostFact numeric validators ----
  // bounded: min/max finite, min >= 0, max >= min.
  // open_ended: from finite, from >= 0.
  // Used by documented_estimate / variable_price / verified_paid / verified_free.
  const isValidBoundedCost = (
    c: { kind?: string; min?: unknown; max?: unknown } | undefined,
  ): boolean =>
    c?.kind === "bounded" &&
    typeof c.min === "number" &&
    typeof c.max === "number" &&
    finiteNonNegative(c.min) &&
    finiteNonNegative(c.max) &&
    c.min <= c.max;
  const isValidOpenEndedCost = (
    c: { kind?: string; from?: unknown } | undefined,
  ): boolean =>
    c?.kind === "open_ended" &&
    typeof c.from === "number" &&
    finiteNonNegative(c.from);

  // ---- KAI-218A: scoped admission cost fact invariants ----
  const admission = dest.admission;
  if (admission) {
    // Defensive: a malformed fact must produce a finding, never a throw.
    const cost = admission.cost as
      | { kind?: string; min?: unknown; max?: unknown; from?: unknown }
      | undefined;
    // Forward admission facts must never use the legacy_unverified state —
    // legacy values are authored unavailable (legacy_provenance_unrecovered)
    // or re-verified.
    if ((admission.state as string) === "legacy_unverified") {
      push(
        "KAI218_ADMISSION_LEGACY_UNVERIFIED",
        "admission.state must not be legacy_unverified (author unavailable with legacy_provenance_unrecovered or re-verify)",
      );
    }
    // Unknown forward states have no rejection path — reject them.
    const knownStates: ReadonlySet<string> = new Set([
      "verified_paid",
      "verified_free",
      "documented_estimate",
      "variable_price",
      "not_applicable",
      "unavailable",
    ]);
    if (!knownStates.has(admission.state)) {
      push(
        "KAI218_ADMISSION_UNKNOWN_STATE",
        `admission.state '${admission.state}' is not a forward admission state`,
      );
    }
    if (!cost || typeof cost.kind !== "string") {
      push(
        "KAI218_ADMISSION_MISSING_COST",
        "admission requires a cost representation",
      );
    }
    // verified_paid requires bounded cost + verified_source provenance +
    // sourceUrls + checkedAt (prevents silent mass-promotion of legacy
    // ticket values, KAI-218 §risks). A [0,0] verified_paid is rejected:
    // verified zero admission is verified_free, never verified_paid.
    if (admission.state === "verified_paid") {
      const bounded = isValidBoundedCost(cost);
      if (!bounded) {
        push(
          "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_BOUNDED",
          "verified_paid admission requires a bounded [min,max] cost with min>=0 and max>=min",
        );
      }
      if (bounded && cost.min === 0 && cost.max === 0) {
        push(
          "KAI218_ADMISSION_VERIFIED_PAID_ZERO_RANGE",
          "verified_paid admission must not be [0,0] — verified zero admission is verified_free",
        );
      }
      if (admission.provenance !== "verified_source") {
        push(
          "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_SOURCE",
          "verified_paid admission requires provenance 'verified_source'",
        );
      }
      if (
        !admission.sourceUrls ||
        admission.sourceUrls.length === 0 ||
        !admission.checkedAt
      ) {
        push(
          "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_PROVENANCE",
          "verified_paid admission requires at least one sourceUrl and a checkedAt date",
        );
      }
    }
    // verified_free requires verified_source provenance + bounded [0,0] +
    // KAI-214 free evidence (shared semantics, not a weak /free/i regex:
    // the basis must carry the ledger FREE_ENTRY / free-area evidence the
    // runtime's freeEvidence helper trusts).
    if (admission.state === "verified_free") {
      const zeroBounded =
        cost?.kind === "bounded" && cost.min === 0 && cost.max === 0;
      if (!zeroBounded) {
        push(
          "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_ZERO",
          "verified_free admission requires a bounded [0,0] cost",
        );
      }
      if (admission.provenance !== "verified_source") {
        push(
          "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_SOURCE",
          "verified_free admission requires provenance 'verified_source' (a legacy/unknown free claim is not a verified fact)",
        );
      }
      if (
        !admission.basis ||
        !/FREE_ENTRY|free area|free admission|no admission fee|入場無料/i.test(
          admission.basis,
        )
      ) {
        push(
          "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_EVIDENCE",
          "verified_free admission requires KAI-214 free evidence in basis (FREE_ENTRY / free area / no admission fee — not a bare word match)",
        );
      }
      // KAI-218A round-3: verified_free carries the same fixed freshness
      // contract as verified_paid — sourceUrls + checkedAt are REQUIRED.
      if (
        !admission.sourceUrls ||
        admission.sourceUrls.length === 0 ||
        !admission.checkedAt
      ) {
        push(
          "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_PROVENANCE",
          "verified_free admission requires at least one sourceUrl and a checkedAt date (fixed freshness contract)",
        );
      }
    }
    // documented_estimate requires model provenance + a VALID bounded or
    // open_ended cost (shared fail-closed numeric validator).
    if (admission.state === "documented_estimate") {
      if (admission.provenance !== "model") {
        push(
          "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_REQUIRES_MODEL",
          "documented_estimate admission requires provenance 'model'",
        );
      }
      if (!isValidBoundedCost(cost) && !isValidOpenEndedCost(cost)) {
        push(
          "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_COST",
          "documented_estimate admission must be a valid bounded [min>=0, max>=min] or open_ended [from>=0] cost",
        );
      }
    }
    // variable_price requires reasonCode. The cost may be:
    //   - a VERIFIED OFFICIAL BOUNDED range (e.g. ¥2,000–3,500 published by
    //     the attraction; applies to the selected date/product) — allowed
    //     ONLY with verified_source provenance + sourceUrls + checkedAt
    //     (fixed freshness contract), so a fabricated/legacy bounded guess
    //     can never ride the variable_price state;
    //   - open_ended {from} (validated by the shared validator) or variable.
    if (admission.state === "variable_price") {
      const costKind = cost?.kind;
      if (
        costKind !== "open_ended" &&
        costKind !== "variable" &&
        costKind !== "bounded"
      ) {
        push(
          "KAI218_ADMISSION_VARIABLE_INVALID_COST",
          "variable_price admission must be bounded, open_ended or variable",
        );
      }
      if (costKind === "open_ended" && !isValidOpenEndedCost(cost)) {
        push(
          "KAI218_ADMISSION_VARIABLE_INVALID_FROM",
          "variable_price open_ended cost requires a finite non-negative 'from'",
        );
      }
      if (
        costKind === "bounded" &&
        (!isValidBoundedCost(cost) ||
          admission.provenance !== "verified_source" ||
          !admission.sourceUrls ||
          admission.sourceUrls.length === 0 ||
          !admission.checkedAt)
      ) {
        push(
          "KAI218_ADMISSION_VARIABLE_BOUNDED_REQUIRES_SOURCE",
          "variable_price bounded cost requires a valid [min>=0,max>=min] range + verified_source provenance + sourceUrl + checkedAt (an official verified range, not a fabricated guess)",
        );
      }
      if (!admission.reasonCode) {
        push(
          "KAI218_ADMISSION_VARIABLE_REQUIRES_REASON",
          "variable_price admission requires a reasonCode",
        );
      }
    }
    // not_applicable requires reasonCode + not_applicable cost.
    if (admission.state === "not_applicable") {
      if (cost?.kind !== "not_applicable") {
        push(
          "KAI218_ADMISSION_NOT_APPLICABLE_COST",
          "not_applicable admission requires a not_applicable cost",
        );
      }
      if (!admission.reasonCode) {
        push(
          "KAI218_ADMISSION_NOT_APPLICABLE_REQUIRES_REASON",
          "not_applicable admission requires a reasonCode (hub_budget_not_applicable / no_single_admission_product / free_area_with_optional_paid_components)",
        );
      }
    }
    // unavailable requires reasonCode + unavailable cost.
    if (admission.state === "unavailable") {
      if (cost?.kind !== "unavailable") {
        push(
          "KAI218_ADMISSION_UNAVAILABLE_COST",
          "unavailable admission requires an unavailable cost",
        );
      }
      if (!admission.reasonCode) {
        push(
          "KAI218_ADMISSION_UNAVAILABLE_REQUIRES_REASON",
          "unavailable admission requires a reasonCode",
        );
      }
    }
    // KAI-218A round-2 drift guard: when BOTH the admission fact and the
    // legacy budgetBreakdown.tickets exist, compare DISTANCE-TO-RANGE, not
    // the min bound. A legacy ticket WITHIN [min,max] is NOT drift — only a
    // ticket outside the range by more than the documented tolerance is.
    if (
      dest.budgetBreakdown?.tickets !== undefined &&
      (admission.state === "verified_paid" ||
        admission.state === "verified_free") &&
      isValidBoundedCost(cost)
    ) {
      const tickets = dest.budgetBreakdown.tickets;
      const factMin = cost.min as number;
      const factMax = cost.max as number;
      // Distance to the range: 0 when inside, else the gap to the nearer
      // bound.
      const distanceToRange =
        tickets < factMin
          ? factMin - tickets
          : tickets > factMax
            ? tickets - factMax
            : 0;
      if (distanceToRange > 100) {
        push(
          "KAI218_ADMISSION_LEGACY_DRIFT",
          `legacy budgetBreakdown.tickets (¥${tickets}) drifts >¥100 outside the admission fact range [¥${factMin}, ¥${factMax}] — reconcile the two truths`,
        );
      }
    }
    // Freshness: a verified fact with a stale checkedAt is review-due —
    // never silently refreshed or discarded. Applies to verified_paid,
    // verified_free, and verified official bounded variable_price.
    if (
      (admission.state === "verified_paid" ||
        admission.state === "verified_free" ||
        (admission.state === "variable_price" && cost?.kind === "bounded")) &&
      admission.checkedAt
    ) {
      const intervalMonths = admission.reviewIntervalMonths ?? 12;
      if (!Number.isFinite(intervalMonths) || intervalMonths <= 0) {
        push(
          "KAI218_ADMISSION_INVALID_REVIEW_INTERVAL",
          "reviewIntervalMonths must be a positive finite number",
        );
      }
      const checked = new Date(admission.checkedAt).getTime();
      if (
        !Number.isFinite(checked) ||
        !isStrictCalendarDate(admission.checkedAt)
      ) {
        push(
          "KAI218_ADMISSION_INVALID_CHECKED_AT",
          `checkedAt '${admission.checkedAt}' is not a valid YYYY-MM-DD calendar date`,
        );
      }
    }
  }

  // ---- KAI-218A: scoped required-local-transport fact invariants ----
  const localTransport = dest.localTransport;
  if (localTransport) {
    switch (localTransport.kind) {
      case "verified_required_access": {
        if (
          localTransport.fare.length !== 2 ||
          !finiteNonNegative(localTransport.fare[0]) ||
          !finiteNonNegative(localTransport.fare[1]) ||
          localTransport.fare[0] > localTransport.fare[1]
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_INVALID_FARE",
            "verified_required_access requires a valid [min,max] fare",
          );
        }
        // KAI-219A contract (Fix 1): numeric local-transport facts REQUIRE
        // an explicit fareBasis + coverage — no silent "one-way but
        // charged once" default, and a partial segment must never behave
        // as the complete required-local-transport component.
        if (
          localTransport.fareBasis !== "one_way" &&
          localTransport.fareBasis !== "round_trip" &&
          localTransport.fareBasis !== "required_access_total"
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_FARE_BASIS",
            "verified_required_access requires fareBasis (one_way | round_trip | required_access_total)",
          );
        }
        if (
          localTransport.coverage !== "all_required_access" &&
          localTransport.coverage !== "segment_only"
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_COVERAGE",
            "verified_required_access requires coverage (all_required_access | segment_only)",
          );
        }
        if (
          !localTransport.sourceUrls ||
          localTransport.sourceUrls.length === 0
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_SOURCE",
            "verified_required_access requires at least one sourceUrl",
          );
        }
        if (!localTransport.basis || localTransport.basis.trim() === "") {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_BASIS",
            "verified_required_access requires destination-specific basis evidence (which station/stop/segments serve THIS destination) — a generic city allowance is forbidden",
          );
        }
        // KAI-218A round-2: the fixed freshness contract applies to
        // explicitly-verified local facts too.
        if (!localTransport.checkedAt) {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_CHECKED_AT",
            "verified_required_access requires a checkedAt date (fixed freshness contract)",
          );
        }
        // KAI-218A round-3: positive/default-12-month review interval +
        // real-date validation, consistent with the admission freshness
        // contract.
        const ltIntervalMonths = localTransport.reviewIntervalMonths ?? 12;
        if (!Number.isFinite(ltIntervalMonths) || ltIntervalMonths <= 0) {
          push(
            "KAI218_LOCAL_TRANSPORT_INVALID_REVIEW_INTERVAL",
            "reviewIntervalMonths must be a positive finite number (default 12)",
          );
        }
        if (localTransport.checkedAt) {
          const ltChecked = new Date(localTransport.checkedAt).getTime();
          if (
            !Number.isFinite(ltChecked) ||
            !isStrictCalendarDate(localTransport.checkedAt)
          ) {
            push(
              "KAI218_LOCAL_TRANSPORT_INVALID_CHECKED_AT",
              `checkedAt '${localTransport.checkedAt}' is not a valid YYYY-MM-DD calendar date`,
            );
          }
        }
        break;
      }
      case "bounded_defensible_access": {
        if (
          localTransport.fare.length !== 2 ||
          !finiteNonNegative(localTransport.fare[0]) ||
          !finiteNonNegative(localTransport.fare[1]) ||
          localTransport.fare[0] > localTransport.fare[1]
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_INVALID_FARE",
            "bounded_defensible_access requires a valid [min,max] fare",
          );
        }
        // KAI-219A contract (Fix 1): explicit fareBasis + coverage.
        if (
          localTransport.fareBasis !== "one_way" &&
          localTransport.fareBasis !== "round_trip" &&
          localTransport.fareBasis !== "required_access_total"
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_FARE_BASIS",
            "bounded_defensible_access requires fareBasis (one_way | round_trip | required_access_total)",
          );
        }
        if (
          localTransport.coverage !== "all_required_access" &&
          localTransport.coverage !== "segment_only"
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_REQUIRES_COVERAGE",
            "bounded_defensible_access requires coverage (all_required_access | segment_only)",
          );
        }
        if (
          !Number.isFinite(localTransport.distanceKm) ||
          localTransport.distanceKm < 0
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_INVALID_DISTANCE",
            "bounded_defensible_access requires a finite non-negative distanceKm",
          );
        }
        if (
          !localTransport.sourceUrls ||
          localTransport.sourceUrls.length === 0
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_BOUNDED_REQUIRES_SOURCE",
            "bounded_defensible_access requires at least one operator sourceUrl",
          );
        }
        break;
      }
      case "verified_walking": {
        // KAI-218: verified walking ¥0 requires EVIDENCE of practical
        // walking — a bare 0 without walking evidence is forbidden.
        if (
          !localTransport.walkingEvidence ||
          localTransport.walkingEvidence.trim() === ""
        ) {
          push(
            "KAI218_LOCAL_TRANSPORT_WALKING_REQUIRES_EVIDENCE",
            "verified_walking requires explicit walkingEvidence (bare 0 is forbidden)",
          );
        }
        break;
      }
      case "unavailable": {
        // The unavailable reason union is exhaustive; the detail is required.
        if (!localTransport.detail || localTransport.detail.trim() === "") {
          push(
            "KAI218_LOCAL_TRANSPORT_UNAVAILABLE_REQUIRES_DETAIL",
            "unavailable local transport requires a detail explanation",
          );
        }
        break;
      }
      case "not_applicable": {
        if (!localTransport.reason || localTransport.reason.trim() === "") {
          push(
            "KAI218_LOCAL_TRANSPORT_NOT_APPLICABLE_REQUIRES_REASON",
            "not_applicable local transport requires a reason",
          );
        }
        break;
      }
    }
  }
  if (dest.status === "published" && !dest.imageMetadata) {
    push("MISSING_IMAGE_METADATA", "published record lacks imageMetadata");
  }
  // An imageMetadata object is NOT provenance when the attribution is
  // explicitly unverified or the sourceUrl is the generic Unsplash site
  // root (KAI-87 PR 5 marked 23 Unsplash heroes unresolved pending API
  // lookup; a CDN delivery URL is not provenance either).
  const meta = dest.imageMetadata;
  if (
    meta &&
    (meta.sourceUrl === "https://unsplash.com" ||
      /^Unverified/.test(meta.attribution ?? ""))
  ) {
    push(
      "UNRESOLVED_IMAGE_ATTRIBUTION",
      "imageMetadata exists but attribution is explicitly unverified (Unsplash API lookup pending)",
    );
  }

  // ---- G11: walkingMin sanity ----
  const visitMaxMin = dest.recommendedVisitHours
    ? dest.recommendedVisitHours.max * 60
    : null;
  if (visitMaxMin !== null && dest.walkingMin > visitMaxMin) {
    push(
      "WALKING_MIN_IMPLAUSIBLE",
      `walkingMin (${dest.walkingMin}) exceeds recommendedVisitHours.max×60 (${visitMaxMin})`,
    );
  }

  // ---- G6: coarse grid + low-res hero + license host ----
  if (
    dest.coordinates &&
    isCoarseGrid(dest.coordinates.lat) &&
    isCoarseGrid(dest.coordinates.lng)
  ) {
    push(
      "COARSE_GRID_COORDS",
      "coordinates sit on a 0.1° grid (generator-rounded)",
    );
  }
  const heroPx = dest.heroImage?.match(/(\d+)px-/);
  if (heroPx && Number(heroPx[1]) < 500) {
    push("LOW_RES_HERO", `hero resolution ${heroPx[1]}px is below 500px`);
  }
  const heroHost = dest.heroImage?.includes("unsplash")
    ? "unsplash"
    : dest.heroImage?.includes("istock")
      ? "istock"
      : null;
  if (heroHost && /wikimedia/i.test(dest.imageMetadata?.source ?? "")) {
    push(
      "HERO_LICENSE_HOST_MISMATCH",
      `${heroHost} hero claims Wikimedia attribution`,
    );
  }

  return issues;
}

export interface CollectionMembershipInfo {
  destinationId: string;
  sortOrder?: number;
  keys: string[];
  isString: boolean;
}

export function collectCollectionIssues(
  collections: Collection[],
  memberships: Map<string, CollectionMembershipInfo[]>,
): Array<DataQualityIssue & { targetId: string }> {
  const issues: Array<DataQualityIssue & { targetId: string }> = [];
  for (const [cid, list] of memberships) {
    const seen = new Map<number, string>();
    for (const m of list) {
      if (m.isString) {
        issues.push({
          code: "COLLECTION_MEMBERSHIP_SHAPE",
          message: `collection ${cid}: membership is a bare string`,
          targetId: m.destinationId,
        });
        continue;
      }
      const unknown = m.keys.filter((k) => !COLLECTION_MEMBERSHIP_KEYS.has(k));
      if (unknown.length) {
        issues.push({
          code: "COLLECTION_MEMBERSHIP_SHAPE",
          message: `collection ${cid}: membership has unknown keys: ${unknown.join(",")}`,
          targetId: m.destinationId,
        });
      }
      if (m.sortOrder === undefined) continue;
      if (seen.has(m.sortOrder)) {
        issues.push({
          code: "COLLECTION_SORTORDER_COLLISION",
          message: `collection ${cid}: sortOrder ${m.sortOrder} used by ${seen.get(m.sortOrder)} and ${m.destinationId}`,
          targetId: m.destinationId,
        });
      } else {
        seen.set(m.sortOrder, m.destinationId);
      }
    }
  }
  for (const collection of collections) {
    const expected = collection.metadata?.expectedMembers;
    const actual = memberships.get(collection.id)?.length ?? 0;
    if (expected !== undefined && expected !== actual) {
      issues.push({
        code: "COLLECTION_COUNT_MISMATCH",
        message: `collection ${collection.id} has ${actual} members, expectedMembers ${expected}`,
        targetId: collection.id,
      });
    }
  }
  return issues;
}

export function buildMembershipMap(
  destinations: Destination[],
): Map<string, CollectionMembershipInfo[]> {
  const map = new Map<string, CollectionMembershipInfo[]>();
  for (const d of destinations) {
    for (const m of d.collections ?? []) {
      if (typeof m === "string") {
        const list = map.get(m) ?? [];
        list.push({ destinationId: d.id, keys: ["string"], isString: true });
        map.set(m, list);
      } else {
        const list = map.get(m.collectionId) ?? [];
        list.push({
          destinationId: d.id,
          sortOrder: m.sortOrder,
          keys: Object.keys(m),
          isString: false,
        });
        map.set(m.collectionId, list);
      }
    }
  }
  return map;
}

export function collectTransportClusters(
  destinations: Destination[],
  minCluster = 3,
): Array<DataQualityIssue & { targetId: string }> {
  const cluster = new Map<string, string[]>();
  for (const d of destinations) {
    const key = JSON.stringify(d.transportOptions ?? {});
    if (key === "{}") continue;
    const list = cluster.get(key) ?? [];
    list.push(d.id);
    cluster.set(key, list);
  }
  const issues: Array<DataQualityIssue & { targetId: string }> = [];
  const reported = new Set<string>();
  for (const [key, ids] of cluster) {
    if (ids.length >= minCluster && !reported.has(key)) {
      reported.add(key);
      issues.push({
        code: "TEMPLATE_TRANSPORT_CLUSTER",
        message: `Identical transportOptions shared by ${ids.length} records (${ids.slice(0, 5).join(", ")}…) — templated batch value`,
        targetId: ids[0],
      });
    }
  }
  return issues;
}
