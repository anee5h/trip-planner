import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESTINATION_EXPLORER_STATE,
  hasRestrictedTransportSelection,
  parseDestinationSearchParams,
  serializeDestinationSearchParams,
  serializePlannerSearchParams,
} from "../destinationSearchParams";
import { DEFAULT_PLANNER_BUDGET_TIER } from "@/features/home/hooks/useTripPlannerState";
import { BUDGET_TIER_LIMITS } from "@/shared/types/planner";

describe("destinationSearchParams", () => {
  it("round-trips Explorer filters, search, view, and page", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams(
        "q=beach&region=Okinawa&prefecture=Okinawa&collection=islands&city=fukuoka-city&area=momochi&indoor=70&season=summer&budget=45000&sort=travelTime&car=rental&mode=flight&mode=bus&party=3&walking=low&suitability=couple&interest=nature&view=map&page=3",
      ),
    );

    expect(parsed).toMatchObject({
      searchQuery: "beach",
      selectedRegions: ["Okinawa"],
      selectedPrefectures: ["Okinawa"],
      selectedCollections: ["islands"],
      selectedCities: ["fukuoka-city"],
      selectedAreas: ["momochi"],
      indoorMin: 70,
      season: "summer",
      maxBudget: 45000,
      sortBy: "travelTime",
      carMode: "rental",
      publicModes: ["flight", "bus"],
      partySize: 3,
      partyProfile: "group",
      budgetTier: "standard",
      vibe: "any",
      tripDuration: "any",
      walkingIntensity: "low",
      suitabilities: ["couple"],
      interests: ["nature"],
      viewMode: "map",
      currentPage: 3,
    });

    expect(serializeDestinationSearchParams(parsed).toString()).toContain(
      "q=beach",
    );
    expect(serializeDestinationSearchParams(parsed).getAll("mode")).toEqual([
      "flight",
      "bus",
    ]);
    expect(serializeDestinationSearchParams(parsed).get("city")).toBe(
      "fukuoka-city",
    );
  });

  it("falls back safely for malformed numeric values", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("budget=invalid&party=0&page=0&view=invalid"),
    );

    expect(parsed.maxBudget).toBe(40000);
    expect(parsed.partySize).toBe(2);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.viewMode).toBe("grid");
  });

  it("keeps the default transport selection non-restrictive", () => {
    expect(
      hasRestrictedTransportSelection(
        DEFAULT_DESTINATION_EXPLORER_STATE.carMode,
        DEFAULT_DESTINATION_EXPLORER_STATE.publicModes,
      ),
    ).toBe(false);
    expect(hasRestrictedTransportSelection("none", ["train"])).toBe(true);
  });

  it("persists preferred weather and derives profile from numeric party size", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("partySize=5&party=couple&weather=rainy"),
    );

    expect(parsed.partySize).toBe(5);
    expect(serializeDestinationSearchParams(parsed).get("party")).toBe("group");
    expect(serializeDestinationSearchParams(parsed).get("weather")).toBe(
      "rainy",
    );
  });

  // -------------------------------------------------------------------------
  // PLN-002: Full round-trip serialization for all planner-originated fields
  // -------------------------------------------------------------------------

  it("PLN-002: survives full round-trip serialization for all planner fields", () => {
    const plannerParams = serializePlannerSearchParams({
      vibe: "history",
      partyProfile: "couple",
      partySize: 2,
      weather: "rainy",
      budgetTier: "comfortable",
      tripDuration: "fullDay" as const,
      budget: BUDGET_TIER_LIMITS.comfortable,
      carMode: "rental",
      publicModes: ["train", "shinkansen"],
    });

    const parsed = parseDestinationSearchParams(
      new URLSearchParams(plannerParams),
    );

    expect(parsed.vibe).toBe("history");
    expect(parsed.partySize).toBe(2);
    expect(parsed.weather).toBe("rainy");
    expect(parsed.budgetTier).toBe("comfortable");
    expect(parsed.carMode).toBe("rental");
    expect(parsed.publicModes).toContain("train");
    expect(parsed.publicModes).toContain("shinkansen");
    expect(parsed.walkingIntensity).toBe("all");
  });

  it("PLN-002: re-serialization of parsed planner params is stable (idempotent round-trip)", () => {
    const original = serializePlannerSearchParams({
      vibe: "food",
      partyProfile: "group",
      partySize: 4,
      weather: "hot",
      budgetTier: "luxury",
      tripDuration: "weekend" as const,
      budget: BUDGET_TIER_LIMITS.luxury,
      carMode: "none",
      publicModes: ["train", "shinkansen", "bus", "flight"],
    });

    const firstParse = parseDestinationSearchParams(
      new URLSearchParams(original),
    );
    const reSerialized = serializeDestinationSearchParams(firstParse);
    const secondParse = parseDestinationSearchParams(reSerialized);

    expect(secondParse.vibe).toBe(firstParse.vibe);
    expect(secondParse.budgetTier).toBe(firstParse.budgetTier);
    expect(secondParse.partySize).toBe(firstParse.partySize);
    expect(secondParse.carMode).toBe(firstParse.carMode);
    expect(secondParse.walkingIntensity).toBe(firstParse.walkingIntensity);
  });

  // -------------------------------------------------------------------------
  // PLN-004: Reset consistency — Home and Explorer use the same defaults
  // -------------------------------------------------------------------------

  it("PLN-004: DEFAULT_PLANNER_BUDGET_TIER matches DEFAULT_DESTINATION_EXPLORER_STATE.budgetTier", () => {
    // Both Home and Explorer must reset to the same budget tier so a user
    // navigating from one to the other sees consistent defaults.
    expect(DEFAULT_PLANNER_BUDGET_TIER).toBe(
      DEFAULT_DESTINATION_EXPLORER_STATE.budgetTier,
    );
  });

  it("PLN-004: default budgetTier maps to the correct BUDGET_TIER_LIMITS numeric value", () => {
    const expectedBudget =
      BUDGET_TIER_LIMITS[DEFAULT_DESTINATION_EXPLORER_STATE.budgetTier];
    // The default maxBudget in the Explorer must equal the BUDGET_TIER_LIMITS value for the default tier.
    expect(expectedBudget).toBe(DEFAULT_DESTINATION_EXPLORER_STATE.maxBudget);
  });
});
