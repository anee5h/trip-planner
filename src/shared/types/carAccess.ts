export type CarAccessState =
  | "direct"
  | "parking_walk"
  | "trailhead"
  | "seasonal"
  | "restricted"
  | "ferry_required"
  | "unavailable"
  | "unknown";

export type CarAccessAnchorKind =
  | "official_parking"
  | "road_access_entrance"
  | "trailhead"
  | "station_parking"
  | "ferry_terminal"
  | "documented_endpoint";

export type CarAccessEvidence =
  | "official"
  | "government"
  | "tourism_board"
  | "catalogue_metadata"
  | "legacy_compatibility"
  | "none";

export type CarAccessEligibility =
  "eligible" | "restricted" | "unavailable" | "unknown";

export interface CarAccessCoordinates {
  readonly lat: number;
  readonly lng: number;
}

/** A named, source-backed road endpoint. Coordinates are optional until they
 * are independently verified; missing coordinates must never be invented. */
export interface CarAccessAnchor {
  readonly id: string;
  readonly label: string;
  readonly kind: CarAccessAnchorKind;
  readonly coordinates?: CarAccessCoordinates;
  readonly sourceUrls: readonly string[];
  readonly notes?: string;
}

/**
 * Destination-level car access truth. `state` describes the access geometry;
 * `eligibility` describes whether the mode may be considered. These are kept
 * separate so an eligible legacy record can remain explicitly unknown until a
 * route anchor is verified, and an unavailable/restricted record cannot be
 * selected merely because a legacy car minute exists.
 */
export interface CarAccess {
  readonly state: CarAccessState;
  readonly eligibility: CarAccessEligibility;
  readonly anchors: readonly CarAccessAnchor[];
  readonly evidence: CarAccessEvidence;
  readonly sourceUrls: readonly string[];
  readonly checkedAt?: string;
  readonly reason?: string;
}
