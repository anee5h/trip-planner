import { describe, expect, it, beforeAll } from "vitest";
import {
  ACCOMMODATION_ALLOWANCE_PRESETS,
  MAX_ACCOMMODATION_ALLOWANCE,
  isValidAccommodationAllowance,
  calculateItemizedTripCost,
  getAdjustedBudget,
  getEffectiveBudgetBreakdown,
  getEstimatedBudgetRange,
  getSortableVerifiedBudget,
  hasKnownBudgetRange,
  getDiningFoodRange,
  getTransportCost,
  isFreeDestination,
  formatLocalizedJPYRange,
} from "../BudgetService";
import * as BudgetServiceModule from "../BudgetService";
import type { Destination } from "@/shared/types/destination";
import { getCanonicalTransportCost } from "@/shared/services/transport/transportCostV2";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import { getDestinationListAsync } from "@/shared/services/destination/DestinationService";

// KAI-121: the full catalogue is runtime-lazy; tests that need full
// destination fields must preload it before the sync accessors read it.
beforeAll(async () => {
  await loadDestinationsIndex();
});

// KAI-121: full-data accessor for tests. The loader is already awaited in
// beforeAll, so this resolves immediately with the FULL records (the sync
// getDestinationList now returns the SUMMARY catalogue).
let fullListCache:
  Partial<import("@/shared/types/destination").Destination>[] | null = null;
async function fullList() {
  if (!fullListCache) fullListCache = await getDestinationListAsync("en");
  return fullListCache;
}

const mockPaidDest = {
  id: "shibuya-sky",
  name: "Shibuya Sky",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  budgetRecommended: 8000,
  budgetBreakdown: { transport: 1500, tickets: 2000, food: 3000, cafe: 1500 },
  // KAI-204 phase 3 (positive trust): fixtures represent TRUSTED records.
  budgetMetadata: {
    method: "manual",
    confidence: "low",
    basis: "test fixture — trusted provenance",
  },
  recommendedVisitHours: { min: 1, max: 2 },
  totalTripHours: 3,
  transportOptions: { train: 30 },
  // KAI-216: explicit verified one-way fare so transport is a real number
  // (the duration heuristic that previously produced it was removed).
  transportFares: { train: 800 },
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
  // KAI-204 phase 3 (positive trust): fixtures represent TRUSTED records.
  budgetMetadata: {
    method: "manual",
    confidence: "low",
    basis: "test fixture — trusted free provenance",
  },
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
  // KAI-204 phase 3 (positive trust): trusted provenance for a known range.
  budgetMetadata: {
    method: "manual",
    confidence: "low",
    basis: "test fixture — trusted provenance",
  },
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

  it("keeps local bounded rail budgets finite but explicitly estimated", () => {
    const nearbyOsaka = {
      ...mockPaidDest,
      id: "nearby-osaka-budget",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7105, lng: 135.5005 },
      transportOptions: { train: 25 },
      localAccessModes: ["train"],
    } as unknown as Destination;
    const origin = { lat: 34.7025, lng: 135.4959 };
    const result = getEstimatedBudgetRange(
      nearbyOsaka,
      "train",
      2,
      "standard",
      origin,
    );

    expect(result.transportIncluded).toBe(true);
    expect(result.transportFareScope).toBe("local_bounded_estimate");
    expect(result.durationIncluded).toBe(true);
    expect(result.range).not.toBeNull();
    expect(getSortableVerifiedBudget(nearbyOsaka, ["train"], 2, origin)).toBe(
      result.range![1],
    );
  });

  it("keeps a missing on-site component unknown even when local transport is bounded", () => {
    const unknownOnsite = {
      ...mockPaidDest,
      id: "unknown-onsite-local-budget",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.7105, lng: 135.5005 },
      transportOptions: { train: 25 },
      localAccessModes: ["train"],
      budgetMetadata: { method: "unknown" },
      budgetBreakdown: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
      budgetRecommended: undefined,
    } as unknown as Destination;
    const result = getEstimatedBudgetRange(
      unknownOnsite,
      "train",
      2,
      "standard",
      { lat: 34.7025, lng: 135.4959 },
    );

    expect(result.transportIncluded).toBe(true);
    expect(result.transportFareScope).toBe("local_bounded_estimate");
    expect(result.range).toBeNull();
    expect(
      getSortableVerifiedBudget(unknownOnsite, ["train"], 2, {
        lat: 34.7025,
        lng: 135.4959,
      }),
    ).toBe(Number.POSITIVE_INFINITY);
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

    it("no verified fare stays unknown (no heuristic fabrication)", () => {
      const kyoto = dest("kyoto-dest", "Kyoto", "Kyoto:kyoto");
      // tokyo→kyoto shinkansen corridor [135,220] exists but has NO verified
      // fare. KAI-216 removed the duration-based heuristic: a corridor
      // without a verified fare is null (honest unavailable), never a
      // base+perMinute guess.
      const cost = getTransportCost(kyoto, "shinkansen", 1, TOKYO_COORDS);
      expect(cost).toBeNull();
      // The canonical structured result is unavailable with a reason.
      const canonical = getCanonicalTransportCost(
        kyoto,
        "shinkansen",
        1,
        TOKYO_COORDS,
      );
      expect(canonical.cost.kind).toBe("unavailable");
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
  // train corridor from Tokyo: play-museum-tachikawa (tickets 1800 per
  // person, manual provenance — ledger-verified).
  // KAI-121: resolved AFTER the lazy catalogue preload (module-level
  // resolution would read the lite summary and miss budget fields).
  // KAI-204 phase 3: uses a MANUAL record (trusted) — the previous
  // nagano-city fixture is now legacy-tagged (untrusted).
  let perPersonDest: Destination;

  beforeAll(async () => {
    perPersonDest = (await fullList()).find(
      (d) => d.id === "play-museum-tachikawa",
    ) as unknown as Destination;
  });

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
  it("a record with no budget fields has no known range and no breakdown", async () => {
    const unknown = (await fullList()).find(
      (d) => d.id === "amami-iriomote-natural-site",
    ) as unknown as Destination;
    expect(unknown.budgetMetadata?.method).toBe("unknown");
    expect(unknown.budgetMin).toBeUndefined();
    expect(unknown.budgetRecommended).toBeUndefined();
    expect(unknown.budgetMax).toBeUndefined();
    expect(hasKnownBudgetRange(unknown)).toBe(false);
    expect(getEffectiveBudgetBreakdown(unknown)).toBeNull();
  });

  it("unknown budget never yields a zero/positive estimate range", async () => {
    const unknown = (await fullList()).find(
      (d) => d.id === "amami-iriomote-natural-site",
    ) as unknown as Destination;
    const r = getEstimatedBudgetRange(unknown, "train", 2, "standard", {
      lat: 35.6812,
      lng: 139.7671,
    });
    expect(r.range).toBeNull();
  });

  it("getAdjustedBudget returns null for an unknown budget", async () => {
    const unknown = (await fullList()).find(
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

  it("known per-person budgets still scale correctly for parties 1/2/3/4", async () => {
    // KAI-204 phase 3: nagano-city is now legacy-tagged (untrusted); use
    // the manual ledger-verified play-museum-tachikawa (tickets 1800).
    const d = (await fullList()).find(
      (x) => x.id === "play-museum-tachikawa",
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

describe("KAI-89 on-site transport inclusion (blocker: boso economy crossing)", () => {
  const TOKYO = { lat: 35.6812, lng: 139.7671 };

  it("getEstimatedBudgetRange includes the per-person on-site transit allowance", async () => {
    // boso-peninsula: breakdown {transport:7467, tickets:0, food:6400,
    // cafe:2133}. Without on-site transport the party-2 economy max was
    // ~17,667 (PASSED economy ≤ 20,000); with 7467×2 it is ~32,718 and must
    // be EXCLUDED from the economy tier. Removing budgetBreakdown.transport
    // from the origin-aware calculation fails this test.
    // KAI-204 phase 3: boso-peninsula is now legacy-tagged (no provenance),
    // so a trusted manual-metadata fixture with the same shape is used.
    // KAI-216: the Tokyo→Chiba train corridor has no verified fare, so the
    // fixture also carries an explicit verified transportFares.train to keep
    // the origin-transport term present (a corridor without a fare is
    // honestly null now — never a fabricated heuristic number).
    const boso = {
      ...(await fullList()).find((d) => d.id === "boso-peninsula"),
      transportFares: { train: 2400 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis:
          "test fixture — trusted provenance for on-site transit inclusion",
      },
    } as unknown as Destination;
    const r = getEstimatedBudgetRange(boso, "train", 2, "economy", TOKYO);
    expect(r.transportIncluded).toBe(true);
    expect(r.range).not.toBeNull();
    const max = r.range![1];
    expect(max).toBeGreaterThan(20000); // economy BUDGET_TIER_LIMITS
    expect(max).toBeGreaterThan(32000); // on-site transport included
    // Party 1 stays affordable — the crossing flips only at party >= 2,
    // proving the per-person on-site term scales with the party.
    const p1 = getEstimatedBudgetRange(boso, "train", 1, "economy", TOKYO);
    expect(p1.range![1]).toBeLessThan(20000);
  });

  it("party sizes 1/2/3/4 scale the on-site term per person (exact linearity)", () => {
    // Synthetic fixture: on-site transport 1000, tickets 0, cafe 0, food
    // max 1300 (1h visit, economy lunch), origin one-way 240 (train:10).
    const dest = {
      id: "onsite-dest",
      name: "Onsite Dest",
      prefecture: "Kanagawa",
      region: "Kanto",
      categories: ["Museum"],
      budgetMin: 3000,
      budgetRecommended: 5000,
      budgetMax: 8000,
      budgetBreakdown: { transport: 1000, tickets: 0, food: 0, cafe: 0 },
      // KAI-204 phase 3 (positive trust): trusted provenance required.
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "test fixture — trusted provenance",
      },
      recommendedVisitHours: { min: 1, max: 1 },
      transportOptions: { train: 10 },
      // KAI-216: an explicit verified one-way fare replaces the removed
      // duration heuristic (10 min × 24 was the old base+perMinute guess).
      // 240 × 2 (round trip) = 480 per person, matching the expected
      // per-person increment below.
      transportFares: { train: 240 },
    } as unknown as Destination;
    const maxes = [1, 2, 3, 4].map((p) => {
      const r = getEstimatedBudgetRange(dest, "train", p, "economy");
      if (!r.range) throw new Error(`no range for party ${p}`);
      return r.range[1];
    });
    // Each additional person adds origin transport (480) + on-site transit
    // (1000) + food max (1300), all ×1.05 — an omitted on-site term fails
    // this exact increment.
    const increment = round1(1.05 * (480 + 1000 + 1300));
    for (let i = 1; i < maxes.length; i += 1) {
      expect(maxes[i] - maxes[i - 1]).toBe(maxes[1] - maxes[0]);
      expect(maxes[i] - maxes[i - 1]).toBe(increment);
    }
  });

  it("calculateItemizedTripCost includes on-site transit and exposes localTransit", () => {
    const dest = {
      id: "itemized-dest",
      name: "Itemized Dest",
      prefecture: "Kanagawa",
      region: "Kanto",
      categories: ["Museum"],
      budgetMin: 3000,
      budgetRecommended: 5000,
      budgetMax: 8000,
      budgetBreakdown: { transport: 1000, tickets: 2000, food: 0, cafe: 500 },
      // KAI-204 phase 3 (positive trust): trusted provenance required.
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "test fixture — trusted provenance",
      },
      recommendedVisitHours: { min: 1, max: 1 },
      transportOptions: { train: 10 },
      // KAI-216: explicit verified one-way fare (240) replaces the removed
      // duration heuristic; 240 × 2 (round trip) = 480 per person.
      transportFares: { train: 240 },
    } as unknown as Destination;
    const p2 = calculateItemizedTripCost(dest, {
      partySize: 2,
      activeMode: "train",
      tripDurationHours: 2,
    });
    const p1 = calculateItemizedTripCost(dest, {
      partySize: 1,
      activeMode: "train",
      tripDurationHours: 2,
    });
    expect(p2.localTransit).toBe(2000); // 1000 × party 2
    expect(p1.localTransit).toBe(1000);
    // Each additional person adds origin transport (480) + on-site transit
    // (1000) + tickets (2000) + cafe (500) + food max (2000).
    const perPersonDelta = 480 + 1000 + 2000 + 500 + 2000;
    expect(p2.partyRange[1] - p1.partyRange[1]).toBe(perPersonDelta);
  });

  it("unknown budget metadata stays unavailable (no range, no breakdown)", () => {
    const dest = {
      id: "unknown-dest",
      name: "Unknown Dest",
      prefecture: "Kanagawa",
      region: "Kanto",
      categories: ["Museum"],
      budgetMin: 3000,
      budgetRecommended: 5000,
      budgetMax: 8000,
      budgetBreakdown: {
        transport: 1000,
        tickets: 2000,
        food: 1000,
        cafe: 500,
      },
      budgetMetadata: { method: "unknown" as const },
      recommendedVisitHours: { min: 1, max: 1 },
      transportOptions: { train: 10 },
    } as unknown as Destination;
    expect(hasKnownBudgetRange(dest)).toBe(false);
    expect(getEffectiveBudgetBreakdown(dest)).toBeNull();
    expect(
      getEstimatedBudgetRange(dest, "train", 2, "economy").range,
    ).toBeNull();
  });

  it("range-only records (no factual breakdown) never get a range or tickets", () => {
    const dest = {
      id: "range-only-dest",
      name: "Range Only",
      prefecture: "Kanagawa",
      region: "Kanto",
      categories: ["Museum"],
      budgetMin: 3000,
      budgetRecommended: 5000,
      budgetMax: 8000,
      recommendedVisitHours: { min: 1, max: 1 },
      transportOptions: { train: 10 },
    } as unknown as Destination;
    expect(
      getEstimatedBudgetRange(dest, "train", 2, "economy").range,
    ).toBeNull();
    const itemized = calculateItemizedTripCost(dest, { partySize: 2 });
    expect(itemized.budgetAvailable).toBe(false);
    expect(itemized.tickets).toBe(0);
  });

  it("no fabricated tickets: on-site transit alone never manufactures admission", () => {
    const dest = {
      id: "transit-only-dest",
      name: "Transit Only",
      prefecture: "Kanagawa",
      region: "Kanto",
      categories: ["Museum"],
      budgetMin: 3000,
      budgetRecommended: 5000,
      budgetMax: 8000,
      budgetBreakdown: {
        transport: 1000,
        tickets: undefined,
        food: 0,
        cafe: 0,
      },
      recommendedVisitHours: { min: 1, max: 1 },
      transportOptions: { train: 10 },
    } as unknown as Destination;
    // tickets: undefined → breakdown invalid → unknown (never 0-as-free).
    expect(getEffectiveBudgetBreakdown(dest)).toBeNull();
    expect(
      getEstimatedBudgetRange(dest, "train", 2, "economy").range,
    ).toBeNull();
  });

  it("getAdjustedBudget includes the per-person on-site allowance", () => {
    const dest = {
      id: "adjusted-dest",
      name: "Adjusted Dest",
      prefecture: "Kanagawa",
      region: "Kanto",
      categories: ["Museum"],
      budgetMin: 3000,
      budgetRecommended: 5000,
      budgetMax: 8000,
      budgetBreakdown: {
        transport: 1000,
        tickets: 2000,
        food: 1500,
        cafe: 500,
      },
      // KAI-204 phase 3 (positive trust): trusted provenance required.
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "test fixture — trusted provenance",
      },
      recommendedVisitHours: { min: 1, max: 1 },
      transportOptions: { train: 10 },
      // KAI-216: explicit verified one-way fare (240) replaces the removed
      // duration heuristic; 240 × 2 (round trip) = 480 per person.
      transportFares: { train: 240 },
    } as unknown as Destination;
    // recBudget 5000 (incl. on-site 1000) × party 2 + origin transport:
    // the on-site allowance must be counted per person, not subtracted.
    const a2 = getAdjustedBudget(dest, "train", 2, TOKYO, "mainland-honshu");
    const a1 = getAdjustedBudget(dest, "train", 1, TOKYO, "mainland-honshu");
    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    expect(a2! - a1! - a1!).toBeCloseTo(0, 5); // linear per-person
    expect(a1!).toBeGreaterThan(5000); // includes on-site + origin transport
  });
});

function round1(v: number): number {
  return Math.round(v);
}

describe("KAI-204 free-vs-unknown safety (Phase 5)", () => {
  it("never treats undefined/null/NaN budgets as 0 or Free", () => {
    const missing = {
      ...mockPaidDest,
      budgetMin: undefined,
      budgetMax: undefined,
      budgetRecommended: undefined,
      budgetBreakdown: undefined,
    } as unknown as Destination;
    expect(isFreeDestination(missing)).toBe(false);
    expect(hasKnownBudgetRange(missing)).toBe(false);
    expect(getEffectiveBudgetBreakdown(missing)).toBeNull();
    const cost = calculateItemizedTripCost(missing);
    expect(cost.budgetAvailable).toBe(false);
    expect(cost.isFreeTicket).toBe(false);
  });

  it("does not classify an absent-metadata zero range as free (provenance required)", () => {
    // Legacy record with a 0–0 range but NO budgetMetadata: the numbers are
    // unverified debt, so min=0/max=0 must not become a "Free" claim.
    const legacyZero = {
      ...mockPaidDest,
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: undefined,
      categories: ["Park"],
      tags: [],
    } as unknown as Destination;
    expect(isFreeDestination(legacyZero)).toBe(false);
  });

  it("classifies a manual-metadata zero range as free (verified provenance)", () => {
    const verifiedFree = {
      ...mockPaidDest,
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        modelVersion: "budget-model-v1",
        confidence: "low",
        basis: "verified free admission (ledger LEDGER_VERIFIED)",
      },
      categories: ["Park"],
      tags: [],
    } as unknown as Destination;
    expect(isFreeDestination(verifiedFree)).toBe(true);
  });

  it("keeps method 'unknown' authoritative even with legacy zero numbers", () => {
    // Two competing truths: metadata says unknown, legacy numbers say 0.
    // Unknown wins — never free, never a price.
    const unknownWithZero = {
      ...mockPaidDest,
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: { method: "unknown" },
    } as unknown as Destination;
    expect(isFreeDestination(unknownWithZero)).toBe(false);
    expect(hasKnownBudgetRange(unknownWithZero)).toBe(false);
    expect(getEffectiveBudgetBreakdown(unknownWithZero)).toBeNull();
  });

  it("does not treat a missing ticket price as free (zero-min with costs above)", () => {
    const zeroMinPaidCosts = {
      ...mockPaidDest,
      budgetMin: 0,
      budgetMax: 2000,
      budgetRecommended: 1000,
      budgetBreakdown: { transport: 300, tickets: 0, food: 500, cafe: 200 },
    } as unknown as Destination;
    expect(isFreeDestination(zeroMinPaidCosts)).toBe(false);
  });

  it("real catalogue has no isFreeDestination false positives from absent metadata", () => {
    // Dynamic guard over the committed catalogue: any record classified free
    // by range must carry manual/model provenance; free by keyword is the
    // only accepted unproven path (and it renders an estimate, never a hard
    // zero). This test pins the safety invariant for future data.
    return fullList().then((list) => {
      const freeByRange = (list as Destination[]).filter(
        (d) =>
          d.budgetMin === 0 &&
          d.budgetMax === 0 &&
          (d.budgetMetadata?.method === "manual" ||
            d.budgetMetadata?.method === "model"),
      );
      const freeByRangeAbsent = (list as Destination[]).filter(
        (d) => d.budgetMin === 0 && d.budgetMax === 0 && !d.budgetMetadata,
      );
      // Manual/model zero ranges are allowed (verified provenance); absent
      // metadata zero ranges are not (must never exist).
      expect(freeByRangeAbsent).toHaveLength(0);
      expect(freeByRange.length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("KAI-204 legacy budget trust boundary (Phase 3)", () => {
  const legacyDest = {
    ...mockPaidDest,
    budgetMetadata: {
      method: "legacy",
      confidence: "unknown",
      basis: "legacy numeric budget without recoverable provenance",
    },
  } as unknown as Destination;

  it("hasKnownBudget returns false for legacy metadata", () => {
    expect(BudgetServiceModule.hasKnownBudget(legacyDest)).toBe(false);
  });

  it("hasKnownBudgetRange returns false for legacy metadata", () => {
    expect(hasKnownBudgetRange(legacyDest)).toBe(false);
  });

  it("getEffectiveBudgetBreakdown returns null for legacy metadata", () => {
    expect(getEffectiveBudgetBreakdown(legacyDest)).toBeNull();
  });

  it("isFreeDestination returns false for legacy metadata even with free tags", () => {
    const legacyFreeTag = {
      ...legacyDest,
      categories: ["Park"],
      tags: ["Free"],
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
    } as unknown as Destination;
    expect(isFreeDestination(legacyFreeTag)).toBe(false);
  });

  it("getEstimatedBudgetRange returns no range for legacy metadata", () => {
    const result = getEstimatedBudgetRange(legacyDest, "train", 2, "standard", {
      lat: 35.68,
      lng: 139.76,
    });
    expect(result.range).toBeNull();
  });

  it("getSortableVerifiedBudget returns Infinity for legacy metadata", () => {
    const sortable = getSortableVerifiedBudget(legacyDest, ["train"], 2, {
      lat: 35.68,
      lng: 139.76,
    });
    expect(sortable).toBe(Number.POSITIVE_INFINITY);
  });

  it("hasTrustedBudgetProvenance distinguishes legacy from manual/model", () => {
    expect(BudgetServiceModule.hasTrustedBudgetProvenance(legacyDest)).toBe(
      false,
    );
    const manualDest = {
      ...mockPaidDest,
      budgetMetadata: { method: "manual" },
    } as unknown as Destination;
    const modelDest = {
      ...mockPaidDest,
      budgetMetadata: { method: "model", modelVersion: "budget-model-v1" },
    } as unknown as Destination;
    expect(BudgetServiceModule.hasTrustedBudgetProvenance(manualDest)).toBe(
      true,
    );
    expect(BudgetServiceModule.hasTrustedBudgetProvenance(modelDest)).toBe(
      true,
    );
  });

  it("legacy records with numbers still keep them in storage (not deleted)", () => {
    // Phase 8: STORAGE is separated from TRUST. The numbers remain on the
    // record for migration/debugging value even though consumption is gated.
    expect(legacyDest.budgetMin).toBe(mockPaidDest.budgetMin);
    expect(legacyDest.budgetRecommended).toBe(mockPaidDest.budgetRecommended);
    expect(legacyDest.budgetBreakdown).toBeDefined();
  });
});

describe("KAI-204 positive trust contract — hubs (Phase 3 blocker)", () => {
  const hubBase = {
    id: "chiba-city",
    name: "Chiba City",
    kind: "city",
    role: "hub",
    categories: ["City Hub"],
    budgetMin: 4000,
    budgetRecommended: 8000,
    budgetMax: 12000,
    budgetBreakdown: { transport: 3200, tickets: 1600, food: 2400, cafe: 800 },
    recommendedVisitHours: { min: 6, max: 12 },
    transportOptions: { train: 60 },
  } as unknown as Destination;

  it("hub numeric + ABSENT metadata → NOT known (positive trust)", () => {
    // The blocker: a hub with numbers but no budgetMetadata must not be
    // implicitly trusted. Only explicit manual/model provenance is trusted.
    expect(BudgetServiceModule.hasKnownBudget(hubBase)).toBe(false);
    expect(hasKnownBudgetRange(hubBase)).toBe(false);
    expect(getEffectiveBudgetBreakdown(hubBase)).toBeNull();
    expect(isFreeDestination(hubBase)).toBe(false);
    const sortable = getSortableVerifiedBudget(hubBase, ["train"], 2, {
      lat: 35.68,
      lng: 139.76,
    });
    expect(sortable).toBe(Number.POSITIVE_INFINITY);
  });

  it("hub with legitimate method=model → known estimate", () => {
    const modelHub = {
      ...hubBase,
      budgetBreakdown: { transport: 3000, tickets: 0, food: 3000, cafe: 1600 },
      budgetMetadata: {
        method: "model",
        modelVersion: "budget-model-v1",
        confidence: "low",
        basis:
          "peer cell 'city|full|hub' n=8; tickets source-verified (hub class convention)",
      },
    } as unknown as Destination;
    expect(BudgetServiceModule.hasKnownBudget(modelHub)).toBe(true);
    expect(hasKnownBudgetRange(modelHub)).toBe(true);
    expect(getEffectiveBudgetBreakdown(modelHub)).not.toBeNull();
  });

  it("hub with method=legacy → NOT trusted despite hub status", () => {
    const legacyHub = {
      ...hubBase,
      budgetMetadata: {
        method: "legacy",
        confidence: "unknown",
        basis: "legacy numeric budget without recoverable provenance",
      },
    } as unknown as Destination;
    expect(BudgetServiceModule.hasKnownBudget(legacyHub)).toBe(false);
    expect(hasKnownBudgetRange(legacyHub)).toBe(false);
    expect(getEffectiveBudgetBreakdown(legacyHub)).toBeNull();
  });

  it("manual destination → known; legacy → unknown; unknown → unknown (full matrix)", () => {
    const manualDest = {
      ...mockPaidDest,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket",
      },
    } as unknown as Destination;
    const legacyDest2 = {
      ...mockPaidDest,
      budgetMetadata: { method: "legacy", confidence: "unknown" },
    } as unknown as Destination;
    const unknownDest = {
      ...mockPaidDest,
      budgetMetadata: { method: "unknown" },
    } as unknown as Destination;
    const absentDest = {
      ...mockPaidDest,
      budgetMetadata: undefined,
    } as unknown as Destination;
    expect(BudgetServiceModule.hasKnownBudget(manualDest)).toBe(true);
    expect(BudgetServiceModule.hasKnownBudget(legacyDest2)).toBe(false);
    expect(BudgetServiceModule.hasKnownBudget(unknownDest)).toBe(false);
    expect(BudgetServiceModule.hasKnownBudget(absentDest)).toBe(false); // absent
  });

  it("generated plan with numeric+absent destination → admission NOT curated", async () => {
    // A plan step whose destination carries numbers but NO trusted
    // provenance must not contribute tickets as curated (positive trust
    // contract). Uses a POI (not a hub — hubs are filtered from plan
    // admission entirely).
    const { calculateGeneratedPlanCost } =
      await import("../GeneratedPlanCostService");
    const untrustedDest = {
      id: "untrusted-poi",
      name: "Untrusted POI",
      kind: "museum",
      role: "poi",
      budgetMin: 2000,
      budgetRecommended: 4000,
      budgetMax: 6000,
      budgetBreakdown: { transport: 1000, tickets: 2000, food: 500, cafe: 500 },
      // NO budgetMetadata — legacy/absent
    } as unknown as Destination;
    const plan = {
      id: "plan-untrusted",
      title: { en: "Untrusted plan", ja: "信頼できないプラン" },
      steps: [
        {
          id: "step-1",
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "11:00",
          durationMinutes: 120,
          destination: untrustedDest,
          title: { en: "Museum", ja: "博物館" },
        },
      ],
      routeLegs: [],
      totalDurationMinutes: 120,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    } as never;
    const cost = calculateGeneratedPlanCost(plan as never, 2, "train", false);
    expect(cost.admission.source).toBe("unknown");
    expect(cost.admission.min).toBe(0);
  });

  it("generated plan with model-provenance hub → may contribute per model semantics", async () => {
    const { calculateGeneratedPlanCost } =
      await import("../GeneratedPlanCostService");
    const modelHub = {
      ...hubBase,
      budgetBreakdown: { transport: 3000, tickets: 0, food: 3000, cafe: 1600 },
      budgetMetadata: {
        method: "model",
        modelVersion: "budget-model-v1",
        confidence: "low",
      },
    } as unknown as Destination;
    const plan = {
      id: "plan-hub-model",
      title: { en: "Model hub", ja: "モデルハブ" },
      steps: [
        {
          id: "step-1",
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "11:00",
          durationMinutes: 120,
          destination: modelHub,
          title: { en: "Chiba", ja: "千葉" },
        },
      ],
      routeLegs: [],
      totalDurationMinutes: 120,
      totalBudgetRange: [0, 0],
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    } as never;
    const cost = calculateGeneratedPlanCost(plan as never, 2, "train", false);
    // tickets=0 hub convention: admission is zero but trusted (curated).
    expect(cost.admission.source).toBe("curated");
    expect(cost.admission.min).toBe(0);
  });

  it("ALT regression: numeric absent-metadata zero-range alternative → NOT Free", () => {
    // The alternative-destination UI renders "Free" only when
    // hasKnownBudgetRange(alt) is true AND alt.budgetMin === 0. Under the
    // positive trust contract, an absent-metadata zero-range alt fails
    // hasKnownBudgetRange, so it must NOT display Free.
    const untrustedAlt = {
      id: "untrusted-alt",
      name: "Untrusted Alt",
      kind: "park",
      role: "poi",
      budgetMin: 0,
      budgetMax: 0,
      budgetRecommended: 0,
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      // NO budgetMetadata — legacy/absent
    } as unknown as Destination;
    expect(hasKnownBudgetRange(untrustedAlt)).toBe(false);

    // The exact widget condition: hasKnownBudgetRange(alt) ? (alt.budgetMin === 0 ? "Free" : ...) : unavailable
    const rendersFree =
      hasKnownBudgetRange(untrustedAlt) && untrustedAlt.budgetMin === 0;
    expect(rendersFree).toBe(false);

    // A verified manual zero-range alternative MAY display Free per current
    // semantics.
    const verifiedAlt = {
      ...untrustedAlt,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified free admission (ledger LEDGER_VERIFIED)",
      },
    } as unknown as Destination;
    expect(hasKnownBudgetRange(verifiedAlt)).toBe(true);
    const verifiedRendersFree =
      hasKnownBudgetRange(verifiedAlt) && verifiedAlt.budgetMin === 0;
    expect(verifiedRendersFree).toBe(true);
  });
});
