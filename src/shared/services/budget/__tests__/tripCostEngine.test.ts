/**
 * KAI-217A — TripCostEngine core tests.
 *
 * Covers the canonical calculateTripCost contract:
 *   - verified paid / verified free / not_applicable / unknown admission
 *   - open-ended / partial / mixed-bounded travel → partial, total forbidden
 *   - all bounded → complete with summed total
 *   - day trip (0 nights) / 2D1N (1 night) / multi-night (N nights)
 *   - accommodation: party-total per-night × nights, NEVER × party
 *   - verified free local transport → bounded [0,0], not unavailable
 *   - no usable evidence → unavailable
 */

import { describe, it, expect } from "vitest";
import { calculateTripCost, type TripCostContext } from "../tripCostEngine";
import {
  accommodationTotal,
  isNonNumeric,
  isValidTripCostResult,
} from "../budgetV2";
import type { Destination } from "@/shared/types/destination";

/** Minimal trusted paid-admission fixture (transitional manual path). */
function paidDest(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "paid-dest",
    name: "Paid Dest",
    prefecture: "Kanagawa",
    region: "Kanto",
    budgetBreakdown: { transport: 1000, tickets: 1300, food: 0, cafe: 0 },
    budgetMetadata: {
      method: "manual",
      confidence: "low",
      basis: "verified ticket ¥1300 (ledger FIXED_PAID)",
    },
    recommendedVisitHours: { min: 1, max: 2 },
    totalTripHours: 2,
    transportOptions: { train: 30 },
    transportFares: { train: 800 },
    ...overrides,
  } as unknown as Destination;
}

function ctx(overrides: Partial<TripCostContext> = {}): TripCostContext {
  return {
    dest: paidDest(),
    tripMode: "day_trip",
    partySize: 2,
    mode: "train",
    ...overrides,
  };
}

function byScope(result: ReturnType<typeof calculateTripCost>, scope: string) {
  return result.components.find((c) => c.evidence.scope === scope);
}

describe("KAI-217A engine — admission", () => {
  it("verified paid admission maps to bounded tickets × party", () => {
    const r = calculateTripCost(ctx({ partySize: 2 }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 2600, max: 2600 });
    expect(c.evidence.state).toBe("verified_paid");
    expect(c.evidence.derivation).toBe("source_fact");
  });

  it("verified free admission maps to bounded [0,0] with verified_free evidence (NOT unavailable)", () => {
    const dest = paidDest({
      id: "free-dest",
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified free admission (ledger FREE_ENTRY)",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(c.evidence.state).toBe("verified_free");
    expect(c.evidence.derivation).toBe("source_fact");
    expect(c.cost.kind).not.toBe("unavailable");
  });

  it("not-applicable admission (hub) maps to not_applicable with reason", () => {
    const dest = paidDest({
      id: "hub-dest",
      role: "hub" as const,
      budgetMetadata: {
        method: "model",
        state: "not_applicable" as const,
        provenance: "model" as const,
        reasonCode: "hub_budget_not_applicable" as const,
        basis: "hub — admission not conceptually applicable",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "not_applicable" });
    expect(c.evidence.reason).toBe("hub_budget_not_applicable");
    expect(isNonNumeric(c.cost)).toBe(true);
  });

  it("unknown admission maps to unavailable, never [0,0]", () => {
    const dest = paidDest({
      id: "unknown-dest",
      budgetBreakdown: undefined,
      budgetMetadata: { method: "unknown" as const },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "unavailable", reason: "source_missing" });
    expect(c.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
  });
});

describe("KAI-217A engine — travel completeness", () => {
  it("open-ended origin travel → partial, NEVER complete", async () => {
    // Real nagano-city: Tokyo→Nagano bus corridor has a dynamic fare
    // [3500,null] → the KAI-216 ladder emits open_ended.
    const { getDestinationListAsync } =
      await import("@/shared/services/destination/DestinationService");
    const { loadDestinationsIndex } =
      await import("@/shared/services/place/PlaceCatalog");
    await loadDestinationsIndex();
    const list = (await getDestinationListAsync("en")) as Destination[];
    const dest = list.find((d) => d.id === "nagano-city")!;
    const r = calculateTripCost(
      ctx({
        dest,
        mode: "bus",
        homeCoords: { lat: 35.6812, lng: 139.7671 }, // Tokyo
        tripMode: "day_trip",
      }),
    );
    const c = byScope(r, "origin_travel")!;
    expect(c.cost.kind).toBe("open_ended");
    expect(r.completeness).toBe("partial");
    expect(r.total).toBeUndefined();
  });

  it("mixed bounded + open_ended → partial, total ABSENT", async () => {
    const { getDestinationListAsync } =
      await import("@/shared/services/destination/DestinationService");
    const { loadDestinationsIndex } =
      await import("@/shared/services/place/PlaceCatalog");
    await loadDestinationsIndex();
    const list = (await getDestinationListAsync("en")) as Destination[];
    const dest = list.find((d) => d.id === "nagano-city")!;
    // Bounded admission (verified_paid tickets) + open_ended origin travel.
    const r = calculateTripCost(
      ctx({
        dest,
        mode: "bus",
        homeCoords: { lat: 35.6812, lng: 139.7671 },
      }),
    );
    expect(r.completeness).toBe("partial");
    expect(r.total).toBeUndefined();
    // The partial result must never fabricate a total (structural invariant).
    expect(isValidTripCostResult(r)).toBe(true);
    expect((r as { total?: unknown }).total).toBeUndefined();
  });

  it("all components bounded → complete with summed total", () => {
    const r = calculateTripCost(ctx({ partySize: 2 }));
    expect(r.completeness).toBe("complete");
    if (r.completeness === "complete") {
      // origin 800×2×2=3200 + admission 1300×2=2600 + local 1000×2=2000.
      expect(r.total).toEqual({ kind: "bounded", min: 7800, max: 7800 });
      expect(isValidTripCostResult(r)).toBe(true);
    }
  });

  it("no usable evidence at all → unavailable", () => {
    const dest = {
      id: "empty-dest",
      name: "Empty",
      prefecture: "Hokkaido",
      transportOptions: {},
      transportFares: undefined,
      budgetBreakdown: undefined,
      budgetMetadata: undefined,
    } as unknown as Destination;
    const r = calculateTripCost(ctx({ dest }));
    expect(r.completeness).toBe("unavailable");
    expect(r.total).toBeUndefined();
    expect(r.components.every((c) => isNonNumeric(c.cost))).toBe(true);
    expect(isValidTripCostResult(r)).toBe(true);
  });
});

describe("KAI-217A engine — local transport", () => {
  it("verified free local transport maps to bounded [0,0] (NOT unavailable)", () => {
    const dest = paidDest({
      id: "free-walk-dest",
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "free area / free walking access (ledger FREE_ENTRY)",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(c.evidence.state).toBe("verified_free");
    expect(c.evidence.derivation).toBe("source_fact");
    expect(c.cost.kind).not.toBe("unavailable");
  });

  it("known local transport scales per-person × party", () => {
    const r = calculateTripCost(ctx({ partySize: 3 }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 3000, max: 3000 });
  });
});

describe("KAI-217A engine — accommodation", () => {
  it("day trip has 0 nights → accommodation not_applicable, no allowance claim", () => {
    const r = calculateTripCost(ctx({ tripMode: "day_trip" }));
    const c = byScope(r, "accommodation")!;
    expect(c.cost).toEqual({ kind: "not_applicable" });
    // No allowance supplied → no accommodation claim (unknown ≠ ¥0).
    expect(r.accommodation).toBeUndefined();
  });

  it("2D1N → 1 night × per-night allowance (never × party)", () => {
    const r = calculateTripCost(
      ctx({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 12000,
        partySize: 4,
      }),
    );
    const c = byScope(r, "accommodation")!;
    expect(r.accommodation).toEqual({ perNight: 12000, nights: 1 });
    expect(accommodationTotal(r.accommodation!)).toBe(12000);
    expect(c.cost).toEqual({ kind: "bounded", min: 12000, max: 12000 });
    expect(c.evidence.derivation).toBe("user_allowance");
    expect(c.evidence.provenance).toBeUndefined();
  });

  it("multi-night → perNight × explicit nights", () => {
    const r = calculateTripCost(
      ctx({
        tripMode: "multi_night",
        nights: 4,
        accommodationAllowance: 10000,
      }),
    );
    expect(r.accommodation).toEqual({ perNight: 10000, nights: 4 });
    expect(accommodationTotal(r.accommodation!)).toBe(40000);
    const c = byScope(r, "accommodation")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 40000, max: 40000 });
  });

  it("accommodation is party-total per night — NEVER multiplies by party size", () => {
    const r = calculateTripCost(
      ctx({
        tripMode: "multi_night",
        nights: 2,
        accommodationAllowance: 8000,
        partySize: 4,
      }),
    );
    expect(accommodationTotal(r.accommodation!)).toBe(16000);
    expect(accommodationTotal(r.accommodation!)).not.toBe(16000 * 4);
  });

  it("absent allowance with nights > 0 → accommodation unavailable (never invented)", () => {
    const r = calculateTripCost(
      ctx({ tripMode: "weekend_2d1n", accommodationAllowance: undefined }),
    );
    const c = byScope(r, "accommodation")!;
    expect(c.cost.kind).toBe("unavailable");
  });

  it("missing overnight allowance never leaks as ¥0 lodging (Luna blocker 3)", () => {
    const r = calculateTripCost(
      ctx({ tripMode: "weekend_2d1n", accommodationAllowance: undefined }),
    );
    // The component is unavailable AND result.accommodation is absent —
    // a consumer must not be able to read {perNight: 0, nights: 1}.
    expect(r.accommodation).toBeUndefined();
    const c = byScope(r, "accommodation")!;
    expect(c.cost.kind).toBe("unavailable");
  });
});

describe("KAI-217A engine — Luna blocker regressions", () => {
  it("free admission with REAL local transport keeps the transit allowance (Luna blocker 1)", () => {
    // Free-admission record with a real on-site transit allowance (the
    // verified-free shortcut must NOT zero local transport).
    const dest = paidDest({
      id: "free-admission-with-transit",
      budgetBreakdown: { transport: 1083, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified free admission (ledger FREE_ENTRY)",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    // Local transport reads the actual allowance (1083 × 2), NOT forced to
    // [0,0] by the free admission.
    expect(c.cost).toEqual({ kind: "bounded", min: 2166, max: 2166 });
    // Admission is still verified-free [0,0].
    const a = byScope(r, "admission")!;
    expect(a.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(a.evidence.state).toBe("verified_free");
  });

  it("hub not_applicable admission + known local transport → complete (Luna blocker 2)", () => {
    const dest = paidDest({
      id: "hub-with-transit",
      role: "hub" as const,
      budgetBreakdown: { transport: 800, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "model",
        state: "not_applicable" as const,
        provenance: "model" as const,
        reasonCode: "hub_budget_not_applicable" as const,
        basis: "hub — admission not conceptually applicable",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    // Admission N/A (excluded from required set) + local transport known
    // + bounded origin → complete.
    const a = byScope(r, "admission")!;
    expect(a.cost).toEqual({ kind: "not_applicable" });
    const lt = byScope(r, "local_transport")!;
    expect(lt.cost).toEqual({ kind: "bounded", min: 1600, max: 1600 });
    expect(r.completeness).toBe("complete");
  });

  it("fractional party size fails closed (Luna warning)", () => {
    const r = calculateTripCost(ctx({ partySize: 2.5 }));
    expect(r.completeness).toBe("unavailable");
    expect(r.total).toBeUndefined();
  });
});

describe("KAI-217A engine — cross-cutting invariants", () => {
  it("invalid party size fails closed to unavailable", () => {
    const r = calculateTripCost(ctx({ partySize: Number.NaN }));
    expect(r.completeness).toBe("unavailable");
    expect(r.total).toBeUndefined();
  });

  it("food/cafe/parking/5% never appear in components or total", () => {
    const r = calculateTripCost(ctx());
    const scopes = r.components.map((c) => c.evidence.scope);
    expect(scopes).not.toContain("meals");
    expect(scopes).not.toContain("other");
    if (r.completeness === "complete") {
      // The total must equal exactly origin+admission+local+accommodation.
      const origin = byScope(r, "origin_travel")!;
      const admission = byScope(r, "admission")!;
      const local = byScope(r, "local_transport")!;
      const acc = byScope(r, "accommodation")!;
      const expectedMin =
        (origin.cost.kind === "bounded" ? origin.cost.min : 0) +
        (admission.cost.kind === "bounded" ? admission.cost.min : 0) +
        (local.cost.kind === "bounded" ? local.cost.min : 0) +
        (acc.cost.kind === "bounded" ? acc.cost.min : 0);
      expect(r.total.min).toBe(expectedMin);
    }
  });
});
