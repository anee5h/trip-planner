import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

const TOKYO = { lat: 35.6812, lng: 139.7671 };

function dest(overrides: Partial<Destination>): Destination {
  return {
    id: "x",
    name: "x",
    prefecture: "",
    region: "x",
    coordinates: { lat: 35.0, lng: 135.0 },
    transportOptions: {},
    ...overrides,
  } as Destination;
}

describe("KAI-66 verified corridor additions (review revisions)", () => {
  it("tokyo→fukuoka shinkansen resolves with the Nozomi duration", () => {
    const hakata = dest({
      id: "hakata-station",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:fukuoka",
      coordinates: { lat: 33.5898, lng: 130.4207 },
    });
    const estimate = getOriginAwareTransportEstimate(
      hakata,
      { homeStationCoords: TOKYO, originMunicipalityId: "Tokyo:chiyoda" },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mode).toBe("shinkansen");
    // Nozomi ~4h45–4h52. Fare deliberately unknown (no citable operator
    // source for the ¥23,810 ordinary-reserved amount was retrievable).
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(285);
    expect(estimate!.timeRange[1]).toBeLessThanOrEqual(295);
    expect(estimate!.fare).toBeUndefined();
  });

  it("hiroshima→okayama shinkansen is one defined product (Nozomi, fare unknown)", () => {
    const okayama = dest({
      id: "okayama-city",
      prefecture: "Okayama",
      municipalityId: "Okayama:okayama",
      coordinates: { lat: 34.6663, lng: 133.918 },
    });
    const estimate = getOriginAwareTransportEstimate(
      okayama,
      {
        homeStationCoords: { lat: 34.3983, lng: 132.4756 },
        originMunicipalityId: "Hiroshima:hiroshima",
      },
      ["shinkansen"],
    );
    expect(estimate).not.toBeNull();
    // Nozomi 35–41 min, one product. Fare deliberately unknown: no citable
    // operator source for the exact ¥6,660 standard reserved amount was
    // retrievable (the SmartEX ¥6,260 figure is a different product), so per
    // FARE_POLICY the fare stays unknown rather than weakly-sourced.
    expect(estimate!.timeRange).toEqual([35, 41]);
    expect(estimate!.fare).toBeUndefined();
  });

  it("cross-prefecture municipality pair resolves (Nagoya → Gifu City)", () => {
    const gifu = dest({
      id: "gifu-city",
      prefecture: "Gifu",
      municipalityId: "Gifu:gifu",
      coordinates: { lat: 35.4233, lng: 136.7606 },
    });
    const estimate = getOriginAwareTransportEstimate(
      gifu,
      {
        homeStationCoords: { lat: 35.1709, lng: 136.8815 },
        originMunicipalityId: "Aichi:nagoya",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange).toEqual([20, 30]);
  });

  it("municipality precision beats prefecture width (Nagoya → Takayama)", () => {
    // Regression (review): the prefecture-pair aichi→gifu [20,165] row was
    // removed; Nagoya→Takayama must resolve at its own Hida duration, not
    // the Gifu-city corridor.
    const takayama = dest({
      id: "takayama-city",
      prefecture: "Gifu",
      municipalityId: "Gifu:takayama",
      coordinates: { lat: 36.1463, lng: 137.2521 },
    });
    const estimate = getOriginAwareTransportEstimate(
      takayama,
      {
        homeStationCoords: { lat: 35.1709, lng: 136.8815 },
        originMunicipalityId: "Aichi:nagoya",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(140);
    expect(estimate!.timeRange[1]).toBeLessThanOrEqual(165);
  });

  it("gifu destinations without a municipality row stay unknown (no prefecture fallback claim)", () => {
    const gero = dest({
      id: "gero-city",
      prefecture: "Gifu",
      municipalityId: "Gifu:gero",
      coordinates: { lat: 35.8056, lng: 137.2444 },
    });
    const estimate = getOriginAwareTransportEstimate(
      gero,
      {
        homeStationCoords: { lat: 35.1709, lng: 136.8815 },
        originMunicipalityId: "Aichi:nagoya",
      },
      ["train"],
    );
    expect(estimate).toBeNull();
  });

  it("hiroshima→iwakuni conventional rail resolves at the verified duration", () => {
    const iwakuni = dest({
      id: "iwakuni-city",
      prefecture: "Yamaguchi",
      municipalityId: "Yamaguchi:iwakuni",
      coordinates: { lat: 34.1667, lng: 132.2167 },
    });
    const estimate = getOriginAwareTransportEstimate(
      iwakuni,
      {
        homeStationCoords: { lat: 34.3983, lng: 132.4756 },
        originMunicipalityId: "Hiroshima:hiroshima",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(45);
    expect(estimate!.timeRange[1]).toBeLessThanOrEqual(70);
  });

  it("kyoto→nara conventional rail resolves (municipality pair)", () => {
    const nara = dest({
      id: "nara-city",
      prefecture: "Nara",
      municipalityId: "Nara:nara",
      coordinates: { lat: 34.6851, lng: 135.805 },
    });
    const estimate = getOriginAwareTransportEstimate(
      nara,
      {
        homeStationCoords: { lat: 34.9858, lng: 135.7588 },
        originMunicipalityId: "Kyoto:kyoto",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(34);
    expect(estimate!.timeRange[1]).toBeLessThanOrEqual(55);
  });

  it("okayama→takamatsu Marine Liner resolves (bridge rail, municipality pair)", () => {
    const takamatsu = dest({
      id: "takamatsu-city",
      prefecture: "Kagawa",
      municipalityId: "Kagawa:takamatsu",
      coordinates: { lat: 34.3503, lng: 134.0469 },
    });
    const estimate = getOriginAwareTransportEstimate(
      takamatsu,
      {
        homeStationCoords: { lat: 34.6663, lng: 133.918 },
        originMunicipalityId: "Okayama:okayama",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(52);
    expect(estimate!.timeRange[1]).toBeLessThanOrEqual(63);
  });

  it("fukuoka↔kitakyushu conventional rail resolves (same-prefecture municipality row)", () => {
    const kitakyushu = dest({
      id: "kitakyushu-city",
      prefecture: "Fukuoka",
      municipalityId: "Fukuoka:kitakyushu",
      coordinates: { lat: 33.8836, lng: 130.875 },
    });
    const estimate = getOriginAwareTransportEstimate(
      kitakyushu,
      {
        homeStationCoords: { lat: 33.5902, lng: 130.4017 },
        originMunicipalityId: "Fukuoka:fukuoka",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange).toEqual([50, 75]);
  });

  it("sendai↔matsushima conventional rail resolves (same-prefecture municipality row)", () => {
    const matsushima = dest({
      id: "matsushima-bay",
      prefecture: "Miyagi",
      municipalityId: "Miyagi:matsushima",
      coordinates: { lat: 38.3312, lng: 141.0958 },
    });
    const estimate = getOriginAwareTransportEstimate(
      matsushima,
      {
        homeStationCoords: { lat: 38.268, lng: 140.87 },
        originMunicipalityId: "Miyagi:sendai",
      },
      ["train"],
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.timeRange[0]).toBeGreaterThanOrEqual(25);
    expect(estimate!.timeRange[1]).toBeLessThanOrEqual(45);
  });

  // KAI-155 review regression: a newly verified destination with
  // localAccessUnestimated: true and NO static transportOptions must NOT
  // inherit a broad prefecture corridor. The guard (OriginAwareTransportService
  // lines ~544-550) returns null unless an exact municipality corridor exists.
  // Without this guard, the record would present a prefecture-pair time as an
  // attraction-level route — the exact anti-pattern batch 2 removed.
  it("unestimated local access without static transportOptions never inherits a prefecture corridor", () => {
    const kyotoDest = dest({
      id: "new-destination-kyoto",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.004, lng: 135.675 },
      localAccessModes: ["train", "bus"],
      localAccessUnestimated: true,
      transportOptions: {},
    });
    // Osaka → Kyoto has a prefecture-pair corridor, but this destination's
    // local access is unestimated with no static mode value and no exact
    // Kyoto:kyoto → Osaka:osaka municipality row. It must resolve null.
    const estimate = getOriginAwareTransportEstimate(
      kyotoDest,
      {
        homeStationCoords: { lat: 34.7025, lng: 135.4959 },
        originMunicipalityId: "Osaka:osaka",
      },
      ["train"],
    );
    expect(estimate).toBeNull();
  });

  it("a corrected batch-2 record (empty transportOptions) is not falsely recommendable via origin-aware train", () => {
    // Batch-2 correction: newly verified records carry transportOptions: {} and
    // localAccessUnestimated: true. The personalized recommendation gate
    // (RecommendationScorer lines ~201-227) sees transportOptions.train ===
    // undefined and consults getOriginAwareTransportEstimate, which returns
    // null for a destination with no exact municipality corridor — so train is
    // correctly unsupported. A static number would have bypassed this and made
    // the destination falsely routable via a broad prefecture corridor.
    const corrected = dest({
      id: "batch2-corrected-dest",
      prefecture: "Kyoto",
      municipalityId: "Kyoto:kyoto",
      coordinates: { lat: 35.004, lng: 135.675 },
      localAccessModes: ["train", "bus"],
      localAccessUnestimated: true,
      transportOptions: {},
    });
    const estimate = getOriginAwareTransportEstimate(
      corrected,
      {
        homeStationCoords: { lat: 34.7025, lng: 135.4959 },
        originMunicipalityId: "Osaka:osaka",
      },
      ["train"],
    );
    expect(estimate).toBeNull();
  });
});
