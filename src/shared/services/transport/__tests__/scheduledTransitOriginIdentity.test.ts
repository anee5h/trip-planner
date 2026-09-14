import { describe, expect, it } from "vitest";

import { getScheduledTransitOriginProductIdForExactStation } from "../scheduledTransitOriginIdentity";

describe("scheduled transit origin identity", () => {
  it("maps only the exact reviewed Shinjukunishiguchi station record", () => {
    expect(
      getScheduledTransitOriginProductIdForExactStation({
        prefecture: "Tokyo",
        stationName: "Shinjukunishiguchi Station (新宿西口駅)",
      }),
    ).toBe("toei-oedo-shinjuku-nishiguchi");
  });

  it("does not infer an identity from labels, coordinates, or nearby names", () => {
    expect(
      getScheduledTransitOriginProductIdForExactStation({
        prefecture: "Tokyo",
        stationName: "Shinjuku-nishiguchi",
      }),
    ).toBeUndefined();
    expect(
      getScheduledTransitOriginProductIdForExactStation({
        prefecture: "Tokyo",
        stationName: "Shinjukunishiguchi Station (新宿西口駅)",
      }),
    ).toBe("toei-oedo-shinjuku-nishiguchi");
    expect(
      getScheduledTransitOriginProductIdForExactStation({
        prefecture: "Kanagawa",
        stationName: "Shinjukunishiguchi Station (新宿西口駅)",
      }),
    ).toBeUndefined();
  });
});
