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

export interface RangeBenchmarkRow {
  origin: string;
  total: number;
  routable: number;
  bounded: number;
  unavailable: number;
  usablePct: number;
  estimateQuality: Record<string, number>;
}

export function runRangeBenchmark(
  destinations: Destination[],
): Record<string, RangeBenchmarkRow> {
  return Object.fromEntries(
    ORIGINS.map((origin) => {
      let routable = 0;
      let bounded = 0;
      let unavailable = 0;
      const estimateQuality: Record<string, number> = {};
      for (const dest of destinations) {
        const modes = getValidModes(
          dest,
          "none",
          PUBLIC_MODES,
          origin.coords,
          "standard",
        );
        if (modes.length === 0) continue;
        routable += 1;
        let best: ReturnType<typeof calculateTripEstimate> | undefined;
        for (const mode of modes) {
          const estimate = calculateTripEstimate({
            dest,
            mode,
            partySize: 2,
            tripMode: "day_trip",
            includeOriginTravel: true,
            homeCoords: origin.coords,
          });
          if (estimate.total && (!best || estimate.total.max < best.total!.max))
            best = estimate;
        }
        if (!best) {
          unavailable += 1;
          continue;
        }
        bounded += 1;
        estimateQuality[best.estimateQuality] =
          (estimateQuality[best.estimateQuality] ?? 0) + 1;
      }
      return [
        origin.key,
        {
          origin: origin.label,
          total: destinations.length,
          routable,
          bounded,
          unavailable,
          usablePct: routable
            ? Number(((bounded / routable) * 100).toFixed(2))
            : 0,
          estimateQuality,
        },
      ];
    }),
  );
}

describe("KAI-260 range-first benchmark", () => {
  it("reports deterministic bounded traveller ranges for all five origins", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const first = runRangeBenchmark(destinations);
    const second = runRangeBenchmark(destinations);
    expect(second).toEqual(first);
    for (const origin of ORIGINS) {
      const row = first[origin.key];
      expect(row.routable + row.unavailable).toBeLessThanOrEqual(row.total);
      expect(row.bounded).toBeLessThanOrEqual(row.routable);
      expect(row.routable).toBeGreaterThan(0);
      expect(row.usablePct).toBeGreaterThanOrEqual(90);
    }
    console.log(JSON.stringify(first, null, 2));
  });
});
