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
      mutatedCount: 46,
      insufficientCount: 66,
    });
    expect(review.records).toHaveLength(112);
    expect(new Set(review.records.map((row) => row.id)).size).toBe(112);
    expect(
      review.records
        .filter((row) => row.mutationAllowed)
        .map((row) => row.id)
        .sort(),
    ).toEqual([
      "amanoiwato-shrine",
      "bitchu-matsuyama-castle",
      "byodoin-temple",
      "dazaifu-tenmangu",
      "fudaten-shrine",
      "funai-castle",
      "gessho-ji-temple-matsue",
      "hagi-castle",
      "haruna-shrine",
      "hirado-castle",
      "hitachinokuni-soshagu-shrine",
      "iga-ueno-castle",
      "ikuta-shrine-kobe",
      "iwamura-castle",
      "kasama-inari-shrine",
      "kifune-jinja-kyoto",
      "kiyomizu-dera",
      "kofu-castle",
      "kubota-castle",
      "kumano-hayatama-taisha-shingu",
      "kumano-hongu-taisha-oyunohara",
      "matsusaka-castle",
      "matsushiro-castle",
      "meiji-jingu",
      "mimuroto-ji-temple",
      "miyazaki-jingu-shrine",
      "nagashino-castle",
      "nakayama-hokekyoji-ichikawa",
      "nihonmatsu-castle",
      "oka-castle-oita",
      "ozu-castle",
      "shibata-castle",
      "shirahige-shrine-lake-biwa",
      "shorinzan-darumaji",
      "sumiyoshi-taisha",
      "taga-taisha",
      "takahata-fudoson",
      "takaoka-castle",
      "takaosan-yakuoin",
      "takatori-castle",
      "tenryu-ji-kyoto",
      "tokushima-castle",
      "toshodai-ji-temple",
      "yakushi-ji-temple",
      "zenkoji-temple",
      "zoshigaya-kishimojindo",
    ]);
  });

  it("requires residual rows to remain unknown rather than inventing values", () => {
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
