import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESTINATION_EXPLORER_STATE,
  hasRestrictedTransportSelection,
  parseDestinationSearchParams,
  serializeDestinationSearchParams,
} from "../destinationSearchParams";

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
});
