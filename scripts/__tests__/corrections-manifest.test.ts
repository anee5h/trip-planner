import { describe, expect, it } from "vitest";
import manifest from "../catalog-corrections-manifest.json";

const REQUIRED_FIELDS = [
  "destinationId",
  "field",
  "oldValue",
  "newValue",
  "reason",
  "sourceUrl",
  "checkedAt",
  "confidence",
] as const;

describe("catalogue corrections manifest", () => {
  it("has a deterministic array of corrections with all required fields", () => {
    expect(Array.isArray(manifest.corrections)).toBe(true);
    for (const correction of manifest.corrections) {
      for (const field of REQUIRED_FIELDS) {
        expect(
          Object.prototype.hasOwnProperty.call(correction, field),
          `${correction.destinationId ?? "unknown"}.${field}`,
        ).toBe(true);
      }
      expect(correction.destinationId.length).toBeGreaterThan(0);
      expect(correction.field.length).toBeGreaterThan(0);
      expect(correction.reason.length).toBeGreaterThan(0);
      expect(correction.sourceUrl.startsWith("https://")).toBe(true);
      expect(correction.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("records the KAI-6 verified corrections", () => {
    const byId = new Map(
      manifest.corrections.map((c) => [`${c.destinationId}:${c.field}`, c]),
    );
    expect(byId.get("okayama-city:nameJa")?.newValue).toBe("岡山市");
    expect(byId.get("chofu-tokyo:name")?.newValue).toBe("Chofu City");
    expect(byId.get("machida-tokyo:name")?.newValue).toBe("Machida City");
    expect(byId.get("ome-tokyo:name")?.newValue).toBe("Ome City");
    expect(byId.get("fukui:name")?.newValue).toBe("Fukui City");
    expect(byId.get("kanazawa:name")?.newValue).toBe("Kanazawa City");
    expect(byId.get("takaoka:name")?.newValue).toBe("Takaoka City");
    expect(
      byId.get("bitchu-matsuyama-castle:imageMetadata")?.newValue,
    ).toMatchObject({
      source: "Wikimedia Commons",
      license: "CC BY-SA 3.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Bitchu_Matsuyama_Castle_1.JPG",
    });
  });
});
