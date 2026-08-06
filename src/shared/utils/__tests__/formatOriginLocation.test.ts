import { describe, expect, it } from "vitest";
import {
  formatOriginLocation,
  getLocalizedStationLabel,
  getLocalizedStationNameOnly,
} from "../formatOriginLocation";

describe("formatOriginLocation & helpers", () => {
  it("selects one locale from the stored station display", () => {
    const origin = "Nakayama Station (中山駅), Kanagawa";

    expect(formatOriginLocation(origin, "en")).toEqual({
      stationName: "Nakayama Station",
      prefectureName: "Kanagawa",
    });
    expect(formatOriginLocation(origin, "ja")).toEqual({
      stationName: "中山駅",
      prefectureName: "神奈川", // No trailing "県" now based on logic
    });
  });

  it("Hakata Station checks (Req 1, 2, 3, 4)", () => {
    const origin = "Hakata Station (博多駅), Fukuoka";

    // English
    const enLabel = getLocalizedStationLabel(origin, "en");
    expect(enLabel).toEqual("Hakata Station, Fukuoka");
    expect(enLabel).not.toContain("博多駅");

    // Japanese
    const jaLabel = getLocalizedStationLabel(origin, "ja");
    expect(jaLabel).toEqual("福岡・博多駅");
    expect(jaLabel).not.toContain("Hakata Station");
  });

  it("Osaka and Tokyo follow the same rules (Req 5)", () => {
    const osaka = "Osaka Station, Osaka";
    expect(getLocalizedStationLabel(osaka, "en")).toEqual(
      "Osaka Station, Osaka",
    );
    expect(getLocalizedStationLabel(osaka, "ja")).toEqual("大阪・大阪駅");

    const tokyo = "Tokyo Station";
    expect(getLocalizedStationLabel(tokyo, "en")).toEqual(
      "Tokyo Station, Tokyo",
    );
    expect(getLocalizedStationLabel(tokyo, "ja")).toEqual("東京・東京駅");
  });

  it("Missing Japanese localization uses the translated generic origin label (Req 6)", () => {
    const origin = "Random Unknown Station, Unknown";

    // English
    expect(getLocalizedStationLabel(origin, "en")).toEqual(
      "Random Unknown Station, Unknown",
    );

    // Japanese
    const jaLabel = getLocalizedStationLabel(origin, "ja");
    expect(jaLabel).not.toContain("Random");
    expect(jaLabel).not.toContain("Unknown");
    expect(jaLabel).toContain("現在地"); // Fallback
  });

  it("getLocalizedStationNameOnly correctly extracts name only", () => {
    const raw = "Hakata Station (博多駅)";
    expect(getLocalizedStationNameOnly(raw, "en")).toEqual("Hakata Station");
    expect(getLocalizedStationNameOnly(raw, "ja")).toEqual("博多駅");

    const knownRaw = "Sapporo Station";
    expect(getLocalizedStationNameOnly(knownRaw, "en")).toEqual(
      "Sapporo Station",
    );
    expect(getLocalizedStationNameOnly(knownRaw, "ja")).toEqual("札幌駅");
  });

  it("keeps an unknown value intact in english", () => {
    const origin = "100-0001";
    expect(formatOriginLocation(origin, "en")).toEqual({
      stationName: "100-0001",
      prefectureName: undefined,
    });
  });
});
