import { describe, expect, it } from "vitest";
import { calculateScore, getValidModes } from "../RecommendationScorer";
import { estimateTripDuration } from "../TripDurationService";
import { runRecommendationPipeline } from "../RecommendationPipeline";
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
    // KOJ→KUM and ITM→KUM are year-round: available without a travel date.
    for (const origin of [KAGOSHIMA, OSAKA]) {
      const estimate = getFlightTransportEstimate(dest, origin);
      expect(estimate?.details?.arrivalAirportCode).toBe("KUM");
    }
    // FUK→KUM is seasonal (Jul 1–Aug 31, JAC): available only inside the
    // window. KAI-63 D7b: KOJ now survives the Fukuoka candidate limit, so
    // year-round KOJ→KUM serves Yakushima off-season too.
    const inSeason = getFlightTransportEstimate(
      dest,
      FUKUOKA,
      new Date("2026-08-01T12:00:00"),
    );
    expect(inSeason?.details?.arrivalAirportCode).toBe("KUM");
    const offSeason = getFlightTransportEstimate(
      dest,
      FUKUOKA,
      new Date("2026-12-10T12:00:00"),
    );
    expect(offSeason?.details?.departureAirportCode).toBe("KOJ");
    expect(offSeason?.details?.arrivalAirportCode).toBe("KUM");
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

  it("unverified fare routes keep the explicit adjusted budget unavailable", () => {
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
    expect(adjustedBudget).toBeNull();
  });

  it("Fukuoka → Ishigaki is not scored as a zero-cost Flight and budget is transport-excluded", () => {
    const dest = byId.get("ishigaki-city")!;
    const budgetEst = getEstimatedBudgetRange(
      dest,
      "flight",
      2,
      "standard",
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
});

describe("pipeline-level budget filtering and metadata", () => {
  it("Fukuoka → Ishigaki is retained as affordability-unknown with transportIncluded=false", () => {
    const dest = byId.get("ishigaki-city")!;
    const results = runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 5000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: FUKUOKA,
      originZoneId: "mainland-kyushu",
    });

    expect(results.length).toBe(1);
    const candidate = results[0];
    expect(candidate.id).toBe("ishigaki-city");
    expect(candidate.estimatedCostTransportIncluded).toBe(false);
    expect(candidate.pipeline.estimatedCostTransportIncluded).toBe(false);

    // Verify downstream explainability creates NO full-trip budget reasons
    const match = candidate.match;
    expect(
      match.reasons.some(
        (r) => r.code === "budgetGreatValue" || r.code === "budgetWithin",
      ),
    ).toBe(false);
  });

  it("HND → Ishigaki with verified fare continues through hard budget filter and stores transportIncluded=true", () => {
    const dest = byId.get("ishigaki-city")!;
    // Budget 20,000 is below Tokyo -> Ishigaki verified cost (~106,000), so it MUST be filtered out
    const lowResults = runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: TOKYO,
      originZoneId: "mainland-honshu",
      tripMode: "weekend_2d1n",
    });
    expect(lowResults.length).toBe(0);

    // Budget 200,000 is above verified cost, so it IS admitted and stores transportIncluded=true
    // Keep this budget-only regression outside the Day Trip + Any 14h envelope.
    const highResults = runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 200000,
      carMode: "none",
      publicModes: ["flight"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: TOKYO,
      originZoneId: "mainland-honshu",
      tripMode: "weekend_2d1n",
    });
    expect(highResults.length).toBe(1);
    expect(highResults[0].estimatedCostTransportIncluded).toBe(true);
    expect(highResults[0].pipeline.estimatedCostTransportIncluded).toBe(true);
  });

  it("corridor-only fare cannot hard-pass affordability (retained as unknown)", () => {
    // KAI-12: Omiya → Sendai shinkansen is a verified tokyo-endpoint corridor
    // with a corridor fare (~¥11,000 one-way) but no station-specific or
    // local-access cost. Complete affordability is unknown: the candidate
    // must be retained even when the corridor fare alone exceeds the budget
    // (¥20,000 < ¥44,780 round trip for two), never hard-passed or hard-failed.
    const dest = byId.get("sendai-city")!;
    const omiya = { lat: 35.9063, lng: 139.6239 };
    const scopeCheck = getEstimatedBudgetRange(
      dest,
      "shinkansen",
      2,
      "standard",
      omiya,
    );
    expect(scopeCheck.transportFareScope).toBe("corridor_only");

    const results = runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["shinkansen"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: omiya,
      originZoneId: "mainland-honshu",
      tripMode: "weekend_2d1n",
    });
    expect(results.length).toBe(1);
    expect(results[0].estimatedCostTransportScope).toBe("corridor_only");
  });

  it("complete fare still participates in hard affordability", () => {
    // KAI-12: a user at Tokyo Station with a destination at Nagoya Station
    // has a verified COMPLETE shinkansen fare (no access overhead). A
    // ¥20,000 budget must exclude it; a ¥60,000 budget admits it.
    const dest = {
      ...byId.get("nagoya-city")!,
      coordinates: { lat: 35.1709, lng: 136.8815 },
      municipalityId: "Aichi:nagoya",
    } as Destination;
    const tokyo = { lat: 35.6812, lng: 139.7671 };
    const scopeCheck = getEstimatedBudgetRange(
      dest,
      "shinkansen",
      2,
      "standard",
      tokyo,
    );
    expect(scopeCheck.transportFareScope).toBe("complete");

    const low = runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["shinkansen"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: tokyo,
      originZoneId: "mainland-honshu",
      tripMode: "weekend_2d1n",
    });
    expect(low.length).toBe(0);

    const high = runRecommendationPipeline([dest], {
      vibe: "any",
      budget: 80000,
      carMode: "none",
      publicModes: ["shinkansen"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: tokyo,
      originZoneId: "mainland-honshu",
      tripMode: "weekend_2d1n",
    });
    expect(high.length).toBe(1);
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

  it("Tokyo → Ogasawara ferry is now estimable", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const dest = byId.get("ogasawara-islands-tokyo")!;
    // public selection includes "ferry" in ALL_PUBLIC_MODES now
    const modes = getValidModes(
      dest,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toEqual(["ferry"]);
    expect(hasFerryRoute("mainland-honshu", "ogasawara")).toBe(true);
    // Trip-duration estimation works with an estimable mode.
    const estimate = estimateTripDuration(
      dest,
      { homeStationCoords: TOKYO, tripDuration: "fullDay" },
      modes,
    );
    expect(estimate).not.toBeNull();
  });

  it("Ogasawara never returns flight or land modes from any selection", () => {
    // When ferry is not in the selection, no modes are returned.
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
    // KAI-87: ogasawara-islands-tokyo no longer carries train (ferry-only);
    // use a mainland train-bearing destination so null mode must never
    // price an origin train.
    const dest = byId.get("fujiyoshida-city")!;
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

  it("Kouri production record is Bus-only, never Train", () => {
    // KAI-63: Naha now participates in the verified naha⇔nago highway-bus
    // corridor, so Kouri (nago-side) gains an estimable Bus mode. Rail stays
    // out: Okinawa has no intercity rail (Yui Rail is Naha-local) and no
    // shinkansen.
    const dest = byId.get("kouri-island-okinawa")!;
    const modes = getValidModes(
      dest,
      "none",
      ["train", "shinkansen", "bus"],
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(modes).toEqual(["bus"]);
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

describe("car/my_car cross-zone authorization", () => {
  const TOKYO_COORDS = { lat: 35.6812, lng: 139.7671 };
  const FUKUOKA_COORDS = { lat: 33.5902, lng: 130.4017 };
  const SAPPORO_COORDS = { lat: 43.0618, lng: 141.3545 };

  it("Honshu → Kyushu with my_car authorizes road mode", () => {
    const dest = byId.get("kumamoto-castle")!;
    const modes = getValidModes(
      dest,
      "my_car",
      ["train", "shinkansen", "bus", "flight"],
      TOKYO_COORDS,
      undefined,
      "mainland-honshu",
    );
    expect(modes).toContain("my_car");
  });

  it("Honshu → Shikoku with my_car authorizes road mode", () => {
    const dest = byId.get("kochi-castle")!;
    const modes = getValidModes(
      dest,
      "my_car",
      ["train", "shinkansen", "bus"],
      TOKYO_COORDS,
      undefined,
      "mainland-honshu",
    );
    expect(modes).toContain("my_car");
  });

  it("Honshu → Hokkaido with my_car does NOT authorize car", () => {
    const dest = byId.get("sapporo-city")!;
    const modes = getValidModes(
      dest,
      "my_car",
      ["train", "shinkansen", "bus", "flight"],
      TOKYO_COORDS,
      undefined,
      "mainland-honshu",
    );
    // No car in the Honshu↔Hokkaido edge
    expect(modes).not.toContain("my_car");
    expect(modes).not.toContain("car");
  });

  it("Honshu → Kyushu with rental car authorizes car", () => {
    const dest = byId.get("kumamoto-castle")!;
    const modes = getValidModes(
      dest,
      "rental",
      ["train", "shinkansen", "bus", "flight"],
      TOKYO_COORDS,
      undefined,
      "mainland-honshu",
    );
    expect(modes).toContain("car");
  });

  it("destination without road support excludes car/my_car", () => {
    // Ogasawara has no road transportOptions
    const dest = byId.get("ogasawara-islands-tokyo")!;
    const modes = getValidModes(
      dest,
      "my_car",
      ["train", "shinkansen", "bus"],
      TOKYO_COORDS,
      undefined,
      "mainland-honshu",
    );
    expect(modes).not.toContain("my_car");
    expect(modes).not.toContain("car");
  });

  it("destination without train support cannot receive estimated train", () => {
    // Sakurajima has localAccessModes [car, my_car, bus] — no train
    const dest = byId.get("sakurajima-volcano-kagoshima")!;
    const modes = getValidModes(
      dest,
      "none",
      ["train", "bus"],
      FUKUOKA_COORDS,
      undefined,
      "mainland-kyushu",
    );
    expect(modes).not.toContain("train");
  });

  it("Hokkaido → Honshu with authorized train may estimate train when canonical absent", () => {
    // Train is in the Honshu↔Hokkaido edge (via Shinkansen tunnel);
    // my_car is not, but train should be authorized.
    const dest = byId.get("tokyo-station-chiyoda")!;
    const modes = getValidModes(
      dest,
      "none",
      ["train", "shinkansen"],
      SAPPORO_COORDS,
      undefined,
      "hokkaido",
    );
    expect(modes).toContain("train");
  });
});

// ── KAI-63 verified corridor/hub coverage (PR #172) ──────────────────────────

const YOKOHAMA = { lat: 35.4657, lng: 139.6222 };

describe("KAI-63 corridor coverage from Kanagawa (PR #172)", () => {
  it.each(["nagoya-city", "kyoto-city", "osaka-city"])(
    "Yokohama → %s authorizes Train via the verified kanagawa corridor",
    (id) => {
      const dest = byId.get(id)!;
      expect(dest).toBeDefined();
      const modes = getValidModes(
        dest,
        "none",
        ["train", "shinkansen"],
        YOKOHAMA,
        undefined,
        undefined,
        undefined,
      );
      expect(modes).toContain("train");
    },
  );

  it("Yokohama → Utsunomiya authorizes Shinkansen via the Utsunomiya hub (tokyo⇔tochigi corridor)", () => {
    for (const id of ["utsunomiya-city", "utsunomiya-oya"]) {
      const modes = getValidModes(
        byId.get(id)!,
        "none",
        ["shinkansen"],
        YOKOHAMA,
        undefined,
        undefined,
        undefined,
      );
      expect(modes).toContain("shinkansen");
    }
  });

  it("Nikko and Ashikaga stay outside the 30 km Shinkansen access catchment", () => {
    // Nikko (≈34 km) and Ashikaga (≈40 km) from their respective hubs are
    // beyond the 30 km arrival radius: no fabricated gateway access is
    // claimed. They remain train-eligible via local rail, never Shinkansen.
    for (const id of ["nikko-city", "ashikaga-city"]) {
      const modes = getValidModes(
        byId.get(id)!,
        "none",
        ["train", "shinkansen"],
        YOKOHAMA,
        undefined,
        undefined,
        undefined,
      );
      expect(modes).toContain("train");
      expect(modes).not.toContain("shinkansen");
    }
  });
});

describe("KAI-63 Shinkansen hub coverage from Kyushu (PR #172)", () => {
  const FUKUOKA = { lat: 33.5902, lng: 130.4017 };

  it.each([
    "akiyoshido-cave-yamaguchi",
    "mine-city",
    "akiyoshidai-plateau",
    "akiyoshidai",
  ])("Fukuoka → %s authorizes Shinkansen via the Shin-Yamaguchi hub", (id) => {
    const modes = getValidModes(
      byId.get(id)!,
      "none",
      ["shinkansen"],
      FUKUOKA,
      undefined,
      undefined,
      undefined,
    );
    expect(modes).toContain("shinkansen");
  });

  it("Fukuoka → Saga authorizes Shinkansen via the Shin-Tosu hub (municipality wiring)", () => {
    for (const id of ["saga-castle", "yoshinogari"]) {
      const modes = getValidModes(
        byId.get(id)!,
        "none",
        ["shinkansen"],
        FUKUOKA,
        undefined,
        undefined,
        undefined,
      );
      expect(modes).toContain("shinkansen");
    }
  });

  it("Hagi (36 km from Shin-Yamaguchi) stays outside the 30 km catchment", () => {
    const modes = getValidModes(
      byId.get("hagi-castle")!,
      "none",
      ["shinkansen"],
      FUKUOKA,
      undefined,
      undefined,
      undefined,
    );
    expect(modes).not.toContain("shinkansen");
  });
});
