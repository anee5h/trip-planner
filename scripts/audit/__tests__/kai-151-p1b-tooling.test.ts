import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateP1BReview } from "../../kai-151-p1b-season-cohort";

type Review = {
  summary: {
    candidateCount: number;
    researchedCount: number;
    mutatedCount: number;
    insufficientCount: number;
    conflictingCount: number;
    yearRoundWithPeakCount: number;
    classificationCounts: Record<string, number>;
  };
  records: Array<{
    id: string;
    mutationAllowed: boolean;
    classification: string;
    proposed: {
      apply: boolean;
      bestSeason: string | null;
      bestMonths: number[] | null;
      seasonVector: unknown;
    };
  }>;
};

const review = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "scripts/audit/kai-151-p1b-season-review.json"),
    "utf8",
  ),
) as Review;

describe("KAI-151 P1-B season cohort", () => {
  it("validates the complete post-migration state", () => {
    expect(validateP1BReview()).toBe("post");
  });

  it("keeps the reviewed cohort partition and exact mutation set", () => {
    expect(review.summary).toMatchObject({
      candidateCount: 79,
      researchedCount: 79,
      mutatedCount: 3,
      insufficientCount: 70,
      conflictingCount: 6,
      yearRoundWithPeakCount: 0,
    });
    expect(review.records).toHaveLength(79);
    expect(new Set(review.records.map((row) => row.id)).size).toBe(79);
    expect(
      review.records
        .filter((row) => row.mutationAllowed)
        .map((row) => row.id)
        .sort(),
    ).toEqual(["farm-tomita", "kenroku-en", "kirigamine-highlands"]);
  });

  it("keeps unsupported rows non-mutating with null proposals", () => {
    for (const row of review.records.filter(
      (candidate) => !candidate.mutationAllowed,
    )) {
      expect(["insufficient_evidence", "conflicting_or_ambiguous"]).toContain(
        row.classification,
      );
      expect(row.proposed).toEqual({
        apply: false,
        bestSeason: null,
        bestMonths: null,
        seasonVector: null,
      });
    }
  });
});
