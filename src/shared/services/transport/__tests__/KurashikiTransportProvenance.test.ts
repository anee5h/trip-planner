import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinations from "@/shared/data/destinations-index.json";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";

// ── Kurashiki transport provenance ────────────────────────────────────────────
//
// kurashiki-city.transportOptions.shinkansen = 200 has two roles:
//   1. Mode authorization: getValidModes treats a present transportOptions
//      key as "this mode reaches this destination". Without it, shinkansen
//      was never evaluated for Kurashiki and origin-aware cards showed "N/A"
//      (the route registry has a tokyo→okayama shinkansen corridor but no
//      tokyo→okayama train corridor).
//   2. Neutral-browsing reference display (no origin set).
// It is NOT a generic arbitrary-origin 200-minute fallback: origin-aware
// durations always come from ground-routes.json, and an origin without a
// verified corridor gets no estimate at all.
//
// Official JR West source confirming Shin-Kurashiki Station is served by the
// Sanyo Shinkansen (Tokaido/Sanyo/Kyushu Shinkansen timetable direction):
//   https://www.jr-odekake.net/eki/top?id=0650614  (新倉敷駅, JRおでかけネット)

const kurashiki = destinations.find(
  (candidate) => candidate.id === "kurashiki-city",
) as Destination;

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const AOMORI_STATION = { lat: 40.7033, lng: 140.6939 };

describe("Kurashiki transport provenance", () => {
  it("authorizes shinkansen for Kurashiki with default public modes", () => {
    const modes = getValidModes(
      kurashiki,
      "none",
      ["train", "shinkansen", "bus", "flight"],
      TOKYO,
    );
    expect(modes).toContain("shinkansen");
  });

  it("Tokyo → Kurashiki uses the verified ground-route range, not the 200 value", () => {
    const estimate = getOriginAwareTransportEstimate(
      kurashiki,
      { homeStationCoords: TOKYO },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    // tokyo→okayama shinkansen corridor in ground-routes.json: [210, 300].
    expect(estimate!.timeRange).toEqual([210, 300]);
    expect(estimate!.source).toBe("verified_ground_route");
    // The static 200 never enters the origin-aware estimate.
    expect(estimate!.timeRange).not.toContain(200);
  });

  it("an unrelated origin without a verified corridor gets no fabricated 200-minute route", () => {
    const estimate = getOriginAwareTransportEstimate(
      kurashiki,
      { homeStationCoords: AOMORI_STATION },
      ["shinkansen", "train"],
    );
    // No aomori→okayama corridor exists in the registry: the answer must be
    // "unknown", never a fallback derived from transportOptions.shinkansen.
    expect(estimate).toBeNull();
  });
});
