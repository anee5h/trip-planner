import { describe, expect, it } from "vitest";
import {
  createDefaultTripContext,
  mergeTripContext,
  normalizeTripBudget,
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
      budget: { kind: "custom", cap: 50000 },
    });

    expect(next.publicModes).toEqual([]);
    expect(next.carMode).toBe("my_car");
    expect(next.partySize).toBe(0);
    expect(next.budget).toEqual({ kind: "custom", cap: 50000 });
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
      budget: { kind: "custom", cap: 50000 },
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
    expect(route.budget).toEqual({ kind: "custom", cap: 50000 });
  });

  it("serializes an explicit date instead of treating Today as Any date", () => {
    const params = new URLSearchParams(
      "date=2026-08-12&duration=halfDay&partySize=2&mode=train&mode=bus&car=none&budgetKind=custom&budget=75000",
    );
    const parsed = tripContextFromSearchParams(params);

    expect(parsed).toMatchObject({
      travelDate: "2026-08-12",
      dateSemantics: "custom",
      duration: "halfDay",
      partySize: 2,
      publicModes: ["train", "bus"],
      carMode: "none",
      budget: { kind: "custom", cap: 75000 },
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

  it("KAI-279: the default context budget is the canonical Standard preset", () => {
    expect(createDefaultTripContext().budget).toEqual({
      kind: "preset",
      preset: "standard",
    });
  });

  it("KAI-279: a tier-only URL maps to that tier's canonical preset, never a magic 75000", () => {
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=economy"))
        .budget,
    ).toEqual({ kind: "preset", preset: "economy" });
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=standard"))
        .budget,
    ).toEqual({ kind: "preset", preset: "standard" });
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=comfortable"))
        .budget,
    ).toEqual({ kind: "preset", preset: "comfortable" });
    expect(
      tripContextFromSearchParams(new URLSearchParams("budgetTier=flexible"))
        .budget,
    ).toEqual({ kind: "none" });
  });

  it("KAI-279: a numeric URL budget is a custom party-total cap and round-trips exactly", () => {
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("budgetKind=custom&budget=80000"),
      ).budget,
    ).toEqual({ kind: "custom", cap: 80000 });
    expect(
      tripContextFromSearchParams(
        new URLSearchParams(
          "budgetTier=standard&budgetKind=custom&budget=80000",
        ),
      ).budget,
    ).toEqual({ kind: "custom", cap: 80000 });
  });

  it("KAI-279: normalizeTripBudget migrates legacy {kind:cap} shapes explicitly", () => {
    // Legacy preset ceiling (tier + matching cap) -> preset.
    expect(
      normalizeTripBudget({ kind: "cap", cap: 50000, tier: "economy" }),
    ).toEqual({ kind: "preset", preset: "economy" });
    // Legacy numeric custom (cap differs from tier ceiling) -> custom.
    expect(
      normalizeTripBudget({ kind: "cap", cap: 80000, tier: "standard" }),
    ).toEqual({ kind: "custom", cap: 80000 });
    // Legacy luxury/Infinity -> none.
    expect(
      normalizeTripBudget({ kind: "cap", cap: Infinity, tier: "luxury" }),
    ).toEqual({ kind: "none" });
    // Legacy { kind: "any" } -> none; bare number -> custom.
    expect(normalizeTripBudget({ kind: "any" })).toEqual({ kind: "none" });
    expect(normalizeTripBudget(80000)).toEqual({ kind: "custom", cap: 80000 });
  });

  it("KAI-279 review fix: a /destinations URL without budget params carries NO budget patch", () => {
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("date=2026-08-12&partySize=4"),
      ),
    ).not.toHaveProperty("budget");
    expect(
      tripContextFromSearchParams(new URLSearchParams("")),
    ).not.toHaveProperty("budget");
    // Even a params-only navigation (no budget state) must not erase context.
    expect(
      tripContextFromSearchParams(
        new URLSearchParams("sort=recommended&mode=train"),
      ),
    ).not.toHaveProperty("budget");
  });

  it("KAI-279 review fix: missing budget params never overwrite an active Custom budget on merge", () => {
    const current: TripContext = {
      ...createDefaultTripContext(),
      budget: { kind: "custom", cap: 80000 },
      partySize: 4,
    };
    // Plain /destinations?date=... (no budget params) -> the merge keeps the
    // active Custom ¥80,000 untouched.
    const patch = tripContextFromSearchParams(
      new URLSearchParams("date=2026-08-12&partySize=4"),
    );
    expect(patch).not.toHaveProperty("budget");
    expect(mergeTripContext(current, patch).budget).toEqual({
      kind: "custom",
      cap: 80000,
    });
    // An explicit budget=any DOES patch (user chose no constraint).
    const anyPatch = tripContextFromSearchParams(
      new URLSearchParams("budget=any"),
    );
    expect(anyPatch.budget).toEqual({ kind: "none" });
    expect(mergeTripContext(current, anyPatch).budget).toEqual({
      kind: "none",
    });
  });
});
