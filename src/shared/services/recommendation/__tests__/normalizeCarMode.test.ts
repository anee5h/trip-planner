import { describe, it, expect } from "vitest";
import { normalizeCarMode } from "@/shared/utils/carMode";
import { getValidModes } from "../RecommendationScorer";
import type { Destination } from "@/shared/types/destination";

describe("normalizeCarMode", () => {
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

  it("undefined returns 'none'", () => {
    expect(normalizeCarMode(undefined)).toBe("none");
  });

  it("unknown string returns 'none'", () => {
    expect(normalizeCarMode("helicopter")).toBe("none");
  });
});

describe('saved "own" carMode reaches getValidModes as my_car', () => {
  it("normalized my_car still requires canonical car access evidence", () => {
    const dest = {
      id: "test-dest",
      name: "Test",
      prefecture: "Tokyo",
      coordinates: { lat: 35.68, lng: 139.76 },
      transportOptions: { car: 0, train: 0 },
      role: "poi",
    } as unknown as Destination;

    const carMode = normalizeCarMode("own");
    expect(carMode).toBe("my_car");

    const modes = getValidModes(
      dest,
      carMode,
      ["train", "shinkansen", "bus"],
      { lat: 35.68, lng: 139.76 },
      undefined,
      "mainland-honshu",
    );

    expect(modes).not.toContain("my_car");
  });
});
