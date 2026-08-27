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

  it("bounded corridor-only origin → PARTIAL, no total (KAI-216 round-2 regression)", async () => {
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
      transportFares: { train: 800 },
    } as unknown as Destination;
    const r = calculateTripCost(
      ctx({
        dest,
        mode: "train",
        homeCoords: { lat: 35.6812, lng: 139.7671 },
        tripMode: "day_trip",
        partySize: 2,
      }),
    );
    const origin = r.components.find(
      (c) => c.evidence.scope === "origin_travel",
    )!;
    // The origin is BOUNDED but corridor_only.
    expect(origin.cost.kind).toBe("bounded");
    expect(origin.evidence.fareScope).toBe("corridor_only");
    // ⇒ the trip is PARTIAL and MUST NOT produce a total.
    expect(r.completeness).toBe("partial");
    expect((r as { total?: unknown }).total).toBeUndefined();
    expect(isValidTripCostResult(r)).toBe(true);
    // KAI-217A round-3: canonical partial-result semantics.
    if (r.completeness === "partial") {
      // knownSubtotal present (origin fare is known & bounded).
      expect(Array.isArray(r.knownSubtotal)).toBe(true);
      expect(r.knownSubtotal[1]).toBeGreaterThanOrEqual(r.knownSubtotal[0]);
      // missing local_transport is EXPLICIT (unavailable — no fact).
      const missingScopes = r.missingComponents.map((m) => m.scope);
      expect(missingScopes).toContain("local_transport");
      expect(missingScopes).toContain("origin_travel"); // corridor-only
      expect(r.missingComponents.every((m) => m.reason.length > 0)).toBe(true);
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
  it("local transport is UNAVAILABLE until an explicit defensible fact exists (KAI-216 round-2)", () => {
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
    // KAI-216 round-2: the legacy transport allowance (even trusted-manual,
    // even with walkingMin/basis text) is NOT explicit defensible
    // local-transport evidence. Manual provenance can verify admission
    // while the old allowance stays generic; walking ¥0 is manufactured
    // only from explicit localTransport facts. ⇒ unavailable.
    expect(c.cost.kind).toBe("unavailable");
  });

  it("manual transport:0 stays unavailable — walking ¥0 is never manufactured from walkingMin/regex", () => {
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
    expect(c.cost.kind).toBe("unavailable");
  });

  it("no legacy breakdown allowance becomes canonical local transport", () => {
    const r = calculateTripCost(ctx({ partySize: 3 }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("unavailable");
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
    // KAI-216 round-2: the free admission must NOT zero local transport,
    // but the legacy allowance is ALSO not explicit defensible evidence →
    // local transport is unavailable (never a fabricated [0,0], never a
    // legacy allowance promoted to canonical).
    expect(c.cost.kind).toBe("unavailable");
    // Admission is still verified-free [0,0].
    const a = byScope(r, "admission")!;
    expect(a.cost).toEqual({ kind: "bounded", min: 0, max: 0 });
    expect(a.evidence.state).toBe("verified_free");
  });

  it("hub not_applicable admission + MODEL peer-cell transport → local transport unavailable (KAI-216 repair: no generic city allowance)", () => {
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
    // KAI-216 repair: a MODEL hub's peer-cell transport value is a generic
    // city allowance, NOT defensible local-transport evidence → unavailable.
    // The trip is partial (missing required local transport), never
    // complete on a generic allowance.
    const lt = byScope(r, "local_transport")!;
    expect(lt.cost.kind).toBe("unavailable");
    expect(r.completeness).toBe("partial");
    expect(r.total).toBeUndefined();
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

  it("explicit unavailable admission + legacy numeric tickets → stays unavailable, legacy NOT resurrected", () => {
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
    expect(c.cost.kind).toBe("unavailable");
    expect(c.evidence.state).toBe("unavailable");
    expect(c.cost).not.toEqual({ kind: "bounded", min: 2600, max: 2600 });
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

  it("explicit open-ended variable_price → remains open-ended", () => {
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
    expect(c.cost).toEqual({ kind: "open_ended", from: 3000 });
    expect(r.completeness).toBe("partial"); // open_ended never complete
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
        sourceUrls: ["https://example.com/rail"],
        coverage: "all_day",
        basis: "Station X is the served stop for this destination",
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 800, max: 1200 });
    expect(c.evidence.state).toBe("verified_paid");
    expect(c.evidence.provenance).toBe("verified_source");
    expect(c.evidence.derivation).toBe("source_fact");
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
        distanceKm: 12,
        sourceUrls: ["https://example.com/operator"],
        checkedAt: "2026-01-01",
      },
    });
    const r = calculateTripCost(ctx({ dest, partySize: 2 }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost).toEqual({ kind: "bounded", min: 1000, max: 1600 });
    expect(c.evidence.derivation).toBe("model_estimate");
  });

  it("explicit localTransport unavailable → unavailable (never a generic allowance)", () => {
    const dest = paidDest({
      localTransport: {
        kind: "unavailable",
        reason: "no_on_site_evidence",
        detail: "No route evidence found",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("unavailable");
    expect(c.evidence.derivation).toBe("computed");
  });

  it("missing localTransport + legacy budgetBreakdown.transport numeric → unavailable; generic allowance NEVER consumed", () => {
    // paidDest carries budgetBreakdown.transport=1000 — with NO explicit
    // localTransport fact, the generic allowance must NOT become the
    // canonical local-transport cost.
    const dest = paidDest({}); // no localTransport fact
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "local_transport")!;
    expect(c.cost.kind).toBe("unavailable");
    expect(c.evidence.reason).toBe("source_missing");
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

  it("legacy/unverified admission → NEVER promoted to known", () => {
    const dest = paidDest({
      budgetMetadata: {
        method: "legacy",
        confidence: "low",
        basis: "unsourced legacy value",
      },
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("unavailable");
    expect(c.evidence.state).toBe("legacy_unverified");
  });

  it("absent admission + untrusted legacy → unavailable, not a fabricated value", () => {
    const dest = paidDest({
      budgetMetadata: { method: "unknown" },
      budgetBreakdown: undefined,
    });
    const r = calculateTripCost(ctx({ dest }));
    const c = byScope(r, "admission")!;
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
    expect(c.cost.kind).toBe("unavailable");
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
