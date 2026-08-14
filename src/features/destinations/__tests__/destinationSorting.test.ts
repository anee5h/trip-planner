import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import type { ScoreMetadata } from "@/shared/services/recommendation/RecommendationScorer";
import { compareOverallScore } from "../destinationSorting";

function meta(
  state: ScoreMetadata["state"],
  value: number | null,
): ScoreMetadata {
  return {
    state,
    value,
    rubricVersion: "kai-89-overall-v2",
    confidence:
      state === "verified" ? "high" : state === "estimated" ? "low" : "unknown",
    coverage: value === null ? 0.3 : 0.9,
    provenance: {
      sourceClass: state === "verified" ? "editorial-review" : "model",
      ...(state === "verified"
        ? {
            verifiedAt: "2026-08-14",
            sources: ["https://example.com/official"],
          }
        : {}),
      basis: "test",
    },
    noteKey: "destination.scoreVerifiedNote",
  };
}

function dest(
  id: string,
  state: ScoreMetadata["state"],
  value: number | null,
): Destination {
  return {
    id,
    name: id,
    prefecture: "Tokyo",
    region: "Kanto",
    tags: [],
    scoreMetadata: meta(state, value),
  } as unknown as Destination;
}

describe("compareOverallScore (Explore overall sort)", () => {
  it("verified outranks estimated regardless of value", () => {
    const verifiedLow = dest("a", "verified", 6.1);
    const estimatedHigh = dest("b", "estimated", 8.9);
    expect(compareOverallScore(verifiedLow, estimatedHigh)).toBeLessThan(0);
    expect(compareOverallScore(estimatedHigh, verifiedLow)).toBeGreaterThan(0);
  });

  it("estimated outranks unavailable", () => {
    const estimated = dest("a", "estimated", 5.2);
    const unavailable = dest("b", "unavailable", null);
    expect(compareOverallScore(estimated, unavailable)).toBeLessThan(0);
  });

  it("within a state sorts by value descending", () => {
    const high = dest("a", "estimated", 7.5);
    const low = dest("b", "estimated", 5.5);
    expect(compareOverallScore(high, low)).toBeLessThan(0);
    expect(compareOverallScore(low, high)).toBeGreaterThan(0);
  });

  it("tie-breaks deterministically by id", () => {
    const a = dest("a", "verified", 8.0);
    const b = dest("b", "verified", 8.0);
    expect(compareOverallScore(a, b)).toBeLessThan(0);
    expect(compareOverallScore(b, a)).toBeGreaterThan(0);
  });
});
