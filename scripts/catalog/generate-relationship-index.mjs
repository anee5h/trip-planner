import fs from "node:fs";
import path from "node:path";

const RELATIONSHIP_FIELDS = [
  "id",
  "name",
  "nameJa",
  "kind",
  "role",
  "importance",
  "placeType",
  "recommendationEligible",
  "municipalityId",
  "areaId",
  "aliases",
  "prefecture",
  "region",
  "categories",
  "tags",
  "heroImage",
  "coordinates",

  "transportOptions",
  "transportZoneId",
  "localAccessModes",
  "localAccessUnestimated",
  "transportFares",
  "totalTripHours",
  "recommendedVisitHours",
  "travelBuffers",
  "indoorPercent",
  "comfort",
  "ratings",
  "ratingMetadata",
  "collections",
  "relationships",
];

const RELATIONSHIP_TARGET_FIELDS = [
  "parentDestinationId",
  "featuredDestinationIds",
  "nearbyDestinationIds",
  "relatedDestinationIds",
  "gatewayHubId",
];

export function buildRelationshipIndex(rootDir = process.cwd()) {
  const sourcePath = path.join(
    rootDir,
    "src/shared/data/destinations-index.json",
  );
  const destinations = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const includedIds = new Set();

  for (const destination of destinations) {
    const relationships = destination.relationships;
    const hasRelationships =
      relationships && Object.keys(relationships).length > 0;
    if (destination.role === "hub" || hasRelationships) {
      includedIds.add(destination.id);
    }
    if (hasRelationships) {
      for (const field of RELATIONSHIP_TARGET_FIELDS) {
        const value = relationships[field];
        const ids = Array.isArray(value) ? value : value ? [value] : [];
        for (const id of ids) {
          if (byId.has(id)) includedIds.add(id);
        }
      }
    }
  }

  const nodes = destinations
    .filter((destination) => includedIds.has(destination.id))
    .map((destination) => {
      const projection = {};
      for (const field of RELATIONSHIP_FIELDS) {
        if (destination[field] !== undefined)
          projection[field] = destination[field];
      }
      return projection;
    });

  return {
    schemaVersion: 1,
    sourceRecordCount: destinations.length,
    nodes,
  };
}

/** Return byte-canonical compact JSON; this is a generated runtime asset. */
export function generateRelationshipIndex(rootDir = process.cwd()) {
  return `${JSON.stringify(buildRelationshipIndex(rootDir))}\n`;
}
