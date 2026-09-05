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

/**
 * Strict ISO YYYY-MM-DD with a real-calendar round-trip. JS `new Date()`
 * silently normalizes impossible dates ("2026-02-30" → Mar 2) and accepts
 * locale formats ("09/05/2026", "Sep 5 2026"); those must NOT count as a
 * valid verification date. Shared by the policy, the Opening Hours
 * Integrity validator and the audit so they cannot disagree.
 */
export function isValidIsoDate(value: string | undefined): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
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

  const fieldVerifiedAt = meta?.verifiedAt;
  const sourceUrl = meta?.sourceUrl || dest.officialWebsite;
  const metadataSourceUrl = meta?.sourceUrl;
  const displayText =
    typeof dest.businessHours === "string" ? dest.businessHours : undefined;

  if (fieldVerifiedAt) {
    const isValidPastDate =
      isValidIsoDate(fieldVerifiedAt) &&
      new Date(`${fieldVerifiedAt}T00:00:00Z`).getTime() <= now.getTime();

    if (!isValidPastDate) {
      return {
        accessType: "scheduled",
        status: "unverified",
        requiresWarning: true,
        displayText,
        sourceUrl,
      };
    }

    const ageInDays =
      (now.getTime() - new Date(`${fieldVerifiedAt}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24);

    if (hasHours && metadataSourceUrl && ageInDays <= FRESHNESS_WINDOW_DAYS) {
      return {
        accessType: "scheduled",
        status: "verified",
        requiresWarning: false,
        displayText,
        sourceUrl: metadataSourceUrl,
        verifiedAt: fieldVerifiedAt,
        lastAdmission: meta?.lastAdmission,
        closedDays: meta?.closedDays,
      };
    }

    if (hasHours && metadataSourceUrl && ageInDays > FRESHNESS_WINDOW_DAYS) {
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

    return {
      accessType: "scheduled",
      status: "unverified",
      requiresWarning: true,
      displayText,
      sourceUrl,
      verifiedAt: fieldVerifiedAt,
      lastAdmission: meta?.lastAdmission,
      closedDays: meta?.closedDays,
    };
  }

  if (hasHours && metadataSourceUrl) {
    return {
      accessType: "scheduled",
      status: "sourced",
      requiresWarning: false,
      displayText,
      sourceUrl: metadataSourceUrl,
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
