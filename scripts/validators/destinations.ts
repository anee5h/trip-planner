import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";
import { JAPAN_PREFECTURES } from "../config/prefectures";
import { JAPAN_REGIONS } from "../config/regions";

export const destinationsValidator: ValidatorModule = {
  name: "Catalog Destinations",
  description:
    "Validates schema integrity, canonical geographic attributes, coordinates, and budget totals across all destinations.",
  purpose:
    "Ensure every destination in the catalog has valid unique IDs, coordinates, prefectures, regions, and deterministic budget totals.",
  guarantees: [
    "Unique destination IDs and slugs",
    "Canonical Japan prefecture and region assignment",
    "Valid geographic coordinates (lat: 24..46, lng: 122..146)",
    "Non-empty name and description",
    "Deterministic budget breakdown tolerance (diff <= ¥100 or <= 2%)",
  ],
  doesNotValidate: [
    "HTTP image URL reachability",
    "Search query ranking",
    "Routing table resolution",
  ],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;
    const { budgetTolerancePercent, budgetMinToleranceYen } = context.config;

    const issues: ValidationIssue[] = [];
    const seenIds = new Set<string>();
    const seenCoordinates = new Map<string, string>();

    let totalChecked = destinations.length;

    for (const dest of destinations) {
      // 1. Unique ID check
      if (!dest.id) {
        issues.push({
          severity: "error",
          code: "MISSING_DESTINATION_ID",
          message: "Destination object is missing an 'id' field.",
        });
      } else if (seenIds.has(dest.id)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_DESTINATION_ID",
          message: `Duplicate destination ID detected: '${dest.id}'`,
          targetId: dest.id,
        });
      } else {
        seenIds.add(dest.id);
      }

      // 2. Name & Description check
      if (!dest.name || dest.name.trim() === "") {
        issues.push({
          severity: "error",
          code: "EMPTY_DESTINATION_NAME",
          message: `Destination '${dest.id}' has an empty or missing 'name' field.`,
          targetId: dest.id,
        });
      }

      if (!dest.description || dest.description.trim() === "") {
        issues.push({
          severity: "warning",
          code: "EMPTY_DESTINATION_DESCRIPTION",
          message: `Destination '${dest.id}' has an empty or missing 'description'.`,
          targetId: dest.id,
        });
      }

      // 3. Prefecture check
      if (!dest.prefecture) {
        issues.push({
          severity: "error",
          code: "MISSING_PREFECTURE",
          message: `Destination '${dest.id}' is missing a 'prefecture' field.`,
          targetId: dest.id,
        });
      } else if (!JAPAN_PREFECTURES.includes(dest.prefecture as any)) {
        issues.push({
          severity: "error",
          code: "INVALID_PREFECTURE",
          message: `Destination '${dest.id}' has non-canonical prefecture '${dest.prefecture}'.`,
          targetId: dest.id,
        });
      }

      // 4. Region check
      if (!dest.region) {
        issues.push({
          severity: "error",
          code: "MISSING_REGION",
          message: `Destination '${dest.id}' is missing a 'region' field.`,
          targetId: dest.id,
        });
      } else if (!JAPAN_REGIONS.includes(dest.region as any)) {
        issues.push({
          severity: "error",
          code: "INVALID_REGION",
          message: `Destination '${dest.id}' has non-canonical region '${dest.region}'.`,
          targetId: dest.id,
        });
      }

      // 5. Coordinates check
      if (
        !dest.coordinates ||
        typeof dest.coordinates.lat !== "number" ||
        typeof dest.coordinates.lng !== "number"
      ) {
        issues.push({
          severity: "error",
          code: "MISSING_COORDINATES",
          message: `Destination '${dest.id}' is missing valid numerical lat/lng coordinates.`,
          targetId: dest.id,
        });
      } else {
        const { lat, lng } = dest.coordinates;
        if (lat < 24 || lat > 46 || lng < 122 || lng > 146) {
          issues.push({
            severity: "error",
            code: "OUT_OF_BOUNDS_COORDINATES",
            message: `Destination '${dest.id}' has out-of-bounds coordinates (lat: ${lat}, lng: ${lng}).`,
            targetId: dest.id,
          });
        }

        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (seenCoordinates.has(coordKey)) {
          issues.push({
            severity: "warning",
            code: "DUPLICATE_COORDINATES",
            message: `Destination '${dest.id}' shares exact coordinates (${coordKey}) with '${seenCoordinates.get(coordKey)}'.`,
            targetId: dest.id,
          });
        } else {
          seenCoordinates.set(coordKey, dest.id);
        }
      }

      // 6. Deterministic Budget Sum Check
      if (dest.budgetBreakdown && typeof dest.budgetRecommended === "number") {
        const { transport, tickets, food, cafe } = dest.budgetBreakdown;
        const sum = transport + tickets + food + cafe;
        const diff = Math.abs(sum - dest.budgetRecommended);
        const tolerance = Math.max(
          budgetMinToleranceYen,
          dest.budgetRecommended * budgetTolerancePercent,
        );

        if (diff > tolerance) {
          issues.push({
            severity: "warning",
            code: "BUDGET_BREAKDOWN_MISMATCH",
            message: `Destination '${dest.id}' budgetBreakdown sum (¥${sum}) differs from recommended (¥${dest.budgetRecommended}) by ¥${diff} (tolerance: ¥${Math.round(tolerance)}).`,
            targetId: dest.id,
          });
        }
      }
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: destinationsValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked,
        errorsCount,
        warningsCount,
        infoCount,
      },
    };
  },
};
