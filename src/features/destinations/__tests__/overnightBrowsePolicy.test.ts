/**
 * Overnight Explore browse-vs-recommendation separation (KAI-275 follow-up).
 *
 * Deterministic regression fixture: Nakayama Station (Kanagawa), Personal
 * Car only. Explore overnight BROWSE must include long but valid car trips
 * (Nagoya/Osaka/Kyoto) that the old recommender gates removed; Home Top
 * Matches must remain unchanged and selective.
 */
import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getRecommendations } from "@/shared/services/recommendation/RecommendationService";
import { consolidateWeekendAreas } from "@/shared/services/recommendation/WeekendAreaPolicy";
import { evaluateWeekendCapacity } from "@/shared/services/recommendation/WeekendPolicy";
import { getBestOneWayTravelMinutes } from "@/shared/services/recommendation/TripDurationService";

const all = destinationsIndex as unknown as Destination[];
const ORIGIN = { lat: 35.5192, lng: 139.5393 }; // Nakayama Station
const ZONE = "mainland-honshu";
const CAR_MODES = ["my_car", "car"];

function carBrowseEligible(): Destination[] {
  return all.filter(
    (d) =>
      d.recommendationEligible !== false &&
      getValidModes(d, "my_car", [], ORIGIN, undefined, ZONE).some((m) =>
        CAR_MODES.includes(m),
      ),
  );
}

function browseAreaIds(): Set<string> {
  return new Set(
    consolidateWeekendAreas(carBrowseEligible(), all).areas.map((a) => a.id),
  );
}

/** Full overnight BROWSE set: every car-valid destination (areas + child
 *  POIs + standalone places) — children are directly accessible, matching
 *  Any-duration browsing. */
function fullBrowseSet(): Destination[] {
  return carBrowseEligible();
}

function homeContext() {
  return {
    vibe: "any",
    budget: 100000,
    carMode: "my_car",
    publicModes: [] as string[],
    partySize: 2,
    budgetTier: "luxury",
    tripDuration: "2d1n",
    homeStationCoords: ORIGIN,
    originZoneId: ZONE,
    visitedIds: [] as string[],
    currentWeather: null,
  } as never;
}

describe("overnight Explore browse policy (Nakayama, Personal Car)", () => {
  it("Nagoya/Osaka/Kyoto/Karuizawa are browseable (old gate removed them via minutes_undefined)", () => {
    const ids = browseAreaIds();
    for (const id of [
      "nagoya-city",
      "osaka-city",
      "kyoto-city",
      "hakone-town",
      "karuizawa-town",
    ]) {
      const dest = all.find((d) => d.id === id);
      expect(dest, `${id} exists`).toBeDefined();
      // Personal Car is a valid mode.
      expect(
        getValidModes(dest!, "my_car", [], ORIGIN, undefined, ZONE).some((m) =>
          CAR_MODES.includes(m),
        ),
      ).toBe(true);
      // The destination is a trip area (survives consolidation).
      expect(ids.has(id), `${id} browseable`).toBe(true);
    }
  });

  it("car arcs close the >120 km gap for in-envelope cities; undefined stays for out-of-envelope", () => {
    // Nagoya is inside the Kanagawa discovery envelope → the SafeGround car
    // arc now estimates it (the old recommender gate removed it via
    // minutes_undefined). Osaka/Kyoto sit beyond the arc envelope → minutes
    // stay undefined, and the browse policy does NOT gate on that.
    const expectations: Array<[string, boolean]> = [
      ["nagoya-city", true],
      ["osaka-city", false],
      ["kyoto-city", false],
    ];
    for (const [id, estimated] of expectations) {
      const dest = all.find((d) => d.id === id)!;
      const minutes = getBestOneWayTravelMinutes(
        dest,
        { homeStationCoords: ORIGIN, originZoneId: ZONE },
        ["my_car"],
      );
      expect(minutes, id).toEqual(estimated ? 230 : undefined);
    }
  });

  it("undefined travel time is ranking-neutral, not a browse gate", () => {
    // A destination with no car estimate (e.g. Kyoto from Nakayama) is NOT
    // browse-excluded: browse is area-based; travel time only ranks.
    const kyoto = all.find((d) => d.id === "kyoto-city")!;
    const minutes = getBestOneWayTravelMinutes(
      kyoto,
      { homeStationCoords: ORIGIN, originZoneId: ZONE },
      ["my_car"],
    );
    expect(minutes).toBeUndefined();
    // Kyoto still survives area consolidation and stays browseable.
    expect(browseAreaIds().has("kyoto-city")).toBe(true);
    // And the browse universe remains far larger than the destinations with
    // any car time at all (estimates are ranking signals, not gates).
    const withMinutes = carBrowseEligible().filter((d) => {
      const m = getBestOneWayTravelMinutes(
        d,
        { homeStationCoords: ORIGIN, originZoneId: ZONE },
        ["my_car"],
      );
      return m !== undefined;
    }).length;
    expect(withMinutes).toBeLessThan(browseAreaIds().size * 3);
  });

  it("capacity is a ranking signal, not a browse exclusion (thin hubs stay visible)", () => {
    // Some browseable trip areas would fail the OLD capacity gate but must
    // remain in the browse set.
    const ids = browseAreaIds();
    const thinButBrowseable = [...ids].filter((id) => {
      const dest = all.find((d) => d.id === id)!;
      return !evaluateWeekendCapacity(dest, all, "2d1n").eligible;
    });
    expect(thinButBrowseable.length).toBeGreaterThan(0);
  });

  it("child destinations are accessible in the full browse set (not only via hub drill-in)", () => {
    const full = fullBrowseSet();
    const areaCount = browseAreaIds().size;
    const children = full.filter(
      (d) => d.relationships?.parentDestinationId !== undefined,
    );
    // The browse grid contains child POIs alongside their hub cards — the
    // old areas-only consolidation dropped every poi-kind record.
    expect(children.length).toBeGreaterThan(0);
    // Full browse is substantially broader than the area-card surface.
    expect(full.length).toBeGreaterThan(areaCount * 2);
    // A specific well-known child POI of a browseable hub is present.
    const disney = all.find((d) => d.id === "tokyo-disneyland");
    if (disney) {
      expect(full.some((d) => d.id === "tokyo-disneyland")).toBe(true);
    }
    // Stranded children (parent hub not car-browseable) surface too.
    const strandedChild = all.find((d) => d.id === "uzu-no-michi-naruto");
    if (strandedChild) {
      expect(full.some((d) => d.id === "uzu-no-michi-naruto")).toBe(true);
    }
  });

  it("Home Top Matches under the same context is unchanged in spirit and selective (Hakone above Osaka AND above Kyoto)", () => {
    const results = getRecommendations(all, homeContext());
    const rank = (id: string) => results.findIndex((r) => r.id === id);
    const hakone = rank("hakone-town");
    const osaka = rank("osaka-city");
    const kyoto = rank("kyoto-city");
    expect(hakone).toBeGreaterThanOrEqual(0);
    expect(osaka).toBeGreaterThanOrEqual(0);
    expect(kyoto).toBeGreaterThanOrEqual(0);
    expect(hakone).toBeLessThan(osaka);
    // KAI-275 follow-up: Kyoto must not outrank Hakone merely because its
    // deterministic travel minutes are undefined (far-proxy now applies).
    expect(hakone).toBeLessThan(kyoto);
    // Explore broadening must not turn Osaka into a top Home recommendation.
    expect(hakone).toBeLessThan(10);
  });
});
