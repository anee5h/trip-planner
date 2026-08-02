import { describe, expect, it } from "vitest";
import { formatOriginLocation } from "../formatOriginLocation";

describe("formatOriginLocation", () => {
  it("selects one locale from the stored station display", () => {
    const origin = "Nakayama Station (中山駅), Kanagawa";

    expect(formatOriginLocation(origin, "en")).toEqual({
      stationName: "Nakayama Station",
      prefectureName: "Kanagawa",
    });
    expect(formatOriginLocation(origin, "ja")).toEqual({
      stationName: "中山駅",
      prefectureName: "神奈川県",
    });
  });

  it("localizes the existing Tokyo default", () => {
    expect(formatOriginLocation("Tokyo Station", "en")).toEqual({
      stationName: "Tokyo Station",
      prefectureName: "Tokyo",
    });
    expect(formatOriginLocation("Tokyo Station", "ja")).toEqual({
      stationName: "東京駅",
      prefectureName: "東京都",
    });
  });

  it.each(["100-0001", "Legacy Station", "Station (West Exit), Unknown"])(
    "keeps an unknown value intact without inventing punctuation: %s",
    (origin) => {
      expect(formatOriginLocation(origin, "ja")).toEqual({
        stationName: origin,
        prefectureName: undefined,
      });
    },
  );
});
