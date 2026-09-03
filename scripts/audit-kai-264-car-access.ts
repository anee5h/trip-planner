import data from "@/shared/data/destinations-index.json";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import { getCarAccess } from "@/shared/services/transport/CarAccessService";
import type { Destination } from "@/shared/types/destination";

const destinations = data as Destination[];
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
  // the zone local modes just like an omitted field. The current topology
  // helper intentionally treats [] as a hard no-access declaration, so pass a
  // normalized legacy view only for this historical comparison.
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

const perOrigin = origins.map((origin) => {
  const previous = destinations.filter((destination) =>
    previousCarSupport(destination, origin.coordinates),
  );
  const current = destinations.filter((destination) =>
    getValidModes(destination, "rental", [], origin.coordinates).includes(
      "car",
    ),
  );
  const previousIds = new Set(previous.map((destination) => destination.id));
  const currentIds = new Set(current.map((destination) => destination.id));
  const legacyOnly = previous.filter(
    (destination) =>
      getCarAccess(destination).evidence === "legacy_compatibility",
  );
  return {
    origin: origin.label,
    previousCarSupportedCount: previous.length,
    newCarSupportedCount: current.length,
    legacyOnlyCarSupportedCount: legacyOnly.length,
    legacyOnlyCarDestinations: legacyOnly
      .map((destination) => destination.id)
      .sort(),
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
const accessSummary = destinations.reduce(
  (summary, destination) => {
    const access = getCarAccess(destination);
    summary[access.state] = (summary[access.state] ?? 0) + 1;
    if (access.eligibility === "unknown") summary.unresolvedUnknown += 1;
    if (access.evidence === "legacy_compatibility") {
      summary.legacyCompatibilityCount += 1;
    }
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
    unresolvedUnknown: 0,
    legacyCompatibilityCount: 0,
  } as Record<string, number>,
);

const changedReasons = [...new Set([...newlyGained, ...lost])]
  .map((id) => {
    const destination = destinations.find((candidate) => candidate.id === id)!;
    const access = getCarAccess(destination);
    return {
      destinationId: id,
      state: access.state,
      eligibility: access.eligibility,
      evidence: access.evidence,
      reason: access.reason,
      sourceUrls: [...access.sourceUrls],
    };
  })
  .sort((a, b) => a.destinationId.localeCompare(b.destinationId));

console.log(
  JSON.stringify(
    {
      ticket: "KAI-264",
      generatedAt: "2026-09-03",
      origins: perOrigin,
      aggregate: {
        previousCarSupportedCount: perOrigin[0].previousCarSupportedCount,
        newCarSupportedCount: perOrigin[0].newCarSupportedCount,
        legacyOnlyCarSupportedCount: perOrigin[0].legacyOnlyCarSupportedCount,
        legacyOnlyCarDestinations: [
          ...new Set(
            perOrigin.flatMap((result) => result.legacyOnlyCarDestinations),
          ),
        ].sort(),
        newlyGainedCarDestinations: newlyGained,
        carSupportLost: lost,
      },
      accessSummary,
      changedReasons,
      note: "Previous support reproduces the pre-KAI-264 topology plus destination.transportOptions.car predicate. New personalized support requires topology plus coordinate-bearing CarAccessService evidence. Legacy-only destinations are reported separately and remain display-compatible but unknown for personalized routing.",
    },
    null,
    2,
  ),
);
