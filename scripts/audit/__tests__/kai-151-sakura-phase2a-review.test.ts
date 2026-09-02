import { describe, expect, it } from "vitest";
import baseline from "../kai-151-sakura-phase2a-baseline.json";
import review from "../kai-151-sakura-phase2a-review.json";
import {
  expectedSeasonMetadata,
  validatePhase2AReview,
} from "../kai-151-sakura-phase2a-validator";

describe("KAI-151 Phase 2A sakura review contract", () => {
  it("accepts the complete reviewed cohort in its pre-mutation state", () => {
    expect(() =>
      validatePhase2AReview(baseline, review, baseline.records),
    ).not.toThrow();
  });

  it("accepts the complete reviewed cohort in its post-mutation state", () => {
    const post = structuredClone(baseline.records);
    const reviewById = new Map(
      review.records.map((record) => [record.id, record]),
    );
    for (const record of post) {
      const reviewed = reviewById.get(record.id);
      if (!reviewed?.mutationAllowed) continue;
      record.current = {
        ...record.current,
        bestSeason: reviewed.proposed.bestSeason,
        bestMonths: reviewed.proposed.bestMonths,
        season: reviewed.proposed.seasonVector,
        seasonMetadata: expectedSeasonMetadata(reviewed.proposed.bestMonths),
      };
    }
    expect(validatePhase2AReview(baseline, review, post)).toBe("post");
  });

  it("rejects malformed month vectors and conflicting proposals", () => {
    const malformed = structuredClone(review);
    const record = malformed.records.find(
      (candidate) => candidate.mutationAllowed,
    );
    if (!record) throw new Error("fixture must contain a proposed mutation");
    record.proposed.bestMonths = [0, 13];
    expect(() =>
      validatePhase2AReview(baseline, malformed, baseline.records),
    ).toThrow(/bestMonths|month/i);

    const conflicting = structuredClone(review);
    const unresolved = conflicting.records.find(
      (candidate) => candidate.classification === "insufficient_evidence",
    );
    if (!unresolved)
      throw new Error("fixture must contain unresolved evidence");
    unresolved.proposed.bestSeason = "Spring";
    expect(() =>
      validatePhase2AReview(baseline, conflicting, baseline.records),
    ).toThrow(/insufficient|proposal|unresolved/i);
  });
});
