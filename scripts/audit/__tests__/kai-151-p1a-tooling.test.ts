import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateP1AReview } from "../../kai-151-p1a-season-cohort";

type Review = {
  summary: {
    candidateCount: number;
    mutatedCount: number;
    insufficientCount: number;
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
    path.join(process.cwd(), "scripts/audit/kai-151-p1a-season-review.json"),
    "utf8",
  ),
) as Review;

describe("KAI-151 P1-A season cohort", () => {
  it("validates the complete post-migration state", () => {
    expect(validateP1AReview()).toBe("post");
  });

  it("keeps the exact cohort partition and mutation set", () => {
    expect(review.summary).toMatchObject({
      candidateCount: 112,
      mutatedCount: 6,
      insufficientCount: 106,
    });
    expect(review.records).toHaveLength(112);
    expect(new Set(review.records.map((row) => row.id)).size).toBe(112);
    expect(
      review.records
        .filter((row) => row.mutationAllowed)
        .map((row) => row.id)
        .sort(),
    ).toEqual([
      "byodoin-temple",
      "dazaifu-tenmangu",
      "kiyomizu-dera",
      "mimuroto-ji-temple",
      "takahata-fudoson",
      "tenryu-ji-kyoto",
    ]);
  });

  it("requires residual rows to remain unknown rather than inventing values", () => {
    for (const row of review.records.filter(
      (candidate) => !candidate.mutationAllowed,
    )) {
      expect(row.classification).toBe("insufficient_evidence");
      expect(row.proposed).toEqual({
        apply: false,
        bestSeason: null,
        bestMonths: null,
        seasonVector: null,
      });
    }
  });
});
