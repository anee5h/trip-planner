import fs from "fs";
import path from "path";
import type {
  ValidationContext,
  ValidationIssue,
  ValidationResult,
  ValidatorModule,
} from "./types";

export const destinationDetailsValidator: ValidatorModule = {
  name: "Destination Detail Files",
  description:
    "Validates that every catalog destination has a matching, current public detail JSON file.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Keep lazy-loaded destination details synchronized with the in-memory catalog.",
  guarantees: [
    "One public detail file per destination",
    "No orphaned public detail files",
    "Public detail content exactly matches the destination index",
  ],
  doesNotValidate: ["HTTP image availability", "Search ranking"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const detailsDirectory = path.join(
      process.cwd(),
      "public/data/destinations",
    );
    const issues: ValidationIssue[] = [];
    const expectedById = new Map(
      context.catalog.destinations.map((destination) => [
        destination.id,
        destination,
      ]),
    );
    const detailFiles = fs.existsSync(detailsDirectory)
      ? fs
          .readdirSync(detailsDirectory)
          .filter((file) => file.endsWith(".json"))
      : [];
    const detailIds = new Set(detailFiles.map((file) => file.slice(0, -5)));

    for (const [id, destination] of expectedById) {
      if (!detailIds.has(id)) {
        issues.push({
          severity: "error",
          code: "MISSING_DESTINATION_DETAIL_FILE",
          message: `Destination '${id}' has no public detail file.`,
          targetId: id,
        });
        continue;
      }

      const detailPath = path.join(detailsDirectory, `${id}.json`);
      try {
        const detail = JSON.parse(fs.readFileSync(detailPath, "utf-8"));
        if (JSON.stringify(detail) !== JSON.stringify(destination)) {
          issues.push({
            severity: "error",
            code: "STALE_DESTINATION_DETAIL_FILE",
            message: `Destination '${id}' public detail file differs from the catalog index.`,
            targetId: id,
          });
        }
      } catch (error) {
        issues.push({
          severity: "error",
          code: "INVALID_DESTINATION_DETAIL_FILE",
          message: `Destination '${id}' public detail file cannot be parsed: ${error instanceof Error ? error.message : String(error)}.`,
          targetId: id,
        });
      }
    }

    for (const id of detailIds) {
      if (!expectedById.has(id)) {
        issues.push({
          severity: "error",
          code: "ORPHANED_DESTINATION_DETAIL_FILE",
          message: `Public detail file '${id}.json' has no matching catalog destination.`,
          targetId: id,
        });
      }
    }

    const errorsCount = issues.length;
    return {
      name: destinationDetailsValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked: context.catalog.destinations.length,
        errorsCount,
        warningsCount: 0,
        infoCount: 0,
        durationMs: 0,
      },
    };
  },
};
