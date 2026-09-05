import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";
import { getAuditReferenceToday } from "../config/audit-reference";
import { findContradictoryGroundDuplicates } from "./ground-duplicates";
import {
  getAirportZone,
  resolveDestinationTransportZone,
  topology,
  zoneById,
} from "../../src/shared/services/transport/TransportTopologyService";
import type { TransportZoneId } from "../../src/shared/types/transportTopology";
import flightRoutesData from "../../src/shared/data/flight-estimates.json";
import groundRoutesData from "../../src/shared/data/ground-routes.json";
import busRoutesData from "../../src/shared/data/bus-routes.json";
import airportsData from "../../src/shared/data/airports.json";
import airportZonesData from "../../src/shared/data/airport-zones.json";
import ferryRoutesData from "../../src/shared/data/ferry-routes.json";
import ferryEstimatesData from "../../src/shared/data/ferry-estimates.json";

const VALID_RAIL_ROAD_BUS = new Set([
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
]);

const VALID_GROUND_MODES = new Set(["train", "shinkansen", "car"]);

const VALID_FARE_VARIABILITY = new Set([
  "fixed",
  "range",
  "variable",
  "dynamic",
]);

const VALID_BUS_SERVICE_PERIOD = new Set(["day", "night", "mixed"]);

const VALID_GROUND_FARE_BASIS = new Set([
  "base",
  "base-plus-lex",
  "integrated-total",
  "non-reserved",
  "reserved",
]);

const groundRoutes = (
  groundRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      bidirectional?: boolean;
      mode?: string;
      timeRange?: [number, number];
      sourceUrl?: string;
      checkedAt?: string;
      fare?: [number, number] | null;
      fareBasis?: string;
      fareSourceUrl?: string;
    }>;
    municipalityRoutes?: Array<{
      from: string;
      to: string;
      bidirectional?: boolean;
      mode?: string;
      timeRange?: [number, number];
      sourceUrl?: string;
      checkedAt?: string;
      fare?: [number, number] | null;
      fareBasis?: string;
      fareSourceUrl?: string;
    }>;
  }
).routes;

const groundMunicipalityRoutes =
  (
    groundRoutesData as unknown as {
      municipalityRoutes?: Array<{
        from: string;
        to: string;
        bidirectional?: boolean;
        mode?: string;
        timeRange?: [number, number];
        sourceUrl?: string;
        checkedAt?: string;
        fare?: [number, number] | null;
        fareBasis?: string;
        fareSourceUrl?: string;
      }>;
    }
  ).municipalityRoutes ?? [];

const busRoutes = (
  busRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      bidirectional?: boolean;
      mode?: string;
      serviceName?: string;
      operator?: string;
      durationMinutes?: [number, number];
      reservationRequired?: boolean;
      fare?: [number, number | null] | null;
      fareVariability?: string;
      servicePeriod?: string;
      sourceUrl?: string;
      checkedAt?: string;
    }>;
  }
).routes;
const flightRoutes = (
  flightRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      flightTime?: [number, number];
      fare?: [number, number] | null;
      fareStatus?: "verified" | "unverified";
      sourceUrl?: string;
      fareSourceUrl?: string;
      checkedAt?: string;
      operatingPeriods?: Array<{ from: string; to: string }>;
    }>;
  }
).routes;
const airports = (
  airportsData as unknown as { airports: Array<{ code: string }> }
).airports;
const ferryRoutes = (
  ferryRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      sourceUrl?: string;
      checkedAt?: string;
      passengerService?: boolean;
    }>;
  }
).routes;
const ferryServices = (
  ferryEstimatesData as unknown as {
    ports: Array<{
      id: string;
      zoneId: string;
      coordinates: { lat: number; lng: number };
    }>;
    services: Array<{
      id: string;
      fromPort: string;
      toPort: string;
      operator: string;
      vesselType: string;
      passengerService: boolean;
      bidirectional: boolean;
      durationMinutes: [number, number];
      fare: [number, number] | null;
      fareBasis: "one-way" | "round-trip";
      sourceUrl?: string;
      checkedAt?: string;
      fareValidFrom?: string;
      fareValidTo?: string;
      operatingPeriods?: Array<{ from: string; to: string }>;
    }>;
  }
).services;
const ferryPortIds = new Set(
  (
    ferryEstimatesData as unknown as {
      ports: Array<{ id: string }>;
    }
  ).ports.map((p) => p.id),
);
const VALID_FERRY_VESSELS = new Set(["ferry", "jetfoil", "highspeed"]);
const VALID_FARE_BASIS = new Set(["one-way", "round-trip"]);
const MONTH_DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Routes the KAI-12 flight audit marked seasonal-only (FLIGHT_AUDIT §2:
 * ITM→ISG Jul 17–Aug 28, FUK→KUM Jul 1–Aug 31). They must always declare
 * operatingPeriods — the runtime treats an absent list as year-round, so a
 * dropped list would silently re-present a seasonal fact as year-round.
 */
const KNOWN_SEASONAL_FLIGHT_ROUTES = new Set(["ITM→ISG", "FUK→KUM"]);
/**
 * Corridors the KAI-12 highway-bus audit marked as operating on specific
 * dates only (HIGHWAY_BUS_AUDIT §1: Tokyo↔Matsuyama オレンジライナーえひめ
 * night, ~12.1 h). The bus runtime has no date gating, so these must never
 * be registered as verified availability — a future edit cannot silently
 * re-add them until bus operatingPeriods/date gating exists.
 */
const KNOWN_NON_DAILY_BUS_ROUTES = new Set(["tokyo→matsuyama"]);
/**
 * Canonical "today" for provenance checks (Japan local date at last
 * verification round). checkedAt must never be in the future relative to
 * this reference. Centralized in scripts/config/audit-reference.ts (KAI-12
 * hard gate 1) — computed from the current clock, never a manually bumped
 * constant.
 */
const REFERENCE_TODAY = getAuditReferenceToday();
const airportZones = (
  airportZonesData as unknown as { airports: Record<string, string> }
).airports;

const airportCodes = new Set(airports.map((a) => a.code));
const zoneIds = new Set<TransportZoneId>(topology.zones.map((z) => z.id));

/** Zones that cannot be derived from prefecture metadata. */
const EXPLICIT_ONLY_ZONES = new Set<TransportZoneId>([
  "ishigaki",
  "miyako",
  "amami",
  "yakushima",
  "tsushima",
  "ogasawara",
  "sado",
  "naoshima",
  "teshima",
  "tomogashima",
]);

/**
 * Validates the canonical transport topology: explicit destination zone
 * assignments, rail/road/bus edges, flight routes against the airport
 * registry, ferry routes against the ferry registry, and conservative
 * resolution for island-marked records. Remote zones are validated too —
 * a remote zone with no verified route is reported as a warning.
 */
export const transportTopologyValidator: ValidatorModule = {
  name: "Transport Topology",
  description:
    "Validates explicit destination-zone assignments, topology edges, and the flight/ferry route registries.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure island destinations carry canonical zone assignments, every route registry entry is internally consistent, and no island silently falls through to a mainland zone.",
  guarantees: [
    "Every explicit transportZoneId references a real zone and matches runtime resolution",
    "Every published island destination has an explicit assignment when its zone is not prefecture-derivable",
    "Edges carry only rail/road/bus modes between real zones",
    "Every flight route references airports in the airport registry",
    "Every ferry route references real zones",
    "Island-marked records never resolve to a mainland zone",
  ],
  doesNotValidate: ["Live ferry timetables", "Flight route fares"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;
    const issues: ValidationIssue[] = [];

    for (const zone of topology.zones) {
      for (const mode of zone.localModes) {
        if (!VALID_RAIL_ROAD_BUS.has(mode)) {
          issues.push({
            severity: "error",
            code: "invalid_local_mode",
            message: `Zone ${zone.id} has invalid local mode '${mode}'`,
          });
        }
      }
      if (zone.isRemote && zone.localModes.includes("shinkansen")) {
        issues.push({
          severity: "error",
          code: "remote_island_shinkansen",
          message: `Remote zone ${zone.id} exposes shinkansen locally`,
        });
      }
    }

    const seenEdges = new Set<string>();
    for (const edge of topology.edges) {
      if (!zoneIds.has(edge.from)) {
        issues.push({
          severity: "error",
          code: "unknown_zone",
          message: `Edge references unknown zone '${edge.from}'`,
        });
      }
      if (!zoneIds.has(edge.to)) {
        issues.push({
          severity: "error",
          code: "unknown_zone",
          message: `Edge references unknown zone '${edge.to}'`,
        });
      }
      if (edge.from === edge.to) {
        issues.push({
          severity: "error",
          code: "self_edge",
          message: `Self-referencing edge on ${edge.from}`,
        });
      }
      for (const mode of edge.modes) {
        if (!VALID_RAIL_ROAD_BUS.has(mode)) {
          issues.push({
            severity: "error",
            code: "invalid_edge_mode",
            message: `Edge ${edge.from}→${edge.to} has non-rail/road/bus mode '${mode}'`,
          });
        }
      }
      const key = [edge.from, edge.to].sort().join("↔");
      if (seenEdges.has(key)) {
        issues.push({
          severity: "error",
          code: "duplicate_edge",
          message: `Duplicate connection ${edge.from} ↔ ${edge.to}`,
        });
      }
      seenEdges.add(key);
    }

    for (const route of flightRoutes) {
      if (!airportCodes.has(route.from)) {
        issues.push({
          severity: "error",
          code: "unknown_departure_airport",
          message: `Flight route references unknown airport '${route.from}'`,
        });
      }
      if (!airportCodes.has(route.to)) {
        issues.push({
          severity: "error",
          code: "unknown_arrival_airport",
          message: `Flight route references unknown airport '${route.to}'`,
        });
      }
      if (getAirportZone(route.from) === null) {
        issues.push({
          severity: "error",
          code: "missing_departure_airport_zone",
          message: `Flight route endpoint '${route.from}' has no airport-zone assignment`,
        });
      }
      if (getAirportZone(route.to) === null) {
        issues.push({
          severity: "error",
          code: "missing_arrival_airport_zone",
          message: `Flight route endpoint '${route.to}' has no airport-zone assignment`,
        });
      }
      if (
        "sourceUrl" in route &&
        (typeof route.sourceUrl !== "string" ||
          !/^https?:\/\//.test(route.sourceUrl))
      ) {
        issues.push({
          severity: "error",
          code: "invalid_route_source",
          message: `Flight route ${route.from}→${route.to} has an invalid sourceUrl`,
        });
      }
      if ("checkedAt" in route && typeof route.checkedAt !== "string") {
        issues.push({
          severity: "error",
          code: "invalid_route_checked_at",
          message: `Flight route ${route.from}→${route.to} has an invalid checkedAt`,
        });
      } else if (
        typeof route.checkedAt === "string" &&
        route.checkedAt > REFERENCE_TODAY
      ) {
        issues.push({
          severity: "error",
          code: "future_route_checked_at",
          message: `Flight route ${route.from}→${route.to} has future checkedAt '${route.checkedAt}' (today is ${REFERENCE_TODAY})`,
        });
      }
      if (
        !Array.isArray(route.flightTime) ||
        route.flightTime.length !== 2 ||
        typeof route.flightTime[0] !== "number" ||
        typeof route.flightTime[1] !== "number" ||
        route.flightTime[0] < 0 ||
        route.flightTime[1] < route.flightTime[0]
      ) {
        issues.push({
          severity: "error",
          code: "invalid_flight_time_range",
          message: `Flight route ${route.from}→${route.to} has an invalid flightTime range`,
        });
      }
      // Fare provenance: an unverified fare must be null; a numeric fare
      // must be verified. Unverified routes must not present prices.
      if (route.fare === null && route.fareStatus !== "unverified") {
        issues.push({
          severity: "error",
          code: "unverified_fare_without_status",
          message: `Flight route ${route.from}→${route.to} has null fare but fareStatus is not "unverified"`,
        });
      }
      if (route.fare !== null && route.fareStatus === "unverified") {
        issues.push({
          severity: "error",
          code: "unverified_fare_with_price",
          message: `Flight route ${route.from}→${route.to} carries a fare with fareStatus "unverified"`,
        });
      }
      if (route.fare !== null && Array.isArray(route.fare)) {
        if (
          typeof route.fare[0] !== "number" ||
          typeof route.fare[1] !== "number" ||
          route.fare[0] < 0 ||
          route.fare[1] < route.fare[0]
        ) {
          issues.push({
            severity: "error",
            code: "invalid_fare_range",
            message: `Flight route ${route.from}→${route.to} has an invalid fare range`,
          });
        }
      }
      // Routes with fare metadata must carry existence provenance.
      if ("fareStatus" in route || route.fare === null) {
        if (
          typeof route.sourceUrl !== "string" ||
          !/^https?:\/\//.test(route.sourceUrl)
        ) {
          issues.push({
            severity: "error",
            code: "missing_route_source",
            message: `Flight route ${route.from}→${route.to} requires a sourceUrl supporting route existence`,
          });
        }
        if (typeof route.checkedAt !== "string" || !route.checkedAt) {
          issues.push({
            severity: "error",
            code: "missing_route_checked_at",
            message: `Flight route ${route.from}→${route.to} requires checkedAt`,
          });
        }
      }
      if (
        "fareSourceUrl" in route &&
        route.fareSourceUrl !== undefined &&
        !/^https?:\/\//.test(route.fareSourceUrl)
      ) {
        issues.push({
          severity: "error",
          code: "invalid_fare_source",
          message: `Flight route ${route.from}→${route.to} has an invalid fareSourceUrl`,
        });
      }
      // Seasonal routes must declare operating periods and they must be
      // valid MM-DD ranges (inclusive; may wrap a year boundary).
      if (route.operatingPeriods?.length) {
        for (const period of route.operatingPeriods) {
          if (
            !MONTH_DAY_RE.test(period.from) ||
            !MONTH_DAY_RE.test(period.to)
          ) {
            issues.push({
              severity: "error",
              code: "invalid_flight_operating_period",
              message: `Flight route ${route.from}→${route.to} has invalid operatingPeriod '${period.from}–${period.to}'`,
            });
          }
        }
      }
      // Routes the KAI-12 flight audit marked seasonal-only (FLIGHT_AUDIT
      // §2) must declare operatingPeriods; otherwise a future edit silently
      // re-presents them as year-round and the runtime no-date gate
      // (isFlightRouteOperating) leaks them.
      if (
        KNOWN_SEASONAL_FLIGHT_ROUTES.has(`${route.from}→${route.to}`) &&
        !route.operatingPeriods?.length
      ) {
        issues.push({
          severity: "error",
          code: "seasonal_route_missing_operating_periods",
          message: `Flight route ${route.from}→${route.to} is audited seasonal-only (FLIGHT_AUDIT §2) but declares no operatingPeriods`,
        });
      }
    }

    // Verified ground corridors (prefecture-pair and municipality-pair):
    // deterministic checks that prevent new rows from silently breaking the
    // evidence contract — provenance required, no future checkedAt, valid
    // time range, supported mode, no contradictory duplicates.
    for (const route of [...groundRoutes, ...groundMunicipalityRoutes]) {
      if (!VALID_GROUND_MODES.has(route.mode ?? "")) {
        issues.push({
          severity: "error",
          code: "invalid_ground_mode",
          message: `Ground route ${route.from}→${route.to} has unsupported mode '${route.mode}'`,
        });
      }
      if (
        !Array.isArray(route.timeRange) ||
        route.timeRange.length !== 2 ||
        typeof route.timeRange[0] !== "number" ||
        typeof route.timeRange[1] !== "number" ||
        route.timeRange[0] < 0 ||
        route.timeRange[1] < route.timeRange[0]
      ) {
        issues.push({
          severity: "error",
          code: "invalid_ground_time_range",
          message: `Ground route ${route.from}→${route.to} has an invalid timeRange`,
        });
      }
      if (
        typeof route.sourceUrl !== "string" ||
        !/^https?:\/\//.test(route.sourceUrl)
      ) {
        issues.push({
          severity: "error",
          code: "missing_ground_source",
          message: `Ground route ${route.from}→${route.to} requires a sourceUrl`,
        });
      }
      if (typeof route.checkedAt !== "string" || !route.checkedAt) {
        issues.push({
          severity: "error",
          code: "missing_ground_checked_at",
          message: `Ground route ${route.from}→${route.to} requires checkedAt`,
        });
      } else if (!ISO_DATE_RE.test(route.checkedAt)) {
        issues.push({
          severity: "error",
          code: "invalid_ground_checked_at",
          message: `Ground route ${route.from}→${route.to} has non-ISO checkedAt '${route.checkedAt}'`,
        });
      } else if (route.checkedAt > REFERENCE_TODAY) {
        issues.push({
          severity: "error",
          code: "future_ground_checked_at",
          message: `Ground route ${route.from}→${route.to} has future checkedAt '${route.checkedAt}' (today is ${REFERENCE_TODAY})`,
        });
      }
    }

    // Contradictory duplicate detection: the same ordered pair+mode may
    // appear at most once per registry, and a bidirectional record may not
    // coexist with its reverse (prefecture vs municipality are separate
    // namespaces and are compared within their own registry). Two opposite
    // directional records (both bidirectional:false) are legal —
    // GroundRouteEstimator resolves them as distinct services. Logic lives
    // in ground-duplicates.ts, shared with TransportRegistryInvariants.
    for (const [registryName, registry] of [
      ["ground-routes.json", groundRoutes],
      ["ground-routes.json municipalityRoutes", groundMunicipalityRoutes],
    ] as const) {
      for (const dup of findContradictoryGroundDuplicates(registry)) {
        issues.push({
          severity: "error",
          code: "duplicate_ground_corridor",
          message: `Ground corridor ${dup.route.from}→${dup.route.to} (${dup.route.mode}) duplicates ${dup.existing.from}→${dup.existing.to} in ${registryName}`,
        });
      }
    }

    // Verified intercity/highway-bus corridors: provenance, duration
    // ranges, fare integrity (per FARE_POLICY §3), and reservation flags.
    // Bus corridors are city-pair facts — a local city bus or airport
    // limousine must never appear here (MODE_SEMANTICS §3).
    for (const route of busRoutes) {
      if (route.mode !== "bus") {
        issues.push({
          severity: "error",
          code: "invalid_bus_mode",
          message: `Bus route ${route.from}→${route.to} has unsupported mode '${route.mode}'`,
        });
      }
      if (
        KNOWN_NON_DAILY_BUS_ROUTES.has(`${route.from}→${route.to}`) ||
        KNOWN_NON_DAILY_BUS_ROUTES.has(`${route.to}→${route.from}`)
      ) {
        issues.push({
          severity: "error",
          code: "non_daily_bus_corridor_registered",
          message: `Bus route ${route.from}→${route.to} is audited specific-dates-only (HIGHWAY_BUS_AUDIT §1) and must not be registered without bus date gating`,
        });
      }
      if (
        !Array.isArray(route.durationMinutes) ||
        route.durationMinutes.length !== 2 ||
        typeof route.durationMinutes[0] !== "number" ||
        typeof route.durationMinutes[1] !== "number" ||
        route.durationMinutes[0] < 0 ||
        route.durationMinutes[1] < route.durationMinutes[0]
      ) {
        issues.push({
          severity: "error",
          code: "invalid_bus_duration",
          message: `Bus route ${route.from}→${route.to} has an invalid durationMinutes range`,
        });
      }
      if (
        typeof route.sourceUrl !== "string" ||
        !/^https?:\/\//.test(route.sourceUrl)
      ) {
        issues.push({
          severity: "error",
          code: "missing_bus_source",
          message: `Bus route ${route.from}→${route.to} requires a sourceUrl`,
        });
      }
      if (typeof route.checkedAt !== "string" || !route.checkedAt) {
        issues.push({
          severity: "error",
          code: "missing_bus_checked_at",
          message: `Bus route ${route.from}→${route.to} requires checkedAt`,
        });
      } else if (!ISO_DATE_RE.test(route.checkedAt)) {
        issues.push({
          severity: "error",
          code: "invalid_bus_checked_at",
          message: `Bus route ${route.from}→${route.to} has non-ISO checkedAt '${route.checkedAt}'`,
        });
      } else if (route.checkedAt > REFERENCE_TODAY) {
        issues.push({
          severity: "error",
          code: "future_bus_checked_at",
          message: `Bus route ${route.from}→${route.to} has future checkedAt '${route.checkedAt}' (today is ${REFERENCE_TODAY})`,
        });
      }
      if (typeof route.reservationRequired !== "boolean") {
        issues.push({
          severity: "error",
          code: "missing_bus_reservation",
          message: `Bus route ${route.from}→${route.to} requires reservationRequired`,
        });
      }
      if (route.fare !== null && Array.isArray(route.fare)) {
        if (
          typeof route.fare[0] !== "number" ||
          route.fare[0] < 0 ||
          (route.fare[1] !== null &&
            (typeof route.fare[1] !== "number" ||
              route.fare[1] < route.fare[0]))
        ) {
          issues.push({
            severity: "error",
            code: "invalid_bus_fare",
            message: `Bus route ${route.from}→${route.to} has an invalid fare range`,
          });
        }
      }
      if (
        route.fareVariability !== undefined &&
        route.fareVariability !== null &&
        !VALID_FARE_VARIABILITY.has(route.fareVariability)
      ) {
        issues.push({
          severity: "error",
          code: "invalid_bus_fare_variability",
          message: `Bus route ${route.from}→${route.to} has invalid fareVariability '${route.fareVariability}'`,
        });
      }
      if (route.fare !== null && !route.fareVariability) {
        issues.push({
          severity: "error",
          code: "missing_bus_fare_variability",
          message: `Bus route ${route.from}→${route.to} carries a fare without fareVariability`,
        });
      }
      if (
        route.servicePeriod !== undefined &&
        !VALID_BUS_SERVICE_PERIOD.has(route.servicePeriod)
      ) {
        issues.push({
          severity: "error",
          code: "invalid_bus_service_period",
          message: `Bus route ${route.from}→${route.to} has invalid servicePeriod '${route.servicePeriod}' (day|night|mixed)`,
        });
      }
    }

    // Verified ground fares (FARE_POLICY §0/§2/§5): a stored fare must be a
    // nonnegative range with a valid basis and its own provenance; a null
    // fare must not carry a basis that implies a price; and a
    // conventional-train row must never carry a fare (no verified
    // conventional fares exist — a train duration with a shinkansen price
    // is a mixed product). Municipality routes are covered too.
    for (const route of [...groundRoutes, ...groundMunicipalityRoutes]) {
      if (route.mode === "train" && route.fare !== undefined) {
        issues.push({
          severity: "error",
          code: "mixed_product_train_fare",
          message: `Ground route ${route.from}→${route.to} is a train corridor but carries a fare — no verified conventional-rail fares exist (FARE_POLICY §5)`,
        });
      }
      if (route.fare !== undefined && route.fare !== null) {
        if (
          !Array.isArray(route.fare) ||
          route.fare.length !== 2 ||
          typeof route.fare[0] !== "number" ||
          typeof route.fare[1] !== "number" ||
          route.fare[0] < 0 ||
          route.fare[1] < route.fare[0]
        ) {
          issues.push({
            severity: "error",
            code: "invalid_ground_fare_range",
            message: `Ground route ${route.from}→${route.to} has an invalid fare range`,
          });
        }
        if (!VALID_GROUND_FARE_BASIS.has(route.fareBasis ?? "")) {
          issues.push({
            severity: "error",
            code: "invalid_ground_fare_basis",
            message: `Ground route ${route.from}→${route.to} has invalid fareBasis '${route.fareBasis}'`,
          });
        }
        if (
          typeof route.fareSourceUrl !== "string" ||
          !/^https?:\/\//.test(route.fareSourceUrl)
        ) {
          issues.push({
            severity: "error",
            code: "missing_ground_fare_source",
            message: `Ground route ${route.from}→${route.to} requires a fareSourceUrl supporting the fare`,
          });
        }
      } else if (route.fare === null && route.fareBasis) {
        issues.push({
          severity: "error",
          code: "null_ground_fare_with_basis",
          message: `Ground route ${route.from}→${route.to} declares fareBasis but has no fare`,
        });
      }
    }

    for (const [airportCode, zone] of Object.entries(airportZones)) {
      if (!airportCodes.has(airportCode)) {
        issues.push({
          severity: "error",
          code: "unknown_airport_zone",
          message: `Airport zone references unknown airport '${airportCode}'`,
        });
      }
      if (!zoneIds.has(zone as TransportZoneId)) {
        issues.push({
          severity: "error",
          code: "invalid_airport_zone",
          message: `Airport '${airportCode}' references unknown zone '${zone}'`,
        });
      }
      if (getAirportZone(airportCode) !== zone) {
        issues.push({
          severity: "error",
          code: "airport_zone_mismatch",
          message: `Airport zone file and service disagree for '${airportCode}'`,
        });
      }
    }

    for (const route of ferryRoutes) {
      if (!zoneIds.has(route.from as TransportZoneId)) {
        issues.push({
          severity: "error",
          code: "unknown_ferry_zone",
          message: `Ferry route references unknown zone '${route.from}'`,
        });
      }
      if (!zoneIds.has(route.to as TransportZoneId)) {
        issues.push({
          severity: "error",
          code: "unknown_ferry_zone",
          message: `Ferry route references unknown zone '${route.to}'`,
        });
      }
      if (route.from === route.to) {
        issues.push({
          severity: "error",
          code: "self_ferry_route",
          message: `Ferry route connects ${route.from} to itself`,
        });
      }
      if (
        typeof route.sourceUrl !== "string" ||
        !/^https?:\/\//.test(route.sourceUrl)
      ) {
        issues.push({
          severity: "error",
          code: "missing_ferry_source",
          message: `Ferry route ${route.from}→${route.to} requires a sourceUrl`,
        });
      }
      if (typeof route.checkedAt !== "string" || !route.checkedAt) {
        issues.push({
          severity: "error",
          code: "missing_ferry_checked_at",
          message: `Ferry route ${route.from}→${route.to} requires checkedAt`,
        });
      }
      if (typeof route.passengerService !== "boolean") {
        issues.push({
          severity: "error",
          code: "missing_ferry_passenger_service",
          message: `Ferry route ${route.from}→${route.to} requires passengerService`,
        });
      }
    }

    for (const port of (
      ferryEstimatesData as unknown as {
        ports: Array<{ id: string; zoneId: string }>;
      }
    ).ports) {
      if (!zoneIds.has(port.zoneId as TransportZoneId)) {
        issues.push({
          severity: "error",
          code: "invalid_ferry_port_zone",
          message: `Ferry port '${port.id}' references unknown zone '${port.zoneId}'`,
        });
      }
    }

    for (const service of ferryServices) {
      if (!ferryPortIds.has(service.fromPort)) {
        issues.push({
          severity: "error",
          code: "unknown_ferry_departure_port",
          message: `Ferry service '${service.id}' references unknown port '${service.fromPort}'`,
        });
      }
      if (!ferryPortIds.has(service.toPort)) {
        issues.push({
          severity: "error",
          code: "unknown_ferry_arrival_port",
          message: `Ferry service '${service.id}' references unknown port '${service.toPort}'`,
        });
      }
      if (service.fromPort === service.toPort) {
        issues.push({
          severity: "error",
          code: "self_ferry_service",
          message: `Ferry service '${service.id}' connects ${service.fromPort} to itself`,
        });
      }
      if (!VALID_FERRY_VESSELS.has(service.vesselType)) {
        issues.push({
          severity: "error",
          code: "invalid_ferry_vessel",
          message: `Ferry service '${service.id}' has unknown vesselType '${service.vesselType}'`,
        });
      }
      if (typeof service.passengerService !== "boolean") {
        issues.push({
          severity: "error",
          code: "missing_ferry_passenger_flag",
          message: `Ferry service '${service.id}' requires passengerService`,
        });
      }
      if (typeof service.bidirectional !== "boolean") {
        issues.push({
          severity: "error",
          code: "missing_ferry_direction",
          message: `Ferry service '${service.id}' requires bidirectional`,
        });
      }
      if (
        !Array.isArray(service.durationMinutes) ||
        service.durationMinutes.length !== 2 ||
        service.durationMinutes[0] < 0 ||
        service.durationMinutes[1] < service.durationMinutes[0]
      ) {
        issues.push({
          severity: "error",
          code: "invalid_ferry_duration",
          message: `Ferry service '${service.id}' has an invalid durationMinutes range`,
        });
      }
      if (!VALID_FARE_BASIS.has(service.fareBasis)) {
        issues.push({
          severity: "error",
          code: "invalid_fare_basis",
          message: `Ferry service '${service.id}' has invalid fareBasis '${service.fareBasis}'`,
        });
      }
      if (service.fare !== null) {
        if (
          !Array.isArray(service.fare) ||
          service.fare.length !== 2 ||
          service.fare[0] < 0 ||
          service.fare[1] < service.fare[0]
        ) {
          issues.push({
            severity: "error",
            code: "invalid_ferry_fare",
            message: `Ferry service '${service.id}' has an invalid fare range`,
          });
        }
      }
      if (service.fare === null && service.fareBasis !== "one-way") {
        issues.push({
          severity: "error",
          code: "null_fare_round_trip",
          message: `Ferry service '${service.id}' has null fare with fareBasis '${service.fareBasis}'`,
        });
      }
      if (
        typeof service.sourceUrl !== "string" ||
        !/^https?:\/\//.test(service.sourceUrl)
      ) {
        issues.push({
          severity: "error",
          code: "missing_ferry_service_source",
          message: `Ferry service '${service.id}' requires a sourceUrl supporting route existence`,
        });
      }
      if (typeof service.checkedAt !== "string" || !service.checkedAt) {
        issues.push({
          severity: "error",
          code: "missing_ferry_service_checked_at",
          message: `Ferry service '${service.id}' requires checkedAt`,
        });
      } else if (!ISO_DATE_RE.test(service.checkedAt)) {
        issues.push({
          severity: "error",
          code: "invalid_ferry_checked_at",
          message: `Ferry service '${service.id}' has non-ISO checkedAt '${service.checkedAt}'`,
        });
      } else if (service.checkedAt > REFERENCE_TODAY) {
        issues.push({
          severity: "error",
          code: "future_ferry_checked_at",
          message: `Ferry service '${service.id}' has future checkedAt '${service.checkedAt}' (today is ${REFERENCE_TODAY})`,
        });
      }
      for (const [index, period] of (
        service.operatingPeriods ?? []
      ).entries()) {
        if (period.weekdays !== undefined) {
          const invalid = period.weekdays.filter(
            (d) => !Number.isInteger(d) || d < 0 || d > 6,
          );
          if (invalid.length > 0) {
            issues.push({
              severity: "error",
              code: "invalid_period_weekdays",
              message: `Ferry service '${service.id}' period ${index} has invalid weekdays ${JSON.stringify(invalid)} (expected integers 0=Sun..6=Sat)`,
            });
          }
        }
        if (period.excludeDates !== undefined) {
          const invalid = period.excludeDates.filter(
            (d) => !MONTH_DAY_RE.test(d),
          );
          if (invalid.length > 0) {
            issues.push({
              severity: "error",
              code: "invalid_period_exclude_date",
              message: `Ferry service '${service.id}' period ${index} has non-MM-DD excludeDates ${JSON.stringify(invalid)}`,
            });
          }
        }
      }
      for (const period of service.operatingPeriods ?? []) {
        if (!MONTH_DAY_RE.test(period.from) || !MONTH_DAY_RE.test(period.to)) {
          issues.push({
            severity: "error",
            code: "invalid_ferry_operating_period",
            message: `Ferry service '${service.id}' has invalid operatingPeriod '${period.from}–${period.to}'`,
          });
        }
      }
      const hasFareFrom =
        "fareValidFrom" in service && service.fareValidFrom !== undefined;
      const hasFareTo =
        "fareValidTo" in service && service.fareValidTo !== undefined;
      if (hasFareTo && !hasFareFrom) {
        // A to-only window has no start — not representable.
        issues.push({
          severity: "error",
          code: "partial_fare_validity",
          message: `Ferry service '${service.id}' must set fareValidFrom when setting fareValidTo (a from-only window is an open-ended "valid since" window)`,
        });
      }
      if (hasFareFrom) {
        if (
          !ISO_DATE_RE.test(service.fareValidFrom!) ||
          (hasFareTo && !ISO_DATE_RE.test(service.fareValidTo!))
        ) {
          issues.push({
            severity: "error",
            code: "invalid_fare_validity_date",
            message: `Ferry service '${service.id}' has non-ISO fare validity dates`,
          });
        } else if (hasFareTo && service.fareValidFrom! > service.fareValidTo!) {
          issues.push({
            severity: "error",
            code: "fare_validity_reversed",
            message: `Ferry service '${service.id}' has fareValidFrom after fareValidTo`,
          });
        }
        if (service.fare === null) {
          issues.push({
            severity: "error",
            code: "null_fare_with_validity",
            message: `Ferry service '${service.id}' declares a fare validity window but has no verified fare`,
          });
        }
      }
    }

    const LOCAL_MODE_SET = new Set([
      "train",
      "shinkansen",
      "car",
      "my_car",
      "bus",
    ]);

    const explicitZones = new Set<string>();
    for (const dest of destinations) {
      if (!dest.id) continue;

      if (dest.localAccessModes?.length) {
        const seen = new Set<string>();
        for (const mode of dest.localAccessModes) {
          if (!LOCAL_MODE_SET.has(mode)) {
            issues.push({
              severity: "error",
              code: "invalid_local_access_mode",
              message: `${dest.id} localAccessModes contains unsupported mode '${mode}' (flight/ferry are not local modes)`,
              targetId: dest.id,
            });
          }
          if (seen.has(mode)) {
            issues.push({
              severity: "error",
              code: "duplicate_local_access_mode",
              message: `${dest.id} localAccessModes contains duplicate '${mode}'`,
              targetId: dest.id,
            });
          }
          seen.add(mode);
        }
        const zone = resolveDestinationTransportZone(dest);
        if (zone !== "unknown") {
          const zoneData = zoneById.get(zone);
          for (const mode of dest.localAccessModes) {
            if (zoneData && !zoneData.localModes.includes(mode)) {
              issues.push({
                severity: "error",
                code: "local_access_outside_zone",
                message: `${dest.id} localAccessMode '${mode}' is not in zone ${zone} localModes`,
                targetId: dest.id,
              });
            }
          }
        }
        if (!dest.localAccessUnestimated) {
          for (const mode of dest.localAccessModes) {
            if (
              dest.transportOptions?.[
                mode as keyof typeof dest.transportOptions
              ] === undefined
            ) {
              issues.push({
                severity: "error",
                code: "unbacked_local_access_mode",
                message: `${dest.id} localAccessMode '${mode}' has no estimator or static transport option and is not marked localAccessUnestimated`,
                targetId: dest.id,
              });
            }
          }
        }
      }

      const tags = [...(dest.tags ?? []), ...(dest.categories ?? [])].map((t) =>
        t.toLowerCase(),
      );
      const islandTagTokens = tags.flatMap((t) => t.split(/[^a-z0-9]+/));
      const islandMarked =
        dest.kind === "island" ||
        islandTagTokens.includes("island") ||
        islandTagTokens.includes("remote") ||
        islandTagTokens.includes("ferry");

      if (dest.transportZoneId === "unknown") {
        // Explicit non-routable declaration (e.g. a multi-island aggregate
        // with no single routable location). Editorial authority; runtime
        // resolution returns no modes for it.
        continue;
      }

      if (dest.transportZoneId) {
        if (!zoneIds.has(dest.transportZoneId as TransportZoneId)) {
          issues.push({
            severity: "error",
            code: "unknown_explicit_zone",
            message: `${dest.id} references unknown transport zone '${dest.transportZoneId}'`,
            targetId: dest.id,
          });
          continue;
        }
        explicitZones.add(dest.id);
        // Consistency: the assignment must agree with natural resolution
        // (resolution without the explicit field). A record whose natural
        // resolution is unknown is an intentional declaration (e.g. a
        // bridge-connected island) and is allowed.
        const stripped = resolveDestinationTransportZone({
          ...dest,
          transportZoneId: undefined,
        });
        if (stripped !== "unknown" && stripped !== dest.transportZoneId) {
          issues.push({
            severity: "error",
            code: "explicit_zone_mismatch",
            message: `${dest.id} explicit zone '${dest.transportZoneId}' naturally resolves to '${stripped}'`,
            targetId: dest.id,
          });
        }
        continue;
      }

      const resolved = resolveDestinationTransportZone(dest);
      if (resolved === "unknown") {
        if (islandMarked) {
          issues.push({
            severity: "error",
            code: "unassigned_island",
            message: `Island-marked destination ${dest.id} has no transport zone assignment`,
            targetId: dest.id,
          });
        }
        continue;
      }

      if (EXPLICIT_ONLY_ZONES.has(resolved)) {
        issues.push({
          severity: "error",
          code: "missing_explicit_zone",
          message: `${dest.id} resolves to ${resolved} without an explicit transportZoneId`,
          targetId: dest.id,
        });
      }
    }

    // Remote zones must be reachable through the ferry registry or an
    // explicit rail/road/bus edge. Flight reachability is proven at runtime
    // by the airport route lookup; the registries here are the structural
    // guarantees the validator can enforce.
    for (const zone of topology.zones) {
      if (!zone.isRemote) continue;
      const reachableByFerry = ferryRoutes.some(
        (r) => r.from === zone.id || r.to === zone.id,
      );
      const reachableByEdge = topology.edges.some(
        (e) => e.from === zone.id || e.to === zone.id,
      );
      if (!reachableByFerry && !reachableByEdge) {
        issues.push({
          severity: "warning",
          code: "remote_zone_unreachable",
          message: `Remote zone ${zone.id} has no verified ferry route or rail/road edge`,
        });
      }
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: "Transport Topology",
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked: destinations.length,
        errorsCount,
        warningsCount,
        infoCount,
        durationMs: 0,
      },
    };
  },
};
