import { describe, expect, it } from "vitest";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getTransportCost } from "@/shared/services/budget/BudgetService";
import {
  getFerryServices,
  getFerryTransportEstimate,
  serviceMatchesDirection,
} from "../FerryTransportEstimator";
import ferryData from "../../../data/ferry-estimates.json";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type { FerryService } from "../types";

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);
const services = (
  ferryData as unknown as { services: Array<Record<string, unknown>> }
).services as unknown as FerryService[];

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const OSAKA = { lat: 34.6937, lng: 135.5023 };
const KAGOSHIMA = { lat: 31.5966, lng: 130.5571 };
const WAKAYAMA = { lat: 34.2261, lng: 135.1675 };
const NIIGATA = { lat: 37.9022, lng: 139.0236 };
const TAKAMATSU = { lat: 34.3515, lng: 134.0485 };

/** Reference date inside every registered operating period. */
const SUMMER = new Date("2026-08-06T12:00:00+09:00");
/** Reference date outside every restricted operating period. */
const WINTER = new Date("2026-01-15T12:00:00+09:00");

describe("ferry port selection", () => {
  it("Kansai → Naoshima chooses Uno despite a closer unrelated port", () => {
    const dest = byId.get("naoshima-art-island-kagawa")!;
    const estimate = getFerryTransportEstimate(dest, OSAKA, SUMMER);
    expect(estimate).not.toBeNull();
    // Kada (Wakayama, ~60 km from Osaka) is closer than Uno (~160 km) but
    // has no route to Naoshima; the farther valid port must win.
    expect(estimate?.details?.departurePortName).toBe("Uno Port");
    expect(estimate?.details?.arrivalPortName).toBe(
      "Miyanoura Port (Naoshima)",
    );
  });

  it("Tokyo → Ogasawara picks Takeshiba (nearest port with a route)", () => {
    const dest = byId.get("ogasawara-islands-tokyo")!;
    const estimate = getFerryTransportEstimate(dest, TOKYO, SUMMER);
    expect(estimate).not.toBeNull();
    expect(estimate?.details?.departurePortName).toBe(
      "Takeshiba Passenger Terminal",
    );
    expect(estimate?.details?.serviceName).toBe("Ogasawara Maru");
    // ~24h crossing plus access legs.
    expect(estimate?.timeRange[0]).toBeGreaterThan(1440);
  });

  it("no route from an unrelated closer port blocks nothing, but no route means null", () => {
    // Tokyo → Naoshima: Takeshiba/Niigata are in catchment but neither has
    // a route to Miyanoura.
    const dest = byId.get("naoshima-art-island-kagawa")!;
    expect(getFerryTransportEstimate(dest, TOKYO, SUMMER)).toBeNull();
  });
});

describe("same-zone ferry routes", () => {
  it("Kagoshima → Sakurajima works via the verified route", () => {
    const dest = byId.get("sakurajima-volcano-kagoshima")!;
    const estimate = getFerryTransportEstimate(dest, KAGOSHIMA, SUMMER);
    expect(estimate).not.toBeNull();
    expect(estimate?.details?.departurePortName).toBe("Kagoshima Port");
    expect(estimate?.details?.arrivalPortName).toBe("Sakurajima Port");
    // Door-to-door: access legs + 30 min boarding buffer + 15 min sailing.
    expect(estimate?.timeRange[1]).toBeLessThan(120);
    expect(estimate?.costUnavailable).toBe(false);
  });

  it("Kagoshima → Sakurajima is authorized in getValidModes", () => {
    const dest = byId.get("sakurajima-volcano-kagoshima")!;
    const modes = getValidModes(
      dest,
      "none",
      ["train", "shinkansen", "bus", "flight", "ferry"],
      KAGOSHIMA,
      undefined,
      "mainland-kyushu",
    );
    expect(modes).toContain("ferry");
    expect(modes).not.toContain("flight");
  });

  it("same-zone destinations without a ferry route get no ferry", () => {
    const dest = byId.get("kouri-island-okinawa")!;
    expect(
      getFerryTransportEstimate(dest, { lat: 26.2124, lng: 127.6809 }, SUMMER),
    ).toBeNull();
  });
});

describe("fare basis", () => {
  it("Tomogashima round-trip fare is not doubled", () => {
    const dest = byId.get("tomogashima-islands")!;
    const estimate = getFerryTransportEstimate(dest, WAKAYAMA, SUMMER);
    expect(estimate).not.toBeNull();
    expect(estimate?.details?.ferryFareBasis).toBe("round-trip");

    const cost = getTransportCost(dest, "ferry", 2, WAKAYAMA, SUMMER);
    // costRange is already round-trip door-to-door; the cost must equal the
    // average range times party size — not doubled again.
    const expected = Math.floor(
      Math.round((estimate!.costRange[0] + estimate!.costRange[1]) / 2) * 2,
    );
    expect(cost).toBe(expected);
    // The published fare alone (¥2,000) for two people is ~¥4,000; doubling
    // it twice would exceed ¥16,000.
    expect(cost!).toBeLessThan(4000 * 2 * 2);
    expect(cost!).toBeGreaterThan(4000);
  });

  it("one-way fares are doubled for return travel", () => {
    const dest = byId.get("naoshima-art-island-kagawa")!;
    const estimate = getFerryTransportEstimate(dest, OSAKA, SUMMER);
    expect(estimate?.details?.ferryFareBasis).toBe("one-way");
    const cost = getTransportCost(dest, "ferry", 2, OSAKA, SUMMER);
    const expected = Math.floor(
      Math.round((estimate!.costRange[0] + estimate!.costRange[1]) / 2) * 2 * 2,
    );
    expect(cost).toBe(expected);
  });
});

describe("seasonal availability", () => {
  it("winter Tomogashima is unavailable", () => {
    const dest = byId.get("tomogashima-islands")!;
    expect(getFerryTransportEstimate(dest, WAKAYAMA, WINTER)).toBeNull();
  });

  it("summer Tomogashima is available", () => {
    const dest = byId.get("tomogashima-islands")!;
    expect(getFerryTransportEstimate(dest, WAKAYAMA, SUMMER)).not.toBeNull();
  });

  it("year-round routes stay available in winter", () => {
    const dest = byId.get("sakurajima-volcano-kagoshima")!;
    expect(getFerryTransportEstimate(dest, KAGOSHIMA, WINTER)).not.toBeNull();
  });
});

describe("service option integrity", () => {
  it("every registered service pairs its own fare with its own duration", () => {
    for (const service of services) {
      const found = getFerryServices(
        service.fromPort,
        service.toPort,
        SUMMER,
      ).find((s) => s.id === service.id);
      expect(found, `service ${service.id} must resolve`).toBeDefined();
      expect(found!.durationMinutes).toEqual(service.durationMinutes);
      expect(found!.fare).toEqual(service.fare);
      expect(found!.fareBasis).toEqual(service.fareBasis);
    }
  });

  it("a faster vessel never pairs with a cheaper fare than the slower one", () => {
    // For every port pair with multiple services, the fastest service's
    // minimum fare must be >= the slowest service's minimum fare — an
    // impossible duration/fare pairing (60-min jetfoil at the ferry's price)
    // would violate this.
    for (const service of services) {
      const siblings = getFerryServices(
        service.fromPort,
        service.toPort,
        SUMMER,
      );
      if (siblings.length < 2) continue;
      const fastest = [...siblings].sort(
        (a, b) => a.durationMinutes[0] - b.durationMinutes[0],
      )[0];
      const slowest = [...siblings].sort(
        (a, b) => b.durationMinutes[0] - a.durationMinutes[0],
      )[0];
      expect(
        (fastest.fare?.[0] ?? 0) >= (slowest.fare?.[0] ?? 0),
        `${service.fromPort}→${service.toPort}: ${fastest.id} must not undercut ${slowest.id}`,
      ).toBe(true);
    }
  });

  it("the estimator selects one complete service option", () => {
    // Sado from Niigata: jetfoil (60 min, ¥8,250) beats the car ferry
    // (150 min, ¥3,570) on time; the estimate must carry the jetfoil's
    // fare, never a blend of the two.
    const dest = byId.get("sado-island")!;
    const estimate = getFerryTransportEstimate(dest, NIIGATA, SUMMER);
    expect(estimate).not.toBeNull();
    expect(estimate?.details?.serviceName).toBe("Sado Kisen Jetfoil");
    const jetfoil = services.find((s) => s.id === "sado-kisen-jetfoil")!;
    expect(estimate?.costRange[0]).toBeGreaterThanOrEqual(jetfoil.fare![0]);
    expect(estimate?.costRange[1]).toBeLessThanOrEqual(jetfoil.fare![1] + 5000);
  });

  it("Takamatsu → Naoshima picks the high-speed boat as the fastest option", () => {
    const dest = byId.get("naoshima-art-island-kagawa")!;
    const estimate = getFerryTransportEstimate(dest, TAKAMATSU, SUMMER);
    expect(estimate).not.toBeNull();
    expect(estimate?.details?.serviceName).toBe(
      "Takamatsu–Miyanoura High-Speed Boat",
    );
  });
});

describe("directionality", () => {
  it("reverse direction is valid exactly where the published service supports it", () => {
    for (const service of services) {
      const forward = getFerryServices(
        service.fromPort,
        service.toPort,
        SUMMER,
      ).some((s) => s.id === service.id);
      const reverse = getFerryServices(
        service.toPort,
        service.fromPort,
        SUMMER,
      ).some((s) => s.id === service.id);
      expect(forward, `${service.id} must serve its published direction`).toBe(
        true,
      );
      expect(reverse, `${service.id} reverse must match bidirectional`).toBe(
        service.bidirectional,
      );
    }
  });

  it("a non-bidirectional service never serves the reverse direction", () => {
    const oneWayService: FerryService = {
      id: "fixture-one-way",
      fromPort: "A",
      toPort: "B",
      operator: "Fixture",
      vesselType: "ferry",
      passengerService: true,
      bidirectional: false,
      durationMinutes: [30, 30],
      fare: [1000, 1000],
      fareBasis: "one-way",
    };
    expect(serviceMatchesDirection(oneWayService, "A", "B")).toBe(true);
    expect(serviceMatchesDirection(oneWayService, "B", "A")).toBe(false);
  });
});
