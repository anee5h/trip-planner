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
  "verified" | "sourced" | "stale" | "unverified" | "not_required";

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

function isExplicitlyOpenAccess(dest: Destination): boolean {
  if (!dest.businessHours) return false;
  const lower = dest.businessHours.toLowerCase();
  return lower.includes("24 hours") || lower.includes("open access");
}

const FRESHNESS_WINDOW_DAYS = 180;

export function getOpeningHoursAssessment(
  dest: Destination,
  now: Date = new Date(),
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
  if (category === "district_park" && isExplicitlyOpenAccess(dest)) {
    return {
      accessType: "open_area",
      status: "not_required",
      requiresWarning: false,
    };
  }

  const hasHours = Boolean(dest.businessHours || dest.openingHours);
  const meta = dest.openingHoursMetadata;

  const fieldVerifiedAt = meta?.verifiedAt || dest.verifiedAt;
  const sourceUrl = meta?.sourceUrl || dest.officialWebsite;
  const displayText =
    typeof dest.businessHours === "string" ? dest.businessHours : undefined;

  if (hasHours && fieldVerifiedAt && sourceUrl) {
    const verifiedDate = new Date(fieldVerifiedAt);
    const isValidDate =
      !Number.isNaN(verifiedDate.getTime()) &&
      verifiedDate.getTime() <= now.getTime();

    if (isValidDate) {
      const ageInDays =
        (now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays <= FRESHNESS_WINDOW_DAYS) {
        return {
          accessType: "scheduled",
          status: "verified",
          requiresWarning: false,
          displayText,
          sourceUrl,
          verifiedAt: fieldVerifiedAt,
          lastAdmission: meta?.lastAdmission,
          closedDays: meta?.closedDays,
        };
      }

      return {
        accessType: "scheduled",
        status: "stale",
        requiresWarning: true,
        displayText,
        sourceUrl,
        verifiedAt: fieldVerifiedAt,
        lastAdmission: meta?.lastAdmission,
        closedDays: meta?.closedDays,
      };
    }
  }

  if (hasHours && sourceUrl) {
    return {
      accessType: "scheduled",
      status: "sourced",
      requiresWarning: false,
      displayText,
      sourceUrl,
      lastAdmission: meta?.lastAdmission,
      closedDays: meta?.closedDays,
    };
  }

  if (hasHours) {
    return {
      accessType: "scheduled",
      status: "unverified",
      requiresWarning: true,
      displayText,
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
