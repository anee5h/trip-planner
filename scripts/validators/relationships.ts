import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";

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
