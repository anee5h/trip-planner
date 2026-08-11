import { describe, expect, it } from "vitest";
import {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  MAX_ACCOMMODATION_ALLOWANCE,
  isValidAccommodationAllowance,
  calculateItemizedTripCost,
  getAdjustedBudget,
  getEstimatedBudgetRange,
  getDiningFoodRange,
  getTransportCost,
  isFreeDestination,
  formatLocalizedJPYRange,
} from "../BudgetService";
import * as BudgetServiceModule from "../BudgetService";
import type { Destination } from "@/shared/types/destination";

const mockPaidDest = {
  id: "shibuya-sky",
  name: "Shibuya Sky",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  budgetRecommended: 8000,
  recommendedVisitHours: { min: 1, max: 2 },
  totalTripHours: 3,
  transportOptions: { train: 30 },
} as unknown as Destination;

const mockFreeDest = {
  id: "meiji-jingu",
  name: "Meiji Jingu",
  categories: ["Shrine"],
  tags: ["Free"],
  budgetMin: 0,
  budgetMax: 1000,
  recommendedVisitHours: { min: 1, max: 2 },
  totalTripHours: 2,
  transportOptions: { train: 20 },
} as unknown as Destination;

describe("BudgetService", () => {
  it("formats localized JPY range accurately", () => {
    expect(formatLocalizedJPYRange([7000, 26000], "en")).toBe("¥7k–26k");
    expect(formatLocalizedJPYRange([7000, 26000], "ja")).toBe("¥7千〜2.6万");
  });

  it("identifies free destinations accurately", () => {
    expect(isFreeDestination(mockFreeDest)).toBe(true);
    expect(isFreeDestination(mockPaidDest)).toBe(false);
  });

  it("calculates zero ticket cost for free destinations", () => {
    const itemizedFree = calculateItemizedTripCost(mockFreeDest, {
      partySize: 2,
    });
    expect(itemizedFree.isFreeTicket).toBe(true);
    expect(itemizedFree.tickets).toBe(0);
    expect(itemizedFree.perPersonRange[0]).toBeGreaterThan(0);
  });

  it("calculates itemized breakdown and party totals for paid destinations", () => {
    const itemizedPaid = calculateItemizedTripCost(mockPaidDest, {
      partySize: 2,
      activeMode: "train",
    });
    expect(itemizedPaid.isFreeTicket).toBe(false);
    expect(itemizedPaid.tickets).toBeGreaterThan(0);
    expect(itemizedPaid.transport).toBeGreaterThan(0);
    expect(itemizedPaid.partyRange[0]).toBeGreaterThan(
      itemizedPaid.perPersonRange[0],
    );
  });

  it("derives budget duration from recommendedVisitHours, never legacy totalTripHours", () => {
    const base = {
      ...mockPaidDest,
      recommendedVisitHours: { min: 1, max: 2 },
      totalTripHours: 3,
    };
    const staleLegacy = {
      ...mockPaidDest,
      recommendedVisitHours: { min: 1, max: 2 },
      totalTripHours: 12,
    };
    const noLegacy = {
      ...mockPaidDest,
      recommendedVisitHours: { min: 1, max: 2 },
      totalTripHours: undefined,
    };
    expect(getEstimatedBudgetRange(base, "train", 1, "standard")).toEqual(
      getEstimatedBudgetRange(staleLegacy, "train", 1, "standard"),
    );
    expect(getEstimatedBudgetRange(base, "train", 1, "standard")).toEqual(
      getEstimatedBudgetRange(noLegacy, "train", 1, "standard"),
    );
  });

  it("uses a mode-specific duration so train and shinkansen get their own meal buckets", () => {
    const twoModeDest = {
      ...mockPaidDest,
      id: "kyoto-two-mode",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      recommendedVisitHours: { min: 4, max: 4 },
      transportOptions: { train: 60, shinkansen: 30 },
      budgetBreakdown: {
        transport: 1000,
        tickets: 2000,
        food: 1500,
        cafe: 500,
      },
    } as unknown as Destination;
    const osaka = { lat: 34.6937, lng: 135.5023 };

    const trainBudget = getEstimatedBudgetRange(
      twoModeDest,
      "train",
      1,
      "standard",
      osaka,
    );
    const shinkansenBudget = getEstimatedBudgetRange(
      twoModeDest,
      "shinkansen",
      1,
      "standard",
      osaka,
    );

    expect(trainBudget.durationIncluded).toBe(true);
    expect(shinkansenBudget.durationIncluded).toBe(true);
    expect(trainBudget.food).not.toBeNull();
    expect(shinkansenBudget.food).not.toBeNull();
    // Shinkansen keeps the trip under 5h (lunch only); the slower train
    // crosses the 5h threshold and adds dinner. Reusing the fastest-mode
    // duration would give both modes the same meal bucket.
    expect(shinkansenBudget.food![1]).toBeLessThan(trainBudget.food![0]);
    expect(trainBudget.range).not.toEqual(shinkansenBudget.range);
  });

  it("never fabricates a meal count when trip duration is unknown", () => {
    const noVisit = {
      ...mockPaidDest,
      recommendedVisitHours: undefined,
      totalTripHours: undefined,
    } as unknown as Destination;
    const result = getEstimatedBudgetRange(noVisit, "train", 1, "standard");

    expect(getDiningFoodRange("standard", undefined, 1)).toBeNull();
    expect(result.durationIncluded).toBe(false);
    expect(result.food).toBeNull();
    expect(result.range).toBeNull();
  });

  it("never fabricates a rental tier when trip duration is unknown", () => {
    const noVisitCar = {
      ...mockPaidDest,
      recommendedVisitHours: undefined,
      totalTripHours: undefined,
      transportOptions: { car: 60 },
    } as unknown as Destination;

    expect(getTransportCost(noVisitCar, "car", 2)).toBeNull();
  });

  it("has no generic duration fallback constant", () => {
    expect(
      (BudgetServiceModule as unknown as Record<string, unknown>)
        .UNKNOWN_TRIP_DURATION_HOURS,
    ).toBeUndefined();
  });

  describe("ACCOMMODATION_ALLOWANCE_PRESETS", () => {
    it("has exact preset values", () => {
      expect(ACCOMMODATION_ALLOWANCE_PRESETS.economy).toBe(8000);
      expect(ACCOMMODATION_ALLOWANCE_PRESETS.standard).toBe(15000);
      expect(ACCOMMODATION_ALLOWANCE_PRESETS.comfortable).toBe(25000);
    });
  });

  describe("isValidAccommodationAllowance", () => {
    it("rejects negative values", () => {
      expect(isValidAccommodationAllowance(-1)).toBe(false);
    });

    it("accepts zero", () => {
      expect(isValidAccommodationAllowance(0)).toBe(true);
    });

    it("accepts standard preset", () => {
      expect(isValidAccommodationAllowance(15000)).toBe(true);
    });

    it("accepts MAX_ACCOMMODATION_ALLOWANCE", () => {
      expect(isValidAccommodationAllowance(MAX_ACCOMMODATION_ALLOWANCE)).toBe(
        true,
      );
    });

    it("rejects value above MAX_ACCOMMODATION_ALLOWANCE", () => {
      expect(
        isValidAccommodationAllowance(MAX_ACCOMMODATION_ALLOWANCE + 1),
      ).toBe(false);
    });

    it("rejects non-integer values", () => {
      expect(isValidAccommodationAllowance(12.5)).toBe(false);
    });

    it("rejects NaN", () => {
      expect(isValidAccommodationAllowance(NaN)).toBe(false);
    });
  });

  describe("calculateItemizedTripCost with accommodationAllowance", () => {
    it("adds accommodationAllowance to party range exactly once", () => {
      const base = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        activeMode: "train",
        accommodationAllowance: 0,
      });
      const withAllowance = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        activeMode: "train",
        accommodationAllowance: 15000,
      });

      expect(withAllowance.partyRange[0]).toBe(base.partyRange[0] + 15000);
      expect(withAllowance.partyRange[1]).toBe(base.partyRange[1] + 15000);
      expect(withAllowance.accommodationAllowance).toBe(15000);
    });

    it("includes accommodation in perPerson range", () => {
      const base = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        activeMode: "train",
        accommodationAllowance: 0,
      });
      const withAllowance = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        activeMode: "train",
        accommodationAllowance: 10000,
      });

      expect(withAllowance.perPersonRange[0]).toBe(
        base.perPersonRange[0] + 5000,
      );
      expect(withAllowance.perPersonRange[1]).toBe(
        base.perPersonRange[1] + 5000,
      );
    });

    it("defaults accommodationAllowance to 0 and field to 0", () => {
      const result = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        activeMode: "train",
      });
      expect(result.accommodationAllowance).toBe(0);
    });

    it("still includes allowance when transport is unavailable", () => {
      const baseNoTransport = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        accommodationAllowance: 0,
      });
      const withAllowance = calculateItemizedTripCost(mockPaidDest, {
        partySize: 2,
        accommodationAllowance: 20000,
      });

      expect(withAllowance.partyRange[0]).toBe(
        baseNoTransport.partyRange[0] + 20000,
      );
      expect(withAllowance.partyRange[1]).toBe(
        baseNoTransport.partyRange[1] + 20000,
      );
      expect(withAllowance.transport).toBe(0);
    });
  });

  describe("KAI-12 verified fare precedence", () => {
    const OSAKA_COORDS = { lat: 34.7025, lng: 135.4959 };
    const TOKYO_COORDS = { lat: 35.6812, lng: 139.7671 };
    const SHINAGAWA_COORDS = { lat: 35.6285, lng: 139.7387 };
    const SENDAI_COORDS = { lat: 38.268, lng: 140.87 };

    const dest = (id: string, prefecture: string, municipalityId?: string) =>
      ({
        id,
        prefecture,
        municipalityId,
        transportOptions: {},
      }) as unknown as Destination;

    it("verified shinkansen fare wins over the heuristic (Osaka→Fukuoka)", () => {
      const fukuoka = dest("fukuoka-dest", "Fukuoka", "Fukuoka:fukuoka");
      // Verified osaka→fukuoka shinkansen [140,240] fare [15520,16020]
      // reserved (Sakura/Kodama → Nozomi/Mizuho, FARE_POLICY §2).
      const cost = getTransportCost(fukuoka, "shinkansen", 1, OSAKA_COORDS);
      expect(cost).toBe(Math.floor(((15520 + 16020) / 2) * 2 * 1));
    });

    it("heuristic fallback when no verified fare exists (Tokyo→Kyoto)", () => {
      const kyoto = dest("kyoto-dest", "Kyoto", "Kyoto:kyoto");
      // tokyo→kyoto shinkansen [135,220] has no verified fare → heuristic.
      const cost = getTransportCost(kyoto, "shinkansen", 1, TOKYO_COORDS);
      const mins = Math.round((135 + 220) / 2);
      const oneWayHeuristic = Math.round(2200 + mins * 62);
      expect(cost).toBe(Math.floor(oneWayHeuristic * 2 * 1));
    });

    it("unknown fare stays unknown (no corridor → no fabricated price)", () => {
      const kagawa = dest("kagawa-dest", "Kagawa", "Kagawa:takamatsu");
      expect(
        getTransportCost(kagawa, "shinkansen", 1, TOKYO_COORDS),
      ).toBeNull();
    });

    it("verified fixed bus fare flows through (Sendai→Yamagata)", () => {
      const yamagata = dest("yamagata-dest", "Yamagata", "Yamagata:yamagata");
      // Verified sendai→yamagata bus fare [1100,1100] fixed.
      const cost = getTransportCost(yamagata, "bus", 1, SENDAI_COORDS);
      expect(cost).toBe(Math.floor(1100 * 2 * 1));
    });

    it("dynamic bus fare uses the verified floor, never an invented fixed price", () => {
      const nagano = dest("nagano-dest", "Nagano", "Nagano:nagano");
      // tokyo→nagano bus [240,330] fare [3500, null] dynamic ("from ¥3,500"):
      // the budget uses the verified lower bound, not a fabricated upper.
      const cost = getTransportCost(nagano, "bus", 1, TOKYO_COORDS);
      expect(cost).toBe(Math.floor(3500 * 2 * 1));
    });

    it("catchment bus fare stays corridor-only and never includes access cost", () => {
      const osaka = dest("osaka-dest", "Osaka", "Osaka:osaka");
      const cost = getTransportCost(osaka, "bus", 1, SHINAGAWA_COORDS);
      expect(cost).toBe(Math.floor(((3300 + 19000) / 2) * 2));
      expect(
        getEstimatedBudgetRange(
          {
            ...osaka,
            recommendedVisitHours: { min: 1, max: 2 },
          } as Destination,
          "bus",
          1,
          "standard",
          SHINAGAWA_COORDS,
        ).transportFareScope,
      ).toBe("corridor_only");
    });

    it("canonical catchment mode is not vetoed by stale transportOptions", () => {
      const osaka = dest("osaka-dest", "Osaka", "Osaka:osaka");
      const onsiteBudget = (5000 - 3000) / 2;
      const corridorFare = Math.floor(((3300 + 19000) / 2) * 2);

      expect(
        getAdjustedBudget(osaka, "bus", 1, SHINAGAWA_COORDS, "mainland-honshu"),
      ).toBe(onsiteBudget + corridorFare);
    });

    it("round-trip × party scaling applies to the verified fare", () => {
      const fukuoka = dest("fukuoka-dest", "Fukuoka", "Fukuoka:fukuoka");
      const perPersonRoundTrip = Math.floor(((15520 + 16020) / 2) * 2);
      expect(getTransportCost(fukuoka, "shinkansen", 3, OSAKA_COORDS)).toBe(
        perPersonRoundTrip * 3,
      );
      expect(getTransportCost(fukuoka, "shinkansen", 1, OSAKA_COORDS)).toBe(
        perPersonRoundTrip,
      );
    });
  });
});
