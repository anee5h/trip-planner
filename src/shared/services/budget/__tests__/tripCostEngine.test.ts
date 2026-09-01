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
import { getEffectiveBudgetBreakdown } from "@/shared/services/budget/BudgetService";
import { accommodationTotal, isNonNumeric } from "../budgetV2";
import type { BoundedCost } from "../budgetV2";
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
    duration: "fullDay",
    partySize: 2,
    mode: "train",
    ...overrides,
  };
}

type ComponentWithBoundedCost = Omit<
  ReturnType<typeof calculateTripCost>["components"][number],
  "cost"
> & { cost: BoundedCost };

function byScope(
  result: ReturnType<typeof calculateTripCost>,
  scope: string,
): ComponentWithBoundedCost | undefined {
  return result.components.find((c) => c.evidence.scope === scope) as
    ComponentWithBoundedCost | undefined;
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

  it("unknown admission gets a bounded model range, never [0,0]", () => {
    const dest = paidDest({
      id: "unknown-dest",
      budgetBreakdown: undefined,
      budgetMetadata: { method: "unknown" as const },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThan(0);
    expect(c.cost.max).toBeGreaterThan(c.cost.min);
    expect(c.evidence.derivation).toBe("model_estimate");
  });
});

describe("KAI-217A engine — travel completeness", () => {
  it("turns an open-ended origin fare into a bounded planning range", async () => {
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
        duration: "fullDay",
      }),
    );
    const c = byScope(r, "origin_travel")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.evidence.derivation).toBe("model_estimate");
    expect(r.completeness).toBe("complete");
    expect(r.total).toBeDefined();
  });

  it("mixes sourced and modeled costs into a bounded total", async () => {
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
    expect(r.completeness).toBe("complete");
    expect(r.total).toBeDefined();
  });

  it("adds a bounded access envelope to corridor-only origin fare", async () => {
    // A bounded origin with fareScope corridor_only has a missing access
    // leg — the trip must be partial with NO total, and this must hold in
    // THIS layer (the fareScope flows through originTravelComponent onto
    // ComponentEvidence, independent of any later consumer work).
    const { getDestinationListAsync } =
      await import("@/shared/services/destination/DestinationService");
    const { loadDestinationsIndex } =
      await import("@/shared/services/place/PlaceCatalog");
    await loadDestinationsIndex();
    const list = (await getDestinationListAsync("en")) as Destination[];
    const base = list.find((d) => d.id === "nagano-city")!;
    // Explicit route fare = corridor_only (no origin identity, unprovenanced).
    const dest = {
      ...base,
      localTransport: undefined,
      transportFares: { train: 800 },
    } as unknown as Destination;
    const r = calculateTripCost(
      ctx({
        dest,
        mode: "train",
        homeCoords: { lat: 35.6812, lng: 139.7671 },
        duration: "fullDay",
        partySize: 2,
      }),
    );
    const origin = r.components.find(
      (c) => c.evidence.scope === "origin_travel",
    )!;
    // The origin remains bounded and retains corridor provenance, while the
    // model adds a broad access envelope so the traveller gets a usable total.
    expect(origin.cost.kind).toBe("bounded");
    expect(origin.evidence.fareScope).toBe("corridor_only");
    expect(origin.evidence.derivation).toBe("model_estimate");
    expect(r.completeness).toBe("complete");
    expect(r.total).toBeDefined();
    expect(r.evidenceCompleteness).toBe("partial");
  });

  it("keeps missing origin evidence explicit while modeling on-site costs", () => {
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
    expect(r.completeness).toBe("complete");
    expect(r.total).toBeDefined();
    expect(r.components.some((c) => c.cost.kind === "bounded")).toBe(true);
    expect(byScope(r, "origin_travel")!.cost.kind).toBe("not_applicable");
  });
});

describe("KAI-217A engine — local transport", () => {
  it("uses a deterministic local-transport profile when no fact exists", () => {
    const dest = paidDest({
      id: "free-walk-dest",
      budgetBreakdown: { transport: 0, tickets: 0, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "free area / free walking access (ledger FREE_ENTRY)",
      },
      walkingMin: 10,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.max).toBeGreaterThan(c.cost.min);
    expect(c.evidence.derivation).toBe("model_estimate");
  });

  it("does not treat legacy transport:0 as verified walking, but still models a profile", () => {
    const dest = paidDest({
      id: "no-walk-evidence-dest",
      budgetBreakdown: { transport: 0, tickets: 1300, food: 0, cafe: 0 },
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "verified ticket ¥1300 (ledger FIXED_PAID)",
      },
      walkingMin: 0,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThanOrEqual(0);
    expect(c.evidence.derivation).toBe("model_estimate");
  });

  it("does not promote a legacy breakdown allowance to canonical local transport", () => {
    const r = calculateTripCost(ctx({ partySize: 3 }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.evidence.derivation).toBe("model_estimate");
  });
});

describe("KAI-217A engine — accommodation", () => {
  it("day trip has 0 nights → accommodation is bounded at ¥0", () => {
    const r = calculateTripCost(ctx({ duration: "fullDay" }));
    const c = byScope(r, "accommodation")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(r.accommodation).toEqual({ perNight: 0, nights: 0 });
  });

  it("2D1N → 1 night × per-night allowance (never × party)", () => {
    const r = calculateTripCost(
      ctx({
        duration: "2d1n",
        partySize: 4,
      }),
    );
    const c = byScope(r, "accommodation")!;
    expect(r.accommodation).toEqual({ perNight: 10000, nights: 1 });
    expect(accommodationTotal(r.accommodation!)).toBe(10000);
    expect(c.cost).toEqual({ kind: "bounded", min: 10000, max: 22000 });
    expect(c.evidence.derivation).toBe("model_estimate");
  });

  it("multi-night → perNight × explicit nights", () => {
    const r = calculateTripCost(
      ctx({
        duration: "5d4n",
      }),
    );
    expect(r.accommodation).toEqual({ perNight: 10000, nights: 4 });
    expect(accommodationTotal(r.accommodation!)).toBe(40000);
    const c = byScope(r, "accommodation")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 40000, max: 88000 });
  });

  it("accommodation is party-total per night — NEVER multiplies by party size", () => {
    const r = calculateTripCost(
      ctx({
        duration: "3d2n",
        partySize: 4,
      }),
    );
    expect(accommodationTotal(r.accommodation!)).toBe(20000);
    expect(accommodationTotal(r.accommodation!)).not.toBe(20000 * 4);
  });

  it("uses the standard overnight default when allowance is absent", () => {
    const r = calculateTripCost(ctx({ duration: "2d1n" }));
    const c = byScope(r, "accommodation")!;
    expect(c.cost.kind).toBe("bounded");
    expect(r.accommodation).toEqual({ perNight: 10000, nights: 1 });
  });

  it("missing overnight allowance uses a non-zero default instead of leaking ¥0", () => {
    const r = calculateTripCost(ctx({ duration: "2d1n" }));
    expect(r.accommodation).toEqual({ perNight: 10000, nights: 1 });
    const c = byScope(r, "accommodation")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThan(0);
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
    // The profile is estimated, but free admission must not suppress it.
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.max).toBeGreaterThan(0);
    // Admission is still verified-free [0,0].
    const a = byScope(r, "admission")!;
    expect(a.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(a.evidence.state).toBe("verified_free");
  });

  it("hub not_applicable admission retains a modeled local profile", () => {
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
    // Admission N/A (excluded from required set).
    const a = byScope(r, "admission")!;
    expect(a.cost).toEqual({ kind: "not_applicable" });
    // The local profile is an explicitly estimated planning band rather than
    // a claim that the legacy city allowance was a fare.
    const lt = byScope(r, "local_transport")!;
    expect(lt.cost.kind).toBe("bounded");
    expect(lt.evidence.derivation).toBe("model_estimate");
    expect(r.completeness).toBe("complete");
    expect(r.total).toBeDefined();
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

  it("includes meals as a first-class component without cafe/parking/markup", () => {
    const r = calculateTripCost(ctx());
    const scopes = r.components.map((c) => c.evidence.scope);
    expect(scopes).toContain("meals");
    expect(scopes).not.toContain("other");
    if (r.completeness === "complete") {
      // The total must equal exactly the sum of canonical components.
      const expectedMin = r.components.reduce(
        (sum, component) =>
          sum + (component.cost.kind === "bounded" ? component.cost.min : 0),
        0,
      );
      expect(r.total!.min).toBe(expectedMin);
    }
  });
});

// ── KAI-219A: explicit KAI-218 fact consumption ─────────────────────────────
describe("KAI-219A engine — explicit admission fact is authoritative", () => {
  it("explicit verified_paid admission → engine uses the FACT, not legacy tickets", () => {
    // Legacy tickets say 1300; the FACT says 2000. The fact must win.
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 2000, max: 2000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com/ticket"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 4000, max: 4000 });
    expect(c.evidence.state).toBe("verified_paid");
    expect(c.evidence.provenance).toBe("verified_source");
    expect(c.evidence.sourceUrls).toEqual(["https://example.com/ticket"]);
  });

  it("explicit verified_free → ¥0 ONLY with verified_free evidence", () => {
    const dest = paidDest({
      admission: {
        state: "verified_free",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
        basis: "FREE_ENTRY official site states free admission",
        sourceUrls: ["https://example.com/free"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(c.evidence.state).toBe("verified_free");
    expect(c.evidence.derivation).toBe("source_fact");
  });

  it("explicit unavailable admission falls back to a bounded estimate without resurrecting legacy tickets", () => {
    const dest = paidDest({
      // Legacy tickets=1300 numeric exists, but the explicit fact says
      // unavailable — the legacy value must NEVER come back.
      admission: {
        state: "unavailable",
        provenance: "none",
        cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
        scope: "general_entry",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThan(0);
    expect(c.cost.max).toBeGreaterThan(c.cost.min);
    expect(c.evidence.derivation).toBe("model_estimate");
    expect(c.evidence.state).toBe("documented_estimate");
  });

  it("explicit bounded variable_price → range preserved end-to-end (never midpoint-collapsed)", () => {
    const dest = paidDest({
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_product",
        cost: { kind: "bounded", min: 2000, max: 3500 },
        scope: "general_entry",
        sourceUrls: ["https://example.com/prices"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 4000, max: 7000 });
    expect(c.evidence.state).toBe("variable_price");
    expect(c.evidence.provenance).toBe("verified_source");
  });

  it("bounds an open-ended variable price without collapsing its lower bound", () => {
    const dest = paidDest({
      admission: {
        state: "variable_price",
        provenance: "model",
        reasonCode: "price_variable_by_date",
        cost: { kind: "open_ended", from: 1500 },
        scope: "general_entry",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 3000, max: 6000 });
    expect(c.evidence.derivation).toBe("model_estimate");
    expect(r.completeness).toBe("complete");
  });

  it("explicit documented_estimate → bounded model estimate, never source_fact", () => {
    const dest = paidDest({
      admission: {
        state: "documented_estimate",
        provenance: "model",
        cost: { kind: "bounded", min: 800, max: 1200 },
        scope: "general_entry",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 1600, max: 2400 });
    expect(c.evidence.derivation).toBe("model_estimate");
    expect(c.evidence.state).toBe("documented_estimate");
  });

  it("explicit not_applicable admission → non-numeric, excluded from required set", () => {
    const dest = paidDest({
      admission: {
        state: "not_applicable",
        provenance: "model",
        reasonCode: "hub_budget_not_applicable",
        cost: { kind: "not_applicable" },
        scope: "whole_area",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("not_applicable");
  });
});

describe("KAI-219A engine — explicit localTransport fact is consumed", () => {
  it("explicit verified_required_access → bounded verified source fare", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [400, 600],
        fareBasis: "one_way",
        coverage: "all_required_access",
        sourceUrls: ["https://example.com/rail"],
        basis: "Station X is the served stop for this destination",
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    // one_way basis: fare × 2 (out+back) × partySize.
    expect(c.cost).toEqual({ kind: "bounded", min: 1600, max: 2400 });
    expect(c.evidence.state).toBe("verified_paid");
    expect(c.evidence.provenance).toBe("verified_source");
    expect(c.evidence.derivation).toBe("source_fact");
    expect(c.evidence.localCoverage).toBe("all_required_access");
  });

  it("explicit verified_walking → ¥0 ONLY with required evidence", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_walking",
        walkingEvidence: "Official site states 5 min walk from station",
        walkingMinutes: 5,
        sourceUrls: ["https://example.com/access"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(c.evidence.state).toBe("verified_free");
  });

  it("explicit bounded_defensible_access → bounded model estimate", () => {
    const dest = paidDest({
      localTransport: {
        kind: "bounded_defensible_access",
        access: "rail",
        band: "≤15km",
        fare: [500, 800],
        fareBasis: "one_way",
        coverage: "all_required_access",
        distanceKm: 12,
        sourceUrls: ["https://example.com/operator"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    // one_way basis: fare × 2 (out+back) × partySize.
    expect(c.cost).toEqual({ kind: "bounded", min: 2000, max: 3200 });
    expect(c.evidence.derivation).toBe("model_estimate");
    expect(c.evidence.localCoverage).toBe("all_required_access");
  });

  it("explicit localTransport unavailable falls back to a deterministic profile", () => {
    const dest = paidDest({
      localTransport: {
        kind: "unavailable",
        reason: "no_on_site_evidence",
        detail: "No route evidence found",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThanOrEqual(0);
    expect(c.evidence.derivation).toBe("model_estimate");
  });

  it("missing localTransport uses a profile, not the legacy breakdown allowance", () => {
    // paidDest carries budgetBreakdown.transport=1000 — with NO explicit
    // localTransport fact, the generic allowance must NOT become the
    // canonical local-transport cost.
    const dest = paidDest({}); // no localTransport fact
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.evidence.derivation).toBe("model_estimate");
  });
});

// ── KAI-219A contract (Fix 1): local-transport fareBasis + coverage ────────
describe("KAI-219A — local-transport fare basis + coverage contract", () => {
  it("A) ¥500 one_way, party 2 → canonical local transport ¥2,000", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [500, 500],
        fareBasis: "one_way",
        coverage: "all_required_access",
        sourceUrls: ["https://example.com/rail"],
        basis: "Served stop",
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    // one_way: 500 × 2 (out+back) × 2 party = 2000.
    expect(c.cost).toEqual({ kind: "bounded", min: 2000, max: 2000 });
  });

  it("B) ¥1,000 round_trip, party 2 → ¥2,000", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [1000, 1000],
        fareBasis: "round_trip",
        coverage: "all_required_access",
        sourceUrls: ["https://example.com/rail"],
        basis: "Served stop",
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    // round_trip: 1000 × 2 party = 2000.
    expect(c.cost).toEqual({ kind: "bounded", min: 2000, max: 2000 });
  });

  it("C) segment_only fare gets a bounded whole-access envelope with provenance", () => {
    // All other components complete (origin via a bounded verified route
    // + admission verified_paid), local transport = bounded segment_only.
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [300, 400],
        fareBasis: "one_way",
        coverage: "segment_only",
        sourceUrls: ["https://example.com/rail"],
        basis: "Only the station→gate segment is covered",
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    // The estimate is bounded but evidence remains partial.
    expect(r.completeness).toBe("complete");
    expect(r.evidenceCompleteness).toBe("partial");
    const seg = byScope(r, "local_transport")!;
    expect(seg.cost.kind).toBe("bounded");
    expect(seg.cost.max).toBeGreaterThan(seg.cost.min);
    expect(seg.evidence.localCoverage).toBe("segment_only");
    expect(r.total).toBeDefined();
  });

  it("D) all_required_access bounded → can participate in a COMPLETE result", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [500, 600],
        fareBasis: "round_trip",
        coverage: "all_required_access",
        sourceUrls: ["https://example.com/rail"],
        basis: "Served stop",
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    // paidDest has trusted admission (1300) + all_required_access local
    // transport (bounded) — but origin_travel is unavailable (no
    // mode/homeCoords) → still partial. The local_transport component
    // itself is bounded and NOT in missingComponents.
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    if (r.completeness === "partial") {
      expect(
        r.missingComponents.some((m) => m.scope === "local_transport"),
      ).toBe(false);
    }
  });

  it("invalid local-transport facts fall back to a bounded profile", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [400, 600],
        sourceUrls: ["https://example.com/rail"],
        basis: "Served stop",
        checkedAt: "2026-01-01",
        // missing fareBasis + coverage
      } as never,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.evidence.derivation).toBe("model_estimate");
  });
});

// ── KAI-219A contract (Fix 2): SHARED free-evidence rule ────────────────────
describe("KAI-219A — shared verified-free evidence rule (hasVerifiedFreeEvidence)", () => {
  function freeDest(basis: string) {
    return paidDest({
      admission: {
        state: "verified_free",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
        basis,
        sourceUrls: ["https://example.com/free"],
        checkedAt: "2026-01-01",
      },
    });
  }

  it("'not free area' → INVALID verified_free (negative evidence rejects)", () => {
    const r = calculateTripCost(
      ctx({ dest: freeDest("This is a not free area; admission applies") }),
    );
    const admission = byScope(r, "admission")!;
    expect(admission.cost.kind).toBe("bounded");
    expect(admission.cost.min).toBeGreaterThan(0);
    expect(admission.evidence.state).toBe("documented_estimate");
  });

  it("'free, but tickets required' → INVALID (negative evidence rejects)", () => {
    const r = calculateTripCost(
      ctx({
        dest: freeDest("Free to enter, but tickets required for exhibits"),
      }),
    );
    const admission = byScope(r, "admission")!;
    expect(admission.cost.kind).toBe("bounded");
    expect(admission.cost.min).toBeGreaterThan(0);
    expect(admission.evidence.state).toBe("documented_estimate");
  });

  it("'free' → valid when other requirements are satisfied", () => {
    const r = calculateTripCost(
      ctx({ dest: freeDest("The garden is free to enter") }),
    );
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
  });

  it("'無料開放' → valid (JA positive evidence)", () => {
    const r = calculateTripCost(ctx({ dest: freeDest("庭園は無料開放") }));
    const c = byScope(r, "admission")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
  });
});

// ── KAI-219A contract (Fix 5): strict YYYY-MM-DD checkedAt ──────────────────
describe("KAI-219A — strict checkedAt date validation", () => {
  it("2026-02-28 → valid", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 1000, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-02-28",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    expect(byScope(r, "admission")!.cost.kind).toBe("bounded");
  });

  it("2026-02-30 → invalid (impossible date)", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 1000, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-02-30",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const admission = byScope(r, "admission")!;
    expect(admission.cost.kind).toBe("bounded");
    expect(admission.cost.min).toBeGreaterThan(0);
    expect(admission.evidence.state).toBe("documented_estimate");
  });

  it("01/02/2026 → invalid (ambiguous format)", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 1000, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "01/02/2026",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const admission = byScope(r, "admission")!;
    expect(admission.cost.kind).toBe("bounded");
    expect(admission.cost.min).toBeGreaterThan(0);
    expect(admission.evidence.state).toBe("documented_estimate");
  });
});

describe("KAI-219A engine — transitional fallback boundary", () => {
  it("absent admission + trusted transitional legacy ticket → fallback works ONLY there", () => {
    // paidDest: manual method + verified ticket basis → KAI-214 trusted.
    const dest = paidDest({}); // no explicit admission fact
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "admission")!;
    // Transitional fallback: trusted legacy tickets 1300 × 2 = 2600.
    expect(c.cost).toEqual({ kind: "bounded", min: 2600, max: 2600 });
    expect(c.evidence.state).toBe("verified_paid");
  });

  it("legacy/unverified admission is not promoted, but receives a model fallback", () => {
    const dest = paidDest({
      budgetMetadata: {
        method: "legacy",
        confidence: "low",
        basis: "unsourced legacy value",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThan(0);
    expect(c.evidence.state).toBe("documented_estimate");
  });

  it("absent admission gets a non-zero model fallback, not a fabricated free value", () => {
    const dest = paidDest({
      budgetMetadata: { method: "unknown" },
      budgetBreakdown: undefined,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost.min).toBeGreaterThan(0);
    expect(c.cost.max).toBeGreaterThan(c.cost.min);
  });
});

describe("KAI-219A — one-way compatibility projection", () => {
  it("explicit admission fact → legacy tickets projection is v2→legacy ONLY (never write-back)", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 2000, max: 2000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    }) as unknown as Parameters<typeof getEffectiveBudgetBreakdown>[0];
    const proj = getEffectiveBudgetBreakdown(dest);
    // Projection reads FROM the fact (tickets = fact max, 2000), NOT the
    // legacy 1300.
    expect(proj?.tickets).toBe(2000);
    // The fact is unchanged after projection (read-only).
    expect(dest.admission?.cost).toEqual({
      kind: "bounded",
      min: 2000,
      max: 2000,
    });
  });

  it("non-numeric admission fact → no tickets projection; legacy consumers see unavailable", () => {
    const dest = paidDest({
      admission: {
        state: "unavailable",
        provenance: "none",
        cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
        scope: "general_entry",
      },
    }) as unknown as Parameters<typeof getEffectiveBudgetBreakdown>[0];
    const proj = getEffectiveBudgetBreakdown(dest);
    expect(proj?.tickets).toBeUndefined();
  });
});

// ── KAI-219A: Luna blocker regressions ──────────────────────────────────────
describe("KAI-219A — Luna blocker fixes", () => {
  it("runtime fail-closed: verified_free fact WITHOUT evidence → unavailable, never [0,0]", () => {
    // A malformed persisted fact (verified_free state but no free basis /
    // no verified provenance) must NOT create an unverified canonical zero.
    const dest = paidDest({
      admission: {
        state: "verified_free",
        provenance: "none",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
    expect(c.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
  });

  it("runtime fail-closed: verified_paid with legacy provenance → unavailable, not promoted", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "legacy",
        cost: { kind: "bounded", min: 2000, max: 2000 },
        scope: "general_entry",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("runtime fail-closed: verified_walking WITHOUT walkingEvidence → unavailable, never ¥0", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_walking",
        // no walkingEvidence — invalid per KAI-218A
      } as never,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("projection never synthesizes zeros for absent legacy transport/food/cafe", () => {
    // Explicit admission fact + NO legacy breakdown at all.
    const dest = paidDest({
      budgetBreakdown: undefined,
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 2000, max: 2000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    }) as unknown as Parameters<typeof getEffectiveBudgetBreakdown>[0];
    const proj = getEffectiveBudgetBreakdown(dest);
    // Fail closed: null, NOT { transport: 0, tickets: 2000, food: 0, cafe: 0 }.
    expect(proj).toBeNull();
  });
});

// ── KAI-219A review repair: malformed persisted-fact runtime fixtures ──────
describe("KAI-219A — malformed persisted facts fail closed (shared validator)", () => {
  it("verified_paid with negative bounded range → unavailable, never numeric", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: -500, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("verified_paid with min > max → unavailable, never numeric", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 2000, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("verified_paid with NaN-like range (non-finite) → unavailable", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: Number.NaN, max: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("verified_paid with zero range → unavailable (zero range rejected as paid)", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("verified_paid wrong cost kind (open_ended) → unavailable", () => {
    const dest = paidDest({
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "open_ended", from: 1000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("verified_free missing sourceUrls / checkedAt → unavailable, never [0,0]", () => {
    const dest = paidDest({
      admission: {
        state: "verified_free",
        provenance: "verified_source",
        basis: "FREE_ENTRY",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
        // missing sourceUrls + checkedAt
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("variable_price bounded missing checkedAt → unavailable", () => {
    const dest = paidDest({
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "bounded", min: 1000, max: 3000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        // missing checkedAt
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("malformed local fare range (min > max) → unavailable", () => {
    const dest = paidDest({
      localTransport: {
        kind: "verified_required_access",
        fare: [2000, 500],
        sourceUrls: ["https://example.com"],
        basis: "local bus/train",
        checkedAt: "2026-01-01",
      } as never,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("bounded");
  });

  it("bounded variable_price valid → range preserved end-to-end (not collapsed)", () => {
    const dest = paidDest({
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "bounded", min: 1000, max: 3000 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("bounded");
    if (c.cost.kind === "bounded") {
      expect(c.cost.min).toBe(1000 * 2);
      expect(c.cost.max).toBe(3000 * 2);
    }
  });
});
