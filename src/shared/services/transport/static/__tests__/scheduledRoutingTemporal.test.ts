import { describe, expect, it } from "vitest";

import {
  JAPAN_TRANSIT_TIME_ZONE,
  resolveScheduledRoutingTemporalContext,
  resolveScheduledRoutingTemporalPlan,
  resolveServiceDayTime,
  type ScheduledRoutingTemporalQuery,
} from "../scheduledRoutingTemporal";
import { parseGtfsServiceTime } from "../gtfsScheduleImporter";

const FIXTURE_SOURCE = "controlled_internal_test_fixture" as const;

function query(
  serviceDate: string | null | undefined,
  earliestDepartureTime: string | null | undefined,
): ScheduledRoutingTemporalQuery {
  return {
    serviceDate,
    earliestDepartureTime,
    source: FIXTURE_SOURCE,
    evidenceId: "kai-292c3-temporal-fixture",
  };
}

describe("KAI-292C3 scheduled-routing temporal contract", () => {
  it("resolves a normal Japan-local departure to service-day seconds", () => {
    const result = resolveScheduledRoutingTemporalContext(
      query("2026-04-10", "09:21"),
    );

    expect(result).toMatchObject({
      status: "resolved",
      context: {
        serviceDate: "2026-04-10",
        earliestDepartureServiceSeconds: 33660,
        provenance: {
          source: FIXTURE_SOURCE,
          timeZone: JAPAN_TRANSIT_TIME_ZONE,
          evidenceId: "kai-292c3-temporal-fixture",
        },
      },
    });
  });

  it.each([
    ["00:00", 0],
    ["23:59", 86340],
    ["25:10", 90600],
    ["25:10:30", 90630],
  ] as const)(
    "preserves %s as absolute service-day seconds",
    (value, expected) => {
      expect(resolveServiceDayTime(value)).toEqual({
        status: "resolved",
        serviceDaySeconds: expected,
      });
    },
  );

  it("preserves the existing normalized GTFS 24:00 service-day semantics", () => {
    expect(parseGtfsServiceTime("24:00:00")).toBe(86400);
    expect(parseGtfsServiceTime("25:10:00")).toBe(90600);
  });

  it.each(["2026-02-30", "0000-01-01", "2026-13-01"])(
    "rejects an impossible Gregorian date %s without host timezone parsing",
    (date) => {
      expect(
        resolveScheduledRoutingTemporalContext(query(date, "09:00")),
      ).toMatchObject({
        status: "invalid_query",
        reason: "invalid_service_date",
      });
    },
  );

  it.each(["25:61", "-01:00", "09:60", "09:00:60", "9:0", "09"])(
    "rejects invalid departure time %s",
    (value) => {
      expect(resolveServiceDayTime(value)).toMatchObject({
        status: "invalid_query",
        reason: "invalid_departure_time",
      });
    },
  );

  it("returns unresolved instead of selecting today when service date is missing", () => {
    expect(
      resolveScheduledRoutingTemporalContext(query(undefined, "09:00")),
    ).toMatchObject({
      status: "unresolved",
      reason: "missing_service_date",
    });
  });

  it("returns unresolved instead of choosing 09:00 when departure is missing", () => {
    expect(
      resolveScheduledRoutingTemporalContext(query("2026-04-10", undefined)),
    ).toMatchObject({
      status: "unresolved",
      reason: "missing_departure_time",
    });
  });

  it("supports independent outbound and next-day return contexts", () => {
    const result = resolveScheduledRoutingTemporalPlan({
      outbound: query("2026-09-14", "08:00"),
      return: query("2026-09-15", "25:10"),
    });

    expect(result).toMatchObject({
      status: "resolved",
      plan: {
        outbound: {
          serviceDate: "2026-09-14",
          earliestDepartureServiceSeconds: 28800,
        },
        return: {
          serviceDate: "2026-09-15",
          earliestDepartureServiceSeconds: 90600,
        },
      },
    });
  });

  it("keeps a missing return context optional without inventing one", () => {
    const result = resolveScheduledRoutingTemporalPlan({
      outbound: query("2026-09-14", "08:00"),
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved plan");
    expect(result.plan.return).toBeUndefined();
  });

  it("propagates a return-side unresolved result explicitly", () => {
    const result = resolveScheduledRoutingTemporalPlan({
      outbound: query("2026-09-14", "08:00"),
      return: query("2026-09-15", null),
    });

    expect(result).toMatchObject({
      status: "unresolved",
      leg: "return",
      reason: "missing_departure_time",
    });
  });

  it("is independent of the host TZ because it uses no Date conversion", () => {
    const originalTz = process.env.TZ;
    try {
      const results = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((tz) => {
        process.env.TZ = tz;
        return resolveScheduledRoutingTemporalContext(
          query("2026-04-10", "23:59"),
        );
      });
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("rejects an unsupported provenance source at the boundary", () => {
    expect(
      resolveScheduledRoutingTemporalContext({
        ...query("2026-04-10", "09:00"),
        source: "implicit_default" as never,
      }),
    ).toMatchObject({
      status: "invalid_query",
      reason: "invalid_source",
    });
  });
});
