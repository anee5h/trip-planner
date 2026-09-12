import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { OdptCalendar } from "../../OdptProvider";

import { makeZip } from "../../../../../../scripts/transit/__tests__/fixtures/gtfsZipTestFixture";
import {
  parseGtfsFeed,
  readBoundedGtfsZip,
} from "../../../../../../scripts/transit/gtfsFeedReader";
import {
  GtfsScheduleImportError,
  importGtfsSchedule,
  isGtfsServiceActiveOnDate,
  parseGtfsServiceTime,
  type GtfsScheduleMetadata,
} from "../gtfsScheduleImporter";
import {
  GtfsImportError,
  type GtfsImportErrorCode,
} from "../gtfsTopologyImporter";
import { makeTransitEntityId } from "../transitEntityId";
import type { GtfsFeedTables, GtfsTableRow } from "../gtfsTypes";
import {
  getActiveScheduledServicesForRoutePattern,
  getScheduledService,
  getScheduledStopTimesForService,
  isScheduledServiceActiveOnDate,
} from "../transitGraphQueries";

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

function expectScheduleError(
  tables: GtfsFeedTables,
  code: GtfsScheduleImportError["code"],
  metadata: GtfsScheduleMetadata = METADATA,
): void {
  expect(() => importGtfsSchedule(tables, metadata)).toThrowError(
    GtfsScheduleImportError,
  );
  try {
    importGtfsSchedule(tables, metadata);
  } catch (error) {
    expect((error as GtfsScheduleImportError).code).toBe(code);
  }
}

function expectTopologyError(
  tables: GtfsFeedTables,
  code: GtfsImportErrorCode,
): void {
  expect(() => importGtfsSchedule(tables, METADATA)).toThrowError(
    GtfsImportError,
  );
  try {
    importGtfsSchedule(tables, METADATA);
  } catch (error) {
    expect((error as GtfsImportError).code).toBe(code);
  }
}

function serviceByProviderId(
  result: ReturnType<typeof importGtfsSchedule>,
  providerServiceId: string,
) {
  const service = result.graph.scheduledServices?.find(
    (candidate) => candidate.providerServiceId === providerServiceId,
  );
  if (service === undefined)
    throw new Error(`service ${providerServiceId} missing`);
  return service;
}

describe("GTFS schedule/calendar importer", () => {
  it("normalizes calendars, scheduled services, and scheduled stop facts", () => {
    const result = importGtfsSchedule(loadTables(), METADATA);
    expect(result.graph.calendars).toHaveLength(3);
    expect(result.graph.scheduledServices).toHaveLength(4);
    expect(result.graph.scheduledStopTimes).toHaveLength(10);

    const t1 = serviceByProviderId(result, "t1");
    expect(t1.routeId).toContain("gtfs-jp:route");
    expect(t1.patternId).toMatch(/^pattern:/);
    expect(t1.calendarId).toContain("gtfs-jp:calendar");
    expect(t1.sourceSemantics).toMatchObject({
      provider: "gtfs-jp",
      tripHeadsign: "Eastbound",
      directionId: "0",
    });
    expect(t1.provider).toBe("gtfs-jp");
    const t1Times = getScheduledStopTimesForService(result.graph, t1.id);
    expect(t1Times.map((time) => time.arrivalServiceSeconds)).toEqual([
      28800, 29100, 29400,
    ]);
    expect(t1Times.every((time) => time.provider === "gtfs-jp")).toBe(true);
    expect(t1Times.map((time) => time.order)).toEqual([1, 2, 3]);
    expect(t1Times[0]?.sourceSemantics).toMatchObject({
      provider: "gtfs-jp",
      rawArrivalTime: "08:00:00",
      rawDepartureTime: "08:00:00",
      rawStopSequence: 1,
      timepoint: null,
    });
    const t4 = serviceByProviderId(result, "t4");
    expect(
      getScheduledStopTimesForService(result.graph, t4.id).map(
        (time) => time.arrivalServiceSeconds,
      ),
    ).toEqual([86400, 87000]);
    expect(result.coverage.entries).toHaveLength(2);
    expect(
      result.coverage.entries.every((entry) => entry.timetable === "partial"),
    ).toBe(true);
  });

  it("marks a complete represented schedule as timetable imported", () => {
    const result = importGtfsSchedule(loadTables(), COMPLETE_METADATA);
    expect(
      result.coverage.entries.every((entry) => entry.topology === "imported"),
    ).toBe(true);
    expect(
      result.coverage.entries.every((entry) => entry.timetable === "imported"),
    ).toBe(true);
    expect(
      result.coverage.entries.every(
        (entry) => entry.fare === "not_imported_in_this_slice",
      ),
    ).toBe(true);
    expect(
      result.coverage.entries.every(
        (entry) => entry.realtime === "not_evaluated",
      ),
    ).toBe(true);
  });

  it("supports a feed whose service definitions exist only in calendar_dates.txt", () => {
    const tables = loadTables();
    const datesOnly: GtfsFeedTables = {
      ...tables,
      calendar: undefined,
      calendarDates: [
        { service_id: "weekday", date: "20260401", exception_type: "1" },
        { service_id: "weekend", date: "20260401", exception_type: "1" },
        { service_id: "special", date: "20260410", exception_type: "1" },
      ],
    };
    const result = importGtfsSchedule(datesOnly, COMPLETE_METADATA);
    expect(result.graph.calendars).toHaveLength(3);
    expect(result.graph.scheduledServices).toHaveLength(4);
    expect(
      result.graph.calendars.find(
        (calendar) => calendar.providerCalendarId === "special",
      )?.sourceSemantics,
    ).toMatchObject({ base: null });
  });

  it("uses feed-scoped calendar and scheduled-service identities", () => {
    const first = importGtfsSchedule(loadTables(), METADATA);
    const second = importGtfsSchedule(loadTables(), {
      ...METADATA,
      identityNamespace: "gtfs:another-feed",
    });
    expect(first.graph.calendars[0]?.id).not.toBe(
      second.graph.calendars[0]?.id,
    );
    expect(first.graph.scheduledServices?.[0]?.id).not.toBe(
      second.graph.scheduledServices?.[0]?.id,
    );
    expect(first.graph.calendars[0]?.id).toContain("gtfs-jp:calendar");
    expect(first.graph.scheduledServices?.[0]?.id).toContain(
      "gtfs-jp:scheduled_service",
    );
    expect(first.graph.calendars[0]?.id).not.toBe(
      makeTransitEntityId("odpt", "calendar", "odpt", "weekday"),
    );
  });

  it("resolves base, exception, and exception-only service dates", () => {
    const result = importGtfsSchedule(loadTables(), METADATA);
    const weekday = result.graph.calendars.find(
      (calendar) => calendar.providerCalendarId === "weekday",
    );
    const weekend = result.graph.calendars.find(
      (calendar) => calendar.providerCalendarId === "weekend",
    );
    const special = result.graph.calendars.find(
      (calendar) => calendar.providerCalendarId === "special",
    );
    expect(weekday && weekend && special).toBeTruthy();
    expect(isGtfsServiceActiveOnDate(weekday!, "2026-04-01")).toMatchObject({
      active: true,
      reason: "base_weekday",
    });
    expect(isGtfsServiceActiveOnDate(weekday!, "2026-04-02")).toMatchObject({
      active: false,
      reason: "exception_removed",
    });
    expect(isGtfsServiceActiveOnDate(weekday!, "2026-04-04")).toMatchObject({
      active: false,
      reason: "base_inactive_weekday",
    });
    expect(isGtfsServiceActiveOnDate(weekday!, "2026-04-05")).toMatchObject({
      active: false,
      reason: "base_inactive_weekday",
    });
    expect(isGtfsServiceActiveOnDate(weekday!, "2026-03-31")).toMatchObject({
      active: false,
      reason: "outside_base_range",
    });
    expect(isGtfsServiceActiveOnDate(weekday!, "2026-05-01")).toMatchObject({
      active: false,
      reason: "outside_base_range",
    });
    expect(isGtfsServiceActiveOnDate(weekend!, "2026-04-06")).toMatchObject({
      active: true,
      reason: "exception_added",
    });
    expect(isGtfsServiceActiveOnDate(special!, "2026-04-10")).toMatchObject({
      active: true,
      reason: "exception_added",
    });
    expect(isGtfsServiceActiveOnDate(special!, "2026-04-11")).toMatchObject({
      active: false,
      reason: "exception_only_no_match",
    });
  });

  it("exposes pure scheduled-service queries without routing", () => {
    const result = importGtfsSchedule(loadTables(), METADATA);
    const t1 = serviceByProviderId(result, "t1");
    const route = result.graph.routes.find(
      (candidate) => candidate.providerRouteId === "r1",
    );
    expect(route).toBeDefined();
    expect(getScheduledService(result.graph, t1.id)?.id).toBe(t1.id);
    expect(getScheduledService(result.graph, "missing")).toBeNull();
    expect(
      isScheduledServiceActiveOnDate(result.graph, t1.id, "2026-04-01"),
    ).toMatchObject({
      active: true,
      reason: "base_weekday",
    });
    expect(
      isScheduledServiceActiveOnDate(result.graph, t1.id, "2026-04-02"),
    ).toMatchObject({
      active: false,
      reason: "exception_removed",
    });
    expect(
      getActiveScheduledServicesForRoutePattern(
        result.graph,
        route?.id ?? "",
        t1.patternId,
        "2026-04-01",
      ).map((service) => service.providerServiceId),
    ).toEqual(["t1"]);
  });

  it("retains permitted missing intermediate times as null without interpolation", () => {
    const tables = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1" && row.stop_sequence === "2"
          ? { ...row, arrival_time: "", departure_time: "" }
          : row,
      ),
    );
    const result = importGtfsSchedule(tables, COMPLETE_METADATA);
    const t1 = serviceByProviderId(result, "t1");
    const middle = getScheduledStopTimesForService(result.graph, t1.id)[1];
    expect(middle?.arrivalServiceSeconds).toBeNull();
    expect(middle?.departureServiceSeconds).toBeNull();
    expect(
      result.coverage.entries.find(
        (entry) => entry.operator === "a1" && entry.mode === "bus",
      )?.timetable,
    ).toBe("partial");
    expect(
      result.coverage.entries.find(
        (entry) => entry.operator === "a2" && entry.mode === "rail",
      )?.timetable,
    ).toBe("imported");
  });

  it("rejects unknown services and topology-pattern divergence", () => {
    expectScheduleError(
      withRows("trips", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" ? { ...row, service_id: "missing" } : row,
        ),
      ),
      "unknown_service_reference",
    );
    const topology = importGtfsSchedule(loadTables(), METADATA).topology;
    const divergent = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t3" && row.stop_id === "C"
          ? { ...row, stop_id: "B" }
          : row,
      ),
    );
    expect(() => importGtfsSchedule(divergent, METADATA, topology)).toThrow(
      /topology_schedule_mismatch/,
    );
  });

  it("fails closed for unknown route and stop references at the C1 boundary", () => {
    expectTopologyError(
      withRows("trips", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" ? { ...row, route_id: "missing-route" } : row,
        ),
      ),
      "unknown_route_reference",
    );
    expectTopologyError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "2"
            ? { ...row, stop_id: "missing-stop" }
            : row,
        ),
      ),
      "unknown_stop_reference",
    );
  });

  it("validates calendar rows and exception keys strictly", () => {
    expectScheduleError(
      withRows("calendar", (rows) =>
        rows.map((row) =>
          row.service_id === "weekday" ? { ...row, monday: "2" } : row,
        ),
      ),
      "invalid_calendar_flag",
    );
    expectScheduleError(
      withRows("calendar", (rows) =>
        rows.map((row) =>
          row.service_id === "weekday"
            ? { ...row, start_date: "20260230" }
            : row,
        ),
      ),
      "invalid_calendar_date",
    );
    expectScheduleError(
      withRows("calendar", (rows) =>
        rows.map((row) =>
          row.service_id === "weekday"
            ? { ...row, start_date: "20260430", end_date: "20260401" }
            : row,
        ),
      ),
      "invalid_calendar_range",
    );
    expectScheduleError(
      withRows("calendar", (rows) => [...rows, rows[0] ?? {}]),
      "duplicate_calendar_service",
    );
    expectScheduleError(
      withRows("calendarDates", (rows) =>
        rows.map((row) =>
          row.service_id === "special" ? { ...row, exception_type: "3" } : row,
        ),
      ),
      "invalid_exception_type",
    );
    expectScheduleError(
      withRows("calendarDates", (rows) =>
        rows.map((row) =>
          row.service_id === "special" ? { ...row, date: "20260230" } : row,
        ),
      ),
      "invalid_calendar_date",
    );
    expectScheduleError(
      withRows("calendarDates", (rows) => [...rows, rows[0] ?? {}]),
      "duplicate_calendar_exception",
    );
  });

  it("parses service-day times without modulo-24 conversion", () => {
    expect(parseGtfsServiceTime("23:55:00")).toBe(86100);
    expect(parseGtfsServiceTime("24:00:00")).toBe(86400);
    expect(parseGtfsServiceTime("24:10:00")).toBe(87000);
    expect(parseGtfsServiceTime("24:10:05")).toBe(87005);
    expect(parseGtfsServiceTime("25:35:00")).toBe(92100);
    expect(parseGtfsServiceTime("6:58:00")).toBe(25080);
    expect(parseGtfsServiceTime("")).toBeNull();
    expect(() => parseGtfsServiceTime("25:60:00")).toThrow(/invalid_time/);
    expect(() => parseGtfsServiceTime("25:00:60")).toThrow(/invalid_time/);
    expect(() => parseGtfsServiceTime("1:2:03")).toThrow(/invalid_time/);
  });

  it("retains non-zero GTFS seconds in normalized schedule facts", () => {
    const tables = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1" && row.stop_sequence === "1"
          ? {
              ...row,
              arrival_time: "08:00:01",
              departure_time: "08:00:02",
            }
          : row,
      ),
    );
    const result = importGtfsSchedule(tables, COMPLETE_METADATA);
    const t1 = serviceByProviderId(result, "t1");
    const first = getScheduledStopTimesForService(result.graph, t1.id)[0];
    expect(first?.arrivalServiceSeconds).toBe(28801);
    expect(first?.departureServiceSeconds).toBe(28802);
  });

  it("enforces first/last time requirements and known-time chronology", () => {
    expectScheduleError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "1"
            ? { ...row, arrival_time: "" }
            : row,
        ),
      ),
      "missing_required_time",
    );
    expectScheduleError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "2"
            ? { ...row, arrival_time: "08:06:00", departure_time: "08:05:00" }
            : row,
        ),
      ),
      "invalid_time_order",
    );
    expectScheduleError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "2"
            ? { ...row, arrival_time: "07:00:00" }
            : row,
        ),
      ),
      "invalid_time_chronology",
    );
    expectScheduleError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "2"
            ? {
                ...row,
                arrival_time: "08:05:00",
                timepoint: "1",
                departure_time: "",
              }
            : row,
        ),
      ),
      "missing_required_time",
    );
    expectScheduleError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "2"
            ? { ...row, timepoint: "2" }
            : row,
        ),
      ),
      "invalid_timepoint",
    );
    expectScheduleError(
      withRows("stopTimes", (rows) =>
        rows.map((row) =>
          row.trip_id === "t1" && row.stop_sequence === "2"
            ? { ...row, arrival_time: "bad" }
            : row,
        ),
      ),
      "invalid_time",
    );
  });

  it("changes the C2 hash for calendar/time semantics but not observation metadata or raw sequence renumbering", () => {
    const first = importGtfsSchedule(loadTables(), METADATA);
    const metadataChanged = importGtfsSchedule(loadTables(), {
      ...METADATA,
      datasetId: "different",
      retrievedAt: "2026-09-12T00:00:00.000Z",
      checkedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(metadataChanged.graph.datasetVersion.contentHash).toBe(
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
      importGtfsSchedule(renumbered, METADATA).graph.datasetVersion.contentHash,
    ).toBe(first.graph.datasetVersion.contentHash);
    const calendarChanged = withRows("calendar", (rows) =>
      rows.map((row) =>
        row.service_id === "weekday" ? { ...row, friday: "0" } : row,
      ),
    );
    expect(
      importGtfsSchedule(calendarChanged, METADATA).graph.datasetVersion
        .contentHash,
    ).not.toBe(first.graph.datasetVersion.contentHash);
    const timeChanged = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1" && row.stop_sequence === "2"
          ? { ...row, arrival_time: "08:06:00", departure_time: "08:06:00" }
          : row,
      ),
    );
    expect(
      importGtfsSchedule(timeChanged, METADATA).graph.datasetVersion
        .contentHash,
    ).not.toBe(first.graph.datasetVersion.contentHash);

    const base = loadTables();
    const reordered = importGtfsSchedule(
      {
        ...base,
        agency: [...base.agency].reverse(),
        stops: [...base.stops].reverse(),
        routes: [...base.routes].reverse(),
        trips: [...base.trips].reverse(),
        stopTimes: [...base.stopTimes].reverse(),
        calendar: [...(base.calendar ?? [])].reverse(),
        calendarDates: [...(base.calendarDates ?? [])].reverse(),
      },
      METADATA,
    );
    expect(reordered.graph.datasetVersion.contentHash).toBe(
      first.graph.datasetVersion.contentHash,
    );

    const equivalentTimeFormatting = withRows("stopTimes", (rows) =>
      rows.map((row) =>
        row.trip_id === "t1" && row.stop_sequence === "1"
          ? { ...row, arrival_time: "8:00:00", departure_time: "8:00:00" }
          : row,
      ),
    );
    expect(
      importGtfsSchedule(equivalentTimeFormatting, METADATA).graph
        .datasetVersion.contentHash,
    ).toBe(first.graph.datasetVersion.contentHash);
  });

  it.each([
    ["retrievedAt", { retrievedAt: "2026-09-12T00:00:00.000Z" }],
    ["checkedAt", { checkedAt: "2026-09-12T00:00:00.000Z" }],
    ["datasetId", { datasetId: "different-dataset" }],
    ["local filename", { sourceDescriptor: "different-local-filename.zip" }],
  ] as const)("keeps the C2 hash invariant when %s changes", (_, change) => {
    const first = importGtfsSchedule(loadTables(), METADATA);
    const changed = importGtfsSchedule(loadTables(), {
      ...METADATA,
      ...change,
    });
    expect(changed.graph.datasetVersion.contentHash).toBe(
      first.graph.datasetVersion.contentHash,
    );
  });

  it("keeps the existing ODPT calendar resolver as the only ODPT precedence implementation", async () => {
    const { resolveApplicableCalendars } = await import("../../odptCalendar");
    const calendars: OdptCalendar[] = [
      {
        id: "odpt:calendar:odpt:odpt.Calendar:Weekday",
        sameAs: "odpt.Calendar:Weekday",
        ucode: null,
        title: null,
        calendarTitle: null,
        day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        duration: null,
        isSpecific: false,
        date: null,
        provenance: {
          provider: "odpt",
          providerId: "odpt.Calendar:Weekday",
          ucode: null,
          generatedAt: null,
          issuedAt: null,
          validUntil: null,
          fetchedAt: "2026-09-11T00:00:00.000Z",
          sourceResource: "odpt:Calendar",
          sourceUrl: "https://example.test/odpt",
          coverage: "unknown",
        },
      },
      {
        id: "odpt:calendar:odpt:odpt.Calendar:Specific.MarketHoliday",
        sameAs: "odpt.Calendar:Specific.MarketHoliday",
        ucode: null,
        title: null,
        calendarTitle: null,
        day: ["2026-04-01"],
        duration: null,
        isSpecific: true,
        date: null,
        provenance: {
          provider: "odpt",
          providerId: "odpt.Calendar:Specific.MarketHoliday",
          ucode: null,
          generatedAt: null,
          issuedAt: null,
          validUntil: null,
          fetchedAt: "2026-09-11T00:00:00.000Z",
          sourceResource: "odpt:Calendar",
          sourceUrl: "https://example.test/odpt",
          coverage: "unknown",
        },
      },
    ];
    const result = resolveApplicableCalendars("2026-04-01", calendars);
    expect(result.effective).toBe("specific");
    expect(result.rule).toBe("specific_overrides_base");
  });
});
