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

export type OpeningHoursScheduleStatus =
  | "schedulable"
  | "date_required"
  | "descriptive"
  | "stale"
  | "unverified"
  | "not_required";

export interface OpeningHoursAssessment {
  accessType: AccessType;
  status: OpeningHoursStatus;
  /** Evidence may be verified while still lacking a plan-ready time window. */
  scheduleStatus: OpeningHoursScheduleStatus;
  requiresWarning: boolean;
  displayText?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  lastAdmission?: string;
  closedDays?: string;
}

export interface OpeningHoursWindow {
  opensAtMinutes: number;
  closesAtMinutes: number;
  closedWeekdays: number[];
}

const TIME_RANGE_PATTERN =
  /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/;
const WEEKDAY_NUMBERS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function parseClock(hours: string, minutes?: string): number | null {
  const hour = Number(hours);
  const minute = Number(minutes ?? "0");
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function parseClosedWeekdays(text: string): number[] {
  const lower = text.toLowerCase();
  const closedPart = lower.match(/closed\s+([^;.)]+)/)?.[1] ?? "";
  const days = Object.entries(WEEKDAY_NUMBERS)
    .filter(([name]) => new RegExp(`\\b${name}s?\\b`).test(closedPart))
    .map(([, day]) => day);
  return [...new Set(days)].sort((a, b) => a - b);
}

function parseWindowText(
  text: string,
  metadataClosedDays: string,
): OpeningHoursWindow | null {
  const match = text.match(TIME_RANGE_PATTERN);
  if (!match) return null;
  const opensAtMinutes = parseClock(match[1], match[2]);
  const closesAtMinutes = parseClock(match[3], match[4]);
  if (
    opensAtMinutes === null ||
    closesAtMinutes === null ||
    closesAtMinutes <= opensAtMinutes
  )
    return null;

  return {
    opensAtMinutes,
    closesAtMinutes,
    closedWeekdays: [
      ...new Set([
        ...parseClosedWeekdays(text),
        ...parseClosedWeekdays(metadataClosedDays),
      ]),
    ].sort((a, b) => a - b),
  };
}

function metadataClosedDays(destination: Destination): string {
  const metadata = destination.openingHoursMetadata as
    (Record<string, unknown> & { closedDays?: unknown }) | undefined;
  return typeof metadata?.closedDays === "string"
    ? metadata.closedDays
    : Array.isArray(metadata?.closedDays)
      ? metadata.closedDays.join(", ")
      : "";
}

function resolveOpeningHoursWindow(
  destination: Destination,
  travelDate?: string,
): OpeningHoursWindow | null {
  const monthlySchedule = destination.openingHoursMetadata?.monthlySchedule;
  if (monthlySchedule?.length) {
    if (!travelDate || !isValidIsoDate(travelDate)) return null;
    const month = Number(travelDate.slice(5, 7));
    const entry = monthlySchedule.find((item) => item.month === month);
    if (!entry) return null;
    return parseWindowText(
      entry.opensAt + " - " + entry.closesAt,
      metadataClosedDays(destination),
    );
  }

  const text = destination.businessHours || destination.openingHours;
  if (!text) return null;
  return parseWindowText(text, metadataClosedDays(destination));
}

/** Only fresh, verified, date-resolved hours constrain a generated plan. */
export function getOpeningHoursWindow(
  destination: Destination,
  travelDate?: string,
): OpeningHoursWindow | null {
  const assessment = getOpeningHoursAssessment(
    destination,
    undefined,
    travelDate,
  );
  if (
    assessment.status !== "verified" ||
    assessment.scheduleStatus !== "schedulable"
  )
    return null;
  return resolveOpeningHoursWindow(destination, travelDate);
}

function scheduleStatusFor(
  destination: Destination,
  status: OpeningHoursStatus,
  travelDate?: string,
): OpeningHoursScheduleStatus {
  if (status === "not_required") return "not_required";
  if (status === "stale") return "stale";
  if (status !== "verified") return "unverified";
  if (resolveOpeningHoursWindow(destination, travelDate)) return "schedulable";
  if (destination.openingHoursMetadata?.monthlySchedule?.length) {
    return isValidIsoDate(travelDate) ? "descriptive" : "date_required";
  }
  return "descriptive";
}

export function isOpeningHoursClosedOnDate(
  destination: Destination,
  isoDate: string,
): boolean {
  const window = getOpeningHoursWindow(destination, isoDate);
  if (!window || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return window.closedWeekdays.includes(date.getUTCDay());
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

function getOpeningHoursEvidenceAssessment(
  dest: Destination,
  now: Date = new Date(),
): Omit<OpeningHoursAssessment, "scheduleStatus"> {
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
    typeof dest.businessHours === "string"
      ? dest.businessHours
      : typeof dest.openingHours === "string"
        ? dest.openingHours
        : undefined;

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

export function getOpeningHoursAssessment(
  dest: Destination,
  now: Date = new Date(),
  travelDate?: string,
): OpeningHoursAssessment {
  const evidence = getOpeningHoursEvidenceAssessment(dest, now);
  const scheduleStatus = scheduleStatusFor(dest, evidence.status, travelDate);
  return {
    ...evidence,
    scheduleStatus,
    requiresWarning:
      evidence.requiresWarning ||
      (scheduleStatus !== "schedulable" && scheduleStatus !== "not_required"),
  };
}

export function requiresOpeningHours(dest: Destination): boolean {
  const assessment = getOpeningHoursAssessment(dest);
  return assessment.status !== "not_required";
}

export function hasVerifiedOpeningHours(dest: Destination): boolean {
  return getOpeningHoursAssessment(dest).status === "verified";
}
