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
  gtfsRouteInternalId,
  gtfsStopInternalId,
} from "../gtfsTopologyImporter";
import {
  GtfsTransferImportError,
  importGtfsTransfers,
  type GtfsTransferMetadata,
} from "../gtfsTransferImporter";
import type { GtfsFeedTables, GtfsTableRow } from "../gtfsTypes";
import type { TransitTransfer } from "../transitGraphTypes";
import {
  type ApplicableTransferResult,
  getApplicableTransfers,
  getTransfersBetweenStops,
  getTransfersFromStop,
} from "../transitGraphQueries";

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

function baseSchedule() {
  return importGtfsSchedule(loadTables(), METADATA);
}

function completeSchedule() {
  return importGtfsSchedule(loadTables(), COMPLETE_METADATA);
}

function enrichComplete(rows: readonly GtfsTableRow[]) {
  const tables = loadTables();
  const c2 = completeSchedule();
  return importGtfsTransfers(
    c2,
    { ...tables, transfers: rows },
    COMPLETE_METADATA,
  );
}

function transferRow(overrides: Partial<GtfsTableRow> = {}): GtfsTableRow {
  return {
    from_stop_id: "A",
    to_stop_id: "C",
    transfer_type: "0",
    ...overrides,
  };
}

function enrich(
  rows: readonly GtfsTableRow[] | undefined,
  metadata: GtfsTransferMetadata = METADATA,
) {
  const tables = loadTables();
  return importGtfsTransfers(
    baseSchedule(),
    { ...tables, transfers: rows },
    metadata,
  );
}

function stopId(providerId: string): string {
  return gtfsStopInternalId(
    METADATA.provider,
    providerId,
    METADATA.identityNamespace,
  );
}

function routeId(providerId: string): string {
  return gtfsRouteInternalId(
    METADATA.provider,
    providerId,
    METADATA.identityNamespace,
  );
}

function serviceId(providerId: string): string {
  return `gtfs-jp:scheduled_service:gtfs%3Afixture-wakasa:${providerId}`;
}

function resolvedTransfers(
  result: ApplicableTransferResult,
): readonly TransitTransfer[] {
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") {
    throw new Error(`expected resolved query, got ${result.reason}`);
  }
  return result.transfers;
}

function expectTransferError(
  rows: readonly GtfsTableRow[],
  code: GtfsTransferImportError["code"],
): void {
  let caught: unknown;
  try {
    enrich(rows);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(GtfsTransferImportError);
  expect((caught as GtfsTransferImportError).code).toBe(code);
}

describe("GTFS transfer evidence enrichment", () => {
  it("normalizes a stop transfer, explicit seconds, and unknown seconds distinctly", () => {
    const simple = enrich([transferRow()]);
    const minimum = enrich([
      transferRow({ transfer_type: "2", min_transfer_time: "180" }),
    ]);
    const unknown = enrich([transferRow({ transfer_type: "1" })]);

    expect(simple.graph.transfers[0]).toMatchObject({
      provider: "gtfs-jp",
      fromStopId: stopId("A"),
      toStopId: stopId("C"),
      fromRouteId: null,
      toRouteId: null,
      fromServiceId: null,
      toServiceId: null,
      minimumTransferSeconds: null,
      sourceSemantics: { provider: "gtfs-jp", transferType: 0 },
    });
    expect(minimum.graph.transfers[0]?.minimumTransferSeconds).toBe(180);
    expect(unknown.graph.transfers[0]?.minimumTransferSeconds).toBeNull();
    expect(unknown.graph.transfers[0]?.minimumTransferSeconds).not.toBe(0);
  });

  it("retains prohibited evidence and does not turn it into an inferred edge", () => {
    const result = enrich([transferRow({ transfer_type: "3" })]);
    const applicable = resolvedTransfers(
      getApplicableTransfers(result.graph, {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
      }),
    );
    expect(applicable).toHaveLength(1);
    expect(applicable[0]?.sourceSemantics.transferType).toBe(3);
    expect(getTransfersFromStop(result.graph, stopId("A"))).toHaveLength(1);
    expect(
      getTransfersBetweenStops(result.graph, stopId("A"), stopId("C")),
    ).toHaveLength(1);
  });

  it("keeps route scope narrow and applies current GTFS specificity", () => {
    const result = enrich([
      transferRow({ from_route_id: "r1", to_route_id: "r2" }),
      transferRow({
        from_trip_id: "t1",
        to_trip_id: "t3",
        transfer_type: "2",
        min_transfer_time: "240",
      }),
    ]);
    const routeScoped = resolvedTransfers(
      getApplicableTransfers(result.graph, {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        incomingRouteId: routeId("r1"),
        outgoingRouteId: routeId("r2"),
      }),
    );
    expect(routeScoped).toHaveLength(1);
    expect(routeScoped[0]?.fromRouteId).toBe(routeId("r1"));
    expect(routeScoped[0]?.toRouteId).toBe(routeId("r2"));

    const tripScoped = resolvedTransfers(
      getApplicableTransfers(result.graph, {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        incomingServiceId: serviceId("t1"),
        outgoingServiceId: serviceId("t3"),
      }),
    );
    expect(tripScoped).toHaveLength(1);
    expect(tripScoped[0]?.sourceSemantics.transferType).toBe(2);
    expect(tripScoped[0]?.minimumTransferSeconds).toBe(240);
  });

  it("does not apply route- or trip-scoped rules to another route or trip", () => {
    const routeResult = enrich([
      transferRow({ from_route_id: "r1", to_route_id: "r2" }),
    ]);
    expect(
      resolvedTransfers(
        getApplicableTransfers(routeResult.graph, {
          fromStopId: stopId("A"),
          toStopId: stopId("C"),
          incomingRouteId: routeId("r2"),
          outgoingRouteId: routeId("r1"),
        }),
      ),
    ).toEqual([]);

    const tripResult = enrich([
      transferRow({ from_trip_id: "t1", to_trip_id: "t3" }),
    ]);
    expect(
      resolvedTransfers(
        getApplicableTransfers(tripResult.graph, {
          fromStopId: stopId("A"),
          toStopId: stopId("C"),
          incomingServiceId: serviceId("t2"),
          outgoingServiceId: serviceId("t3"),
        }),
      ),
    ).toEqual([]);
    expect(
      resolvedTransfers(
        getApplicableTransfers(tripResult.graph, {
          fromStopId: stopId("A"),
          toStopId: stopId("C"),
          incomingServiceId: serviceId("t1"),
          outgoingServiceId: serviceId("t4"),
        }),
      ),
    ).toEqual([]);
  });

  it("returns a resolved empty result when no explicit rule applies", () => {
    const result = enrich([transferRow()]);
    expect(
      getApplicableTransfers(result.graph, {
        fromStopId: stopId("B"),
        toStopId: stopId("C"),
        incomingRouteId: routeId("r2"),
        outgoingRouteId: routeId("r1"),
      }),
    ).toEqual({ status: "resolved", transfers: [] });
  });

  it.each([
    [
      "unknown from stop",
      { fromStopId: stopId("missing"), toStopId: stopId("C") },
      "unknown_from_stop",
    ],
    [
      "unknown to stop",
      { fromStopId: stopId("A"), toStopId: stopId("missing") },
      "unknown_to_stop",
    ],
    [
      "unknown incoming route",
      {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        incomingRouteId: routeId("missing"),
      },
      "unknown_incoming_route",
    ],
    [
      "unknown outgoing route",
      {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        outgoingRouteId: routeId("missing"),
      },
      "unknown_outgoing_route",
    ],
    [
      "unknown incoming service",
      {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        incomingServiceId: serviceId("missing"),
      },
      "unknown_incoming_service",
    ],
    [
      "unknown outgoing service",
      {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        outgoingServiceId: serviceId("missing"),
      },
      "unknown_outgoing_service",
    ],
    [
      "incoming service route mismatch",
      {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        incomingServiceId: serviceId("t1"),
        incomingRouteId: routeId("r2"),
      },
      "service_route_mismatch",
    ],
    [
      "outgoing service route mismatch",
      {
        fromStopId: stopId("A"),
        toStopId: stopId("C"),
        outgoingServiceId: serviceId("t3"),
        outgoingRouteId: routeId("r1"),
      },
      "service_route_mismatch",
    ],
  ] as const)("distinguishes %s", (_label, query, reason) => {
    const result = enrich([transferRow()]);
    expect(
      getApplicableTransfers(result.graph, {
        ...query,
      }),
    ).toEqual({ status: "invalid_query", reason });
  });

  it("expands a station-scoped provider rule only to its exact child stop", () => {
    const result = enrich([transferRow({ from_stop_id: "D" })]);
    expect(
      getTransfersBetweenStops(result.graph, stopId("A"), stopId("C")),
    ).toHaveLength(1);
    expect(
      getTransfersBetweenStops(result.graph, stopId("B"), stopId("C")),
    ).toEqual([]);
  });

  it("supports current linked-trip forms without inventing omitted stops", () => {
    const result = enrich([
      transferRow({
        from_stop_id: "",
        to_stop_id: "",
        from_trip_id: "t1",
        to_trip_id: "t3",
        transfer_type: "4",
      }),
    ]);
    const transfer = result.graph.transfers[0];
    expect(transfer).toMatchObject({
      fromStopId: null,
      toStopId: null,
      fromServiceId: serviceId("t1"),
      toServiceId: serviceId("t3"),
      sourceSemantics: { transferType: 4 },
    });
    expect(
      resolvedTransfers(
        getApplicableTransfers(result.graph, {
          fromStopId: stopId("A"),
          toStopId: stopId("C"),
          incomingServiceId: serviceId("t1"),
          outgoingServiceId: serviceId("t3"),
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "unknown from_stop_id",
      transferRow({ from_stop_id: "missing" }),
      "unknown_stop_reference",
    ],
    [
      "unknown to_stop_id",
      transferRow({ to_stop_id: "missing" }),
      "unknown_stop_reference",
    ],
    [
      "unknown route",
      transferRow({ from_route_id: "missing" }),
      "unknown_route_reference",
    ],
    [
      "unknown trip",
      transferRow({ from_trip_id: "missing" }),
      "unknown_trip_reference",
    ],
  ] as const)("rejects %s", (_label, row, code) => {
    expectTransferError([row], code);
  });

  it("rejects duplicate identities and incompatible route/trip references", () => {
    expectTransferError(
      [
        transferRow({ transfer_type: "0" }),
        transferRow({ transfer_type: "3" }),
      ],
      "duplicate_transfer_identity",
    );
    expectTransferError(
      [transferRow({ from_route_id: "r2", from_trip_id: "t1" })],
      "trip_route_mismatch",
    );
  });

  it("fails closed when equally specific overlapping rules are ambiguous", () => {
    expectTransferError(
      [
        transferRow({ from_route_id: "r1" }),
        transferRow({ to_route_id: "r2", transfer_type: "3" }),
      ],
      "ambiguous_transfer_rules",
    );
  });

  it("is invariant to input row order and observation metadata", () => {
    const rows = [
      transferRow({ from_route_id: "r1" }),
      transferRow({
        from_stop_id: "B",
        to_stop_id: "C",
        transfer_type: "2",
        min_transfer_time: "120",
      }),
    ];
    const first = enrich(rows);
    const reordered = enrich([...rows].reverse());
    const observedAgain = enrich(rows, {
      ...METADATA,
      datasetId: "gtfs-jp-wakasa-fixture-v2",
      sourceDescriptor: "same fixture observed again",
      retrievedAt: "2026-09-12T00:00:00.000Z",
      checkedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(reordered.graph.transfers).toEqual(first.graph.transfers);
    expect(reordered.graph.datasetVersion.contentHash).toBe(
      first.graph.datasetVersion.contentHash,
    );
    expect(observedAgain.graph.datasetVersion.contentHash).toBe(
      first.graph.datasetVersion.contentHash,
    );
  });

  it("changes the D1 hash when transfer semantics change", () => {
    const recommended = enrich([transferRow()]);
    const prohibited = enrich([transferRow({ transfer_type: "3" })]);
    const minimum = enrich([
      transferRow({ transfer_type: "2", min_transfer_time: "180" }),
    ]);
    expect(prohibited.graph.datasetVersion.contentHash).not.toBe(
      recommended.graph.datasetVersion.contentHash,
    );
    expect(minimum.graph.datasetVersion.contentHash).not.toBe(
      recommended.graph.datasetVersion.contentHash,
    );
  });

  it("leaves the established C2 graph bytes and hash unchanged", () => {
    const tables = loadTables();
    const withoutTransfers = importGtfsSchedule(tables, COMPLETE_METADATA);
    const withTransfers = importGtfsSchedule(
      {
        ...tables,
        transfers: [transferRow({ transfer_type: "3" })],
      },
      COMPLETE_METADATA,
    );
    expect(withTransfers.graph).toEqual(withoutTransfers.graph);
    expect(withTransfers.coverage).toEqual(withoutTransfers.coverage);
    expect(withTransfers.graph.datasetVersion.contentHash).toBe(
      withoutTransfers.graph.datasetVersion.contentHash,
    );
  });

  it("marks transfer-file absence as not imported, never as unsupported", () => {
    const result = importGtfsTransfers(baseSchedule(), loadTables(), METADATA);
    expect(result.graph.transfers).toEqual([]);
    expect(result.importedTransferCount).toBe(0);
    expect(result.coverage.entries).toHaveLength(2);
    expect(
      result.coverage.entries.every(
        (entry) => entry.transfers === "not_imported_in_this_slice",
      ),
    ).toBe(true);
    expect(
      result.coverage.entries.some(
        (entry) => entry.transfers === "unsupported",
      ),
    ).toBe(false);
  });

  it("marks a present empty transfer file as imported explicit-rule coverage", () => {
    const result = enrichComplete([]);
    expect(result.graph.transfers).toEqual([]);
    expect(result.coverage.entries).toHaveLength(2);
    expect(
      result.coverage.entries.every((entry) => entry.transfers === "imported"),
    ).toBe(true);
    expect(
      result.coverage.entries.flatMap((entry) => entry.notes),
    ).not.toContain("transfers are impossible");
  });

  it("marks populated transfer rows as imported explicit-rule coverage", () => {
    const result = enrichComplete([transferRow()]);
    expect(result.importedTransferCount).toBe(1);
    expect(
      result.coverage.entries.every((entry) => entry.transfers === "imported"),
    ).toBe(true);
  });

  it("does not infer unrelated coverage in the graph-only API", () => {
    const tables = loadTables();
    const result = importGtfsTransfers(
      baseSchedule().graph,
      { ...tables, transfers: [] },
      COMPLETE_METADATA,
    );
    expect(
      result.coverage.entries.every(
        (entry) =>
          entry.topology === "not_evaluated" &&
          entry.timetable === "not_evaluated" &&
          entry.transfers === "imported",
      ),
    ).toBe(true);
  });

  it("preserves C2 topology and timetable coverage when supplied", () => {
    const c2 = completeSchedule();
    const result = importGtfsTransfers(
      c2,
      { ...loadTables(), transfers: [] },
      COMPLETE_METADATA,
    );
    expect(
      result.coverage.entries.map((entry) => [
        entry.provider,
        entry.operator,
        entry.mode,
        entry.topology,
        entry.timetable,
      ]),
    ).toEqual(
      c2.coverage.entries.map((entry) => [
        entry.provider,
        entry.operator,
        entry.mode,
        entry.topology,
        entry.timetable,
      ]),
    );
    expect(
      result.coverage.entries.every((entry) => entry.transfers === "imported"),
    ).toBe(true);
  });
});
