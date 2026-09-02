import type { CostRepresentation } from "@/shared/services/budget/budgetV2";
import type {
  TransportFareScope,
  TransportMode,
} from "@/shared/services/transport/types";
import type { TransportZoneId } from "./transportTopology";

export type JourneyEvidence = "verified" | "estimated" | "unknown";
export type JourneyAvailability = "available" | "unavailable" | "unknown";
export type JourneyConfidence = "high" | "medium" | "low" | "unknown";
export type JourneyCostState = "known" | "unknown" | "unavailable";
export type JourneyCostCompleteness = "complete" | "partial" | "unknown";

export interface JourneyCoordinates {
  readonly lat: number;
  readonly lng: number;
}

export interface JourneyEndpoint {
  readonly id?: string;
  readonly name?: string;
  readonly coordinates?: JourneyCoordinates;
  readonly zoneId?: TransportZoneId;
  readonly kind?:
    | "origin"
    | "destination"
    | "station"
    | "airport"
    | "port"
    | "access_anchor"
    | "unknown";
}

export interface JourneyDuration {
  /** A bounded range in minutes. Omitted when duration evidence is unknown. */
  readonly minutes?: readonly [number, number];
  readonly evidence: JourneyEvidence;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly checkedAt?: string;
}

/**
 * Cost/fare representation for one leg. The representation is deliberately
 * nullable: a route can be available while its fare remains unknown.
 */
export interface JourneyCost {
  readonly currency: "JPY";
  readonly representation: CostRepresentation | null;
  readonly state: JourneyCostState;
  readonly evidence: JourneyEvidence;
  readonly scope: TransportFareScope;
  readonly completeness: JourneyCostCompleteness;
  /** The unit of the legacy fare/cost value carried by this leg. */
  readonly basis:
    | "one_way_per_person"
    | "round_trip_per_person"
    | "one_way"
    | "round_trip"
    | "unknown";
  readonly variability?: "fixed" | "range" | "variable" | "dynamic";
  readonly sourceUrls?: readonly string[];
}

/** Metadata retained from the existing route/transport result without making
 * provider-specific JSON part of the Journey contract. */
export interface JourneyRouteMetadata {
  readonly source?: string;
  readonly originZoneId?: TransportZoneId;
  readonly destinationZoneId?: TransportZoneId;
  readonly corridorEvidence?: "verified";
  readonly accessDistanceKm?: {
    readonly origin?: number;
    readonly destination?: number;
  };
  readonly originAccessTimeRange?: readonly [number, number];
  readonly destinationAccessTimeRange?: readonly [number, number];
  readonly servicePeriod?: "day" | "night" | "mixed";
  readonly serviceName?: string;
  readonly operator?: string;
  readonly reservationRequired?: boolean;
  readonly fareBasis?: string;
  readonly fareVariability?: "fixed" | "range" | "variable" | "dynamic";
  readonly departureAirportCode?: string;
  readonly departureAirportName?: string;
  readonly arrivalAirportCode?: string;
  readonly arrivalAirportName?: string;
  readonly departurePortName?: string;
  readonly arrivalPortName?: string;
  readonly notes?: string;
}

export interface JourneyProvenance {
  readonly source: string;
  readonly confidence: JourneyConfidence;
  readonly duration: JourneyEvidence;
  readonly cost: JourneyEvidence;
  readonly sourceUrl?: string;
  readonly checkedAt?: string;
}

export interface JourneyLeg {
  readonly mode: TransportMode;
  readonly origin: JourneyEndpoint;
  readonly destination: JourneyEndpoint;
  readonly duration: JourneyDuration;
  readonly cost: JourneyCost;
  readonly availability: JourneyAvailability;
  readonly confidence: JourneyConfidence;
  readonly provenance: JourneyProvenance;
  readonly routeMetadata?: JourneyRouteMetadata;
}

/**
 * Canonical journey envelope. KAI-263 produces one leg for every existing
 * single-mode result. The array is intentionally ready for future legs, but
 * this ticket does not synthesize feeder or walking legs.
 */
export interface Journey {
  readonly kind: "journey";
  readonly origin: JourneyEndpoint;
  readonly destination: JourneyEndpoint;
  readonly legs: readonly JourneyLeg[];
  readonly availability: JourneyAvailability;
  readonly confidence: JourneyConfidence;
  readonly provenance: JourneyProvenance;
}

export function journeyCostCompleteness(
  scope: TransportFareScope,
  hasRepresentation: boolean,
): JourneyCostCompleteness {
  if (!hasRepresentation || scope === "unknown") return "unknown";
  return scope === "complete" ? "complete" : "partial";
}
