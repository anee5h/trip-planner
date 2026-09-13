import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

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
  importGtfsTransfers,
  type GtfsTransferMetadata,
} from "../gtfsTransferImporter";
import type { GtfsFeedTables, GtfsTableRow } from "../gtfsTypes";
import * as transitGraphQueries from "../transitGraphQueries";
import {
  MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS,
  routeOneTransferScheduledJourney,
  type OneTransferScheduledJourneyResult,
  type RouteOneTransferScheduledJourneyInput,
} from "../oneTransferScheduledJourneyRouter";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../scripts/transit/__tests__/fixtures/gtfs-c1-fixture.json",
);

const METADATA: GtfsTransferMetadata = {
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

function transferRow(overrides: Partial<GtfsTableRow> = {}): GtfsTableRow {
  return {
    from_stop_id: "B",
    to_stop_id: "B",
    transfer_type: "0",
    ...overrides,
  };
}

function withTrip(
  tables: GtfsFeedTables,
  tripId: string,
  routeId: string,
  serviceId: string,
  stops: readonly [string, string],
  departure: string,
  arrival: string,
): GtfsFeedTables {
  return {
    ...tables,
    trips: [
      ...tables.trips,
      {
        route_id: routeId,
        service_id: serviceId,
        trip_id: tripId,
        trip_headsign: tripId,
        direction_id: "0",
      },
    ],
    stopTimes: [
      ...tables.stopTimes,
      {
        trip_id: tripId,
        arrival_time: departure,
        departure_time: departure,
        stop_id: stops[0],
        stop_sequence: "1",
      },
      {
        trip_id: tripId,
        arrival_time: arrival,
        departure_time: arrival,
        stop_id: stops[1],
        stop_sequence: "2",
      },
    ],
  };
}

function withStop(
  tables: GtfsFeedTables,
  providerStopId: string,
): GtfsFeedTables {
  return {
    ...tables,
    stops: [
      ...tables.stops,
      {
        stop_id: providerStopId,
        stop_name: providerStopId,
        stop_lat: "35.400000",
        stop_lon: "135.400000",
        location_type: "0",
      },
    ],
  };
}

function withStationSiblingStops(tables: GtfsFeedTables): GtfsFeedTables {
  return {
    ...tables,
    stops: [
      ...tables.stops,
      {
        stop_id: "P",
        stop_name: "Parent",
        stop_lat: "35.500000",
        stop_lon: "135.500000",
        location_type: "1",
      },
      {
        stop_id: "X",
        stop_name: "Sibling X",
        stop_lat: "35.500100",
        stop_lon: "135.500100",
        location_type: "0",
        parent_station: "P",
      },
      {
        stop_id: "Y",
        stop_name: "Sibling Y",
        stop_lat: "35.500200",
        stop_lon: "135.500200",
        location_type: "0",
        parent_station: "P",
      },
    ],
  };
}

function withTripService(
  tables: GtfsFeedTables,
  tripId: string,
  serviceId: string,
): GtfsFeedTables {
  return {
    ...tables,
    trips: tables.trips.map((row) =>
      row.trip_id === tripId ? { ...row, service_id: serviceId } : row,
    ),
  };
}

function withStopTimes(
  tables: GtfsFeedTables,
  tripId: string,
  transform: (row: GtfsTableRow) => GtfsTableRow,
): GtfsFeedTables {
  return {
    ...tables,
    stopTimes: tables.stopTimes.map((row) =>
      row.trip_id === tripId ? transform(row) : row,
    ),
  };
}

function connectionTables(
  departure = "08:10:00",
  arrival = "08:20:00",
): GtfsFeedTables {
  return withTrip(
    cloneTables(),
    "t5",
    "r2",
    "weekday",
    ["B", "C"],
    departure,
    arrival,
  );
}

function differentStopConnectionTables(): GtfsFeedTables {
  return withTrip(
    withStop(cloneTables(), "E"),
    "t6",
    "r2",
    "weekday",
    ["C", "E"],
    "08:10:00",
    "08:20:00",
  );
}

function differentStopNoRuleTables(): GtfsFeedTables {
  let tables = withStop(cloneTables(), "E");
  tables = withStop(tables, "F");
  return withTrip(
    tables,
    "t6",
    "r2",
    "weekday",
    ["E", "F"],
    "08:10:00",
    "08:20:00",
  );
}

function stationSiblingConnectionTables(): GtfsFeedTables {
  let tables = withStationSiblingStops(cloneTables());
  tables = withTrip(
    tables,
    "t7",
    "r1",
    "weekday",
    ["A", "X"],
    "08:00:00",
    "08:05:00",
  );
  return withTrip(
    tables,
    "t8",
    "r2",
    "weekday",
    ["Y", "C"],
    "08:10:00",
    "08:20:00",
  );
}

function imported(
  tables: GtfsFeedTables = connectionTables(),
  transferRows: readonly GtfsTableRow[] | undefined = [],
) {
  const c2 = importGtfsSchedule(tables, COMPLETE_METADATA);
  return importGtfsTransfers(
    c2,
    { ...tables, transfers: transferRows },
    COMPLETE_METADATA,
  );
}

function importedWithoutTransferFile(tables = connectionTables()) {
  const c2 = importGtfsSchedule(tables, COMPLETE_METADATA);
  return importGtfsTransfers(c2, tables, COMPLETE_METADATA);
}

function stopId(
  result: ReturnType<typeof imported>,
  providerId: string,
): string {
  const stop = result.graph.stops.find(
    (candidate) => candidate.providerStopId === providerId,
  );
  if (stop === undefined) throw new Error(`stop ${providerId} missing`);
  return stop.id;
}

function queryStops(
  result: ReturnType<typeof imported>,
  originProviderId: string,
  destinationProviderId: string,
  options: Partial<
    Omit<
      RouteOneTransferScheduledJourneyInput,
      "graph" | "coverage" | "originStopId" | "destinationStopId"
    >
  > = {},
): OneTransferScheduledJourneyResult {
  return routeOneTransferScheduledJourney({
    graph: result.graph,
    coverage: result.coverage,
    originStopId: stopId(result, originProviderId),
    destinationStopId: stopId(result, destinationProviderId),
    serviceDate: "2026-04-01",
    earliestDepartureServiceSeconds: 0,
    ...options,
  });
}

function query(
  result: ReturnType<typeof imported>,
  options: Partial<
    Omit<
      RouteOneTransferScheduledJourneyInput,
      "graph" | "coverage" | "originStopId" | "destinationStopId"
    >
  > = {},
): OneTransferScheduledJourneyResult {
  return queryStops(result, "A", "C", options);
}

function verified(result: OneTransferScheduledJourneyResult) {
  expect(result.kind).toBe("verified");
  if (result.kind !== "verified") throw new Error("expected verified result");
  return result;
}

describe("KAI-292B one-transfer scheduled journey router", () => {
  it("routes two distinct services through the exact same stop policy", () => {
    const result = verified(query(importedWithoutTransferFile()));

    expect(MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS).toBe(300);
    expect(result.journey).toMatchObject({
      kind: "journey",
      scope: "complete_journey",
      directionality: "multi_leg",
      completeness: "complete",
      availability: "available",
    });
    expect(result.journey.legs).toHaveLength(2);
    expect(result.journey.legs[0]).toMatchObject({
      mode: "bus",
      origin: { id: stopId(importedWithoutTransferFile(), "A") },
      destination: { id: stopId(importedWithoutTransferFile(), "B") },
      cost: { state: "unknown", representation: null },
    });
    expect(result.journey.legs[1]).toMatchObject({
      mode: "train",
      origin: { id: stopId(importedWithoutTransferFile(), "B") },
      destination: { id: stopId(importedWithoutTransferFile(), "C") },
      cost: { state: "unknown", representation: null },
    });
    expect(result.evidence).toMatchObject({
      transferCount: 1,
      firstServiceId: expect.stringContaining(":t1"),
      secondServiceId: expect.stringContaining(":t5"),
      transferFromStopId: stopId(importedWithoutTransferFile(), "B"),
      transferToStopId: stopId(importedWithoutTransferFile(), "B"),
      incomingArrivalServiceSeconds: 29100,
      outgoingDepartureServiceSeconds: 29400,
      transferWaitSeconds: 300,
      requiredTransferSeconds: 300,
      transferBasis: "meguruto_same_stop_policy",
      coverageState: "not_imported_in_this_slice",
      firstCoverageState: "not_imported_in_this_slice",
      secondCoverageState: "not_imported_in_this_slice",
      totalDurationSeconds: 1200,
    });
    expect(result.totalDurationSeconds).toBe(1200);
  });

  it("rejects a same-stop gap below the five-minute policy", () => {
    const result = query(
      importedWithoutTransferFile(connectionTables("08:09:59", "08:19:59")),
    );
    expect(result).toMatchObject({
      kind: "no_match",
      reason: "transfer_connection_miss",
    });
  });

  it("accepts an explicit type-2 minimum and rejects a one-second shortfall", () => {
    const accepted = verified(
      query(
        imported(connectionTables("08:07:00", "08:17:00"), [
          transferRow({ transfer_type: "2", min_transfer_time: "120" }),
        ]),
      ),
    );
    expect(accepted.evidence).toMatchObject({
      transferBasis: "gtfs_minimum",
      requiredTransferSeconds: 120,
      transferWaitSeconds: 120,
      transferType: 2,
    });

    expect(
      query(
        imported(connectionTables("08:06:59", "08:16:59"), [
          transferRow({ transfer_type: "2", min_transfer_time: "120" }),
        ]),
      ),
    ).toMatchObject({ kind: "no_match", reason: "transfer_connection_miss" });
  });

  it("does not treat a type-2 null minimum as zero", () => {
    expect(
      query(
        imported(connectionTables("08:05:00", "08:15:00"), [
          transferRow({ transfer_type: "2" }),
        ]),
      ),
    ).toMatchObject({
      kind: "inconclusive",
      reason: "transfer_minimum_unknown",
    });
  });

  it("retains type-3 prohibition instead of falling back to the same-stop policy", () => {
    expect(
      query(
        imported(connectionTables("08:15:00", "08:25:00"), [
          transferRow({ transfer_type: "3" }),
        ]),
      ),
    ).toMatchObject({ kind: "no_match", reason: "transfer_prohibited" });
  });

  it("accepts a nonnegative type-1 timed transfer without a 300-second buffer", () => {
    const result = verified(
      query(
        imported(connectionTables("08:05:01", "08:15:01"), [
          transferRow({ transfer_type: "1" }),
        ]),
      ),
    );
    expect(result.evidence).toMatchObject({
      transferBasis: "gtfs_timed",
      requiredTransferSeconds: 0,
      transferWaitSeconds: 1,
      transferType: 1,
    });
  });

  it("enforces an explicit type-0 minimum and preserves its basis", () => {
    expect(
      query(
        imported(connectionTables("08:07:00", "08:17:00"), [
          transferRow({ transfer_type: "0", min_transfer_time: "120" }),
        ]),
      ),
    ).toMatchObject({
      kind: "verified",
      evidence: { transferBasis: "gtfs_recommended_with_minimum" },
    });
    expect(
      query(
        imported(connectionTables("08:06:59", "08:16:59"), [
          transferRow({ transfer_type: "0", min_transfer_time: "120" }),
        ]),
      ),
    ).toMatchObject({ kind: "no_match", reason: "transfer_connection_miss" });
  });

  it("fails closed for missing pre-D1 transfer coverage", () => {
    const c2 = importGtfsSchedule(connectionTables(), COMPLETE_METADATA);
    expect(
      routeOneTransferScheduledJourney({
        graph: c2.graph,
        coverage: c2.coverage,
        originStopId: c2.graph.stops.find(
          (stop) => stop.providerStopId === "A",
        )!.id,
        destinationStopId: c2.graph.stops.find(
          (stop) => stop.providerStopId === "C",
        )!.id,
        serviceDate: "2026-04-01",
        earliestDepartureServiceSeconds: 0,
      }),
    ).toMatchObject({
      kind: "inconclusive",
      reason: "unsupported_coverage",
    });
  });

  it("accepts exact same-stop policy with an evaluated empty transfer file", () => {
    const result = verified(query(imported(connectionTables(), [])));
    expect(result.evidence.transferBasis).toBe("meguruto_same_stop_policy");
    expect(result.evidence.coverageState).toBe("imported");
    expect(result.evidence.firstLeg.coverageState).toBe("imported");
    expect(result.evidence.secondLeg.coverageState).toBe("imported");
    expect(result.evidence.transferRuleId).toBeUndefined();
    expect(result.evidence.transferType).toBeUndefined();
  });

  it("accepts exact same-stop policy on a complete D1 feed with no transfers.txt", () => {
    const result = verified(query(importedWithoutTransferFile()));
    expect(result.evidence.transferBasis).toBe("meguruto_same_stop_policy");
    expect(
      importedWithoutTransferFile().coverage.entries.every(
        (entry) => entry.transfers === "not_imported_in_this_slice",
      ),
    ).toBe(true);
  });

  it("keeps direct-only services out of the one-transfer primitive", () => {
    const tables = cloneTables();
    const result = importedWithoutTransferFile(tables);
    expect(query(result)).toMatchObject({
      kind: "no_match",
    });
    expect(query(result).kind).not.toBe("verified");
  });

  it("never reports a fare for either scheduled leg", () => {
    const result = verified(query(importedWithoutTransferFile()));
    expect(
      result.journey.legs.every((leg) => leg.cost.state === "unknown"),
    ).toBe(true);
    expect(result.journey.cost).toBeUndefined();
  });

  it("preserves arrangement evidence at the transfer endpoints", () => {
    const tables = withStopTimes(connectionTables(), "t1", (row) =>
      row.stop_id === "B" ? { ...row, drop_off_type: "2" } : row,
    );
    const outgoing = withStopTimes(tables, "t5", (row) =>
      row.stop_id === "B" ? { ...row, pickup_type: "3" } : row,
    );
    const result = verified(query(importedWithoutTransferFile(outgoing)));
    expect(result.evidence.firstLeg.alightingRequiresArrangement).toBe(true);
    expect(result.evidence.secondLeg.boardingRequiresArrangement).toBe(true);
    expect(result.journey.legs[0]?.routeMetadata?.reservationRequired).toBe(
      undefined,
    );
  });

  it("handles an after-midnight transfer with absolute service-day seconds", () => {
    let tables = connectionTables("24:05:00", "24:15:00");
    tables = withStopTimes(tables, "t1", (row) =>
      row.stop_id === "A"
        ? { ...row, arrival_time: "23:50:00", departure_time: "23:50:00" }
        : row.stop_id === "B"
          ? { ...row, arrival_time: "23:58:00", departure_time: "23:58:00" }
          : row.stop_id === "C"
            ? { ...row, arrival_time: "24:08:00", departure_time: "24:08:00" }
            : row,
    );
    const result = verified(query(importedWithoutTransferFile(tables)));
    expect(result.evidence).toMatchObject({
      incomingArrivalServiceSeconds: 86280,
      outgoingDepartureServiceSeconds: 86700,
      transferWaitSeconds: 420,
      totalDurationSeconds: 1500,
    });
  });

  it("does not infer movement for different stops without an explicit rule", () => {
    const result = queryStops(
      importedWithoutTransferFile(differentStopNoRuleTables()),
      "A",
      "F",
    );
    expect(result.kind).not.toBe("verified");
  });

  it("routes an explicit different-stop type-2 connection", () => {
    const source = imported(differentStopConnectionTables(), [
      transferRow({
        to_stop_id: "C",
        transfer_type: "2",
        min_transfer_time: "120",
      }),
    ]);
    const result = verified(queryStops(source, "A", "E"));
    expect(result.evidence).toMatchObject({
      transferFromStopId: stopId(source, "B"),
      transferToStopId: stopId(source, "C"),
      transferBasis: "gtfs_minimum",
      transferType: 2,
      requiredTransferSeconds: 120,
    });
  });

  it("does not infer a transfer between station siblings", () => {
    const result = queryStops(
      importedWithoutTransferFile(stationSiblingConnectionTables()),
      "A",
      "C",
    );
    expect(result.kind).not.toBe("verified");
  });

  it("applies route-scoped and trip-scoped explicit rules to the actual pair", () => {
    const routeScoped = verified(
      query(
        imported(connectionTables(), [
          transferRow({
            from_route_id: "r1",
            to_route_id: "r2",
            transfer_type: "2",
            min_transfer_time: "120",
          }),
        ]),
      ),
    );
    expect(routeScoped.evidence.transferType).toBe(2);

    const tripScoped = verified(
      query(
        imported(connectionTables(), [
          transferRow({
            from_trip_id: "t1",
            to_trip_id: "t5",
            transfer_type: "2",
            min_transfer_time: "120",
          }),
        ]),
      ),
    );
    expect(tripScoped.evidence.transferType).toBe(2);
  });

  it("lets a more-specific prohibited rule override a generic rule", () => {
    expect(
      query(
        imported(connectionTables("08:10:00", "08:20:00"), [
          transferRow(),
          transferRow({
            from_trip_id: "t1",
            to_trip_id: "t5",
            transfer_type: "3",
          }),
        ]),
      ),
    ).toMatchObject({ kind: "no_match", reason: "transfer_prohibited" });
  });

  it.each(["4", "5"] as const)(
    "does not route linked-trip transfer_type %s as a passenger transfer",
    (transferType) => {
      expect(
        query(
          imported(connectionTables(), [
            transferRow({
              from_trip_id: "t1",
              to_trip_id: "t5",
              transfer_type: transferType,
            }),
          ]),
        ),
      ).toMatchObject({
        kind: "inconclusive",
        reason: "transfer_type_not_supported",
      });
    },
  );

  it("fails closed for a negative timed-transfer gap", () => {
    expect(
      query(
        imported(connectionTables("08:04:00", "08:14:00"), [
          transferRow({ transfer_type: "1" }),
        ]),
      ),
    ).toMatchObject({ kind: "inconclusive", reason: "chronology_invalid" });
  });

  it.each([
    ["service A drop-off", "t1", "drop_off_type", "dropoff_prohibited"],
    ["service B pickup", "t5", "pickup_type", "pickup_prohibited"],
    [
      "unsupported endpoint",
      "t1",
      "drop_off_type",
      "unsupported_pickup_dropoff",
    ],
  ] as const)("fails closed for %s", (_label, tripId, field, reason) => {
    const value = reason === "unsupported_pickup_dropoff" ? "4" : "1";
    const tables = withStopTimes(connectionTables(), tripId, (row) =>
      row.stop_id === "B" ? { ...row, [field]: value } : row,
    );
    expect(query(importedWithoutTransferFile(tables))).toMatchObject({
      kind: "inconclusive",
      reason,
    });
  });

  it("uses calendar exceptions for either scheduled service", () => {
    const firstException = verified(
      query(
        imported(withTripService(connectionTables(), "t1", "weekend"), []),
        { serviceDate: "2026-04-06" },
      ),
    );
    expect(firstException.evidence.firstLeg.calendarReason).toBe(
      "exception_added",
    );

    const secondException = verified(
      query(
        imported(withTripService(connectionTables(), "t5", "special"), []),
        { serviceDate: "2026-04-10" },
      ),
    );
    expect(secondException.evidence.secondLeg.calendarReason).toBe(
      "exception_added",
    );
  });

  it("excludes inactive first and second services", () => {
    expect(
      query(imported(withTripService(connectionTables(), "t1", "weekend"), [])),
    ).toMatchObject({ kind: "no_match", reason: "inactive_service" });
    expect(
      query(imported(withTripService(connectionTables(), "t5", "weekend"), [])),
    ).toMatchObject({ kind: "no_match", reason: "inactive_service" });
  });

  it("does not infer an explicit type-0 connection between different stops without a minimum", () => {
    const result = queryStops(
      imported(differentStopConnectionTables(), [
        transferRow({ to_stop_id: "C", transfer_type: "0" }),
      ]),
      "A",
      "E",
    );
    expect(result).toMatchObject({
      kind: "inconclusive",
      reason: "unmodeled_transfer_movement",
    });
  });

  it("propagates invalid transfer queries as inconclusive", () => {
    const spy = vi
      .spyOn(transitGraphQueries, "resolveApplicableTransfers")
      .mockReturnValue({
        status: "invalid_query",
        reason: "service_route_mismatch",
      });
    try {
      expect(query(importedWithoutTransferFile())).toMatchObject({
        kind: "inconclusive",
        reason: "invalid_transfer_query",
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("fails closed for ambiguous maximal transfer evidence", () => {
    const source = imported(connectionTables(), [transferRow()]);
    const first = source.graph.transfers[0];
    if (first === undefined) throw new Error("expected transfer fixture");
    const altered = {
      ...source,
      graph: {
        ...source.graph,
        transfers: [first, { ...first, id: `${first.id}:ambiguous` }],
      },
    };
    expect(query(altered)).toMatchObject({
      kind: "inconclusive",
      reason: "ambiguous_transfer_rule",
    });
  });

  it("rejects duplicate matching coverage entries", () => {
    const source = importedWithoutTransferFile();
    const altered = {
      ...source,
      coverage: {
        ...source.coverage,
        entries: [
          ...source.coverage.entries,
          ...(source.coverage.entries[0] === undefined
            ? []
            : [{ ...source.coverage.entries[0] }]),
        ],
      },
    };
    expect(query(altered)).toMatchObject({
      kind: "inconclusive",
      reason: "transfer_coverage_untrusted",
    });
  });

  it("rejects a stale coverage schema even when entries claim imported", () => {
    const source = importedWithoutTransferFile();
    const altered = {
      ...source,
      coverage: {
        ...source.coverage,
        schemaVersion: "kai-291c2-v1",
      },
    };
    expect(query(altered)).toMatchObject({
      kind: "inconclusive",
      reason: "unsupported_coverage",
    });
  });

  it("does not accept a C2 partial feed as complete transfer evidence", () => {
    const c2 = importGtfsSchedule(connectionTables(), METADATA);
    const result = importGtfsTransfers(
      c2,
      { ...connectionTables(), transfers: [] },
      METADATA,
    );
    expect(query(result)).toMatchObject({
      kind: "inconclusive",
      reason: "partial_timetable",
    });
  });
  it("is invariant to reversing graph arrays", () => {
    const source = importedWithoutTransferFile();
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
    const reversedResult = routeOneTransferScheduledJourney({
      graph: reversed,
      coverage: {
        ...source.coverage,
        entries: [...source.coverage.entries].reverse(),
      },
      originStopId: stopId(
        { ...source, graph: reversed } as ReturnType<typeof imported>,
        "A",
      ),
      destinationStopId: stopId(
        { ...source, graph: reversed } as ReturnType<typeof imported>,
        "C",
      ),
      serviceDate: "2026-04-01",
      earliestDepartureServiceSeconds: 0,
    });
    expect(reversedResult).toEqual(original);
  });
});
