import type { ValidatorModule } from "./types";

const likelyLegacyScale = (ratings: Record<string, unknown>) => {
  const values = Object.values(ratings).filter(
    (value): value is number => typeof value === "number",
  );
  return (
    values.length >= 4 &&
    values.every((value) => value <= 5) &&
    values.some((value) => value >= 4)
  );
};

export const ratingsValidator: ValidatorModule = {
  name: "Rating Scale",
  description:
    "Validates destination ratings against the canonical 0–10 scale.",
  purpose:
    "Prevent alternate rating scales and malformed values from entering the catalogue.",
  guarantees: [
    "Finite ratings from 0 to 10",
    "At most one decimal place",
    "Legacy five-point records are flagged",
  ],
  doesNotValidate: ["Editorial quality of individual scores"],
  async validate({ catalog }) {
    const issues = [];
    for (const destination of catalog.destinations) {
      const ratings = destination.ratings as unknown as
        Record<string, unknown> | undefined;
      if (!ratings) {
        issues.push({
          severity: "error" as const,
          code: "MISSING_RATINGS",
          message: `Destination '${destination.id}' has no ratings object.`,
          targetId: destination.id,
        });
        continue;
      }
      for (const [key, value] of Object.entries(ratings)) {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 10 ||
          Math.round(value * 10) !== value * 10
        ) {
          issues.push({
            severity: "error" as const,
            code: "INVALID_RATING_SCALE",
            message: `Destination '${destination.id}' rating '${key}' must be a finite 0–10 value with at most one decimal place.`,
            targetId: destination.id,
          });
        }
      }
      if (
        likelyLegacyScale(ratings) &&
        destination.ratingsSchemaVersion !== 2
      ) {
        issues.push({
          severity: "error" as const,
          code: "LEGACY_RATING_SCALE",
          message: `Destination '${destination.id}' appears to use the legacy 0–5 rating scale.`,
          targetId: destination.id,
        });
      }
      if (
        destination.status === "verified" &&
        destination.ratingsSchemaVersion !== 2
      ) {
        issues.push({
          severity: "error" as const,
          code: "MISSING_RATING_SCHEMA_VERSION",
          message: `Verified destination '${destination.id}' must declare ratingsSchemaVersion 2.`,
          targetId: destination.id,
        });
      }
    }
    const errorsCount = issues.length;
    return {
      name: this.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked: catalog.destinations.length,
        errorsCount,
        warningsCount: 0,
        infoCount: 0,
        durationMs: 0,
      },
    };
  },
};
