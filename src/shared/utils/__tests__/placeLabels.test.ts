import { describe, expect, it } from "vitest";
import {
  formatPlaceName,
  formatPrefecture,
  localizePlaceLabel,
} from "../placeLabels";

describe("place labels", () => {
  it("uses official Japanese municipality suffixes without duplication", () => {
    expect(formatPlaceName({ name: "横浜", kind: "city" }, "ja")).toBe(
      "横浜市",
    );
    expect(formatPlaceName({ name: "千代田", kind: "ward" }, "ja")).toBe(
      "千代田区",
    );
    expect(formatPlaceName({ name: "箱根町", kind: "town" }, "ja")).toBe(
      "箱根町",
    );
    expect(formatPlaceName({ name: "Taito City", kind: "ward" }, "ja")).toBe(
      "台東区",
    );
  });

  it("formats prefectures in Japanese", () => {
    expect(formatPrefecture("Kanagawa", "ja")).toBe("神奈川県");
    expect(formatPrefecture("Tokyo", "ja")).toBe("東京都");
    expect(formatPrefecture("Osaka", "ja")).toBe("大阪府");
  });

  it("localizes location metadata and destination taxonomy labels", () => {
    expect(localizePlaceLabel("Taito City", "ja")).toBe("台東区");
    expect(localizePlaceLabel("Ueno Park", "ja")).toBe("上野恩賜公園");
    expect(localizePlaceLabel("Hakone Onsen", "ja")).toBe("箱根温泉");
    expect(localizePlaceLabel("UNESCO World Heritage Japan", "ja")).toBe(
      "日本のユネスコ世界遺産",
    );
    expect(localizePlaceLabel("Tokyo City", "ja")).toBe("東京都");
    expect(localizePlaceLabel("akita", "ja")).toBe("秋田");
    expect(localizePlaceLabel("sendai", "ja")).toBe("仙台");
    expect(localizePlaceLabel("tochigi", "ja")).toBe("栃木");
  });

  it("keeps canonical location metadata unchanged in English", () => {
    expect(localizePlaceLabel("Taito City", "en")).toBe("Taito City");
    expect(localizePlaceLabel("Ueno Park", "en")).toBe("Ueno Park");
  });
});
