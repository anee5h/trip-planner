import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import destinationIndex from "@/shared/data/destinations-index.json";
import { localizeBestSeason } from "../bestSeasonLabels";

const EXPECTED_JA_BY_EN: Record<string, string> = {
  "All Year": "通年",
  "All Year (indoor)": "通年（屋内）",
  Spring: "春",
  Summer: "夏",
  Autumn: "秋",
  Winter: "冬",
  "Spring & Autumn": "春・秋",
  "Autumn & Winter": "秋・冬",
  "Spring & Winter": "春・冬",
  "Spring / Autumn": "春・秋",
  "Summer & Autumn": "夏・秋",
  "Autumn / Spring": "秋・春",
  "Winter Snow Season": "冬（雪の季節）",
  "Spring (azaleas) & Autumn (foliage)": "春（ツツジ）・秋（紅葉）",
  "Winter (fugu)": "冬（ふぐ）",
  "Spring & Summer": "春・夏",
  "Winter & Autumn": "冬・秋",
};

const canonicalRecords = destinationIndex as Array<{
  id: string;
  bestSeason?: string;
}>;
const generatedDirectory = path.resolve(
  process.cwd(),
  "public/data/destinations",
);

function readGeneratedDestination(id: string): { bestSeason?: string } {
  return JSON.parse(
    readFileSync(path.join(generatedDirectory, `${id}.json`), "utf8"),
  ) as { bestSeason?: string };
}

describe("Best Season Japanese localization", () => {
  it.each(Object.entries(EXPECTED_JA_BY_EN))(
    "localizes %s deterministically",
    (english, japanese) => {
      expect(localizeBestSeason(english, "ja")).toBe(japanese);
      expect(localizeBestSeason(english, "en")).toBe(english);
    },
  );

  it("keeps every canonical Best Season value available in JA", () => {
    const unavailable = canonicalRecords
      .filter((record) => record.bestSeason?.trim())
      .filter(
        (record) =>
          localizeBestSeason(record.bestSeason!, "ja") === "情報未登録",
      )
      .map((record) => ({
        id: record.id,
        bestSeason: record.bestSeason,
      }));

    expect(unavailable).toEqual([]);
  });

  it("keeps generated detail Best Season values aligned with canonical data", () => {
    const mismatches = canonicalRecords
      .filter((record) => record.bestSeason?.trim())
      .filter(
        (record) =>
          readGeneratedDestination(record.id).bestSeason !== record.bestSeason,
      )
      .map((record) => ({
        id: record.id,
        canonical: record.bestSeason,
        generated: readGeneratedDestination(record.id).bestSeason,
      }));

    expect(mismatches).toEqual([]);
  });

  it("does not treat a genuinely missing Best Season as a localized value", () => {
    expect(localizeBestSeason("", "ja")).toBe("");
  });

  it("audits the generated destination population", () => {
    const generatedIds = new Set(
      readdirSync(generatedDirectory)
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(/\.json$/, "")),
    );
    const canonicalIds = new Set(canonicalRecords.map((record) => record.id));

    expect(generatedIds).toEqual(canonicalIds);
  });
});
