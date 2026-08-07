import { describe, it, expect } from "vitest";
import { getValidModes } from "../RecommendationScorer";
import type { Destination } from "@/shared/types/destination";

/** Normalize legacy "own" to canonical "my_car". */
function normalizeCarMode(raw: string | undefined): string {
  if (raw === "own") return "my_car";
  return raw || "none";
}

describe("carMode normalization", () => {
  it('"own" normalizes to "my_car"', () => {
    expect(normalizeCarMode("own")).toBe("my_car");
  });

  it('"my_car" stays "my_car"', () => {
    expect(normalizeCarMode("my_car")).toBe("my_car");
  });

  it('"rental" stays "rental"', () => {
    expect(normalizeCarMode("rental")).toBe("rental");
  });

  it('"none" stays "none"', () => {
    expect(normalizeCarMode("none")).toBe("none");
  });

  it('undefined returns "none"', () => {
    expect(normalizeCarMode(undefined)).toBe("none");
  });
});

describe('saved "own" carMode reaches getValidModes as my_car', () => {
  it("normalized my_car from legacy own is authorized for same-zone mainland destination", () => {
    // Simulate a destination on mainland-honshu that supports car
    const dest = {
      id: "test-dest",
      name: "Test",
      prefecture: "Tokyo",
      coordinates: { lat: 35.68, lng: 139.76 },
      transportOptions: { car: 0, train: 0 },
      role: "poi",
    } as unknown as Destination;

    // Legacy "own" saved in metadata
    const rawCarMode = "own";
    const carMode = normalizeCarMode(rawCarMode);

    expect(carMode).toBe("my_car");

    const modes = getValidModes(
      dest,
      carMode, // "my_car"
      ["train", "shinkansen", "bus"],
      { lat: 35.68, lng: 139.76 },
      undefined,
      "mainland-honshu",
    );

    expect(modes).toContain("my_car");
  });
});
