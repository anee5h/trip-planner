import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Journey, JourneyCost, JourneyLeg } from "@/shared/types/journey";
import * as directRouter from "../scheduledJourneyRouter";
import type {
  ScheduledJourneyEvidence,
  ScheduledJourneyInconclusiveReason,
  ScheduledJourneyNoMatchReason,
  ScheduledJourneyRouteResult,
} from "../scheduledJourneyRouter";
import * as transferRouter from "../oneTransferScheduledJourneyRouter";
import type {
  OneTransferScheduledJourneyInconclusiveReason,
  OneTransferScheduledJourneyLegEvidence,
  OneTransferScheduledJourneyResult,
  OneTransferTransferBasis,
} from "../oneTransferScheduledJourneyRouter";
import { contentHashOf } from "../odptRailTopologyImporter";
import type {
  NormalizedTransitGraph,
  TransitCoverageReport,
} from "../transitGraphTypes";
import {
  routeBestScheduledJourney,
  type RouteBestScheduledJourneyInput,
} from "../scheduledJourneyComposer";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/normalizedRailTopologyGolden.json",
);
const B1_HASH =
  "3927744492233315628ea4031b8ea526dbf56d3146b406f4406a8af81192b547";

const GRAPH = {
  datasetVersion: {
    datasetId: "synthetic-dataset",
    contentHash: "synthetic-hash",
  },
} as unknown as NormalizedTransitGraph;
const COVERAGE = {} as TransitCoverageReport;
const INPUT: RouteBestScheduledJourneyInput = {
  graph: GRAPH,
  coverage: COVERAGE,
  originStopId: "origin",
  destinationStopId: "destination",
  serviceDate: "2026-04-01",
  earliestDepartureServiceSeconds: 0,
};

const COST: JourneyCost = {
  currency: "JPY",
  representation: null,
  state: "unknown",
  evidence: "unknown",
  scope: "unknown",
  completeness: "unknown",
  basis: "unknown",
};

function makeLeg(index: number): JourneyLeg {
  return {
    mode: index % 2 === 0 ? "train" : "bus",
    direction: "one_way",
    origin: { id: `origin-${index}`, kind: "origin" },
    destination: { id: `destination-${index}`, kind: "destination" },
    duration: { minutes: [10, 10], evidence: "verified", source: "test" },
    cost: COST,
    availability: "available",
    confidence: "high",
    provenance: {
      source: "test",
      confidence: "high",
      duration: "verified",
      cost: "unknown",
    },
  };
}

function makeJourney(confidence: Journey["confidence"], legCount = 1): Journey {
  return {
    kind: "journey",
    origin: { id: "origin", kind: "origin" },
    destination: { id: "destination", kind: "destination" },
    scope: "complete_journey",
    directionality: legCount === 2 ? "multi_leg" : "one_way",
    completeness: "complete",
    externalHandoff: { supported: false, reason: "unsupported_mode" },
    legs: Array.from({ length: legCount }, (_, index) => makeLeg(index)),
    availability: "available",
    confidence,
    provenance: {
      source: "test",
      confidence,
      duration: "verified",
      cost: "unknown",
    },
  };
}

function directEvidence(
  departure: number,
  arrival: number,
): ScheduledJourneyEvidence {
  return {
    source: "gtfs_scheduled_timetable",
    provider: "gtfs",
    serviceDate: INPUT.serviceDate,
    calendarReason: "base_weekday",
    calendarId: "calendar",
    providerCalendarId: "calendar",
    serviceId: "direct-service",
    providerServiceId: "direct-service",
    routeId: "direct-route",
    providerRouteId: "direct-route",
    patternId: "direct-pattern",
    operatorId: "operator",
    providerOperatorId: "operator",
    routeName: "Direct",
    scheduledDepartureServiceSeconds: departure,
    scheduledArrivalServiceSeconds: arrival,
    durationServiceSeconds: arrival - departure,
    scheduledDepartureTime: "08:00:00",
    scheduledArrivalTime: "09:00:00",
    transferCount: 0,
    coverageState: "imported",
    topologyCoverageState: "imported",
    datasetId: GRAPH.datasetVersion.datasetId,
    contentHash: GRAPH.datasetVersion.contentHash,
    sourceType: "fixture",
    completeness: "fixture_subset",
    retrievedAt: "2026-04-01T00:00:00.000Z",
    checkedAt: "2026-04-01T00:00:00.000Z",
    boardingRequiresArrangement: false,
    alightingRequiresArrangement: false,
  };
}

function directVerified(
  departure = 100,
  arrival = 500,
  confidence: Journey["confidence"] = "high",
): Extract<ScheduledJourneyRouteResult, { kind: "verified" }> {
  return {
    kind: "verified",
    journey: makeJourney(confidence),
    evidence: directEvidence(departure, arrival),
    durationSeconds: arrival - departure,
  };
}

function directNoMatch(
  reason: ScheduledJourneyNoMatchReason = "no_direct_service",
): Extract<ScheduledJourneyRouteResult, { kind: "no_match" }> {
  return { kind: "no_match", reason, notes: [] };
}

function directInconclusive(
  reason: ScheduledJourneyInconclusiveReason = "invalid_service_date",
): Extract<ScheduledJourneyRouteResult, { kind: "inconclusive" }> {
  return { kind: "inconclusive", reason, notes: [] };
}

function transferLegEvidence(
  serviceId: string,
  departure: number,
  arrival: number,
): OneTransferScheduledJourneyLegEvidence {
  return {
    provider: "gtfs",
    serviceDate: INPUT.serviceDate,
    calendarReason: "base_weekday",
    calendarId: "calendar",
    providerCalendarId: "calendar",
    serviceId,
    providerServiceId: serviceId,
    routeId: `${serviceId}-route`,
    providerRouteId: `${serviceId}-route`,
    patternId: `${serviceId}-pattern`,
    operatorId: "operator",
    providerOperatorId: "operator",
    routeName: serviceId,
    scheduledDepartureServiceSeconds: departure,
    scheduledArrivalServiceSeconds: arrival,
    durationServiceSeconds: arrival - departure,
    scheduledDepartureTime: "08:00:00",
    scheduledArrivalTime: "09:00:00",
    boardingRequiresArrangement: false,
    alightingRequiresArrangement: false,
    coverageState: "imported",
    topologyCoverageState: "imported",
    timetableCoverageState: "imported",
  };
}

function transferVerified(
  firstDeparture = 100,
  finalArrival = 700,
  confidence: Journey["confidence"] = "high",
  transferBasis: OneTransferTransferBasis = "meguruto_same_stop_policy",
  requiredTransferSeconds: number | null = transferBasis ===
  "meguruto_same_stop_policy"
    ? 300
    : null,
): Extract<OneTransferScheduledJourneyResult, { kind: "verified" }> {
  const firstArrival = firstDeparture + 300;
  const secondDeparture = firstArrival + 300;
  return {
    kind: "verified",
    journey: makeJourney(confidence, 2),
    evidence: {
      source: "gtfs_scheduled_timetable",
      provider: "gtfs",
      serviceDate: INPUT.serviceDate,
      transferCount: 1,
      firstServiceId: "first-service",
      secondServiceId: "second-service",
      transferFromStopId: "transfer-from",
      transferToStopId: "transfer-to",
      incomingArrivalServiceSeconds: firstArrival,
      outgoingDepartureServiceSeconds: secondDeparture,
      transferWaitSeconds: secondDeparture - firstArrival,
      requiredTransferSeconds,
      transferBasis,
      coverageState: "imported",
      firstCoverageState: "imported",
      secondCoverageState: "imported",
      topologyCoverageState: "imported",
      timetableCoverageState: "imported",
      totalDurationSeconds: finalArrival - firstDeparture,
      datasetId: GRAPH.datasetVersion.datasetId,
      contentHash: GRAPH.datasetVersion.contentHash,
      sourceType: "fixture",
      completeness: "fixture_subset",
      retrievedAt: "2026-04-01T00:00:00.000Z",
      checkedAt: "2026-04-01T00:00:00.000Z",
      firstLeg: transferLegEvidence(
        "first-service",
        firstDeparture,
        firstArrival,
      ),
      secondLeg: transferLegEvidence(
        "second-service",
        secondDeparture,
        finalArrival,
      ),
    },
    durationSeconds: finalArrival - firstDeparture,
    totalDurationSeconds: finalArrival - firstDeparture,
  };
}

function transferNoMatch(): Extract<
  OneTransferScheduledJourneyResult,
  { kind: "no_match" }
> {
  return {
    kind: "no_match",
    reason: "no_one_transfer_service",
    notes: [],
  };
}

function transferInconclusive(
  reason: OneTransferScheduledJourneyInconclusiveReason = "invalid_service_date",
): Extract<OneTransferScheduledJourneyResult, { kind: "inconclusive" }> {
  return { kind: "inconclusive", reason, notes: [] };
}

function stub(
  direct: ScheduledJourneyRouteResult,
  transfer: OneTransferScheduledJourneyResult,
): void {
  vi.spyOn(directRouter, "routeDirectScheduledJourney").mockReturnValue(direct);
  vi.spyOn(transferRouter, "routeOneTransferScheduledJourney").mockReturnValue(
    transfer,
  );
}

function verified(result: ReturnType<typeof routeBestScheduledJourney>) {
  expect(result.kind).toBe("verified");
  if (result.kind !== "verified") throw new Error("expected verified result");
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("KAI-292C1 scheduled journey composer", () => {
  it("selects direct when only direct routing verifies", () => {
    const direct = directVerified();
    stub(direct, transferNoMatch());

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.journey).toBe(direct.journey);
    expect(result.selected).toBe("direct");
    expect(result.transferCount).toBe(0);
    expect(result.evidence).toMatchObject({
      selectionReason: "only_verified_candidate",
      directAttempt: { kind: "verified" },
      oneTransferAttempt: {
        kind: "no_match",
        reason: "no_one_transfer_service",
      },
      initialDepartureServiceSeconds: 100,
      finalArrivalServiceSeconds: 500,
      totalDurationSeconds: 400,
    });
    expect(directRouter.routeDirectScheduledJourney).toHaveBeenCalledTimes(1);
    expect(
      transferRouter.routeOneTransferScheduledJourney,
    ).toHaveBeenCalledTimes(1);
    expect(directRouter.routeDirectScheduledJourney).toHaveBeenCalledWith(
      INPUT,
    );
    expect(
      transferRouter.routeOneTransferScheduledJourney,
    ).toHaveBeenCalledWith(INPUT);
  });

  it("selects one_transfer when only one-transfer routing verifies", () => {
    const transfer = transferVerified();
    stub(directNoMatch(), transfer);

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.journey).toBe(transfer.journey);
    expect(result.selected).toBe("one_transfer");
    expect(result.transferCount).toBe(1);
    expect(result.evidence).toMatchObject({
      initialDepartureServiceSeconds: 100,
      finalArrivalServiceSeconds: 700,
      totalDurationSeconds: 600,
    });
  });

  it("prefers direct when its final arrival is earlier", () => {
    stub(directVerified(100, 500), transferVerified(100, 700));
    expect(
      verified(routeBestScheduledJourney(INPUT)).evidence.selectionReason,
    ).toBe("earlier_final_arrival");
  });

  it("prefers one_transfer when its final arrival is earlier", () => {
    stub(directVerified(100, 800), transferVerified(100, 700));
    const result = verified(routeBestScheduledJourney(INPUT));
    expect(result.selected).toBe("one_transfer");
    expect(result.evidence.selectionReason).toBe("earlier_final_arrival");
  });

  it("prefers fewer transfers when final arrival is equal", () => {
    stub(directVerified(200, 700), transferVerified(100, 700));
    const result = verified(routeBestScheduledJourney(INPUT));
    expect(result.selected).toBe("direct");
    expect(result.evidence.selectionReason).toBe("fewer_transfers");
  });

  it("keeps deterministic absolute-time ordering across repeated calls", () => {
    const direct = directVerified(200, 700);
    const transfer = transferVerified(100, 700);
    stub(direct, transfer);
    const first = verified(routeBestScheduledJourney(INPUT));
    vi.restoreAllMocks();
    stub(direct, transfer);
    const second = verified(routeBestScheduledJourney(INPUT));
    expect(first.selected).toBe(second.selected);
    expect(first.evidence).toEqual(second.evidence);
  });

  it("returns verified direct when the transfer alternative is inconclusive", () => {
    const direct = directVerified();
    stub(direct, transferInconclusive("transfer_coverage_untrusted"));

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.journey).toBe(direct.journey);
    expect(result.selected).toBe("direct");
    expect(result.evidence.oneTransferAttempt).toEqual({
      kind: "inconclusive",
      reason: "transfer_coverage_untrusted",
    });
  });

  it("returns verified one_transfer when direct routing is inconclusive", () => {
    const transfer = transferVerified();
    stub(directInconclusive("partial_timetable"), transfer);

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.journey).toBe(transfer.journey);
    expect(result.selected).toBe("one_transfer");
    expect(result.evidence.directAttempt).toEqual({
      kind: "inconclusive",
      reason: "partial_timetable",
    });
  });

  it("returns inconclusive when no candidate verifies and one attempt is inconclusive", () => {
    stub(directNoMatch(), transferInconclusive("invalid_transfer_query"));

    const result = routeBestScheduledJourney(INPUT);

    expect(result).toMatchObject({
      kind: "inconclusive",
      reason: "no_verified_scheduled_journey",
      diagnostics: {
        directAttempt: { kind: "no_match", reason: "no_direct_service" },
        oneTransferAttempt: {
          kind: "inconclusive",
          reason: "invalid_transfer_query",
        },
      },
    });
  });

  it("returns no_match when both strategies return no_match", () => {
    stub(directNoMatch(), transferNoMatch());

    expect(routeBestScheduledJourney(INPUT)).toMatchObject({
      kind: "no_match",
      reason: "no_scheduled_journey",
      diagnostics: {
        directAttempt: { kind: "no_match", reason: "no_direct_service" },
        oneTransferAttempt: {
          kind: "no_match",
          reason: "no_one_transfer_service",
        },
      },
    });
  });

  it("preserves invalid service-date and earliest-departure inconclusive attempts", () => {
    stub(
      directInconclusive("invalid_service_date"),
      transferInconclusive("invalid_service_date"),
    );
    expect(routeBestScheduledJourney(INPUT)).toMatchObject({
      kind: "inconclusive",
      diagnostics: {
        directAttempt: { reason: "invalid_service_date" },
        oneTransferAttempt: { reason: "invalid_service_date" },
      },
    });

    stub(
      directInconclusive("invalid_earliest_departure"),
      transferInconclusive("invalid_earliest_departure"),
    );
    expect(routeBestScheduledJourney(INPUT)).toMatchObject({
      kind: "inconclusive",
      diagnostics: {
        directAttempt: { reason: "invalid_earliest_departure" },
        oneTransferAttempt: { reason: "invalid_earliest_departure" },
      },
    });
  });

  it("compares after-midnight service seconds without wrapping at 24:00", () => {
    const direct = directVerified(86_340, 87_000);
    const transfer = transferVerified(86_280, 86_940);
    stub(direct, transfer);

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.selected).toBe("one_transfer");
    expect(result.evidence).toMatchObject({
      initialDepartureServiceSeconds: 86_280,
      finalArrivalServiceSeconds: 86_940,
      totalDurationSeconds: 660,
    });
  });

  it("preserves medium confidence for the only Meguruto-policy candidate", () => {
    const transfer = transferVerified(
      100,
      700,
      "medium",
      "meguruto_same_stop_policy",
      300,
    );
    stub(directNoMatch(), transfer);

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.journey).toBe(transfer.journey);
    expect(result.journey.confidence).toBe("medium");
    expect(result.journey.provenance.confidence).toBe("medium");
  });

  it("preserves high confidence for provider minimum and timed candidates", () => {
    const minimum = transferVerified(100, 700, "high", "gtfs_minimum", 120);
    stub(directNoMatch(), minimum);
    expect(verified(routeBestScheduledJourney(INPUT)).journey.confidence).toBe(
      "high",
    );

    const timed = transferVerified(100, 700, "high", "gtfs_timed", null);
    stub(directNoMatch(), timed);
    const timedResult = verified(routeBestScheduledJourney(INPUT));
    expect(timedResult.journey.confidence).toBe("high");
    expect(timedResult.journey.provenance.confidence).toBe("high");
    expect(timed.journey.legs.every((leg) => leg.confidence === "high")).toBe(
      true,
    );
  });

  it("keeps direct high confidence ahead of medium transfer at equal arrival", () => {
    const direct = directVerified(100, 700, "high");
    const transfer = transferVerified(100, 700, "medium");
    stub(direct, transfer);
    expect(verified(routeBestScheduledJourney(INPUT)).selected).toBe("direct");
  });

  it("leaves unknown costs and the selected Journey untouched", () => {
    const direct = directVerified();
    stub(direct, transferNoMatch());

    const result = verified(routeBestScheduledJourney(INPUT));

    expect(result.journey).toBe(direct.journey);
    expect(result.journey.cost).toBeUndefined();
    expect(result.journey.legs[0]?.cost).toEqual(COST);
    expect(result.journey.legs[0]?.cost.representation).toBeNull();
  });

  it("does not mutate graph or coverage inputs", () => {
    const graphBefore = structuredClone(GRAPH);
    const coverageBefore = structuredClone(COVERAGE);
    stub(directVerified(), transferNoMatch());

    routeBestScheduledJourney(INPUT);

    expect(GRAPH).toEqual(graphBefore);
    expect(COVERAGE).toEqual(coverageBefore);
  });

  it("is insensitive to graph array order because composition delegates to both primitives", () => {
    const graph = {
      ...GRAPH,
      stops: [{ id: "b" }, { id: "a" }],
      routes: [{ id: "r2" }, { id: "r1" }],
    } as unknown as NormalizedTransitGraph;
    const input = { ...INPUT, graph };
    const direct = directVerified();
    stub(direct, transferNoMatch());
    const first = verified(routeBestScheduledJourney(input));
    vi.restoreAllMocks();
    stub(direct, transferNoMatch());
    const reversed = verified(
      routeBestScheduledJourney({
        ...input,
        graph: {
          ...graph,
          stops: [...graph.stops].reverse(),
          routes: [...graph.routes].reverse(),
        },
      }),
    );
    expect(first.selected).toBe(reversed.selected);
    expect(first.evidence).toEqual(reversed.evidence);
  });

  it("keeps the B1 normalized topology hash unchanged", () => {
    const golden = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
      graph: Parameters<typeof contentHashOf>[0];
    };
    expect(
      contentHashOf({
        operators: golden.graph.operators,
        stops: golden.graph.stops,
        routes: golden.graph.routes,
        routeStops: golden.graph.routeStops,
        calendars: golden.graph.calendars,
      }),
    ).toBe(B1_HASH);
  });
});
