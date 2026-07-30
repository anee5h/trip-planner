import type { Destination } from "@/shared/types/destination";
import { resolvePlanningCategory } from "./VisitDurationPolicy";

export type AccessType =
  | "scheduled"
  | "open_area"
  | "open_area_with_timed_facilities"
  | "seasonal"
  | "appointment_only"
  | "unknown";

export type OpeningHoursStatus =
  "verified" | "stale" | "unverified" | "not_required";

export interface OpeningHoursAssessment {
  accessType: AccessType;
  status: OpeningHoursStatus;
  requiresWarning: boolean;
  displayText?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  lastAdmission?: string;
  closedDays?: string;
}

export function getOpeningHoursAssessment(
  dest: Destination,
  _now?: Date,
): OpeningHoursAssessment {
  if (!dest || !dest.id) {
    return {
      accessType: "unknown",
      status: "unverified",
      requiresWarning: true,
    };
  }
  if (dest.role === "hub" || dest.kind === "city") {
    return {
      accessType: "open_area",
      status: "not_required",
      requiresWarning: false,
    };
  }

  const category = resolvePlanningCategory(dest);
  if (
    category === "district_park" &&
    (!dest.businessHours || dest.businessHours === "Open access")
  ) {
    return {
      accessType: "open_area",
      status: "not_required",
      requiresWarning: false,
    };
  }

  const hasHours = Boolean(dest.businessHours || dest.openingHours);
  const sourceUrl = dest.officialWebsite;
  const hasSourceUrl = Boolean(sourceUrl);

  if (hasHours && hasSourceUrl) {
    return {
      accessType: "scheduled",
      status: "verified",
      requiresWarning: false,
      displayText:
        typeof dest.businessHours === "string" ? dest.businessHours : undefined,
      sourceUrl,
    };
  }

  if (hasHours) {
    return {
      accessType: "scheduled",
      status: "unverified",
      requiresWarning: false,
      displayText:
        typeof dest.businessHours === "string" ? dest.businessHours : undefined,
      sourceUrl,
    };
  }

  return {
    accessType: "scheduled",
    status: "unverified",
    requiresWarning: true,
  };
}

export function requiresOpeningHours(dest: Destination): boolean {
  const assessment = getOpeningHoursAssessment(dest);
  return assessment.status !== "not_required";
}

export function hasVerifiedOpeningHours(dest: Destination): boolean {
  const assessment = getOpeningHoursAssessment(dest);
  return assessment.status === "verified";
}
