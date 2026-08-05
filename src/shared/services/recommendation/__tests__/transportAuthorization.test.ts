import { describe, expect, it } from "vitest";
import { calculateScore, getValidModes } from "../RecommendationScorer";
import { estimateTripDuration } from "../TripDurationService";
import {
  hasFerryRoute,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import {
  findNearestAirports,
  getFlightRoute,
  getFlightTransportEstimate,
} from "@/shared/services/transport/FlightTransportEstimator";
import {
  calculateItemizedTripCost,
  getAdjustedBudget,
  getEstimatedBudgetRange,
  getTransportCost,
} from "@/shared/services/budget/BudgetService";
import { calculateGeneratedPlanCost } from "@/shared/services/budget/GeneratedPlanCostService";
import { resolveTransportSelection } from "@/features/home/services/TransportResolver";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const KAWASAKI = { lat: 35.5313, lng: 139.7032 };
const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const NAHA = { lat: 26.2124, lng: 127.6809 };
const ALL_MODES = ["train", "shinkansen", "bus", "flight", "car", "my_car"];

function publicSelection(coords: { lat: number; lng: number }) {
  return {
    selection: resolveTransportSelection("public"),
    zone: resolveOriginTransportZone({ coordinates: coords }),
  };
}

describe("flight registry authorization", () => {
  it("Naha → Ishigaki permits Flight and never Ferry", () => {
    const { selection, zone } = publicSelection(NAHA);
    const modes = getValidModes(
      byId.get("ishigaki-city")!,
      selection.carMode,
      selection.publicModes,
      NAHA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(modes).not.toContain("ferry");
    expect(hasFerryRoute("okinawa-main", "ishigaki")).toBe(false);
  });

  it("Naha → Miyako permits Flight and never Ferry", () => {
    const { selection, zone } = publicSelection(NAHA);
    const modes = getValidModes(
      byId.get("yonaha-maehama-beach-miyako")!,
      selection.carMode,
      selection.publicModes,
      NAHA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(modes).not.toContain("ferry");
    expect(hasFerryRoute("okinawa-main", "miyako")).toBe(false);
  });

  it("Fukuoka → Naha includes Flight", () => {
    const { selection, zone } = publicSelection(FUKUOKA);
    const modes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      FUKUOKA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(modes).not.toContain("train");
    expect(modes).not.toContain("shinkansen");
  });

  it("Tokyo → Sapporo permits Flight through HND→CTS", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const modes = getValidModes(
      byId.get("sapporo-city")!,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("Tokyo → Ishigaki permits Flight through HND→ISG and no land modes", () => {
    const { zone } = publicSelection(TOKYO);
    const modes = getValidModes(
      byId.get("ishigaki-city")!,
      "none",
      ALL_MODES,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(
      modes.some((m) =>
        ["train", "shinkansen", "bus", "car", "my_car"].includes(m),
      ),
    ).toBe(false);
  });

  it("Tokyo → Miyako permits Flight through HND→MMY", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const modes = getValidModes(
      byId.get("yonaha-maehama-beach-miyako")!,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("changing distance alone never creates or removes a route", () => {
    const { selection } = publicSelection(TOKYO);
    const tokyoModes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      "mainland-honshu",
    );
    // Kawasaki is ~20 km from Tokyo but in the same zone: same result.
    const kawasakiModes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      KAWASAKI,
      undefined,
      "mainland-honshu",
    );
    expect(kawasakiModes).toEqual(tokyoModes);
    expect(kawasakiModes).toContain("flight");
  });
});

describe("flight registry expansion (PR #102)", () => {
  const TAKAMATSU = { lat: 34.34, lng: 134.05 };
  const KAGOSHIMA = { lat: 31.5966, lng: 130.5571 };
  const OSAKA = { lat: 34.6937, lng: 135.5023 };

  it("Takamatsu → Naha includes Flight", () => {
    const { selection, zone } = publicSelection(TAKAMATSU);
    const modes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      TAKAMATSU,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("Fukuoka → Ishigaki includes Flight", () => {
    const { selection, zone } = publicSelection(FUKUOKA);
    const modes = getValidModes(
      byId.get("ishigaki-city")!,
      selection.carMode,
      selection.publicModes,
      FUKUOKA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("Sapporo ↔ Naha includes Flight in both directions", () => {
    const SAPPORO = { lat: 43.0618, lng: 141.3545 };
    const { selection: selS } = publicSelection(SAPPORO);
    const { selection: selN } = publicSelection(NAHA);
    const toNaha = getValidModes(
      byId.get("naha-city")!,
      selS.carMode,
      selS.publicModes,
      SAPPORO,
      undefined,
      "hokkaido",
    );
    const toSapporo = getValidModes(
      byId.get("sapporo-city")!,
      selN.carMode,
      selN.publicModes,
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(toNaha).toContain("flight");
    expect(toSapporo).toContain("flight");
  });

  it("Fukuoka → Tsushima includes Flight (no catalogue record; production fixture)", () => {
    const tsushimaDest = {
      id: "tsushima-fixture",
      name: "Tsushima",
      prefecture: "Nagasaki",
      transportZoneId: "tsushima",
      coordinates: { lat: 34.33, lng: 129.31 },
      transportOptions: {},
    } as Destination;
    const { selection, zone } = publicSelection(FUKUOKA);
    const modes = getValidModes(
      tsushimaDest,
      selection.carMode,
      selection.publicModes,
      FUKUOKA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("Kagoshima, Osaka and Fukuoka → Yakushima select KUM", () => {
    const dest = byId.get("yakushima-town")!;
    for (const origin of [KAGOSHIMA, OSAKA, FUKUOKA]) {
      const estimate = getFlightTransportEstimate(dest, origin);
      expect(estimate?.details?.arrivalAirportCode).toBe("KUM");
    }
  });

  it("Sado has SDO in the airport registry but still returns no Flight", () => {
    const sadoAirports = findNearestAirports(
      { lat: 38.0333, lng: 138.3833 },
      1,
    );
    expect(sadoAirports[0]?.code).toBe("SDO");
    const modes = getValidModes(
      byId.get("sado-island")!,
      "none",
      ["flight"],
      TOKYO,
      undefined,
      "mainland-honshu",
    );
    expect(modes).not.toContain("flight");
  });

  it("every added route resolves in reverse (bidirectional registry)", () => {
    for (const [a, b] of [
      ["TAK", "OKA"],
      ["FUK", "ISG"],
      ["FUK", "TSJ"],
      ["CTS", "OKA"],
      ["KOJ", "ASJ"],
      ["KOJ", "KUM"],
      ["ITM", "KUM"],
      ["FUK", "KUM"],
    ] as const) {
      expect(getFlightRoute(a, b)).not.toBeNull();
      expect(getFlightRoute(b, a)).not.toBeNull();
    }
  });

  it("unverified fare routes return null transport cost and exclude transport from adjusted budget", () => {
    const dest = byId.get("ishigaki-city")!;
    const estimate = getFlightTransportEstimate(dest, FUKUOKA);
    expect(estimate?.costUnavailable).toBe(true);

    const flightCost = getTransportCost(dest, "flight", 2, FUKUOKA);
    expect(flightCost).toBeNull();

    const genericFallback = ((dest.budgetBreakdown?.transport || 3000) / 2) * 2;
    expect(flightCost).not.toBe(genericFallback);

    const adjustedBudget = getAdjustedBudget(
      dest,
      "flight",
      2,
      FUKUOKA,
      "mainland-kyushu",
    );
    const recBudget = dest.budgetRecommended || dest.budgetMin || 5000;
    const expectedOnsiteBudget = Math.max(
      0,
      ((recBudget - (dest.budgetBreakdown?.transport || 3000)) / 2) * 2,
    );
    expect(adjustedBudget).toBe(expectedOnsiteBudget);
  });

  it("Fukuoka → Ishigaki is not scored as a zero-cost Flight and budget is transport-excluded", () => {
    const dest = byId.get("ishigaki-city")!;
    const budgetEst = getEstimatedBudgetRange(
      dest,
      "flight",
      2,
      "standard",
      dest.totalTripHours,
      FUKUOKA,
    );
    expect(budgetEst.transportIncluded).toBe(false);

    // Score for unverified flight cost must not receive a BUDGET_UNDER_BONUS
    const lowBudgetContext = {
      vibe: "any",
      budget: 100000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: FUKUOKA,
      originZoneId: "mainland-kyushu" as const,
    };
    const scoreResult = calculateScore(dest, lowBudgetContext);
    expect(scoreResult.bestModeScore).toBe(0);
  });

  it("existing routes with verified numeric fares return the correct flight cost and receive normal budget scoring", () => {
    const dest = byId.get("ishigaki-city")!;
    // Tokyo -> Ishigaki (HND->ISG) has a verified fare in flight-estimates.json
    const estimate = getFlightTransportEstimate(dest, TOKYO);
    expect(estimate?.costUnavailable).toBeFalsy();

    const flightCost = getTransportCost(dest, "flight", 2, TOKYO);
    expect(flightCost).not.toBeNull();
    expect(flightCost).toBeGreaterThan(0);

    const avgOneWay = Math.round(
      (estimate!.costRange[0] + estimate!.costRange[1]) / 2,
    );
    const expectedCost = Math.floor(avgOneWay * 2 * 2);
    expect(flightCost).toBe(expectedCost);

    const budgetEst = getEstimatedBudgetRange(
      dest,
      "flight",
      2,
      "standard",
      dest.totalTripHours,
      TOKYO,
    );
    expect(budgetEst.transportIncluded).toBe(true);

    const highBudgetContext = {
      vibe: "any",
      budget: 200000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: TOKYO,
      originZoneId: "mainland-honshu" as const,
    };
    const scoreResult = calculateScore(dest, highBudgetContext);
    expect(scoreResult.bestModeScore).toBeGreaterThan(0);
  });

  it("ASJ→OKA is absent (Yoron multi-stop service is not a nonstop)", () => {
    expect(getFlightRoute("ASJ", "OKA")).toBeNull();
    expect(getFlightRoute("OKA", "ASJ")).toBeNull();
  });
});

describe("conservative failure", () => {
  it("unknown origin → Naha returns no Train, Shinkansen, Bus or Car", () => {
    const modes = getValidModes(byId.get("naha-city")!, "none", ALL_MODES, {
      lat: 0,
      lng: 0,
    });
    expect(
      modes.some((m) =>
        ["train", "shinkansen", "bus", "car", "my_car"].includes(m),
      ),
    ).toBe(false);
  });

  it("unresolved destination zone returns no modes", () => {
    const dest = {
      ...byId.get("naha-city")!,
      id: "unresolved-dest",
      kind: "island",
      tags: ["island"],
      prefecture: "Nagano",
      coordinates: { lat: 35.4, lng: 137.4 },
      transportZoneId: undefined,
    } as Destination;
    const modes = getValidModes(dest, "none", ALL_MODES, TOKYO);
    expect(modes).toEqual([]);
  });

  it("no topology connection returns no modes", () => {
    const modes = getValidModes(
      byId.get("sado-island")!,
      "none",
      ["train", "shinkansen", "bus", "flight"],
      FUKUOKA,
    );
    expect(modes).toEqual([]);
  });
});

describe("ferry connectivity is not estimability", () => {
  it("Tokyo → Naoshima never uses ground transport across water", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const dest = byId.get("naoshima-art-island-kagawa")!;
    const modes = getValidModes(
      dest,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toEqual([]);
    expect(
      modes.some((m) =>
        ["flight", "train", "shinkansen", "car", "bus"].includes(m),
      ),
    ).toBe(false);
    // Ferry connectivity is route-known via Uno/Takamatsu but not estimable.
    expect(
      hasFerryRoute("mainland-honshu", resolveDestinationTransportZone(dest)),
    ).toBe(true);
  });

  it("Tokyo → Ogasawara is route-known but unestimated", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const dest = byId.get("ogasawara-islands-tokyo")!;
    const modes = getValidModes(
      dest,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toEqual([]);
    expect(hasFerryRoute("mainland-honshu", "ogasawara")).toBe(true);
    // No trip-duration estimate without an estimable mode.
    const estimate = estimateTripDuration(
      dest,
      { homeStationCoords: TOKYO },
      modes,
    );
    expect(estimate).toBeNull();
  });

  it("Ogasawara never returns flight or land modes from any selection", () => {
    const modes = getValidModes(
      byId.get("ogasawara-islands-tokyo")!,
      "none",
      ALL_MODES,
      TOKYO,
      undefined,
      "mainland-honshu",
    );
    expect(modes).toEqual([]);
  });

  it("no ferry route from Fukuoka to Ogasawara", () => {
    expect(hasFerryRoute("mainland-kyushu", "ogasawara")).toBe(false);
  });
});

describe("flight cost and time use the origin gateway", () => {
  it("Naha → Ishigaki time and cost both use OKA → ISG", () => {
    const dest = byId.get("ishigaki-city")!;
    const estimate = getFlightTransportEstimate(dest, NAHA);
    expect(estimate?.details?.departureAirportCode).toBe("OKA");
    expect(estimate?.details?.arrivalAirportCode).toBe("ISG");
    // Cost derives from the OKA→ISG door-to-door estimate: avg one-way ×
    // round trip × party size.
    const expected = Math.floor(
      Math.round(
        ((estimate!.costRange[0] + estimate!.costRange[1]) / 2) * 2 * 2,
      ),
    );
    expect(getTransportCost(dest, "flight", 2, NAHA)).toBe(expected);
    // Must not silently fall back to the HND→ISG price.
    const tokyoCost = getTransportCost(dest, "flight", 2, TOKYO);
    expect(tokyoCost).not.toBe(expected);
  });

  it("Naha → Miyako time and cost both use OKA → MMY", () => {
    const dest = byId.get("yonaha-maehama-beach-miyako")!;
    const estimate = getFlightTransportEstimate(dest, NAHA);
    expect(estimate?.details?.departureAirportCode).toBe("OKA");
    expect(estimate?.details?.arrivalAirportCode).toBe("MMY");
    const expected = Math.floor(
      Math.round(
        ((estimate!.costRange[0] + estimate!.costRange[1]) / 2) * 2 * 2,
      ),
    );
    expect(getTransportCost(dest, "flight", 2, NAHA)).toBe(expected);
    const tokyoCost = getTransportCost(dest, "flight", 2, TOKYO);
    expect(tokyoCost).not.toBe(expected);
  });
});

describe("no-route budget excludes origin transport", () => {
  it("calculateItemizedTripCost with null mode never prices Train", () => {
    const dest = byId.get("ogasawara-islands-tokyo")!;
    const withNull = calculateItemizedTripCost(dest, { activeMode: null });
    const withTrain = calculateItemizedTripCost(dest, { activeMode: "train" });
    expect(withNull.transport).toBe(0);
    // The null-mode total must be strictly less than the train-mode total
    // (which would price an origin train that does not exist).
    expect(withNull.partyRange[0]).toBeLessThan(withTrain.partyRange[0]);
  });

  it("generated plan costs never include origin transport", () => {
    const plan = {
      steps: [],
      isUnfeasible: false,
      totalBudgetRange: [0, 0] as [number, number],
    };
    const cost = calculateGeneratedPlanCost(plan as never, 2, "train", false);
    expect(cost.originTransport.min).toBe(0);
    expect(cost.originTransport.applicable).toBe(false);
  });

  it("generated plan with null transport uses no Train local-fare assumptions", () => {
    const leg = {
      destinationId: "test-dest",
      durationMinutes: 30,
      mode: "bus",
    };
    const plan = {
      steps: [],
      routeLegs: [leg],
      isUnfeasible: false,
      totalBudgetRange: [0, 0] as [number, number],
    };
    const nullCost = calculateGeneratedPlanCost(plan as never, 2, null);
    expect(nullCost.localTransit.min).toBe(0);
    expect(nullCost.localTransit.applicable).toBe(false);
    // The train-mode estimate must differ: it prices on-site transit.
    const trainCost = calculateGeneratedPlanCost(plan as never, 2, "train");
    expect(trainCost.localTransit.min).toBeGreaterThan(0);
    // A curated fare is real data and is still counted without a mode.
    const curatedLeg = {
      ...leg,
      curatedFare: { min: 500, max: 800 },
    };
    const curatedCost = calculateGeneratedPlanCost(
      { ...plan, routeLegs: [curatedLeg] } as never,
      2,
      null,
    );
    expect(curatedCost.localTransit.applicable).toBe(true);
    expect(curatedCost.localTransit.min).toBe(500 * 2);
  });
});

describe("destination-level local access", () => {
  const KAGOSHIMA = { lat: 31.5966, lng: 130.5571 };

  it("Naha → Naha City permits local rail", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train"],
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(modes).toContain("train");
  });

  it("Naha → Kouri Island rejects Train", () => {
    const modes = getValidModes(
      byId.get("kouri-island-okinawa")!,
      "none",
      ["train", "shinkansen", "bus"],
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(modes).not.toContain("train");
    expect(modes).not.toContain("shinkansen");
  });

  it("Kagoshima → Sakurajima rejects Train as a complete mode", () => {
    const modes = getValidModes(
      byId.get("sakurajima-volcano-kagoshima")!,
      "none",
      ["train", "shinkansen", "bus", "flight"],
      KAGOSHIMA,
      undefined,
      "mainland-kyushu",
    );
    expect(modes).not.toContain("train");
    expect(modes).not.toContain("shinkansen");
  });

  it("Sakurajima production record returns no estimable modes, never Train", () => {
    // The catalogue record backs train:180 only, but localAccessModes
    // [car, my_car, bus] authorizes only non-rail access — which has no
    // estimator or static option. The connection is route-known but
    // unestimated (localAccessUnestimated), so nothing is selectable and
    // Train is never authorized.
    const dest = byId.get("sakurajima-volcano-kagoshima")!;
    const modes = getValidModes(
      dest,
      "rental",
      ["bus", "train"],
      KAGOSHIMA,
      undefined,
      "mainland-kyushu",
    );
    expect(modes).toEqual([]);
  });

  it("Kouri production record returns no estimable modes, never Train", () => {
    const dest = byId.get("kouri-island-okinawa")!;
    const modes = getValidModes(
      dest,
      "none",
      ["train", "shinkansen", "bus"],
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(modes).toEqual([]);
  });

  it("Aoshima retains legitimate same-zone Train access and no Shinkansen", () => {
    const MIYAZAKI = { lat: 31.9077, lng: 131.4202 };
    const dest = byId.get("aoshima-island-miyazaki")!;
    const modes = getValidModes(
      dest,
      "none",
      ["train", "shinkansen", "bus"],
      MIYAZAKI,
      undefined,
      "mainland-kyushu",
    );
    // JR Aoshima Station: train is backed by the catalogue record.
    expect(modes).toContain("train");
    // Shinkansen is not direct local access.
    expect(modes).not.toContain("shinkansen");
  });
});

describe("preference ordering", () => {
  it("economy Tokyo → Naha with Train and Flight enabled returns Flight", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train", "flight"],
      TOKYO,
      "economy",
      "mainland-honshu",
    );
    expect(modes).toContain("flight");
    expect(modes).not.toEqual([]);
  });

  it("Naha-local with train enabled returns local rail", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train"],
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(modes).toContain("train");
  });
});
