/**
 * KAI-290 — deterministic ODPT station identity resolution.
 *
 * `/places/odpt:Station` is NOT the resolver. KAI-289's authenticated production
 * smoke showed why: geographic discovery only works for operators whose station
 * records carry `geo:lat`/`geo:long`, and JR-East had 0/134 stations with
 * coordinates while TokyoMetro had 186/186 and Toei 149/149. A resolver built on
 * `/places` would silently exclude one of Japan's most important rail operators.
 *
 * So identity is decided by explicit evidence paths, in a fixed precedence
 * order, and each path is reported so a later benchmark can attribute match
 * quality to a mechanism:
 *
 *   1. `exact_identity`            — a known ODPT identity (owl:sameAs / ucode)
 *   2. `canonical_mapping`         — an explicit Meguruto→ODPT canonical mapping
 *   3. `operator_railway_identity` — exact name AND operator AND railway evidence
 *   4. `geographic`                — a coordinate candidate, where coverage exists
 *   5. `connecting_station`        — explicit connectingStation/connectingRailway
 *   6. unresolved / ambiguous
 *
 * Deliberate constraints:
 * - No fuzzy or similarity matching ever produces `matched`. Comparison
 *   normalization (Unicode, case, whitespace) is safe; partial or approximate
 *   string equality is not.
 * - A station NAME alone is never identity evidence. "Tokyo" matches several
 *   operators/railways, so it stays ambiguous unless operator/railway (or an
 *   explicit mapping) settles it.
 * - Coordinates are never invented. A candidate without coordinates can never
 *   match geographically.
 * - A path that leaves more than one candidate is `ambiguous`, not a guess.
 */

import type { OdptStation } from "./OdptProvider";

export type StationEvidencePath =
  | "exact_identity"
  | "canonical_mapping"
  | "operator_railway_identity"
  | "geographic"
  | "connecting_station";

export type StationMatchStatus = "matched" | "ambiguous" | "unmatched";

export interface StationCoordinates {
  readonly lat: number;
  readonly lng: number;
}

export interface StationIdentityInput {
  /** A known ODPT identity: `owl:sameAs` or `urn:ucode:_…`. */
  readonly odptId?: string | null;
  /** A Meguruto canonical station id, resolved via `canonicalMappings`. */
  readonly canonicalStationId?: string | null;
  /** Station name in any language (used only with operator+railway evidence). */
  readonly name?: string | null;
  /** Additional localized names, e.g. `{ ja: "東京", en: "Tokyo" }`. */
  readonly names?: Readonly<Record<string, string>> | null;
  readonly operator?: string | null;
  readonly railway?: string | null;
  readonly stationCode?: string | null;
  readonly coordinates?: StationCoordinates | null;
  /** Geographic tolerance in metres. Only used by the geographic path. */
  readonly maxDistanceMeters?: number;
  readonly connectingStationIds?: readonly string[] | null;
  readonly connectingRailwayIds?: readonly string[] | null;
}

export interface StationIdentityOptions {
  /**
   * Explicit canonical→ODPT mapping. A canonical id resolves ONLY when a
   * mapping is supplied; the resolver never guesses a mapping.
   */
  readonly canonicalMappings?: Readonly<Record<string, string>> | null;
  /** Default geographic tolerance (metres) when the input omits one. */
  readonly defaultMaxDistanceMeters?: number;
}

export interface StationMatchResult {
  readonly status: StationMatchStatus;
  readonly evidencePath: StationEvidencePath | null;
  readonly station: OdptStation | null;
  /** Number of candidates that survived the winning path. */
  readonly candidateCount: number;
  /** Candidates that satisfied the winning path (for inspection/benchmarks). */
  readonly candidates: readonly OdptStation[];
  readonly notes: readonly string[];
}

const DEFAULT_MAX_DISTANCE_METERS = 500;

/**
 * Conservative comparison normalization only: NFKC compatibility folding,
 * whitespace collapsing and case folding. This is not fuzzy matching — it makes
 * `"Ｔｏｋｙｏ"` and `"tokyo"` comparable, nothing more.
 */
export function normalizeStationName(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** Every localized name a station exposes, normalized for comparison. */
function candidateNames(station: OdptStation): Set<string> {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizeStationName(value);
    if (normalized) names.add(normalized);
  };
  add(station.title);
  for (const value of Object.values(station.stationTitle ?? {})) add(value);
  for (const value of Object.values(station.railwayTitle ?? {})) add(value);
  return names;
}

/** Great-circle distance in metres. */
export function distanceMeters(
  from: StationCoordinates,
  to: StationCoordinates,
): number {
  const R = 6_371_000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function identityKeys(station: OdptStation): string[] {
  return [station.sameAs, station.id, station.ucode].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function matched(
  station: OdptStation,
  path: StationEvidencePath,
  notes: string[] = [],
): StationMatchResult {
  return {
    status: "matched",
    evidencePath: path,
    station,
    candidateCount: 1,
    candidates: [station],
    notes,
  };
}

function ambiguous(
  candidates: readonly OdptStation[],
  notes: string[] = [],
): StationMatchResult {
  return {
    status: "ambiguous",
    evidencePath: null,
    station: null,
    candidateCount: candidates.length,
    candidates,
    notes,
  };
}

function unmatched(notes: string[] = []): StationMatchResult {
  return {
    status: "unmatched",
    evidencePath: null,
    station: null,
    candidateCount: 0,
    candidates: [],
    notes,
  };
}

/**
 * Resolves one station identity against a candidate set.
 *
 * The candidate set is whatever the caller obtained through the ODPT boundary —
 * typically an operator/railway-filtered `odpt:Station` query, optionally
 * augmented with `/places` results. This function performs no I/O.
 */
export function resolveOdptStationIdentity(
  input: StationIdentityInput,
  candidates: readonly OdptStation[],
  options: StationIdentityOptions = {},
): StationMatchResult {
  const notes: string[] = [];
  const usable = candidates.filter(
    (candidate): candidate is OdptStation =>
      candidate !== null &&
      typeof candidate === "object" &&
      typeof candidate.sameAs === "string" &&
      candidate.sameAs.length > 0,
  );

  // 1. Exact ODPT identity — the strongest evidence available.
  const odptId = typeof input.odptId === "string" ? input.odptId.trim() : "";
  if (odptId.length > 0) {
    const exact = usable.filter((candidate) =>
      identityKeys(candidate).includes(odptId),
    );
    if (exact.length === 1) return matched(exact[0], "exact_identity");
    if (exact.length > 1) {
      return ambiguous(exact, ["exact_identity_matched_multiple_records"]);
    }
    notes.push("exact_identity_not_present_in_candidates");
  }

  // 2. Explicit canonical mapping — only when the caller supplied one.
  const canonicalId =
    typeof input.canonicalStationId === "string"
      ? input.canonicalStationId.trim()
      : "";
  if (canonicalId.length > 0) {
    const mappings = options.canonicalMappings ?? null;
    const mapped =
      mappings !== null &&
      Object.prototype.hasOwnProperty.call(mappings, canonicalId)
        ? mappings[canonicalId]
        : undefined;
    if (typeof mapped === "string" && mapped.length > 0) {
      const found = usable.filter((candidate) =>
        identityKeys(candidate).includes(mapped),
      );
      if (found.length === 1) return matched(found[0], "canonical_mapping");
      if (found.length > 1) {
        return ambiguous(found, ["canonical_mapping_matched_multiple_records"]);
      }
      notes.push("canonical_mapping_target_not_present_in_candidates");
    } else {
      notes.push("no_canonical_mapping_for_id");
    }
  }

  // 3. Exact name + operator + railway. A name alone is never enough, so this
  //    path requires every one of those fields and compares exactly.
  const wantedName = normalizeStationName(input.name);
  const operator =
    typeof input.operator === "string" && input.operator.length > 0
      ? input.operator
      : null;
  const railway =
    typeof input.railway === "string" && input.railway.length > 0
      ? input.railway
      : null;
  if (wantedName !== null && operator !== null && railway !== null) {
    const extraNames = new Set<string>();
    for (const value of Object.values(input.names ?? {})) {
      const normalized = normalizeStationName(value);
      if (normalized) extraNames.add(normalized);
    }
    const byEvidence = usable.filter((candidate) => {
      if (candidate.operator !== operator) return false;
      if (candidate.railway !== railway) return false;
      if (
        input.stationCode != null &&
        input.stationCode.length > 0 &&
        candidate.stationCode !== input.stationCode
      ) {
        return false;
      }
      const names = candidateNames(candidate);
      if (names.has(wantedName)) return true;
      for (const extra of extraNames) if (names.has(extra)) return true;
      return false;
    });
    if (byEvidence.length === 1) {
      return matched(byEvidence[0], "operator_railway_identity");
    }
    if (byEvidence.length > 1) {
      return ambiguous(byEvidence, ["operator_railway_identity_ambiguous"]);
    }
    notes.push("no_operator_railway_name_match");
  } else if (wantedName !== null) {
    // An explicit, non-guessing refusal: a bare name is not identity evidence.
    notes.push("name_alone_is_not_identity_evidence");
  }

  // 4. Geographic candidate — only for records that actually carry coordinates.
  const coordinates = input.coordinates ?? null;
  if (coordinates !== null) {
    const tolerance =
      typeof input.maxDistanceMeters === "number" &&
      Number.isFinite(input.maxDistanceMeters) &&
      input.maxDistanceMeters > 0
        ? input.maxDistanceMeters
        : (options.defaultMaxDistanceMeters ?? DEFAULT_MAX_DISTANCE_METERS);
    const withCoordinates = usable.filter(
      (candidate) => candidate.coordinates !== null,
    );
    const coordinateLess = usable.length - withCoordinates.length;
    if (coordinateLess > 0) {
      notes.push(`geographic_path_skipped_${coordinateLess}_coordinate_less`);
    }
    const within = withCoordinates.filter(
      (candidate) =>
        candidate.coordinates !== null &&
        distanceMeters(coordinates, candidate.coordinates) <= tolerance,
    );
    if (within.length === 1) {
      // Keep the diagnostic notes: which candidates were unusable is useful
      // provenance for later benchmark attribution by matching mechanism.
      return matched(within[0], "geographic", notes);
    }
    if (within.length > 1) {
      // Narrow only by explicit identity evidence, never by "closest".
      const narrowed = within.filter((candidate) => {
        if (operator !== null && candidate.operator !== operator) return false;
        if (railway !== null && candidate.railway !== railway) return false;
        if (
          input.stationCode != null &&
          input.stationCode.length > 0 &&
          candidate.stationCode !== input.stationCode
        ) {
          return false;
        }
        return true;
      });
      if (narrowed.length === 1) {
        return matched(narrowed[0], "geographic", notes);
      }
      return ambiguous(narrowed.length > 0 ? narrowed : within, [
        ...notes,
        "geographic_multiple_candidates",
      ]);
    }
    notes.push("no_geographic_candidate_within_tolerance");
  }

  // 5. Explicit connecting-station / connecting-railway cross-reference.
  const connectingStations = new Set(
    (input.connectingStationIds ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );
  const connectingRailways = new Set(
    (input.connectingRailwayIds ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );
  if (connectingStations.size > 0) {
    const byReference = usable.filter((candidate) =>
      identityKeys(candidate).some((key) => connectingStations.has(key)),
    );
    if (byReference.length === 1) {
      return matched(byReference[0], "connecting_station");
    }
    if (byReference.length > 1) {
      return ambiguous(byReference, ["connecting_station_multiple_candidates"]);
    }
    notes.push("no_connecting_station_reference_found");
  }
  if (connectingRailways.size > 0) {
    const byRailway = usable.filter(
      (candidate) =>
        candidate.railway !== null && connectingRailways.has(candidate.railway),
    );
    if (byRailway.length === 1) {
      return matched(byRailway[0], "connecting_station");
    }
    if (byRailway.length > 1) {
      return ambiguous(byRailway, ["connecting_railway_multiple_candidates"]);
    }
    notes.push("no_connecting_railway_reference_found");
  }

  // 6. Nothing settled it. If we never had enough evidence to choose between
  //    plausible candidates, say ambiguous rather than unmatched — the caller
  //    falls back either way, but the distinction is reported honestly.
  const nameButNoOperator =
    wantedName !== null && (operator === null || railway === null);
  if (nameButNoOperator && usable.length > 1) {
    return ambiguous(usable, [
      ...notes,
      "insufficient_evidence_for_name_match",
    ]);
  }
  if (nameButNoOperator && usable.length === 1) {
    return ambiguous(usable, [
      ...notes,
      "insufficient_evidence_for_name_match",
    ]);
  }

  return unmatched(notes.length > 0 ? notes : ["no_evidence_path_matched"]);
}
