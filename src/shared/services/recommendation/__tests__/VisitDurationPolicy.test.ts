import { describe, it, expect } from "vitest";
import {
  getEffectiveVisitDuration,
  resolvePlanningCategory,
} from "../VisitDurationPolicy";
import type { Destination } from "@/shared/types/destination";

describe("VisitDurationPolicy", () => {
  it("resolves categories correctly", () => {
    const themePark = {
      id: "tp",
      kind: "theme_park",
      categories: [],
    } as unknown as Destination;
    expect(resolvePlanningCategory(themePark)).toBe("theme_park");

    const obsDeck = {
      id: "sky",
      kind: "attraction",
      categories: ["Observation Deck"],
    } as unknown as Destination;
    expect(resolvePlanningCategory(obsDeck)).toBe("observation_deck");

    const entComplex = {
      id: "ent",
      kind: "entertainment_complex",
      categories: [],
    } as unknown as Destination;
    expect(resolvePlanningCategory(entComplex)).toBe("entertainment_complex");
  });

  it("uses valid curated hours when within hard limits", () => {
    const validDest = {
      id: "shrine",
      kind: "shrine",
      categories: ["Shrine"],
      recommendedVisitHours: { min: 0.5, max: 1.5 },
    } as unknown as Destination;

    const dur = getEffectiveVisitDuration(validDest);
    expect(dur.source).toBe("curated");
    expect(dur.minMins).toBe(30);
    expect(dur.maxMins).toBe(90);
  });

  it("falls back to type fallback when curated hours exceed hard limits (outliers)", () => {
    const outlierDest = {
      id: "sky-outlier",
      kind: "attraction",
      categories: ["Observation Deck"],
      recommendedVisitHours: { min: 8.0, max: 16.0 }, // 8-16 hours for an observatory is an outlier
    } as unknown as Destination;

    const dur = getEffectiveVisitDuration(outlierDest);
    expect(dur.source).toBe("type_fallback");
    expect(dur.minMins).toBe(60);
    expect(dur.maxMins).toBe(180);
  });
});
