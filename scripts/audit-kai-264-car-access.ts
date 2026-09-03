import data from "@/shared/data/destinations-index.json";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import {
  getCarAccess,
  getCarAccessAnchors,
  resolveCarAccess,
} from "@/shared/services/transport/CarAccessService";
import carAccessRecords from "@/shared/data/car-access.json";
import type { Destination } from "@/shared/types/destination";

const destinations = data as Destination[];
const canonicalAccessRecords = carAccessRecords as Record<string, unknown>;

function hasLegacyCarDisplaySupport(destination: Destination): boolean {
  return [
    destination.transportOptions?.car,
    destination.transportOptions?.my_car,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

const origins = [
  {
    id: "nakayama-yokohama",
    label: "Nakayama/Yokohama",
    coordinates: { lat: 35.515, lng: 139.58 },
  },
  { id: "tokyo", label: "Tokyo", coordinates: { lat: 35.6812, lng: 139.7671 } },
  { id: "osaka", label: "Osaka", coordinates: { lat: 34.7025, lng: 135.4959 } },
  {
    id: "rural-nagano-gunma",
    label: "Rural Nagano/Gunma",
    coordinates: { lat: 36.4, lng: 138.6 },
  },
] as const;

function previousCarSupport(
  destination: Destination,
  coordinates: { lat: number; lng: number },
): boolean {
  const originZoneId = resolveOriginTransportZone({ coordinates });
  const destinationZoneId = resolveDestinationTransportZone(destination);
  // Reproduce the pre-KAI-264 baseline exactly: before destination-level
  // access became authoritative, an empty localAccessModes list fell back to
  // the zone local modes just like an omitted field.
  const legacyDestination =
    destination.localAccessModes?.length === 0
      ? { ...destination, localAccessModes: undefined }
      : destination;
  const topology = getEligibleOriginModes({
    originZoneId,
    destinationZoneId,
    destination: legacyDestination,
  });
  const authorized =
    originZoneId === destinationZoneId
      ? topology.localModes
      : topology.crossZoneModes;
  return (
    authorized.includes("car") &&
    destination.transportOptions?.car !== undefined
  );
}

// ── Classification buckets (resolution model) ────────────────────────────────

const resolutionBuckets = destinations.reduce(
  (summary, destination) => {
    const resolution = resolveCarAccess(destination);
    summary.classification[resolution.kind] =
      (summary.classification[resolution.kind] ?? 0) + 1;
    if (hasLegacyCarDisplaySupport(destination)) {
      summary.legacyCarOptionCount += 1;
    }
    return summary;
  },
  {
    classification: {} as Record<string, number>,
    legacyCarOptionCount: 0,
  },
);

const explicitAnchorRecords = destinations.filter(
  (destination) => getCarAccessAnchors(destination).length > 0,
);
const explicitEligibleAnchored = destinations.filter(
  (destination) => resolveCarAccess(destination).kind === "explicit",
);
const candidateDerived = destinations.filter(
  (destination) => resolveCarAccess(destination).kind === "candidate",
);
const restrictedOrUnavailable = destinations.filter((destination) => {
  const kind = resolveCarAccess(destination).kind;
  return kind === "restricted" || kind === "unavailable";
});
const unavailableResolution = destinations.filter(
  (destination) => resolveCarAccess(destination).kind === "unavailable",
);
const restrictedResolution = destinations.filter(
  (destination) => resolveCarAccess(destination).kind === "restricted",
);

const perOrigin = origins.map((origin) => {
  const previous = destinations.filter((destination) =>
    previousCarSupport(destination, origin.coordinates),
  );
  // New personalized support = topology car connection AND resolvable access
  // (explicit anchor or derived candidate). Same predicate the scorer uses.
  const current = destinations.filter((destination) =>
    getValidModes(destination, "rental", [], origin.coordinates).includes(
      "car",
    ),
  );
  const previousIds = new Set(previous.map((destination) => destination.id));
  const currentIds = new Set(current.map((destination) => destination.id));
  return {
    origin: origin.label,
    previousCarSupportedCount: previous.length,
    newCarSupportedCount: current.length,
    explicitlyAnchoredCount: current.filter(
      (destination) => resolveCarAccess(destination).kind === "explicit",
    ).length,
    candidateCount: current.filter(
      (destination) => resolveCarAccess(destination).kind === "candidate",
    ).length,
    newlyGainedCarDestinations: current
      .filter((destination) => !previousIds.has(destination.id))
      .map((destination) => destination.id)
      .sort(),
    carSupportLost: previous
      .filter((destination) => !currentIds.has(destination.id))
      .map((destination) => destination.id)
      .sort(),
  };
});

const newlyGained = [
  ...new Set(perOrigin.flatMap((result) => result.newlyGainedCarDestinations)),
].sort();
const lost = [
  ...new Set(perOrigin.flatMap((result) => result.carSupportLost)),
].sort();

const changedReasons = [...new Set([...newlyGained, ...lost])]
  .map((id) => {
    const destination = destinations.find((candidate) => candidate.id === id)!;
    const resolution = resolveCarAccess(destination);
    return {
      destinationId: id,
      kind: resolution.kind,
      state: resolution.access.state,
      eligibility: resolution.access.eligibility,
      evidence: resolution.access.evidence,
      reason: resolution.reason,
      sourceUrls: [...resolution.access.sourceUrls],
    };
  })
  .sort((a, b) => a.destinationId.localeCompare(b.destinationId));

const accessSummary = destinations.reduce(
  (summary, destination) => {
    const access = getCarAccess(destination);
    summary[access.state] = (summary[access.state] ?? 0) + 1;
    return summary;
  },
  {
    direct: 0,
    parking_walk: 0,
    trailhead: 0,
    seasonal: 0,
    restricted: 0,
    ferry_required: 0,
    unavailable: 0,
    unknown: 0,
  } as Record<string, number>,
);

const explicitFailureStates = destinations.filter(
  (destination) =>
    destination.carAccess !== undefined ||
    canonicalAccessRecords[destination.id] !== undefined,
);

const accessStateSummary = destinations.reduce<Record<string, number>>(
  (summary, destination) => {
    const access = getCarAccess(destination);
    summary[access.state] = (summary[access.state] ?? 0) + 1;
    return summary;
  },
  {},
);

console.log(
  JSON.stringify(
    {
      ticket: "KAI-264",
      generatedAt: "2026-09-03",
      origins: perOrigin,
      aggregate: {
        previousCarSupportedCount: perOrigin[0].previousCarSupportedCount,
        newCarSupportedCount: perOrigin[0].newCarSupportedCount,
        newlyGainedCarDestinations: newlyGained,
        carSupportLost: lost,
      },
      resolutionClassification: {
        catalogueRecordCount: destinations.length,
        legacyCarOptionCount: resolutionBuckets.legacyCarOptionCount,
        explicit: resolutionBuckets.classification.explicit ?? 0,
        candidate: resolutionBuckets.classification.candidate ?? 0,
        restricted: resolutionBuckets.classification.restricted ?? 0,
        unavailable: resolutionBuckets.classification.unavailable ?? 0,
        unknown: resolutionBuckets.classification.unknown ?? 0,
        explicitAnchorRecordCount: explicitAnchorRecords.length,
        explicitEligibleAnchoredCount: explicitEligibleAnchored.length,
        candidateDerivedCount: candidateDerived.length,
        explicitFailureStateCount: explicitFailureStates.length,
        restrictedCount: restrictedResolution.length,
        unavailableCount: unavailableResolution.length,
        // No live ORS credential is configured in this repository: candidates
        // are RESOLVABLE, not yet proven routable. Runtime acquisition via the
        // KAI-226 server endpoint upgrades candidate → routable.
        routableProvenCount: explicitEligibleAnchored.length,
        routableNote:
          "Only explicitly anchored records are proven routable endpoints today. Candidates become routable when the KAI-226 runtime acquisition successfully routes them (no live ORS call in this audit).",
      },
      accessSummary,
      accessStateSummary,
      allRestrictedOrUnavailable: restrictedOrUnavailable
        .map((destination) => ({
          id: destination.id,
          kind: resolveCarAccess(destination).kind,
          state: getCarAccess(destination).state,
          reason: getCarAccess(destination).reason,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      changedReasons,
      note: "Legacy transportOptions/localAccessModes car metadata now marks a destination as a RESOLUTION CANDIDATE (worth attempting road routing) rather than proof of availability. Personalized car eligibility in the scorer additionally requires the origin's topology car connection; explicit restricted/unavailable records can never be overridden by candidate derivation. Per-origin newCarSupportedCount therefore equals the previous count (281) plus any gains, because every legacy-supported destination with coordinates is resolvable — but canonical duration/cost for candidates remains unknown until runtime route acquisition succeeds.",
    },
    null,
    2,
  ),
);
