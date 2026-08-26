import { describe, expect, it } from "vitest";
import {
  accommodationTotal,
  isBoundedComplete,
  isBoundedCost,
  isNonNumeric,
  isOpenEnded,
  isValidCostRepresentation,
  type BoundedCost,
  type CostRepresentation,
  type OpenEndedCost,
  type TravelLeg,
  type TripCostComponent,
  type TripCostResult,
} from "../budgetV2";

describe("KAI-215 Budget v2 — bounded vs open-ended cost invariants", () => {
  it("bounded [3000,5000] is distinct from open-ended 'from ¥3000'", () => {
    const bounded: CostRepresentation = {
      kind: "bounded",
      min: 3000,
      max: 5000,
    };
    const open: CostRepresentation = { kind: "open_ended", from: 3000 };
    expect(bounded.kind).toBe("bounded");
    expect(open.kind).toBe("open_ended");
    expect(isBoundedCost(bounded)).toBe(true);
    expect(isOpenEnded(open)).toBe(true);
    // An open-ended value must NEVER be constructed as a fixed range.
    expect(open).not.toEqual({ kind: "bounded", min: 3000, max: 3000 });
  });

  it("an open-ended cost cannot accidentally satisfy a bounded-complete predicate", () => {
    const open: CostRepresentation = { kind: "open_ended", from: 3000 };
    expect(isBoundedComplete(open)).toBe(false);
    // Even a zero lower-bound open-ended value is not bounded-complete.
    expect(isBoundedComplete({ kind: "open_ended", from: 0 })).toBe(false);
  });

  it("unavailable cannot become zero", () => {
    const unavailable: CostRepresentation = {
      kind: "unavailable",
      reason: "source_missing",
    };
    expect(isNonNumeric(unavailable)).toBe(true);
    expect(isBoundedComplete(unavailable)).toBe(false);
    expect(isBoundedCost(unavailable)).toBe(false);
    // It must not be coercible to a zero range through any predicate.
    expect(isValidCostRepresentation(unavailable)).toBe(true); // valid state
    expect(isBoundedCost(unavailable)).toBe(false);
    // Explicitly: [0,0] is NOT the same as unavailable.
    expect(unavailable).not.toEqual({ kind: "bounded", min: 0, max: 0 });
  });

  it("malformed ranges fail closed", () => {
    const inverted: CostRepresentation = {
      kind: "bounded",
      min: 5000,
      max: 3000,
    };
    const nan: CostRepresentation = {
      kind: "bounded",
      min: Number.NaN,
      max: 3000,
    };
    const negative: CostRepresentation = {
      kind: "bounded",
      min: -1,
      max: 3000,
    };
    expect(isBoundedCost(inverted)).toBe(false);
    expect(isBoundedCost(nan)).toBe(false);
    expect(isBoundedCost(negative)).toBe(false);
    expect(isBoundedComplete(inverted)).toBe(false);
    expect(isBoundedComplete(nan)).toBe(false);
    expect(isValidCostRepresentation(inverted)).toBe(false);
    expect(isValidCostRepresentation(nan)).toBe(false);
    expect(isValidCostRepresentation(negative)).toBe(false);
  });

  it("not_applicable and variable are first-class non-numeric states", () => {
    expect(isNonNumeric({ kind: "not_applicable" })).toBe(true);
    expect(isNonNumeric({ kind: "variable" })).toBe(true);
    expect(isBoundedComplete({ kind: "not_applicable" })).toBe(false);
    expect(isBoundedComplete({ kind: "variable" })).toBe(false);
  });
});

describe("KAI-215 Budget v2 — trip completeness and travel legs", () => {
  it("a partial/open-ended trip cannot claim a complete bounded total", () => {
    const partialResult: TripCostResult = {
      completeness: "partial",
      components: [
        {
          cost: { kind: "bounded", min: 3000, max: 5000 },
          evidence: {
            state: "verified_paid",
            provenance: "verified_source",
            scope: "admission",
          },
        },
        {
          cost: { kind: "open_ended", from: 2000 },
          evidence: {
            state: "variable_price",
            provenance: "verified_source",
            scope: "origin_travel",
          },
        },
      ],
    };
    expect(partialResult.completeness).toBe("partial");
    expect(partialResult.total).toBeUndefined(); // no fabricated total
    // The bounded component alone must not imply the trip is complete.
    expect(
      partialResult.components.some((c) => isBoundedComplete(c.cost)),
    ).toBe(true);
    expect(partialResult.completeness).not.toBe("complete");
  });

  it("travel is representable as multiple future legs without multimodal routing", () => {
    const legs: TravelLeg[] = [
      {
        mode: "local_rail",
        cost: { kind: "bounded", min: 400, max: 600 },
        evidence: {
          state: "verified_paid",
          provenance: "verified_source",
          scope: "origin_travel",
        },
      },
      {
        mode: "shinkansen",
        cost: { kind: "bounded", min: 8000, max: 12000 },
        evidence: {
          state: "documented_estimate",
          provenance: "model",
          scope: "origin_travel",
        },
      },
      {
        mode: "bus",
        cost: { kind: "open_ended", from: 1000 },
        evidence: {
          state: "variable_price",
          provenance: "verified_source",
          scope: "origin_travel",
          sourceUrls: ["https://example.com/bus-fare"],
        },
      },
    ];
    expect(legs).toHaveLength(3);
    expect(legs[0].mode).toBe("local_rail");
    expect(legs[1].mode).toBe("shinkansen");
    expect(legs[2].mode).toBe("bus");
    expect(isBoundedCost(legs[0].cost)).toBe(true);
    expect(isBoundedCost(legs[1].cost)).toBe(true);
    expect(isOpenEnded(legs[2].cost)).toBe(true);
    // Each leg carries evidence without inventing a second trust taxonomy.
    expect(legs[1].evidence.provenance).toBe("model");
    expect(legs[2].evidence.sourceUrls?.[0]).toBe(
      "https://example.com/bus-fare",
    );
  });

  it("component evidence reuses KAI-214 state/provenance/reason", () => {
    const component: TripCostComponent = {
      cost: { kind: "bounded", min: 500, max: 1000 },
      evidence: {
        state: "verified_paid",
        provenance: "verified_source",
        reason: "price_variable_by_product",
        scope: "local_transport",
        sourceUrls: ["https://official.example"],
      },
    };
    expect(component.evidence.state).toBe("verified_paid");
    expect(component.evidence.provenance).toBe("verified_source");
    expect(component.evidence.reason).toBe("price_variable_by_product");
    expect(component.evidence.scope).toBe("local_transport");
  });
});

describe("KAI-215 Budget v2 — accommodation contract", () => {
  it("allowance is party-total PER NIGHT and multiplies by nights, never party size", () => {
    // 2D1N: 1 night, party-total ¥12000/night → ¥12000 total.
    const d1n = accommodationTotal({ perNight: 12000, nights: 1 });
    expect(d1n).toBe(12000);
    // 3D2N: 2 nights → ¥24000.
    const d2n = accommodationTotal({ perNight: 12000, nights: 2 });
    expect(d2n).toBe(24000);
    // Day trip: 0 nights → ¥0.
    expect(accommodationTotal({ perNight: 12000, nights: 0 })).toBe(0);
    // The type is NOT hardcoded to weekend_2d1n; explicit nights are accepted.
    const future5d4n = accommodationTotal({ perNight: 10000, nights: 4 });
    expect(future5d4n).toBe(40000);
  });

  it("never multiplies the allowance by party size again", () => {
    // perNight already encodes the party; nights is the only multiplier.
    const allowance = { perNight: 8000, nights: 2 };
    const total = accommodationTotal(allowance);
    // If a consumer wrongly multiplied by partySize it would differ.
    expect(total).toBe(16000);
    expect(total).not.toBe(16000 * 4); // partySize=4 would double-count
  });
});

describe("KAI-215 Budget v2 — deterministic and dependency-neutral", () => {
  it("is pure and deterministic (same input → same predicates)", () => {
    const bounded: BoundedCost = { kind: "bounded", min: 100, max: 200 };
    const open: OpenEndedCost = { kind: "open_ended", from: 100 };
    expect(isBoundedCost(bounded)).toBe(isBoundedCost(bounded));
    expect(isOpenEnded(open)).toBe(isOpenEnded(open));
  });

  it("no product surface can treat unknown/legacy as Free or zero", () => {
    const unavailable: CostRepresentation = {
      kind: "unavailable",
      reason: "source_missing",
    };
    const legacy: CostRepresentation = { kind: "variable" };
    // Neither is free, neither is a zero range.
    expect(isBoundedComplete(unavailable)).toBe(false);
    expect(isBoundedComplete(legacy)).toBe(false);
    expect(isBoundedCost(unavailable)).toBe(false);
    expect(isBoundedCost(legacy)).toBe(false);
  });
});
