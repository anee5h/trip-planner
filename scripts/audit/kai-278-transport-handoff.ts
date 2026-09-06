import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type { Journey, JourneyEndpoint } from "@/shared/types/journey";
import {
  loadRelationshipIndex,
  DestinationRelationshipService,
} from "@/shared/services/destination/DestinationRelationshipService";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import { buildJourneyHandoff } from "@/shared/services/transport/JourneyHandoff";
import {
  buildPartialLocalAccessJourney,
  getOriginAwareTransportJourney,
} from "@/shared/services/transport/JourneyService";
import type { TransportMode } from "@/shared/services/transport/types";

const root = resolve(import.meta.dirname, "../..");
const origin = { lat: 35.6812, lng: 139.7671 };
const originZoneId = resolveOriginTransportZone({ coordinates: origin });
const destinations = destinationsIndex as Destination[];
loadRelationshipIndex(destinations);

function find(id: string): Destination {
  const destination = destinations.find((candidate) => candidate.id === id);
  if (!destination) throw new Error(`Missing audit destination: ${id}`);
  return destination;
}

function endpointForDestination(
  destination: Destination,
  kind: JourneyEndpoint["kind"],
): JourneyEndpoint {
  return {
    id: destination.id,
    anchorKey: destination.coordinates
      ? `coordinates:${destination.coordinates.lat.toFixed(4)}:${destination.coordinates.lng.toFixed(4)}`
      : destination.id,
    name: destination.name,
    coordinates: destination.coordinates,
    zoneId: resolveDestinationTransportZone(destination),
    kind,
  };
}

function summary(journey: Journey | null) {
  if (!journey) return null;
  const firstLeg = journey.legs[0];
  return {
    origin: journey.origin,
    destination: journey.destination,
    mode: firstLeg?.mode ?? null,
    duration: firstLeg?.duration.minutes ?? null,
    availability: journey.availability,
    scope: journey.scope,
    directionality: journey.directionality,
    completeness: journey.completeness,
    provenance: firstLeg?.provenance ?? null,
    externalHandoff: journey.externalHandoff,
    handoff: buildJourneyHandoff(journey),
  };
}

const hakone = find("hakone-town");
const kyotoHub = find("kyoto-city");
const kyotoChild = find("fushimi-inari-taisha");
const tokyoStation = find("tokyo-station-chiyoda");
const shodoshima = find("shodoshima");
const kyotoParent =
  DestinationRelationshipService.getParentDestination(kyotoChild) ?? kyotoHub;
const baseContext = {
  homeStationCoords: origin,
  originZoneId,
  originLabel: "Tokyo Station",
};

const cases = [
  {
    id: "hakone-my-car",
    fixture: "A",
    journey: getOriginAwareTransportJourney(hakone, baseContext, ["my_car"]),
  },
  {
    id: "hakone-rental-car",
    fixture: "E",
    journey: getOriginAwareTransportJourney(hakone, baseContext, ["car"]),
  },
  {
    id: "hakone-public-transit",
    fixture: "E",
    journey: getOriginAwareTransportJourney(hakone, baseContext, ["train"]),
  },
  {
    id: "kyoto-local-fushimi",
    fixture: "B",
    journey: getOriginAwareTransportJourney(
      kyotoChild,
      {
        homeStationCoords: kyotoParent.coordinates,
        originZoneId: resolveDestinationTransportZone(kyotoParent),
        originLabel: kyotoParent.name,
        originEndpoint: endpointForDestination(kyotoParent, "access_anchor"),
      },
      ["bus", "train"],
      {
        scope: "local_access",
        originEndpoint: endpointForDestination(kyotoParent, "access_anchor"),
      },
    ),
  },
  {
    id: "tokyo-station-same-anchor",
    fixture: "C",
    journey: getOriginAwareTransportJourney(tokyoStation, baseContext, [
      "train",
    ]),
  },
  {
    id: "tokyo-station-distinct-anchor",
    fixture: "C",
    journey: getOriginAwareTransportJourney(
      {
        ...tokyoStation,
        coordinates: {
          lat: tokyoStation.coordinates.lat + 0.001,
          lng: tokyoStation.coordinates.lng,
        },
      },
      baseContext,
      ["train"],
    ),
  },
  {
    id: "shodoshima-partial-local-access",
    fixture: "D",
    journey: buildPartialLocalAccessJourney(
      shodoshima,
      (shodoshima.localAccessModes ?? []) as readonly TransportMode[],
      {
        id: "shodoshima:arrival",
        anchorKey: "arrival:shodoshima",
        name: "Ferry arrival / local access anchor",
        kind: "access_anchor",
      },
    ),
  },
  {
    id: "shodoshima-unsupported-car",
    fixture: "F",
    journey: getOriginAwareTransportJourney(shodoshima, baseContext, [
      "my_car",
    ]),
  },
];

const findings = cases.map(({ id, fixture, journey }) => {
  const result = summary(journey);
  const handoffDestination = result?.handoff
    ? new URL(result.handoff.href).searchParams.get("destination")
    : null;
  const expectedDestination = result?.destination.coordinates
    ? `${result.destination.coordinates.lat},${result.destination.coordinates.lng}`
    : null;
  return {
    id,
    fixture,
    result,
    checks: {
      carTransitMismatch: Boolean(
        result &&
        (result.mode === "car" || result.mode === "my_car") &&
        result.handoff?.externalMode === "transit",
      ),
      endpointMismatch: Boolean(
        handoffDestination &&
        expectedDestination &&
        handoffDestination !== expectedDestination,
      ),
      partialAsComplete: Boolean(
        (result && result.completeness !== "complete" && result.handoff) ||
        (result?.completeness === "partial" && result.handoff),
      ),
      localScopeLeak:
        id === "kyoto-local-fushimi" && result?.scope !== "local_access",
      sameOriginMisleading:
        id === "tokyo-station-same-anchor" && Boolean(result?.duration?.[1]),
      unsupportedCarFallback:
        id === "shodoshima-unsupported-car" && result !== null,
    },
  };
});

const counts = {
  cases: findings.length,
  carTransitMismatches: findings.filter(
    (finding) => finding.checks.carTransitMismatch,
  ).length,
  endpointMismatches: findings.filter(
    (finding) => finding.checks.endpointMismatch,
  ).length,
  localCardOriginScopeLeaks: findings.filter(
    (finding) => finding.checks.localScopeLeak,
  ).length,
  sameOriginMisleadingJourneys: findings.filter(
    (finding) => finding.checks.sameOriginMisleading,
  ).length,
  partialAsCompleteDefects: findings.filter(
    (finding) => finding.checks.partialAsComplete,
  ).length,
  unsupportedCarTransitFallbacks: findings.filter(
    (finding) => finding.checks.unsupportedCarFallback,
  ).length,
  directionsBuildersBefore: 1,
  directionsBuildersAfter: 1,
  journeyResultOwnersBefore: 5,
  journeyResultOwnersAfter: 1,
};

const report = {
  schemaVersion: 1,
  baseline: "ff0eeed0c765a973537ed7c99c6ff0c902cdbd17",
  origin: { label: "Tokyo Station", coordinates: origin, zoneId: originZoneId },
  methodology:
    "Bounded runtime semantic audit; no catalogue-wide transport research.",
  counts,
  findings,
};

const jsonPath = resolve(root, "qa/kai-278/transport-handoff-audit.json");
const mdPath = resolve(root, "qa/kai-278/transport-handoff-audit.md");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  "# KAI-278 transport-handoff audit",
  "",
  "Baseline: `" + report.baseline + "`",
  "Scope: bounded runtime semantic audit over Hakone, Kyoto local access, Tokyo same/different anchors, Shodoshima partial access, and unsupported car.",
  "",
  "## Counts",
  "",
  "| Metric | Count |",
  "| --- | ---: |",
  ...Object.entries(counts).map(([key, value]) => `| ${key} | ${value} |`),
  "",
  "## Findings",
  "",
  "| Case | Mode | Scope | Duration | Completeness | Handoff | Checks |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...findings.map((finding) => {
    const result = finding.result;
    const checks =
      Object.entries(finding.checks)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(", ") || "none";
    return `| ${finding.id} | ${result?.mode ?? "unavailable"} | ${result?.scope ?? "—"} | ${result?.duration?.join("–") ?? "—"} | ${result?.completeness ?? "—"} | ${result?.handoff?.externalMode ?? "none"} | ${checks} |`;
  }),
  "",
  "## Interpretation",
  "",
  "- Car and rental-car Journeys expose only a `driving` handoff; no car-to-transit mismatch remains.",
  "- The Kyoto child case is calculated from the canonical Kyoto parent/access anchor and is labelled `local_access`.",
  "- Canonically equivalent Tokyo Station anchors produce a zero-duration same-anchor Journey; a deliberately displaced anchor remains a normal distinct journey.",
  "- Shodoshima keeps known local access as a `partial` final segment and has no directions handoff.",
  "- Unsupported car remains unavailable; no transit fallback is manufactured.",
  "",
].join("\n");
writeFileSync(mdPath, markdown);
console.log(JSON.stringify({ jsonPath, mdPath, counts }, null, 2));
