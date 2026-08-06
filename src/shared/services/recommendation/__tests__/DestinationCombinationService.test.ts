import { describe, expect, it } from "vitest";
import { findNearbyCombinations } from "../DestinationCombinationService";
import { getEffectiveVisitDuration } from "../DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";

const mockDest1 = {
  id: "shibuya-sky",
  name: "Shibuya Sky",
  coordinates: { lat: 35.658, lng: 139.7016 },
  prefecture: "Tokyo",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  recommendedVisitHours: { min: 1.5, max: 2.5 },
  ratings: { rain: 8 },
} as unknown as Destination;

describe("DestinationCombinationService", () => {
  it("returns empty array if primary destination has no coordinates", () => {
    const invalidDest = { id: "no-coords" } as unknown as Destination;
    const combos = findNearbyCombinations(invalidDest);
    expect(combos).toEqual([]);
  });

  it("finds nearby combinations within distance threshold", () => {
    const combos = findNearbyCombinations(mockDest1, {}, 5);
    expect(Array.isArray(combos)).toBe(true);
    expect(combos.length).toBeGreaterThan(0);

    const first = combos[0];
    expect(first.primary.id).toBe(mockDest1.id);
    expect(first.secondary.id).not.toBe(mockDest1.id);
    expect(first.interDistanceKm).toBeLessThanOrEqual(20);
    expect(first.combinedVisitHours[0]).toBeGreaterThan(0);
    expect(first.combinedBudgetRange[0]).toBeGreaterThanOrEqual(0);
    expect(first.explanation.en).toBeTruthy();
    expect(first.explanation.ja).toBeTruthy();
  });

  it("calculates combined budget and duration metrics accurately", () => {
    const combos = findNearbyCombinations(mockDest1, {}, 1);
    if (combos.length > 0) {
      const combo = combos[0];
      const pEff = getEffectiveVisitDuration(mockDest1);
      const sEff = getEffectiveVisitDuration(combo.secondary);
      const pVisitMin = pEff.minMins / 60;
      const sVisitMin = sEff.minMins / 60;
      expect(combo.combinedVisitHours[0]).toBeCloseTo(pVisitMin + sVisitMin, 1);

      const expectedBudgetMin =
        (mockDest1.budgetMin ?? 0) + (combo.secondary.budgetMin ?? 0);
      expect(combo.combinedBudgetRange[0]).toBe(expectedBudgetMin);
    }
  });

  it("handles weather compatibility when rainy condition is specified", () => {
    const combosRainy = findNearbyCombinations(
      mockDest1,
      {
        destinationWeather: { actual: { condition: "rainy" } },
      },
      3,
    );

    expect(Array.isArray(combosRainy)).toBe(true);
    combosRainy.forEach((combo) => {
      expect(typeof combo.isWeatherMatched).toBe("boolean");
    });
  });
});
