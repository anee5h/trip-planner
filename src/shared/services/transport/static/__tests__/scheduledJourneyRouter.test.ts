import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { makeZip } from "../../../../../../scripts/transit/__tests__/fixtures/gtfsZipTestFixture";
import {
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "../../../../../../scripts/transit/gtfsFeedReader";
import {
  importGtfsSchedule,
  type GtfsScheduleMetadata,
} from "../gtfsScheduleImporter";
import {
  routeDirectScheduledJourney,
  type ScheduledJourneyRouteResult,
} from "../scheduledJourneyRouter";
import type { GtfsFeedTables, GtfsTableRow } from "../gtfsTypes";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../scripts/transit/__tests__/fixtures/gtfs-c1-fixture.json",
);

const METADATA: GtfsScheduleMetadata = {
  provider: "gtfs-jp",
  datasetId: "gtfs-jp-wakasa-fixture-v1",
  identityNamespace: "gtfs:fixture-wakasa",
  sourceDescriptor: "synthetic GTFS-JP fixture",
  sourceType: "fixture",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  checkedAt: "2026-09-11T00:00:00.000Z",
  completeness: "fixture_subset",
};

const COMPLETE_METADATA: GtfsScheduleMetadata = {
  ...METADATA,
  sourceType: "data_dump",
  completeness: "complete_provider_dump",
};

function loadTables(): GtfsFeedTables {
  const files = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<
    string,
    string
  >;
  return parseGtfsFeed(readBoundedGtfsZip(makeZip(Object.entries(files))));
}

function cloneTables(): GtfsFeedTables {
  return JSON.parse(JSON.stringify(loadTables())) as GtfsFeedTables;
}

function withRows(
  family: keyof GtfsFeedTables,
  transform: (rows: readonly GtfsTableRow[]) => readonly GtfsTableRow[],
): GtfsFeedTables {
  const tables = cloneTables();
  const rows = tables[family];
  if (!Array.isArray(rows))
    throw new Error(`fixture family ${family} is absent`);
  return { ...tables, [family]: transform(rows) } as GtfsFeedTables;
}

function withEarlierTrip(
  tables: GtfsFeedTables,
  tripId = "t0",
  departure = "07:50:00",
  arrival = "08:05:00",
): GtfsFeedTables {
  return {
    ...tables,
    trips: [
      ...tables.trips,
      {
        route_id: "r1",
        service_id: "weekday",
        trip_id: tripId,
        trip_headsign: "Earlier",
        direction_id: "0",
      },
    ],
    stopTimes: [
      ...tables.stopTimes,
      {
        trip_id: tripId,
        arrival_time: departure,
        departure_time: departure,
        stop_id: "A",
        stop_sequence: "1",
      },
      {
        trip_id: tripId,
        arrival_time: departure,
        departure_time: departure,
        stop_id: "B",
        stop_sequence: "2",
      },
      {
        trip_id: tripId,
        arrival_time: arrival,
        departure_time: arrival,
        stop_id: "C",
        stop_sequence: "3",
      },
    ],
  };
}

function imported(
  tables: GtfsFeedTables = loadTables(),
  metadata: GtfsScheduleMetadata = COMPLETE_METADATA,
) {
  return importGtfsSchedule(tables, metadata);
}

function onlyTrips(
  result: ReturnType<typeof imported>,
  tripIds: readonly string[],
): ReturnType<typeof imported> {
  const selected = new Set(tripIds);
  const services = result.graph.scheduledServices!.filter((service) =>
    selected.has(service.providerServiceId),
  );
  const serviceIds = new Set(services.map((service) => service.id));
  const selectedProviderServiceIds = new Set(
    services.map((service) => service.providerServiceId),
  );
  return {
    ...result,
    graph: {
      ...result.graph,
      routes: result.graph.routes.map((route) => {
        const semantics = route.sourceSemantics;
        if (!("patterns" in semantics)) return route;
        return {
          ...route,
          sourceSemantics: {
            ...semantics,
            patterns: semantics.patterns
              .map((pattern) => ({
                ...pattern,
                tripIds: pattern.tripIds.filter((tripId) =>
                  selectedProviderServiceIds.has(tripId),
                ),
              }))
              .filter((pattern) => pattern.tripIds.length > 0),
          },
        };
      }),
      scheduledServices: services,
      scheduledStopTimes: result.graph.scheduledStopTimes!.filter((fact) =>
        serviceIds.has(fact.serviceId),
      ),
    },
  };
}

function stopId(
  graph: ReturnType<typeof imported>["graph"],
  providerStopId: string,
): string {
  const stop = graph.stops.find(
    (candidate) => candidate.providerStopId === providerStopId,
  );
  if (stop === undefined) throw new Error(`stop ${providerStopId} missing`);
  return stop.id;
}

function query(
  result: ReturnType<typeof imported>,
  origin = "A",
  destination = "C",
  serviceDate = "2026-04-01",
  earliestDepartureServiceSeconds = 0,
): ScheduledJourneyRouteResult {
  return routeDirectScheduledJourney({
    graph: result.graph,
    coverage: result.coverage,
    originStopId: stopId(result.graph, origin),
    destinationStopId: stopId(result.graph, destination),
    serviceDate,
    earliestDepartureServiceSeconds,
  });
}

function verified(result: ScheduledJourneyRouteResult) {
  expect(result.kind).toBe("verified");
  if (result.kind !== "verified") throw new Error(`expected verified result`);
  return result;
}

describe("KAI-292A direct scheduled journey router", () => {
  it("maps an active direct service into one exact canonical Journey", () => {
    const result = verified(query(imported()));

    expect(result.journey).toMatchObject({
      kind: "journey",
      scope: "complete_journey",
      directionality: "one_way",
      completeness: "complete",
      availability: "available",
      confidence: "high",
    });
    expect(result.journey.legs).toHaveLength(1);
    expect(result.journey.legs[0]).toMatchObject({
      mode: "bus",
      direction: "one_way",
      availability: "available",
      confidence: "high",
      duration: {
        minutes: [10, 10],
        evidence: "verified",
      },
      cost: {
        representation: null,
        state: "unknown",
        evidence: "unknown",
        completeness: "unknown",
      },
      routeMetadata: {
        source: "gtfs_scheduled_timetable",
        operator: "a1",
        serviceName: "R1",
      },
    });
    expect(result.evidence).toMatchObject({
      provider: "gtfs-jp",
      providerServiceId: "t1",
      providerRouteId: "r1",
      scheduledDepartureServiceSeconds: 28800,
      scheduledArrivalServiceSeconds: 29400,
      durationServiceSeconds: 600,
      transferCount: 0,
      coverageState: "imported",
      calendarReason: "base_weekday",
      completeness: "complete_provider_dump",
    });
  });

  it("selects earliest arrival, then earlier departure, then provider trip id", () => {
    const earliestArrival = verified(
      query(
        imported(withEarlierTrip(cloneTables(), "t0", "07:50:00", "08:05:00")),
      ),
    );
    expect(earliestArrival.evidence.providerServiceId).toBe("t0");

    const equalArrival = verified(
      query(
        imported(withEarlierTrip(cloneTables(), "t0", "07:59:00", "08:10:00")),
      ),
    );
    expect(equalArrival.evidence.providerServiceId).toBe("t0");

    const equalAll = verified(
      query(
        imported(withEarlierTrip(cloneTables(), "t00", "08:00:00", "08:10:00")),
      ),
    );
    expect(equalAll.evidence.providerServiceId).toBe("t00");
  });

  it("rejects a reverse request when the active service only runs forward", () => {
    const result = query(imported(), "C", "A", "2026-04-04");
    expect(result).toMatchObject({
      kind: "no_match",
      reason: "destination_before_origin",
    });
  });

  it("defines same-stop input as no transit journey", () => {
    expect(query(imported(), "A", "A")).toMatchObject({
      kind: "no_match",
      reason: "origin_equals_destination",
    });
  });

  it("reports an inactive weekday without inventing a route", () => {
    expect(query(imported(), "B", "C", "2026-04-04")).toMatchObject({
      kind: "no_match",
      reason: "inactive_service",
    });
  });

  it("uses an added calendar exception", () => {
    const result = verified(
      query(onlyTrips(imported(), ["t3"]), "A", "C", "2026-04-06"),
    );
    expect(result.evidence).toMatchObject({
      providerServiceId: "t3",
      calendarReason: "exception_added",
    });
  });

  it("uses a removed calendar exception to make the service unavailable", () => {
    expect(query(imported(), "A", "B", "2026-04-02")).toMatchObject({
      kind: "no_match",
      reason: "inactive_service",
    });
  });

  it("routes an exception-only service on its exact date", () => {
    const result = verified(
      query(onlyTrips(imported(), ["t4"]), "A", "C", "2026-04-10"),
    );
    expect(result.evidence).toMatchObject({
      providerServiceId: "t4",
      calendarReason: "exception_added",
      scheduledDepartureServiceSeconds: 86400,
      scheduledArrivalServiceSeconds: 87000,
      durationServiceSeconds: 600,
      scheduledDepartureTime: "24:00:00",
      scheduledArrivalTime: "24:10:00",
    });
  });

  it("applies the absolute service-day departure threshold", () => {
    const tables = withEarlierTrip(cloneTables(), "t0", "08:30:00", "08:40:00");
    expect(
      query(imported(tables), "A", "C", "2026-04-01", 8 * 3600 + 1),
    ).toMatchObject({
      kind: "verified",
      evidence: { providerServiceId: "t0" },
    });
    expect(
      query(imported(tables), "A", "C", "2026-04-01", 8 * 3600 + 41 * 60),
    ).toMatchObject({
      kind: "no_match",
      reason: "departure_window_miss",
    });
  });

  it("fails closed when required endpoint timing is missing", () => {
    const missingOrigin = imported();
    const missingOriginGraph = {
      ...missingOrigin.graph,
      scheduledStopTimes: missingOrigin.graph.scheduledStopTimes,
    };
    const t1 = missingOrigin.graph.scheduledServices!.find(
      (service) => service.providerServiceId === "t1",
    )!;
    const alteredOrigin = {
      ...missingOriginGraph,
      scheduledStopTimes: missingOrigin.graph.scheduledStopTimes!.map((fact) =>
        fact.serviceId === t1.id &&
        fact.stopId === stopId(missingOrigin.graph, "A")
          ? { ...fact, departureServiceSeconds: null }
          : fact,
      ),
    };
    expect(
      routeDirectScheduledJourney({
        graph: alteredOrigin,
        coverage: missingOrigin.coverage,
        originStopId: stopId(alteredOrigin, "A"),
        destinationStopId: stopId(alteredOrigin, "C"),
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({ kind: "no_match", reason: "missing_origin_departure" });

    const destination = imported();
    const service = destination.graph.scheduledServices!.find(
      (candidate) => candidate.providerServiceId === "t1",
    )!;
    const alteredDestination = {
      ...destination.graph,
      scheduledStopTimes: destination.graph.scheduledStopTimes!.map((fact) =>
        fact.serviceId === service.id &&
        fact.stopId === stopId(destination.graph, "C")
          ? { ...fact, arrivalServiceSeconds: null }
          : fact,
      ),
    };
    expect(
      routeDirectScheduledJourney({
        graph: alteredDestination,
        coverage: destination.coverage,
        originStopId: stopId(alteredDestination, "A"),
        destinationStopId: stopId(alteredDestination, "C"),
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({
      kind: "no_match",
      reason: "missing_destination_arrival",
    });
  });

  it("does not return a complete Journey for partial timetable coverage", () => {
    expect(query(imported(loadTables(), METADATA))).toMatchObject({
      kind: "inconclusive",
      reason: "partial_timetable",
    });
    expect(query(imported(loadTables(), METADATA), "C", "A")).toMatchObject({
      kind: "inconclusive",
      reason: "partial_timetable",
    });
  });

  it("fails closed for missing, mismatched, and duplicate coverage evidence", () => {
    const source = imported();
    const originStopId = stopId(source.graph, "A");
    const destinationStopId = stopId(source.graph, "C");
    const input = {
      graph: source.graph,
      originStopId,
      destinationStopId,
      serviceDate: "2026-04-01",
      earliestDepartureServiceSeconds: 0,
    };
    expect(
      routeDirectScheduledJourney({ ...input, coverage: undefined }),
    ).toMatchObject({ kind: "inconclusive", reason: "unsupported_coverage" });

    const mismatchedCoverage = {
      ...source.coverage,
      datasetId: "mismatched-dataset",
      entries: source.coverage.entries.map((entry) => ({
        ...entry,
        datasetId: "mismatched-dataset",
      })),
    };
    expect(
      routeDirectScheduledJourney({ ...input, coverage: mismatchedCoverage }),
    ).toMatchObject({ kind: "inconclusive", reason: "unsupported_coverage" });

    const entry = source.coverage.entries[0];
    if (entry === undefined) throw new Error("expected fixture coverage entry");
    const duplicateCoverage = {
      ...source.coverage,
      entries: [entry, { ...entry, timetable: "partial" as const }],
    };
    const reversedDuplicateCoverage = {
      ...duplicateCoverage,
      entries: [...duplicateCoverage.entries].reverse(),
    };
    const duplicateResult = routeDirectScheduledJourney({
      ...input,
      coverage: duplicateCoverage,
    });
    const reversedResult = routeDirectScheduledJourney({
      ...input,
      coverage: reversedDuplicateCoverage,
    });
    expect(duplicateResult).toMatchObject({
      kind: "inconclusive",
      reason: "unsupported_coverage",
    });
    expect(reversedResult).toEqual(duplicateResult);
  });

  it("fails closed for a broken route reference", () => {
    const source = imported();
    const t1 = source.graph.scheduledServices!.find(
      (service) => service.providerServiceId === "t1",
    )!;
    const graph = {
      ...source.graph,
      scheduledServices: source.graph.scheduledServices!.map((service) =>
        service.id === t1.id
          ? { ...service, routeId: "missing-route" }
          : service,
      ),
    };
    expect(
      routeDirectScheduledJourney({
        graph,
        coverage: source.coverage,
        originStopId: stopId(graph, "A"),
        destinationStopId: stopId(graph, "B"),
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({ kind: "inconclusive", reason: "broken_graph_reference" });
  });

  it("fails closed for non-contiguous scheduled stop order", () => {
    const source = imported();
    const service = source.graph.scheduledServices!.find(
      (candidate) => candidate.providerServiceId === "t1",
    )!;
    const graph = {
      ...source.graph,
      scheduledStopTimes: source.graph.scheduledStopTimes!.map((fact) =>
        fact.serviceId === service.id && fact.order === 3
          ? { ...fact, order: 4 }
          : fact,
      ),
      routeStops: source.graph.routeStops.map((membership) =>
        membership.routeId === service.routeId &&
        membership.patternId === service.patternId &&
        membership.order === 3
          ? { ...membership, order: 4 }
          : membership,
      ),
    };
    expect(
      routeDirectScheduledJourney({
        graph,
        coverage: source.coverage,
        originStopId: stopId(graph, "A"),
        destinationStopId: stopId(graph, "C"),
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({ kind: "inconclusive", reason: "broken_graph_reference" });
  });

  it("fails closed when a scheduled fact omits source semantics", () => {
    const source = imported();
    const service = source.graph.scheduledServices!.find(
      (candidate) => candidate.providerServiceId === "t1",
    )!;
    const graph = {
      ...source.graph,
      scheduledStopTimes: source.graph.scheduledStopTimes!.map((fact) =>
        fact.serviceId === service.id && fact.order === 1
          ? { ...fact, sourceSemantics: undefined as never }
          : fact,
      ),
    };
    expect(
      routeDirectScheduledJourney({
        graph,
        coverage: source.coverage,
        originStopId: stopId(graph, "A"),
        destinationStopId: stopId(graph, "C"),
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({ kind: "inconclusive", reason: "broken_graph_reference" });
  });

  it("fails closed when a scheduled fact references another provider's stop", () => {
    const source = imported();
    const service = source.graph.scheduledServices!.find(
      (candidate) => candidate.providerServiceId === "t1",
    )!;
    const origin = stopId(source.graph, "A");
    const graph = {
      ...source.graph,
      stops: source.graph.stops.map((stop) =>
        stop.id === origin ? { ...stop, provider: "gtfs" as const } : stop,
      ),
      scheduledStopTimes: source.graph.scheduledStopTimes!.map((fact) =>
        fact.serviceId === service.id && fact.stopId === origin
          ? { ...fact }
          : fact,
      ),
    };
    expect(
      routeDirectScheduledJourney({
        graph,
        coverage: source.coverage,
        originStopId: origin,
        destinationStopId: stopId(graph, "C"),
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({ kind: "inconclusive", reason: "broken_graph_reference" });
  });

  it("treats null, blank, and zero endpoint restrictions as regular", () => {
    const regularCases = [
      { label: "null", result: imported() },
      {
        label: "blank",
        result: imported(
          withRows("stopTimes", (rows) =>
            rows.map((row) =>
              row.trip_id === "t1" &&
              (row.stop_id === "A" || row.stop_id === "C")
                ? { ...row, pickup_type: "", drop_off_type: "" }
                : row,
            ),
          ),
        ),
      },
      {
        label: "zero",
        result: imported(
          withRows("stopTimes", (rows) =>
            rows.map((row) =>
              row.trip_id === "t1" &&
              (row.stop_id === "A" || row.stop_id === "C")
                ? { ...row, pickup_type: "0", drop_off_type: "0" }
                : row,
            ),
          ),
        ),
      },
    ];
    for (const testCase of regularCases) {
      const result = verified(query(testCase.result, "A", "C"));
      expect(result.evidence.boardingRequiresArrangement).toBe(false);
      expect(result.evidence.alightingRequiresArrangement).toBe(false);
      expect(result.journey.legs[0]?.routeMetadata?.reservationRequired).toBe(
        undefined,
      );
    }
  });

  it("rejects explicit no-pickup and no-drop-off endpoint facts", () => {
    const cases = [
      {
        label: "pickup",
        field: "pickup_type",
        stop: "A",
        reason: "pickup_prohibited",
      },
      {
        label: "drop-off",
        field: "drop_off_type",
        stop: "C",
        reason: "dropoff_prohibited",
      },
    ] as const;
    for (const testCase of cases) {
      const result = imported(
        withRows("stopTimes", (rows) =>
          rows.map((row) =>
            row.trip_id === "t1" && row.stop_id === testCase.stop
              ? { ...row, [testCase.field]: "1" }
              : row,
          ),
        ),
      );
      expect(query(result, "A", "C")).toMatchObject({
        kind: "inconclusive",
        reason: testCase.reason,
      });
    }
  });

  it("retains arrangement evidence without claiming reservation is required", () => {
    const cases = [
      {
        label: "pickup 2",
        stop: "A",
        field: "pickup_type",
        value: "2",
        evidence: "boardingRequiresArrangement",
      },
      {
        label: "drop-off 2",
        stop: "C",
        field: "drop_off_type",
        value: "2",
        evidence: "alightingRequiresArrangement",
      },
      {
        label: "pickup 3",
        stop: "A",
        field: "pickup_type",
        value: "3",
        evidence: "boardingRequiresArrangement",
      },
      {
        label: "drop-off 3",
        stop: "C",
        field: "drop_off_type",
        value: "3",
        evidence: "alightingRequiresArrangement",
      },
    ] as const;
    for (const testCase of cases) {
      const result = verified(
        query(
          imported(
            withRows("stopTimes", (rows) =>
              rows.map((row) =>
                row.trip_id === "t1" && row.stop_id === testCase.stop
                  ? { ...row, [testCase.field]: testCase.value }
                  : row,
              ),
            ),
          ),
          "A",
          "C",
        ),
      );
      const arrangementEvidence =
        testCase.evidence === "boardingRequiresArrangement"
          ? result.evidence.boardingRequiresArrangement
          : result.evidence.alightingRequiresArrangement;
      expect(arrangementEvidence).toBe(true);
      expect(result.journey.legs[0]?.routeMetadata?.reservationRequired).toBe(
        undefined,
      );
    }
  });

  it("fails closed for unsupported pickup and drop-off values", () => {
    const cases = [
      { field: "pickup_type", stop: "A" },
      { field: "drop_off_type", stop: "C" },
    ] as const;
    for (const testCase of cases) {
      const result = imported(
        withRows("stopTimes", (rows) =>
          rows.map((row) =>
            row.trip_id === "t1" && row.stop_id === testCase.stop
              ? { ...row, [testCase.field]: "4" }
              : row,
          ),
        ),
      );
      expect(query(result, "A", "C")).toMatchObject({
        kind: "inconclusive",
        reason: "unsupported_pickup_dropoff",
      });
    }
  });

  it("does not change when graph arrays are reversed", () => {
    const source = imported();
    const reversed = {
      ...source.graph,
      operators: [...source.graph.operators].reverse(),
      stops: [...source.graph.stops].reverse(),
      routes: [...source.graph.routes].reverse(),
      routeStops: [...source.graph.routeStops].reverse(),
      calendars: [...source.graph.calendars].reverse(),
      scheduledServices: [...source.graph.scheduledServices!].reverse(),
      scheduledStopTimes: [...source.graph.scheduledStopTimes!].reverse(),
    };
    const original = query(source);
    const reversedResult = routeDirectScheduledJourney({
      graph: reversed,
      coverage: {
        ...source.coverage,
        entries: [...source.coverage.entries].reverse(),
      },
      originStopId: stopId(reversed, "A"),
      destinationStopId: stopId(reversed, "C"),
      serviceDate: "2026-04-01",
      earliestDepartureServiceSeconds: 0,
    });
    expect(reversedResult).toEqual(original);
  });

  it("rejects malformed service dates and invalid thresholds", () => {
    expect(query(imported(), "A", "C", "2017-02-29")).toMatchObject({
      kind: "inconclusive",
      reason: "invalid_service_date",
    });
    expect(query(imported(), "A", "C", "2026-04-01", -1)).toMatchObject({
      kind: "inconclusive",
      reason: "invalid_earliest_departure",
    });
  });
});
