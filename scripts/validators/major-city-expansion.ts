import { REQUIRED_RATING_KEYS } from "../../src/shared/types/destination";
import { V192_CITY_EXPANSION } from "../v1.9.2-major-city-manifest";
import type {
  ValidationIssue,
  ValidationResult,
  ValidatorModule,
} from "./types";

export const majorCityExpansionValidator: ValidatorModule = {
  name: "Major City Expansion",
  description:
    "Validates v1.9.2 hub depth, area structure, editorial metadata, and rating diversity.",
  dependsOn: ["Catalog Relationships", "Recommended Visit Hours"],
  purpose:
    "Prevent shallow, structurally incomplete, or mechanically duplicated city expansion records.",
  guarantees: [
    "Every committed v1.9.2 hub reaches its minimum child depth",
    "Expanded POIs have areas, bilingual content, provenance, and image metadata",
    "No expanded city batch uses duplicate rating vectors",
  ],
  doesNotValidate: ["Subjective editorial quality", "Live venue opening hours"],
  async validate(context): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const byId = new Map(
      context.catalog.destinations.map((destination) => [
        destination.id,
        destination,
      ]),
    );

    for (const target of V192_CITY_EXPANSION) {
      const children = context.catalog.destinations.filter(
        (destination) =>
          destination.relationships?.parentDestinationId === target.hubId,
      );
      if (children.length < target.minimumChildren) {
        issues.push({
          severity: "error",
          code: "CITY_HUB_BELOW_MINIMUM_DEPTH",
          message: `${target.hubId} has ${children.length} children; v1.9.2 requires ${target.minimumChildren}.`,
          targetId: target.hubId,
        });
      }

      const ratingVectors = new Map<string, string>();
      for (const child of children) {
        const isExpansionRecord =
          child.addedAt === "2026-07-29" || child.tags?.includes("v1.9.2");
        if (!isExpansionRecord) continue;
        if (
          !child.areaId ||
          !child.content?.ja ||
          !child.editorial?.sources.length
        ) {
          issues.push({
            severity: "error",
            code: "EXPANDED_POI_INCOMPLETE",
            message: `${child.id} is missing area, bilingual content, or editorial provenance.`,
            targetId: child.id,
          });
        }
        if (
          !child.imageMetadata?.license ||
          !child.imageMetadata.attribution ||
          !child.imageMetadata.sourceUrl
        ) {
          issues.push({
            severity: "error",
            code: "EXPANDED_POI_IMAGE_METADATA_MISSING",
            message: `${child.id} is missing image licence metadata.`,
            targetId: child.id,
          });
        }
        const missingRating = REQUIRED_RATING_KEYS.find(
          (key) => typeof child.ratings?.[key] !== "number",
        );
        if (missingRating) {
          issues.push({
            severity: "error",
            code: "EXPANDED_POI_RATING_MISSING",
            message: `${child.id} is missing rating '${missingRating}'.`,
            targetId: child.id,
          });
        }
        const vector = REQUIRED_RATING_KEYS.map(
          (key) => child.ratings[key],
        ).join(",");
        const duplicate = ratingVectors.get(vector);
        if (duplicate) {
          issues.push({
            severity: "error",
            code: "DUPLICATE_CITY_RATING_VECTOR",
            message: `${child.id} duplicates the rating vector of ${duplicate}.`,
            targetId: child.id,
          });
        } else {
          ratingVectors.set(vector, child.id);
        }
      }

      if (!byId.has(target.hubId)) {
        issues.push({
          severity: "error",
          code: "EXPANSION_HUB_MISSING",
          message: `Required expansion hub '${target.hubId}' is missing.`,
          targetId: target.hubId,
        });
      }
    }

    const errorsCount = issues.filter(
      ({ severity }) => severity === "error",
    ).length;
    const warningsCount = issues.filter(
      ({ severity }) => severity === "warning",
    ).length;
    return {
      name: "Major City Expansion",
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked: V192_CITY_EXPANSION.length,
        errorsCount,
        warningsCount,
        infoCount: 0,
        durationMs: 0,
      },
    };
  },
};
