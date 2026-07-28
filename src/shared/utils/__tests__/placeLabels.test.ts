import { describe, expect, it } from "vitest";
import { formatPlaceName, formatPrefecture } from "../placeLabels";

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
  });

  it("formats prefectures in Japanese", () => {
    expect(formatPrefecture("Kanagawa", "ja")).toBe("神奈川県");
    expect(formatPrefecture("Tokyo", "ja")).toBe("東京都");
    expect(formatPrefecture("Osaka", "ja")).toBe("大阪府");
  });
});
