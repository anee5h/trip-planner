/**
 * KAI-219 — five-ORIGIN Budget v2 coverage benchmark (KAI-204 methodology).
 *
 * For each ORIGIN (Nakayama / Tokyo / Osaka / Hakata / Naha — the
 * canonical KAI-204 origin coordinates/context), applies that origin's
 * transport context across the ENTIRE catalogue and reports deterministic
 * Budget v2 trip-cost completeness counts. This answers:
 *
 *   "From Nakayama, how much of the catalogue has a complete / partial /
 *    unavailable Budget v2 trip cost?" (and likewise for the other four)
 *
 * Methodology (locked, KAI-219A review BLOCKER 1):
 *   - Origins are the KAI-204 five-origin diagnostic coordinates (NOT
 *     destination picks — this is NOT "Nakayama the destination").
 *   - For each origin × destination: production mode eligibility
 *     (getValidModes) with the origin homeCoords; the BEST eligible
 *     mode drives origin_travel; calculateTripCost runs the canonical
 *     day-trip context (partySize 2, includeOriginTravel true).
 *   - No mode manipulation to improve coverage.
 *
 * Deterministic: same catalogue → byte-identical output. Run twice.
 *
 *   npx vitest run scripts/audit/__tests__/kai-219-five-origin-benchmark.test.ts
 */
import { describe, expect, it } from "vitest";
import { calculateTripCost } from "@/shared/services/budget/tripCostEngine";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import type { Destination } from "@/shared/types/destination";
import * as fs from "node:fs";
import * as path from "node:path";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

/** Canonical KAI-204 five-origin transport context. */
const ORIGINS = [
  {
    key: "nakayama",
    label: "Nakayama Station, Kanagawa",
    coords: { lat: 35.5147, lng: 139.5393 },
  },
  {
    key: "tokyo",
    label: "Tokyo Station",
    coords: { lat: 35.6812, lng: 139.7671 },
  },
  {
    key: "osaka",
    label: "Osaka Station",
    coords: { lat: 34.7025, lng: 135.4959 },
  },
  {
    key: "hakata",
    label: "Hakata/Fukuoka Station",
    coords: { lat: 33.5902, lng: 130.4017 },
  },
  {
    key: "naha",
    label: "Naha Bus Terminal",
    coords: { lat: 26.2124, lng: 127.6809 },
  },
] as const;

const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const PARTY_SIZE = 2;

export type CompletenessClass =
  | "complete_bounded"
  | "bounded_but_incomplete"
  | "partial"
  | "open_ended_or_variable"
  | "unavailable";

function classify(
  result: ReturnType<typeof calculateTripCost>,
): CompletenessClass {
  if (result.completeness === "complete") return "complete_bounded";
  if (result.completeness === "unavailable") return "unavailable";
  // partial: distinguish bounded-but-incomplete (all required components
  // bounded but a bounded origin has a non-complete fare scope) from a
  // partial caused by open_ended/variable/unavailable components.
  const allBounded = result.components.every(
    (c) => c.cost.kind === "bounded" || c.cost.kind === "not_applicable",
  );
  const hasOpenEndedOrVariable = result.components.some(
    (c) => c.cost.kind === "open_ended" || c.cost.kind === "variable",
  );
  if (allBounded) return "bounded_but_incomplete";
  if (hasOpenEndedOrVariable) return "open_ended_or_variable";
  return "partial";
}

export function runOriginBenchmark(destinations: Destination[]) {
  const rows: Record<
    string,
    {
      origin: string;
      total: number;
      counts: Record<CompletenessClass, number>;
      transportFareScopes: Record<string, number>;
      admissionStates: Record<string, number>;
      localTransportKinds: Record<string, number>;
      sampleComplete: string[];
    }
  > = {};

  for (const origin of ORIGINS) {
    const counts: Record<CompletenessClass, number> = {
      complete_bounded: 0,
      bounded_but_incomplete: 0,
      partial: 0,
      open_ended_or_variable: 0,
      unavailable: 0,
    };
    const transportFareScopes: Record<string, number> = {};
    const admissionStates: Record<string, number> = {};
    const localTransportKinds: Record<string, number> = {};
    const sampleComplete: string[] = [];

    for (const dest of destinations) {
      // Production mode eligibility from THIS origin (KAI-204 method).
      const validModes = getValidModes(
        dest,
        "none",
        PUBLIC_MODES,
        origin.coords,
        "standard",
      );
      const mode = validModes[0]; // best eligible; none → no origin travel
      const result = calculateTripCost({
        dest,
        tripMode: "day_trip",
        partySize: PARTY_SIZE,
        nights: 0,
        includeOriginTravel: true,
        mode: mode ?? undefined,
        homeCoords: origin.coords,
      });
      const cls = classify(result);
      counts[cls] += 1;
      if (cls === "complete_bounded") sampleComplete.push(dest.id);

      // Cohorts where practical.
      const originComp = result.components.find(
        (c) => c.evidence.scope === "origin_travel",
      );
      const scope = originComp?.evidence.fareScope ?? "none";
      transportFareScopes[scope] = (transportFareScopes[scope] ?? 0) + 1;
      const adm = result.components.find(
        (c) => c.evidence.scope === "admission",
      );
      const admState = adm?.evidence.state ?? "absent";
      admissionStates[admState] = (admissionStates[admState] ?? 0) + 1;
      const lt = result.components.find(
        (c) => c.evidence.scope === "local_transport",
      );
      const ltKind = dest.localTransport?.kind ?? "absent";
      localTransportKinds[ltKind] = (localTransportKinds[ltKind] ?? 0) + 1;
    }

    rows[origin.key] = {
      origin: origin.label,
      total: destinations.length,
      counts,
      transportFareScopes,
      admissionStates,
      localTransportKinds,
      sampleComplete: sampleComplete.slice(0, 10),
    };
  }
  return rows;
}

describe("KAI-219 five-ORIGIN Budget v2 coverage baseline", () => {
  it("derives deterministic origin-based completeness across the catalogue", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    const rows = runOriginBenchmark(destinations);
    // Every origin row covers the full catalogue.
    for (const origin of ORIGINS) {
      const total = Object.values(rows[origin.key].counts).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBe(destinations.length);
    }
    // Deterministic: run twice → identical.
    expect(runOriginBenchmark(destinations)).toEqual(rows);
    // Baseline evidence (printed for the PR table).
    console.log(JSON.stringify(rows, null, 2));
  });
});
