#!/usr/bin/env tsx
/**
 * KAI-220 — deterministic final Budget v2 audit.
 *
 * This is a read-only benchmark over the current catalogue. It deliberately
 * measures the KAI-260 range-first engine rather than reintroducing the old
 * "every source verified or unavailable" gate.
 *
 * Run with:
 *   npx tsx --tsconfig tsconfig.app.json scripts/audit/kai-220-budget-audit.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { calculateTripEstimate } from "../../src/shared/services/budget/tripEstimateEngine";
import { getValidModes } from "../../src/shared/services/recommendation/RecommendationScorer";
import { resolveOriginTransportZone } from "../../src/shared/services/transport/TransportTopologyService";
import type { Destination } from "../../src/shared/types/destination";
import type { BudgetTier } from "../../src/shared/types/planner";
import type { TripDuration } from "../../src/shared/types/tripDuration";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const ORIGINS = [
  {
    key: "nakayama",
    label: "Nakayama Station, Kanagawa",
    lat: 35.5147,
    lng: 139.5393,
  },
  { key: "tokyo", label: "Tokyo", lat: 35.6812, lng: 139.7671 },
  { key: "osaka", label: "Osaka", lat: 34.7025, lng: 135.4959 },
  { key: "hakata", label: "Hakata", lat: 33.5902, lng: 130.4017 },
  { key: "naha", label: "Naha", lat: 26.2124, lng: 127.6809 },
] as const;
const SCENARIOS = [
  { key: "day-p1", duration: "fullDay", partySize: 1 },
  { key: "day-p2", duration: "fullDay", partySize: 2 },
  { key: "2d1n-p1", duration: "2d1n", partySize: 1 },
  { key: "2d1n-p2", duration: "2d1n", partySize: 2 },
  { key: "3d2n-p1", duration: "3d2n", partySize: 1 },
  { key: "3d2n-p2", duration: "3d2n", partySize: 2 },
] as const satisfies readonly {
  key: string;
  duration: TripDuration;
  partySize: number;
}[];
const CALIBRATED_CEILINGS: Record<BudgetTier, number> = {
  economy: 50_000,
  standard: 100_000,
  comfortable: 200_000,
  luxury: Number.POSITIVE_INFINITY,
};

interface BenchmarkRecord {
  readonly destId: string;
  readonly name: string;
  readonly mode: string;
  readonly specialAccess: boolean;
  readonly result: ReturnType<typeof calculateTripEstimate>;
}

function loadDestinations(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
}

function isSpecialAccessDestination(destination: Destination): boolean {
  return Boolean(
    destination.localAccessModes?.includes("ferry") ||
    destination.kind === "island" ||
    destination.transportZoneId?.toLowerCase().includes("island") ||
    destination.transportOptions?.ferry !== undefined,
  );
}

function chooseBest(records: BenchmarkRecord[]): BenchmarkRecord | undefined {
  return [...records].sort(
    (left, right) =>
      (left.result.total?.max ?? Infinity) -
        (right.result.total?.max ?? Infinity) ||
      (left.result.total?.min ?? Infinity) -
        (right.result.total?.min ?? Infinity) ||
      left.mode.localeCompare(right.mode) ||
      left.destId.localeCompare(right.destId),
  )[0];
}

function componentFor(record: BenchmarkRecord, scope: string) {
  return record.result.components.find(
    (component) => component.evidence.scope === scope,
  );
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
  ];
}

function runAudit(destinations: Destination[]) {
  const originOutput: Record<string, unknown> = {};
  const calibrationSamples: Record<string, number[]> = {};
  const globalAnomalies: {
    origin: string;
    scenario: string;
    id: string;
    kind: string;
  }[] = [];

  for (const origin of ORIGINS) {
    const coords = { lat: origin.lat, lng: origin.lng };
    const originZoneId = resolveOriginTransportZone({
      coordinates: coords,
      label: origin.label,
    });
    const scenarioRecords = new Map<string, BenchmarkRecord[]>();
    const scenarioOutput: Record<string, unknown> = {};

    for (const scenario of SCENARIOS) {
      const records: BenchmarkRecord[] = [];
      for (const destination of destinations) {
        const modes = getValidModes(
          destination,
          "none",
          PUBLIC_MODES,
          coords,
          "standard",
          originZoneId,
        );
        const candidates = modes.flatMap((mode) => {
          const result = calculateTripEstimate({
            dest: destination,
            mode,
            partySize: scenario.partySize,
            duration: scenario.duration,
            budgetTier: "standard",
            homeCoords: coords,
            includeOriginTravel: true,
          });
          return [
            {
              destId: destination.id,
              name: destination.name,
              mode,
              specialAccess: isSpecialAccessDestination(destination),
              result,
            },
          ];
        });
        const best = chooseBest(candidates);
        if (best) records.push(best);
      }
      scenarioRecords.set(scenario.key, records);

      const bounded = records.filter((record) => record.result.total);
      const completeness = countBy(
        records.map((record) => record.result.completeness),
      );
      const evidenceCompleteness = countBy(
        records.map((record) => record.result.evidenceCompleteness),
      );
      const quality = countBy(
        records.map((record) => record.result.estimateQuality),
      );
      const unavailableReasons = countBy(
        records.flatMap((record) =>
          record.result.missingComponents.map(
            (missing) => `${missing.scope}:${missing.reason}`,
          ),
        ),
      );
      const originComponents = records.map((record) =>
        componentFor(record, "origin_travel"),
      );
      const localComponents = records.map((record) =>
        componentFor(record, "local_transport"),
      );
      const admissionComponents = records.map((record) =>
        componentFor(record, "admission"),
      );
      const accommodationComponents = records.map((record) =>
        componentFor(record, "accommodation"),
      );
      const sourceBackedTransport = originComponents.filter(
        (component) => component?.evidence.derivation === "source_fact",
      ).length;
      const modeledOriginTransport = originComponents.filter(
        (component) => component?.evidence.derivation === "model_estimate",
      ).length;
      const localProfileFallback = localComponents.filter(
        (component) => component?.evidence.derivation === "model_estimate",
      ).length;
      const specialAccessOverrides = records.filter(
        (record) =>
          record.specialAccess &&
          componentFor(record, "local_transport")?.evidence.derivation ===
            "model_estimate",
      ).length;
      const admissionFallback = admissionComponents.filter(
        (component) => component?.evidence.derivation === "model_estimate",
      ).length;
      const accommodationFallback = accommodationComponents.filter(
        (component) => component?.evidence.derivation === "model_estimate",
      ).length;
      const sourceFixedRanges = records.reduce(
        (count, record) =>
          count +
          record.result.components.filter(
            (component) =>
              component.evidence.derivation === "source_fact" &&
              component.cost.kind === "bounded" &&
              component.cost.min === component.cost.max,
          ).length,
        0,
      );
      const anomalies: string[] = [];
      for (const record of records) {
        const total = record.result.total;
        if (total && (total.min < 0 || total.max < total.min)) {
          anomalies.push(`${record.destId}:invalid_total_range`);
          globalAnomalies.push({
            origin: origin.key,
            scenario: scenario.key,
            id: record.destId,
            kind: "invalid_total_range",
          });
        }
        if (total && total.max > 300_000) {
          anomalies.push(`${record.destId}:total_over_300k`);
          globalAnomalies.push({
            origin: origin.key,
            scenario: scenario.key,
            id: record.destId,
            kind: "total_over_300k",
          });
        }
        if (
          total?.min === 0 &&
          total.max === 0 &&
          record.result.estimateQuality !== "verified"
        ) {
          anomalies.push(`${record.destId}:unverified_zero_total`);
          globalAnomalies.push({
            origin: origin.key,
            scenario: scenario.key,
            id: record.destId,
            kind: "unverified_zero_total",
          });
        }
      }
      const maxValues = bounded.flatMap((record) =>
        record.result.total ? [record.result.total.max] : [],
      );
      calibrationSamples[scenario.key] = [
        ...(calibrationSamples[scenario.key] ?? []),
        ...maxValues,
      ];
      const representatives = [
        bounded[0],
        bounded[Math.floor(bounded.length / 2)],
        bounded.at(-1),
      ]
        .filter((record): record is BenchmarkRecord => Boolean(record))
        .map((record) => ({
          id: record.destId,
          name: record.name,
          mode: record.mode,
          range: record.result.total
            ? [record.result.total.min, record.result.total.max]
            : null,
          quality: record.result.estimateQuality,
          evidenceCompleteness: record.result.evidenceCompleteness,
        }));
      scenarioOutput[scenario.key] = {
        partySize: scenario.partySize,
        duration: scenario.duration,
        routable: records.length,
        bounded: bounded.length,
        completeBounded: completeness.complete ?? 0,
        partialBounded: records.filter(
          (record) =>
            record.result.completeness === "partial" && record.result.total,
        ).length,
        openEnded: records.filter((record) =>
          record.result.components.some(
            (component) =>
              component.cost.kind === "open_ended" ||
              component.cost.kind === "variable",
          ),
        ).length,
        unavailable: records.length - bounded.length,
        completeness,
        evidenceCompleteness,
        quality,
        sourceBackedTransport,
        modeledOriginTransport,
        localProfileFallback,
        specialAccessOverrides,
        admissionFallback,
        accommodationFallback,
        sourceFixedRanges,
        unavailableReasons,
        anomalies,
        representatives,
      };
    }

    const p1 = scenarioRecords.get("2d1n-p1") ?? [];
    const p2 = scenarioRecords.get("2d1n-p2") ?? [];
    for (const onePerson of p1) {
      const twoPerson = p2.find((record) => record.destId === onePerson.destId);
      if (!twoPerson) continue;
      const oneAccommodation = componentFor(onePerson, "accommodation")?.cost;
      const twoAccommodation = componentFor(twoPerson, "accommodation")?.cost;
      if (
        oneAccommodation?.kind === "bounded" &&
        twoAccommodation?.kind === "bounded" &&
        (oneAccommodation.min !== twoAccommodation.min ||
          oneAccommodation.max !== twoAccommodation.max)
      ) {
        globalAnomalies.push({
          origin: origin.key,
          scenario: "2d1n-party-scaling",
          id: onePerson.id,
          kind: "accommodation_multiplied_by_party",
        });
      }
    }
    originOutput[origin.key] = {
      label: origin.label,
      totalCatalogue: destinations.length,
      scenarios: scenarioOutput,
    };
  }

  const distributions = Object.fromEntries(
    Object.entries(calibrationSamples).map(([scenario, values]) => [
      scenario,
      {
        count: values.length,
        min: values.length ? Math.min(...values) : null,
        p25: percentile(values, 0.25),
        median: percentile(values, 0.5),
        p75: percentile(values, 0.75),
        p90: percentile(values, 0.9),
        max: values.length ? Math.max(...values) : null,
        ceilings: Object.fromEntries(
          Object.entries(CALIBRATED_CEILINGS).map(([tier, ceiling]) => [
            tier,
            Number.isFinite(ceiling)
              ? values.filter((value) => value <= ceiling).length
              : values.length,
          ]),
        ),
      },
    ]),
  );

  return {
    generatedAt: "KAI-220 deterministic audit (no clock)",
    architecture: "KAI-260 range-first TripEstimateEngine",
    totalCatalogue: destinations.length,
    benchmarkOrigins: ORIGINS.map(({ key, label }) => ({ key, label })),
    calibratedPartyTotalCeilings: CALIBRATED_CEILINGS,
    origins: originOutput,
    standardEstimateMaxDistributions: distributions,
    anomalyCount: globalAnomalies.length,
    anomalies: globalAnomalies,
  };
}

export { loadDestinations, runAudit };

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runAudit(loadDestinations()), null, 2));
}
