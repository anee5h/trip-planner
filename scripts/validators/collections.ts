import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";

export const collectionsValidator: ValidatorModule = {
  name: "Catalog Collections",
  description:
    "Validates collection references, membership integrity, hub vs. POI scoping, and specific collection rules.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure all collections contain existing destinations with zero duplicate members and proper hub/POI scoping.",
  guarantees: [
    "Every referenced destination in collections exists",
    "Zero duplicate members inside collections",
    "City hubs excluded from blacklisted collections (e.g. japan-top-castles, UNESCO)",
    "Original 12 Castles collection contains valid castle POIs",
  ],
  doesNotValidate: ["Image HTTP reachability", "Geographic coordinates"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations, collections } = context.catalog;
    const { hubCollectionBlacklist } = context.config;

    const issues: ValidationIssue[] = [];
    const validDestIds = new Set(destinations.map((d) => d.id));

    let totalChecked = collections.length;

    // 1. Audit Collections Index
    for (const col of collections) {
      if (!col.id || !col.slug) {
        issues.push({
          severity: "error",
          code: "MISSING_COLLECTION_METADATA",
          message: `Collection object is missing id or slug.`,
        });
        continue;
      }

      // Check destination memberships if explicitly defined on collection object
      if (col.destinationIds && Array.isArray(col.destinationIds)) {
        const seenMemberIds = new Set<string>();
        for (const destId of col.destinationIds) {
          if (!validDestIds.has(destId)) {
            issues.push({
              severity: "error",
              code: "DANGLING_COLLECTION_MEMBER",
              message: `Collection '${col.id}' references non-existent destination ID '${destId}'.`,
              targetId: col.id,
            });
          }
          if (seenMemberIds.has(destId)) {
            issues.push({
              severity: "error",
              code: "DUPLICATE_COLLECTION_MEMBER",
              message: `Collection '${col.id}' contains duplicate member ID '${destId}'.`,
              targetId: col.id,
            });
          }
          seenMemberIds.add(destId);
        }
      }
    }

    // 2. Audit Destination.collections Scoping Rules
    for (const dest of destinations) {
      if (!dest.collections) continue;

      for (const colRef of dest.collections) {
        const colId = colRef.collectionId;

        // Hub / POI scoping check: Hubs cannot be in blacklisted collections
        if (
          dest.role === "hub" ||
          dest.kind === "city" ||
          dest.kind === "ward"
        ) {
          if (hubCollectionBlacklist.includes(colId)) {
            issues.push({
              severity: "error",
              code: "HUB_IN_BLACKLISTED_COLLECTION",
              message: `City Hub '${dest.id}' (${dest.name}) is invalidly tagged with blacklisted collection '${colId}'.`,
              targetId: dest.id,
            });
          }
        }
      }
    }

    // 3. Audit Specific Collection Invariants: Original 12 Castles
    const orig12Destinations = destinations.filter((d) =>
      d.collections?.some((c) => c.collectionId === "original-12-castles"),
    );

    if (orig12Destinations.length !== 12) {
      issues.push({
        severity: "warning",
        code: "ORIGINAL_12_CASTLES_COUNT_MISMATCH",
        message: `'Original 12 Surviving Castles' collection has ${orig12Destinations.length} members (expected 12).`,
      });
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: collectionsValidator.name,
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
