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
});

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
  readonly coordinates?: AnchorCoordinates | null;
  readonly localTransport?: unknown;
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
  const distances: number[] = [];

  for (const verdict of verdicts) {
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
    anchors,
    ambiguousDestinations,
    coordinatesAbsentDestinations,
  };
}

/** One row of the validation-cohort comparison. */
export interface ValidationRow {
  readonly destinationId: string;
  readonly existingEvidenceKind: string;
  readonly stationNamesInEvidence: readonly string[];
  readonly anchorStationTitle: string | null;
  readonly anchorStationTitleEn: string | null;
  readonly verdict:
    | "agrees"
    | "names_other_station"
    | "no_station_named"
    | "anchor_unavailable"
    | "anchor_ambiguous";
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
 * Compares the geographic anchor against a record's EXISTING stronger access
 * evidence, where that evidence is specific enough to compare.
 *
 * Reports agreement only; it never overrides geography, and a disagreement is
 * surfaced rather than silently reconciled.
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
    if (verdict.status === ANCHOR_STATUS.AMBIGUOUS) {
      result = "anchor_ambiguous";
    } else if (verdict.status !== ANCHOR_STATUS.ANCHORED) {
      result = "anchor_unavailable";
    } else if (names.length === 0) {
      result = "no_station_named";
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
      result = agrees ? "agrees" : "names_other_station";
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
): string {
  const validationCounts: Record<string, number> = {};
  for (const row of validation) {
    validationCounts[row.verdict] = (validationCounts[row.verdict] ?? 0) + 1;
  }
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
    `- Coordinates absent: **${report.coordinatesAbsent}**`,
    "",
    "## Candidate-count distribution (stations within tolerance)",
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
  for (const [operator, count] of Object.entries(
    report.anchorsByOperator,
  ).sort()) {
    lines.push(`| ${operator} | ${count} |`);
  }
  lines.push(
    "",
    "## Anchors by railway",
    "",
    "| Railway | Anchors |",
    "| --- | --- |",
  );
  for (const [railway, count] of Object.entries(
    report.anchorsByRailway,
  ).sort()) {
    lines.push(`| ${railway} | ${count} |`);
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
    "## Validation cohort (existing stronger access evidence)",
    "",
    "Reported for comparison only — it never overrides geography.",
    "",
    "| Verdict | Records |",
    "| --- | --- |",
  );
  for (const [verdict, count] of Object.entries(validationCounts).sort()) {
    lines.push(`| ${verdict} | ${count} |`);
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
export const ANCHOR_AUDIT_VERSION = "kai-291a-geographic-v1";

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

interface CatalogueRecord {
  readonly id?: string;
  readonly name?: string;
  readonly coordinates?: AnchorCoordinates | null;
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
}): Record<string, unknown> {
  const { report, validation, stationIndex, stationCount } = args;
  const providerRetrievedAt = stationIndex.providerRetrievedAt ?? {};

  return {
    schemaVersion: 1,
    kind: "kai-291a-destination-station-anchors",
    auditVersion: ANCHOR_AUDIT_VERSION,
    evidencePath: ANCHOR_EVIDENCE_PATH,
    method: "offline_geographic_rule",
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
      candidateCountDistribution: report.candidateCountDistribution,
      anchorsByOperator: report.anchorsByOperator,
      anchorsByRailway: report.anchorsByRailway,
      distanceMetersStats: report.distanceMetersStats,
    },
    /**
     * The registry. A destination ABSENT from this list has no anchor (it was
     * either `unavailable`, `ambiguous`, or had no coordinates) — see the
     * summary and the two explicit lists below.
     */
    anchors: report.anchors.map((verdict) => ({
      destinationId: verdict.destinationId,
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
    })),
    ambiguousDestinations: report.ambiguousDestinations,
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
  const validation = compareValidationCohort(
    catalogue.filter((record) =>
      VALIDATION_EVIDENCE_KINDS.includes(record.localTransport?.kind ?? ""),
    ),
    stations,
  );

  const artifact = buildAnchorArtifact({
    report,
    validation,
    stationIndex,
    stationCount: stations.length,
    catalogueCount: catalogue.length,
  });

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
    await formatMarkdown(`${renderAnchorReport(report, validation)}\n`),
    "utf8",
  );

  const d = report.distanceMetersStats;
  process.stdout.write(
    `wrote ${ANCHORS_ARTIFACT_PATH} and ${REPORT_ARTIFACT_PATH}\n` +
      `  tolerance=${report.toleranceMeters}m ` +
      `evaluated=${report.destinationsEvaluated} ` +
      `anchors=${report.uniqueAnchors} ` +
      `ambiguous=${report.ambiguous} ` +
      `unavailable=${report.unavailable} ` +
      `noCoords=${report.coordinatesAbsent}\n` +
      `  distribution=${JSON.stringify(report.candidateCountDistribution)}\n` +
      `  byOperator=${JSON.stringify(report.anchorsByOperator)}\n` +
      `  distance min=${d.min?.toFixed(1) ?? "n/a"} median=${
        d.median?.toFixed(1) ?? "n/a"
      } max=${d.max?.toFixed(1) ?? "n/a"}\n` +
      `  validation=${JSON.stringify(
        validation.reduce<Record<string, number>>((acc, row) => {
          acc[row.verdict] = (acc[row.verdict] ?? 0) + 1;
          return acc;
        }, {}),
      )}\n`,
  );
}
