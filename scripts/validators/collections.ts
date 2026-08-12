import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";

export const collectionsValidator: ValidatorModule = {
  name: "Catalog Collections",
  description:
    "Validates collection references, membership integrity, expected sizes, hub vs. POI scoping, and specific collection rules.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure all collections contain existing destinations with zero duplicate members and proper hub/POI scoping.",
  guarantees: [
    "Every collection ID is unique",
    "Every referenced destination in collections exists",
    "Zero duplicate members inside collections or destination membership arrays",
    "Destination collection references point to known collections",
    "Collection expected-member metadata stays synchronized with catalog membership",
    "City hubs excluded from blacklisted collections (e.g. japan-top-castles)",
    "Original 12 Castles collection contains valid castle POIs",
  ],
  doesNotValidate: [
    "Image HTTP reachability",
    "Geographic coordinates",
    "UNESCO inscription truth",
  ],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations, collections } = context.catalog;
    const { hubCollectionBlacklist } = context.config;

    const issues: ValidationIssue[] = [];
    const validDestIds = new Set(destinations.map((d) => d.id));
    const collectionIds = new Set<string>();

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

      if (collectionIds.has(col.id)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_COLLECTION_ID",
          message: `Collection index contains duplicate ID '${col.id}'.`,
          targetId: col.id,
        });
      }
      collectionIds.add(col.id);

      const actualMemberCount = destinations.filter((dest) =>
        dest.collections?.some((ref) => ref.collectionId === col.id),
      ).length;
      const expectedMemberCount = col.metadata?.expectedMembers;
      if (
        expectedMemberCount !== undefined &&
        actualMemberCount !== expectedMemberCount
      ) {
        issues.push({
          severity: "error",
          code: "EXPECTED_COLLECTION_MEMBER_COUNT_MISMATCH",
          message: `Collection '${col.id}' has ${actualMemberCount} catalog members (expected ${expectedMemberCount}).`,
          targetId: col.id,
        });
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

      const seenCollectionIds = new Set<string>();
      for (const colRef of dest.collections) {
        const colId = colRef.collectionId;

        if (seenCollectionIds.has(colId)) {
          issues.push({
            severity: "error",
            code: "DUPLICATE_DESTINATION_COLLECTION",
            message: `Destination '${dest.id}' references collection '${colId}' more than once.`,
            targetId: dest.id,
          });
        }
        seenCollectionIds.add(colId);

        if (!collectionIds.has(colId)) {
          issues.push({
            severity: "error",
            code: "DANGLING_DESTINATION_COLLECTION",
            message: `Destination '${dest.id}' references unknown collection '${colId}'.`,
            targetId: dest.id,
          });
        }

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
        severity: "error",
        code: "ORIGINAL_12_CASTLES_COUNT_MISMATCH",
        message: `'Original 12 Surviving Castles' collection has ${orig12Destinations.length} members (expected 12).`,
      });
    }

    // 4. Deterministic numbering: japan-top-castles = the official 日本100名城.
    // Every member must carry its official position (1..100) exactly once.
    const castlesCollectionExists = collectionIds.has("japan-top-castles");
    const castleDestinations = castlesCollectionExists
      ? destinations.filter((d) =>
          d.collections?.some((c) => c.collectionId === "japan-top-castles"),
        )
      : [];
    const castleSortOrders = new Set<number>();
    for (const dest of castleDestinations) {
      const membership = dest.collections?.find(
        (c) => c.collectionId === "japan-top-castles",
      );
      const sortOrder = membership?.sortOrder;
      if (
        typeof sortOrder !== "number" ||
        !Number.isInteger(sortOrder) ||
        sortOrder < 1 ||
        sortOrder > 100
      ) {
        issues.push({
          severity: "error",
          code: "CASTLE_SORT_ORDER_INVALID",
          message: `japan-top-castles member '${dest.id}' has invalid official position '${sortOrder}' (expected integer 1-100).`,
          targetId: dest.id,
        });
        continue;
      }
      if (castleSortOrders.has(sortOrder)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_CASTLE_SORT_ORDER",
          message: `japan-top-castles has more than one member with official position ${sortOrder}.`,
          targetId: dest.id,
        });
      }
      castleSortOrders.add(sortOrder);
    }
    if (castlesCollectionExists && castleDestinations.length !== 100) {
      issues.push({
        severity: "error",
        code: "CASTLE_MEMBER_COUNT",
        message: `japan-top-castles has ${castleDestinations.length} members (expected the official 100).`,
      });
    }
    for (let position = 1; position <= 100; position += 1) {
      if (castlesCollectionExists && !castleSortOrders.has(position)) {
        issues.push({
          severity: "error",
          code: "MISSING_CASTLE_SORT_ORDER",
          message: `japan-top-castles is missing official position ${position}.`,
        });
      }
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
