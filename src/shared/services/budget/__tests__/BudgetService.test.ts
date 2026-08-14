import { describe, expect, it } from "vitest";
import {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  MAX_ACCOMMODATION_ALLOWANCE,
  isValidAccommodationAllowance,
  calculateItemizedTripCost,
  getAdjustedBudget,
  getEffectiveBudgetBreakdown,
  getEstimatedBudgetRange,
  hasKnownBudgetRange,
  getDiningFoodRange,
  getTransportCost,
  isFreeDestination,
  formatLocalizedJPYRange,
} from "../BudgetService";
import * as BudgetServiceModule from "../BudgetService";
import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";

const mockPaidDest = {
  id: "shibuya-sky",
  name: "Shibuya Sky",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  budgetRecommended: 8000,
  budgetBreakdown: { transport: 1500, tickets: 2000, food: 3000, cafe: 1500 },
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
  budgetRecommended: 0,
  budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
  recommendedVisitHours: { min: 1, max: 2 },
  totalTripHours: 2,
  transportOptions: { train: 20 },
} as unknown as Destination;

// KAI-89 review: a record with a KNOWN RANGE but NO valid breakdown must
// NOT receive a synthesized breakdown (tickets are factual-only; the
// runtime never invents admission). Itemized cost is simply unavailable.
const mockRangeOnlyDest = {
  id: "range-only-dest",
  name: "Range Only",
  categories: ["Museum"],
  budgetMin: 2000,
  budgetMax: 5000,
  budgetRecommended: 3500,
  recommendedVisitHours: { min: 1, max: 2 },
  totalTripHours: 3,
  transportOptions: { train: 30 },
} as unknown as Destination;

describe("BudgetService", () => {
  it("formats localized JPY range accurately", () => {
    expect(formatLocalizedJPYRange([7000, 26000], "en")).toBe("¥7k–26k");
    expect(formatLocalizedJPYRange([7000, 26000], "ja")).toBe("¥7千〜2.6万");
  });

  it("does not render malformed or unknown prices", () => {
    expect(formatLocalizedJPYRange([Number.NaN, Number.NaN], "en")).toBe(
      "Cost unavailable",
    );
    expect(formatLocalizedJPYRange(undefined, "ja")).toBe("料金不明");
    expect(formatLocalizedJPYRange([3000, 1000], "en")).toBe(
      "Cost unavailable",
    );
  });

  it("normalizes invalid party size without producing NaN totals", () => {
    const result = calculateItemizedTripCost(mockPaidDest, {
      activeMode: "train",
      partySize: Number.NaN,
    });
    expect(result.partyRange.every(Number.isFinite)).toBe(true);
  });

  it("keeps missing budget data distinct from free admission", () => {
    const unknown = {
      ...mockPaidDest,
      budgetMin: undefined,
      budgetMax: undefined,
      budgetRecommended: undefined,
      budgetBreakdown: undefined,
      categories: ["Museum"],
    } as unknown as Destination;
    const result = calculateItemizedTripCost(unknown);
    expect(result.budgetAvailable).toBe(false);
    expect(result.isFreeTicket).toBe(false);
    expect(formatLocalizedJPYRange(null, "en")).toBe("Cost unavailable");
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
      coordinates: { lat: 34.9858, lng: 135.7588 }, // Kyoto Station
      recommendedVisitHours: { min: 4, max: 4 },
      transportOptions: { train: 60, shinkansen: 30 },
      budgetBreakdown: {
        transport: 1000,
        tickets: 2000,
        food: 1500,
        cafe: 500,
      },
    } as unknown as Destination;
    // Shin-Osaka: at the station, so the shinkansen corridor carries no
    // fabricated access overhead and genuinely beats the direct train.
    const osaka = { lat: 34.7335, lng: 135.5001 };

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
    expect(getAdjustedBudget(noVisitCar, "car", 2)).toBeNull();
  });

  it("keeps a known onsite budget unavailable when the selected fare is unknown", () => {
    const unknownSelectedFare = {
      ...mockPaidDest,
      budgetBreakdown: {
        transport: 1000,
        tickets: 2000,
        food: 1500,
        cafe: 500,
      },
      recommendedVisitHours: undefined,
      totalTripHours: undefined,
      transportOptions: { car: 60 },
    } as unknown as Destination;

    expect(getTransportCost(unknownSelectedFare, "car", 2)).toBeNull();
    expect(getAdjustedBudget(unknownSelectedFare, "car", 2)).toBeNull();
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

    it("canonical catchment mode stays transport-visible when budget is unknown", () => {
      const osaka = dest("osaka-dest", "Osaka", "Osaka:osaka");
      const corridorFare = Math.floor(((3300 + 19000) / 2) * 2);

      expect(getTransportCost(osaka, "bus", 1, SHINAGAWA_COORDS)).toBe(
        corridorFare,
      );
      expect(
        getAdjustedBudget(osaka, "bus", 1, SHINAGAWA_COORDS, "mainland-honshu"),
      ).toBeNull();
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

describe("KAI-89 per-person budget contract", () => {
  // Real catalogue destination with an intact per-person budget and a
  // train corridor from Tokyo: nagano-city (tickets 2000 per person).
  const perPersonDest = getDestinationList("en").find(
    (d) => d.id === "nagano-city",
  ) as unknown as Destination;

  it("scales tickets/cafe linearly with party size (per-person catalogue values)", () => {
    // Legacy couple-scale math used partySize/2, which was correct ONLY at
    // party size 2 and halved solo travellers' budget. The canonical
    // contract is per-person: party 1 = 1×, party 3 = 3×.
    const p1 = getEstimatedBudgetRange(perPersonDest, "train", 1, "standard", {
      lat: 35.6812,
      lng: 139.7671,
    });
    const p2 = getEstimatedBudgetRange(perPersonDest, "train", 2, "standard", {
      lat: 35.6812,
      lng: 139.7671,
    });
    const p3 = getEstimatedBudgetRange(perPersonDest, "train", 3, "standard", {
      lat: 35.6812,
      lng: 139.7671,
    });
    const p4 = getEstimatedBudgetRange(perPersonDest, "train", 4, "standard", {
      lat: 35.6812,
      lng: 139.7671,
    });
    expect(p1.range).not.toBeNull();
    expect(p2.range).not.toBeNull();
    // The ticket component alone must scale exactly with party size.
    const mid = (r: readonly [number, number] | null | undefined) =>
      r ? (r[0] + r[1]) / 2 : NaN;
    const delta12 = mid(p2.range) - mid(p1.range);
    const delta34 = mid(p4.range) - mid(p3.range);
    // Each additional person adds (roughly) the per-person non-transport
    // spend incl. tickets; exact equality is not required (food ranges are
    // tier-based) but scaling must be clearly linear and positive.
    expect(delta12).toBeGreaterThan(1500);
    expect(delta34).toBeGreaterThan(1500);
    // The ticket component dominates the difference: verify directly that
    // tickets × party is used, not tickets × party/2.
    expect(mid(p1.range)).toBeLessThan(mid(p2.range));
    expect(mid(p2.range) * 2).toBeGreaterThan(mid(p4.range) * 0.9);
  });

  it("getAdjustedBudget scales per-person other costs with party size", () => {
    const coords = { lat: 35.6812, lng: 139.7671 };
    const a1 = getAdjustedBudget(
      perPersonDest,
      "train",
      1,
      coords,
      "mainland-honshu",
    );
    const a2 = getAdjustedBudget(
      perPersonDest,
      "train",
      2,
      coords,
      "mainland-honshu",
    );
    const a3 = getAdjustedBudget(
      perPersonDest,
      "train",
      3,
      coords,
      "mainland-honshu",
    );
    const a4 = getAdjustedBudget(
      perPersonDest,
      "train",
      4,
      coords,
      "mainland-honshu",
    );
    // other costs = (recommended - on-site transport) × party; linear.
    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    expect((a3 ?? 0) - (a2 ?? 0)).toBeCloseTo((a2 ?? 0) - (a1 ?? 0), 5);
    expect((a4 ?? 0) - (a3 ?? 0)).toBeCloseTo((a2 ?? 0) - (a1 ?? 0), 5);
    // Party 1 must NOT be half of party 2 (the legacy /2 bug).
    expect((a2 ?? 0) - (a1 ?? 0)).toBeGreaterThan(0);
    expect(a1 ?? 0).toBeGreaterThan(2000);
  });
});

describe("KAI-89 unknown-budget contract (missing ≠ 0/free)", () => {
  it("a record with no budget fields has no known range and no breakdown", () => {
    const unknown = getDestinationList("en").find(
      (d) => d.id === "amami-iriomote-natural-site",
    ) as unknown as Destination;
    expect(unknown.budgetMetadata?.method).toBe("unknown");
    expect(unknown.budgetMin).toBeUndefined();
    expect(unknown.budgetRecommended).toBeUndefined();
    expect(unknown.budgetMax).toBeUndefined();
    expect(hasKnownBudgetRange(unknown)).toBe(false);
    expect(getEffectiveBudgetBreakdown(unknown)).toBeNull();
  });

  it("unknown budget never yields a zero/positive estimate range", () => {
    const unknown = getDestinationList("en").find(
      (d) => d.id === "amami-iriomote-natural-site",
    ) as unknown as Destination;
    const r = getEstimatedBudgetRange(unknown, "train", 2, "standard", {
      lat: 35.6812,
      lng: 139.7671,
    });
    expect(r.range).toBeNull();
  });

  it("getAdjustedBudget returns null for an unknown budget", () => {
    const unknown = getDestinationList("en").find(
      (d) => d.id === "amami-iriomote-natural-site",
    ) as unknown as Destination;
    expect(
      getAdjustedBudget(
        unknown,
        "train",
        1,
        { lat: 35.6812, lng: 139.7671 },
        "mainland-honshu",
      ),
    ).toBeNull();
  });

  it("known per-person budgets still scale correctly for parties 1/2/3/4", () => {
    const d = getDestinationList("en").find(
      (x) => x.id === "nagano-city",
    ) as unknown as Destination;
    const coords = { lat: 35.6812, lng: 139.7671 };
    const mids = [1, 2, 3, 4].map((p) => {
      const r = getEstimatedBudgetRange(d, "train", p, "standard", coords);
      if (!r.range) throw new Error(`no range for party ${p}`);
      return (r.range[0] + r.range[1]) / 2;
    });
    // Each additional person adds a strictly positive per-person increment
    // (legacy couple-scale /2 made party 1 cheaper than party 2).
    for (let i = 1; i < mids.length; i += 1) {
      expect(mids[i]).toBeGreaterThan(mids[i - 1]);
    }
    // Approximate linearity: the party-4 total is ~2× the party-2 total
    // (transport round-trip is flat per party; per-person components scale).
    expect(mids[3] / mids[1]).toBeGreaterThan(1.7);
    expect(mids[3] / mids[1]).toBeLessThan(2.3);
  });
});

describe("KAI-89 no-synthetic-breakdown contract", () => {
  it("a known range WITHOUT a breakdown never gets invented admission", () => {
    const itemized = calculateItemizedTripCost(mockRangeOnlyDest, {
      partySize: 2,
      activeMode: "train",
    });
    // The range is known, but tickets are factual-only — the runtime must
    // NOT synthesize tickets=1500/2000 or a 65/35 food/cafe split.
    expect(itemized.budgetAvailable).toBe(false);
    expect(itemized.tickets).toBe(0);
    expect(itemized.food).toBeNull();
    expect(itemized.perPersonRange).toEqual([0, 0]);
    expect(getEffectiveBudgetBreakdown(mockRangeOnlyDest)).toBeNull();
  });
});
