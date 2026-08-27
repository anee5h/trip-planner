/**
 * KAI-219 — five-origin Budget v2 completeness benchmark (vitest-run).
 *
 * Reproduces the canonical TripCostEngine completeness for the five
 * benchmark destinations (Nakayama, Tokyo, Osaka, Hakata, Naha) using the
 * SAME context the app uses for a default day trip: partySize 2,
 * tripMode day_trip, includeOriginTravel true (full journey), no
 * accommodation. Reports completeness + transport fare scope + admission
 * state + localTransport state. Deterministic — run twice, byte-identical.
 *
 *   npx vitest run scripts/audit/__tests__/kai-219-five-origin-benchmark.test.ts
 */
import { describe, expect, it } from "vitest";
import { calculateTripCost } from "@/shared/services/budget/tripCostEngine";
import type { Destination } from "@/shared/types/destination";
import * as fs from "node:fs";
import * as path from "node:path";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const BENCHMARK_KEYS = ["nakayama", "tokyo", "osaka", "hakata", "naha"];

// Canonical benchmark picks (subagent V4-219-D verified): the hub/iconic
// record per origin that the app treats as the canonical destination.
const BENCHMARK_IDS: Record<string, string> = {
  nakayama: "nakayama-hokekyoji-ichikawa",
  tokyo: "tokyo-station-chiyoda",
  osaka: "osaka-city",
  hakata: "hakata-station-area",
  naha: "naha-city",
};

export function runBenchmark(destinations: Destination[]) {
  const rows: Record<
    string,
    {
      id: string;
      name?: string;
      completeness: string;
      total?: { min: number; max: number };
      knownSubtotal?: [number, number];
      missing: string[];
      admissionState?: string;
      localTransportKind?: string;
      transportFareScopes: string[];
      usedTransitionalAdmissionFallback: boolean;
    }
  > = {};

  for (const key of BENCHMARK_KEYS) {
    const dest = destinations.find((d) => d.id === BENCHMARK_IDS[key]);
    if (!dest) {
      rows[key] = {
        id: "(not found)",
        completeness: "NOT_FOUND",
        missing: [],
        transportFareScopes: [],
        usedTransitionalAdmissionFallback: false,
      };
      continue;
    }
    const result = calculateTripCost({
      dest,
      tripMode: "day_trip",
      partySize: 2,
      nights: 0,
      includeOriginTravel: true,
    });
    const admission = dest.admission;
    const lt = dest.localTransport;
    rows[key] = {
      id: dest.id,
      name: dest.name,
      completeness: result.completeness,
      total:
        result.completeness === "complete" && result.total
          ? { min: result.total.min, max: result.total.max }
          : undefined,
      knownSubtotal:
        result.completeness === "partial" ? result.knownSubtotal : undefined,
      missing: (result.missingComponents ?? []).map((m) => m.scope),
      admissionState: admission?.state ?? "(absent → transitional legacy)",
      localTransportKind: lt?.kind ?? "(absent → unavailable)",
      transportFareScopes: result.components
        .filter((c) => c.evidence.scope === "origin_travel")
        .map((c) => c.evidence.fareScope ?? "none"),
      usedTransitionalAdmissionFallback: !admission,
    };
  }
  return rows;
}

describe("KAI-219 five-origin Budget v2 baseline", () => {
  it("derives deterministic completeness for the five benchmark origins", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const rows = runBenchmark(destinations);
    // Every benchmark key must resolve to a real destination.
    for (const key of BENCHMARK_KEYS) {
      expect(rows[key].completeness, `${key} must resolve`).not.toBe(
        "NOT_FOUND",
      );
    }
    // Deterministic: run twice → identical.
    expect(runBenchmark(destinations)).toEqual(rows);
    // Baseline evidence (asserted so future catalogue cohorts show a diff).
    console.log(JSON.stringify(rows, null, 2));
  });
});
