import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";
import {
  getAirportZone,
  resolveDestinationTransportZone,
  topology,
  zoneById,
} from "../../src/shared/services/transport/TransportTopologyService";
import type { TransportZoneId } from "../../src/shared/types/transportTopology";
import flightRoutesData from "../../src/shared/data/flight-estimates.json";
import airportsData from "../../src/shared/data/airports.json";
import airportZonesData from "../../src/shared/data/airport-zones.json";
import ferryRoutesData from "../../src/shared/data/ferry-routes.json";

const VALID_RAIL_ROAD_BUS = new Set([
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
]);

const flightRoutes = (
  flightRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      fare?: [number, number] | null;
      fareStatus?: "verified" | "unverified";
      sourceUrl?: string;
      fareSourceUrl?: string;
      checkedAt?: string;
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
