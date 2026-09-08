/** KAI-260 range-first traveller coverage benchmark. */
import { describe, expect, it } from "vitest";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import type { Destination } from "@/shared/types/destination";
import * as fs from "node:fs";
import * as path from "node:path";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const BASELINE_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/fixtures/kai-260-main-bounded.json",
);
const ORIGINS = [
  {
    key: "nakayama",
    label: "Nakayama Station, Kanagawa",
    coords: { lat: 35.5147, lng: 139.5393 },
  },
  { key: "tokyo", label: "Tokyo", coords: { lat: 35.6812, lng: 139.7671 } },
  { key: "osaka", label: "Osaka", coords: { lat: 34.7025, lng: 135.4959 } },
  { key: "hakata", label: "Hakata", coords: { lat: 33.5902, lng: 130.4017 } },
  { key: "naha", label: "Naha", coords: { lat: 26.2124, lng: 127.6809 } },
] as const;
const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];

type RangeClassification =
  | "bounded_plannable"
  | "conservative_discovered"
  | "unavailable"
  | "unsupported";

interface RangeCandidate {
  readonly mode: string;
  readonly estimate: ReturnType<typeof calculateTripEstimate>;
}

export interface RangeDestinationRow {
  readonly id: string;
  readonly name: string;
  readonly classification: RangeClassification;
  readonly modes: readonly string[];
  readonly missingReasons: readonly string[];
  readonly bestEstimateQuality?: string;
}

export interface RangeBenchmarkRow {
  origin: string;
  total: number;
  /** Legacy mode-authorized population, retained for report continuity. */
  routable: number;
  /** Legacy alias for boundedPlannable. */
  bounded: number;
  /** Canonical bounded-planning count. */
  boundedPlannable: number;
  /** Other mode-authorized destinations without a bounded result. */
  unavailable: number;
  /** Legacy combined unavailable count, including conservative discoveries. */
  modeAuthorizedUnavailable: number;
  /** Non-gating mode-authorized candidates rejected as conservative-only. */
  conservativeDiscovered: number;
  /** Destinations with no authorized travel mode. */
  unsupported: number;
  /** Non-conservative mode-authorized population used by the 90% gate. */
  gatePopulation: number;
  /** Existing 90% threshold, applied only to the gate population. */
  usablePct: number;
  estimateQuality: Record<string, number>;
}

export interface Kai260BoundedTransition {
  readonly origin: string;
  readonly destinationId: string;
  readonly destinationName: string;
  readonly currentClassification: RangeClassification;
  readonly currentModes: readonly string[];
  readonly currentMissingReasons: readonly string[];
}

function candidatesFor(
  destination: Destination,
  origin: (typeof ORIGINS)[number],
): { modes: readonly string[]; candidates: readonly RangeCandidate[] } {
  const modes = getValidModes(
    destination,
    "none",
    PUBLIC_MODES,
    origin.coords,
    "standard",
  );
  const candidates = modes.map((mode) => ({
    mode,
    estimate: calculateTripEstimate({
      dest: destination,
      mode,
      partySize: 2,
      tripMode: "day_trip",
      includeOriginTravel: true,
      homeCoords: origin.coords,
    }),
  }));
  return { modes, candidates };
}

function classifyDestination(
  destination: Destination,
  origin: (typeof ORIGINS)[number],
): RangeDestinationRow {
  const { modes, candidates } = candidatesFor(destination, origin);
  const bounded = candidates.filter((candidate) => candidate.estimate.total);
  const conservative = candidates.some((candidate) =>
    candidate.estimate.missingComponents.some(
      (missing) =>
        missing.scope === "origin_travel" &&
        missing.reason === "insufficient_model_evidence",
    ),
  );
  const missingReasons = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.estimate.missingComponents.map(
          (missing) => `${missing.scope}:${missing.reason}`,
        ),
      ),
    ),
  ].sort();
  const classification: RangeClassification =
    bounded.length > 0
      ? "bounded_plannable"
      : modes.length === 0
        ? "unsupported"
        : conservative
          ? "conservative_discovered"
          : "unavailable";
  const best = [...bounded].sort(
    (left, right) => left.estimate.total!.max - right.estimate.total!.max,
  )[0];
  return {
    id: destination.id,
    name: destination.name,
    classification,
    modes,
    missingReasons,
    ...(best ? { bestEstimateQuality: best.estimate.estimateQuality } : {}),
  };
}

export function classifyRangeDestinations(
  destinations: Destination[],
): Record<string, readonly RangeDestinationRow[]> {
  return Object.fromEntries(
    ORIGINS.map((origin) => [
      origin.key,
      destinations.map((destination) =>
        classifyDestination(destination, origin),
      ),
    ]),
  );
}

export function findBoundedToUnavailableTransitions(
  baseline: Record<string, { boundedIds: readonly string[] }>,
  current: Record<string, readonly RangeDestinationRow[]>,
): Kai260BoundedTransition[] {
  return ORIGINS.flatMap((origin) => {
    const baselineIds = new Set(baseline[origin.key]?.boundedIds ?? []);
    return current[origin.key]
      .filter(
        (row) =>
          baselineIds.has(row.id) && row.classification !== "bounded_plannable",
      )
      .map((row) => ({
        origin: origin.key,
        destinationId: row.id,
        destinationName: row.name,
        currentClassification: row.classification,
        currentModes: row.modes,
        currentMissingReasons: row.missingReasons,
      }));
  });
}

export function runRangeBenchmark(
  destinations: Destination[],
): Record<string, RangeBenchmarkRow> {
  const classified = classifyRangeDestinations(destinations);
  return Object.fromEntries(
    ORIGINS.map((origin) => {
      const rows = classified[origin.key];
      const boundedRows = rows.filter(
        (row) => row.classification === "bounded_plannable",
      );
      const conservativeDiscovered = rows.filter(
        (row) => row.classification === "conservative_discovered",
      ).length;
      const unsupported = rows.filter(
        (row) => row.classification === "unsupported",
      ).length;
      const unavailable = rows.filter(
        (row) => row.classification === "unavailable",
      ).length;
      const modeAuthorizedUnavailable = unavailable + conservativeDiscovered;
      const gatePopulation = boundedRows.length + unavailable;
      const estimateQuality: Record<string, number> = {};
      for (const row of boundedRows) {
        if (row.bestEstimateQuality) {
          estimateQuality[row.bestEstimateQuality] =
            (estimateQuality[row.bestEstimateQuality] ?? 0) + 1;
        }
      }
      return [
        origin.key,
        {
          origin: origin.label,
          total: destinations.length,
          routable: destinations.length - unsupported,
          bounded: boundedRows.length,
          boundedPlannable: boundedRows.length,
          unavailable,
          modeAuthorizedUnavailable,
          conservativeDiscovered,
          unsupported,
          gatePopulation,
          usablePct: gatePopulation
            ? Number(((boundedRows.length / gatePopulation) * 100).toFixed(2))
            : 0,
          estimateQuality,
        },
      ];
    }),
  );
}

describe("KAI-260 range-first benchmark", () => {
  it("applies the unchanged 90% gate only to the evidence-qualified population", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const first = runRangeBenchmark(destinations);
    const second = runRangeBenchmark(destinations);
    expect(second).toEqual(first);
    for (const origin of ORIGINS) {
      const row = first[origin.key];
      expect(
        row.boundedPlannable +
          row.unavailable +
          row.conservativeDiscovered +
          row.unsupported,
      ).toBe(row.total);
      expect(row.bounded).toBe(row.boundedPlannable);
      expect(row.modeAuthorizedUnavailable).toBe(
        row.unavailable + row.conservativeDiscovered,
      );
      expect(row.gatePopulation).toBe(row.boundedPlannable + row.unavailable);
      expect(row.gatePopulation).toBeGreaterThan(0);
      expect(row.usablePct).toBeGreaterThanOrEqual(90);
    }
    console.log(JSON.stringify(first, null, 2));
  });

  it("reports every bounded-to-unavailable regression for explicit justification", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const baseline = JSON.parse(
      fs.readFileSync(BASELINE_PATH, "utf8"),
    ) as Record<string, { boundedIds: readonly string[] }>;
    const current = classifyRangeDestinations(destinations);
    const transitions = findBoundedToUnavailableTransitions(baseline, current);
    const explicitJustifications: Record<string, string> = {};
    const unjustified = transitions.filter(
      (transition) =>
        !explicitJustifications[
          `${transition.origin}:${transition.destinationId}`
        ],
    );
    expect(unjustified, JSON.stringify(transitions, null, 2)).toEqual([]);
    for (const transition of transitions) {
      expect(
        explicitJustifications[
          `${transition.origin}:${transition.destinationId}`
        ],
      ).toMatch(/\S+/);
    }
    console.log(
      JSON.stringify(
        {
          baselineSourceHead: (baseline as { sourceHead?: string }).sourceHead,
          boundedToUnavailable: transitions,
          justified: explicitJustifications,
        },
        null,
        2,
      ),
    );
  });
});
