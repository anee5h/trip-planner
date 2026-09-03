import type {
  Journey,
  JourneyConfidence,
  JourneyCost,
  JourneyEndpoint,
  JourneyEvidence,
  JourneyLeg,
  JourneyProvenance,
  JourneyRouteMetadata,
} from "@/shared/types/journey";
import { journeyCostCompleteness } from "@/shared/types/journey";
import type {
  EstimatedTransportEstimate,
  OriginAwareTransportEstimate,
} from "./OriginAwareTransportService";
import type { TransportEstimate, TransportFareScope } from "./types";

export interface JourneyEndpoints {
  readonly origin: JourneyEndpoint;
  readonly destination: JourneyEndpoint;
}

function confidenceFor(
  evidence: JourneyEvidence,
  source: string,
): JourneyConfidence {
  if (evidence === "unknown") return "unknown";
  if (
    source === "verified_ground_route" ||
    source === "verified_flight" ||
    source === "verified_ferry"
  ) {
    return evidence === "verified" ? "high" : "medium";
  }
  return evidence === "verified" ? "medium" : "low";
}

function asCostRepresentation(
  fare: [number, number | null],
): NonNullable<JourneyCost["representation"]> {
  if (fare[1] === null) {
    return { kind: "open_ended", from: fare[0] };
  }
  return { kind: "bounded", min: fare[0], max: fare[1] };
}

function asBoundedCost(
  range: [number, number],
): NonNullable<JourneyCost["representation"]> {
  return { kind: "bounded", min: range[0], max: range[1] };
}

function costForOriginAwareEstimate(
  estimate: OriginAwareTransportEstimate,
): JourneyCost {
  const scope: TransportFareScope = estimate.fareScope ?? "unknown";
  const hasFare = Array.isArray(estimate.fare);
  const costEvidence: JourneyEvidence = hasFare
    ? (estimate.fareEvidence ?? estimate.evidence)
    : "unknown";
  const costKnown = hasFare && costEvidence !== "unknown";
  return {
    currency: "JPY",
    representation: costKnown ? asCostRepresentation(estimate.fare!) : null,
    state: costKnown ? "known" : "unknown",
    evidence: costEvidence,
    scope,
    completeness: journeyCostCompleteness(scope, costKnown),
    basis:
      estimate.fareBasis === "round-trip"
        ? "round_trip_per_person"
        : "one_way_per_person",
    variability: estimate.fareVariability ?? undefined,
    sourceUrls: [
      estimate.fareSourceUrl ?? estimate.sourceUrl,
      ...(estimate.fareSourceUrls ?? []),
    ].filter((url): url is string => Boolean(url)),
  };
}

function costForTransportEstimate(estimate: TransportEstimate): JourneyCost {
  const details = estimate.details;
  const verifiedFare = details?.verifiedFare;
  const hasVerifiedFare =
    estimate.available &&
    details?.verifiedFareStatus !== "unverified" &&
    Array.isArray(verifiedFare);
  if (hasVerifiedFare) {
    const basis =
      details?.ferryFareBasis === "round-trip"
        ? "round_trip_per_person"
        : "one_way_per_person";
    return {
      currency: "JPY",
      representation: asBoundedCost(verifiedFare),
      state: "known",
      evidence: "verified",
      scope: "corridor_only",
      completeness: "partial",
      basis,
      variability: verifiedFare[0] === verifiedFare[1] ? "fixed" : "range",
      sourceUrls: [details?.fareSourceUrl].filter((url): url is string =>
        Boolean(url),
      ),
    };
  }

  const availableCost = estimate.available && estimate.costUnavailable !== true;
  return {
    currency: "JPY",
    representation: availableCost ? asBoundedCost(estimate.costRange) : null,
    state: availableCost
      ? "known"
      : estimate.available
        ? "unknown"
        : "unavailable",
    evidence: availableCost ? "estimated" : "unknown",
    scope: "unknown",
    completeness: "unknown",
    basis:
      details?.ferryFareBasis === "round-trip"
        ? "round_trip_per_person"
        : details?.ferryFareBasis === "one-way"
          ? "one_way_per_person"
          : "unknown",
    variability: availableCost ? "range" : undefined,
  };
}

function metadataFromOriginAware(
  estimate: OriginAwareTransportEstimate,
): JourneyRouteMetadata {
  return {
    source: estimate.source,
    originZoneId: estimate.originZoneId,
    destinationZoneId: estimate.destinationZoneId,
    corridorEvidence: estimate.corridorEvidence,
    accessDistanceKm: estimate.accessDistanceKm,
    servicePeriod: estimate.servicePeriod,
    serviceName: estimate.serviceName,
    operator: estimate.operator,
    reservationRequired: estimate.reservationRequired,
    fareBasis: estimate.fareBasis,
    fareVariability: estimate.fareVariability ?? undefined,
    departureAirportCode: estimate.departureAirportCode,
    departureAirportName: estimate.departureAirportName,
    arrivalAirportCode: estimate.arrivalAirportCode,
    arrivalAirportName: estimate.arrivalAirportName,
    departurePortName: estimate.departurePortName,
    arrivalPortName: estimate.arrivalPortName,
    notes: estimate.notes,
  };
}

function metadataFromTransportEstimate(
  estimate: TransportEstimate,
): JourneyRouteMetadata {
  const details = estimate.details;
  return {
    source: estimate.source,
    originAccessTimeRange: details?.originAccessTimeRange,
    destinationAccessTimeRange: details?.destAccessTimeRange,
    serviceName: details?.serviceName,
    operator: details?.operator,
    fareBasis: details?.ferryFareBasis,
    departureAirportCode: details?.departureAirportCode,
    departureAirportName: details?.departureAirportName,
    arrivalAirportCode: details?.arrivalAirportCode,
    arrivalAirportName: details?.arrivalAirportName,
    departurePortName: details?.departurePortName,
    arrivalPortName: details?.arrivalPortName,
    notes: details?.ferryNotes,
  };
}

function provenanceFor(
  source: string,
  evidence: JourneyEvidence,
  sourceUrl: string | undefined,
  checkedAt: string | undefined,
  costEvidence: JourneyEvidence,
): JourneyProvenance {
  return {
    source,
    confidence: confidenceFor(evidence, source),
    duration: evidence,
    cost: costEvidence,
    sourceUrl,
    checkedAt,
  };
}

function journeyForLeg(endpoints: JourneyEndpoints, leg: JourneyLeg): Journey {
  return {
    kind: "journey",
    origin: endpoints.origin,
    destination: endpoints.destination,
    legs: [leg],
    availability: leg.availability,
    confidence: leg.confidence,
    provenance: leg.provenance,
  };
}

/** Convert an existing origin-aware single-mode result into one canonical leg. */
export function buildJourneyFromOriginAwareEstimate(
  estimate: OriginAwareTransportEstimate,
  endpoints: JourneyEndpoints,
): Journey {
  const confidence = confidenceFor(estimate.evidence, estimate.source);
  const cost = costForOriginAwareEstimate(estimate);
  const provenance = provenanceFor(
    estimate.source,
    estimate.evidence,
    estimate.sourceUrl,
    estimate.checkedAt,
    cost.evidence,
  );
  return journeyForLeg(endpoints, {
    mode: estimate.mode,
    origin: endpoints.origin,
    destination: endpoints.destination,
    duration: {
      minutes: estimate.timeRange,
      evidence: estimate.evidence,
      source: estimate.source,
      sourceUrl: estimate.sourceUrl,
      checkedAt: estimate.checkedAt,
    },
    cost,
    availability: "available",
    confidence,
    provenance,
    routeMetadata: metadataFromOriginAware(estimate),
  });
}

/** Convert a bounded display estimate without upgrading it to verified truth. */
export function buildJourneyFromEstimatedTransportEstimate(
  estimate: EstimatedTransportEstimate,
  endpoints: JourneyEndpoints,
): Journey {
  const provenance = provenanceFor(
    estimate.source,
    "estimated",
    undefined,
    undefined,
    "unknown",
  );
  return journeyForLeg(endpoints, {
    mode: estimate.mode,
    origin: endpoints.origin,
    destination: endpoints.destination,
    duration: {
      minutes: estimate.timeRange,
      evidence: "estimated",
      source: estimate.source,
    },
    cost: {
      currency: "JPY",
      representation: null,
      state: "unknown",
      evidence: "unknown",
      scope: "unknown",
      completeness: "unknown",
      basis: "unknown",
    },
    availability: "available",
    confidence: "low",
    provenance,
    routeMetadata: {
      source: estimate.source,
      originZoneId: estimate.originZoneId,
      destinationZoneId: estimate.destinationZoneId,
    },
  });
}

/** Convert an existing generic estimate without changing its evidence. */
export function buildJourneyFromTransportEstimate(
  estimate: TransportEstimate,
  endpoints: JourneyEndpoints,
): Journey {
  const hasCalculatedAccessOverhead =
    (estimate.mode === "flight" || estimate.mode === "ferry") &&
    Boolean(
      estimate.details?.originAccessTimeRange ||
      estimate.details?.destAccessTimeRange,
    );
  const evidence: JourneyEvidence = estimate.available
    ? hasCalculatedAccessOverhead
      ? "estimated"
      : estimate.source === "dataset"
        ? "verified"
        : "estimated"
    : "unknown";
  const cost = costForTransportEstimate(estimate);
  const availability = estimate.available ? "available" : "unavailable";
  const sourceUrl = estimate.details?.sourceUrl;
  const checkedAt = estimate.details?.checkedAt;
  const provenance = provenanceFor(
    estimate.source,
    evidence,
    sourceUrl,
    checkedAt,
    cost.evidence,
  );
  const confidence = estimate.available
    ? confidenceFor(evidence, estimate.source)
    : "unknown";
  return journeyForLeg(endpoints, {
    mode: estimate.mode,
    origin: endpoints.origin,
    destination: endpoints.destination,
    duration: {
      minutes: estimate.available ? estimate.timeRange : undefined,
      evidence,
      source: estimate.source,
      sourceUrl,
      checkedAt,
    },
    cost,
    availability,
    confidence,
    provenance: { ...provenance, confidence },
    routeMetadata: metadataFromTransportEstimate(estimate),
  });
}

export const JourneyBuilder = {
  fromOriginAwareEstimate: buildJourneyFromOriginAwareEstimate,
  fromEstimatedTransportEstimate: buildJourneyFromEstimatedTransportEstimate,
  fromTransportEstimate: buildJourneyFromTransportEstimate,
} as const;
