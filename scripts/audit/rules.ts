/**
 * Audit rule functions for the v1.9.5 expansion audit.
 *
 * Each exported function checks one class of finding.
 * Functions are pure (they do not mutate the destination object) and return
 * zero or more ExpansionAuditFinding values.
 *
 * Rules are extracted here so they can be unit-tested independently of the
 * CLI entrypoint (audit-v192-expansion-data.ts).
 */

import type { Destination } from "../../src/shared/types/destination.js";
import {
  type ExpansionAuditFinding,
  type AuditSeverity,
  SEVERITY_RANK,
} from "./types.js";

// ---------------------------------------------------------------------------
// RULE-001 — Localization parity (canonical category → Japanese mapping)
// ---------------------------------------------------------------------------

/**
 * Canonical mapping from English category label to its Japanese equivalent.
 * Only categories present in this map are checked. An English category that
 * has no mapping entry is silently skipped (not flagged as a mismatch).
 */
export const CATEGORY_JA_MAP: Record<string, string> = {
  Aquarium: "水族館",
  Culture: "文化",
  Food: "グルメ",
  History: "歴史",
  Market: "市場",
  Museum: "博物館",
  Nature: "自然",
  Shopping: "ショッピング",
  "Theme Park": "テーマパーク",
  Viewpoint: "展望",
};

/**
 * RULE-001: Japanese highlights must be canonical translations of the English
 * categories, not literal copies of English strings.
 */
export function checkLocalizationParity(
  dest: Destination,
): ExpansionAuditFinding[] {
  const jaHighlights = dest.content?.ja?.highlights ?? [];
  const categories = dest.categories ?? [];

  const mismatches: string[] = [];
  for (const category of categories) {
    const expected = CATEGORY_JA_MAP[category];
    if (expected && !jaHighlights.includes(expected)) {
      mismatches.push(`${category} → expected "${expected}"`);
    }
  }

  if (mismatches.length === 0) return [];

  return [
    {
      code: "LOCALIZATION_PARITY_MISMATCH",
      severity: "warning",
      destinationId: dest.id,
      hubId: dest.relationships?.parentDestinationId,
      fieldPaths: ["content.ja.highlights", "categories"],
      message: `Japanese highlights are missing canonical translations: ${mismatches.join("; ")}`,
      evidence: { jaHighlights, categories },
      suggestedAction:
        "Update content.ja.highlights to use canonical Japanese category translations",
      autoFixable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// RULE-002 — Transport estimate thresholds
// ---------------------------------------------------------------------------

/** Configurable thresholds (minutes). Values above these are suspicious. */
export const TRANSPORT_THRESHOLDS = {
  train: 120,
  shinkansen: 180,
  bus: 240,
} as const;

/**
 * RULE-002: Flag transport estimates that are implausibly large for a
 * destination within Japan when accessed from a major city.
 */
export function checkTransportEstimates(
  dest: Destination,
): ExpansionAuditFinding[] {
  const findings: ExpansionAuditFinding[] = [];
  const opts = dest.transportOptions ?? {};

  for (const [mode, threshold] of Object.entries(TRANSPORT_THRESHOLDS) as [
    keyof typeof TRANSPORT_THRESHOLDS,
    number,
  ][]) {
    const value = opts[mode as keyof typeof opts];
    if (typeof value === "number" && value > threshold) {
      findings.push({
        code: "TRANSPORT_ESTIMATE_SUSPICIOUS",
        severity: "warning",
        destinationId: dest.id,
        hubId: dest.relationships?.parentDestinationId,
        fieldPaths: [`transportOptions.${mode}`],
        message: `${mode} estimate of ${value} min exceeds threshold of ${threshold} min`,
        evidence: { mode, value, threshold },
        suggestedAction: `Verify the ${mode} travel time with an official source and correct if inaccurate`,
        autoFixable: false,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// RULE-003 — Rain consistency
// ---------------------------------------------------------------------------

/**
 * RULE-003: ratings.rain ≥ 8 (high rain suitability) must not contradict
 * comfort.rainFriendly ≤ 3 or indoorPercent ≤ 20.
 */
export function checkRainConsistency(
  dest: Destination,
): ExpansionAuditFinding[] {
  const rain = dest.ratings?.rain;
  const rainFriendly = dest.comfort?.rainFriendly;
  const indoorPercent = dest.indoorPercent;
  const weatherDependence = dest.weatherDependence;

  const contradictions: string[] = [];

  if (typeof rain === "number" && rain >= 8) {
    if (typeof rainFriendly === "number" && rainFriendly <= 3) {
      contradictions.push(
        `ratings.rain=${rain} (high) conflicts with comfort.rainFriendly=${rainFriendly} (low)`,
      );
    }
    if (typeof indoorPercent === "number" && indoorPercent <= 20) {
      contradictions.push(
        `ratings.rain=${rain} (high) conflicts with indoorPercent=${indoorPercent}% (very outdoor)`,
      );
    }
    if (weatherDependence === "high") {
      contradictions.push(
        `ratings.rain=${rain} (high) conflicts with weatherDependence="high"`,
      );
    }
  }

  if (contradictions.length === 0) return [];

  return [
    {
      code: "RAIN_DATA_CONFLICT",
      severity: "warning",
      destinationId: dest.id,
      hubId: dest.relationships?.parentDestinationId,
      fieldPaths: [
        "ratings.rain",
        "comfort.rainFriendly",
        "indoorPercent",
        "weatherDependence",
      ],
      message: `Rain suitability data is contradictory: ${contradictions.join("; ")}`,
      evidence: { rain, rainFriendly, indoorPercent, weatherDependence },
      suggestedAction:
        "Align ratings.rain, comfort.rainFriendly, indoorPercent, and weatherDependence to reflect the same level of rain suitability",
      autoFixable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// RULE-004 — Admission cost consistency (bidirectional)
// ---------------------------------------------------------------------------

/** Kinds that are typically free-admission public spaces. */
const FREE_KINDS = new Set([
  "district",
  "market",
  "shopping",
  "street",
  "beach",
  "park",
  "mountain",
  "waterfall",
  "island",
]);

/** Kinds that are typically paid venues. */
const PAID_KINDS = new Set([
  "museum",
  "aquarium",
  "tower",
  "castle",
  "zoo",
  "garden",
]);

/**
 * RULE-004: Check both directions of admission cost consistency.
 * - Free-form public places should not have a positive ticket budget.
 * - Paid venues should not have zero ticket budget.
 */
export function checkAdmissionCost(dest: Destination): ExpansionAuditFinding[] {
  const findings: ExpansionAuditFinding[] = [];
  const kind = dest.kind ?? "";
  const tickets = dest.budgetBreakdown?.tickets;

  if (FREE_KINDS.has(kind) && typeof tickets === "number" && tickets > 0) {
    findings.push({
      code: "FREE_PLACE_TICKET_COST",
      severity: "warning",
      destinationId: dest.id,
      hubId: dest.relationships?.parentDestinationId,
      fieldPaths: ["budgetBreakdown.tickets", "kind"],
      message: `kind="${kind}" is typically free-admission but has budgetBreakdown.tickets=¥${tickets}`,
      evidence: { kind, tickets },
      suggestedAction:
        "Set budgetBreakdown.tickets=0 or verify that this location genuinely charges admission",
      autoFixable: true,
    });
  }

  if (
    PAID_KINDS.has(kind) &&
    (tickets === 0 || tickets === undefined || tickets === null)
  ) {
    findings.push({
      code: "PAID_VENUE_ZERO_TICKET_COST",
      severity: "warning",
      destinationId: dest.id,
      hubId: dest.relationships?.parentDestinationId,
      fieldPaths: ["budgetBreakdown.tickets", "kind"],
      message: `kind="${kind}" is typically a paid venue but has budgetBreakdown.tickets=0 or missing`,
      evidence: { kind, tickets: tickets ?? null },
      suggestedAction:
        "Add the correct admission fee to budgetBreakdown.tickets from an official source",
      autoFixable: false,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// RULE-005 — Kind / category compatibility
// ---------------------------------------------------------------------------

/**
 * Expected primary category for each kind value.
 * kind="park" is a special case — if it has "Theme Park" in categories it is
 * expected; otherwise "Nature" is expected.
 */
export const EXPECTED_CATEGORY_BY_KIND: Partial<Record<string, string>> = {
  aquarium: "Aquarium",
  beach: "Nature",
  castle: "History",
  garden: "Nature",
  market: "Food",
  mountain: "Nature",
  museum: "Museum",
  park: "Nature",
  shrine: "History",
  shopping: "Shopping",
  temple: "History",
  tower: "Viewpoint",
  waterfall: "Nature",
  zoo: "Nature",
};

/**
 * RULE-005: A destination's kind must be compatible with its primary category.
 * No values are modified — only a finding is emitted.
 */
export function checkKindCategoryCompatibility(
  dest: Destination,
): ExpansionAuditFinding[] {
  const kind = dest.kind ?? "";
  const categories = dest.categories ?? [];

  // Theme-park exception: kind="park" with "Theme Park" category is valid.
  if (kind === "park" && categories.includes("Theme Park")) return [];

  const expected = EXPECTED_CATEGORY_BY_KIND[kind];
  if (!expected) return []; // No rule for this kind.
  if (categories.includes(expected)) return []; // Compatible.

  return [
    {
      code: "KIND_CATEGORY_MISMATCH",
      severity: "warning",
      destinationId: dest.id,
      hubId: dest.relationships?.parentDestinationId,
      fieldPaths: ["kind", "categories"],
      message: `kind="${kind}" requires category "${expected}" but categories are [${categories.join(", ")}]`,
      evidence: { kind, categories, expected },
      suggestedAction: `Add "${expected}" to the categories array or correct the kind value`,
      autoFixable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// RULE-006 — Parent geography review
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Maximum distance from parent hub coordinates before flagging (km). */
export const PARENT_DISTANCE_THRESHOLD_KM = 80;

/**
 * RULE-006: Flag destinations whose coordinates are implausibly far from
 * their parent hub's coordinates. Requires a hubById lookup map.
 */
export function checkParentGeography(
  dest: Destination,
  hubById: Map<string, Destination>,
): ExpansionAuditFinding[] {
  const parentId = dest.relationships?.parentDestinationId;
  if (!parentId) return [];

  const hub = hubById.get(parentId);
  if (!hub?.coordinates || !dest.coordinates) return [];

  const distKm = haversineKm(
    hub.coordinates.lat,
    hub.coordinates.lng,
    dest.coordinates.lat,
    dest.coordinates.lng,
  );

  if (distKm <= PARENT_DISTANCE_THRESHOLD_KM) return [];

  return [
    {
      code: "PARENT_GEOGRAPHY_REVIEW",
      severity: "warning",
      destinationId: dest.id,
      hubId: parentId,
      fieldPaths: ["coordinates", "relationships.parentDestinationId"],
      message: `${dest.id} is ${Math.round(distKm)} km from parent hub ${parentId} (threshold: ${PARENT_DISTANCE_THRESHOLD_KM} km)`,
      evidence: {
        destinationCoords: dest.coordinates,
        hubCoords: hub.coordinates,
        distanceKm: Math.round(distKm),
        threshold: PARENT_DISTANCE_THRESHOLD_KM,
      },
      suggestedAction:
        "Verify the parent hub assignment or confirm this is a legitimate long-distance relationship",
      autoFixable: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// RULE-007 — Rating quality signals
// ---------------------------------------------------------------------------

const REQUIRED_RATING_KEYS = [
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

/**
 * RULE-007: Detect suspicious rating patterns:
 * - All required fields carry the same value (uniform precision).
 * - Check for duplicate vectors is done at the hub level in the orchestrator.
 */
export function checkRatingQuality(dest: Destination): ExpansionAuditFinding[] {
  const findings: ExpansionAuditFinding[] = [];
  const ratings = dest.ratings;
  if (!ratings) return findings;

  const values = REQUIRED_RATING_KEYS.map((k) => ratings[k]).filter(
    (v): v is number => typeof v === "number",
  );

  if (values.length === REQUIRED_RATING_KEYS.length) {
    const unique = new Set(values);
    if (unique.size === 1) {
      findings.push({
        code: "SUSPICIOUS_RATING_PRECISION",
        severity: "warning",
        destinationId: dest.id,
        hubId: dest.relationships?.parentDestinationId,
        fieldPaths: ["ratings"],
        message: `All ${REQUIRED_RATING_KEYS.length} rating fields have the same value (${values[0]})`,
        evidence: { uniformValue: values[0] },
        suggestedAction:
          "Review ratings individually; uniform values suggest a template was not customised",
        autoFixable: false,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// RULE-008 — Description quality (should)
// ---------------------------------------------------------------------------

/** Patterns that suggest a raw template or encyclopaedia fragment. */
const STUB_PATTERNS = [
  /^[A-Z][a-z]+ is an? [a-z]+ (in|located in|situated in)/,
  /is located in (the )?(city|prefecture|ward) of/i,
  /\.\.\.$/, // trailing ellipsis — truncated
];

/**
 * RULE-008 (should): Flag descriptions that appear to be raw stubs.
 * Does not rewrite descriptions — findings only.
 */
export function checkDescriptionQuality(
  dest: Destination,
): ExpansionAuditFinding[] {
  const description = dest.content?.en?.description ?? dest.description ?? "";
  if (!description) return [];

  for (const pattern of STUB_PATTERNS) {
    if (pattern.test(description)) {
      return [
        {
          code: "DESCRIPTION_QUALITY",
          severity: "info",
          destinationId: dest.id,
          hubId: dest.relationships?.parentDestinationId,
          fieldPaths: ["content.en.description", "description"],
          message:
            "Description matches a stub or encyclopaedia-fragment pattern",
          evidence: {
            pattern: pattern.toString(),
            preview: description.slice(0, 100),
          },
          suggestedAction:
            "Rewrite the description to be experiential and visitor-focused",
          autoFixable: false,
        },
      ];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// RULE: Duplicate audit history
// ---------------------------------------------------------------------------

/**
 * AUD-004 / existing validator parity: Detect duplicate editorial change entries.
 */
export function checkDuplicateAuditHistory(
  dest: Destination,
): ExpansionAuditFinding[] {
  const changes = dest.editorial?.changes ?? [];
  const seen = new Map<string, number>();

  for (const change of changes) {
    const key = `${change.changedAt}::${change.summary}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  if (duplicates.length === 0) return [];

  return [
    {
      code: "DUPLICATE_AUDIT_HISTORY",
      severity: "warning",
      destinationId: dest.id,
      hubId: dest.relationships?.parentDestinationId,
      fieldPaths: ["editorial.changes"],
      message: `editorial.changes has ${duplicates.length} duplicate entr${duplicates.length === 1 ? "y" : "ies"}`,
      evidence: { duplicates },
      suggestedAction:
        "Deduplicate editorial.changes by (changedAt, summary) composite key",
      autoFixable: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// RULE: Invalid enum values
// ---------------------------------------------------------------------------

const ALLOWED_WEATHER_DEPENDENCE = new Set(["low", "moderate", "high"]);
const ALLOWED_EDITORIAL_LIFECYCLE = new Set([
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
]);
const ALLOWED_EDITORIAL_FRESHNESS = new Set([
  "fresh",
  "aging",
  "stale",
  "unverified",
  "review_due",
]);
const ALLOWED_RATING_CONFIDENCE = new Set(["low", "medium", "high"]);
const ALLOWED_RATING_METHOD = new Set(["assisted", "manual", "calculated"]);
const ALLOWED_ROLE = new Set(["hub", "poi", "standalone"]);
const ALLOWED_PLACE_TYPE = new Set(["hub", "destination"]);
const ALLOWED_STATUS = new Set(["published", "beta", "draft", "deprecated"]);

/**
 * AUD-004: Validate canonical enum values for destination fields.
 */
export function checkEnumValues(dest: Destination): ExpansionAuditFinding[] {
  const findings: ExpansionAuditFinding[] = [];
  const addFinding = (
    fieldPath: string,
    value: unknown,
    allowed: Set<string>,
  ) => {
    if (typeof value === "string" && !allowed.has(value)) {
      findings.push({
        code: "INVALID_ENUM_VALUE",
        severity: "warning",
        destinationId: dest.id,
        hubId: dest.relationships?.parentDestinationId,
        fieldPaths: [fieldPath],
        message: `Field ${fieldPath} has invalid enum value "${value}". Allowed: [${[...allowed].join(", ")}]`,
        evidence: { value, allowed: [...allowed] },
        suggestedAction: `Correct ${fieldPath} to be one of the allowed enum values.`,
        autoFixable: false,
      });
    }
  };

  if (dest.weatherDependence)
    addFinding(
      "weatherDependence",
      dest.weatherDependence,
      ALLOWED_WEATHER_DEPENDENCE,
    );
  if (dest.editorial?.lifecycle)
    addFinding(
      "editorial.lifecycle",
      dest.editorial.lifecycle,
      ALLOWED_EDITORIAL_LIFECYCLE,
    );
  if (dest.editorial?.freshness)
    addFinding(
      "editorial.freshness",
      dest.editorial.freshness,
      ALLOWED_EDITORIAL_FRESHNESS,
    );
  if (dest.ratingMetadata?.confidence)
    addFinding(
      "ratingMetadata.confidence",
      dest.ratingMetadata.confidence,
      ALLOWED_RATING_CONFIDENCE,
    );
  if (dest.ratingMetadata?.method)
    addFinding(
      "ratingMetadata.method",
      dest.ratingMetadata.method,
      ALLOWED_RATING_METHOD,
    );
  if (dest.role) addFinding("role", dest.role, ALLOWED_ROLE);
  if (dest.placeType)
    addFinding("placeType", dest.placeType, ALLOWED_PLACE_TYPE);
  if (dest.status) addFinding("status", dest.status, ALLOWED_STATUS);

  return findings;
}

// ---------------------------------------------------------------------------
// RULE: Area assignment review
// ---------------------------------------------------------------------------

import { CITY_AREAS } from "../../src/shared/data/cityAreas.js";
const CITY_AREA_MAP = new Map(CITY_AREAS.map((a) => [a.id, a]));

/**
 * AUD-004: Verify areaId consistency with parent hub.
 */
export function checkAreaAssignment(
  dest: Destination,
): ExpansionAuditFinding[] {
  if (!dest.areaId) return [];

  const area = CITY_AREA_MAP.get(dest.areaId);
  const parentId = dest.relationships?.parentDestinationId;

  if (!area) {
    return [
      {
        code: "AREA_ASSIGNMENT_REVIEW",
        severity: "warning",
        destinationId: dest.id,
        hubId: parentId,
        fieldPaths: ["areaId"],
        message: `areaId "${dest.areaId}" is not a recognized CityArea ID`,
        evidence: { areaId: dest.areaId },
        suggestedAction:
          "Assign a valid areaId from CITY_AREAS or remove the property",
        autoFixable: false,
      },
    ];
  }

  if (parentId && area.parentDestinationId !== parentId) {
    return [
      {
        code: "AREA_ASSIGNMENT_REVIEW",
        severity: "warning",
        destinationId: dest.id,
        hubId: parentId,
        fieldPaths: ["areaId", "relationships.parentDestinationId"],
        message: `areaId "${dest.areaId}" belongs to parent hub "${area.parentDestinationId}", but destination parent is "${parentId}"`,
        evidence: {
          areaId: dest.areaId,
          areaHub: area.parentDestinationId,
          destHub: parentId,
        },
        suggestedAction:
          "Re-align areaId with the correct parent hub or update parentDestinationId",
        autoFixable: false,
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// RULE: Duplicate rating vectors (hub-level)
// ---------------------------------------------------------------------------

/**
 * RULE-007: Detect duplicate required-rating vectors among child destinations of the same hub.
 */
export function findDuplicateRatingVectors(
  destinations: Destination[],
): ExpansionAuditFinding[] {
  const findings: ExpansionAuditFinding[] = [];
  const byHub = new Map<string, Destination[]>();

  for (const destination of destinations) {
    const hubId = destination.relationships?.parentDestinationId;
    if (!hubId) continue;
    const entries = byHub.get(hubId) ?? [];
    entries.push(destination);
    byHub.set(hubId, entries);
  }

  for (const [hubId, children] of byHub) {
    const seen = new Map<string, string>();

    for (const child of children) {
      if (!child.ratings) continue;
      const vector = REQUIRED_RATING_KEYS.map(
        (key) => child.ratings?.[key],
      ).join("|");

      const previousId = seen.get(vector);
      if (previousId) {
        findings.push({
          code: "DUPLICATE_RATING_VECTOR",
          severity: "warning",
          destinationId: child.id,
          hubId,
          fieldPaths: REQUIRED_RATING_KEYS.map((key) => `ratings.${key}`),
          message: `${child.id} duplicates the required rating vector of ${previousId}`,
          evidence: { duplicateOf: previousId, vector },
          suggestedAction:
            "Review both rating profiles and replace mechanically duplicated values with destination-specific scores",
          autoFixable: false,
        });
      } else {
        seen.set(vector, child.id);
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the highest severity from a list of findings.
 * AUD-006: deterministic — ties resolved by code rank.
 */
export function computeHighestSeverity(
  findings: ExpansionAuditFinding[],
): AuditSeverity | "none" {
  if (findings.length === 0) return "none";
  return findings.reduce<AuditSeverity | "none">((best, f) => {
    if (best === "none") return f.severity;
    return SEVERITY_RANK[f.severity] < SEVERITY_RANK[best as AuditSeverity]
      ? f.severity
      : best;
  }, "none");
}

/**
 * Apply all rules to a single destination and return the findings array.
 * The destination object is never mutated.
 */
export function applyAllRules(
  dest: Destination,
  hubById: Map<string, Destination>,
): ExpansionAuditFinding[] {
  const cloned = structuredClone(dest); // guard against accidental mutation
  return [
    ...checkLocalizationParity(cloned),
    ...checkTransportEstimates(cloned),
    ...checkRainConsistency(cloned),
    ...checkAdmissionCost(cloned),
    ...checkKindCategoryCompatibility(cloned),
    ...checkParentGeography(cloned, hubById),
    ...checkRatingQuality(cloned),
    ...checkEnumValues(cloned),
    ...checkAreaAssignment(cloned),
    ...checkDescriptionQuality(cloned),
    ...checkDuplicateAuditHistory(cloned),
  ];
}
