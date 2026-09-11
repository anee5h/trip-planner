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
 * `odptStationIdentity.ts`, which is module-private). The DECISION is never made
 * with this constant: `resolveOdptStationIdentity` is always called WITHOUT a
 * tolerance option, so it applies its own default. This value is recorded in the
 * artifact for provenance and used to compute the reporting histogram.
 *
 * A test asserts the two agree at the boundary (just inside vs just outside), so
 * this cannot silently drift away from the resolver's real policy.
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

/** Fail-closed statuses for one destination. */
export const ANCHOR_STATUS = Object.freeze({
  /** Exactly one exact pilot ODPT station inside the fixed tolerance. */
  ANCHORED: "anchored",
  /** No pilot station inside the tolerance. Not a claim that none exists. */
  UNAVAILABLE: "unavailable",
  /** More than one pilot station inside the tolerance. Never broken by distance. */
  AMBIGUOUS: "ambiguous",
  /** The destination carries no coordinates, so the rule cannot run. */
  COORDINATES_ABSENT: "coordinates_absent",
  /**
   * The destination's own coordinates do NOT represent a localised visitor
   * destination, so geographic derivation is forbidden for it.
   *
   * Deliberately NOT `not_anchorable`: an administrative area could later receive
   * an anchor through an explicit canonical mapping or a curated access station.
   * What is forbidden is deriving that anchor from its REPRESENTATIVE coordinates.
   */
  NOT_ANCHORABLE_BY_GEOGRAPHY: "not_anchorable_by_geography",
});

/**
 * Why a destination may not be geographically anchored.
 *
 * These are reasons about COORDINATE SEMANTICS, not about the geographic
 * resolver, which is correct.
 */
export const ANCHORABILITY_REASONS = Object.freeze({
  HUB_ROLE: "hub_role",
  ADMINISTRATIVE_OR_LOCALITY_KIND: "administrative_or_locality_kind",
});

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

/** Reasons an anchor could not be established. */
export const ANCHOR_BLOCKERS = Object.freeze([
  "destination_coordinates_absent",
  "no_pilot_station_within_tolerance",
  "multiple_pilot_stations_within_tolerance",
]);

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
}

/** Whether a destination's coordinates may be used for geographic derivation. */
export interface AnchorabilityVerdict {
  readonly anchorable: boolean;
  readonly reason: string | null;
}

/**
 * Decides anchorability from the destination's OWN semantics, BEFORE any ODPT
 * candidate count is interpreted.
 *
 * A hub or an administrative/locality kind is excluded regardless of how many or
 * how few stations sit inside the tolerance.
 */
export function isGeographicallyAnchorable(
  destination: AnchorDestination,
): AnchorabilityVerdict {
  if (destination.role === "hub") {
    return { anchorable: false, reason: ANCHORABILITY_REASONS.HUB_ROLE };
  }
  const kind = destination.kind ?? null;
  if (kind !== null && NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS.includes(kind)) {
    return {
      anchorable: false,
      reason: ANCHORABILITY_REASONS.ADMINISTRATIVE_OR_LOCALITY_KIND,
    };
  }
  return { anchorable: true, reason: null };
}

/** Audit-only semantic classification of a record's coordinate meaning. */
export function semanticClassification(
  destination: AnchorDestination,
): "administrative/regional" | "requires_review" | "point/site-like" {
  if (!isGeographicallyAnchorable(destination).anchorable) {
    return "administrative/regional";
  }
  // An UNCLASSIFIED record cannot be semantically validated: neither role nor kind
  // says what its coordinate denotes. Flagged generally rather than by id.
  if (
    (destination.role ?? null) === null &&
    (destination.kind ?? null) === null
  ) {
    return "requires_review";
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

  // ── Anchorability FIRST. A destination whose coordinates denote an area rather
  // than a localised visitor destination never reaches the geographic rule, so its
  // candidate count can never become an anchor.
  const anchorability = isGeographicallyAnchorable(destination);
  if (!anchorability.anchorable) {
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
      status: ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY,
      blocker: anchorability.reason,
      evidencePath: null,
      toleranceMeters,
      // Observational only. Recorded so the semantic matrix can show what
      // geography WOULD have said, without ever emitting an anchor from it.
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
    { coordinates: destinationCoordinates },
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
      status: ANCHOR_STATUS.ANCHORED,
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
  readonly uniqueAnchors: number;
  readonly ambiguous: number;
  readonly unavailable: number;
  readonly coordinatesAbsent: number;
  /** Excluded before the geographic rule by coordinate semantics. */
  readonly notAnchorableByGeography: number;
  /**
   * Destinations lacking usable coordinates, counted across ALL statuses.
   *
   * Deliberately OVERLAPPING with the status partition above rather than folded
   * into it: the anchorability gate runs first, so a hub with no coordinates is
   * reported as `not_anchorable_by_geography`. Counting coordinate absence only
   * through the `coordinates_absent` status would hide that gap (and report zero).
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
  const distances: number[] = [];

  for (const verdict of verdicts) {
    // Excluded by coordinate semantics before the geographic rule ran, so its
    // candidate count is observational and must not enter the distribution.
    if (verdict.status === ANCHOR_STATUS.NOT_ANCHORABLE_BY_GEOGRAPHY) {
      notAnchorableDestinations.push({
        destinationId: verdict.destinationId,
        reason: verdict.blocker,
        observedCandidateCount: verdict.candidateCount,
      });
      continue;
    }
    // The distribution is over destinations the rule could actually run for.
    if (verdict.destinationCoordinates !== null) {
      const bucket = histogramBucket(verdict.candidateCount);
      candidateCountDistribution[bucket] += 1;
    }
    if (verdict.status === ANCHOR_STATUS.ANCHORED) {
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
    uniqueAnchors: anchors.length,
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
    destinationsWithoutCoordinates: destinations.filter(
      (destination) => !isValidCoordinates(destination.coordinates),
    ).length,
    anchors,
    ambiguousDestinations,
    coordinatesAbsentDestinations,
    notAnchorableDestinations,
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
  readonly provisionallyAnchorable: number;
  readonly provisionallyNotAnchorable: number;
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
        provisionallyAnchorable: 0,
        provisionallyNotAnchorable: 0,
      };
      cells.set(key, cell);
    }

    const anchorable = isGeographicallyAnchorable(destination).anchorable;
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
    if (anchorable) cell.provisionallyAnchorable += 1;
    else cell.provisionallyNotAnchorable += 1;
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
  readonly proposedOutcome:
    | "geographic_unique_candidate"
    | "not_anchorable_by_geography"
    | "hold_for_review";
}

/**
 * Reviews EVERY destination that geography would resolve uniquely, including those
 * the anchorability rule excludes — so the excluded ones stay visible with their
 * observed count instead of disappearing from the audit.
 *
 * Selection is by observed candidate count, never by destination id.
 */
export function buildAnchorReviewTable(
  destinations: readonly AnchorDestination[],
  stations: readonly PilotStationEntry[],
  toleranceMeters: number = GEOGRAPHIC_TOLERANCE_METERS,
): readonly AnchorReviewRow[] {
  const rows: AnchorReviewRow[] = [];
  for (const destination of destinations) {
    if (!isValidCoordinates(destination.coordinates)) continue;
    const within = stationsWithinTolerance(
      destination.coordinates,
      stations,
      toleranceMeters,
    );
    if (within.length !== 1) continue;

    const classification = semanticClassification(destination);
    const verdict = classifyGeographicAnchor(
      destination,
      stations,
      toleranceMeters,
    );
    const anchorable = isGeographicallyAnchorable(destination).anchorable;
    const proposedOutcome: AnchorReviewRow["proposedOutcome"] = !anchorable
      ? "not_anchorable_by_geography"
      : classification === "requires_review"
        ? "hold_for_review"
        : "geographic_unique_candidate";

    const stationEntry = within[0];
    rows.push({
      destinationId: destination.id,
      name: destination.name ?? null,
      nameJa: destination.nameJa ?? null,
      role: destination.role ?? null,
      kind: destination.kind ?? null,
      destinationCoordinates: destination.coordinates,
      observedCandidateCount: within.length,
      anchorStationId: stationEntry.sameAs,
      anchorStationTitleEn: stationEntry.stationTitle?.en ?? null,
      operator: stationEntry.operator,
      railway: stationEntry.railway,
      distanceMeters:
        stationEntry.coordinates === null
          ? null
          : distanceMeters(destination.coordinates, stationEntry.coordinates),
      semanticClassification: classification,
      proposedOutcome,
    });
  }
  return rows.sort((left, right) =>
    left.destinationId.localeCompare(right.destinationId),
  );
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
    if (verdict.status !== ANCHOR_STATUS.ANCHORED) {
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
): string {
  const count = (values: readonly string[]) => {
    const out: Record<string, number> = {};
    for (const value of values) out[value] = (out[value] ?? 0) + 1;
    return out;
  };
  const validationCounts = count(validation.map((row) => row.verdict));
  const reviewCounts = count(reviewTable.map((row) => row.proposedOutcome));

  const cell = (value: string | null) => value ?? "(none)";
  const lines = [
    "# KAI-291A — destination → exact ODPT arrival-station identity coverage",
    "",
    "Geographic anchor registry for the **TokyoMetro + Toei** pilot, built with the",
    "existing `odptStationIdentity` geographic evidence path.",
    "",
    `- Tolerance (fixed, reused from the existing resolver default): **${report.toleranceMeters} m**`,
    `- Destinations evaluated: **${report.destinationsEvaluated}**`,
    `- Unique geographic anchors: **${report.uniqueAnchors}**`,
    `- Ambiguous (more than one station within tolerance): **${report.ambiguous}**`,
    `- Unavailable (no station within tolerance): **${report.unavailable}**`,
    `- **Not anchorable by geography** (coordinates denote an area): **${report.notAnchorableByGeography}**`,
    `- Coordinates absent (status): **${report.coordinatesAbsent}**`,
    `- Destinations without coordinates (any status, overlapping): **${report.destinationsWithoutCoordinates}**`,
    "",
    "The five statuses above partition all evaluated destinations (they sum to the",
    "total). The coordinate diagnostic is deliberately overlapping, because the",
    "anchorability gate runs first and would otherwise mask a coordinate-less hub.",
    "",

    "## Candidate-count distribution (anchorable destinations)",
    "",
    "| Candidates | Destinations |",
    "| --- | --- |",
  ];
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
    "Every destination geography would resolve uniquely, **including the ones the",
    "anchorability rule excludes**, so nothing disappears from the audit. Selection is",
    "by observed candidate count, never by destination id.",
    "",
    "| Destination | EN / JA | role | kind | ODPT station | railway | d (m) | classification | proposed outcome |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of reviewTable) {
    lines.push(
      `| \`${row.destinationId}\` | ${cell(row.name)} / ${cell(row.nameJa)} | ` +
        `${cell(row.role)} | ${cell(row.kind)} | \`${cell(row.anchorStationId)}\` | ` +
        `${cell(row.railway)} | ${row.distanceMeters === null ? "n/a" : row.distanceMeters.toFixed(0)} | ` +
        `${row.semanticClassification} | ${row.proposedOutcome} |`,
    );
  }
  lines.push(
    "",
    `Proposed outcomes: ${Object.entries(reviewCounts)
      .sort()
      .map(([k, v]) => `**${k}** ${v}`)
      .join(" · ")}`,
    "",
    "## Semantic matrix (role × kind, whole catalogue)",
    "",
    "| role | kind | total | w/ coords | 0 | 1 | 2 | 3 | 4+ | unique cand. | anchorable | not anchorable |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of matrix) {
    const c = row.candidateCounts;
    lines.push(
      `| ${cell(row.role)} | ${cell(row.kind)} | ${row.totalRecords} | ${row.withCoordinates} | ` +
        `${c["0"]} | ${c["1"]} | ${c["2"]} | ${c["3"]} | ${c["4+"]} | ` +
        `${row.uniqueGeographicCandidates} | ${row.provisionallyAnchorable} | ` +
        `${row.provisionallyNotAnchorable} |`,
    );
  }
  lines.push(
    "",
    "## Validation cohort (existing stronger access evidence)",
    "",
    "Reported for comparison only. Geographic **anchorability** is decided by",
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
    "## Semantic scope",
    "",
    "An anchor's evidence path is `geographic_unique_candidate`. It means **only**",
    "that under Meguruto's fixed geographic anchor policy exactly one pilot ODPT",
    "station could be identified for this destination. It does **not** claim the",
    "destination recommends that station, and it carries **no** claim about",
    "station → POI access.",
    "",
    "`not_anchorable_by_geography` is **not** `not_anchorable`. It forbids deriving an",
    "anchor from an area's representative coordinates; a stronger explicit evidence",
    "path (canonical mapping, curated access station) may still anchor such a",
    "destination later.",
    "",
    "## Proposed production policy",
    "",
    "The smallest deterministic rule the evidence supports:",
    "",
    "```",
    "if an explicit/canonical station anchor exists:",
    "    use the stronger evidence path   (geographic derivation is not used)",
    "else if not geographically anchorable:",
    '    role === "hub"  ->  not_anchorable_by_geography (hub_role)',
    "    kind in {city, ward, town, village, district, historic_town}",
    "                     ->  not_anchorable_by_geography (administrative_or_locality_kind)",
    "else:",
    "    fixed 500 m rule",
    "    0 candidates      ->  unavailable",
    "    1 exact candidate ->  geographic_unique_candidate",
    "    >1                ->  ambiguous",
    "```",
    "",
    "No closest-wins. Station complexes are never collapsed. Nothing widens the radius.",
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
export const ANCHOR_AUDIT_VERSION = "kai-291a-geographic-v2";

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
      excludedWhenRoleIs: ["hub"],
      excludedWhenKindIs: NOT_GEOGRAPHICALLY_ANCHORABLE_KINDS,
      reasons: ANCHORABILITY_REASONS,
      notInScopeOfExclusionYet: [
        "park",
        "garden",
        "mountain",
        "lake",
        "island",
        "beach",
        "market",
        "street",
        "nature",
        "natural",
        "mixed",
      ],
      semantics:
        "not_anchorable_by_geography forbids deriving an anchor from an area's " +
        "representative coordinates. It is NOT a permanent not_anchorable: an " +
        "explicit canonical mapping or curated access station may still anchor it.",
    },
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
      ambiguous: report.ambiguous,
      unavailable: report.unavailable,
      coordinatesAbsent: report.coordinatesAbsent,
      notAnchorableByGeography: report.notAnchorableByGeography,
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
      `${renderAnchorReport(report, validation, reviewTable, matrix)}\n`,
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
  process.stdout.write(
    `wrote ${ANCHORS_ARTIFACT_PATH} and ${REPORT_ARTIFACT_PATH}\n` +
      `  tolerance=${report.toleranceMeters}m ` +
      `evaluated=${report.destinationsEvaluated} ` +
      `anchors=${report.uniqueAnchors} ` +
      `ambiguous=${report.ambiguous} ` +
      `unavailable=${report.unavailable} ` +
      `notAnchorableByGeography=${report.notAnchorableByGeography} ` +
      `coordsAbsentStatus=${report.coordinatesAbsent} ` +
      `withoutCoords=${report.destinationsWithoutCoordinates}\n` +
      `  distribution=${JSON.stringify(report.candidateCountDistribution)}\n` +
      `  byOperator=${JSON.stringify(report.anchorsByOperator)}\n` +
      `  distance min=${d.min?.toFixed(1) ?? "n/a"} median=${
        d.median?.toFixed(1) ?? "n/a"
      } max=${d.max?.toFixed(1) ?? "n/a"}\n` +
      `  uniqueCandidates reviewed=${reviewTable.length} proposals=${tally(
        reviewTable.map((row) => row.proposedOutcome),
      )}\n` +
      `  matrixCells=${matrix.length}\n` +
      `  validation=${tally(validation.map((row) => row.verdict))}\n`,
  );
}
