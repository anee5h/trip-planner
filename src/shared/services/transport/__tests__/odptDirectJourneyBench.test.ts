import { describe, expect, it } from "vitest";
import {
  ODPT_DIRECT_JOURNEY_BENCH_EXPECTATIONS,
  formatOdptDirectJourneyBenchReport,
  runOdptDirectJourneyBench,
  type OdptDirectJourneyBenchRow,
} from "./odptDirectJourneyBench";
import { ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET } from "../OdptDirectJourneyService";

const rows = await runOdptDirectJourneyBench();

function rowFor(scenario: string): OdptDirectJourneyBenchRow {
  const row = rows.find((candidate) => candidate.scenario === scenario);
  if (row === undefined) throw new Error(`missing bench scenario: ${scenario}`);
  return row;
}

describe("direct-journey benchmark harness", () => {
  it("covers every declared scenario exactly once", async () => {
    const names = rows.map((row) => row.scenario);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(
      Object.keys(ODPT_DIRECT_JOURNEY_BENCH_EXPECTATIONS).sort(),
    );
  });

  it.each(Object.keys(ODPT_DIRECT_JOURNEY_BENCH_EXPECTATIONS))(
    "matches the pinned expectation for %s",
    (scenario) => {
      const expected = ODPT_DIRECT_JOURNEY_BENCH_EXPECTATIONS[scenario];
      const row = rowFor(scenario);
      expect(row.status).toBe(expected.status);
      if (expected.reason !== undefined)
        expect(row.reason).toBe(expected.reason);
      if (expected.durationsMinutes !== undefined) {
        expect(row.durationsMinutes).toEqual(expected.durationsMinutes);
      }
      if (expected.splitChainUsed !== undefined) {
        expect(row.splitChainUsed).toBe(expected.splitChainUsed);
      }
    },
  );

  it("never exceeds the per-journey lookup budget in any scenario", () => {
    for (const row of rows) {
      expect(row.logicalCalls).toBeLessThanOrEqual(
        ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET,
      );
      expect(row.stationTimetableLookups + row.exactTrainLookups).toBe(
        row.logicalCalls,
      );
      expect(row.stationTimetableLookups).toBeLessThanOrEqual(1);
    }
  });

  it("requires a positive duration on every verified candidate", () => {
    for (const row of rows) {
      for (const minutes of row.durationsMinutes) {
        expect(minutes).toBeGreaterThan(0);
      }
    }
  });

  it("reports split-chain usage only where a split was actually required", () => {
    expect(rowFor("toei_split_continuation").splitChainUsed).toBe(true);
    expect(rowFor("toei_single_part_no_split").splitChainUsed).toBe(false);
    expect(rowFor("tokyometro_direct_single_record").splitChainUsed).toBe(
      false,
    );
  });

  it("performs no provider traffic for an operator outside the pilot", () => {
    expect(rowFor("operator_outside_pilot").logicalCalls).toBe(0);
  });

  it("reports partial coverage honestly when the cap truncates inspection", () => {
    const capped = rowFor("budget_capped_12_candidates");
    expect(capped.candidateLimitReached).toBe(true);
    expect(capped.candidatesDiscovered).toBe(12);
    expect(capped.candidatesInspected).toBe(
      ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET - 1,
    );
    // Uninspected evidence remains, so this is NOT reported as an absence.
    expect(capped.status).not.toBe("no_direct_service_evidence");
  });

  it("is deterministic across runs", async () => {
    const second = await runOdptDirectJourneyBench();
    expect(JSON.stringify(second)).toBe(JSON.stringify(rows));
  });

  it("renders a readable report without credentials or raw payloads", () => {
    const report = formatOdptDirectJourneyBenchReport(rows);
    expect(report).toContain("scenario");
    expect(report).toContain("tokyometro_direct_single_record");
    expect(report).toContain("toei_split_continuation");
    for (const forbidden of [
      "consumerKey",
      "acl:consumerKey",
      "ODPT_API_KEY",
      "apiKey",
    ]) {
      expect(report).not.toContain(forbidden);
    }
  });

  it("carries no production wiring: the harness is the only caller", async () => {
    // The report is evidence for a LATER integration decision. If a production
    // module ever imports the resolver, this guard fails and the PR scope
    // boundary has been broken.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(process.cwd(), "src");
    // The two modules that DEFINE the primitive are not callers.
    const definitionFiles = new Set([
      join(root, "shared/services/transport/OdptDirectJourneyService.ts"),
      join(root, "shared/services/transport/odptDirectJourney.ts"),
    ]);
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const full = join(directory, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        if (full.includes("__tests__")) continue;
        if (definitionFiles.has(full)) continue;
        const source = readFileSync(full, "utf8");
        if (/OdptDirectJourneyService|resolveOdptDirectJourney/.test(source)) {
          offenders.push(full.replace(process.cwd(), ""));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("leaves the existing transport precedence untouched", async () => {
    // Guard the PR's central scope claim: no production transport module that
    // currently decides durations may import the new primitives.
    const { readFileSync } = await import("node:fs");
    const guarded = [
      "src/shared/services/transport/OriginAwareTransportService.ts",
      "src/shared/services/transport/JourneyService.ts",
      "src/shared/services/transport/JourneyBuilder.ts",
      "src/shared/services/transport/TransportEstimator.ts",
    ];
    for (const path of guarded) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("OdptDirectJourney");
      expect(source).not.toContain("odptDirectJourney");
    }
  });
});
