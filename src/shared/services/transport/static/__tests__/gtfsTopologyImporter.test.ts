import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "../../../../../../scripts/transit/gtfsFeedReader";
import { makeZip } from "../../../../../../scripts/transit/__tests__/fixtures/gtfsZipTestFixture";
import { makeTransitEntityId } from "../transitEntityId";
import {
  GtfsImportError,
  importGtfsTopology,
  mapGtfsRouteType,
  type GtfsImportMetadata,
} from "../gtfsTopologyImporter";
import type { GtfsFeedTables, GtfsTableRow } from "../gtfsTypes";
import {
  getOrderedStopsForRoute,
  getOrderedStopsForRoutePattern,
} from "../transitGraphQueries";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../scripts/transit/__tests__/fixtures/gtfs-c1-fixture.json",
);

const METADATA: GtfsImportMetadata = {
  provider: "gtfs-jp",
  datasetId: "gtfs-jp-wakasa-fixture-v1",
  identityNamespace: "gtfs:fixture-wakasa",
  sourceDescriptor: "synthetic GTFS-JP fixture",
  sourceType: "fixture",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  checkedAt: "2026-09-11T00:00:00.000Z",
  completeness: "fixture_subset",
};

const COMPLETE_METADATA: GtfsImportMetadata = {
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
  if (rows === undefined) throw new Error(`fixture family ${family} is absent`);
  return { ...tables, [family]: transform(rows) } as GtfsFeedTables;
}

function expectImportError(
  tables: GtfsFeedTables,
  code: GtfsImportError["code"],
  metadata: GtfsImportMetadata = METADATA,
): void {
  expect(() => importGtfsTopology(tables, metadata)).toThrowError(
    GtfsImportError,
  );
  try {
    importGtfsTopology(tables, metadata);
  } catch (error) {
    expect((error as GtfsImportError).code).toBe(code);
  }
}

describe("GTFS topology adapter", () => {
  it("imports the same normalized graph shape without timetable facts", () => {
    const result = importGtfsTopology(loadTables(), METADATA);
    expect(result.graph.datasetVersion.provider).toBe("gtfs-jp");
    expect(result.graph.operators).toHaveLength(2);
    expect(result.graph.stops).toHaveLength(4);
    expect(result.graph.routes).toHaveLength(2);
    expect(result.graph.routeStops).toHaveLength(8);
    expect(result.graph.calendars).toEqual([]);
    expect(result.graph.transfers).toEqual([]);
    expect(result.graph.fares).toEqual([]);
    expect(result.graph.datasetVersion.publisher).toEqual({
      name: "Fixture Publisher",
      url: "https://fixture.example",
    });
    for (const entity of [
      ...result.graph.operators,
      ...result.graph.stops,
      ...result.graph.routes,
      ...result.graph.routeStops,
    ]) {
      expect(entity.provenance.provider).toBe("gtfs-jp");
      expect(entity.provenance.identityNamespace).toBe(
        METADATA.identityNamespace,
      );
      expect(entity.provenance.datasetId).toBe(METADATA.datasetId);
      expect(entity.provenance.retrievedAt).toBe(METADATA.retrievedAt);
      expect(entity.provenance.checkedAt).toBe(METADATA.checkedAt);
    }
    expect(
      result.graph.routeStops.some((membership) =>
        membership.provenance.providerId.startsWith("t1:"),
      ),
    ).toBe(true);
  });

  it("uses feed-scoped identities and keeps same-looking ODPT and GTFS stops apart", () => {
    const { graph } = importGtfsTopology(loadTables(), METADATA);
    const gtfsUeno = makeTransitEntityId("gtfs", "stop", "gtfs:wakasa", "Ueno");
    const odptUeno = makeTransitEntityId(
      "odpt",
      "stop",
      "odpt",
      "odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    expect(gtfsUeno).not.toBe(odptUeno);
    expect(graph.stops[0]?.id).toContain("gtfs-jp:stop:gtfs%3Afixture-wakasa:");
    expect(graph.stops.map((stop) => stop.providerStopId)).toEqual(
      expect.arrayContaining(["A", "B", "C", "D"]),
    );
  });

  it("maps stops conservatively and retains GTFS-JP source semantics", () => {
    const { graph } = importGtfsTopology(loadTables(), METADATA);
    const byProviderId = new Map(
      graph.stops.map((stop) => [stop.providerStopId, stop]),
    );
    expect(byProviderId.get("B")?.stopType).toBe("bus_stop");
    expect(byProviderId.get("D")?.stopType).toBe("station");
    expect(byProviderId.get("A")?.stopType).toBe("platform");
    expect(byProviderId.get("A")?.names.ja).toBe("Harbor, West");
    expect(byProviderId.get("B")?.names.ja).toBe('The "Hub"');
    expect(byProviderId.get("B")?.sourceSemantics).toEqual({
      provider: "gtfs-jp",
      locationType: 0,
      parentStation: null,
      platformCode: null,
    });
    const rail = graph.routes.find((route) => route.providerRouteId === "r2");
    expect(rail?.mode).toBe("rail");
    expect(rail?.sourceSemantics).toMatchObject({
      provider: "gtfs-jp",
      routeType: 2,
      routeUpdateDate: "20260901",
    });
  });

  it("retains route identity while representing opposite-direction patterns separately", () => {
    const result = importGtfsTopology(loadTables(), METADATA);
    const route = result.graph.routes.find(
      (entry) => entry.providerRouteId === "r1",
    );
    expect(route).toBeDefined();
    expect(result.patternAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeId: route?.id,
          classification: "multiple_compatible_directional",
          patternCount: 2,
        }),
      ]),
    );
    const patternIds =
      result.patternAudit.find((entry) => entry.routeId === route?.id)
        ?.patternIds ?? [];
    expect(patternIds).toHaveLength(2);
    expect(getOrderedStopsForRoute(result.graph, route?.id ?? "")).toEqual([]);
    expect(
      getOrderedStopsForRoutePattern(
        result.graph,
        route?.id ?? "",
        patternIds[0] ?? "",
      ).length,
    ).toBe(3);
    expect(route?.sourceSemantics).toMatchObject({
      provider: "gtfs-jp",
      patterns: expect.arrayContaining([
        expect.objectContaining({
          serviceIds: ["weekday"],
          tripIds: expect.any(Array),
        }),
      ]),
    });
    const complete = importGtfsTopology(loadTables(), COMPLETE_METADATA);
    expect(
      complete.coverage.entries.find(
        (entry) => entry.operator === "a1" && entry.mode === "bus",
      ),
    ).toMatchObject({ topology: "imported" });
    expect(
      complete.coverage.entries.find(
        (entry) => entry.operator === "a1" && entry.mode === "bus",
      )?.notes,
    ).toContain("multiple ordered patterns preserved: r1");
    expect(
      complete.coverage.entries.find(
        (entry) => entry.operator === "a2" && entry.mode === "rail",
      ),
    ).toMatchObject({ topology: "imported" });
  });

  it("retains raw stop_sequence provenance separately from normalized order", () => {
    const rawSequenceTables = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1"
          ? { ...row, stop_sequence: String(Number(row.stop_sequence) * 10) }
          : row,
      ),
    );
    const result = importGtfsTopology(rawSequenceTables, METADATA);
    const routeId = result.graph.routes.find(
      (route) => route.providerRouteId === "r1",
    )?.id;
    const memberships = result.graph.routeStops
      .filter(
        (membership) =>
          membership.routeId === routeId &&
          membership.provenance.providerId.startsWith("t1:"),
      )
      .sort((a, b) => a.order - b.order);
    expect(memberships.map((membership) => membership.order)).toEqual([
      1, 2, 3,
    ]);
    expect(
      memberships.map((membership) => membership.provenance.providerId),
    ).toEqual(["t1:10", "t1:20", "t1:30"]);
  });

  it("keeps representative pattern rows paired with the selected trip", () => {
    const base = cloneTables();
    const tables: GtfsFeedTables = {
      ...base,
      trips: [
        ...base.trips,
        {
          route_id: "r1",
          service_id: "weekday",
          trip_id: "t0",
          trip_headsign: "Earlier",
          direction_id: "0",
        },
      ],
      stopTimes: [
        ...base.stopTimes,
        { trip_id: "t0", stop_id: "A", stop_sequence: "10" },
        { trip_id: "t0", stop_id: "B", stop_sequence: "20" },
        { trip_id: "t0", stop_id: "C", stop_sequence: "30" },
      ],
    };
    const result = importGtfsTopology(tables, METADATA);
    const routeId = result.graph.routes.find(
      (route) => route.providerRouteId === "r1",
    )?.id;
    const memberships = result.graph.routeStops
      .filter(
        (membership) =>
          membership.routeId === routeId &&
          membership.provenance.providerId.startsWith("t0:"),
      )
      .sort((a, b) => a.order - b.order);
    expect(
      memberships.map((membership) => membership.provenance.providerId),
    ).toEqual(["t0:10", "t0:20", "t0:30"]);
  });

  it("reports partial topology and explicit not-imported coverage states", () => {
    const { coverage } = importGtfsTopology(loadTables(), METADATA);
    expect(coverage.entries).toHaveLength(2);
    for (const entry of coverage.entries) {
      expect(entry.provider).toBe("gtfs-jp");
      expect(entry.topology).toBe("partial");
      expect(entry.timetable).toBe("not_imported_in_this_slice");
      expect(entry.fare).toBe("not_imported_in_this_slice");
      expect(entry.realtime).toBe("not_evaluated");
    }
  });

  it("supports ordinary GTFS with the same parser and provider-neutral graph", () => {
    const tables = loadTables();
    const result = importGtfsTopology(
      { ...tables, routesJp: undefined },
      { ...METADATA, provider: "gtfs", identityNamespace: "gtfs:ordinary" },
    );
    expect(result.graph.datasetVersion.provider).toBe("gtfs");
    expect(result.graph.routes[0]?.sourceSemantics.provider).toBe("gtfs");
    expect(result.graph.stops[0]?.sourceSemantics?.provider).toBe("gtfs");
  });

  it("classifies a branch as conflicting without flattening it", () => {
    const base = cloneTables();
    const branchedTrip = {
      route_id: "r1",
      service_id: "weekday",
      trip_id: "t-branch",
      trip_headsign: "Branch",
      direction_id: "0",
    };
    const tables: GtfsFeedTables = {
      ...base,
      trips: [...base.trips, branchedTrip],
      stopTimes: [
        ...base.stopTimes,
        {
          trip_id: "t-branch",
          arrival_time: "11:00:00",
          departure_time: "11:00:00",
          stop_id: "A",
          stop_sequence: "1",
        },
        {
          trip_id: "t-branch",
          arrival_time: "11:05:00",
          departure_time: "11:05:00",
          stop_id: "C",
          stop_sequence: "2",
        },
        {
          trip_id: "t-branch",
          arrival_time: "11:10:00",
          departure_time: "11:10:00",
          stop_id: "B",
          stop_sequence: "3",
        },
      ],
    };
    const result = importGtfsTopology(tables, METADATA);
    const routeId = result.graph.routes.find(
      (route) => route.providerRouteId === "r1",
    )?.id;
    expect(
      result.patternAudit.find((entry) => entry.routeId === routeId)
        ?.classification,
    ).toBe("multiple_conflicting");
    expect(getOrderedStopsForRoute(result.graph, routeId ?? "")).toEqual([]);
    expect(
      importGtfsTopology(tables, COMPLETE_METADATA).coverage.entries.find(
        (entry) => entry.operator === "a1" && entry.mode === "bus",
      ),
    ).toMatchObject({ topology: "imported" });
  });

  it("reports a complete route with no usable pattern as partial", () => {
    const tables = cloneTables();
    const withEmptyRoute: GtfsFeedTables = {
      ...tables,
      routes: [
        ...tables.routes,
        {
          route_id: "r-empty",
          agency_id: "a1",
          route_short_name: "Empty",
          route_long_name: "No topology",
          route_type: "3",
        },
      ],
    };
    const coverage = importGtfsTopology(
      withEmptyRoute,
      COMPLETE_METADATA,
    ).coverage;
    expect(
      coverage.entries.find(
        (entry) => entry.operator === "a1" && entry.mode === "bus",
      ),
    ).toMatchObject({ topology: "partial" });
  });
});

describe("GTFS validation", () => {
  it("requires stop_times.stop_id to reference a location_type 0 stop", () => {
    const valid = importGtfsTopology(loadTables(), METADATA);
    expect(valid.graph.routeStops).toHaveLength(8);
    expectImportError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t3" && row.stop_sequence === "2"
            ? { ...row, stop_id: "D" }
            : row,
        ),
      ),
      "invalid_stop_time_location",
    );
  });

  it("requires every trip to have at least two serviced stops", () => {
    const twoStops = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t3" && row.stop_sequence === "2"
          ? { ...row, stop_sequence: "23" }
          : row,
      ),
    );
    expect(importGtfsTopology(twoStops, METADATA).graph.routes).toHaveLength(2);

    expectImportError(
      withRows("stopTimes", (rows) =>
        rows.filter((row) => row.trip_id !== "t3"),
      ),
      "missing_stop_times",
    );
    expectImportError(
      withRows("stopTimes", (rows) =>
        rows.filter((row) => row.trip_id !== "t3" || row.stop_sequence === "1"),
      ),
      "missing_stop_times",
    );
  });

  it("maps only explicitly reviewed route types", () => {
    expect(mapGtfsRouteType(0)).toBe("tram");
    expect(mapGtfsRouteType(1)).toBe("rail");
    expect(mapGtfsRouteType(2)).toBe("rail");
    expect(mapGtfsRouteType(3)).toBe("bus");
    expect(mapGtfsRouteType(4)).toBe("ferry");
    expect(mapGtfsRouteType(5)).toBe("tram");
    expect(mapGtfsRouteType(6)).toBe("other");
    expect(mapGtfsRouteType(7)).toBe("rail");
    expect(mapGtfsRouteType(11)).toBe("bus");
    expect(mapGtfsRouteType(12)).toBe("rail");
    expect(() => mapGtfsRouteType(100)).toThrowError(/unsupported_route_type/);
  });

  it("rejects unresolved references and duplicate identities", () => {
    expectImportError({ ...cloneTables(), routes: [] }, "missing_family");
    expectImportError(
      withRows("routes", (rows) =>
        rows.map((row) =>
          row.route_id === "r1" ? { ...row, agency_id: "missing" } : row,
        ),
      ),
      "unknown_agency_reference",
    );
    expectImportError(
      withRows("trips", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" ? { ...row, route_id: "missing" } : row,
        ),
      ),
      "unknown_route_reference",
    );
    expectImportError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" ? { ...row, trip_id: "missing" } : row,
        ),
      ),
      "unknown_trip_reference",
    );
    expectImportError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" ? { ...row, stop_id: "missing" } : row,
        ),
      ),
      "unknown_stop_reference",
    );
    expectImportError(
      withRows("stops", (rows) => [...rows, rows[0] ?? {}]),
      "duplicate_provider_identity",
    );
    expectImportError(
      withRows("stopTimes", (rows) => [
        ...rows,
        { ...rows[0], stop_sequence: "1" },
      ]),
      "duplicate_stop_sequence",
    );
  });

  it("rejects unsupported route/location semantics and malformed coordinates", () => {
    expectImportError(
      withRows("routes", (rows) =>
        rows.map((row) =>
          row.route_id === "r1" ? { ...row, route_type: "999" } : row,
        ),
      ),
      "unsupported_route_type",
    );
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "B" ? { ...row, location_type: "2" } : row,
        ),
      ),
      "unsupported_location_type",
    );
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "B" ? { ...row, stop_lat: "" } : row,
        ),
      ),
      "malformed_coordinates",
    );
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "C" ? { ...row, stop_lat: "", stop_lon: "" } : row,
        ),
      ),
      "malformed_coordinates",
    );
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "B" ? { ...row, stop_lat: "not-a-number" } : row,
        ),
      ),
      "malformed_coordinates",
    );
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "B" ? { ...row, stop_lat: "91" } : row,
        ),
      ),
      "malformed_coordinates",
    );
  });

  it("enforces location_type parent semantics and no-evidence fail-closed mapping", () => {
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "D" ? { ...row, parent_station: "A" } : row,
        ),
      ),
      "invalid_parent_station",
    );
    expectImportError(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "B" ? { ...row, parent_station: "C" } : row,
        ),
      ),
      "invalid_parent_station",
    );
    const parented = importGtfsTopology(
      withRows("stops", (rows) =>
        rows.map((row) =>
          row.stop_id === "B" ? { ...row, parent_station: "D" } : row,
        ),
      ),
      METADATA,
    );
    expect(
      parented.graph.stops.find((stop) => stop.providerStopId === "B")
        ?.stopType,
    ).toBe("platform");
    expectImportError(
      withRows("stops", (rows) => [
        ...rows,
        {
          stop_id: "orphan",
          stop_name: "Orphan",
          stop_lat: "35",
          stop_lon: "135",
          location_type: "0",
          parent_station: "",
        },
      ]),
      "unsupported_stop_semantics",
    );
  });

  it("rejects a GTFS-JP claim without its extension table and malformed metadata", () => {
    const tables = loadTables();
    expectImportError({ ...tables, routesJp: undefined }, "missing_family");
    expectImportError(tables, "invalid_metadata", {
      ...METADATA,
      identityNamespace: "",
    });
  });
});

describe("GTFS semantic hash", () => {
  it("ignores observation metadata and input row order but changes for topology", () => {
    const first = importGtfsTopology(loadTables(), METADATA);
    const second = importGtfsTopology(
      {
        ...loadTables(),
        agency: [...loadTables().agency].reverse(),
        stops: [...loadTables().stops].reverse(),
        routes: [...loadTables().routes].reverse(),
        trips: [...loadTables().trips].reverse(),
        stopTimes: [...loadTables().stopTimes].reverse(),
      },
      {
        ...METADATA,
        datasetId: "different",
        retrievedAt: "2026-09-12T00:00:00.000Z",
      },
    );
    expect(second.graph.datasetVersion.contentHash).toBe(
      first.graph.datasetVersion.contentHash,
    );
    const otherFeed = importGtfsTopology(loadTables(), {
      ...METADATA,
      identityNamespace: "gtfs:other-feed",
    });
    expect(
      otherFeed.graph.stops.find((stop) => stop.providerStopId === "A")?.id,
    ).not.toBe(
      first.graph.stops.find((stop) => stop.providerStopId === "A")?.id,
    );
    expect(otherFeed.graph.datasetVersion.contentHash).not.toBe(
      first.graph.datasetVersion.contentHash,
    );
    const renumbered = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1"
          ? { ...row, stop_sequence: String(Number(row.stop_sequence) * 10) }
          : row,
      ),
    );
    expect(
      importGtfsTopology(renumbered, METADATA).graph.datasetVersion.contentHash,
    ).toBe(first.graph.datasetVersion.contentHash);
    const changed = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1" && row.stop_id === "C"
          ? { ...row, stop_id: "B" }
          : row,
      ),
    );
    expect(
      importGtfsTopology(changed, METADATA).graph.datasetVersion.contentHash,
    ).not.toBe(first.graph.datasetVersion.contentHash);
  });
});
