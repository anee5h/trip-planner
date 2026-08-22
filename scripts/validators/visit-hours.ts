import type { ValidatorModule } from "./types";

export const visitHoursValidator: ValidatorModule = {
  name: "Recommended Visit Hours",
  description: "Validates destination visit-time ranges used by trip planning.",
  purpose:
    "Keep origin-aware duration filtering based on safe, bounded ranges.",
  guarantees: [
    "Positive minimum",
    "Maximum is not below minimum",
    "Maximum is at most 48 hours",
  ],
  doesNotValidate: ["Editorial accuracy of the estimate"],
  async validate({ catalog }) {
    const issues = [];
    for (const destination of catalog.destinations) {
      const range = destination.recommendedVisitHours;
      if (!range) {
        // Compatibility/group surfaces remain addressable but are excluded
        // from recommendation and planning candidates, so a single visit
        // window would be false precision for them.
        if (destination.recommendationEligible === false) continue;
        issues.push({
          severity: "error" as const,
          code: "MISSING_RECOMMENDED_VISIT_HOURS",
          message: `Destination '${destination.id}' is missing recommendedVisitHours.`,
          targetId: destination.id,
        });
        continue;
      }
      if (
        !Number.isFinite(range.min) ||
        !Number.isFinite(range.max) ||
        range.min <= 0 ||
        range.max < range.min ||
        range.max > 48 ||
        Math.round(range.min * 10) !== range.min * 10 ||
        Math.round(range.max * 10) !== range.max * 10
      ) {
        issues.push({
          severity: "error" as const,
          code: "INVALID_RECOMMENDED_VISIT_HOURS",
          message: `Destination '${destination.id}' must have a valid 0.1–48 hour visit range.`,
          targetId: destination.id,
        });
      }
    }
    return {
      name: this.name,
      passed: issues.length === 0,
      issues,
      metrics: {
        totalChecked: catalog.destinations.length,
        errorsCount: issues.length,
        warningsCount: 0,
        infoCount: 0,
        durationMs: 0,
      },
    };
  },
};
