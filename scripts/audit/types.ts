/**
 * Stable typed contracts for the v1.9.5 expansion audit.
 *
 * AUD-001: Every finding is a structured object, not a free-form string.
 * AUD-002: Four severity levels — error, warning, review, info.
 * AUD-003: Editorial lifecycle status lives on the record, not in findings.
 * AUD-004: All finding codes are documented here and must be stable across runs.
 */

export type AuditSeverity = "error" | "warning" | "review" | "info";

/** Deterministic severity ordering for sort comparisons (lower = higher priority). */
export const SEVERITY_RANK: Record<AuditSeverity, number> = {
  error: 0,
  warning: 1,
  review: 2,
  info: 3,
};

export type ExpansionAuditCode =
  /** transport.train or transport.shinkansen estimate is implausibly large */
  | "TRANSPORT_ESTIMATE_SUSPICIOUS"
  /** ratings.rain contradicts comfort.rainFriendly or indoorPercent */
  | "RAIN_DATA_CONFLICT"
  /** Japanese highlights do not match canonical category translations */
  | "LOCALIZATION_PARITY_MISMATCH"
  /** Free-form public place has a non-zero admission ticket budget */
  | "FREE_PLACE_TICKET_COST"
  /** Paid venue (museum, castle, etc.) has zero ticket budget */
  | "PAID_VENUE_ZERO_TICKET_COST"
  /** editorial.changes contains duplicate audit history entries */
  | "DUPLICATE_AUDIT_HISTORY"
  /** A field contains a value outside its allowed enum */
  | "INVALID_ENUM_VALUE"
  /** kind and primary category are incompatible */
  | "KIND_CATEGORY_MISMATCH"
  /** Destination coordinates are implausibly far from parent hub */
  | "PARENT_GEOGRAPHY_REVIEW"
  /** areaId assignment appears inconsistent with hub or coordinates */
  | "AREA_ASSIGNMENT_REVIEW"
  /** Destination shares an identical rating vector with another in the same hub */
  | "DUPLICATE_RATING_VECTOR"
  /** All required rating fields carry the same value (suspicious uniformity) */
  | "SUSPICIOUS_RATING_PRECISION"
  /** Description appears to be a raw template, fragment, or encyclopaedia stub */
  | "DESCRIPTION_QUALITY";

export interface ExpansionAuditFinding {
  /** Stable code identifying the rule that generated this finding. */
  code: ExpansionAuditCode;
  /** How serious this finding is. */
  severity: AuditSeverity;
  /** Destination that produced this finding. */
  destinationId: string;
  /** Parent hub, if known. */
  hubId?: string;
  /** Dot-notation field paths involved (e.g. ["ratings.rain", "comfort.rainFriendly"]). */
  fieldPaths: string[];
  /** Human-readable explanation. */
  message: string;
  /** Raw values or context that triggered the rule. */
  evidence?: Record<string, unknown>;
  /** What a maintainer should do to resolve the finding. */
  suggestedAction: string;
  /** Whether the repair:destination command can fix this automatically. */
  autoFixable: boolean;
}

/**
 * AUD-003: Editorial review status is separate from semantic findings.
 * A record may have editorialStatus="review_required" with an empty findings array.
 */
export interface ExpansionAuditRecord {
  destinationId: string;
  hubId?: string;
  /** Whether a human editorial review has been completed for this record. */
  editorialStatus: "review_required" | "reviewed" | "unknown";
  findings: ExpansionAuditFinding[];
  highestSeverity: AuditSeverity | "none";
}

/** AUD-005: Top-level report shape with hub and code aggregations. */
export interface AuditReport {
  catalogVersion: string;
  generatedAt: string;
  totalRecords: number;
  summary: Record<AuditSeverity, number>;
  byCode: Partial<Record<ExpansionAuditCode, number>>;
  byHub: Record<
    string,
    { errors: number; warnings: number; review: number; info: number }
  >;
  top20HighRisk: string[];
  records: ExpansionAuditRecord[];
}
