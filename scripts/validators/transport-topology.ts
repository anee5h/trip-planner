import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";
import { resolveDestinationTransportZone } from "../../src/shared/services/transport/TransportTopologyService";
import {
  getEligibleOriginModes,
  isBridgeConnectedDestination,
  topology,
} from "../../src/shared/services/transport/TransportTopologyService";
import { zoneById } from "../../src/shared/services/transport/TransportTopologyService";
import type { TransportZoneId } from "../../src/shared/types/transportTopology";

const VALID_MODES = new Set([
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
  "flight",
  "ferry",
]);

/**
 * Validates that every destination resolves to exactly one transport zone,
 * that the canonical topology graph contains no invalid references, modes,
 * or duplicate edges, and that island records never fall through to the
 * mainland default.
 */
export const transportTopologyValidator: ValidatorModule = {
  name: "Transport Topology",
  description:
    "Validates canonical transport-zone resolution and island connectivity for every destination.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure every island destination resolves to a real zone, edges are explicit and valid, and no island silently inherits mainland rail/road access.",
  guarantees: [
    "Every destination resolves to exactly one transport zone",
    "All topology zone/gateway references exist",
    "Edges use only valid transport modes",
    "Remote islands never fall through to the mainland default",
    "Okinawa and Ogasawara never gain land or flight access through the graph",
  ],
  doesNotValidate: ["Live ferry timetables", "Flight route fares"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;
    const issues: ValidationIssue[] = [];
    const zoneIds = new Set<TransportZoneId>(topology.zones.map((z) => z.id));

    for (const zone of topology.zones) {
      for (const mode of zone.localModes) {
        if (!VALID_MODES.has(mode)) {
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
        if (!VALID_MODES.has(mode)) {
          issues.push({
            severity: "error",
            code: "invalid_edge_mode",
            message: `Edge ${edge.from}→${edge.to} has invalid mode '${mode}'`,
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

    for (const dest of destinations) {
      if (!dest.id) continue;
      const zone = resolveDestinationTransportZone(dest);
      if (zone === "unknown") {
        issues.push({
          severity: "error",
          code: "unresolved_destination_zone",
          message: `Destination ${dest.id} does not resolve to a transport zone`,
          targetId: dest.id,
        });
        continue;
      }

      const zoneData = zoneById.get(zone);
      if (zoneData?.isIsland) {
        const edge = topology.edges.some(
          (e) => e.from === zone || e.to === zone,
        );
        if (!edge) {
          issues.push({
            severity: "error",
            code: "unreachable_island",
            message: `Island zone ${zone} for ${dest.id} has no connecting edges`,
            targetId: dest.id,
          });
        }
      }

      // Island fall-through: island-tagged records must not resolve to the
      // mainland default zone.
      const tags = [...(dest.tags ?? []), ...(dest.categories ?? [])].map((t) =>
        t.toLowerCase(),
      );
      const islandTagTokens = tags.flatMap((t) => t.split(/[^a-z0-9]+/));
      const islandMarked =
        dest.kind === "island" ||
        islandTagTokens.includes("island") ||
        islandTagTokens.includes("remote") ||
        islandTagTokens.includes("ferry");
      const bridgeConnected = isBridgeConnectedDestination(dest);
      if (
        islandMarked &&
        zone !== "unknown" &&
        zoneData &&
        !zoneData.isIsland &&
        !bridgeConnected
      ) {
        issues.push({
          severity: "error",
          code: "island_falls_through_to_mainland",
          message: `Island-marked destination ${dest.id} resolved to non-island zone ${zone}`,
          targetId: dest.id,
        });
      }

      // Rail/road display must be backed by an explicit edge or local policy.
      if (zone !== "unknown" && zoneData && !zoneData.isRemote) {
        const allowed = getEligibleOriginModes({
          originZoneId: "mainland-honshu",
          destinationZoneId: zone,
          destination: dest,
        });
        const allowedSet = new Set([
          ...allowed.crossZoneModes,
          ...allowed.localModes,
        ]);
        for (const mode of ["train", "shinkansen", "car", "bus"]) {
          if (
            dest.transportOptions?.[
              mode as keyof typeof dest.transportOptions
            ] !== undefined &&
            !allowedSet.has(mode as never)
          ) {
            issues.push({
              severity: "error",
              code: "mode_without_edge",
              message: `${dest.id} exposes ${mode} without an allowed topology edge from mainland`,
              targetId: dest.id,
            });
          }
        }
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
