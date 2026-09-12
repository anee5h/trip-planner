/**
 * KAI-291C1 — bounded GTFS/GTFS-JP topology adapter.
 *
 * This adapter consumes decoded C1 tables and targets the B1
 * NormalizedTransitGraph. It uses stop_times only to derive ordered route
 * patterns; it does not create timetable journeys, calendars, fares,
 * recommendations, or runtime requests.
 */

import {
  isOffsetAwareDatetime,
  contentHashOf,
} from "./odptRailTopologyImporter";
import { sha256Hex, stableStringify } from "./contentHash";
import { makeTransitEntityId } from "./transitEntityId";
import type {
  GtfsJpRouteSourceSemantics,
  GtfsJpStopSourceSemantics,
  GtfsRoutePatternSourceSemantics,
  GtfsRouteSourceSemantics,
  GtfsStopSourceSemantics,
  NormalizedTransitGraph,
  TransitCoverageEntry,
  TransitCoverageReport,
  TransitDatasetCompleteness,
  TransitDatasetVersion,
  TransitOperator,
  TransitProvenance,
  TransitRoute,
  TransitRouteMode,
  TransitRouteStop,
  TransitStop,
} from "./transitGraphTypes";
import type { GtfsFeedTables, GtfsTableRow } from "./gtfsTypes";

export const GTFS_TOPOLOGY_SCHEMA_VERSION = "kai-291c1-v1";

export type GtfsProvider = "gtfs" | "gtfs-jp";

export type GtfsImportErrorCode =
  | "invalid_metadata"
  | "missing_family"
  | "malformed_record"
  | "missing_identity"
  | "duplicate_provider_identity"
  | "missing_agency_id"
  | "unknown_agency_reference"
  | "unknown_route_reference"
  | "unknown_trip_reference"
  | "unknown_stop_reference"
  | "invalid_stop_time_location"
  | "invalid_route_type"
  | "invalid_location_type"
  | "unsupported_route_type"
  | "unsupported_location_type"
  | "unsupported_stop_semantics"
  | "invalid_parent_station"
  | "invalid_stop_sequence"
  | "duplicate_stop_sequence"
  | "missing_stop_times"
  | "malformed_coordinates"
  | "invalid_feed_semantics";

export class GtfsImportError extends Error {
  readonly code: GtfsImportErrorCode;

  constructor(code: GtfsImportErrorCode, message: string) {
    super(`gtfs-topology[${code}]: ${message}`);
    this.name = "GtfsImportError";
    this.code = code;
  }
}

export interface GtfsImportMetadata {
  readonly provider: GtfsProvider;
  readonly datasetId: string;
  readonly identityNamespace: string;
  readonly sourceDescriptor: string;
  readonly sourceType: "fixture" | "data_dump" | "live_api";
  readonly retrievedAt: string;
  readonly checkedAt: string;
  readonly issuedAt?: string | null;
  readonly validUntil?: string | null;
  readonly completeness: TransitDatasetCompleteness;
}

export type GtfsPatternClassification =
  "consistent" | "multiple_compatible_directional" | "multiple_conflicting";

export interface GtfsPatternAudit {
  readonly routeId: string;
  readonly patternIds: readonly string[];
  readonly patternCount: number;
  readonly classification: GtfsPatternClassification;
}

export interface GtfsImportResult {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
  readonly patternAudit: readonly GtfsPatternAudit[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function required(
  row: GtfsTableRow,
  field: string,
  family: string,
  identityCode: GtfsImportErrorCode = "missing_identity",
): string {
  const value = row[field];
  if (value !== undefined && typeof value !== "string") {
    throw new GtfsImportError(
      "malformed_record",
      `${family}.${field} must be a string.`,
    );
  }
  if (!nonEmpty(value)) {
    throw new GtfsImportError(
      identityCode,
      `${family}.${field} must be a non-empty string.`,
    );
  }
  return value;
}

function optional(row: GtfsTableRow, field: string): string | null {
  const value = row[field];
  if (value !== undefined && typeof value !== "string") {
    throw new GtfsImportError(
      "malformed_record",
      `${field} must be a string when present.`,
    );
  }
  return value !== undefined && value.length > 0 ? value : null;
}

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(lexical);
}

function parseInteger(
  value: string,
  field: string,
  code: GtfsImportErrorCode = "invalid_route_type",
): number {
  if (!/^-?\d+$/.test(value)) {
    throw new GtfsImportError(
      code,
      `${field} must be an integer, found ${JSON.stringify(value)}.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new GtfsImportError(
      code,
      `${field} is outside the safe integer range.`,
    );
  }
  return parsed;
}

function validateMetadata(metadata: GtfsImportMetadata): void {
  const invalid = (message: string): never => {
    throw new GtfsImportError("invalid_metadata", message);
  };
  if (metadata.provider !== "gtfs" && metadata.provider !== "gtfs-jp") {
    invalid(
      `provider must be gtfs or gtfs-jp, found ${JSON.stringify(metadata.provider)}.`,
    );
  }
  for (const [field, value] of [
    ["datasetId", metadata.datasetId],
    ["identityNamespace", metadata.identityNamespace],
    ["sourceDescriptor", metadata.sourceDescriptor],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      invalid(`${field} must be a non-empty string.`);
    }
  }
  if (!isOffsetAwareDatetime(metadata.retrievedAt)) {
    invalid(`retrievedAt must be an offset-aware datetime.`);
  }
  if (!isOffsetAwareDatetime(metadata.checkedAt)) {
    invalid(`checkedAt must be an offset-aware datetime.`);
  }
  for (const field of ["issuedAt", "validUntil"] as const) {
    const value = metadata[field];
    if (
      value !== undefined &&
      value !== null &&
      !isOffsetAwareDatetime(value)
    ) {
      invalid(`${field} must be an offset-aware datetime when present.`);
    }
  }
  if (
    !["fixture", "data_dump", "live_api"].includes(metadata.sourceType) ||
    ![
      "fixture_subset",
      "bounded_subset",
      "complete_provider_dump",
      "unknown",
    ].includes(metadata.completeness)
  ) {
    invalid("sourceType or completeness is outside the normalized contract.");
  }
  if (
    metadata.completeness === "complete_provider_dump" &&
    metadata.sourceType !== "data_dump"
  ) {
    invalid("complete_provider_dump requires sourceType data_dump.");
  }
}

function ensureFamilies(input: GtfsFeedTables): void {
  for (const family of [
    "agency",
    "stops",
    "routes",
    "trips",
    "stopTimes",
  ] as const) {
    if (!isRecord(input) || !Array.isArray(input[family])) {
      throw new GtfsImportError(
        "missing_family",
        `${family} must be an array.`,
      );
    }
  }
  if (
    (input.feedInfo !== undefined && !Array.isArray(input.feedInfo)) ||
    (input.routesJp !== undefined && !Array.isArray(input.routesJp))
  ) {
    throw new GtfsImportError(
      "missing_family",
      "optional GTFS tables must be arrays when present.",
    );
  }
}

function provenance(
  providerId: string,
  sourceResourceType: string,
  metadata: GtfsImportMetadata,
): TransitProvenance {
  return {
    provider: metadata.provider,
    identityNamespace: metadata.identityNamespace,
    providerId,
    sourceResourceType,
    datasetId: metadata.datasetId,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
  };
}

export function gtfsOperatorInternalId(
  provider: GtfsProvider,
  providerOperatorId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId(
    provider,
    "operator",
    identityNamespace,
    providerOperatorId,
  );
}

export function gtfsStopInternalId(
  provider: GtfsProvider,
  providerStopId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId(
    provider,
    "stop",
    identityNamespace,
    providerStopId,
  );
}

export function gtfsRouteInternalId(
  provider: GtfsProvider,
  providerRouteId: string,
  identityNamespace: string,
): string {
  return makeTransitEntityId(
    provider,
    "route",
    identityNamespace,
    providerRouteId,
  );
}

function indexById(
  rows: readonly GtfsTableRow[],
  family: string,
  field: string,
): Map<string, GtfsTableRow> {
  const out = new Map<string, GtfsTableRow>();
  for (const row of rows) {
    if (!isRecord(row)) {
      throw new GtfsImportError(
        "malformed_record",
        `${family} contains a non-record row.`,
      );
    }
    const id = required(row, field, family);
    if (out.has(id)) {
      throw new GtfsImportError(
        "duplicate_provider_identity",
        `${family}.${field} repeats ${JSON.stringify(id)}.`,
      );
    }
    out.set(id, row);
  }
  return out;
}

export function mapGtfsRouteType(routeType: number): TransitRouteMode {
  switch (routeType) {
    case 0:
      return "tram";
    case 1:
    case 2:
    case 7:
    case 12:
      return "rail";
    case 3:
    case 11:
      return "bus";
    case 4:
      return "ferry";
    case 5:
      return "tram";
    case 6:
      return "other";
    default:
      throw new GtfsImportError(
        "unsupported_route_type",
        `route_type ${routeType} has no reviewed normalized mode mapping.`,
      );
  }
}

function coordinatesOf(
  row: GtfsTableRow,
  stopId: string,
): TransitStop["coordinates"] {
  const lat = optional(row, "stop_lat");
  const lon = optional(row, "stop_lon");
  if (
    lat === null ||
    lon === null ||
    !/^-?(?:\d+\.?\d*|\.\d+)$/.test(lat) ||
    !/^-?(?:\d+\.?\d*|\.\d+)$/.test(lon)
  ) {
    throw new GtfsImportError(
      "malformed_coordinates",
      `stop ${stopId} requires a valid coordinate pair.`,
    );
  }
  const latNumber = Number(lat);
  const lonNumber = Number(lon);
  if (
    !Number.isFinite(latNumber) ||
    !Number.isFinite(lonNumber) ||
    latNumber < -90 ||
    latNumber > 90 ||
    lonNumber < -180 ||
    lonNumber > 180
  ) {
    throw new GtfsImportError(
      "malformed_coordinates",
      `stop ${stopId} has out-of-range coordinates.`,
    );
  }
  return { lat: latNumber, lng: lonNumber };
}

function publisherOf(
  feedInfo: readonly GtfsTableRow[] | undefined,
): { readonly name: string; readonly url: string | null } | undefined {
  if (feedInfo === undefined || feedInfo.length === 0) return undefined;
  if (feedInfo.length !== 1) {
    throw new GtfsImportError(
      "invalid_feed_semantics",
      "feed_info.txt must contain at most one record for C1.",
    );
  }
  const row = feedInfo[0];
  if (row === undefined) return undefined;
  const name = required(row, "feed_publisher_name", "feed_info");
  return { name, url: optional(row, "feed_publisher_url") };
}

function languageOf(feedInfo: readonly GtfsTableRow[] | undefined): string {
  const value = feedInfo?.[0]?.feed_lang;
  return nonEmpty(value) ? value : "und";
}

interface AgencyInfo {
  readonly providerId: string;
  readonly internalId: string;
  readonly row: GtfsTableRow;
}

interface RouteInfo {
  readonly providerId: string;
  readonly internalId: string;
  readonly operatorId: string;
  readonly mode: TransitRouteMode;
  readonly routeType: number;
  readonly row: GtfsTableRow;
}

interface TripInfo {
  readonly providerId: string;
  readonly route: RouteInfo;
  readonly serviceId: string;
}

interface StopTimeInfo {
  readonly trip: TripInfo;
  readonly stopId: string;
  readonly order: number;
  readonly sourceSequence: number;
}

interface PatternInfo {
  readonly patternId: string;
  readonly stopIds: readonly string[];
  readonly tripIds: readonly string[];
  readonly serviceIds: readonly string[];
  readonly representativeTripId: string;
  readonly stopTimes: readonly StopTimeInfo[];
}

function reverse(values: readonly string[]): string[] {
  return [...values].reverse();
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function classifyPatterns(
  patterns: readonly PatternInfo[],
): GtfsPatternClassification {
  if (patterns.length <= 1) return "consistent";
  const first = patterns[0]?.stopIds ?? [];
  return patterns.every(
    (pattern) =>
      sameStrings(pattern.stopIds, first) ||
      sameStrings(pattern.stopIds, reverse(first)),
  )
    ? "multiple_compatible_directional"
    : "multiple_conflicting";
}

/** Canonical C1 route-pattern identity shared by later schedule slices. */
export function gtfsPatternIdFor(
  routeProviderId: string,
  stopIds: readonly string[],
): string {
  return `pattern:${sha256Hex(stableStringify({ routeId: routeProviderId, stopIds }))}`;
}

function routeUpdateDates(
  rows: readonly GtfsTableRow[] | undefined,
  routes: ReadonlyMap<string, RouteInfo>,
): Map<string, string | null> {
  if (rows === undefined) return new Map();
  const indexed = new Map<string, GtfsTableRow>();
  for (const row of rows) {
    const routeId = required(row, "route_id", "routes_jp");
    if (!routes.has(routeId)) {
      throw new GtfsImportError(
        "unknown_route_reference",
        `routes_jp references unknown route ${routeId}.`,
      );
    }
    if (indexed.has(routeId)) {
      throw new GtfsImportError(
        "duplicate_provider_identity",
        `routes_jp repeats route ${routeId}.`,
      );
    }
    indexed.set(routeId, row);
  }
  const values = new Map<string, string | null>();
  for (const routeId of routes.keys())
    values.set(
      routeId,
      optional(indexed.get(routeId) ?? {}, "route_update_date"),
    );
  return values;
}

function patternSource(
  patterns: readonly PatternInfo[],
): readonly GtfsRoutePatternSourceSemantics[] {
  return [...patterns]
    .sort((a, b) => lexical(a.patternId, b.patternId))
    .map((pattern) => ({
      patternId: pattern.patternId,
      tripIds: sortStrings(pattern.tripIds),
      serviceIds: sortStrings(pattern.serviceIds),
    }));
}

function sourceSemanticsForRoute(
  provider: GtfsProvider,
  route: RouteInfo,
  patterns: readonly PatternInfo[],
  routeUpdateDate: string | null,
): GtfsRouteSourceSemantics | GtfsJpRouteSourceSemantics {
  const common = {
    routeType: route.routeType,
    agencyId: optional(route.row, "agency_id"),
    shortName: optional(route.row, "route_short_name"),
    longName: optional(route.row, "route_long_name"),
    routeColor: optional(route.row, "route_color"),
    textColor: optional(route.row, "route_text_color"),
    patterns: patternSource(patterns),
  };
  if (provider === "gtfs-jp") return { provider, ...common, routeUpdateDate };
  return { provider, ...common };
}

/** Keep C1 raw stop-time provenance out of topology semantic hashes. */
export function gtfsRouteStopsForSemanticHash(
  routeStops: readonly TransitRouteStop[],
): readonly TransitRouteStop[] {
  return routeStops.map((routeStop) => ({
    ...routeStop,
    // The raw trip/sequence tuple is observational evidence. Topology
    // semantics are already represented by route, pattern, stop, and the
    // canonical ordinal, so provider renumbering must not change the hash.
    provenance: {
      ...routeStop.provenance,
      providerId: "gtfs:stop_time",
    },
  }));
}

function buildCoverage(
  graph: NormalizedTransitGraph,
  patternAudit: readonly GtfsPatternAudit[],
): TransitCoverageReport {
  const auditByRoute = new Map(
    patternAudit.map((entry) => [entry.routeId, entry]),
  );
  const routeGroups = new Map<string, TransitRoute[]>();
  for (const route of graph.routes) {
    const key = `${route.operatorId}\u0000${route.mode}`;
    const group = routeGroups.get(key) ?? [];
    group.push(route);
    routeGroups.set(key, group);
  }
  const entries: TransitCoverageEntry[] = [];
  for (const [key, routes] of routeGroups) {
    const separator = key.indexOf("\u0000");
    const operatorId = key.slice(0, separator);
    const mode = key.slice(separator + 1) as TransitRouteMode;
    const operator = graph.operators.find(
      (candidate) => candidate.id === operatorId,
    );
    if (operator === undefined) continue;
    const notes: string[] = [];
    const empty = routes.filter(
      (route) => (auditByRoute.get(route.id)?.patternCount ?? 0) === 0,
    );
    const multiple = routes.filter(
      (route) => (auditByRoute.get(route.id)?.patternCount ?? 0) > 1,
    );
    let topology: TransitCoverageEntry["topology"] = "imported";
    if (graph.datasetVersion.completeness !== "complete_provider_dump") {
      topology = "partial";
      notes.push(
        `source is not a complete provider topology (${graph.datasetVersion.completeness})`,
      );
    }
    if (empty.length > 0) {
      topology = "partial";
      notes.push(
        `routes without ordered patterns: ${empty
          .map((route) => route.providerRouteId)
          .sort(lexical)
          .join(", ")}`,
      );
    }
    if (multiple.length > 0) {
      notes.push(
        `multiple ordered patterns preserved: ${multiple
          .map((route) => route.providerRouteId)
          .sort(lexical)
          .join(", ")}`,
      );
    }
    entries.push({
      provider: graph.datasetVersion.provider,
      operator: operator.providerOperatorId,
      mode,
      topology,
      timetable: "not_imported_in_this_slice",
      fare: "not_imported_in_this_slice",
      realtime: "not_evaluated",
      datasetId: graph.datasetVersion.datasetId,
      notes,
    });
  }
  entries.sort(
    (a, b) => lexical(a.operator, b.operator) || lexical(a.mode, b.mode),
  );
  return {
    datasetId: graph.datasetVersion.datasetId,
    schemaVersion: GTFS_TOPOLOGY_SCHEMA_VERSION,
    entries,
  };
}

/** Import decoded GTFS/GTFS-JP tables into the B1 normalized graph. */
export function importGtfsTopology(
  input: GtfsFeedTables,
  metadata: GtfsImportMetadata,
): GtfsImportResult {
  ensureFamilies(input);
  validateMetadata(metadata);
  if (metadata.provider === "gtfs-jp" && input.routesJp === undefined) {
    throw new GtfsImportError(
      "missing_family",
      "GTFS-JP input requires routes_jp.txt to substantiate the provider label.",
    );
  }
  if (metadata.provider === "gtfs" && input.routesJp !== undefined) {
    throw new GtfsImportError(
      "invalid_feed_semantics",
      "routes_jp.txt requires provider gtfs-jp.",
    );
  }

  const publisher = publisherOf(input.feedInfo);
  const language = languageOf(input.feedInfo);
  const agencies = new Map<string, AgencyInfo>();
  const agencyRows = input.agency;
  if (agencyRows.length === 0)
    throw new GtfsImportError(
      "missing_family",
      "agency.txt contains no agency.",
    );
  for (const [family, rows] of [
    ["stops", input.stops],
    ["routes", input.routes],
    ["trips", input.trips],
    ["stop_times", input.stopTimes],
  ] as const) {
    if (rows.length === 0) {
      throw new GtfsImportError(
        "missing_family",
        `${family} contains no records for topology import.`,
      );
    }
  }
  for (const row of agencyRows) {
    required(row, "agency_name", "agency");
    const declaredId = optional(row, "agency_id");
    if (declaredId === null && agencyRows.length > 1) {
      throw new GtfsImportError(
        "missing_agency_id",
        "agency_id is required when multiple agencies are present.",
      );
    }
    const providerId = declaredId ?? `feed:${metadata.identityNamespace}`;
    if (agencies.has(providerId)) {
      throw new GtfsImportError(
        "duplicate_provider_identity",
        `agency repeats ${providerId}.`,
      );
    }
    agencies.set(providerId, {
      providerId,
      internalId: gtfsOperatorInternalId(
        metadata.provider,
        providerId,
        metadata.identityNamespace,
      ),
      row,
    });
  }

  const routeRows = indexById(input.routes, "routes", "route_id");
  const routes = new Map<string, RouteInfo>();
  for (const [routeId, row] of routeRows) {
    const agencyId = optional(row, "agency_id");
    const selectedAgencyId =
      agencyId ?? (agencies.size === 1 ? [...agencies.keys()][0] : null);
    if (selectedAgencyId === null) {
      throw new GtfsImportError(
        "missing_agency_id",
        `route ${routeId} has no agency_id in a multi-agency feed.`,
      );
    }
    const agency = agencies.get(selectedAgencyId);
    if (agency === undefined) {
      throw new GtfsImportError(
        "unknown_agency_reference",
        `route ${routeId} references unknown agency ${selectedAgencyId}.`,
      );
    }
    const shortName = optional(row, "route_short_name");
    const longName = optional(row, "route_long_name");
    if (shortName === null && longName === null) {
      throw new GtfsImportError(
        "malformed_record",
        `route ${routeId} has neither route_short_name nor route_long_name.`,
      );
    }
    const rawType = required(row, "route_type", "routes", "invalid_route_type");
    const type = parseInteger(rawType, `route ${routeId}.route_type`);
    const info: RouteInfo = {
      providerId: routeId,
      internalId: gtfsRouteInternalId(
        metadata.provider,
        routeId,
        metadata.identityNamespace,
      ),
      operatorId: agency.internalId,
      mode: mapGtfsRouteType(type),
      routeType: type,
      row,
    };
    routes.set(routeId, info);
  }

  const trips = new Map<string, TripInfo>();
  for (const row of input.trips) {
    const tripId = required(row, "trip_id", "trips");
    if (trips.has(tripId))
      throw new GtfsImportError(
        "duplicate_provider_identity",
        `trips repeats ${tripId}.`,
      );
    const routeId = required(
      row,
      "route_id",
      "trips",
      "unknown_route_reference",
    );
    const route = routes.get(routeId);
    if (route === undefined)
      throw new GtfsImportError(
        "unknown_route_reference",
        `trip ${tripId} references unknown route ${routeId}.`,
      );
    const serviceId = required(row, "service_id", "trips");
    trips.set(tripId, { providerId: tripId, route, serviceId });
  }

  const stopRows = indexById(input.stops, "stops", "stop_id");
  const locationTypes = new Map<string, number>();
  for (const [stopId, row] of stopRows) {
    const rawLocationType = optional(row, "location_type") ?? "0";
    const locationType = parseInteger(
      rawLocationType,
      `stop ${stopId}.location_type`,
      "invalid_location_type",
    );
    if (locationType !== 0 && locationType !== 1) {
      throw new GtfsImportError(
        "unsupported_location_type",
        `stop ${stopId} location_type ${locationType} is outside C1's station/stop contract.`,
      );
    }
    required(row, "stop_name", "stops");
    coordinatesOf(row, stopId);
    locationTypes.set(stopId, locationType);
  }
  for (const [stopId, row] of stopRows) {
    const locationType = locationTypes.get(stopId);
    const parentStation = optional(row, "parent_station");
    if (locationType === 1 && parentStation !== null) {
      throw new GtfsImportError(
        "invalid_parent_station",
        `station ${stopId} must not declare parent_station ${parentStation}.`,
      );
    }
    if (locationType === 0 && parentStation !== null) {
      const parentType = locationTypes.get(parentStation);
      if (parentType === undefined) {
        throw new GtfsImportError(
          "unknown_stop_reference",
          `stop ${stopId} references unknown parent_station ${parentStation}.`,
        );
      }
      if (parentType !== 1) {
        throw new GtfsImportError(
          "invalid_parent_station",
          `stop ${stopId} parent_station ${parentStation} is not a station.`,
        );
      }
    }
  }

  const stopTimesByTrip = new Map<string, StopTimeInfo[]>();
  for (const row of input.stopTimes) {
    const tripId = required(
      row,
      "trip_id",
      "stop_times",
      "unknown_trip_reference",
    );
    const trip = trips.get(tripId);
    if (trip === undefined)
      throw new GtfsImportError(
        "unknown_trip_reference",
        `stop_times references unknown trip ${tripId}.`,
      );
    const stopId = required(
      row,
      "stop_id",
      "stop_times",
      "unknown_stop_reference",
    );
    if (!stopRows.has(stopId))
      throw new GtfsImportError(
        "unknown_stop_reference",
        `trip ${tripId} references unknown stop ${stopId}.`,
      );
    if (locationTypes.get(stopId) !== 0)
      throw new GtfsImportError(
        "invalid_stop_time_location",
        `trip ${tripId} stop_times.stop_id ${stopId} must reference a location_type 0 stop.`,
      );
    const order = parseInteger(
      required(row, "stop_sequence", "stop_times"),
      `trip ${tripId}.stop_sequence`,
      "invalid_stop_sequence",
    );
    if (order < 0)
      throw new GtfsImportError(
        "invalid_stop_sequence",
        `trip ${tripId} has negative stop_sequence.`,
      );
    const list = stopTimesByTrip.get(tripId) ?? [];
    if (list.some((entry) => entry.order === order)) {
      throw new GtfsImportError(
        "duplicate_stop_sequence",
        `trip ${tripId} repeats stop_sequence ${order}.`,
      );
    }
    list.push({ trip, stopId, order, sourceSequence: order });
    stopTimesByTrip.set(tripId, list);
  }

  const patternsByRoute = new Map<string, PatternInfo[]>();
  for (const trip of trips.values()) {
    const stopTimes = stopTimesByTrip.get(trip.providerId);
    if (stopTimes === undefined || stopTimes.length < 2) {
      throw new GtfsImportError(
        "missing_stop_times",
        `trip ${trip.providerId} requires at least two stop_times rows.`,
      );
    }
    const ordered = [...stopTimes].sort(
      (a, b) => a.order - b.order || lexical(a.stopId, b.stopId),
    );
    // Raw stop_sequence numbers are ordering evidence, not semantic identity.
    // Canonical ordinal positions make equivalent feeds deterministic even
    // when providers renumber the same ordered pattern.
    const canonical = ordered.map((entry, index) => ({
      ...entry,
      order: index + 1,
    }));
    const stopIds = canonical.map((entry) => entry.stopId);
    const patternId = gtfsPatternIdFor(trip.route.providerId, stopIds);
    const patterns = patternsByRoute.get(trip.route.providerId) ?? [];
    const existing = patterns.find(
      (pattern) => pattern.patternId === patternId,
    );
    if (existing === undefined) {
      patterns.push({
        patternId,
        stopIds,
        tripIds: [trip.providerId],
        serviceIds: [trip.serviceId],
        representativeTripId: trip.providerId,
        stopTimes: canonical,
      });
    } else {
      const index = patterns.indexOf(existing);
      const representativeTripId =
        lexical(existing.representativeTripId, trip.providerId) <= 0
          ? existing.representativeTripId
          : trip.providerId;
      patterns[index] = {
        ...existing,
        tripIds: [...existing.tripIds, trip.providerId],
        serviceIds: [...existing.serviceIds, trip.serviceId],
        representativeTripId,
        stopTimes:
          representativeTripId === trip.providerId
            ? canonical
            : existing.stopTimes,
      };
    }
    patternsByRoute.set(trip.route.providerId, patterns);
  }

  const routeUpdate = routeUpdateDates(input.routesJp, routes);
  const normalizedOperators: TransitOperator[] = [...agencies.values()].map(
    (agency) => ({
      id: agency.internalId,
      provider: metadata.provider,
      providerOperatorId: agency.providerId,
      names: { [language]: required(agency.row, "agency_name", "agency") },
      provenance: provenance(agency.providerId, "gtfs:agency", metadata),
    }),
  );

  const servingModes = new Map<string, Set<TransitRouteMode>>();
  for (const patternList of patternsByRoute.values()) {
    for (const pattern of patternList) {
      const route = pattern.stopTimes[0]?.trip.route;
      if (route === undefined) continue;
      for (const stopId of pattern.stopIds) {
        const modes = servingModes.get(stopId) ?? new Set<TransitRouteMode>();
        modes.add(route.mode);
        servingModes.set(stopId, modes);
      }
    }
  }

  const normalizedStops: TransitStop[] = [...stopRows.entries()].map(
    ([stopId, row]) => {
      const locationType = locationTypes.get(stopId) ?? 0;
      const modes = servingModes.get(stopId) ?? new Set<TransitRouteMode>();
      const parentStation = optional(row, "parent_station");
      const stopType =
        locationType === 1
          ? "station"
          : parentStation !== null
            ? "platform"
            : modes.size === 0
              ? (() => {
                  throw new GtfsImportError(
                    "unsupported_stop_semantics",
                    `stop ${stopId} has no parent or serving-mode evidence.`,
                  );
                })()
              : [...modes].some((mode) => mode !== "bus")
                ? "platform"
                : "bus_stop";
      const operatorIds = sortStrings(
        [...patternsByRoute.values()].flatMap((patterns) =>
          patterns.flatMap((pattern) =>
            pattern.stopIds.includes(stopId) &&
            pattern.stopTimes[0] !== undefined
              ? [pattern.stopTimes[0].trip.route.operatorId]
              : [],
          ),
        ),
      );
      const stopSemantics = {
        provider: metadata.provider,
        locationType,
        parentStation,
        platformCode: optional(row, "platform_code"),
      } as GtfsStopSourceSemantics | GtfsJpStopSourceSemantics;
      return {
        id: gtfsStopInternalId(
          metadata.provider,
          stopId,
          metadata.identityNamespace,
        ),
        provider: metadata.provider,
        providerStopId: stopId,
        stopType,
        coordinates: coordinatesOf(row, stopId),
        operatorIds,
        names: { [language]: required(row, "stop_name", "stops") },
        stationCode: null,
        sourceSemantics: stopSemantics,
        provenance: provenance(stopId, "gtfs:stop", metadata),
      };
    },
  );

  const normalizedRoutes: TransitRoute[] = [...routes.values()].map((route) => {
    const patterns = patternsByRoute.get(route.providerId) ?? [];
    return {
      id: route.internalId,
      provider: metadata.provider,
      providerRouteId: route.providerId,
      operatorId: route.operatorId,
      mode: route.mode,
      names: {
        [language]:
          optional(route.row, "route_long_name") ??
          optional(route.row, "route_short_name") ??
          route.providerId,
      },
      sourceSemantics: sourceSemanticsForRoute(
        metadata.provider,
        route,
        patterns,
        routeUpdate.get(route.providerId) ?? null,
      ),
      provenance: provenance(route.providerId, "gtfs:route", metadata),
    };
  });

  const normalizedRouteStops: TransitRouteStop[] = [];
  for (const route of routes.values()) {
    const patterns = patternsByRoute.get(route.providerId) ?? [];
    for (const pattern of patterns) {
      for (const entry of pattern.stopTimes) {
        normalizedRouteStops.push({
          routeId: route.internalId,
          stopId: gtfsStopInternalId(
            metadata.provider,
            entry.stopId,
            metadata.identityNamespace,
          ),
          patternId: pattern.patternId,
          order: entry.order,
          // stop_times has no standalone ID; this stable tuple identifies the
          // exact source row without pretending trip_id is a route.
          provenance: provenance(
            `${pattern.representativeTripId}:${entry.sourceSequence}`,
            "gtfs:stop_time",
            metadata,
          ),
        });
      }
    }
  }

  normalizedOperators.sort((a, b) => lexical(a.id, b.id));
  normalizedStops.sort((a, b) => lexical(a.id, b.id));
  normalizedRoutes.sort((a, b) => lexical(a.id, b.id));
  normalizedRouteStops.sort(
    (a, b) =>
      lexical(a.routeId, b.routeId) ||
      lexical(a.patternId ?? "", b.patternId ?? "") ||
      a.order - b.order ||
      lexical(a.stopId, b.stopId),
  );

  const patternAudit: GtfsPatternAudit[] = [...routes.values()]
    .map((route) => {
      const patterns = patternsByRoute.get(route.providerId) ?? [];
      return {
        routeId: route.internalId,
        patternIds: patterns.map((pattern) => pattern.patternId).sort(lexical),
        patternCount: patterns.length,
        classification: classifyPatterns(patterns),
      };
    })
    .sort((a, b) => lexical(a.routeId, b.routeId));

  const datasetVersion: TransitDatasetVersion = {
    provider: metadata.provider,
    datasetId: metadata.datasetId,
    sourceType: metadata.sourceType,
    sourceDescriptor: metadata.sourceDescriptor,
    retrievedAt: metadata.retrievedAt,
    checkedAt: metadata.checkedAt,
    issuedAt: metadata.issuedAt ?? null,
    validUntil: metadata.validUntil ?? null,
    ...(publisher === undefined ? {} : { publisher }),
    schemaVersion: GTFS_TOPOLOGY_SCHEMA_VERSION,
    completeness: metadata.completeness,
    contentHash: contentHashOf({
      operators: normalizedOperators,
      stops: normalizedStops,
      routes: normalizedRoutes,
      routeStops: gtfsRouteStopsForSemanticHash(normalizedRouteStops),
      calendars: [],
    }),
  };
  const graph: NormalizedTransitGraph = {
    datasetVersion,
    operators: normalizedOperators,
    stops: normalizedStops,
    routes: normalizedRoutes,
    routeStops: normalizedRouteStops,
    calendars: [],
    transfers: [],
    fares: [],
  };
  return { graph, coverage: buildCoverage(graph, patternAudit), patternAudit };
}
