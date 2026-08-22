import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Destination } from "../../../src/shared/types/destination.js";
import {
  buildDestinationDepthReport,
  scoreDestinationDepth,
  type DestinationDepthScoreInput,
} from "../destination-depth.js";

interface BaselineRow {
  prefecture: string;
  region: string;
  total: number;
  largestMunicipalityCount: number;
  municipalityBucketCount: number;
  archetypesCovered: number;
  halfDayCandidates: number;
  dayTripCandidates: number;
  seasonsCovered: number | null;
  transportModeCount: number;
  depthScore: number;
  scoreComponents: Record<string, number>;
}

interface BaselineFixture {
  sourceReport: string;
  catalogSize: number;
  prefectureCount: number;
  shellHubCount: number;
  national: BaselineRow;
  prefectures: BaselineRow[];
}

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "fixtures/destination-depth-baseline-978.json",
    ),
    "utf8",
  ),
) as BaselineFixture;

function scoreInput(row: BaselineRow): DestinationDepthScoreInput {
  return {
    total: row.total,
    largestMunicipalityCount: row.largestMunicipalityCount,
    municipalityBucketCount: row.municipalityBucketCount,
    archetypesCovered: row.archetypesCovered,
    halfDayCandidates: row.halfDayCandidates,
    dayTripCandidates: row.dayTripCandidates,
    seasonsCovered: row.seasonsCovered,
    transportModeCount: row.transportModeCount,
  };
}

describe("destination-depth methodology regression", () => {
  it("matches the source-audit scoring vectors for every prefecture", () => {
    expect(fixture.catalogSize).toBe(978);
    expect(fixture.prefectureCount).toBe(47);
    expect(fixture.prefectures).toHaveLength(47);

    for (const row of fixture.prefectures) {
      const scored = scoreDestinationDepth(scoreInput(row));
      expect(scored.depthScore, row.prefecture).toBe(row.depthScore);
      expect(scored.components, row.prefecture).toEqual(row.scoreComponents);
    }
  });

  it.skipIf(
    JSON.parse(
      fs.readFileSync(
        path.resolve(
          path.dirname(new URL(import.meta.url).pathname),
          "../../../src/shared/data/destinations-index.json",
        ),
        "utf8",
      ),
    ).length !== fixture.catalogSize,
  )("matches the committed 978-record baseline before expansion waves", () => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.resolve(
          path.dirname(new URL(import.meta.url).pathname),
          "../../../src/shared/data/destinations-index.json",
        ),
        "utf8",
      ),
    ) as Destination[];
    const report = buildDestinationDepthReport(catalog);

    expect(report.catalogSize).toBe(978);
    expect(report.prefectureCount).toBe(47);
    expect(report.national.depthScore).toBe(fixture.national.depthScore);
    expect(report.prefectures).toHaveLength(47);
    expect(
      report.prefectures.map(({ prefecture }) => prefecture).sort(),
    ).toEqual(fixture.prefectures.map(({ prefecture }) => prefecture).sort());

    for (const expected of ["Kyoto", "Okinawa", "Chiba", "Tottori", "Mie"]) {
      const actual = report.prefectures.find(
        ({ prefecture }) => prefecture === expected,
      );
      const baseline = fixture.prefectures.find(
        ({ prefecture }) => prefecture === expected,
      );
      expect(actual?.depthScore, expected).toBe(baseline?.depthScore);
    }

    expect(
      report.prefectures.find(({ prefecture }) => prefecture === "Mie")?.region,
    ).toBe("Kansai");
    expect(report.relationshipSummary.shellHubs).toHaveLength(
      fixture.shellHubCount,
    );
  });
});
