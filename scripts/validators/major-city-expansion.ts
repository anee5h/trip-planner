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
    const expansionRecords = context.catalog.destinations.filter(
      (destination) =>
        destination.addedAt === "2026-07-29" ||
        destination.tags?.includes("v1.9.2"),
    );
    if (expansionRecords.length !== 159) {
      issues.push({
        severity: "error",
        code: "EXPANSION_RECORD_COUNT_CHANGED",
        message: `Expected 159 v1.9.2 expansion records, found ${expansionRecords.length}.`,
      });
    }
    for (const destination of expansionRecords) {
      if (
        destination.status === "beta" &&
        destination.editorial?.lifecycle === "published"
      ) {
        issues.push({
          severity: "error",
          code: "BETA_EXPANSION_PUBLISHED",
          message: `${destination.id} is beta content and cannot be editorially published.`,
          targetId: destination.id,
        });
      }
      const auditChanges = (destination.editorial?.changes || []).filter(
        (change) =>
          change.summary ===
          "Canonicalized type, localized categories, budgets, ratings, and transport semantics",
      );
      if (auditChanges.length > 1) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_EXPANSION_AUDIT_HISTORY",
          message: `${destination.id} has duplicate v1.9.3 audit history entries.`,
          targetId: destination.id,
        });
      }
    }

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
        const localizedHighlights = child.content?.ja?.highlights || [];
        const expectedHighlights = child.categories.map(
          (category) =>
            ({
              Aquarium: "水族館",
              Culture: "文化",
              Food: "グルメ",
              History: "歴史",
              Market: "市場",
              Museum: "博物館",
              Nature: "自然",
              Shopping: "ショッピング",
              "Theme Park": "テーマパーク",
              Viewpoint: "展望",
            })[category] || category,
        );
        if (
          !child.areaId ||
          !child.content?.ja ||
          !child.editorial?.sources.length
        ) {
          issues.push({
            severity: "warning",
            code: "EXPANDED_POI_INCOMPLETE",
            message: `${child.id} is missing area, bilingual content, or editorial provenance.`,
            targetId: child.id,
          });
        }
        if (
          JSON.stringify(localizedHighlights) !==
          JSON.stringify(expectedHighlights)
        ) {
          issues.push({
            severity: "warning",
            code: "EXPANDED_POI_LOCALIZED_CATEGORY_MISMATCH",
            message: `${child.id} has Japanese highlights that do not match its canonical categories.`,
            targetId: child.id,
          });
        }
        if (
          child.ratingMetadata?.method !== "assisted" ||
          child.ratingMetadata.confidence !== "low"
        ) {
          issues.push({
            severity: "error",
            code: "EXPANDED_POI_RATING_CREDIBILITY",
            message: `${child.id} must expose low-confidence assisted rating provenance.`,
            targetId: child.id,
          });
        }
        if (
          child.ratings.rain >= 8 &&
          ((child.comfort?.rainFriendly ?? 5) <= 3 || child.indoorPercent <= 20)
        ) {
          issues.push({
            severity: "warning",
            code: "EXPANDED_POI_RAIN_CONTRADICTION",
            message: `${child.id} has contradictory rain suitability fields.`,
            targetId: child.id,
          });
        }
        if (
          [
            "beach",
            "castle",
            "district",
            "garden",
            "island",
            "market",
            "mountain",
            "park",
            "shopping",
            "shrine",
            "street",
            "temple",
            "waterfall",
          ].includes(child.kind || "") &&
          (child.budgetBreakdown?.tickets || 0) !== 0
        ) {
          issues.push({
            severity: "warning",
            code: "FREE_FORM_PLACE_HAS_TICKET_BUDGET",
            message: `${child.id} invents a ticket allowance for a free-form place.`,
            targetId: child.id,
          });
        }
        const expectedCategoryByKind: Partial<Record<string, string>> = {
          aquarium: "Aquarium",
          beach: "Nature",
          castle: "History",
          garden: "Nature",
          market: "Food",
          mountain: "Nature",
          museum: "Museum",
          park: "Nature",
          shrine: "History",
          shopping: "Shopping",
          temple: "History",
          tower: "Viewpoint",
          waterfall: "Nature",
          zoo: "Nature",
        };
        const expectedCategory =
          child.kind === "park" && child.categories.includes("Theme Park")
            ? "Theme Park"
            : expectedCategoryByKind[child.kind || ""];
        if (expectedCategory && !child.categories.includes(expectedCategory)) {
          issues.push({
            severity: "warning",
            code: "EXPANDED_POI_KIND_CATEGORY_MISMATCH",
            message: `${child.id} kind '${child.kind}' requires category '${expectedCategory}'.`,
            targetId: child.id,
          });
        }
        if (
          !child.imageMetadata?.license ||
          !child.imageMetadata.attribution ||
          !child.imageMetadata.sourceUrl
        ) {
          issues.push({
            severity: "warning",
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
            severity: "warning",
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
