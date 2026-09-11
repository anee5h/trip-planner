/**
 * KAI-291B1 — deterministic ODPT RAIL topology importer.
 *
 * Consumes committed fixture data shaped like real ODPT v4.16 resources
 * (`odpt:Operator`, `odpt:Station`, `odpt:Railway`, `odpt:Calendar`) and
 * produces the normalized transit graph. Provenance: field names mirror the
 * server boundary normalization (`functions/api/odpt-core.js`), so the fixture
 * exercises the real parsing shape rather than a hand-designed shortcut.
 *
 * Rules:
 * - Offline and deterministic: identical fixture bytes + identical explicit
 *   metadata yield byte-identical output. No clock, no randomness, no env.
 * - Fail closed: malformed topology throws `OdptImportError`, never a repair.
 * - No inference: no transfers from proximity, no edges from geography, no
 *   coordinates invented, no fare defaulted.
 * - Identity is never merged: two records describing one physical place stay
 *   two stops (see the Shinjuku twins in the fixture).
 */

import { sha256Hex, stableStringify } from "./contentHash";
import { makeTransitEntityId } from "./transitEntityId";
import type {
  NormalizedTransitGraph,
  TransitCoverageEntry,
  TransitCoverageReport,
  TransitDatasetCompleteness,
  TransitDatasetVersion,
  TransitSourceType,
  TransitOperator,
  TransitProvenance,
  TransitRoute,
  TransitRouteMode,
  TransitRouteStop,
  TransitServiceCalendar,
  TransitStop,
} from "./transitGraphTypes";

/** Normalized-contract version stamped on every B1 dataset. */
export const TRANSIT_GRAPH_SCHEMA_VERSION = "kai-291b1-v2";

/**
 * The stable identity namespace for the single ODPT feed. Stable across
 * refreshes of the same logical dataset — never a snapshot id or timestamp.
 */
export const ODPT_IDENTITY_NAMESPACE = "odpt";

/** Machine-readable import failure reasons. */
export type OdptImportErrorCode =
  | "missing_family"
  | "malformed_record"
  | "missing_identity"
  | "duplicate_provider_identity"
  | "unknown_operator_reference"
  | "unknown_railway_reference"
  | "unknown_station_reference"
  | "invalid_station_order"
  | "duplicate_station_order_index"
  | "malformed_coordinates"
  | "cross_reference_mismatch"
  | "unexpected_resource_type"
  | "invalid_calendar_semantics"
  | "invalid_metadata";

/** Fail-closed importer error: the topology is rejected, never repaired. */
export class OdptImportError extends Error {
  readonly code: OdptImportErrorCode;
  constructor(code: OdptImportErrorCode, message: string) {
    super(`odpt-rail-import[${code}]: ${message}`);
    this.name = "OdptImportError";
    this.code = code;
  }
}

const COMPLETENESS_VALUES: readonly TransitDatasetCompleteness[] = [
  "fixture_subset",
  "bounded_subset",
  "complete_provider_dump",
  "unknown",
];

/**
 * Offset-aware ISO 8601 datetime (date + clock + explicit zone).
 * Structural check plus real calendar validation (month 1..12, a day that
 * exists in that Gregorian month incl. leap years, hour/minute/second
 * ranges) — `Date.parse` alone normalizes impossible dates into real ones.
 * No ambient current time is read; the value is only validated.
 */
export function isOffsetAwareDatetime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/.exec(
      value,
    );
  if (match === null) return false;
  const [, y, mo, d, h, mi, s = "00", zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 1 : 0;
  const daysInMonth = [31, 28 + leap, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  if (day < 1 || day > daysInMonth) return false;
  if (zone !== "Z") {
    const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
    if (offset === null) return false;
    if (Number(offset[2]) > 23 || Number(offset[3]) > 59) return false;
  }
  return true;
}

/**
 * Fail loudly on clearly invalid explicit metadata. Provenance and
 * versioning are contract now, so a nameless dataset or a zoneless
 * timestamp must not silently enter the registry.
 */
export function validateImportMetadata(metadata: OdptImportMetadata): void {
  const fail = (message: string): never => {
    throw new OdptImportError("invalid_metadata", message);
  };
  if (
    typeof metadata.datasetId !== "string" ||
    metadata.datasetId.length === 0
  ) {
    fail("datasetId must be a non-empty string.");
  }
  if (
    typeof metadata.identityNamespace !== "string" ||
    metadata.identityNamespace.length === 0
  ) {
    fail("identityNamespace must be a non-empty stable feed scope.");
  }
  // ODPT has exactly one stable identity namespace. The generic builder
  // supports arbitrary feed scopes (GTFS later), but THIS importer normalizes
  // the ODPT feed only — an arbitrary namespace here would mint identities
  // outside the reviewed ODPT scope.
  if (metadata.identityNamespace !== ODPT_IDENTITY_NAMESPACE) {
    fail(
      `ODPT imports require identityNamespace ` +
        `${JSON.stringify(ODPT_IDENTITY_NAMESPACE)}, found ` +
        `${JSON.stringify(metadata.identityNamespace)}.`,
    );
  }
  if (
    typeof metadata.sourceDescriptor !== "string" ||
    metadata.sourceDescriptor.length === 0
  ) {
    fail("sourceDescriptor must be a non-empty string.");
  }
  if (!isOffsetAwareDatetime(metadata.retrievedAt)) {
    fail(
      `retrievedAt must be an offset-aware datetime, found ${JSON.stringify(metadata.retrievedAt)}.`,
    );
  }
  if (!isOffsetAwareDatetime(metadata.checkedAt)) {
    fail(
      `checkedAt must be an offset-aware datetime, found ${JSON.stringify(metadata.checkedAt)}.`,
    );
  }
  for (const field of ["issuedAt", "validUntil"] as const) {
    const value = metadata[field];
    if (
      value !== undefined &&
      value !== null &&
      !isOffsetAwareDatetime(value)
    ) {
      fail(
        `${field} must be an offset-aware datetime when present, found ` +
          `${JSON.stringify(value)}.`,
      );
    }
  }
  if (!COMPLETENESS_VALUES.includes(metadata.completeness)) {
    fail(
      `completeness must be one of ${COMPLETENESS_VALUES.join(", ")}, found ` +
        `${JSON.stringify(metadata.completeness)}.`,
    );
  }
  if (
    metadata.sourceType !== "fixture" &&
    metadata.sourceType !== "data_dump" &&
    metadata.sourceType !== "live_api"
  ) {
    fail(
      `sourceType must be one of fixture, data_dump, live_api, found ` +
        `${JSON.stringify(metadata.sourceType)}.`,
    );
  }
  // Impossible combinations are rejected, not normalized: a fixture (or any
  // non-dump source) can never legitimately claim to be a complete provider
  // dump. Only a validated completeness-oriented data dump earns that claim.
  if (
    metadata.completeness === "complete_provider_dump" &&
    metadata.sourceType !== "data_dump"
  ) {
    fail(
      `completeness complete_provider_dump requires sourceType "data_dump", ` +
        `found ${JSON.stringify(metadata.sourceType)}.`,
    );
  }
}

/** Raw ODPT-shaped input families (minimal structural view). */
export interface OdptRailTopologyInput {
  readonly operators: readonly unknown[];
  readonly stations: readonly unknown[];
  readonly railways: readonly unknown[];
  readonly calendars?: readonly unknown[];
}

/** Explicit ingestion metadata — supplied by the caller, never ambient. */
export interface OdptImportMetadata {
  readonly datasetId: string;
  /**
   * Stable identity namespace / feed scope for every internal id built by
   * this import (e.g. `odpt`). Stable across refreshes — never a snapshot
   * id, timestamp, or retrieval value.
   */
  readonly identityNamespace: string;
  /** e.g. fixture path + scope label. Never a credential. */
  readonly sourceDescriptor: string;
  /**
   * How the source dataset was acquired. A fixture can never legitimately
   * claim to be a complete provider dump (see compatibility validation).
   */
  readonly sourceType: TransitSourceType;
  readonly retrievedAt: string;
  readonly checkedAt: string;
  readonly issuedAt?: string | null;
  readonly validUntil?: string | null;
  /**
   * Declared source completeness. A subset stays a subset no matter how
   * well it parses; only a validated completeness-oriented dump earns
   * `complete_provider_dump`.
   */
  readonly completeness: TransitDatasetCompleteness;
}

export interface OdptImportResult {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Multilingual titles, passed through open-ended: every string-valued entry
 * survives regardless of language key (real records carry ja/en/ko/ja-Hrkt/
 * zh-Hans/zh-Hant where the spec example shows ja/en). Non-string values are
 * dropped rather than coerced.
 */
export function passthroughTitles(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.length > 0) out[key] = entry;
  }
  return out;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function provenance(
  providerId: string,
  sourceResourceType: string,
  metadata: OdptImportMetadata,
): TransitProvenance {
  return {
    provider: "odpt",
    identityNamespace: metadata.identityNamespace,
    providerId,
    sourceResourceType,
    datasetId: metadata.datasetId,
    retrievedAt: metadata.retrievedAt,
  };
}

/** Internal operator id: thin wrapper over the generic builder. */
export function operatorInternalId(
  providerOperatorId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId(
    "odpt",
    "operator",
    identityNamespace,
    providerOperatorId,
  );
}

/** Internal stop id. The providerStopId stays verbatim inside the record. */
export function stopInternalId(
  providerStopId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId("odpt", "stop", identityNamespace, providerStopId);
}

/** Internal route id: thin wrapper over the generic builder. */
export function routeInternalId(
  providerRouteId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId(
    "odpt",
    "route",
    identityNamespace,
    providerRouteId,
  );
}

/** Internal calendar id: thin wrapper over the generic builder. */
export function calendarInternalId(
  providerCalendarId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId(
    "odpt",
    "calendar",
    identityNamespace,
    providerCalendarId,
  );
}

/**
 * Imports one deterministic ODPT rail topology.
 *
 * Throws `OdptImportError` on any malformed topology. Never returns a
 * partially repaired graph.
 */
export function importOdptRailTopology(
  input: OdptRailTopologyInput,
  metadata: OdptImportMetadata,
): OdptImportResult {
  for (const family of ["operators", "stations", "railways"] as const) {
    if (!Array.isArray(input[family])) {
      throw new OdptImportError(
        "missing_family",
        `input family "${family}" must be an array.`,
      );
    }
  }
  const rawCalendars = input.calendars ?? [];
  if (!Array.isArray(rawCalendars)) {
    throw new OdptImportError(
      "missing_family",
      `input family "calendars" must be an array when present.`,
    );
  }

  validateImportMetadata(metadata);
  const ns = metadata.identityNamespace;

  // Index each family by exact provider identity first, so every later
  // reference resolves against the closed input — never against thin air.
  const operators = indexFamily(input.operators, "odpt:Operator");
  const stations = indexFamily(input.stations, "odpt:Station");
  const railways = indexFamily(input.railways, "odpt:Railway");
  const calendars = indexFamily(rawCalendars, "odpt:Calendar");

  // Exact railway -> operator evidence, built BEFORE stations normalize, so
  // cross-reference contradictions fail closed instead of silently passing on
  // existence alone.
  const railwayOperators = new Map<string, string>();
  for (const raw of railways) {
    railwayOperators.set(identityOf(raw), requireOperatorRef(raw, "railway"));
  }
  const stationsByIdentity = new Map(
    stations.map((raw) => [identityOf(raw), raw] as const),
  );

  const normalizedOperators: TransitOperator[] = operators.map((raw) => {
    const sameAs = identityOf(raw);
    return {
      id: operatorInternalId(sameAs, ns),
      provider: "odpt",
      providerOperatorId: sameAs,
      names: passthroughTitles(raw["odpt:operatorTitle"]),
      provenance: provenance(sameAs, "odpt:Operator", metadata),
    };
  });
  const operatorIds = new Set(normalizedOperators.map((o) => o.id));

  const normalizedStops: TransitStop[] = stations.map((raw) => {
    const sameAs = identityOf(raw);
    const operatorRef = requireOperatorRef(raw, "station", sameAs);
    if (!operatorIds.has(operatorInternalId(operatorRef, ns))) {
      throw new OdptImportError(
        "unknown_operator_reference",
        `station ${sameAs} references operator ${JSON.stringify(operatorRef)} ` +
          `outside the imported scope.`,
      );
    }
    const railwayRef = optionalString(raw["odpt:railway"]);
    const railwayOperator =
      railwayRef === null ? undefined : railwayOperators.get(railwayRef);
    if (railwayRef === null || railwayOperator === undefined) {
      throw new OdptImportError(
        "unknown_railway_reference",
        `station ${sameAs} references railway ${JSON.stringify(railwayRef)} ` +
          `outside the imported scope.`,
      );
    }
    // The station's own operator must agree with its railway's operator.
    // A Toei station claiming a TokyoMetro railway (or vice versa) is a
    // contradiction: fail, never move the station between railways.
    if (railwayOperator !== operatorRef) {
      throw new OdptImportError(
        "cross_reference_mismatch",
        `station ${sameAs} claims operator ${operatorRef} but its railway ` +
          `${railwayRef} belongs to operator ${railwayOperator}.`,
      );
    }
    return {
      id: stopInternalId(sameAs, ns),
      provider: "odpt",
      providerStopId: sameAs,
      stopType: "station",
      coordinates: coordinatesOf(raw, sameAs),
      operatorIds: [operatorInternalId(operatorRef, ns)],
      names: passthroughTitles(raw["odpt:stationTitle"]),
      stationCode: optionalString(raw["odpt:stationCode"]),
      provenance: provenance(sameAs, "odpt:Station", metadata),
    };
  });
  const stopIds = new Set(normalizedStops.map((s) => s.id));

  const normalizedRoutes: TransitRoute[] = [];
  const normalizedRouteStops: TransitRouteStop[] = [];
  for (const raw of railways) {
    const sameAs = identityOf(raw);
    const operatorRef = requireOperatorRef(raw, "railway", sameAs);
    if (!operatorIds.has(operatorInternalId(operatorRef, ns))) {
      throw new OdptImportError(
        "unknown_operator_reference",
        `railway ${sameAs} references operator ${JSON.stringify(operatorRef)} ` +
          `outside the imported scope.`,
      );
    }
    const routeId = routeInternalId(sameAs, ns);
    normalizedRoutes.push({
      id: routeId,
      provider: "odpt",
      providerRouteId: sameAs,
      operatorId: operatorInternalId(operatorRef, ns),
      mode: "rail",
      names: passthroughTitles(raw["odpt:railwayTitle"]),
      sourceSemantics: {
        provider: "odpt",
        ascendingDirectionId: optionalString(
          raw["odpt:ascendingRailDirection"],
        ),
        descendingDirectionId: optionalString(
          raw["odpt:descendingRailDirection"],
        ),
      },
      provenance: provenance(sameAs, "odpt:Railway", metadata),
    });
    for (const entry of routeStopsOf(raw, sameAs)) {
      const stopId = stopInternalId(entry.station, ns);
      if (!stopIds.has(stopId)) {
        throw new OdptImportError(
          "unknown_station_reference",
          `railway ${sameAs} orders station ${entry.station} outside the ` +
            `imported scope.`,
        );
      }
      // The ordered station must itself claim THIS railway (and therefore its
      // operator). A TokyoMetro station inserted into a Toei stationOrder is
      // a contradiction: fail, never repair the source data.
      const ordered = stationsByIdentity.get(entry.station);
      const orderedRailway =
        ordered === undefined ? null : optionalString(ordered["odpt:railway"]);
      const orderedOperator =
        ordered === undefined ? null : optionalString(ordered["odpt:operator"]);
      if (orderedRailway !== sameAs || orderedOperator !== operatorRef) {
        throw new OdptImportError(
          "cross_reference_mismatch",
          `railway ${sameAs} orders station ${entry.station}, which claims ` +
            `railway ${JSON.stringify(orderedRailway)} / operator ` +
            `${JSON.stringify(orderedOperator)}.`,
        );
      }
      normalizedRouteStops.push({
        routeId,
        stopId,
        order: entry.index,
        provenance: {
          provider: "odpt",
          identityNamespace: ns,
          providerId: entry.station,
          sourceResourceType: "odpt:Railway.stationOrder",
          datasetId: metadata.datasetId,
          retrievedAt: metadata.retrievedAt,
        },
      });
    }
  }

  const normalizedCalendars: TransitServiceCalendar[] = calendars.map((raw) => {
    const sameAs = identityOf(raw);
    // Calendar source semantics pass through verbatim — but only when they
    // are well-formed. Malformed day/duration values are import failures,
    // never silently filtered or coerced, so the preserved semantics stay
    // truthful to the provider record.
    const rawDay = raw["odpt:day"];
    let day: string[];
    if (rawDay === undefined || rawDay === null) {
      day = [];
    } else if (
      Array.isArray(rawDay) &&
      rawDay.every(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
    ) {
      day = [...rawDay];
    } else {
      throw new OdptImportError(
        "invalid_calendar_semantics",
        `calendar ${sameAs}: odpt:day must be absent or an array of ` +
          `non-empty strings.`,
      );
    }
    const rawDuration = raw["odpt:duration"];
    let duration: string | null;
    if (rawDuration === undefined || rawDuration === null) {
      duration = null;
    } else {
      const parsed = optionalString(rawDuration);
      if (parsed === null) {
        throw new OdptImportError(
          "invalid_calendar_semantics",
          `calendar ${sameAs}: odpt:duration must be absent or a non-empty string.`,
        );
      }
      duration = parsed;
    }
    return {
      id: calendarInternalId(sameAs, ns),
      provider: "odpt",
      providerCalendarId: sameAs,
      sourceSemantics: {
        provider: "odpt",
        // Same convention as the shared boundary: Specific.* outranks base.
        kind: sameAs.startsWith("odpt.Calendar:Specific.")
          ? "specific"
          : "base",
        day,
        duration,
      },
      provenance: provenance(sameAs, "odpt:Calendar", metadata),
    };
  });

  // Deterministic order for every semantically unordered collection.
  // Route-stop sequences keep provider order (routeId, then order).
  const byId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  normalizedOperators.sort(byId);
  normalizedStops.sort(byId);
  normalizedRoutes.sort(byId);
  normalizedCalendars.sort(byId);
  normalizedRouteStops.sort((a, b) =>
    a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : a.order - b.order,
  );

  const datasetVersion: TransitDatasetVersion = {
    provider: "odpt",
    datasetId: metadata.datasetId,
    sourceType: metadata.sourceType,
    sourceDescriptor: metadata.sourceDescriptor,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
    issuedAt: metadata.issuedAt ?? null,
    validUntil: metadata.validUntil ?? null,
    schemaVersion: TRANSIT_GRAPH_SCHEMA_VERSION,
    completeness: metadata.completeness,
    contentHash: contentHashOf({
      operators: normalizedOperators,
      stops: normalizedStops,
      routes: normalizedRoutes,
      routeStops: normalizedRouteStops,
      calendars: normalizedCalendars,
    }),
  };

  const graph: NormalizedTransitGraph = {
    datasetVersion,
    operators: normalizedOperators,
    stops: normalizedStops,
    routes: normalizedRoutes,
    routeStops: normalizedRouteStops,
    calendars: normalizedCalendars,
    transfers: [],
    fares: [],
  };

  return { graph, coverage: buildOdptCoverageReport(graph) };
}

/** Indexes one resource family by exact provider identity. Fails closed. */
function indexFamily(
  records: readonly unknown[],
  resourceType: string,
): Record<string, unknown>[] {
  const seen = new Map<string, string>();
  const out: Record<string, unknown>[] = [];
  for (const record of records) {
    if (!isRecord(record)) {
      throw new OdptImportError(
        "malformed_record",
        `${resourceType} entry is not an object.`,
      );
    }
    // A wrong-family record must not pass merely because it carries an
    // owl:sameAs: the declared resource type is part of the evidence.
    if (record["@type"] !== resourceType) {
      throw new OdptImportError(
        "unexpected_resource_type",
        `expected @type ${JSON.stringify(resourceType)} but found ` +
          `${JSON.stringify(record["@type"])}.`,
      );
    }
    const sameAs = optionalString(record["owl:sameAs"]);
    if (sameAs === null) {
      throw new OdptImportError(
        "missing_identity",
        `${resourceType} entry carries no owl:sameAs.`,
      );
    }
    const prior = seen.get(sameAs);
    const fingerprint = stableStringify(record);
    if (prior !== undefined) {
      throw new OdptImportError(
        "duplicate_provider_identity",
        `${resourceType} repeats identity ${sameAs} ` +
          (prior === fingerprint
            ? `(byte-identical duplicate — still rejected: the reviewed input ` +
              `must carry each identity once).`
            : `(contradictory data — refusing to guess which record wins).`),
      );
    }
    seen.set(sameAs, fingerprint);
    out.push(record);
  }
  return out;
}

/**
 * The station/railway's declared operator. Absence is not a defaultable
 * detail: an operator reference outside the imported scope fails downstream,
 * and a missing one fails here.
 */
function requireOperatorRef(
  raw: Record<string, unknown>,
  kind: "station" | "railway",
  sameAs?: string,
): string {
  const operatorRef = optionalString(raw["odpt:operator"]);
  if (operatorRef === null) {
    throw new OdptImportError(
      "unknown_operator_reference",
      `${kind}${sameAs === undefined ? "" : ` ${sameAs}`} declares no ` +
        `odpt:operator.`,
    );
  }
  return operatorRef;
}

function identityOf(raw: Record<string, unknown>): string {
  const sameAs = optionalString(raw["owl:sameAs"]);
  // Guaranteed by indexFamily; re-asserted so later refactors cannot pass
  // an unindexed record through.
  if (sameAs === null) {
    throw new OdptImportError(
      "missing_identity",
      `record carries no owl:sameAs.`,
    );
  }
  return sameAs;
}

/**
 * Coordinates stay null ONLY when the provider record legitimately lacks
 * both. A half-present pair, a non-numeric value, or an out-of-range degree
 * is a data defect, not an absence: fail rather than silently downgrading it
 * to null.
 */
function coordinatesOf(
  raw: Record<string, unknown>,
  sameAs: string,
): { readonly lat: number; readonly lng: number } | null {
  const lat = raw["geo:lat"];
  const lng = raw["geo:long"];
  const latAbsent = lat === undefined || lat === null;
  const lngAbsent = lng === undefined || lng === null;
  if (latAbsent && lngAbsent) return null;
  const latN = finiteNumber(lat);
  const lngN = finiteNumber(lng);
  if (latN === null || lngN === null) {
    throw new OdptImportError(
      "malformed_coordinates",
      `station ${sameAs} carries an incomplete or non-numeric coordinate pair.`,
    );
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    throw new OdptImportError(
      "malformed_coordinates",
      `station ${sameAs} carries out-of-range coordinates (${latN}, ${lngN}).`,
    );
  }
  return { lat: latN, lng: lngN };
}

/**
 * Provider ordering evidence for one railway. ODPT defines ordering through
 * `odpt:index`; the array is validated but never re-sorted here (the caller
 * sorts the flattened memberships deterministically).
 */
function routeStopsOf(
  raw: Record<string, unknown>,
  railwayId: string,
): { station: string; index: number }[] {
  const order = raw["odpt:stationOrder"];
  if (order === undefined || order === null) return [];
  if (!Array.isArray(order)) {
    throw new OdptImportError(
      "invalid_station_order",
      `railway ${railwayId}: odpt:stationOrder is not an array.`,
    );
  }
  const seen = new Set<number>();
  return order.map((entry, position) => {
    if (!isRecord(entry)) {
      throw new OdptImportError(
        "invalid_station_order",
        `railway ${railwayId}: stationOrder[${position}] is not an object.`,
      );
    }
    const station = optionalString(entry["odpt:station"]);
    if (station === null) {
      throw new OdptImportError(
        "invalid_station_order",
        `railway ${railwayId}: stationOrder[${position}] names no station.`,
      );
    }
    const index = entry["odpt:index"];
    if (typeof index !== "number" || !Number.isInteger(index)) {
      throw new OdptImportError(
        "invalid_station_order",
        `railway ${railwayId}: stationOrder[${position}] carries a ` +
          `non-integer odpt:index (provider ordering evidence must be numeric).`,
      );
    }
    if (seen.has(index)) {
      throw new OdptImportError(
        "duplicate_station_order_index",
        `railway ${railwayId}: odpt:index ${index} appears twice (provider ` +
          `semantics do not permit duplicate ordering).`,
      );
    }
    seen.add(index);
    return { station, index };
  });
}

/**
 * Content hash over the normalized SEMANTIC content.
 *
 * Volatile observation metadata is projected OUT before hashing: `datasetId`
 * and `retrievedAt` in every provenance record. Stable identity scope
 * (`identityNamespace`) and provider identities stay represented, so the
 * same provider content retrieved tomorrow — or under a new snapshot id —
 * hashes identically, while a real station/route/calendar change (or a
 * different feed namespace) changes the hash.
 */
export function contentHashOf(entities: {
  readonly operators: readonly TransitOperator[];
  readonly stops: readonly TransitStop[];
  readonly routes: readonly TransitRoute[];
  readonly routeStops: readonly TransitRouteStop[];
  readonly calendars: readonly TransitServiceCalendar[];
}): string {
  const semanticProvenance = (provenance: TransitProvenance) => ({
    provider: provenance.provider,
    identityNamespace: provenance.identityNamespace,
    providerId: provenance.providerId,
    sourceResourceType: provenance.sourceResourceType,
  });
  const semantic = <T extends { provenance: TransitProvenance }>(
    entity: T,
  ) => ({
    ...entity,
    provenance: semanticProvenance(entity.provenance),
  });
  return sha256Hex(
    stableStringify({
      calendars: entities.calendars.map(semantic),
      operators: entities.operators.map(semantic),
      routeStops: entities.routeStops.map(semantic),
      routes: entities.routes.map(semantic),
      stops: entities.stops.map(semantic),
    }),
  );
}

/**
 * Coverage-registry foundation: one entry per (provider, operator, rail).
 * `unsupported`/`partial` are legitimate evidence states, never exceptions.
 * B1 imports topology only: timetable and fare stay explicitly not-imported.
 */
export function buildOdptCoverageReport(
  graph: NormalizedTransitGraph,
): TransitCoverageReport {
  const stopsByRoute = new Map<string, number>();
  for (const membership of graph.routeStops) {
    stopsByRoute.set(
      membership.routeId,
      (stopsByRoute.get(membership.routeId) ?? 0) + 1,
    );
  }
  const routesByOperator = new Map<string, TransitRoute[]>();
  for (const route of graph.routes) {
    const list = routesByOperator.get(route.operatorId) ?? [];
    list.push(route);
    routesByOperator.set(route.operatorId, list);
  }

  // Completeness is DECLARED, never inferred: a clean subset import is not
  // full operator coverage, no matter how well it parses. Only a validated
  // completeness-oriented dump earns `imported` topology.
  const completeSource =
    graph.datasetVersion.completeness === "complete_provider_dump";
  const scopeNote =
    `source is not a complete provider topology ` +
    `(${graph.datasetVersion.completeness}): importer succeeded but operator ` +
    `coverage is partial`;

  const entries: TransitCoverageEntry[] = graph.operators.map((operator) => {
    const routes = routesByOperator.get(operator.id) ?? [];
    const emptyRoutes = routes.filter(
      (route) => (stopsByRoute.get(route.id) ?? 0) === 0,
    );
    const notes: string[] = [];
    let topology: TransitCoverageEntry["topology"];
    if (!completeSource) {
      topology = "partial";
      notes.push(scopeNote);
    } else if (routes.length === 0) {
      topology = "partial";
      notes.push("operator carries no imported routes in this dataset");
    } else if (emptyRoutes.length > 0) {
      topology = "partial";
      notes.push(
        `routes without ordered stops: ${emptyRoutes
          .map((r) => r.providerRouteId)
          .sort()
          .join(", ")}`,
      );
    } else {
      topology = "imported";
    }
    const mode: TransitRouteMode = "rail";
    return {
      provider: "odpt",
      operator: operator.providerOperatorId,
      mode,
      topology,
      timetable: "not_imported_in_this_slice",
      fare: "not_imported_in_this_slice",
      realtime: "not_evaluated",
      datasetId: graph.datasetVersion.datasetId,
      notes,
    };
  });
  entries.sort((a, b) => (a.operator < b.operator ? -1 : 1));

  return {
    datasetId: graph.datasetVersion.datasetId,
    schemaVersion: TRANSIT_GRAPH_SCHEMA_VERSION,
    entries,
  };
}
