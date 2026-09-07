import { describe, expect, it } from "vitest";
import {
  createDefaultTripContext,
  mergeTripContext,
  tripContextFromRouteState,
  tripContextFromSearchParams,
  type TripContext,
} from "@/shared/context/TripContext";

describe("TripContext contract", () => {
  it("preserves explicit empty public modes and personal car identity", () => {
    const base = createDefaultTripContext();
    const next = mergeTripContext(base, {
      publicModes: [],
      carMode: "my_car",
      partySize: 0,
      budget: { kind: "cap", cap: 0 },
    });

    expect(next.publicModes).toEqual([]);
    expect(next.carMode).toBe("my_car");
    expect(next.partySize).toBe(0);
    expect(next.budget).toEqual({ kind: "cap", cap: 0 });
  });

  it("gives explicit route context precedence over defaults without dropping date semantics", () => {
    const route = tripContextFromRouteState({
      origin: {
        label: "Tokyo Station",
        coordinates: { lat: 35.68, lng: 139.76 },
      },
      travelDate: "2026-08-12",
      dateSemantics: "today",
      duration: "2d1n",
      partySize: 4,
      publicModes: ["train"],
      carMode: "none",
      budget: { kind: "cap", cap: 50000, tier: "standard" },
      destinationId: "ueno-zoo",
    });

    expect(route).toMatchObject({
      travelDate: "2026-08-12",
      dateSemantics: "today",
      duration: "2d1n",
      partySize: 4,
      publicModes: ["train"],
      destinationId: "ueno-zoo",
    });
  });

  it("serializes an explicit date instead of treating Today as Any date", () => {
    const params = new URLSearchParams(
      "date=2026-08-12&duration=halfDay&partySize=2&mode=train&mode=bus&car=none&budgetTier=standard&budget=75000",
    );
    const parsed = tripContextFromSearchParams(params);

    expect(parsed).toMatchObject({
      travelDate: "2026-08-12",
      dateSemantics: "custom",
      duration: "halfDay",
      partySize: 2,
      publicModes: ["train", "bus"],
      carMode: "none",
      budget: { kind: "cap", cap: 75000, tier: "standard" },
    });
  });

  it("does not replace an existing field when a route omits it", () => {
    const current: TripContext = {
      ...createDefaultTripContext(),
      travelDate: "2026-08-12",
      dateSemantics: "today",
      publicModes: [],
      carMode: "my_car",
    };
    const patch = tripContextFromSearchParams(
      new URLSearchParams("duration=halfDay"),
    );

    expect(mergeTripContext(current, patch)).toMatchObject({
      travelDate: "2026-08-12",
      dateSemantics: "today",
      publicModes: [],
      carMode: "my_car",
      duration: "halfDay",
    });
  });

  it("KAI-279: the default context budget is the canonical Standard party-total ceiling", () => {
    expect(createDefaultTripContext().budget).toEqual({
      kind: "cap",
      cap: 100000,
      tier: "standard",
    });
  });

  it("KAI-279: a tier-only URL maps to that tier's canonical flat cap, never a magic 75000", () => {
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=economy"))
        .budget,
    ).toEqual({ kind: "cap", cap: 50000, tier: "economy" });
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=standard"))
        .budget,
    ).toEqual({ kind: "cap", cap: 100000, tier: "standard" });
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=comfortable"))
        .budget,
    ).toEqual({ kind: "cap", cap: 200000, tier: "comfortable" });
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=flexible"))
        .budget,
    ).toEqual({ kind: "cap", cap: Infinity, tier: "luxury" });
  });

  it("KAI-279: a numeric URL budget is a custom party-total cap and round-trips exactly", () => {
    expect(
      tripContextFromSearchParams(new URLSearchParams("budget=80000")).budget,
    ).toEqual({ kind: "cap", cap: 80000 });
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetTier=standard&budget=80000"),
      ).budget,
    ).toEqual({ kind: "cap", cap: 80000, tier: "standard" });
  });
});
