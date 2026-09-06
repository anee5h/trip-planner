import { calculateTripEstimate } from "../../src/shared/services/budget/tripEstimateEngine";
import type { ValidatorModule } from "./types";

function isUnresolvedAdmission(destination: {
  admission?: { cost?: { kind?: string } };
}): boolean {
  const kind = destination.admission?.cost?.kind;
  return kind === "variable" || kind === "unavailable";
}

export const admissionFallbackValidator: ValidatorModule = {
  name: "Mandatory Admission Fallback Integrity",
  description:
    "Ensures unresolved canonical admission facts never become bounded runtime estimates.",
  purpose:
    "Prevent cheap generic admission fallback from creating false affordability or value claims.",
  guarantees: [
    "Canonical variable admission remains variable at the TripEstimateEngine boundary",
    "Canonical unavailable admission remains unavailable at the TripEstimateEngine boundary",
    "An unresolved mandatory admission cannot produce a complete bounded trip total",
  ],
  doesNotValidate: [
    "Whether an authoritative source has the correct current ticket price",
    "Optional admission at open-area destinations without a canonical admission fact",
  ],
  async validate(context) {
    const issues = [];
    let checked = 0;

    for (const destination of context.catalog.destinations) {
      if (!isUnresolvedAdmission(destination)) continue;
      checked += 1;
      const estimate = calculateTripEstimate({
        dest: destination,
        duration: "fullDay",
        partySize: 2,
        includeOriginTravel: false,
      });
      const admission = estimate.components.find(
        (component) => component.scope === "admission",
      );
      if (admission?.cost.kind === "bounded") {
        issues.push({
          severity: "error" as const,
          code: "UNRESOLVED_ADMISSION_BOUNDED_FALLBACK",
          message: `Destination '${destination.id}' has canonical ${destination.admission?.cost?.kind} admission but TripEstimateEngine returned a bounded admission estimate.`,
          targetId: destination.id,
        });
      }
    }

    return {
      name: this.name,
      passed: issues.length === 0,
      issues,
      metrics: {
        totalChecked: checked,
        errorsCount: issues.length,
        warningsCount: 0,
        infoCount: 0,
        durationMs: 0,
      },
    };
  },
};
