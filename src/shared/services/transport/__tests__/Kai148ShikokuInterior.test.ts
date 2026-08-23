import destinations from "@/shared/data/destinations-index.json";
import { describe, expect, it } from "vitest";

const KAI148_IDS = [
  "iya-no-kazurabashi-tokushima",
  "oboke-koboke-gorges-tokushima",
  "shimanto-river-yakatabune-nattoku",
  "nakatsu-gorge-kochi",
  "shikoku-karst-kochi",
] as const;

describe("KAI-148 Shikoku interior records", () => {
  it("keeps the wave focused on Iya, Oboke–Koboke, Shimanto, and aligned supports", () => {
    const records = KAI148_IDS.map((id) => destinations.find((destination) => destination.id === id));
    expect(records.every(Boolean)).toBe(true);
    expect(records.map((record) => record?.region)).toEqual(["Shikoku", "Shikoku", "Shikoku", "Shikoku", "Shikoku"]);
    expect(destinations.some((destination) => [
      "kotohira-gu-kagawa",
      "uchiko-za-ehime",
      "besshi-copper-mine-memorial-museum",
    ].includes(destination.id))).toBe(false);
  });

  it("does not fabricate origin-aware durations for remote interior destinations", () => {
    for (const id of KAI148_IDS) {
      const record = destinations.find((destination) => destination.id === id);
      expect(record?.transportOptions).toEqual({});
      expect(record?.localAccessUnestimated).toBe(true);
      expect(record?.transportMetadata?.method).toBe("unestimated");
    }
  });
});
