import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const audit = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "scripts/audit/kai-151-sakura-sensitivity.json"),
    "utf8",
  ),
);

describe("KAI-151 sakura recommendation-sensitivity artifact", () => {
  it("covers exactly the reviewed mutation set and primary matrix", () => {
    expect(audit.mutationCount).toBe(14);
    expect(audit.mutationIds).toHaveLength(14);
    expect(audit.catalogueSnapshots.canonicalDataChangedByAudit).toBe(false);
    expect(audit.catalogueSnapshots.unrelatedSeasonalityChanges).toEqual([]);
    expect(audit.cases).toHaveLength(168);
    expect(
      new Set(audit.cases.map((record: any) => record.destinationId)),
    ).toEqual(new Set(audit.mutationIds));
    expect(new Set(audit.cases.map((record: any) => record.origin.id))).toEqual(
      new Set(["tokyo", "osaka", "fukuoka", "kagoshima"]),
    );
    expect(new Set(audit.cases.map((record: any) => record.position))).toEqual(
      new Set(["in_season", "shoulder", "off_season"]),
    );
  });

  it("attributes every primary score delta to the reviewed season fields", () => {
    expect(
      audit.cases.every(
        (record: any) => record.scoreDeltaAttribution.exactWithinTolerance,
      ),
    ).toBe(true);
    expect(
      audit.summary.classificationCounts.possible_seasonality_overweighting,
    ).toBe(0);
    expect(audit.summary.classificationCounts.unknown_seasonality_bias).toBe(0);
    expect(audit.summary.classificationCounts.unrelated_ranking_effect).toBe(0);
  });

  it("locks the Sengan-en trigger and neutral unknown fallback", () => {
    const trigger = audit.senganInvestigation.triggerScenario;
    expect(trigger.scenarioId).toBe(
      "sengan-en-garden-kagoshima:fukuoka:in_season",
    );
    expect(trigger.rankAfter).toBe(4);
    expect(trigger.scoreBefore).toBe(54.9);
    expect(trigger.scoreAfter).toBe(72.9);
    expect(trigger.scoreDeltaAttribution).toMatchObject({
      seasonalityFieldDelta: 18,
      conditionOtherDelta: 0,
      residual: 0,
      exactWithinTolerance: true,
    });
    expect(audit.unknownBehavior).toMatchObject({
      behavior: "neutral_fallback",
      exactSemantics: {
        missingSeasonRatingFallback: 5,
        missingBestMonthsBonus: 0,
        missingSeasonPenalty: 0,
      },
    });
  });
});
