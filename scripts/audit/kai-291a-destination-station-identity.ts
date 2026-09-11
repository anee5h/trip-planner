/**
 * KAI-291A — destination -> exact ODPT arrival-station identity coverage.
 *
 * Builds the geographic anchor registry for the TokyoMetro + Toei pilot, using the
 * EXISTING `odptStationIdentity` geographic evidence path. Two properties are the
 * whole point, and both are enforced structurally:
 *
 *  1. **Unique-within-bounded-radius is authorized; nearest-of-several is
 *     forbidden.** With a destination's coordinates and the pilot station index,
 *     the rule is exactly:
 *         exactly 1 candidate inside the tolerance  -> anchored
 *         0 candidates                              -> unavailable
 *         >1 candidates                             -> ambiguous
 *     Nothing selects the closest candidate, the first candidate, a popular
 *     station, a name-similar station, or a "main station", and nothing widens
 *     the radius until something matches.
 *
 *  2. **A geographic anchor is NOT a curated access mapping.** Its evidence path
 *     is `geographic` and it means only "under Meguruto's fixed geographic anchor
 *     policy, exactly one pilot ODPT station could be identified for this
 *     destination". It does NOT assert that the destination recommends that
 *     station, and it deliberately carries no claim about station -> POI access.
 *
 * Structural guarantees:
 *  - Only `coordinates` are passed into the resolver. Passing a name would enable
 *    name-based paths, and passing operator/railway would narrow a multi-candidate
 *    result by operator — so neither is passed, which is what keeps `>1` at
 *    `ambiguous`.
 *  - The tolerance is the EXISTING resolver default, imported rather than
 *    re-declared, so the policy cannot drift from the rest of the codebase.
 *  - The registry is a committed static artifact. Normal app use never calls the
 *    provider to learn a destination anchor.
 *  - Pure functions only: no network, no filesystem, no clock, no randomness.
 *    Loading and writing happen in the CLI section below.
 */
import type { OdptStation } from "../../src/shared/services/transport/OdptProvider";
import {
  distanceMeters,
  resolveOdptStationIdentity,
} from "../../src/shared/services/transport/odptStationIdentity";

/**
 * The tolerance used, in metres.
 *
 * It MIRRORS the existing resolver default (`DEFAULT_MAX_DISTANCE_METERS` in
 * `odptStationIdentity.ts`, which is module-private). There is ONE truth for the
 * decision: `classifyGeographicAnchor` passes this value explicitly as
 * `maxDistanceMeters` on EVERY `resolveOdptStationIdentity` call, so the shared
 * resolver and the reporting helper can never disagree about the radius. This
 * value is also recorded in the artifact for provenance and used to compute the
 * reporting histogram.
 *
 * The production/audit policy is fixed at 500 m. Tests pin the 499/501 boundary
 * and assert resolver/helper agreement at a non-default tolerance, so this
 * cannot silently drift away from the resolver's real policy.
 */
export const GEOGRAPHIC_TOLERANCE_METERS = 500;

/** The pilot operators KAI-291A covers. */
export const PILOT_OPERATORS: readonly string[] = Object.freeze([
  "odpt.Operator:TokyoMetro",
  "odpt.Operator:Toei",
]);

/**
 * Evidence path recorded on every geographic anchor.
 *
 * Deliberately NOT named `verified_access_station`, `official_arrival_station` or
 * `recommended_station`: those would claim the destination recommends this
 * station, which geography does not prove.
 */
export const ANCHOR_EVIDENCE_PATH = "geographic_unique_candidate";

/**
 * The mutually exclusive coverage-status model. The six geographic statuses plus
 * `canonical_explicit_station` partition every evaluated destination: with zero
 * canonical mappings today the six sum to the catalogue size; in the general
 * case six + canonical === destinationsEvaluated.
 */
export const ANCHOR_STATUS = Object.freeze({
  /** Exactly one exact pilot ODPT station inside the fixed tolerance. */
  GEOGRAPHIC_UNIQUE_CANDIDATE: "geographic_unique_candidate",
  /**
   * Rule 1: an explicit canonical station target. Stronger than geography and
   * therefore NOT part of the geographic partition — it is reported separately.
   */
  CANONICAL_EXPLICIT_STATION: "canonical_explicit_station",
  /** No pilot station inside the tolerance. Not a claim that none exists. */
  UNAVAILABLE: "unavailable",
  /** More than one pilot station inside the tolerance. Never broken by distance. */
  AMBIGUOUS: "ambiguous",
  /** The destination carries no coordinates, so the rule cannot run. */
  COORDINATES_ABSENT: "coordinates_absent",
  /**
   * A positive semantic decision that the destination's own coordinates do NOT
   * represent a localised visitor destination, so geographic derivation is forbidden.
   *
   * Deliberately NOT `not_anchorable`: it forbids deriving an anchor from an area's
   * representative coordinates, while a stronger explicit evidence path (rule 1)
   * may still anchor the same destination.
   */
  NOT_ANCHORABLE_BY_GEOGRAPHY: "not_anchorable_by_geography",
  /**
   * The record's semantics are not decidable from its own fields, so no decision is
   * taken. A REAL status: these records are excluded from every production-ready
   * anchor total and retained only with observational metadata.
   */
  HOLD_FOR_REVIEW: "hold_for_review",
});

/**
 * The six geographic statuses, in partition order. With zero canonical mappings
 * today their counts sum to the number of evaluated destinations; in the general
 * case they sum to (destinationsEvaluated - canonicalExplicitStation).
 */
export const STATUS_PARTITION: readonly string[] = Object.freeze([
  ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE,
  ANCHOR_STATUS.AMBIGUOUS,
  ANCHOR_STATUS.UNAVAILABLE,
  ANCHOR_STATUS.COORDINATES_ABSENT,
  ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY,
  ANCHOR_STATUS.HOLD_FOR_REVIEW,
]);

/**
 * Why a destination is not geography-anchorable. Reasons about COORDINATE
 * SEMANTICS, not about the geographic resolver, which is correct.
 */
export const ANCHORABILITY_REASONS = Object.freeze({
  HUB_ROLE: "hub_role",
  STANDALONE_REGIONAL_ROLE: "standalone_regional_role",
  ADMINISTRATIVE_OR_LOCALITY_KIND: "administrative_or_locality_kind",
});

/** Why a destination is held rather than decided. */
export const HOLD_REASONS = Object.freeze({
  DESTINATION_SEMANTICS_UNCLASSIFIED: "destination_semantics_unclassified",
  UNKNOWN_OR_LEGACY_ROLE: "unknown_or_legacy_role",
  /**
   * Rule 1 named an explicit station, but that station has no exact identity in
   * the reviewed pilot index — so the claim is unverifiable for this pilot.
   * Geography is NOT a fallback: the explicit mapping says where the
   * destination belongs, and a nearby Metro/Toei station would contradict it.
   */
  CANONICAL_STATION_NOT_IN_PILOT_INDEX: "canonical_station_not_in_pilot_index",
});

/**
 * The role values the catalogue schema DEFINES.
 *
 * Anything else is schema drift and is held for review (rule 8) rather than being
 * coerced into a known role. Notably `destination` appears in live catalogue data
 * and is NOT an alias of `poi`: the two have different semantics, so treating
 * `destination` as `poi` would silently widen the anchor set.
 */
export const KNOWN_DESTINATION_ROLES: readonly string[] = Object.freeze([
  "hub",
  "poi",
  "standalone",
]);

/** True for a role the schema does not define (drift), excluding a missing role. */
export function isUnknownOrLegacyRole(role: string | null): boolean {
  return role !== null && !KNOWN_DESTINATION_ROLES.includes(role);
}

/**
 * PROVISIONAL hard exclusions: kinds whose catalogue coordinate represents an
 * area/locality rather than a visitor entrance or station-access point.
 *
 * Deliberately NOT included: park, garden, mountain, lake, island, beach, market,
 * street, nature, natural, mixed. Those have physical extent but may still be
 * concrete visitable places; restricting them needs evidence, which the semantic
 * matrix provides rather than assuming.
 */
export const NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS: readonly string[] =
  Object.freeze([
    "city",
    "ward",
    "town",
    "village",
    "district",
    "historic_town",
  ]);

/** Reasons a geographic anchor could not be established. */
export const ANCHOR_BLOCKERS = Object.freeze([
  "destination_coordinates_absent",
  "no_pilot_station_within_tolerance",
  "multiple_pilot_stations_within_tolerance",
]);

/**
 * Evidence path for an anchor taken from explicit canonical station evidence
 * (rule 1). Stronger than geography, and the geographic gate is irrelevant to it.
 */
export const CANONICAL_EVIDENCE_PATH = "canonical_explicit_station";

/** Canonical-mapping fields a record may use to state an explicit station target. */
export const CANONICAL_MAPPING_FIELDS: readonly string[] = Object.freeze([
  "odptMapping",
  "canonicalMapping",
]);

/**
 * Keys inside a canonical mapping that can name the station target. Unrelated
 * mapping metadata (`operator`, `railway`, notes, …) is NOT station evidence.
 */
export const CANONICAL_MAPPING_STATION_KEYS: readonly string[] = Object.freeze([
  "station",
  "stationId",
  "odptStationId",
  "arrivalStation",
  "arrivalStationId",
  "alternateStation",
  "alternateStationId",
  "sameAs",
  "id",
]);

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.flatMap((entry) => collectStrings(entry));
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts explicit ODPT STATION targets from a record's canonical mapping.
 *
 * A mapping is station evidence only when it names a usable station target: a
 * non-empty mapping carrying only, say, `{ operator: "odpt.Operator:Toei" }`
 * describes the operator, not an arrival station, and must not promote the record.
 */
export function collectCanonicalStationTargets(record: unknown): string[] {
  if (!isPlainObject(record)) return [];
  const found = new Set<string>();
  for (const field of CANONICAL_MAPPING_FIELDS) {
    const mapping = record[field];
    if (!isPlainObject(mapping)) continue;
    for (const key of CANONICAL_MAPPING_STATION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(mapping, key)) continue;
      for (const value of collectStrings(mapping[key])) {
        if (value.startsWith("odpt.Station:")) found.add(value);
      }
    }
  }
  return [...found].sort();
}

export interface AnchorCoordinates {
  readonly lat: number;
  readonly lng: number;
}

/** One entry of the reviewed pilot station index. */
export interface PilotStationEntry {
  readonly sameAs: string;
  readonly operator: string | null;
  readonly railway: string | null;
  readonly stationCode: string | null;
  readonly coordinates: AnchorCoordinates | null;
  readonly title: string | null;
  readonly stationTitle: Record<string, string> | null;
}

export interface AnchorDestination {
  readonly id: string;
  readonly name?: string | null;
  readonly nameJa?: string | null;
  readonly role?: string | null;
  readonly kind?: string | null;
  readonly coordinates?: AnchorCoordinates | null;
  readonly localTransport?: unknown;
  /** Explicit canonical station evidence (rule 1). */
  readonly odptMapping?: unknown;
  readonly canonicalMapping?: unknown;
}

/** The three outcomes the semantic gate can reach. */
export type SemanticGateOutcome =
  "anchorable" | "not_anchorable_by_geography" | "hold_for_review";

export interface SemanticGateVerdict {
  readonly outcome: SemanticGateOutcome;
  readonly reason: string | null;
}

/**
 * The FINAL anchorability policy, applied BEFORE any ODPT candidate count is
 * interpreted. Decided from the destination's own `role`/`kind` only — never from
 * its id, and never from `localTransport`.
 *
 * Precedence, exactly as specified:
 *   2. kind in {city, ward, town, village, district, historic_town}
 *        -> not_anchorable_by_geography / administrative_or_locality_kind
 *        (role-independent, so it outranks rules 3-8)
 *   3. role === "hub"          -> not_anchorable_by_geography / hub_role
 *   4. role === "standalone"   -> not_anchorable_by_geography / standalone_regional_role
 *   5. role === "poi"          -> anchorable (even when kind is null)
 *   6. role === null && kind === null
 *        -> hold_for_review / destination_semantics_unclassified
 *   7. role === null && known non-administrative kind -> anchorable
 *   8. any other (unknown/legacy) role
 *        -> hold_for_review / unknown_or_legacy_role
 *
 * Rule 1 (explicit canonical evidence outranks all of this) is handled by the
 * caller, because it concerns available evidence rather than record semantics.
 */
export function classifySemanticGate(
  destination: AnchorDestination,
): SemanticGateVerdict {
  const role = destination.role ?? null;
  const kind = destination.kind ?? null;

  // Rule 2. Administrative/locality KIND outranks every role rule, including the
  // legacy-role rule, so a drifted role cannot rescue an area-kind record.
  if (kind !== null && NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS.includes(kind)) {
    return {
      outcome: "not_anchorable_by_geography",
      reason: ANCHORABILITY_REASONS.ADMINISTRATIVE_OR_LOCALITY_KIND,
    };
  }

  // Rule 3.
  if (role === "hub") {
    return {
      outcome: "not_anchorable_by_geography",
      reason: ANCHORABILITY_REASONS.HUB_ROLE,
    };
  }

  // Rule 4.
  if (role === "standalone") {
    return {
      outcome: "not_anchorable_by_geography",
      reason: ANCHORABILITY_REASONS.STANDALONE_REGIONAL_ROLE,
    };
  }

  // Rule 5.
  if (role === "poi") return { outcome: "anchorable", reason: null };

  // Rule 6. Neither dimension says what the coordinate denotes.
  if (role === null && kind === null) {
    return {
      outcome: "hold_for_review",
      reason: HOLD_REASONS.DESTINATION_SEMANTICS_UNCLASSIFIED,
    };
  }

  // Rule 7. A missing role with a known, non-administrative kind.
  if (role === null) return { outcome: "anchorable", reason: null };

  // Rule 8. A role the schema does not define. Held, never coerced to a known role
  // — `destination` in particular is NOT treated as `poi`.
  return {
    outcome: "hold_for_review",
    reason: HOLD_REASONS.UNKNOWN_OR_LEGACY_ROLE,
  };
}

/** Whether a destination's coordinates may be used for geographic derivation. */
export interface AnchorabilityVerdict {
  readonly anchorable: boolean;
  readonly reason: string | null;
}

/** Thin view over the gate for callers that only need the yes/no. */
export function isGeographicallyAnchorable(
  destination: AnchorDestination,
): AnchorabilityVerdict {
  const verdict = classifySemanticGate(destination);
  return {
    anchorable: verdict.outcome === "anchorable",
    reason: verdict.reason,
  };
}

/** Audit-only classification of a record's coordinate meaning. */
export function semanticClassification(
  destination: AnchorDestination,
): "administrative/regional" | "requires_review" | "point/site-like" {
  const verdict = classifySemanticGate(destination);
  if (verdict.outcome === "hold_for_review") return "requires_review";
  if (verdict.outcome === "not_anchorable_by_geography") {
    return "administrative/regional";
  }
  return "point/site-like";
}

export interface GeographicAnchorVerdict {
  readonly destinationId: string;
  readonly status: (typeof ANCHOR_STATUS)[keyof typeof ANCHOR_STATUS];
  readonly blocker: string | null;
  readonly evidencePath: string | null;
  readonly toleranceMeters: number;
  /** Exact pilot stations inside the tolerance. Never a nearest-of-several pick. */
  readonly candidateCount: number;
  readonly candidateIdentities: readonly string[];
  readonly anchor: {
    readonly odptStationId: string;
    readonly operator: string | null;
    readonly railway: string | null;
    readonly title: string | null;
    readonly stationTitle: Record<string, string> | null;
    readonly coordinates: AnchorCoordinates | null;
  } | null;
  /** Distance from the destination to the UNIQUE anchor. Null unless anchored. */
  readonly distanceMeters: number | null;
  readonly destinationCoordinates: AnchorCoordinates | null;
}

function isValidCoordinates(
  value: AnchorCoordinates | null | undefined,
): value is AnchorCoordinates {
  return (
    value != null &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng)
  );
}

/**
 * Exact pilot stations within `toleranceMeters` of a point.
 *
 * Reporting/verification helper only: the DECISION always comes from the shared
 * resolver, and tests assert the two agree.
 */
export function stationsWithinTolerance(
  point: AnchorCoordinates,
  stations: readonly PilotStationEntry[],
  toleranceMeters: number,
): readonly PilotStationEntry[] {
  return stations.filter(
    (station) =>
      isValidCoordinates(station.coordinates) &&
      distanceMeters(point, station.coordinates) <= toleranceMeters,
  );
}

/**
 * Classifies ONE destination against the pilot station index.
 *
 * Never throws, never picks the nearest of several, and never widens the radius.
 */
export function classifyGeographicAnchor(
  destination: AnchorDestination,
  stations: readonly PilotStationEntry[],
  toleranceMeters: number = GEOGRAPHIC_TOLERANCE_METERS,
): GeographicAnchorVerdict {
  const destinationCoordinates = isValidCoordinates(destination.coordinates)
    ? destination.coordinates
    : null;

  // ── Rule 1. Explicit/canonical exact station evidence outranks the geographic
  // gate entirely, so it is checked BEFORE any semantic question is asked. A
  // canonical anchor is not a geographic claim, and a hub with a canonical anchor
  // still has that anchor.
  const canonicalTargets = collectCanonicalStationTargets(destination);
  if (canonicalTargets.length > 1) {
    // Competing explicit targets are not "exact" evidence. Never pick one.
    return {
      destinationId: destination.id,
      status: ANCHOR_STATUS.AMBIGUOUS,
      blocker: "multiple_canonical_station_targets",
      evidencePath: null,
      toleranceMeters,
      candidateCount: canonicalTargets.length,
      candidateIdentities: canonicalTargets,
      anchor: null,
      distanceMeters: null,
      destinationCoordinates,
    };
  }
  if (canonicalTargets.length === 1) {
    const target = canonicalTargets[0];
    // Fail closed through the SHARED exact-identity semantics: the target must
    // resolve to exactly one record in the reviewed pilot index. Anything else
    // is unverifiable for this pilot — never a weaker local lookup, and never
    // a geographic fallback.
    const exact = resolveOdptStationIdentity(
      { odptId: target },
      stations as unknown as readonly OdptStation[],
    );
    if (
      exact.status === "matched" &&
      exact.evidencePath === "exact_identity" &&
      exact.station !== null
    ) {
      const anchorStation = exact.station as unknown as PilotStationEntry;
      const point = isValidCoordinates(anchorStation.coordinates)
        ? anchorStation.coordinates
        : null;
      return {
        destinationId: destination.id,
        status: ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION,
        blocker: null,
        evidencePath: CANONICAL_EVIDENCE_PATH,
        toleranceMeters,
        // Metadata only: no geographic candidate search was performed, because the
        // geographic gate is irrelevant to a canonically anchored destination.
        candidateCount: 0,
        candidateIdentities: [],
        anchor: {
          odptStationId: target,
          operator: anchorStation.operator,
          railway: anchorStation.railway,
          title: anchorStation.title,
          stationTitle: anchorStation.stationTitle,
          coordinates: point,
        },
        distanceMeters:
          point !== null && destinationCoordinates !== null
            ? distanceMeters(destinationCoordinates, point)
            : null,
        destinationCoordinates,
      };
    }
    if (exact.status === "ambiguous") {
      // The reviewed index itself carries more than one record for this exact
      // identity. Fail closed: never pick one.
      const identities = exact.candidates
        .map(
          (candidate) =>
            (candidate as unknown as PilotStationEntry).sameAs ?? target,
        )
        .sort();
      return {
        destinationId: destination.id,
        status: ANCHOR_STATUS.AMBIGUOUS,
        blocker: "multiple_pilot_records_for_canonical_identity",
        evidencePath: null,
        toleranceMeters,
        candidateCount: exact.candidateCount,
        candidateIdentities: identities,
        anchor: null,
        distanceMeters: null,
        destinationCoordinates,
      };
    }
    // Exactly one explicit target, but no matching exact station exists in the
    // reviewed pilot index (absent, or syntactically ODPT yet outside the
    // TokyoMetro + Toei pilot). Hold for review with NO geographic fallback:
    // the explicit mapping states where the destination belongs, so choosing a
    // nearby pilot station geographically would contradict the stronger
    // evidence. This holds even for hub/admin destinations, which therefore
    // never fall through to a geographic anchor from here.
    return {
      destinationId: destination.id,
      status: ANCHOR_STATUS.HOLD_FOR_REVIEW,
      blocker: HOLD_REASONS.CANONICAL_STATION_NOT_IN_PILOT_INDEX,
      evidencePath: null,
      toleranceMeters,
      candidateCount: 0,
      candidateIdentities: [],
      anchor: null,
      distanceMeters: null,
      destinationCoordinates,
    };
  }

  // ── The semantic gate. A destination that is not anchorable, or whose semantics
  // are undecidable, never reaches the geographic rule, so its observed candidate
  // count can never become an anchor.
  const gate = classifySemanticGate(destination);
  if (gate.outcome !== "anchorable") {
    const observed =
      destinationCoordinates === null
        ? 0
        : stationsWithinTolerance(
            destinationCoordinates,
            stations,
            toleranceMeters,
          ).length;
    return {
      destinationId: destination.id,
      status:
        gate.outcome === "hold_for_review"
          ? ANCHOR_STATUS.HOLD_FOR_REVIEW
          : ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY,
      blocker: gate.reason,
      evidencePath: null,
      toleranceMeters,
      // Observational only. Recorded so the review table can show what geography
      // WOULD have said, without ever emitting an anchor from it.
      candidateCount: observed,
      candidateIdentities: [],
      anchor: null,
      distanceMeters: null,
      destinationCoordinates,
    };
  }

  if (destinationCoordinates === null) {
    return {
      destinationId: destination.id,
      status: ANCHOR_STATUS.COORDINATES_ABSENT,
      blocker: "destination_coordinates_absent",
      evidencePath: null,
      toleranceMeters,
      candidateCount: 0,
      candidateIdentities: [],
      anchor: null,
      distanceMeters: null,
      destinationCoordinates: null,
    };
  }

  // ONLY coordinates are supplied. Passing a name would enable the name-based
  // paths, and passing operator/railway would let a multi-candidate result be
  // narrowed by operator — which would break the ">1 stays ambiguous" rule.
  // The index carries only the fields the geographic path reads (identity +
  // coordinates); the cast states that explicitly rather than pretending the
  // entries are fully-populated ODPT records.
  const match = resolveOdptStationIdentity(
    {
      coordinates: destinationCoordinates,
      maxDistanceMeters: toleranceMeters,
    },
    stations as unknown as readonly OdptStation[],
  );

  const within = stationsWithinTolerance(
    destinationCoordinates,
    stations,
    toleranceMeters,
  );
  const candidateCount = within.length;
  const candidateIdentities = within.map((station) => station.sameAs).sort();

  const anchored =
    match.status === "matched" && match.evidencePath === "geographic";
  if (anchored && match.station !== null) {
    const anchorStation = match.station as unknown as PilotStationEntry;
    return {
      destinationId: destination.id,
      status: ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE,
      blocker: null,
      evidencePath: ANCHOR_EVIDENCE_PATH,
      toleranceMeters,
      candidateCount,
      candidateIdentities,
      anchor: {
        odptStationId: anchorStation.sameAs,
        operator: anchorStation.operator,
        railway: anchorStation.railway,
        title: anchorStation.title,
        stationTitle: anchorStation.stationTitle,
        coordinates: anchorStation.coordinates,
      },
      distanceMeters:
        anchorStation.coordinates !== null
          ? distanceMeters(destinationCoordinates, anchorStation.coordinates)
          : null,
      destinationCoordinates,
    };
  }

  const ambiguous = match.status === "ambiguous";
  return {
    destinationId: destination.id,
    status: ambiguous ? ANCHOR_STATUS.AMBIGUOUS : ANCHOR_STATUS.UNAVAILABLE,
    blocker: ambiguous
      ? "multiple_pilot_stations_within_tolerance"
      : "no_pilot_station_within_tolerance",
    evidencePath: null,
    toleranceMeters,
    candidateCount,
    candidateIdentities,
    anchor: null,
    distanceMeters: null,
    destinationCoordinates,
  };
}

/** Aggregate coverage over a set of destinations. */
export interface AnchorCoverageReport {
  readonly toleranceMeters: number;
  readonly destinationsEvaluated: number;
  /**
   * The six mutually exclusive geographic statuses, in partition order.
   *
   * `canonical_explicit_station` is deliberately NOT one of them: rule 1 takes a
   * destination out of the geographic rule entirely, so counting it here would
   * misreport an explicit mapping as a geographic finding. The six sum to
   * `destinationsEvaluated - canonicalExplicitStation`.
   */
  readonly statusPartition: Readonly<Record<string, number>>;
  readonly uniqueAnchors: number;
  /** Anchors taken from explicit canonical evidence (rule 1). */
  readonly canonicalExplicitStation: number;
  /** Anchors of either evidence path: the production-ready geographic total. */
  readonly productionReadyAnchors: number;
  readonly ambiguous: number;
  readonly unavailable: number;
  readonly coordinatesAbsent: number;
  /** Positively decided as not geography-anchorable. */
  readonly notAnchorableByGeography: number;
  /** Undecidable from the record's own semantics: a real, exclusionary status. */
  readonly holdForReview: number;
  /** `not_anchorable_by_geography` grouped by reason. */
  readonly notAnchorableReasons: Readonly<Record<string, number>>;
  /** `hold_for_review` grouped by reason. */
  readonly holdReasons: Readonly<Record<string, number>>;
  /**
   * Destinations lacking usable coordinates, counted across ALL statuses.
   *
   * Deliberately OVERLAPPING with the status partition rather than folded into it:
   * the gate runs first, so a hub with no coordinates is reported as
   * `not_anchorable_by_geography`. Counting coordinate absence only through the
   * `coordinates_absent` status would hide that gap (and report zero).
   */
  readonly destinationsWithoutCoordinates: number;
  /** Histogram of stations-within-tolerance counts, keyed as "0","1","2","3","4+". */
  readonly candidateCountDistribution: Readonly<Record<string, number>>;
  readonly anchorsByOperator: Readonly<Record<string, number>>;
  readonly anchorsByRailway: Readonly<Record<string, number>>;
  readonly distanceMetersStats: {
    readonly min: number | null;
    readonly median: number | null;
    readonly max: number | null;
    readonly bucketUnder50: number;
    readonly bucket50to100: number;
    readonly bucket100to250: number;
    readonly bucket250to500: number;
  };
  readonly anchors: readonly GeographicAnchorVerdict[];
  readonly ambiguousDestinations: readonly {
    readonly destinationId: string;
    readonly candidateCount: number;
    readonly candidateIdentities: readonly string[];
  }[];
  readonly coordinatesAbsentDestinations: readonly string[];
  readonly notAnchorableDestinations: readonly {
    readonly destinationId: string;
    readonly reason: string | null;
    readonly observedCandidateCount: number;
  }[];
  /**
   * Held destinations, retained ONLY as observational review metadata. These are
   * excluded from `anchors`, `uniqueAnchors`, `anchorsByOperator`,
   * `anchorsByRailway`, `productionReadyAnchors` and the candidate distribution.
   */
  readonly holdDestinations: readonly {
    readonly destinationId: string;
    readonly reason: string | null;
    readonly observedCandidateCount: number;
  }[];
}

function histogramBucket(count: number): string {
  if (count >= 4) return "4+";
  return String(count);
}

/**
 * Builds the coverage report.
 *
 * Pure: takes destinations + stations, returns the report. No I/O, no clock.
 */
export function buildAnchorCoverageReport(
  destinations: readonly AnchorDestination[],
  stations: readonly PilotStationEntry[],
  toleranceMeters: number = GEOGRAPHIC_TOLERANCE_METERS,
): AnchorCoverageReport {
  const verdicts = destinations.map((destination) =>
    classifyGeographicAnchor(destination, stations, toleranceMeters),
  );

  const candidateCountDistribution: Record<string, number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4+": 0,
  };
  const anchorsByOperator: Record<string, number> = {};
  const anchorsByRailway: Record<string, number> = {};
  const anchors: GeographicAnchorVerdict[] = [];
  const ambiguousDestinations: {
    destinationId: string;
    candidateCount: number;
    candidateIdentities: readonly string[];
  }[] = [];
  const coordinatesAbsentDestinations: string[] = [];
  const notAnchorableDestinations: {
    readonly destinationId: string;
    readonly reason: string | null;
    readonly observedCandidateCount: number;
  }[] = [];
  const holdDestinations: {
    readonly destinationId: string;
    readonly reason: string | null;
    readonly observedCandidateCount: number;
  }[] = [];
  const notAnchorableReasons: Record<string, number> = {};
  const holdReasons: Record<string, number> = {};
  const statusPartition: Record<string, number> = {};
  for (const status of STATUS_PARTITION) statusPartition[status] = 0;
  const distances: number[] = [];
  let canonicalExplicitStation = 0;

  for (const verdict of verdicts) {
    // Every status is counted exactly once, including the two exclusionary ones,
    // so the partition is exhaustive and mutually exclusive.
    if (verdict.status in statusPartition) statusPartition[verdict.status] += 1;

    if (verdict.status === ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION) {
      canonicalExplicitStation += 1;
    }

    // Excluded before the geographic rule ran, so its candidate count is
    // observational and must not enter the distribution or any anchor total.
    if (verdict.status === ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY) {
      notAnchorableDestinations.push({
        destinationId: verdict.destinationId,
        reason: verdict.blocker,
        observedCandidateCount: verdict.candidateCount,
      });
      const reason = verdict.blocker ?? "unknown";
      notAnchorableReasons[reason] = (notAnchorableReasons[reason] ?? 0) + 1;
      continue;
    }
    if (verdict.status === ANCHOR_STATUS.HOLD_FOR_REVIEW) {
      holdDestinations.push({
        destinationId: verdict.destinationId,
        reason: verdict.blocker,
        observedCandidateCount: verdict.candidateCount,
      });
      const reason = verdict.blocker ?? "unknown";
      holdReasons[reason] = (holdReasons[reason] ?? 0) + 1;
      continue;
    }

    // The distribution is over destinations the geographic rule could run for.
    if (
      verdict.status !== ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION &&
      verdict.destinationCoordinates !== null
    ) {
      const bucket = histogramBucket(verdict.candidateCount);
      candidateCountDistribution[bucket] += 1;
    }

    if (
      verdict.status === ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE ||
      verdict.status === ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION
    ) {
      anchors.push(verdict);
      if (verdict.distanceMeters !== null)
        distances.push(verdict.distanceMeters);
      const operator = verdict.anchor?.operator ?? "unknown";
      anchorsByOperator[operator] = (anchorsByOperator[operator] ?? 0) + 1;
      const railway = verdict.anchor?.railway ?? "unknown";
      anchorsByRailway[railway] = (anchorsByRailway[railway] ?? 0) + 1;
    } else if (verdict.status === ANCHOR_STATUS.AMBIGUOUS) {
      ambiguousDestinations.push({
        destinationId: verdict.destinationId,
        candidateCount: verdict.candidateCount,
        candidateIdentities: verdict.candidateIdentities,
      });
    } else if (verdict.status === ANCHOR_STATUS.COORDINATES_ABSENT) {
      coordinatesAbsentDestinations.push(verdict.destinationId);
    }
  }

  distances.sort((left, right) => left - right);
  const median =
    distances.length === 0
      ? null
      : (distances[Math.floor((distances.length - 1) / 2)] ?? null);

  const within = (low: number, high: number) =>
    distances.filter((d) => d >= low && d < high).length;

  return {
    toleranceMeters,
    destinationsEvaluated: destinations.length,
    statusPartition,
    uniqueAnchors:
      statusPartition[ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE] ?? 0,
    canonicalExplicitStation,
    productionReadyAnchors: anchors.length,
    ambiguous: ambiguousDestinations.length,
    unavailable: verdicts.filter((v) => v.status === ANCHOR_STATUS.UNAVAILABLE)
      .length,
    coordinatesAbsent: coordinatesAbsentDestinations.length,
    candidateCountDistribution,
    anchorsByOperator,
    anchorsByRailway,
    distanceMetersStats: {
      min: distances[0] ?? null,
      median,
      max: distances[distances.length - 1] ?? null,
      bucketUnder50: within(0, 50),
      bucket50to100: within(50, 100),
      bucket100to250: within(100, 250),
      bucket250to500: within(250, 501),
    },
    notAnchorableByGeography: notAnchorableDestinations.length,
    holdForReview: holdDestinations.length,
    notAnchorableReasons,
    holdReasons,
    destinationsWithoutCoordinates: destinations.filter(
      (destination) => !isValidCoordinates(destination.coordinates),
    ).length,
    anchors,
    ambiguousDestinations,
    coordinatesAbsentDestinations,
    notAnchorableDestinations,
    holdDestinations,
  };
}

/** One `role x kind` row of the catalogue-wide semantic matrix. */
export interface SemanticMatrixRow {
  readonly role: string | null;
  readonly kind: string | null;
  readonly totalRecords: number;
  readonly withCoordinates: number;
  /** Observed count of pilot stations inside tolerance, 0 through "4+". */
  readonly candidateCounts: Readonly<Record<string, number>>;
  /** Destinations in this cell that a unique candidate would anchor today. */
  readonly uniqueGeographicCandidates: number;
  /** Final-policy gate outcomes for this cell. */
  readonly anchorable: number;
  readonly notAnchorableByGeography: number;
  readonly holdForReview: number;
  /** True when this cell's role is schema drift rather than a defined role. */
  readonly legacyRole: boolean;
}

/**
 * Catalogue-wide `role x kind` semantic matrix.
 *
 * Pure and offline: it consumes the committed station index, so no provider call
 * is made and the committed candidate evidence is reused as-is.
 */
export function buildSemanticMatrix(
  destinations: readonly AnchorDestination[],
  stations: readonly PilotStationEntry[],
  toleranceMeters: number = GEOGRAPHIC_TOLERANCE_METERS,
): readonly SemanticMatrixRow[] {
  const cells = new Map<
    string,
    SemanticMatrixRow & { candidateCounts: Record<string, number> }
  >();

  for (const destination of destinations) {
    const role = destination.role ?? null;
    const kind = destination.kind ?? null;
    const key = `${role ?? "\u0000"}||${kind ?? "\u0000"}`;
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = {
        role,
        kind,
        totalRecords: 0,
        withCoordinates: 0,
        candidateCounts: { "0": 0, "1": 0, "2": 0, "3": 0, "4+": 0 },
        uniqueGeographicCandidates: 0,
        anchorable: 0,
        notAnchorableByGeography: 0,
        holdForReview: 0,
        legacyRole: isUnknownOrLegacyRole(role),
      };
      cells.set(key, cell);
    }

    const outcome = classifySemanticGate(destination).outcome;
    const hasCoordinates = isValidCoordinates(destination.coordinates);
    const observed = hasCoordinates
      ? stationsWithinTolerance(
          destination.coordinates as AnchorCoordinates,
          stations,
          toleranceMeters,
        ).length
      : 0;

    cell.totalRecords += 1;
    if (hasCoordinates) cell.withCoordinates += 1;
    cell.candidateCounts[histogramBucket(observed)] += 1;
    if (observed === 1) cell.uniqueGeographicCandidates += 1;
    if (outcome === "anchorable") cell.anchorable += 1;
    else if (outcome === "hold_for_review") cell.holdForReview += 1;
    else cell.notAnchorableByGeography += 1;
  }

  return [...cells.values()].sort(
    (left, right) =>
      right.totalRecords - left.totalRecords ||
      String(left.role).localeCompare(String(right.role)) ||
      String(left.kind).localeCompare(String(right.kind)),
  );
}

/** One row of the review of every unique geographic candidate. */
export interface AnchorReviewRow {
  readonly destinationId: string;
  readonly name: string | null;
  readonly nameJa: string | null;
  readonly role: string | null;
  readonly kind: string | null;
  readonly destinationCoordinates: AnchorCoordinates | null;
  readonly observedCandidateCount: number;
  readonly anchorStationId: string | null;
  readonly anchorStationTitleEn: string | null;
  readonly operator: string | null;
  readonly railway: string | null;
  readonly distanceMeters: number | null;
  readonly semanticClassification:
    "administrative/regional" | "requires_review" | "point/site-like";
  /** The classifier's own status — never a second, parallel decision. */
  readonly proposedOutcome: (typeof ANCHOR_STATUS)[keyof typeof ANCHOR_STATUS];
  readonly reason: string | null;
}

/**
 * Reviews EVERY destination geography would resolve uniquely, including those the
 * gate excludes or holds — so excluded records stay visible with their observed
 * count instead of disappearing from the audit.
 *
 * Selection is by observed candidate count, never by destination id. Canonically
 * anchored records are also listed, so rule 1 is visible rather than silent.
 */
export function buildAnchorReviewTable(
  destinations: readonly AnchorDestination[],
  stations: readonly PilotStationEntry[],
  toleranceMeters: number = GEOGRAPHIC_TOLERANCE_METERS,
): readonly AnchorReviewRow[] {
  const rows: AnchorReviewRow[] = [];
  for (const destination of destinations) {
    const verdict = classifyGeographicAnchor(
      destination,
      stations,
      toleranceMeters,
    );
    const isCanonical =
      verdict.status === ANCHOR_STATUS.CANONICAL_EXPLICIT_STATION;
    if (!isCanonical) {
      if (!isValidCoordinates(destination.coordinates)) continue;
      const within = stationsWithinTolerance(
        destination.coordinates,
        stations,
        toleranceMeters,
      );
      if (within.length !== 1) continue;
    }

    const classification = semanticClassification(destination);
    const proposedOutcome = verdict.status;

    const stationEntry =
      verdict.anchor !== null && isCanonical
        ? {
            sameAs: verdict.anchor.odptStationId,
            operator: verdict.anchor.operator,
            railway: verdict.anchor.railway,
            stationTitle: verdict.anchor.stationTitle,
            coordinates: verdict.anchor.coordinates,
          }
        : stationsWithinTolerance(
            destination.coordinates as AnchorCoordinates,
            stations,
            toleranceMeters,
          )[0];
    rows.push({
      destinationId: destination.id,
      name: destination.name ?? null,
      nameJa: destination.nameJa ?? null,
      role: destination.role ?? null,
      kind: destination.kind ?? null,
      destinationCoordinates:
        verdict.destinationCoordinates ?? destination.coordinates ?? null,
      observedCandidateCount: verdict.candidateCount,
      anchorStationId: stationEntry.sameAs,
      anchorStationTitleEn: stationEntry.stationTitle?.en ?? null,
      operator: stationEntry.operator,
      railway: stationEntry.railway,
      distanceMeters: verdict.distanceMeters,
      semanticClassification: classification,
      proposedOutcome,
      reason: verdict.blocker,
    });
  }
  return rows.sort((left, right) =>
    left.destinationId.localeCompare(right.destinationId),
  );
}

/**
 * One role value found in the catalogue, with its observed kind distribution.
 *
 * Reported explicitly because `role` is populated straight from
 * `destination.role`: a cell like `destination/*` is real schema drift, not a
 * synonym for `poi`, and the audit must surface it rather than normalise it away.
 */
export interface RoleDriftRow {
  readonly role: string | null;
  readonly totalRecords: number;
  readonly knownRole: boolean;
  readonly kindCounts: Readonly<Record<string, number>>;
  /** Records whose `kind` is absent, so only the role distinguishes them. */
  readonly withMissingKind: number;
}

/**
 * Reports every observed role value and its kind distribution.
 *
 * Pure and offline. Missing `kind` is reported as its own bucket rather than
 * treated as suspicious, since a defined role can legitimately carry no kind
 * (rule 5 makes `poi` anchorable regardless of kind).
 */
export function buildRoleDriftReport(
  destinations: readonly AnchorDestination[],
): readonly RoleDriftRow[] {
  const roles = new Map<
    string,
    {
      role: string | null;
      kindCounts: Record<string, number>;
      total: number;
      missingKind: number;
    }
  >();

  for (const destination of destinations) {
    const role = destination.role ?? null;
    const key = role ?? "\u0000";
    let entry = roles.get(key);
    if (entry === undefined) {
      entry = { role, kindCounts: {}, total: 0, missingKind: 0 };
      roles.set(key, entry);
    }
    const kind = destination.kind ?? null;
    const kindKey = kind ?? "(none)";
    entry.kindCounts[kindKey] = (entry.kindCounts[kindKey] ?? 0) + 1;
    entry.total += 1;
    if (kind === null) entry.missingKind += 1;
  }

  return [...roles.values()]
    .map((entry) => ({
      role: entry.role,
      totalRecords: entry.total,
      knownRole:
        entry.role === null || KNOWN_DESTINATION_ROLES.includes(entry.role),
      kindCounts: entry.kindCounts,
      withMissingKind: entry.missingKind,
    }))
    .sort((left, right) => right.totalRecords - left.totalRecords);
}

/** One row of the validation-cohort comparison. */
export interface ValidationRow {
  readonly destinationId: string;
  readonly existingEvidenceKind: string;
  readonly stationNamesInEvidence: readonly string[];
  readonly anchorStationTitle: string | null;
  readonly anchorStationTitleEn: string | null;
  readonly verdict:
    | "agreement"
    | "contradiction"
    | "comparable_no_station_named"
    | "not_comparable_anchor_absent";
}

const STATION_NAME_PATTERN =
  /([A-Z][A-Za-z'-]+(?:[-\s][A-Z][A-Za-z'-]+){0,2})\s+(?:JR\s+)?Station/g;

/** Station names appearing in a free-text evidence string. */
export function stationNamesInText(text: string | null | undefined): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(STATION_NAME_PATTERN)) {
    found.add(match[1].trim());
  }
  for (const match of text.matchAll(/JR[「\s]*([^」\s]+)[」]?\s*駅/g)) {
    found.add(match[1].trim());
  }
  for (const match of text.matchAll(/([^\s、。]+)駅/g)) {
    found.add(match[1].trim());
  }
  return [...found].sort();
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐‑–—-]/g, "")
    .toLowerCase();
}

/**
 * Compares the geographic result against a record's EXISTING stronger access
 * evidence, where that evidence is specific enough to compare.
 *
 * Destination semantics and coordinate meaning decide geographic ANCHORABILITY;
 * `localTransport` availability never does. This comparison is reported only and
 * never overrides geography.
 */
export function compareValidationCohort(
  cohort: readonly (AnchorDestination & {
    readonly localTransport?: {
      readonly kind?: string;
      readonly basis?: string;
      readonly walkingEvidence?: string;
      readonly segmentNotes?: string;
    } | null;
  })[],
  stations: readonly PilotStationEntry[],
  toleranceMeters: number = GEOGRAPHIC_TOLERANCE_METERS,
): readonly ValidationRow[] {
  return cohort.map((destination) => {
    const verdict = classifyGeographicAnchor(
      destination,
      stations,
      toleranceMeters,
    );
    const evidence = destination.localTransport ?? {};
    const names = stationNamesInText(
      [evidence.basis, evidence.walkingEvidence, evidence.segmentNotes]
        .filter((value): value is string => typeof value === "string")
        .join(" | "),
    );
    const anchorTitle = verdict.anchor?.title ?? null;
    const anchorTitleEn = verdict.anchor?.stationTitle?.en ?? null;

    let result: ValidationRow["verdict"];
    if (verdict.status !== ANCHOR_STATUS.GEOGRAPHIC_UNIQUE_CANDIDATE) {
      // No anchor exists to compare against, for any reason.
      result = "not_comparable_anchor_absent";
    } else if (names.length === 0) {
      result = "comparable_no_station_named";
    } else {
      const wanted = [anchorTitle, anchorTitleEn]
        .filter((value): value is string => typeof value === "string")
        .map(normalizeName);
      const agrees = names.some((name) => {
        const normalized = normalizeName(name);
        return wanted.some(
          (candidate) =>
            candidate.length > 0 &&
            (candidate.includes(normalized) || normalized.includes(candidate)),
        );
      });
      result = agrees ? "agreement" : "contradiction";
    }

    return {
      destinationId: destination.id,
      existingEvidenceKind: evidence.kind ?? "unknown",
      stationNamesInEvidence: names,
      anchorStationTitle: anchorTitle,
      anchorStationTitleEn: anchorTitleEn,
      verdict: result,
    };
  });
}

/** Renders the coverage report as Markdown. */
export function renderAnchorReport(
  report: AnchorCoverageReport,
  validation: readonly ValidationRow[],
  reviewTable: readonly AnchorReviewRow[],
  matrix: readonly SemanticMatrixRow[],
  roleDrift: readonly RoleDriftRow[],
): string {
  const count = (values: readonly string[]) => {
    const out: Record<string, number> = {};
    for (const value of values) out[value] = (out[value] ?? 0) + 1;
    return out;
  };
  const validationCounts = count(validation.map((row) => row.verdict));
  const reviewCounts = count(reviewTable.map((row) => row.proposedOutcome));
  const cell = (value: string | null) => value ?? "(none)";

  const partitionSum = Object.values(report.statusPartition).reduce(
    (sum, value) => sum + value,
    0,
  );

  const lines = [
    "# KAI-291A — destination → exact ODPT arrival-station identity coverage",
    "",
    "Geographic anchor registry for the **TokyoMetro + Toei** pilot, built with the",
    "existing `odptStationIdentity` geographic evidence path.",
    "",
    `- Tolerance (fixed, reused from the existing resolver default): **${report.toleranceMeters} m**`,
    `- Destinations evaluated: **${report.destinationsEvaluated}**`,
    "",
    "## Status partition (mutually exclusive, exhaustive)",
    "",
    "| Status | Destinations |",
    "| --- | --- |",
  ];
  for (const status of STATUS_PARTITION) {
    lines.push(`| \`${status}\` | ${report.statusPartition[status] ?? 0} |`);
  }
  lines.push(
    `| **Sum** | **${partitionSum}** |`,
    "",
    `The six statuses sum to **${partitionSum}**. ` +
      (report.canonicalExplicitStation === 0
        ? "`canonical_explicit_station` is empty, so this equals the catalogue size."
        : `Adding the ${report.canonicalExplicitStation} canonically anchored ` +
          "record(s) gives the catalogue size."),
    "",
    "`canonical_explicit_station` sits OUTSIDE the geographic partition by design:",
    "rule 1 removes such a record from the geographic rule entirely, so counting it",
    "as a geographic finding would misreport its evidence.",
    "",
    "## Production-ready anchor totals",
    "",
    "| Measure | Count |",
    "| --- | --- |",
    `| \`geographic_unique_candidate\` (geographic anchors) | ${report.uniqueAnchors} |`,
    `| \`canonical_explicit_station\` (explicit evidence, rule 1) | ${report.canonicalExplicitStation} |`,
    `| **Production-ready anchors** | **${report.productionReadyAnchors}** |`,
    "",
    "## Exclusions and holds",
    "",
    "| Measure | Count |",
    "| --- | --- |",
    `| \`not_anchorable_by_geography\` | ${report.notAnchorableByGeography} |`,
    `| \`hold_for_review\` | ${report.holdForReview} |`,
    `| Destinations without coordinates (any status, overlapping diagnostic) | ${report.destinationsWithoutCoordinates} |`,
    "",
    "### not_anchorable_by_geography by reason",
    "",
    "| Reason | Destinations |",
    "| --- | --- |",
  );
  for (const [reason, n] of Object.entries(
    report.notAnchorableReasons,
  ).sort()) {
    lines.push(`| \`${reason}\` | ${n} |`);
  }
  lines.push(
    "",
    "### hold_for_review by reason",
    "",
    "| Reason | Destinations |",
    "| --- | --- |",
  );
  for (const [reason, n] of Object.entries(report.holdReasons).sort()) {
    lines.push(`| \`${reason}\` | ${n} |`);
  }
  lines.push(
    "",
    "Held records are excluded from `anchors`, the geographic anchor count,",
    "`anchorsByOperator`, `anchorsByRailway`, the production-ready total and the",
    "candidate distribution. They are retained only as observational metadata.",
    "",
    "## Candidate-count distribution (geographic rule only)",
    "",
    "| Candidates | Destinations |",
    "| --- | --- |",
  );
  for (const key of ["0", "1", "2", "3", "4+"]) {
    lines.push(`| ${key} | ${report.candidateCountDistribution[key] ?? 0} |`);
  }
  lines.push(
    "",
    "## Anchors by operator",
    "",
    "| Operator | Anchors |",
    "| --- | --- |",
  );
  for (const [operator, n] of Object.entries(report.anchorsByOperator).sort()) {
    lines.push(`| ${operator} | ${n} |`);
  }
  lines.push(
    "",
    "## Anchors by railway",
    "",
    "| Railway | Anchors |",
    "| --- | --- |",
  );
  for (const [railway, n] of Object.entries(report.anchorsByRailway).sort()) {
    lines.push(`| ${railway} | ${n} |`);
  }
  const d = report.distanceMetersStats;
  lines.push(
    "",
    "## Distance, destination → its unique anchor",
    "",
    `- min **${d.min === null ? "n/a" : d.min.toFixed(1)} m** · median **${
      d.median === null ? "n/a" : d.median.toFixed(1)
    } m** · max **${d.max === null ? "n/a" : d.max.toFixed(1)} m**`,
    `- <50 m: ${d.bucketUnder50} · 50–100 m: ${d.bucket50to100} · ` +
      `100–250 m: ${d.bucket100to250} · 250–500 m: ${d.bucket250to500}`,
    "",
    "## Review of every unique geographic candidate",
    "",
    "Every destination geography resolves to exactly one station, **including those",
    "the policy excludes or holds**, so nothing disappears from the audit. Selection",
    "is by observed candidate count, never by destination id.",
    "",
    "| Destination | EN / JA | role | kind | ODPT station | d (m) | classification | outcome | reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of reviewTable) {
    lines.push(
      `| \`${row.destinationId}\` | ${cell(row.name)} / ${cell(row.nameJa)} | ` +
        `${cell(row.role)} | ${cell(row.kind)} | \`${cell(row.anchorStationId)}\` | ` +
        `${row.distanceMeters === null ? "n/a" : row.distanceMeters.toFixed(0)} | ` +
        `${row.semanticClassification} | \`${row.proposedOutcome}\` | ${cell(row.reason)} |`,
    );
  }
  lines.push(
    "",
    `Outcomes: ${Object.entries(reviewCounts)
      .sort()
      .map(([k, v]) => `**${k}** ${v}`)
      .join(" · ")}`,
    "",
    "## Role schema drift",
    "",
    "`role` is read straight from `destination.role`, so every observed value is",
    "reported. A defined role carries no implication that missing `kind` is",
    "suspicious — `poi` is anchorable regardless of kind (rule 5).",
    "",
    "| role | records | defined role? | with missing kind | kind distribution |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of roleDrift) {
    const kinds = Object.entries(row.kindCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    lines.push(
      `| ${cell(row.role)} | ${row.totalRecords} | ${row.knownRole ? "yes" : "**no (drift)**"} | ` +
        `${row.withMissingKind} | ${kinds} |`,
    );
  }
  lines.push(
    "",
    "## Semantic matrix (role × kind, whole catalogue)",
    "",
    "| role | kind | total | w/ coords | 0 | 1 | 2 | 3 | 4+ | unique cand. | anchorable | not anchorable | hold |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of matrix) {
    const c = row.candidateCounts;
    lines.push(
      `| ${cell(row.role)} | ${cell(row.kind)} | ${row.totalRecords} | ${row.withCoordinates} | ` +
        `${c["0"]} | ${c["1"]} | ${c["2"]} | ${c["3"]} | ${c["4+"]} | ` +
        `${row.uniqueGeographicCandidates} | ${row.anchorable} | ` +
        `${row.notAnchorableByGeography} | ${row.holdForReview} |`,
    );
  }
  lines.push(
    "",
    "## Validation cohort (existing stronger access evidence)",
    "",
    "Reported for comparison only. Geographic anchorability is decided by",
    "destination semantics and coordinate meaning, never by `localTransport`",
    "availability.",
    "",
    "| Verdict | Records |",
    "| --- | --- |",
  );
  for (const [verdict, n] of Object.entries(validationCounts).sort()) {
    lines.push(`| ${verdict} | ${n} |`);
  }
  lines.push(
    "",
    "## The final policy, in precedence order",
    "",
    "```",
    "1. explicit/canonical exact station evidence",
    "       -> stronger evidence path; geographic gate irrelevant",
    "       (2+ competing canonical targets -> ambiguous, never a pick)",
    "2. kind in {city, ward, town, village, district, historic_town}",
    "       -> not_anchorable_by_geography (administrative_or_locality_kind)",
    '3. role === "hub"          -> not_anchorable_by_geography (hub_role)',
    '4. role === "standalone"   -> not_anchorable_by_geography (standalone_regional_role)',
    '5. role === "poi"          -> anchorable, even when kind is null',
    "6. role === null && kind === null",
    "       -> hold_for_review (destination_semantics_unclassified)",
    "7. role === null + known non-administrative kind -> anchorable",
    "8. any other role           -> hold_for_review (unknown_or_legacy_role)",
    "```",
    "",
    "Then, only for anchorable destinations, the fixed 500 m rule:",
    "`0 -> unavailable`, `1 -> geographic_unique_candidate`, `>1 -> ambiguous`.",
    "",
    "No closest-wins. Station complexes are never collapsed. Nothing widens the",
    "radius. `hold_for_review` is a real status, not a soft pass.",
    "",
    "## Semantic scope",
    "",
    "A `geographic_unique_candidate` anchor means **only** that under Meguruto's",
    "fixed geographic anchor policy exactly one pilot ODPT station was identified",
    "for that destination. It does not claim the destination recommends that",
    "station, and it carries **no** claim about station → POI access.",
    "",
    "`not_anchorable_by_geography` is **not** `not_anchorable`: it forbids deriving",
    "an anchor from an area's representative coordinates, while rule 1 may still",
    "anchor the same destination on explicit evidence.",
    "",
  );
  return lines.join("\n");
}

/* ────────────────────────────────────────────────────────────────────────────
 * CLI: regenerate the committed anchor artifacts.
 *
 * Run with: npx tsx scripts/audit/kai-291a-destination-station-identity.ts
 *
 * Deterministic and environment independent: it reads two committed inputs and
 * writes two artifacts, and it consumes NO clock and NO ambient environment
 * variable, so identical inputs produce identical bytes locally and in CI. It
 * makes NO provider call — the reviewed station index is the static evidence.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Bumped when the anchor RULE changes, so an artifact's age is legible. */
export const ANCHOR_AUDIT_VERSION = "kai-291a-final-policy-v3";

export const CATALOGUE_INPUT_PATH = "src/shared/data/destinations-index.json";
export const STATION_INDEX_INPUT_PATH = "qa/kai-291/pilot-station-index.json";
export const ANCHORS_ARTIFACT_PATH =
  "qa/kai-291/destination-station-anchors.json";
export const REPORT_ARTIFACT_PATH = "qa/kai-291/destination-station-anchors.md";

/** Validation cohort kinds: the records that already carry stronger evidence. */
export const VALIDATION_EVIDENCE_KINDS: readonly string[] = Object.freeze([
  "verified_required_access",
  "verified_walking",
]);

interface StationIndexFile {
  readonly pilotOperators?: readonly string[];
  readonly sourceBoundary?: string;
  readonly stationCount?: number;
  readonly providerRetrievedAt?: Readonly<Record<string, readonly string[]>>;
  readonly stations?: readonly PilotStationEntry[];
}

interface CatalogueRecord extends AnchorDestination {
  readonly localTransport?: {
    readonly kind?: string;
    readonly basis?: string;
    readonly walkingEvidence?: string;
    readonly segmentNotes?: string;
  } | null;
}

/** Loads and validates the reviewed station index. */
export function loadStationIndex(
  readFile: (path: string) => string,
  path: string = STATION_INDEX_INPUT_PATH,
): {
  readonly stations: readonly PilotStationEntry[];
  readonly file: StationIndexFile;
} {
  const file = JSON.parse(readFile(path)) as StationIndexFile;
  const stations = file.stations;
  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error(
      `Pilot station index at ${path} carries no stations. Refusing to build an ` +
        `anchor registry from an unreadable or empty station set.`,
    );
  }
  const withCoordinates = stations.filter((station) =>
    isValidCoordinates(station.coordinates),
  );
  if (withCoordinates.length === 0) {
    throw new Error(
      `Pilot station index at ${path} has no coordinate-bearing stations, so the ` +
        `geographic rule cannot run.`,
    );
  }
  return { stations, file };
}

/** Loads the catalogue. Fails loudly on an unrecognized shape. */
export function loadCatalogue(
  readFile: (path: string) => string,
  path: string = CATALOGUE_INPUT_PATH,
): readonly CatalogueRecord[] {
  const parsed = JSON.parse(readFile(path)) as unknown;
  const records = Array.isArray(parsed)
    ? parsed
    : (parsed as { destinations?: unknown }).destinations;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(
      `Catalogue at ${path} did not yield a non-empty record array. Refusing to ` +
        `report coverage derived from an unreadable input.`,
    );
  }
  return records as readonly CatalogueRecord[];
}

/** Assembles the committed registry artifact (deterministic, no clock/env). */
export function buildAnchorArtifact(args: {
  readonly report: AnchorCoverageReport;
  readonly validation: readonly ValidationRow[];
  readonly stationIndex: StationIndexFile;
  readonly stationCount: number;
  readonly catalogueCount: number;
  readonly reviewTable?: readonly AnchorReviewRow[];
  readonly roleDrift?: readonly RoleDriftRow[];
}): Record<string, unknown> {
  const { report, validation, stationIndex, stationCount } = args;
  const providerRetrievedAt = stationIndex.providerRetrievedAt ?? {};
  const reviewByDestination = new Map(
    (args.reviewTable ?? []).map((row) => [row.destinationId, row]),
  );

  return {
    schemaVersion: 2,
    kind: "kai-291a-destination-station-anchors",
    auditVersion: ANCHOR_AUDIT_VERSION,
    evidencePath: ANCHOR_EVIDENCE_PATH,
    method: "offline_geographic_rule_with_anchorability_gate",
    networkCalls: 0,
    providerCalls: 0,
    /**
     * Semantic scope, stated in the artifact itself: an anchor means ONLY that
     * exactly one pilot ODPT station fell inside the fixed tolerance. It is not a
     * curated access mapping and says nothing about station -> POI access.
     */
    semantics:
      "geographic_unique_candidate: under Meguruto's fixed geographic anchor " +
      "policy exactly one pilot ODPT station was identified for this " +
      "destination. NOT a destination-recommended arrival station, and no claim " +
      "about station -> POI access.",
    /**
     * Anchorability is decided BEFORE any candidate count is interpreted, from the
     * destination's own coordinate semantics. Excluded destinations may still be
     * anchored later through a stronger explicit evidence path.
     */
    anchorabilityPolicy: {
      precedence: [
        "1. explicit/canonical exact station evidence -> stronger evidence path",
        "2. administrative/locality kind -> not_anchorable_by_geography",
        "3. role === hub -> not_anchorable_by_geography",
        "4. role === standalone -> not_anchorable_by_geography",
        "5. role === poi -> anchorable (even when kind is null)",
        "6. role === null && kind === null -> hold_for_review",
        "7. role === null + known non-administrative kind -> anchorable",
        "8. any other role -> hold_for_review",
      ],
      knownRoles: KNOWN_DESTINATION_ROLES,
      excludedWhenKindIs: NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS,
      notAnchorableReasons: ANCHORABILITY_REASONS,
      holdReasons: HOLD_REASONS,
      strictness:
        "kind exclusions are strict for now; the set is intentionally narrow and " +
        "may be broadened later with evidence. No kind is 'less anchorable' and " +
        "none is treated as partially anchorable.",
      semantics:
        "not_anchorable_by_geography forbids deriving an anchor from an area's " +
        "representative coordinates. It is NOT a permanent not_anchorable: rule 1 " +
        "explicit evidence may still anchor the same destination.",
    },
    /**
     * The six geographic statuses partition the evaluated destinations. Rule 1
     * anchors are counted separately and are NOT part of this partition.
     */
    statusPartition: report.statusPartition,
    partitionSemantics:
      "The six geographic statuses are mutually exclusive and exhaustive over " +
      "destinations evaluated by the geographic rule, and sum to " +
      "(destinationsEvaluated - canonicalExplicitStation). canonical_explicit_station " +
      "is reported separately because rule 1 removes a record from the geographic " +
      "rule entirely; counting it as a geographic finding would misreport it.",
    toleranceMeters: report.toleranceMeters,
    inputs: {
      catalogue: CATALOGUE_INPUT_PATH,
      stationIndex: STATION_INDEX_INPUT_PATH,
      stationCount,
      pilotOperators: stationIndex.pilotOperators ?? PILOT_OPERATORS,
      providerBoundary: stationIndex.sourceBoundary ?? null,
      providerRetrievedAt,
    },
    summary: {
      destinationsEvaluated: report.destinationsEvaluated,
      uniqueAnchors: report.uniqueAnchors,
      canonicalExplicitStation: report.canonicalExplicitStation,
      productionReadyAnchors: report.productionReadyAnchors,
      ambiguous: report.ambiguous,
      unavailable: report.unavailable,
      coordinatesAbsent: report.coordinatesAbsent,
      notAnchorableByGeography: report.notAnchorableByGeography,
      holdForReview: report.holdForReview,
      notAnchorableReasons: report.notAnchorableReasons,
      holdReasons: report.holdReasons,
      destinationsWithoutCoordinates: report.destinationsWithoutCoordinates,
      candidateCountDistribution: report.candidateCountDistribution,
      anchorsByOperator: report.anchorsByOperator,
      anchorsByRailway: report.anchorsByRailway,
      distanceMetersStats: report.distanceMetersStats,
    },
    /**
     * The registry. A destination ABSENT from this list has no geographic anchor —
     * see `summary`, `ambiguousDestinations`, `notAnchorableDestinations` and
     * `coordinatesAbsentDestinations`.
     */
    anchors: report.anchors.map((verdict) => {
      // Carry the semantic verdict onto each registry entry, so a consumer cannot
      // mistake a `hold_for_review` anchor for a trustworthy one.
      const review = reviewByDestination.get(verdict.destinationId);
      return {
        destinationId: verdict.destinationId,
        semanticClassification: review?.semanticClassification ?? null,
        proposedOutcome: review?.proposedOutcome ?? null,
        odptStationId: verdict.anchor?.odptStationId ?? null,
        operator: verdict.anchor?.operator ?? null,
        railway: verdict.anchor?.railway ?? null,
        stationTitle: verdict.anchor?.stationTitle ?? null,
        destinationCoordinates: verdict.destinationCoordinates,
        distanceMeters: verdict.distanceMeters,
        provenance: {
          evidencePath: verdict.evidencePath,
          toleranceMeters: verdict.toleranceMeters,
          candidateCount: verdict.candidateCount,
          candidateIdentities: verdict.candidateIdentities,
          providerBoundary: stationIndex.sourceBoundary ?? null,
          providerRetrievedAt,
          auditVersion: ANCHOR_AUDIT_VERSION,
        },
      };
    }),
    ambiguousDestinations: report.ambiguousDestinations,
    notAnchorableDestinations: report.notAnchorableDestinations.map(
      (entry) => ({
        destinationId: entry.destinationId,
        anchorabilityReason: entry.reason,
        observedCandidateCount: entry.observedCandidateCount,
      }),
    ),
    /**
     * Review/diagnostic only. These records are held, not anchored, and appear in
     * no anchor total.
     */
    holdForReviewDestinations: report.holdDestinations.map((entry) => ({
      destinationId: entry.destinationId,
      holdReason: entry.reason,
      observedCandidateCount: entry.observedCandidateCount,
    })),
    roleDrift: args.roleDrift ?? [],
    coordinatesAbsentDestinations: report.coordinatesAbsentDestinations,
    validationCohort: validation,
  };
}

/** True when this module is the process entry point. */
function isMain(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== "string") return false;
  return import.meta.url === `file://${entry}`;
}

if (isMain()) {
  const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const { format } = await import("prettier");
  const readFile = (path: string) => readFileSync(path, "utf8");

  // Emit repository-formatted bytes, so the committed artifacts satisfy the
  // format gate AND regeneration reproduces them byte-for-byte. Without this the
  // generator's raw output would differ from the committed (Prettier-formatted)
  // files, silently breaking the byte-identity contract.
  const formatJson = async (text: string) =>
    await format(text, { parser: "json" });
  const formatMarkdown = async (text: string) =>
    await format(text, { parser: "markdown" });

  const { stations, file: stationIndex } = loadStationIndex(readFile);
  const catalogue = loadCatalogue(readFile);

  const report = buildAnchorCoverageReport(catalogue, stations);
  const matrix = buildSemanticMatrix(catalogue, stations);
  const reviewTable = buildAnchorReviewTable(catalogue, stations);
  const roleDrift = buildRoleDriftReport(catalogue);
  const validation = compareValidationCohort(
    catalogue.filter((record) =>
      VALIDATION_EVIDENCE_KINDS.includes(record.localTransport?.kind ?? ""),
    ),
    stations,
  );

  const artifact = buildAnchorArtifact({
    report,
    validation,
    reviewTable,
    roleDrift,
    stationIndex,
    stationCount: stations.length,
    catalogueCount: catalogue.length,
  });
  (artifact as Record<string, unknown>).anchorReviewTable = reviewTable;
  (artifact as Record<string, unknown>).semanticMatrix = matrix;

  for (const path of [ANCHORS_ARTIFACT_PATH, REPORT_ARTIFACT_PATH]) {
    mkdirSync(dirname(path), { recursive: true });
  }
  writeFileSync(
    ANCHORS_ARTIFACT_PATH,
    await formatJson(`${JSON.stringify(artifact, null, 2)}\n`),
    "utf8",
  );
  writeFileSync(
    REPORT_ARTIFACT_PATH,
    await formatMarkdown(
      `${renderAnchorReport(report, validation, reviewTable, matrix, roleDrift)}\n`,
    ),
    "utf8",
  );

  const tally = (values: readonly string[]) =>
    JSON.stringify(
      values.reduce<Record<string, number>>((acc, value) => {
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {}),
    );
  const d = report.distanceMetersStats;
  const partitionSum = Object.values(report.statusPartition).reduce(
    (sum, value) => sum + value,
    0,
  );
  const legacyRoles = roleDrift.filter((row) => !row.knownRole);
  process.stdout.write(
    `wrote ${ANCHORS_ARTIFACT_PATH} and ${REPORT_ARTIFACT_PATH}\n` +
      `  tolerance=${report.toleranceMeters}m ` +
      `evaluated=${report.destinationsEvaluated}\n` +
      `  partition=${JSON.stringify(report.statusPartition)}\n` +
      `  partitionSum=${partitionSum} ` +
      `canonical=${report.canonicalExplicitStation} ` +
      `expected=${report.destinationsEvaluated}\n` +
      `  productionReadyAnchors=${report.productionReadyAnchors} ` +
      `(geographic=${report.uniqueAnchors} + canonical=${report.canonicalExplicitStation})\n` +
      `  notAnchorableReasons=${JSON.stringify(report.notAnchorableReasons)}\n` +
      `  holdReasons=${JSON.stringify(report.holdReasons)}\n` +
      `  held = ${JSON.stringify(
        report.holdDestinations.map((entry) => entry.destinationId),
      )}\n` +
      `  withoutCoords(overlapping)=${report.destinationsWithoutCoordinates}\n` +
      `  distribution=${JSON.stringify(report.candidateCountDistribution)}\n` +
      `  byOperator=${JSON.stringify(report.anchorsByOperator)}\n` +
      `  distance min=${d.min?.toFixed(1) ?? "n/a"} median=${
        d.median?.toFixed(1) ?? "n/a"
      } max=${d.max?.toFixed(1) ?? "n/a"}\n` +
      `  uniqueCandidates reviewed=${reviewTable.length} outcomes=${tally(
        reviewTable.map((row) => row.proposedOutcome),
      )}\n` +
      `  matrixCells=${matrix.length}\n` +
      `  legacyRoles=${JSON.stringify(
        legacyRoles.map((row) => ({
          role: row.role,
          records: row.totalRecords,
          missingKind: row.withMissingKind,
        })),
      )}\n` +
      `  validation=${tally(validation.map((row) => row.verdict))}\n`,
  );
}
