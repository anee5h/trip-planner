import { describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

const catalog = destinations as unknown as Destination[];
const byId = (id: string) =>
  catalog.find((destination) => destination.id === id)!;

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const YOKOHAMA = { lat: 35.4437, lng: 139.638 };
const CHIBA = { lat: 35.6073, lng: 140.1063 };
const OSAKA = { lat: 34.7025, lng: 135.4959 };

describe("KAI-146 Northern Chiba origin-aware transport", () => {
  it("uses verified Tokyo/Yokohama corridors for Funabashi", () => {
    const tokyo = getOriginAwareTransportEstimate(
      byId("funabashi-city"),
      { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
      ["train"],
    );
    const yokohama = getOriginAwareTransportEstimate(
      byId("funabashi-city"),
      {
        homeStationCoords: YOKOHAMA,
        originMunicipalityId: "Kanagawa:yokohama",
      },
      ["train"],
    );

    expect(tokyo).toMatchObject({
      mode: "train",
      timeRange: [20, 35],
      source: "verified_ground_route",
      sourceUrl:
        "https://timetables.jreast.co.jp/en/2608/train/115/117031.html",
      checkedAt: "2026-08-22",
    });
    expect(yokohama).toMatchObject({
      mode: "train",
      timeRange: [50, 75],
      source: "verified_ground_route",
    });
  });

  it("covers Tokyo to Matsudo, Sakura, and Choshi without the old prefecture-wide shortcut", () => {
    const cases = [
      ["matsudo-city", [28, 45]],
      ["sakura-castle-chiba", [55, 75]],
      ["choshi-city", [120, 150]],
    ] as const;

    for (const [id, timeRange] of cases) {
      const estimate = getOriginAwareTransportEstimate(
        byId(id),
        { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
        ["train"],
      );
      expect(estimate).toMatchObject({
        mode: "train",
        timeRange,
        source: "verified_ground_route",
        checkedAt: "2026-08-22",
      });
      expect(estimate!.fare).toBeUndefined();
      expect(estimate!.sourceUrl).toContain("jreast.co.jp");
    }
  });

  it("supports a Chiba-origin Choshi corridor for the city outing", () => {
    const estimate = getOriginAwareTransportEstimate(
      byId("choshi-city"),
      { homeStationCoords: CHIBA, originMunicipalityId: "Chiba:chiba" },
      ["train"],
    );

    expect(estimate).toMatchObject({
      mode: "train",
      timeRange: [90, 130],
      source: "verified_ground_route",
      checkedAt: "2026-08-22",
    });
    expect(estimate!.fare).toBeUndefined();
  });

  it("makes a station-adjacent verified child selectable without static minutes", () => {
    const tojo = byId("tojo-tei-matsudo");
    const estimate = getOriginAwareTransportEstimate(
      tojo,
      { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
      ["train"],
    );

    expect(estimate).toMatchObject({
      mode: "train",
      timeRange: [28, 45],
      source: "verified_ground_route",
    });
    expect(
      getValidModes(
        tojo,
        "none",
        ["train"],
        TOKYO,
        undefined,
        "mainland-honshu",
      ),
    ).toContain("train");
  });

  it("does not fabricate an unregistered origin route or car duration", () => {
    expect(
      getOriginAwareTransportEstimate(
        byId("choshi-city"),
        { homeStationCoords: OSAKA, originMunicipalityId: "Osaka:osaka" },
        ["train"],
      ),
    ).toBeNull();
    expect(
      getOriginAwareTransportEstimate(
        byId("inubosaki-lighthouse-choshi"),
        { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
        ["car", "my_car"],
      ),
    ).toBeNull();
  });

  it("keeps final local-access restrictions from becoming a direct rail claim", () => {
    const park = byId("funabashi-andersen-park");
    const museum = byId("national-museum-japanese-history-sakura");

    expect(
      getValidModes(
        park,
        "none",
        ["train"],
        TOKYO,
        undefined,
        "mainland-honshu",
      ),
    ).not.toContain("train");
    expect(
      getValidModes(
        museum,
        "none",
        ["train"],
        TOKYO,
        undefined,
        "mainland-honshu",
      ),
    ).not.toContain("train");
  });
});

describe("KAI-146 hub-child visibility", () => {
  it("surfaces structural children and curated featured children for reviewed hubs", () => {
    DestinationRelationshipService.clearIndex();
    const expected = {
      "funabashi-city": ["funabashi-andersen-park"],
      "matsudo-city": ["tojo-tei-matsudo", "yagiri-no-watashi-matsudo"],
      "choshi-city": ["inubosaki-lighthouse-choshi", "byobugaura-choshi"],
    };

    for (const [hubId, childIds] of Object.entries(expected)) {
      const hub = byId(hubId);
      expect(
        DestinationRelationshipService.getChildDestinations(hubId).map(
          (child) => child.id,
        ),
      ).toEqual(childIds);
      expect(
        DestinationRelationshipService.getFeaturedChildDestinations(hub).map(
          (child) => child.id,
        ),
      ).toEqual(childIds);
    }
  });
});
