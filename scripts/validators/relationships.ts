import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";

/** Maximum straight-line distance for a destination to be considered
 *  "contained within" a parent hub. Beyond this a destination is a regional
 *  gateway and must use gatewayHubId instead of parentDestinationId. */
const MAX_CONTAINMENT_DISTANCE_KM = 80;

function distanceKmBetween(
  a: { coordinates?: { lat?: number; lng?: number } },
  b: { coordinates?: { lat?: number; lng?: number } },
): number | null {
  const lat1 = a.coordinates?.lat;
  const lng1 = a.coordinates?.lng;
  const lat2 = b.coordinates?.lat;
  const lng2 = b.coordinates?.lng;
  if (
    typeof lat1 !== "number" ||
    typeof lng1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lng2 !== "number"
  ) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a1 = Math.sin(dLat / 2) ** 2;
  const a2 = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2));
  const a3 = Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a1 + a2 * a3));
}

export const relationshipsValidator: ValidatorModule = {
  name: "Catalog Relationships",
  description:
    "Validates graph topology across parent, child, nearby, featured, and related destination links.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure graph integrity by flagging self-references, cycle loops, and dangling destination link IDs.",
  guarantees: [
    "Zero self-referential graph links",
    "Zero dangling parent, nearby, featured, or related destination IDs",
    "Zero circular parent-child loops",
    "Every assigned parent is a hub in the same prefecture",
    "Every record is either a hub, has a verified hub parent, or is explicitly standalone",
  ],
  doesNotValidate: ["Search ranking", "HTTP image availability"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;

    const issues: ValidationIssue[] = [];
    const validDestIds = new Set(destinations.map((d) => d.id));
    const destMap = new Map(destinations.map((d) => [d.id, d]));

    let totalChecked = destinations.length;

    for (const dest of destinations) {
      const rels = dest.relationships;
      if (
        dest.role !== "hub" &&
        dest.role !== "standalone" &&
        !rels?.parentDestinationId
      ) {
        issues.push({
          severity: "error",
          code: "ORPHAN_DESTINATION",
          message: `Destination '${dest.id}' has no verified hub parent or standalone classification.`,
          targetId: dest.id,
        });
      }
      if (!rels) continue;

      // 1. Parent Destination Check
      if (rels.parentDestinationId) {
        if (rels.parentDestinationId === dest.id) {
          issues.push({
            severity: "error",
            code: "SELF_PARENT_REFERENCE",
            message: `Destination '${dest.id}' cannot have itself as parent.`,
            targetId: dest.id,
          });
        } else if (!validDestIds.has(rels.parentDestinationId)) {
          issues.push({
            severity: "error",
            code: "DANGLING_PARENT_ID",
            message: `Destination '${dest.id}' references non-existent parent ID '${rels.parentDestinationId}'.`,
            targetId: dest.id,
          });
        } else {
          const parent = destMap.get(rels.parentDestinationId)!;
          if (parent.role !== "hub") {
            issues.push({
              severity: "error",
              code: "NON_HUB_PARENT_ID",
              message: `Destination '${dest.id}' has non-hub parent '${parent.id}'.`,
              targetId: dest.id,
            });
          }
          if (parent.prefecture !== dest.prefecture) {
            issues.push({
              severity: "error",
              code: "CROSS_PREFECTURE_PARENT_ID",
              message: `Destination '${dest.id}' in ${dest.prefecture} cannot have parent '${parent.id}' in ${parent.prefecture}.`,
              targetId: dest.id,
            });
          }
          const distanceKm = distanceKmBetween(dest, parent);
          if (distanceKm !== null && distanceKm > MAX_CONTAINMENT_DISTANCE_KM) {
            issues.push({
              severity: "error",
              code: "PARENT_BEYOND_CONTAINMENT_DISTANCE",
              message: `Destination '${dest.id}' is ${Math.round(
                distanceKm,
              )} km from parent '${parent.id}', beyond the ${MAX_CONTAINMENT_DISTANCE_KM} km containment limit; use gatewayHubId instead.`,
              targetId: dest.id,
            });
          }
        }
      }

      // 1b. Gateway Hub Check (regional access, not containment)
      if (rels.gatewayHubId) {
        if (rels.gatewayHubId === dest.id) {
          issues.push({
            severity: "error",
            code: "SELF_GATEWAY_REFERENCE",
            message: `Destination '${dest.id}' cannot have itself as gateway hub.`,
            targetId: dest.id,
          });
        } else if (!validDestIds.has(rels.gatewayHubId)) {
          issues.push({
            severity: "error",
            code: "DANGLING_GATEWAY_HUB_ID",
            message: `Destination '${dest.id}' references non-existent gateway hub ID '${rels.gatewayHubId}'.`,
            targetId: dest.id,
          });
        } else {
          const hub = destMap.get(rels.gatewayHubId)!;
          if (hub.role !== "hub") {
            issues.push({
              severity: "error",
              code: "NON_HUB_GATEWAY_ID",
              message: `Destination '${dest.id}' has non-hub gateway '${hub.id}'.`,
              targetId: dest.id,
            });
          }
          if (hub.prefecture !== dest.prefecture) {
            issues.push({
              severity: "error",
              code: "CROSS_PREFECTURE_GATEWAY_ID",
              message: `Destination '${dest.id}' in ${dest.prefecture} cannot have gateway '${hub.id}' in ${hub.prefecture}.`,
              targetId: dest.id,
            });
          }
        }
      }

      // 2. Featured Destinations Check
      if (
        rels.featuredDestinationIds &&
        Array.isArray(rels.featuredDestinationIds)
      ) {
        for (const featId of rels.featuredDestinationIds) {
          if (featId === dest.id) {
            issues.push({
              severity: "error",
              code: "SELF_FEATURED_REFERENCE",
              message: `Destination '${dest.id}' cannot feature itself.`,
              targetId: dest.id,
            });
          } else if (!validDestIds.has(featId)) {
            issues.push({
              severity: "error",
              code: "DANGLING_FEATURED_ID",
              message: `Destination '${dest.id}' features non-existent destination ID '${featId}'.`,
              targetId: dest.id,
            });
          }
        }
      }

      // 3. Nearby Destinations Check
      if (
        rels.nearbyDestinationIds &&
        Array.isArray(rels.nearbyDestinationIds)
      ) {
        for (const nearId of rels.nearbyDestinationIds) {
          if (nearId === dest.id) {
            issues.push({
              severity: "error",
              code: "SELF_NEARBY_REFERENCE",
              message: `Destination '${dest.id}' cannot list itself as nearby.`,
              targetId: dest.id,
            });
          } else if (!validDestIds.has(nearId)) {
            issues.push({
              severity: "error",
              code: "DANGLING_NEARBY_ID",
              message: `Destination '${dest.id}' references non-existent nearby ID '${nearId}'.`,
              targetId: dest.id,
            });
          }
        }
      }

      // 4. Related Destinations Check
      if (
        rels.relatedDestinationIds &&
        Array.isArray(rels.relatedDestinationIds)
      ) {
        for (const relId of rels.relatedDestinationIds) {
          if (relId === dest.id) {
            issues.push({
              severity: "error",
              code: "SELF_RELATED_REFERENCE",
              message: `Destination '${dest.id}' cannot list itself as related.`,
              targetId: dest.id,
            });
          } else if (!validDestIds.has(relId)) {
            issues.push({
              severity: "error",
              code: "DANGLING_RELATED_ID",
              message: `Destination '${dest.id}' references non-existent related ID '${relId}'.`,
              targetId: dest.id,
            });
          }
        }
      }

      // 5. Parent-Child Cycle Detection
      let currentParentId = rels.parentDestinationId;
      const visitedParents = new Set<string>([dest.id]);
      while (currentParentId) {
        if (visitedParents.has(currentParentId)) {
          issues.push({
            severity: "error",
            code: "CIRCULAR_PARENT_HIERARCHY",
            message: `Circular parent-child hierarchy loop detected involving destination '${dest.id}' and parent '${currentParentId}'.`,
            targetId: dest.id,
          });
          break;
        }
        visitedParents.add(currentParentId);
        const parentDest = destMap.get(currentParentId);
        currentParentId = parentDest?.relationships?.parentDestinationId;
      }
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: relationshipsValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked,
        errorsCount,
        warningsCount,
        infoCount,
        durationMs: 0,
      },
    };
  },
};
