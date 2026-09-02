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
    expect(audit.cases).toHaveLength(224);
    expect(audit.seasonalTestPlans).toHaveLength(14);
    expect(
      audit.seasonalTestPlans.every(
        (plan: any) =>
          plan.verifiedWindow &&
          Array.isArray(plan.sourceEvidence) &&
          plan.sourceEvidence.length > 0 &&
          Object.keys(plan.dates).length === 4,
      ),
    ).toBe(true);
    expect(
      new Set(audit.cases.map((record: any) => record.destinationId)),
    ).toEqual(new Set(audit.mutationIds));
    expect(new Set(audit.cases.map((record: any) => record.origin.id))).toEqual(
      new Set(["tokyo", "osaka", "fukuoka", "kagoshima"]),
    );
    expect(new Set(audit.cases.map((record: any) => record.position))).toEqual(
      new Set([
        "in_season",
        "pre_season_edge",
        "post_season_edge",
        "off_season",
      ]),
    );
    expect(
      audit.cases.every(
        (record: any) =>
          record.sourceWindow?.dateStatus === "testable" ||
          record.sourceWindow?.dateStatus === "insufficient_evidence",
      ),
    ).toBe(true);
    expect(
      audit.cases.every(
        (record: any) =>
          record.eligibilityState?.before && record.eligibilityState?.after,
      ),
    ).toBe(true);
    expect(
      audit.cases
        .filter((record: any) => record.testDate === null)
        .every(
          (record: any) =>
            record.classification === "insufficient_evidence" &&
            record.rankBefore === null &&
            record.rankAfter === null &&
            record.scoreBefore === null &&
            record.scoreAfter === null,
        ),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("shoulder");
  });

  it("attributes every primary score delta to the reviewed season fields", () => {
    expect(
      audit.cases
        .filter((record: any) => record.testDate !== null)
        .every(
          (record: any) => record.scoreDeltaAttribution.exactWithinTolerance,
        ),
    ).toBe(true);
    expect(
      audit.summary.classificationCounts.possible_seasonality_overweighting,
    ).toBe(0);
    expect(audit.summary.classificationCounts.unknown_seasonality_bias).toBe(0);
    expect(audit.summary.classificationCounts.unrelated_ranking_effect).toBe(0);
    expect(audit.boundaryAssessment.unexplainedAnomalies).toEqual([]);
    expect(
      audit.boundaryAssessment.destinationChecks
        .filter((check: any) => check.offSeasonTested)
        .every(
          (check: any) =>
            check.offSeasonSeasonalityContribution === 3 &&
            check.offSeasonSeasonalityContribution <
              check.inSeasonSeasonalityContribution,
        ),
    ).toBe(true);
  });

  it("locks the Sengan-en trigger and neutral unknown fallback", () => {
    const trigger = audit.senganInvestigation.triggerScenario;
    expect(trigger.scenarioId).toBe(
      "sengan-en-garden-kagoshima:fukuoka:in_season",
    );
    expect(trigger.rankAfter).toBe(4);
    expect(trigger.scoreBefore).toBe(54.9);
    expect(trigger.scoreAfter).toBe(72.9);
    expect(trigger.rankBefore).toBe(163);
    expect(trigger.testDate).toBe("2026-04-05");
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
    const senganFukuoka = audit.cases.filter(
      (record: any) =>
        record.destinationId === "sengan-en-garden-kagoshima" &&
        record.origin.id === "fukuoka",
    );
    expect(
      new Set(senganFukuoka.map((record: any) => record.position)),
    ).toEqual(
      new Set([
        "in_season",
        "pre_season_edge",
        "post_season_edge",
        "off_season",
      ]),
    );
    expect(
      senganFukuoka
        .filter((record: any) =>
          ["pre_season_edge", "post_season_edge"].includes(record.position),
        )
        .every(
          (record: any) =>
            record.testDate === null &&
            record.classification === "insufficient_evidence",
        ),
    ).toBe(true);
    const senganOffSeason = senganFukuoka.find(
      (record: any) => record.position === "off_season",
    );
    expect(senganOffSeason).toMatchObject({
      testDate: "2026-08-15",
      scoreDelta: 3,
      scoreDeltaAttribution: {
        seasonalityFieldDelta: 3,
        conditionOtherDelta: 0,
        residual: 0,
      },
    });
    expect(senganOffSeason.after.seasonality).toMatchObject({
      selectedDateSeason: "summer",
      selectedDateRating: 6,
      ambientSeason: "autumn",
      ambientRating: 5,
      selectedDateSeasonCorrection: 3,
      bestMonthBonus: 0,
    });
  });
});
