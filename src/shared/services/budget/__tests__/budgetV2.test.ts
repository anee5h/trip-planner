import { describe, expect, it } from "vitest";
import {
  accommodationTotal,
  isBoundedComplete,
  isBoundedCost,
  isNonNumeric,
  isOpenEnded,
  isValidAccommodationAllowance,
  isValidCostRepresentation,
  isValidTripCostResult,
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

describe("KAI-215 Budget v2 — trip completeness is a discriminated union", () => {
  it("complete REQUIRES a bounded total (compile-time structural)", () => {
    // TypeScript enforces this structurally: a complete result without
    // `total` does not type-check. Here we build the valid shape.
    const complete: TripCostResult = {
      completeness: "complete",
      total: { kind: "bounded", min: 3000, max: 5000 },
      components: [
        {
          cost: { kind: "bounded", min: 3000, max: 5000 },
          evidence: {
            state: "verified_paid",
            provenance: "verified_source",
            scope: "admission",
            derivation: "source_fact",
          },
        },
      ],
    };
    expect(isValidTripCostResult(complete)).toBe(true);
    // Compile-time structural proof (plain TS — deterministic):
    // only the complete variant carries a bounded total; partial and
    // unavailable variants have total: never (structurally forbidden).
    const completeTotal: BoundedCost = complete.total; // complete HAS total
    // @ts-expect-error — a partial result must NOT have a bounded total
    const partialTotal: BoundedCost = (
      { completeness: "partial", components: [] } as TripCostResult
    ).total;
    // @ts-expect-error — an unavailable result must NOT have a bounded total
    const unavailableTotal: BoundedCost = (
      { completeness: "unavailable", components: [] } as TripCostResult
    ).total;
    expect(completeTotal).toBeDefined();
    expect(partialTotal).toBeUndefined();
    expect(unavailableTotal).toBeUndefined();
  });

  it("partial FORBIDS a definite total (compile-time structural)", () => {
    const partial: TripCostResult = {
      completeness: "partial",
      components: [
        {
          cost: { kind: "open_ended", from: 2000 },
          evidence: {
            state: "variable_price",
            provenance: "verified_source",
            scope: "origin_travel",
            derivation: "source_fact",
          },
        },
      ],
    };
    expect(isValidTripCostResult(partial)).toBe(true);
    // Compile-time: a partial result's total is never (not assignable to
    // BoundedCost) — the discriminated union structurally forbids it.
    // @ts-expect-error — partial total is never
    const partialTotal: BoundedCost = (
      { completeness: "partial", components: [] } as TripCostResult
    ).total;
    expect(partialTotal).toBeUndefined();
  });

  it("unavailable FORBIDS a definite total (compile-time structural)", () => {
    const unavailable: TripCostResult = {
      completeness: "unavailable",
      components: [],
    };
    expect(isValidTripCostResult(unavailable)).toBe(true);
    // @ts-expect-error — unavailable total is never
    const unavailableTotal: BoundedCost = (
      { completeness: "unavailable", components: [] } as TripCostResult
    ).total;
    expect(unavailableTotal).toBeUndefined();
  });

  it("runtime validator rejects invalid completeness/total combinations", () => {
    // partial with a total (simulate a bad runtime object via cast)
    const partialWithTotal = {
      completeness: "partial",
      total: { kind: "bounded", min: 1, max: 2 },
      components: [],
    } as unknown as TripCostResult;
    expect(isValidTripCostResult(partialWithTotal)).toBe(false);

    const unavailableWithTotal = {
      completeness: "unavailable",
      total: { kind: "bounded", min: 1, max: 2 },
      components: [],
    } as unknown as TripCostResult;
    expect(isValidTripCostResult(unavailableWithTotal)).toBe(false);

    // complete without a total
    const completeNoTotal = {
      completeness: "complete",
      components: [],
    } as unknown as TripCostResult;
    expect(isValidTripCostResult(completeNoTotal)).toBe(false);

    // complete with a malformed (inverted) total
    const completeBadTotal = {
      completeness: "complete",
      total: { kind: "bounded", min: 5000, max: 3000 },
      components: [],
    } as unknown as TripCostResult;
    expect(isValidTripCostResult(completeBadTotal)).toBe(false);

    // complete with an invalid component shape
    const completeBadComponent = {
      completeness: "complete",
      total: { kind: "bounded", min: 1, max: 2 },
      components: [
        {
          cost: { kind: "bounded", min: Number.NaN, max: 2 },
          evidence: {
            state: "verified_paid",
            provenance: "verified_source",
            scope: "admission",
            derivation: "source_fact",
          },
        },
      ],
    } as unknown as TripCostResult;
    expect(isValidTripCostResult(completeBadComponent)).toBe(false);
  });

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
            derivation: "source_fact",
          },
        },
        {
          cost: { kind: "open_ended", from: 2000 },
          evidence: {
            state: "variable_price",
            provenance: "verified_source",
            scope: "origin_travel",
            derivation: "source_fact",
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
});

describe("KAI-215 Budget v2 — user-allowance derivation (orthogonal axis)", () => {
  it("an accommodation component can carry user_allowance without being mislabeled verified_source/model", () => {
    const accommodation: TripCostComponent = {
      cost: { kind: "bounded", min: 15000, max: 15000 },
      evidence: {
        scope: "accommodation",
        // NO KAI-214 state/provenance — KAI-214 has no user_assumption
        // provenance and is not modified. The derivation axis carries it.
        derivation: "user_allowance",
      },
    };
    expect(accommodation.evidence.derivation).toBe("user_allowance");
    expect(accommodation.evidence.provenance).toBeUndefined();
    expect(accommodation.evidence.state).toBeUndefined();
    // It is NOT pretending to be a verified source or model value.
    expect(accommodation.evidence.derivation).not.toBe("source_fact");
    expect(accommodation.evidence.derivation).not.toBe("model_estimate");
  });

  it("a source-backed fact and a model estimate are distinct derivations", () => {
    const sourceFact: TripCostComponent = {
      cost: { kind: "bounded", min: 1000, max: 1000 },
      evidence: {
        state: "verified_paid",
        provenance: "verified_source",
        scope: "admission",
        derivation: "source_fact",
      },
    };
    const model: TripCostComponent = {
      cost: { kind: "bounded", min: 2000, max: 3000 },
      evidence: {
        state: "documented_estimate",
        provenance: "model",
        scope: "local_transport",
        derivation: "model_estimate",
      },
    };
    expect(sourceFact.evidence.derivation).toBe("source_fact");
    expect(model.evidence.derivation).toBe("model_estimate");
  });
});

describe("KAI-215 Budget v2 — travel legs", () => {
  it("travel is representable as multiple future legs without multimodal routing", () => {
    const legs: TravelLeg[] = [
      {
        mode: "local_rail",
        cost: { kind: "bounded", min: 400, max: 600 },
        evidence: {
          state: "verified_paid",
          provenance: "verified_source",
          scope: "origin_travel",
          derivation: "source_fact",
        },
      },
      {
        mode: "shinkansen",
        cost: { kind: "bounded", min: 8000, max: 12000 },
        evidence: {
          state: "documented_estimate",
          provenance: "model",
          scope: "origin_travel",
          derivation: "model_estimate",
        },
      },
      {
        mode: "bus",
        cost: { kind: "open_ended", from: 1000 },
        evidence: {
          state: "variable_price",
          provenance: "verified_source",
          scope: "origin_travel",
          derivation: "source_fact",
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
        derivation: "source_fact",
        sourceUrls: ["https://official.example"],
      },
    };
    expect(component.evidence.state).toBe("verified_paid");
    expect(component.evidence.provenance).toBe("verified_source");
    expect(component.evidence.reason).toBe("price_variable_by_product");
    expect(component.evidence.scope).toBe("local_transport");
    expect(component.evidence.derivation).toBe("source_fact");
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

  it("isValidAccommodationAllowance accepts valid inputs", () => {
    expect(isValidAccommodationAllowance({ perNight: 0, nights: 0 })).toBe(
      true,
    ); // valid 0 nights
    expect(isValidAccommodationAllowance({ perNight: 12000, nights: 1 })).toBe(
      true,
    );
    expect(isValidAccommodationAllowance({ perNight: 12000, nights: 2 })).toBe(
      true,
    );
    expect(isValidAccommodationAllowance({ perNight: 12000, nights: 4 })).toBe(
      true,
    );
    expect(isValidAccommodationAllowance({ perNight: 0, nights: 3 })).toBe(
      true,
    ); // zero allowance, positive nights is valid
  });

  it("isValidAccommodationAllowance rejects invalid inputs (fail closed)", () => {
    expect(isValidAccommodationAllowance({ perNight: -1, nights: 1 })).toBe(
      false,
    ); // negative perNight
    expect(
      isValidAccommodationAllowance({ perNight: Number.NaN, nights: 1 }),
    ).toBe(false); // NaN perNight
    expect(
      isValidAccommodationAllowance({ perNight: Infinity, nights: 1 }),
    ).toBe(false); // Infinity perNight
    expect(isValidAccommodationAllowance({ perNight: 12000, nights: -1 })).toBe(
      false,
    ); // negative nights
    expect(
      isValidAccommodationAllowance({ perNight: 12000, nights: 1.5 }),
    ).toBe(false); // fractional nights
    expect(
      isValidAccommodationAllowance({ perNight: 12000, nights: Number.NaN }),
    ).toBe(false); // NaN nights
    expect(
      isValidAccommodationAllowance({ perNight: 12000, nights: Infinity }),
    ).toBe(false); // Infinity nights
  });

  it("accommodationTotal is fail-closed on invalid inputs (no arbitrary rounding)", () => {
    expect(Number.isNaN(accommodationTotal({ perNight: -1, nights: 1 }))).toBe(
      true,
    );
    expect(
      Number.isNaN(accommodationTotal({ perNight: Number.NaN, nights: 1 })),
    ).toBe(true);
    expect(
      Number.isNaN(accommodationTotal({ perNight: Infinity, nights: 1 })),
    ).toBe(true);
    expect(
      Number.isNaN(accommodationTotal({ perNight: 12000, nights: -1 })),
    ).toBe(true);
    expect(
      Number.isNaN(accommodationTotal({ perNight: 12000, nights: 1.5 })),
    ).toBe(true);
    expect(
      Number.isNaN(accommodationTotal({ perNight: 12000, nights: Number.NaN })),
    ).toBe(true);
    // Valid inputs still produce exact products (no rounding introduced).
    expect(accommodationTotal({ perNight: 10000, nights: 4 })).toBe(40000);
    expect(accommodationTotal({ perNight: 12345, nights: 3 })).toBe(37035);
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
