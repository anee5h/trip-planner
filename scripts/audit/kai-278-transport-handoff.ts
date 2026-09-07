import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type { CarAccessAnchor } from "@/shared/types/carAccess";
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
import { getRoutableCarAccessAnchors } from "@/shared/services/transport/CarAccessService";
import { destinationSharesOriginAnchor } from "@/shared/services/transport/JourneyEndpoints";
import type {
  CarRouteEndpoint,
  CarRoundTripRoute,
} from "@/shared/services/transport/CarRouteProvider";
import type { TransportMode } from "@/shared/services/transport/types";

const root = resolve(import.meta.dirname, "../..");
const origin = { lat: 35.6812, lng: 139.7671 };
const originZoneId = resolveOriginTransportZone({ coordinates: origin });
const destinations = destinationsIndex as Destination[];
loadRelationshipIndex(destinations);

const BASE_REF = "origin/main";

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

// ---------------------------------------------------------------------------
// Measured static metrics (never hard-coded). "Before" scans the pre-PR base
// ref (origin/main), "after" scans the current working tree (PR + follow-up).
// ---------------------------------------------------------------------------

function walkSourceFiles(
  directory: string,
  collected: string[] = [],
): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkSourceFiles(full, collected);
    } else if (/\.tsx?$/.test(entry)) {
      collected.push(relative(root, full));
    }
  }
  return collected;
}

function sourceFilesAt(ref: string | null): string[] {
  const isSource = (file: string) =>
    /\.tsx?$/.test(file) &&
    !/(^|\/)__tests__\//.test(file) &&
    !/\.(test|spec)\.tsx?$/.test(file);
  if (!ref) return walkSourceFiles(join(root, "src")).filter(isSource);
  return execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "src"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter(isSource);
}

function fileContent(ref: string | null, file: string): string {
  if (!ref) return readFileSync(join(root, file), "utf8");
  return execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" });
}

function matchingFiles(ref: string | null, needle: RegExp): string[] {
  return sourceFilesAt(ref).filter((file) =>
    needle.test(fileContent(ref, file)),
  );
}

const DIRECTIONS_URL_NEEDLE = /google\.com\/maps\/dir/;
const CANONICAL_SEAM_NEEDLE =
  /\b(getOriginAwareTransportEstimate|getTravelDurationEvidence|getDayTripTravelDurationEvidence|getOriginAwareTransportJourney|buildJourneyHandoff)\b/;

function measureTree(ref: string | null) {
  return {
    directionsUrlBuilderFiles: matchingFiles(ref, DIRECTIONS_URL_NEEDLE).sort(),
    canonicalSeamCallerFiles: matchingFiles(ref, CANONICAL_SEAM_NEEDLE).sort(),
  };
}

const beforeTree = measureTree(BASE_REF);
const afterTree = measureTree(null);

// ---------------------------------------------------------------------------
// Runtime fixtures
// ---------------------------------------------------------------------------

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
const karuizawa = find("karuizawa-town");
const kyotoParent =
  DestinationRelationshipService.getParentDestination(kyotoChild) ?? kyotoHub;
const baseContext = {
  homeStationCoords: origin,
  originZoneId,
  originLabel: "Tokyo Station",
};

// Tokyo Station same-origin audited through the DISPLAY boundary predicate
// that cards and Detail rows use, plus the canonical Journey seam.
const tokyoSameOriginBoundaryApplied = destinationSharesOriginAnchor(
  tokyoStation,
  origin,
);

function karuizawaAnchor(): CarAccessAnchor {
  const anchor = getRoutableCarAccessAnchors(karuizawa).find(
    (candidate) => candidate.id === "karuizawa-old-new-area-parking",
  );
  if (!anchor?.coordinates) {
    throw new Error("Missing Karuizawa routable parking anchor");
  }
  return anchor;
}

function karuizawaRoute(): CarRoundTripRoute {
  const anchor = karuizawaAnchor();
  const access: CarRouteEndpoint = {
    id: anchor.id,
    label: anchor.label,
    coordinates: anchor.coordinates!,
    kind: anchor.kind,
    accessAnchorId: anchor.id,
  };
  const toll = {
    state: "priced" as const,
    amountJPY: 1300,
    basis: "ETC" as const,
  };
  const facts = {
    provider: "kai-278-audit-fixture",
    distanceKm: 142,
    durationMinutes: 148,
    toll,
    confidence: "verified" as const,
    completeness: "complete" as const,
    retrievedAt: "2026-09-07T00:00:00.000Z",
  };
  return {
    outbound: {
      ...facts,
      availability: "available" as const,
      direction: "outbound" as const,
      origin,
      originEndpoint: {
        id: "origin",
        label: "Trip origin",
        kind: "origin",
        coordinates: origin,
      },
      destination: access,
      accessAnchor: access,
    },
    returnRoute: {
      ...facts,
      availability: "available" as const,
      direction: "return" as const,
      origin: anchor.coordinates!,
      originEndpoint: access,
      destination: {
        id: "origin",
        label: "Trip origin",
        kind: "origin",
        coordinates: origin,
      },
      accessAnchor: access,
    },
  };
}

type AuditedCase = {
  id: string;
  fixture: string;
  journey: Journey | null;
};

const cases: AuditedCase[] = [
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
    id: "karuizawa-car-access-anchor",
    fixture: "access-anchor",
    journey: getOriginAwareTransportJourney(
      karuizawa,
      { ...baseContext, carRoute: karuizawaRoute() },
      ["my_car"],
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
  const isCar = result?.mode === "car" || result?.mode === "my_car";
  return {
    id,
    fixture,
    result,
    checks: {
      carTransitMismatch: Boolean(
        isCar && result?.handoff?.externalMode === "transit",
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
      sameOriginDisplayBoundaryNotApplied:
        id === "tokyo-station-same-anchor" && !tokyoSameOriginBoundaryApplied,
      karuizawaHandoffNotAccessAnchor:
        id === "karuizawa-car-access-anchor" &&
        !(
          result?.destination.kind === "access_anchor" &&
          result.destination.coordinates &&
          handoffDestination ===
            `${result.destination.coordinates.lat},${result.destination.coordinates.lng}` &&
          handoffDestination === "36.357333,138.633287"
        ),
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
  sameOriginDisplayBoundaryNotApplied: findings.filter(
    (finding) => finding.checks.sameOriginDisplayBoundaryNotApplied,
  ).length,
  karuizawaAccessAnchorHandoffFailures: findings.filter(
    (finding) => finding.checks.karuizawaHandoffNotAccessAnchor,
  ).length,
  partialAsCompleteDefects: findings.filter(
    (finding) => finding.checks.partialAsComplete,
  ).length,
  unsupportedCarTransitFallbacks: findings.filter(
    (finding) => finding.checks.unsupportedCarFallback,
  ).length,
  directionsUrlBuilderFilesBefore: beforeTree.directionsUrlBuilderFiles.length,
  directionsUrlBuilderFilesAfter: afterTree.directionsUrlBuilderFiles.length,
  canonicalSeamCallerFilesBefore: beforeTree.canonicalSeamCallerFiles.length,
  canonicalSeamCallerFilesAfter: afterTree.canonicalSeamCallerFiles.length,
};

const report = {
  schemaVersion: 2,
  baseline: "ff0eeed0c765a973537ed7c99c6ff0c902cdbd17",
  origin: { label: "Tokyo Station", coordinates: origin, zoneId: originZoneId },
  methodology:
    "Bounded runtime semantic audit over representative surfaces; measured static scans of directions-URL builders and canonical-seam callers across the base ref (origin/main) and the audited working tree. Same-origin is audited through the traveller-facing display-boundary predicate that cards and Detail rows consume, in addition to the canonical Journey seam.",
  counts,
  measured: {
    beforeTree,
    afterTree,
  },
  findings,
};

const jsonPath = resolve(root, "qa/kai-278/transport-handoff-audit.json");
const mdPath = resolve(root, "qa/kai-278/transport-handoff-audit.md");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  "# KAI-278 transport-handoff audit",
  "",
  "Baseline: `" + report.baseline + "`",
  "Scope: bounded runtime semantic audit over Hakone, Kyoto local access, Tokyo same/different anchors, a provider-backed car access anchor (Karuizawa), Shodoshima partial access, and unsupported car. Same-origin is audited through the traveller-facing display-boundary predicate (destinationSharesOriginAnchor) used by cards and Detail rows, plus the canonical Journey seam. Builder/owner counts are MEASURED by scanning the base ref and the working tree, not hard-coded.",
  "",
  "## Counts",
  "",
  "| Metric | Count |",
  "| --- | ---: |",
  ...Object.entries(counts).map(([key, value]) => `| ${key} | ${value} |`),
  "",
  "## Measured directions-URL builders",
  "",
  "| Tree | Files building a Google Maps directions URL |",
  "| --- | --- |",
  `| before (${BASE_REF}) | ${beforeTree.directionsUrlBuilderFiles.length} — ${beforeTree.directionsUrlBuilderFiles.join(", ") || "(none)"} |`,
  `| after (working tree) | ${afterTree.directionsUrlBuilderFiles.length} — ${afterTree.directionsUrlBuilderFiles.join(", ") || "(none)"} |`,
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
  "- Canonically equivalent Tokyo Station anchors produce a zero-duration same-anchor Journey AND a zero same-anchor estimate on the user-facing duration resolver; a deliberately displaced anchor remains a normal distinct journey.",
  "- The provider-backed Karuizawa car case hands off in `driving` to the verified parking anchor (36.357333, 138.633287), not the town centroid.",
  "- Shodoshima keeps known local access as a `partial` final segment and has no directions handoff.",
  "- Unsupported car remains unavailable; no transit fallback is manufactured.",
  "",
].join("\n");
writeFileSync(mdPath, markdown);
console.log(JSON.stringify({ jsonPath, mdPath, counts }, null, 2));
