import type { Destination } from "@/shared/types/destination";
import type { CarAccessAnchor, CarAccessState } from "@/shared/types/carAccess";
import {
  createFixtureCarRouteProvider,
  type CarRouteRequest,
  type CarRouteResult,
  getCarRoundTripRoute,
} from "@/shared/services/transport/CarRouteProvider";

const origins = {
  nakayama: { lat: 35.514745, lng: 139.539692 },
  tokyo: { lat: 35.6812, lng: 139.7671 },
  ruralNagano: { lat: 36.6486, lng: 138.1948 },
  ruralGunma: { lat: 36.3912, lng: 139.0608 },
};

type GoldenCase = {
  readonly id: string;
  readonly label: string;
  readonly origin: { lat: number; lng: number };
  readonly destination: { lat: number; lng: number };
  readonly anchor: CarAccessAnchor;
  readonly state?: CarAccessState;
  readonly eligibility?: "eligible" | "restricted" | "unavailable" | "unknown";
  readonly tollExpectation: "separate_evidence_required";
};

const cases: readonly GoldenCase[] = [
  {
    id: "nakayama-hakone",
    label: "Nakayama/Yokohama → Hakone",
    origin: origins.nakayama,
    destination: { lat: 35.232, lng: 139.106 },
    anchor: {
      id: "hakone-official-parking",
      label: "Hakone official parking",
      kind: "official_parking",
      coordinates: { lat: 35.2307, lng: 139.1021 },
      sourceUrls: ["fixture://kai-226/hakone-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "nakayama-karuizawa",
    label: "Nakayama/Yokohama → Karuizawa",
    origin: origins.nakayama,
    destination: { lat: 36.3566, lng: 138.635 },
    anchor: {
      id: "karuizawa-old-new-area-parking",
      label: "Old/New Karuizawa parking",
      kind: "official_parking",
      coordinates: { lat: 36.357333, lng: 138.633287 },
      sourceUrls: ["fixture://kai-226/karuizawa-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "tokyo-karuizawa",
    label: "Tokyo → Karuizawa",
    origin: origins.tokyo,
    destination: { lat: 36.3566, lng: 138.635 },
    anchor: {
      id: "karuizawa-old-new-area-parking-tokyo-case",
      label: "Karuizawa parking (Tokyo case)",
      kind: "official_parking",
      coordinates: { lat: 36.357333, lng: 138.633287 },
      sourceUrls: ["fixture://kai-226/karuizawa-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "tokyo-kawaguchiko",
    label: "Tokyo → Kawaguchiko",
    origin: origins.tokyo,
    destination: { lat: 35.499, lng: 138.754 },
    anchor: {
      id: "kawaguchiko-station-parking",
      label: "Kawaguchiko station parking",
      kind: "station_parking",
      coordinates: { lat: 35.498, lng: 138.768 },
      sourceUrls: ["fixture://kai-226/kawaguchiko-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "tokyo-nikko",
    label: "Tokyo → Nikko",
    origin: origins.tokyo,
    destination: { lat: 36.758, lng: 139.598 },
    anchor: {
      id: "nikko-shrine-parking",
      label: "Nikko shrine-area parking",
      kind: "official_parking",
      coordinates: { lat: 36.754, lng: 139.601 },
      sourceUrls: ["fixture://kai-226/nikko-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "rural-nagano-karuizawa",
    label: "Rural Nagano → Karuizawa",
    origin: origins.ruralNagano,
    destination: { lat: 36.3566, lng: 138.635 },
    anchor: {
      id: "karuizawa-old-new-area-parking-nagano-case",
      label: "Karuizawa parking (Nagano case)",
      kind: "official_parking",
      coordinates: { lat: 36.357333, lng: 138.633287 },
      sourceUrls: ["fixture://kai-226/karuizawa-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "rural-gunma-karuizawa",
    label: "Rural Gunma → Karuizawa",
    origin: origins.ruralGunma,
    destination: { lat: 36.3566, lng: 138.635 },
    anchor: {
      id: "karuizawa-old-new-area-parking-gunma-case",
      label: "Karuizawa parking (Gunma case)",
      kind: "official_parking",
      coordinates: { lat: 36.357333, lng: 138.633287 },
      sourceUrls: ["fixture://kai-226/karuizawa-parking"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "toll-free-route-example",
    label: "Toll-free route example",
    origin: origins.nakayama,
    destination: { lat: 35.54, lng: 139.49 },
    anchor: {
      id: "toll-free-local-parking",
      label: "Local parking",
      kind: "official_parking",
      coordinates: { lat: 35.541, lng: 139.491 },
      sourceUrls: ["fixture://kai-226/toll-free"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "expensive-expressway-route-example",
    label: "Expensive expressway route example",
    origin: origins.tokyo,
    destination: { lat: 36.3566, lng: 138.635 },
    anchor: {
      id: "expressway-parking",
      label: "Expressway destination parking",
      kind: "official_parking",
      coordinates: { lat: 36.357333, lng: 138.633287 },
      sourceUrls: ["fixture://kai-226/expressway"],
    },
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "parking-walk-destination",
    label: "Parking + walk destination",
    origin: origins.nakayama,
    destination: { lat: 36.3566, lng: 138.635 },
    anchor: {
      id: "parking-walk-anchor",
      label: "Park-and-walk lot",
      kind: "official_parking",
      coordinates: { lat: 36.357333, lng: 138.633287 },
      sourceUrls: ["fixture://kai-226/parking-walk"],
    },
    state: "parking_walk",
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "seasonal-restricted-access",
    label: "Seasonal/restricted access example",
    origin: origins.nakayama,
    destination: { lat: 36.8, lng: 138.7 },
    anchor: {
      id: "seasonal-trailhead",
      label: "Seasonal trailhead",
      kind: "trailhead",
      coordinates: { lat: 36.801, lng: 138.701 },
      sourceUrls: ["fixture://kai-226/seasonal"],
    },
    state: "seasonal",
    eligibility: "restricted",
    tollExpectation: "separate_evidence_required",
  },
  {
    id: "island-ferry-required",
    label: "Island/ferry-required example",
    origin: origins.tokyo,
    destination: { lat: 38.0, lng: 138.3 },
    anchor: {
      id: "sado-ferry-terminal",
      label: "Sado ferry terminal",
      kind: "ferry_terminal",
      coordinates: { lat: 37.95, lng: 138.25 },
      sourceUrls: ["fixture://kai-226/ferry-terminal"],
    },
    state: "ferry_required",
    eligibility: "unavailable",
    tollExpectation: "separate_evidence_required",
  },
];

function endpointFor(anchor: CarAccessAnchor, kind: "anchor" | "origin") {
  return {
    id: kind === "anchor" ? anchor.id : "origin",
    label: kind === "anchor" ? anchor.label : "Trip origin",
    kind: kind === "anchor" ? anchor.kind : ("origin" as const),
    accessAnchorId: kind === "anchor" ? anchor.id : undefined,
    coordinates: anchor.coordinates!,
    sourceUrls: anchor.sourceUrls,
  };
}

function fixtureRoute(
  item: GoldenCase,
  direction: "outbound" | "return",
): CarRouteResult {
  const anchorEndpoint = endpointFor(item.anchor, "anchor");
  const originEndpoint = endpointFor(
    {
      ...item.anchor,
      coordinates: item.origin,
    },
    "origin",
  );
  return {
    availability: "available",
    origin: direction === "outbound" ? item.origin : item.anchor.coordinates!,
    originEndpoint: direction === "outbound" ? originEndpoint : anchorEndpoint,
    destination: direction === "outbound" ? anchorEndpoint : originEndpoint,
    accessAnchor: anchorEndpoint,
    provider: "golden-fixture",
    direction,
    retrievedAt: "2026-09-03T00:00:00.000Z",
    distanceKm: direction === "outbound" ? 100 : 103,
    durationMinutes: direction === "outbound" ? 120 : 124,
    toll: { state: "unknown", basis: "unspecified" },
    confidence: "verified",
    completeness: "complete",
  };
}

function destinationFor(item: GoldenCase): Destination {
  return {
    id: item.id,
    name: item.label,
    coordinates: item.destination,
    carAccess: {
      state: item.state ?? "parking_walk",
      eligibility: item.eligibility ?? "eligible",
      anchors: [item.anchor],
      evidence: "official",
      sourceUrls: item.anchor.sourceUrls,
    },
  } as unknown as Destination;
}

const results = cases.map((item) => {
  const destination = destinationFor(item);
  const snapshots =
    item.eligibility === "restricted" || item.eligibility === "unavailable"
      ? []
      : [fixtureRoute(item, "outbound"), fixtureRoute(item, "return")];
  const calls: CarRouteRequest[] = [];
  const fixture = createFixtureCarRouteProvider(snapshots);
  const result = getCarRoundTripRoute(
    {
      route(request) {
        calls.push(request);
        return fixture.route(request);
      },
    },
    destination,
    item.origin,
  );
  const routeAvailable =
    result.outbound.availability === "available" &&
    result.returnRoute.availability === "available";
  if (routeAvailable) {
    if (result.outbound.destination?.id !== item.anchor.id) {
      throw new Error(`${item.id}: outbound route did not target its anchor`);
    }
    if (
      result.outbound.destination?.coordinates?.lat === item.destination.lat &&
      result.outbound.destination?.coordinates?.lng === item.destination.lng
    ) {
      throw new Error(`${item.id}: route targeted destination centroid`);
    }
    if (result.outbound.originEndpoint?.id !== "origin") {
      throw new Error(`${item.id}: origin scope was not retained`);
    }
    if (result.returnRoute.originEndpoint?.id !== item.anchor.id) {
      throw new Error(`${item.id}: return anchor scope was not retained`);
    }
    if (result.outbound.distanceKm === result.returnRoute.distanceKm) {
      throw new Error(`${item.id}: asymmetric return distance was lost`);
    }
  } else if (calls.length !== 0) {
    throw new Error(
      `${item.id}: restricted/ferry case unexpectedly called routing`,
    );
  }
  return {
    id: item.id,
    label: item.label,
    validation: routeAvailable ? "fixture_contract_pass" : "fail_closed_pass",
    outboundDistanceKm: result.outbound.distanceKm,
    returnDistanceKm: result.returnRoute.distanceKm,
    outboundDurationMinutes: result.outbound.durationMinutes,
    returnDurationMinutes: result.returnRoute.durationMinutes,
    outboundAvailability: result.outbound.availability,
    returnAvailability: result.returnRoute.availability,
    errorCode: result.outbound.errorCode,
    tollEvidence: item.tollExpectation,
    note: "Fixture contract only; no exact route distance and no live ORS call.",
  };
});

console.log(
  JSON.stringify(
    {
      ticket: "KAI-226",
      validationMode: "deterministic_fixture_contract",
      provider: "openrouteservice",
      liveOrsValidated: false,
      terminology: "routed road-network distance (fixture snapshot values)",
      cases: results,
    },
    null,
    2,
  ),
);
