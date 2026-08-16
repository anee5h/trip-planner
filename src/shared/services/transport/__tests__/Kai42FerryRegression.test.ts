import { describe, expect, it } from "vitest";
import {
  getFerryTransportEstimate,
  isFerryTripAvailable,
  isFareValid,
  isServiceActive,
  serviceMatchesDirection,
} from "../FerryTransportEstimator";
import realFerryData from "../../../data/ferry-estimates.json";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type { FerryService, FerryTemporalContext } from "../types";

/**
 * KAI-42: ferry regression matrix — island coverage, seasonality, and cost.
 *
 * Corrected Tomogashima model (operator data, 2026-07-01): adult round-trip
 * fare ¥2,800 (one-way ¥1,400); NORMAL operation March–December and WINTER
 * operation January–February (Saturdays, Sundays and holidays only, subject
 * to weather) — NOT a blanket December–February suspension. The month-range
 * model cannot encode day-of-week fidelity, so the route is treated as
 * available year-round with the winter caveat carried in the record notes.
 */

const services = (
  realFerryData as unknown as { services: Array<Record<string, unknown>> }
).services as unknown as FerryService[];

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

const WAKAYAMA = { lat: 34.2261, lng: 135.1675 };

describe("KAI-42 ferry data integrity (all registered services)", () => {
  it("every service resolves BOTH ports in the dataset", () => {
    const portIds = new Set(
      (realFerryData as unknown as { ports: Array<{ id: string }> }).ports.map(
        (p) => p.id,
      ),
    );
    for (const service of services) {
      expect(portIds.has(service.fromPort), `${service.id} fromPort`).toBe(
        true,
      );
      expect(portIds.has(service.toPort), `${service.id} toPort`).toBe(true);
    }
  });

  it("every service has passenger service, positive duration and a sane fare tuple", () => {
    for (const service of services) {
      expect(service.passengerService, service.id).toBe(true);
      const [minMinutes, maxMinutes] = service.durationMinutes;
      expect(minMinutes, service.id).toBeGreaterThan(0);
      expect(maxMinutes, service.id).toBeGreaterThanOrEqual(minMinutes);
      if (service.fare !== null) {
        const [low, high] = service.fare;
        expect(low, service.id).toBeGreaterThan(0);
        expect(high, service.id).toBeGreaterThanOrEqual(low);
        // Cost sanity: no fare may exceed ~500 JPY per km of sea distance.
        // (Ogasawara ~1,000 km ≈ 35,760 JPY ≈ 36 JPY/km; Sado car ferry
        // high fare includes a vehicle ≈ 330 JPY/km.) A round-trip fare
        // covers two legs, so it is halved before the per-km bound —
        // otherwise short-hop round-trip fares (Tomogashima ¥2,800 over
        // ~4.6 km) would trip a bound meant for one-way rates. Ports are
        // asserted to resolve above, so a missing port can no longer hide
        // behind Math.max(1, 0).
        const straightKm = portDistanceKm(service.fromPort, service.toPort);
        expect(straightKm, `${service.id} ports resolve`).toBeGreaterThan(0);
        const perKm =
          (service.fareBasis === "round-trip" ? high / 2 : high) / straightKm;
        expect(perKm, `${service.id} fare/km`).toBeLessThanOrEqual(500);
      }
    }
  });

  it("every service matches its own direction", () => {
    for (const service of services) {
      expect(
        serviceMatchesDirection(service, service.fromPort, service.toPort),
        service.id,
      ).toBe(true);
    }
  });
});

describe("KAI-42 seasonal availability (corrected Tomogashima model)", () => {
  it("operates on valid days in every month; closed on winter weekdays, Wednesdays and the year-end break", () => {
    const service = services.find((s) => s.id === "tomogashima-kisen")!;
    // Winter period (Jan 4–Feb 28): Saturdays and Sundays only.
    // Normal period (Mar 1–Dec 28): every day except Wednesday.
    const winterWeekends = (year: number, month: 1 | 2): Date[] => {
      const found: Date[] = [];
      // Winter period starts Jan 4 — the year-end closure (12/29–1/3)
      // must not be sampled as an operating day.
      for (let day = 4; day <= 28 && found.length < 2; day += 1) {
        const d = new Date(year, month - 1, day, 12);
        if (d.getDay() === 6 || d.getDay() === 0) found.push(d);
      }
      return found;
    };
    const normalDays = (year: number, month: number): Date[] => {
      const found: Date[] = [];
      for (let day = 1; day <= 28 && found.length < 2; day += 1) {
        const d = new Date(year, month - 1, day, 12);
        if (d.getDay() !== 3) found.push(d); // not a Wednesday
      }
      return found;
    };
    const open: Date[] = [
      ...winterWeekends(2026, 1),
      ...winterWeekends(2026, 2),
    ];
    for (let month = 3; month <= 12; month += 1) {
      open.push(...normalDays(2026, month));
    }
    for (const date of open) {
      expect(
        isServiceActive(service, { travelDate: date }),
        date.toISOString(),
      ).toBe(true);
    }
    // Winter WEEKDAYS: closed (Sat/Sun/holidays only; holidays unmodeled
    // → conservative).
    for (const iso of [
      "2026-01-15",
      "2026-01-20",
      "2026-02-10",
      "2027-01-19",
    ]) {
      expect(
        isServiceActive(service, {
          travelDate: new Date(`${iso}T12:00:00+09:00`),
        }),
        iso,
      ).toBe(false);
    }
    // Normal-period Wednesdays OUTSIDE the busy periods: closed.
    for (const iso of [
      "2026-04-15",
      "2026-05-13",
      "2026-06-10",
      "2026-11-18",
    ]) {
      expect(
        isServiceActive(service, {
          travelDate: new Date(`${iso}T12:00:00+09:00`),
        }),
        iso,
      ).toBe(false);
    }
    // Golden Week (4/28–5/6) and summer (7/20–8/31) run EVERY day,
    // including Wednesdays (operator: 期間中は休まず運航します).
    for (const iso of [
      "2026-04-29",
      "2026-05-06",
      "2026-07-22",
      "2026-08-12",
    ]) {
      expect(
        isServiceActive(service, {
          travelDate: new Date(`${iso}T12:00:00+09:00`),
        }),
        iso,
      ).toBe(true);
    }
    // Leap-day winter sailings: the winter period ends 02-29, so a Sunday
    // Feb 29 (2032) operates; a Tuesday Feb 29 (2028) stays closed.
    expect(
      isServiceActive(service, {
        travelDate: new Date("2032-02-29T12:00:00+09:00"),
      }),
    ).toBe(true);
    expect(
      isServiceActive(service, {
        travelDate: new Date("2028-02-29T12:00:00+09:00"),
      }),
    ).toBe(false);
    // Year-end closure 12/29–1/3 (real, published).
    for (const iso of [
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]) {
      expect(
        isServiceActive(service, {
          travelDate: new Date(`${iso}T12:00:00+09:00`),
        }),
        iso,
      ).toBe(false);
    }
  });

  it("wrap-year operating periods (Dec–Feb) contain winter but not summer", () => {
    const winterService: FerryService = {
      id: "synthetic-winter-only",
      fromPort: "TEST-A",
      toPort: "TEST-B",
      operator: "test",
      durationMinutes: [60, 60],
      fare: null,
      passengerService: true,
      vesselType: "ferry",
      bidirectional: false,
      fareBasis: "one-way",
      operatingPeriods: [{ from: "12-01", to: "02-28" }],
    };
    expect(
      isServiceActive(winterService, {
        travelDate: new Date(2026, 0, 15, 12), // Jan 15
      }),
    ).toBe(true);
    expect(
      isServiceActive(winterService, {
        travelDate: new Date(2026, 11, 15, 12), // Dec 15
      }),
    ).toBe(true);
    expect(
      isServiceActive(winterService, {
        travelDate: new Date(2026, 6, 15, 12), // Jul 15
      }),
    ).toBe(false);
    // Conservative season rule: the WHOLE season must fit in the period.
    expect(isServiceActive(winterService, { season: "winter" })).toBe(true);
    expect(isServiceActive(winterService, { season: "summer" })).toBe(false);
    expect(isServiceActive(winterService, { season: "spring" })).toBe(false);
  });

  it("trip availability uses outbound (first) and return (last) dates separately", () => {
    const dest = byId.get("tomogashima-islands")!;
    // WINTER OPERATION (real data): a Jan 16–17 (Sat–Sun) weekend trip is
    // available.
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2027-01-16T12:00:00+09:00"),
        new Date("2027-01-17T12:00:00+09:00"),
      ]),
    ).toBe(true);
    // WINTER WEEKDAYS (real data): Jan 18–19 (Mon–Tue) has no ferry.
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2027-01-18T12:00:00+09:00"),
        new Date("2027-01-19T12:00:00+09:00"),
      ]),
    ).toBe(false);
    // YEAR-END CLOSURE (real data, 12/29–1/3): a trip whose RETURN leg
    // crosses the closure is unavailable — the reviewer's exact case.
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2026-12-26T12:00:00+09:00"),
        new Date("2027-01-02T12:00:00+09:00"),
      ]),
    ).toBe(false);
    // Both legs inside the closure: unavailable.
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2026-12-31T12:00:00+09:00"),
        new Date("2027-01-02T12:00:00+09:00"),
      ]),
    ).toBe(false);
    // The outbound/return split itself is pinned against restricted
    // fixture data in Kai42FerryClosureRegression.test.ts.
  });
});

describe("KAI-42 island destination recommendations", () => {
  it("Tomogashima is ferry-reachable in summer AND winter (winter operation)", () => {
    const dest = byId.get("tomogashima-islands")!;
    const summer: FerryTemporalContext = {
      travelDate: new Date("2026-08-06T12:00:00+09:00"),
    };
    const winter: FerryTemporalContext = {
      travelDate: new Date("2026-01-17T12:00:00+09:00"), // a winter Saturday
    };
    const summerEstimate = getFerryTransportEstimate(dest, WAKAYAMA, summer);
    expect(summerEstimate?.available).toBe(true);
    // Winter operation exists (Jan–Feb, weekends/holidays): the route is
    // available, not suspended. The fare window (¥2,800 from 2026-07-01)
    // has not started, so the cost is honestly unavailable.
    const winterEstimate = getFerryTransportEstimate(dest, WAKAYAMA, winter);
    expect(winterEstimate).not.toBeNull();
    expect(winterEstimate?.available).toBe(true);
    expect(winterEstimate?.costUnavailable).toBe(true);
  });

  it("Tsushima fares respect their validity window (expiry is enforced)", () => {
    // The real Kyusyu Yusen records carry no window; KAI-42 explicitly
    // names Tsushima, so the expiry semantics are pinned on the Tsushima
    // pair with a synthetic seasonal fare window.
    const base = services.find((s) => s.id === "kyusyu-yusen-jetfoil")!;
    const seasonal: FerryService = {
      ...base,
      id: "synthetic-tsushima-seasonal",
      fare: [10_000, 12_000],
      fareValidFrom: "2026-07-01",
      fareValidTo: "2026-09-30",
    };
    expect(
      isFareValid(seasonal, {
        travelDate: new Date("2026-08-15T12:00:00+09:00"),
      }),
    ).toBe(true);
    expect(
      isFareValid(seasonal, {
        travelDate: new Date("2026-12-15T12:00:00+09:00"),
      }),
    ).toBe(false);
    // Conservative season rule: the WHOLE season must fit in the window —
    // summer starts 06-01, before the 07-01 window, so it fails closed.
    expect(isFareValid(seasonal, { season: "winter" })).toBe(false);
    expect(isFareValid(seasonal, { season: "summer" })).toBe(false);
  });

  it("island ferry fares stay within a sane band of the published estimates", () => {
    // Spot-check the well-known published fares (2026-08 sources):
    // Ogasawara 35,760+ JPY, Sado jetfoil 8,250, Naoshima ~370.
    const fareById: Record<string, [number, number]> = {};
    for (const s of services) fareById[s.id] = s.fare ?? [0, 0];
    expect(fareById["ogasawara-kaiun-ferry"]?.[0]).toBeGreaterThan(20_000);
    expect(fareById["ogasawara-kaiun-ferry"]?.[1]).toBeGreaterThan(20_000);
    expect(fareById["sado-kisen-jetfoil"]?.[0]).toBeGreaterThan(5_000);
    expect(fareById["shikoku-kisen-uno-naoshima"]?.[0]).toBeGreaterThan(300);
  });
});

function portDistanceKm(fromPortId: string, toPortId: string): number {
  const ports = (
    realFerryData as unknown as {
      ports: Array<{
        id: string;
        coordinates: { lat: number; lng: number };
      }>;
    }
  ).ports;
  const from = ports.find((p) => p.id === fromPortId);
  const to = ports.find((p) => p.id === toPortId);
  if (!from || !to) return 0;
  const R = 6371;
  const dLat = ((to.coordinates.lat - from.coordinates.lat) * Math.PI) / 180;
  const dLng = ((to.coordinates.lng - from.coordinates.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.coordinates.lat * Math.PI) / 180) *
      Math.cos((to.coordinates.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
