import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import type { ScoreMetadata } from "@/shared/services/recommendation/RecommendationScorer";
import { bestVerifiedScoreIndex } from "../compareScore";

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

describe("bestVerifiedScoreIndex (Compare Best badge)", () => {
  it("estimated never wins against verified evidence, even with a higher value", () => {
    const verified = dest("verified", "verified", 7.0);
    const estimated = dest("estimated", "estimated", 9.5);
    expect(bestVerifiedScoreIndex([estimated, verified])).toBe(1);
  });

  it("only verified states compete; highest verified wins", () => {
    const verifiedLow = dest("low", "verified", 6.0);
    const verifiedHigh = dest("high", "verified", 8.2);
    const estimated = dest("est", "estimated", 9.0);
    expect(bestVerifiedScoreIndex([verifiedLow, estimated, verifiedHigh])).toBe(
      2,
    );
  });

  it("tie resolves to the first verified index", () => {
    const a = dest("a", "verified", 7.7);
    const b = dest("b", "verified", 7.7);
    expect(bestVerifiedScoreIndex([a, b])).toBe(0);
  });

  it("no verified state means no badge", () => {
    const allEstimated = [
      dest("a", "estimated", 8.0),
      dest("b", "estimated", 6.0),
    ];
    const withUnavailable = [
      dest("a", "unavailable", null),
      dest("b", "estimated", 7.0),
    ];
    expect(bestVerifiedScoreIndex(allEstimated)).toBeNull();
    expect(bestVerifiedScoreIndex(withUnavailable)).toBeNull();
    expect(bestVerifiedScoreIndex([])).toBeNull();
  });
});
