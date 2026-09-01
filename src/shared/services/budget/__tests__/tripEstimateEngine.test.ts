import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  ACCOMMODATION_PROFILES,
  calculateTripEstimate,
  evaluateAffordability,
  estimateQualityLabel,
} from "../tripEstimateEngine";
import { formatLocalizedJPYRange } from "../BudgetService";

const origin = { lat: 35.6812, lng: 139.7671 };

function destination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "k260-fixture",
    name: "KAI-260 Fixture",
    nameJa: "KAI-260テスト",
    prefecture: "Kanagawa",
    region: "Kanto",
    kind: "museum",
    coordinates: { lat: 35.45, lng: 139.63 },
    transportOptions: { train: 60 },
    recommendedVisitHours: { min: 2, max: 6 },
    ...overrides,
  } as Destination;
}

const verifiedAdmission = {
  state: "verified_paid",
  provenance: "verified_source",
  cost: { kind: "bounded", min: 1000, max: 1500 },
  scope: "general_entry",
  sourceUrls: ["https://example.test/admission"],
  checkedAt: "2026-01-01",
  basis: "official adult admission",
} as const;

const verifiedLocal = {
  kind: "verified_required_access",
  access: "rail",
  fare: [300, 500],
  fareBasis: "round_trip",
  coverage: "all_required_access",
  sourceUrls: ["https://example.test/local"],
  basis: "station to attraction shuttle/rail access",
  checkedAt: "2026-01-01",
} as const;

function component(
  result: ReturnType<typeof calculateTripEstimate>,
  scope: string,
) {
  return result.components.find((item) => item.evidence.scope === scope)!;
}

describe("KAI-260 TripEstimateEngine", () => {
  it("keeps an all-verified on-site day range bounded and preserves both ends", () => {
    const result = calculateTripEstimate({
      dest: destination({
        admission: verifiedAdmission,
        localTransport: verifiedLocal,
      }),
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });
    expect(result.total).toBeDefined();
    expect(result.completeness).toBe("complete");
    expect(component(result, "admission").cost).toEqual({
      kind: "bounded",
      min: 2000,
      max: 3000,
    });
    expect(component(result, "local_transport").cost).toEqual({
      kind: "bounded",
      min: 600,
      max: 1000,
    });
    expect(result.total!.min).toBeLessThan(result.total!.max);
  });

  it("uses a deterministic local profile when local transport is estimated", () => {
    const result = calculateTripEstimate({
      dest: destination({
        admission: verifiedAdmission,
        municipalityId: "yokohama",
      }),
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });
    const local = component(result, "local_transport");
    expect(local.cost).toEqual({ kind: "bounded", min: 800, max: 3200 });
    expect(local.evidence.derivation).toBe("model_estimate");
    expect(local.evidence.provenance).toBe("model");
    expect(result.estimateQuality).toBe("estimated");
    expect(result.total).toBeDefined();
  });

  it("does not classify an urban standalone POI as rural by role alone", () => {
    const result = calculateTripEstimate({
      dest: destination({
        role: "standalone",
        municipalityId: "yokohama",
      }),
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });

    expect(component(result, "local_transport").cost).toEqual({
      kind: "bounded",
      min: 800,
      max: 3200,
    });
  });

  it("keeps verified-free admission explicit and resolves missing admission via a model band", () => {
    const free = calculateTripEstimate({
      dest: destination({
        admission: {
          ...verifiedAdmission,
          state: "verified_free",
          cost: { kind: "bounded", min: 0, max: 0 },
          basis: "official free admission",
        },
      }),
      duration: "fullDay",
      includeOriginTravel: false,
    });
    expect(component(free, "admission").cost).toEqual({
      kind: "bounded",
      min: 0,
      max: 0,
    });
    expect(component(free, "admission").evidence.state).toBe("verified_free");

    const missing = calculateTripEstimate({
      dest: destination({ admission: undefined }),
      duration: "fullDay",
      includeOriginTravel: false,
    });
    expect(component(missing, "admission").cost).toEqual({
      kind: "bounded",
      min: 1000,
      max: 6000,
    });
    expect(component(missing, "admission").evidence.derivation).toBe(
      "model_estimate",
    );
    expect(missing.estimateQuality).toBe("rough");
    expect(missing.total).toBeDefined();
  });

  it("widens missing origin fare instead of turning a routable route unavailable", () => {
    const result = calculateTripEstimate({
      dest: destination({ transportFares: undefined }),
      mode: "train",
      homeCoords: origin,
      duration: "fullDay",
      partySize: 2,
    });
    const travel = component(result, "origin_travel");
    expect(travel.cost.kind).toBe("bounded");
    if (travel.cost.kind === "bounded")
      expect(travel.cost.min).toBeLessThan(travel.cost.max);
    expect(travel.evidence.derivation).toBe("model_estimate");
    expect(result.total).toBeDefined();
  });

  it("scales person-cost ranges for one vs two people", () => {
    const one = calculateTripEstimate({
      dest: destination(),
      duration: "fullDay",
      partySize: 1,
      includeOriginTravel: false,
    });
    const two = calculateTripEstimate({
      dest: destination(),
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });
    expect(two.total!.min).toBe(one.total!.min * 2);
    expect(two.total!.max).toBe(one.total!.max * 2);
  });

  it("uses party-total default accommodation for 2D1N without multiplying by party size", () => {
    const result = calculateTripEstimate({
      dest: destination(),
      duration: "2d1n",
      partySize: 2,
      includeOriginTravel: false,
      budgetTier: "standard",
    });
    const accommodation = component(result, "accommodation");
    expect(accommodation.cost).toEqual({
      kind: "bounded",
      min: ACCOMMODATION_PROFILES.standard[0],
      max: ACCOMMODATION_PROFILES.standard[1],
    });
    expect(result.accommodation).toEqual({ perNight: 10000, nights: 1 });
  });

  it("ignores stale custom lodging input and uses the Budget v2 tier", () => {
    const result = calculateTripEstimate({
      dest: destination(),
      duration: "2d1n",
      includeOriginTravel: false,
      partySize: 2,
    });
    expect(component(result, "accommodation").cost).toEqual({
      kind: "bounded",
      min: ACCOMMODATION_PROFILES.standard[0],
      max: ACCOMMODATION_PROFILES.standard[1],
    });
    expect(result.accommodation).toEqual({ perNight: 10000, nights: 1 });
  });

  it("adds three meals for each multi-night extension beyond 2D1N", () => {
    const oneNight = calculateTripEstimate({
      dest: destination(),
      duration: "2d1n",
      includeOriginTravel: false,
      partySize: 1,
    });
    const twoNights = calculateTripEstimate({
      dest: destination(),
      duration: "3d2n",
      includeOriginTravel: false,
      partySize: 1,
    });
    const oneNightMeals = component(oneNight, "meals").cost;
    const twoNightMeals = component(twoNights, "meals").cost;

    expect(oneNightMeals).toEqual({ kind: "bounded", min: 5200, max: 9500 });
    expect(twoNightMeals).toEqual({ kind: "bounded", min: 9200, max: 17000 });
  });

  it("uses the same bounded range for low/middle/high affordability", () => {
    const result = calculateTripEstimate({
      dest: destination(),
      duration: "fullDay",
      includeOriginTravel: false,
    });
    const range = result.total!;
    expect(evaluateAffordability(result, range.min - 1)).toBe("over");
    expect(evaluateAffordability(result, range.min)).toBe(
      range.min < range.max ? "may_exceed" : "fits",
    );
    expect(evaluateAffordability(result, range.max)).toBe("fits");
    expect(evaluateAffordability(result, undefined)).toBe("unknown");
  });

  it("never represents an unknown component as silent zero", () => {
    const result = calculateTripEstimate({
      dest: destination({ admission: undefined }),
      duration: "fullDay",
      includeOriginTravel: false,
    });
    const local = component(result, "local_transport");
    expect(local.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(local.evidence.derivation).toBe("model_estimate");
    expect(result.total).toBeDefined();
  });

  it("formats estimated EN and JA ranges without midpoint collapse", () => {
    const result = calculateTripEstimate({
      dest: destination(),
      duration: "fullDay",
      includeOriginTravel: false,
    });
    const range: [number, number] = [result.total!.min, result.total!.max];
    expect(formatLocalizedJPYRange(range, "en")).toContain("–");
    expect(formatLocalizedJPYRange(range, "ja")).toContain("〜");
    expect(estimateQualityLabel(result.estimateQuality, "en")).toMatch(
      /Estimated|Rough/,
    );
    expect(estimateQualityLabel(result.estimateQuality, "ja")).toBe("概算");
  });

  it("treats Flexible as unconstrained while using a neutral display estimate", () => {
    const flexible = calculateTripEstimate({
      dest: destination(),
      duration: "2d1n",
      budgetTier: "luxury",
      partySize: 2,
      includeOriginTravel: false,
    });
    const standard = calculateTripEstimate({
      dest: destination(),
      duration: "2d1n",
      budgetTier: "standard",
      partySize: 2,
      includeOriginTravel: false,
    });

    expect(flexible.total).toEqual(standard.total);
    expect(evaluateAffordability(flexible, Infinity)).toBe("unknown");
  });
});
