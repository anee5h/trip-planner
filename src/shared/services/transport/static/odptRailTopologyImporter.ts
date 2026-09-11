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
import type {
  NormalizedTransitGraph,
  TransitCoverageEntry,
  TransitCoverageReport,
  TransitDatasetVersion,
  TransitOperator,
  TransitProvenance,
  TransitRoute,
  TransitRouteMode,
  TransitRouteStop,
  TransitServiceCalendar,
  TransitStop,
} from "./transitGraphTypes";

/** Normalized-contract version stamped on every B1 dataset. */
export const TRANSIT_GRAPH_SCHEMA_VERSION = "kai-291b1-v1";

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
  | "malformed_coordinates";

/** Fail-closed importer error: the topology is rejected, never repaired. */
export class OdptImportError extends Error {
  readonly code: OdptImportErrorCode;
  constructor(code: OdptImportErrorCode, message: string) {
    super(`odpt-rail-import[${code}]: ${message}`);
    this.name = "OdptImportError";
    this.code = code;
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
  /** e.g. fixture path + scope label. Never a credential. */
  readonly sourceDescriptor: string;
  readonly retrievedAt: string;
  readonly checkedAt: string;
  readonly issuedAt?: string | null;
  readonly validUntil?: string | null;
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
    providerId,
    sourceResourceType,
    datasetId: metadata.datasetId,
    retrievedAt: metadata.retrievedAt,
  };
}

/** Internal operator id: deterministic, reversible, name-independent. */
export function operatorInternalId(providerOperatorId: string): string {
  return `odpt:operator:${providerOperatorId}`;
}

/** Internal stop id. The providerStopId stays verbatim inside the record. */
export function stopInternalId(providerStopId: string): string {
  return `odpt:station:${providerStopId}`;
}

/** Internal route id. */
export function routeInternalId(providerRouteId: string): string {
  return `odpt:route:${providerRouteId}`;
}

/** Internal calendar id. */
export function calendarInternalId(providerCalendarId: string): string {
  return `odpt:calendar:${providerCalendarId}`;
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

  // Index each family by exact provider identity first, so every later
  // reference resolves against the closed input — never against thin air.
  const operators = indexFamily(input.operators, "odpt:Operator");
  const stations = indexFamily(input.stations, "odpt:Station");
  const railways = indexFamily(input.railways, "odpt:Railway");
  const calendars = indexFamily(rawCalendars, "odpt:Calendar");

  const normalizedOperators: TransitOperator[] = operators.map((raw) => {
    const sameAs = identityOf(raw);
    return {
      id: operatorInternalId(sameAs),
      provider: "odpt",
      providerOperatorId: sameAs,
      names: passthroughTitles(raw["odpt:operatorTitle"]),
      provenance: provenance(sameAs, "odpt:Operator", metadata),
    };
  });
  const operatorIds = new Set(normalizedOperators.map((o) => o.id));

  const normalizedStops: TransitStop[] = stations.map((raw) => {
    const sameAs = identityOf(raw);
    const operatorRef = optionalString(raw["odpt:operator"]);
    if (
      operatorRef === null ||
      !operatorIds.has(operatorInternalId(operatorRef))
    ) {
      throw new OdptImportError(
        "unknown_operator_reference",
        `station ${sameAs} references operator ${JSON.stringify(operatorRef)} ` +
          `outside the imported scope.`,
      );
    }
    const railwayRef = optionalString(raw["odpt:railway"]);
    if (
      railwayRef === null ||
      !railways.some((r) => identityOf(r) === railwayRef)
    ) {
      throw new OdptImportError(
        "unknown_railway_reference",
        `station ${sameAs} references railway ${JSON.stringify(railwayRef)} ` +
          `outside the imported scope.`,
      );
    }
    return {
      id: stopInternalId(sameAs),
      provider: "odpt",
      providerStopId: sameAs,
      stopType: "station",
      coordinates: coordinatesOf(raw, sameAs),
      operatorIds: [operatorInternalId(operatorRef)],
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
    const operatorRef = optionalString(raw["odpt:operator"]);
    if (
      operatorRef === null ||
      !operatorIds.has(operatorInternalId(operatorRef))
    ) {
      throw new OdptImportError(
        "unknown_operator_reference",
        `railway ${sameAs} references operator ${JSON.stringify(operatorRef)} ` +
          `outside the imported scope.`,
      );
    }
    const routeId = routeInternalId(sameAs);
    normalizedRoutes.push({
      id: routeId,
      provider: "odpt",
      providerRouteId: sameAs,
      operatorId: operatorInternalId(operatorRef),
      mode: "rail",
      names: passthroughTitles(raw["odpt:railwayTitle"]),
      ascendingDirectionId: optionalString(raw["odpt:ascendingRailDirection"]),
      descendingDirectionId: optionalString(
        raw["odpt:descendingRailDirection"],
      ),
      provenance: provenance(sameAs, "odpt:Railway", metadata),
    });
    for (const entry of routeStopsOf(raw, sameAs)) {
      const stopId = stopInternalId(entry.station);
      if (!stopIds.has(stopId)) {
        throw new OdptImportError(
          "unknown_station_reference",
          `railway ${sameAs} orders station ${entry.station} outside the ` +
            `imported scope.`,
        );
      }
      normalizedRouteStops.push({
        routeId,
        stopId,
        order: entry.index,
        provenance: {
          provider: "odpt",
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
    const day = Array.isArray(raw["odpt:day"])
      ? raw["odpt:day"].filter((d): d is string => typeof d === "string")
      : [];
    return {
      id: calendarInternalId(sameAs),
      provider: "odpt",
      providerCalendarId: sameAs,
      // Same convention as the shared boundary: Specific.* outranks base.
      calendarKind: sameAs.startsWith("odpt.Calendar:Specific.")
        ? "specific"
        : "base",
      rawDay: day,
      rawDuration: optionalString(raw["odpt:duration"]),
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
    sourceType: "fixture",
    sourceDescriptor: metadata.sourceDescriptor,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
    issuedAt: metadata.issuedAt ?? null,
    validUntil: metadata.validUntil ?? null,
    schemaVersion: TRANSIT_GRAPH_SCHEMA_VERSION,
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
    scheduledServices: [],
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
 * Coordinates stay null when the provider record legitimately lacks them.
 * A present-but-malformed coordinate is a data defect, not an absence:
 * fail rather than nulling it away.
 */
function coordinatesOf(
  raw: Record<string, unknown>,
  sameAs: string,
): { readonly lat: number; readonly lng: number } | null {
  const lat = raw["geo:lat"];
  const lng = raw["geo:long"];
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return null;
  }
  const latN = finiteNumber(lat);
  const lngN = finiteNumber(lng);
  if (latN === null || lngN === null) {
    throw new OdptImportError(
      "malformed_coordinates",
      `station ${sameAs} carries non-numeric coordinates.`,
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
 * Content hash over the canonical serialization of the normalized entities.
 * The dataset version (which carries the hash) is excluded by construction.
 */
export function contentHashOf(entities: {
  readonly operators: readonly TransitOperator[];
  readonly stops: readonly TransitStop[];
  readonly routes: readonly TransitRoute[];
  readonly routeStops: readonly TransitRouteStop[];
  readonly calendars: readonly TransitServiceCalendar[];
}): string {
  return sha256Hex(
    stableStringify({
      calendars: entities.calendars,
      operators: entities.operators,
      routeStops: entities.routeStops,
      routes: entities.routes,
      stops: entities.stops,
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

  const entries: TransitCoverageEntry[] = graph.operators.map((operator) => {
    const routes = routesByOperator.get(operator.id) ?? [];
    const emptyRoutes = routes.filter(
      (route) => (stopsByRoute.get(route.id) ?? 0) === 0,
    );
    const notes: string[] = [];
    let topology: TransitCoverageEntry["topology"];
    if (routes.length === 0) {
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
