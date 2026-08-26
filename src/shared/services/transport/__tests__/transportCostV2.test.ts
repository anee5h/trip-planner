/**
 * KAI-216 — Transport range contract tests.
 *
 * Covers the canonical structured transport cost (getCanonicalTransportCost):
 *   - fixed fare → bounded [min,max] with min===max
 *   - range fare → bounded [min,max] preserving BOTH bounds (no midpoint)
 *   - dynamic "from ¥X" fare → open_ended (never [x,x])
 *   - missing/unverified fare → unavailable (never ¥0)
 *   - KAI-204 local bounded rail → bounded + model_estimate derivation
 *   - flight: verified route fare only (access legs excluded); unverified → unavailable
 *   - ferry: verified service fare per basis; expired → unavailable
 *   - car/my_car without explicit fare → unavailable (no toll fabrication)
 *   - unknown never becomes zero
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getCanonicalTransportCost } from "../transportCostV2";
import {
  getLocalBoundedRailFareEstimate,
  LOCAL_BOUNDED_FARE_SOURCE_URLS,
} from "../LocalBoundedFareEstimator";
import { getFlightTransportEstimate } from "../FlightTransportEstimator";
import { getFerryTransportEstimate } from "../FerryTransportEstimator";
import { getDestinationListAsync } from "@/shared/services/destination/DestinationService";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import type { FerryTemporalContext } from "../types";
import type { Destination } from "@/shared/types/destination";
import { isBoundedCost, isOpenEnded } from "@/shared/services/budget/budgetV2";

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const OSAKA = { lat: 34.7025, lng: 135.4959 };
const WAKAYAMA = { lat: 34.2261, lng: 135.1675 };
const SUMMER: FerryTemporalContext = {
  travelDate: new Date("2026-08-06T12:00:00+09:00"),
};

let catalog: Destination[];

beforeAll(async () => {
  await loadDestinationsIndex();
  catalog = (await getDestinationListAsync("en")) as Destination[];
});

function byId(id: string): Destination {
  const d = catalog.find((x) => x.id === id);
  if (!d) throw new Error(`missing fixture ${id}`);
  return d;
}

describe("KAI-216 canonical transport cost — fixed and range fares", () => {
  it("verified fixed shinkansen fare maps to bounded with min===max (Osaka→Fukuoka)", () => {
    // osaka→fukuoka shinkansen [15520,16020] reserved range.
    const dest = byId("fukuoka-city");
    const r = getCanonicalTransportCost(dest, "shinkansen", 1, OSAKA);
    expect(r.cost.kind).toBe("bounded");
    if (r.cost.kind === "bounded") {
      expect(r.cost.min).toBe(15520 * 2); // one-way × round trip × party 1
      expect(r.cost.max).toBe(16020 * 2);
      expect(isBoundedCost(r.cost)).toBe(true);
    }
    // The corridor fare scope: a hub catchment access can make it
    // corridor_only (access estimated); a station-pair registry row is
    // complete. Both are verified-fare scopes.
    expect(["complete", "corridor_only"]).toContain(r.evidence.fareScope);
    expect(r.evidence.derivation).toBe("source_fact");
    expect(r.source).toBe("verified_corridor_fare");
  });

  it("verified range fare preserves BOTH bounds (no midpoint collapse)", () => {
    const dest = byId("fukuoka-city");
    const r = getCanonicalTransportCost(dest, "shinkansen", 1, OSAKA);
    expect(r.cost.kind).toBe("bounded");
    if (r.cost.kind === "bounded") {
      // The canonical representation must never reduce to a single number.
      expect(r.cost.max).toBeGreaterThan(r.cost.min);
    }
  });

  it("explicit transportFares flows through as bounded (round-trip × party)", () => {
    const dest = {
      id: "explicit-fare",
      name: "Explicit",
      prefecture: "Tokyo",
      transportFares: { train: 800 },
    } as unknown as Destination;
    const r = getCanonicalTransportCost(dest, "train", 2);
    expect(r.cost.kind).toBe("bounded");
    if (r.cost.kind === "bounded") {
      expect(r.cost.min).toBe(800 * 2 * 2); // one-way × round trip × party
      expect(r.cost.max).toBe(800 * 2 * 2);
    }
    expect(r.source).toBe("explicit_transport_fare");
  });

  it("car explicit vehicle total scales by cars needed", () => {
    const dest = {
      id: "car-explicit",
      name: "Car",
      prefecture: "Tokyo",
      transportFares: { car: 12000 },
    } as unknown as Destination;
    // party 5 → 2 cars (ceil(5/4)).
    const r = getCanonicalTransportCost(dest, "car", 5);
    expect(r.cost.kind).toBe("bounded");
    if (r.cost.kind === "bounded") {
      expect(r.cost.min).toBe(12000 * 2);
      expect(r.cost.max).toBe(12000 * 2);
    }
  });
});

describe("KAI-216 canonical transport cost — open-ended fares", () => {
  it("dynamic bus fare maps to open_ended, never bounded [x,x]", () => {
    // tokyo→nagano bus [3500,null] dynamic ("from ¥3,500").
    const dest = byId("nagano-city");
    const r = getCanonicalTransportCost(dest, "bus", 1, TOKYO);
    expect(r.cost.kind).toBe("open_ended");
    if (r.cost.kind === "open_ended") {
      expect(r.cost.from).toBe(3500 * 2); // lower bound × round trip
      expect(isOpenEnded(r.cost)).toBe(true);
    }
    // MUST NOT equal a fixed [3500,3500] bounded claim.
    expect(r.cost).not.toEqual({
      kind: "bounded",
      min: 3500 * 2,
      max: 3500 * 2,
    });
    expect(isBoundedCost(r.cost as never)).toBe(false);
  });

  it("dynamic bus fare scales to round-trip × party as open_ended", () => {
    const dest = byId("nagano-city");
    const r = getCanonicalTransportCost(dest, "bus", 2, TOKYO);
    expect(r.cost.kind).toBe("open_ended");
    if (r.cost.kind === "open_ended") {
      expect(r.cost.from).toBe(3500 * 2 * 2);
    }
  });
});

describe("KAI-216 canonical transport cost — KAI-204 local bounded rail", () => {
  it("local bounded rail fare maps to bounded with model_estimate derivation", () => {
    // Yokohama from NAKAYAMA (Kanagawa) — within the 50 km local domain.
    const dest = {
      ...byId("yokohama-city"),
      id: "synthetic-budget-local-yokohama",
      transportOptions: { train: 30 },
    } as unknown as Destination;
    const local = getLocalBoundedRailFareEstimate(dest, {
      homeStationCoords: { lat: 35.514745, lng: 139.539692 },
    });
    // If the local estimator resolves, the canonical ladder uses it.
    const r = getCanonicalTransportCost(dest, "train", 1, {
      lat: 35.514745,
      lng: 139.539692,
    });
    if (local) {
      expect(r.cost.kind).toBe("bounded");
      expect(r.evidence.fareScope).toBe("local_bounded_estimate");
      expect(r.evidence.derivation).toBe("model_estimate");
      expect(r.evidence.sourceUrls).toEqual(LOCAL_BOUNDED_FARE_SOURCE_URLS);
      expect(r.source).toBe("local_bounded_rail");
    } else {
      // No local estimate → the corridor (if any) or unavailable governs.
      expect(["bounded", "unavailable"]).toContain(r.cost.kind);
    }
  });
});

describe("KAI-216 canonical transport cost — flight", () => {
  it("verified flight fare maps to bounded using the route fare only (access legs excluded)", () => {
    const dest = byId("ishigaki-city");
    const est = getFlightTransportEstimate(dest, TOKYO);
    expect(est?.details?.verifiedFare).not.toBeNull();
    const r = getCanonicalTransportCost(dest, "flight", 2, TOKYO);
    expect(r.cost.kind).toBe("bounded");
    expect(r.source).toBe("verified_flight_fare");
    if (r.cost.kind === "bounded") {
      const vf = est!.details!.verifiedFare!;
      expect(r.cost.min).toBe(vf[0] * 2 * 2);
      expect(r.cost.max).toBe(vf[1] * 2 * 2);
    }
  });

  it("unverified flight fare maps to unavailable (never ¥0)", () => {
    // FUK→ISG has fare:null + fareStatus unverified.
    const dest = byId("ishigaki-city");
    const est = getFlightTransportEstimate(dest, {
      lat: 33.5902,
      lng: 130.4017,
    });
    if (est?.details?.verifiedFareStatus === "unverified") {
      const r = getCanonicalTransportCost(dest, "flight", 2, {
        lat: 33.5902,
        lng: 130.4017,
      });
      expect(r.cost.kind).toBe("unavailable");
      expect(r.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
    }
  });
});

describe("KAI-216 canonical transport cost — ferry", () => {
  it("verified ferry fare maps to bounded per fare basis", () => {
    const dest = byId("tomogashima-islands");
    const est = getFerryTransportEstimate(dest, WAKAYAMA, SUMMER);
    expect(est?.details?.ferryFareBasis).toBe("round-trip");
    const r = getCanonicalTransportCost(dest, "ferry", 2, WAKAYAMA, SUMMER);
    expect(r.cost.kind).toBe("bounded");
    expect(r.source).toBe("verified_ferry_fare");
    if (r.cost.kind === "bounded") {
      // Round-trip basis: fare × party, NOT doubled.
      const vf = est!.details!.verifiedFare!;
      expect(r.cost.min).toBe(vf[0] * 2);
      expect(r.cost.max).toBe(vf[1] * 2);
    }
  });
});

describe("KAI-216 canonical transport cost — fail-closed", () => {
  it("corridor without a verified fare maps to unavailable (never heuristic)", () => {
    // tokyo→kyoto shinkansen corridor exists but has NO fare.
    const dest = byId("kyoto-city");
    const r = getCanonicalTransportCost(dest, "shinkansen", 1, TOKYO);
    expect(r.cost.kind).toBe("unavailable");
    if (r.cost.kind === "unavailable") {
      expect(r.cost.reason).toBe("source_missing");
    }
  });

  it("car/my_car without an explicit fare maps to unavailable (no toll fabrication)", () => {
    const dest = byId("hakone-town");
    const r = getCanonicalTransportCost(dest, "car", 2, TOKYO);
    expect(r.cost.kind).toBe("unavailable");
    // The canonical cost must NEVER contain a fabricated toll number.
    expect(r.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
    const r2 = getCanonicalTransportCost(dest, "my_car", 2, TOKYO);
    expect(r2.cost.kind).toBe("unavailable");
  });

  it("unknown never becomes zero — unavailable is never [0,0]", () => {
    const dest = {
      id: "no-fare",
      name: "No Fare",
      prefecture: "Hokkaido",
      coordinates: { lat: 43.0618, lng: 141.3545 },
      transportOptions: { train: 300 },
    } as unknown as Destination;
    const r = getCanonicalTransportCost(dest, "train", 2, TOKYO);
    expect(r.cost.kind).toBe("unavailable");
    expect(r.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
    // Malformed party size also fails closed.
    const bad = getCanonicalTransportCost(dest, "train", Number.NaN, TOKYO);
    expect(bad.cost.kind).toBe("unavailable");
  });
});
