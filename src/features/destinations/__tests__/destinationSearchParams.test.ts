import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESTINATION_EXPLORER_STATE,
  hasRestrictedTransportSelection,
  parseDestinationSearchParams,
  serializeDestinationSearchParams,
  serializePlannerSearchParams,
} from "../destinationSearchParams";
import { BUDGET_TIER_LIMITS } from "@/shared/types/planner";
import destinations from "@/shared/data/destinations-index.json";

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
      budgetTier: "any",
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

  it("keeps Any transport distinct from public transport", () => {
    const any = parseDestinationSearchParams(new URLSearchParams("mode=none"));
    const publicOnly = parseDestinationSearchParams(
      new URLSearchParams("mode=train&mode=shinkansen&mode=bus&mode=flight"),
    );

    expect(any.publicModes).toEqual([]);
    expect(publicOnly.publicModes).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // KAI-63 D1: transport URL state must only contain renderable modes
  // -------------------------------------------------------------------------

  it("D1: rejects ferry mode (no Explore chip) so no hidden restriction exists", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("mode=ferry"),
    );

    expect(parsed.carMode).toBe("none");
    expect(parsed.publicModes).toEqual([]);
    expect(
      hasRestrictedTransportSelection(parsed.carMode, parsed.publicModes),
    ).toBe(false);
  });

  it("D1: rejects legacy chip labels and junk mode values", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("mode=local&mode=express&mode=whatever"),
    );

    expect(parsed.publicModes).toEqual([]);
    expect(
      hasRestrictedTransportSelection(parsed.carMode, parsed.publicModes),
    ).toBe(false);
  });

  it("D1: keeps valid modes and drops ferry from a mixed public-transport URL", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams(
        "mode=train&mode=shinkansen&mode=bus&mode=flight&mode=ferry",
      ),
    );

    expect(parsed.publicModes).toEqual([
      "train",
      "shinkansen",
      "bus",
      "flight",
    ]);
  });

  it("D1: normalizes junk car values to none", () => {
    expect(
      parseDestinationSearchParams(new URLSearchParams("car=whatever")).carMode,
    ).toBe("none");
    expect(
      parseDestinationSearchParams(new URLSearchParams("car=my_car")).carMode,
    ).toBe("my_car");
    expect(
      parseDestinationSearchParams(new URLSearchParams("car=rental")).carMode,
    ).toBe("rental");
  });

  it("D1: serialize never emits non-renderable transport values", () => {
    const serialized = serializeDestinationSearchParams({
      ...DEFAULT_DESTINATION_EXPLORER_STATE,
      carMode: "junk",
      publicModes: ["train", "ferry", "local"],
    });

    expect(serialized.get("car")).toBe("none");
    expect(serialized.getAll("mode")).toEqual(["train"]);
    expect(serialized.has("mode")).toBe(true);
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

  it.each(["my_car", "rental"] as const)(
    "preserves %s as a car-only planner search",
    (carMode) => {
      const params = serializePlannerSearchParams({
        vibe: "any",
        partySize: 2,
        budgetTier: "standard",
        tripDuration: "fullDay",
        budget: BUDGET_TIER_LIMITS.standard,
        carMode,
        publicModes: [],
      });

      expect(new URLSearchParams(params).get("mode")).toBe("none");
      expect(
        parseDestinationSearchParams(new URLSearchParams(params)),
      ).toMatchObject({
        carMode,
        publicModes: [],
      });
    },
  );

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

  it("PLN-004: Explorer filter default is 'any' (no restriction); planner scoring tier stays 'standard'", () => {
    // Fourth-pass contract: the Explore budget FILTER default is 'any' — a
    // real tier must not double as the unselected state. The planner's
    // budgetTier (scoring tier for meal ranges) keeps its standard default.
    expect(DEFAULT_DESTINATION_EXPLORER_STATE.budgetTier).toBe("any");
    expect(DEFAULT_PLANNER_BUDGET_TIER).toBe("standard");
  });

  it("omits weather parameter when manualWeatherPreference is undefined", () => {
    const serialized = serializePlannerSearchParams({
      vibe: "nature",
      partySize: 2,
      budgetTier: "standard",
      tripDuration: "fullDay",
      budget: 40000,
      carMode: "none",
      publicModes: ["train"],
    });

    const params = new URLSearchParams(serialized);
    expect(params.has("weather")).toBe(false);
    expect(params.get("vibe")).toBe("nature");
    expect(params.get("partySize")).toBe("2");
    expect(params.get("budgetTier")).toBe("standard");
  });

  it("KAI-91: default maxBudget matches BUDGET_TIER_LIMITS.standard", () => {
    expect(DEFAULT_DESTINATION_EXPLORER_STATE.maxBudget).toBe(
      BUDGET_TIER_LIMITS.standard,
    );
  });

  it("KAI-91: retains Standard tier for numeric-only legacy budget parameters without budgetTier", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("budget=45000"),
    );
    expect(parsed.budgetTier).toBe("standard");
    expect(parsed.maxBudget).toBe(45000);

    const parsedSmall = parseDestinationSearchParams(
      new URLSearchParams("budget=10000"),
    );
    expect(parsedSmall.budgetTier).toBe("standard");
    expect(parsedSmall.maxBudget).toBe(10000);
  });

  it("KAI-91: defaults to Any when no budget parameter is present", () => {
    const parsed = parseDestinationSearchParams(new URLSearchParams(""));
    expect(parsed.budgetTier).toBe("any");
    expect(parsed.maxBudget).toBe(BUDGET_TIER_LIMITS.standard);
  });

  it("round-trips sort=nearest", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("sort=nearest"),
    );

    expect(parsed.sortBy).toBe("nearest");
    expect(serializeDestinationSearchParams(parsed).get("sort")).toBe(
      "nearest",
    );
  });

  it("filters destination count when budgetTier is set to economy", () => {
    const economyDestinations = destinations.filter(
      (dest) => (dest.budgetMax ?? dest.budgetMin ?? Infinity) < 10000,
    );
    expect(economyDestinations.length).toBeGreaterThan(0);
    expect(economyDestinations.length).toBeLessThan(destinations.length);
  });

  // -------------------------------------------------------------------------
  // Weekend tripMode & accommodation allowance (stay)
  // -------------------------------------------------------------------------

  it("defaults tripMode to any and accommodationAllowance to 15000", () => {
    const parsed = parseDestinationSearchParams(new URLSearchParams(""));
    expect(parsed.tripMode).toBe("any");
    expect(parsed.accommodationAllowance).toBe(15000);
  });

  it("any omits tripMode and stay params in serialization", () => {
    const state = { ...DEFAULT_DESTINATION_EXPLORER_STATE };
    const serialized = serializeDestinationSearchParams(state).toString();
    expect(serialized).not.toContain("tripMode=");
    expect(serialized).not.toContain("stay=");
  });

  it("round-trips weekend_2d1n with stay allowance via planner serialization", () => {
    const plannerParams = serializePlannerSearchParams({
      vibe: "food",
      partySize: 2,
      budgetTier: "standard",
      tripDuration: "fullDay",
      budget: 95000,
      carMode: "none",
      publicModes: ["train"],
      tripMode: "weekend_2d1n",
      accommodationAllowance: 20000,
    });

    const parsed = parseDestinationSearchParams(
      new URLSearchParams(plannerParams),
    );

    expect(parsed.tripMode).toBe("weekend_2d1n");
    expect(parsed.accommodationAllowance).toBe(20000);
  });

  it("parses stay from URL params with tripMode weekend_2d1n", () => {
    const params = new URLSearchParams("tripMode=weekend_2d1n&stay=8000");
    const parsed = parseDestinationSearchParams(params);
    expect(parsed.tripMode).toBe("weekend_2d1n");
    expect(parsed.accommodationAllowance).toBe(8000);
  });

  it("falls back to default stay when stay param is invalid", () => {
    const params = new URLSearchParams("stay=notanumber");
    const parsed = parseDestinationSearchParams(params);
    expect(parsed.accommodationAllowance).toBe(15000);
  });

  it("falls back to default stay when stay exceeds MAX", () => {
    const params = new URLSearchParams("stay=999999");
    const parsed = parseDestinationSearchParams(params);
    expect(parsed.accommodationAllowance).toBe(15000);
  });

  it("omits stay param when at default 15000 in explorer serialization", () => {
    const state = {
      ...DEFAULT_DESTINATION_EXPLORER_STATE,
      tripMode: "weekend_2d1n" as const,
      accommodationAllowance: 15000,
    };
    const serialized = serializeDestinationSearchParams(state).toString();
    expect(serialized).toContain("tripMode=weekend_2d1n");
    expect(serialized).not.toContain("stay=15000");
  });

  it("serializes stay when different from default 15000", () => {
    const state = {
      ...DEFAULT_DESTINATION_EXPLORER_STATE,
      tripMode: "weekend_2d1n" as const,
      accommodationAllowance: 8000,
    };
    const serialized = serializeDestinationSearchParams(state).toString();
    expect(serialized).toContain("stay=8000");
  });
});

describe("destination date parameter", () => {
  const future = "2030-06-15";
  const past = "2020-01-01";

  it("round-trips a selected date", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams(`date=${future}`),
    );
    expect(parsed.date).toBe(future);
    expect(serializeDestinationSearchParams(parsed).get("date")).toBe(future);
  });

  it("omitted date stays unset (any-date browsing)", () => {
    const parsed = parseDestinationSearchParams(new URLSearchParams(""));
    expect(parsed.date).toBe("");
    expect(serializeDestinationSearchParams(parsed).has("date")).toBe(false);
  });

  it("invalid dates are ignored safely", () => {
    for (const bad of ["nope", "2030-13-01", "2030-02-30", "2030-6-1"]) {
      const parsed = parseDestinationSearchParams(
        new URLSearchParams(`date=${bad}`),
      );
      expect(parsed.date).toBe("");
    }
  });

  it("past dates normalize safely to unset", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams(`date=${past}`),
    );
    expect(parsed.date).toBe("");
  });

  it("reload restores the date from the URL", () => {
    const url = `?tripMode=weekend_2d1n&date=${future}`;
    const parsed = parseDestinationSearchParams(new URLSearchParams(url));
    expect(parsed.date).toBe(future);
    expect(parsed.tripMode).toBe("weekend_2d1n");
    const serialized = serializeDestinationSearchParams(parsed).toString();
    expect(serialized).toContain(`date=${future}`);
    expect(serialized).toContain("tripMode=weekend_2d1n");
    // Day 2 is derived, never serialized.
    expect(serialized).not.toContain("06-16");
  });
});
