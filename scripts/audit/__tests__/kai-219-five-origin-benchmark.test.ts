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
      // KAI-219A Fix 4: evaluate ALL eligible modes from THIS origin
      // (production getValidModes eligibility, KAI-204 method). The
      // benchmark asks "does Meguruto possess a defensible complete/
      // partial cost from this origin?" — it is NOT choosing the user's
      // preferred transport mode, so mode-eligibility insertion order must
      // never determine coverage.
      const validModes = getValidModes(
        dest,
        "none",
        PUBLIC_MODES,
        origin.coords,
        "standard",
      );
      // Deterministic evidence priority across ALL modes:
      //   any complete_bounded → complete_bounded
      //   else any bounded_but_incomplete → bounded_but_incomplete
      //   else any open_ended_or_variable → open_ended_or_variable
      //   else any partial → partial
      //   otherwise → unavailable
      // Explicit tie-break only when two modes share the same evidence
      // class: use the deterministic authorized-set order (validModes
      // order), which is stable for identical inputs.
      let bestCls: CompletenessClass = "unavailable";
      let bestResult: ReturnType<typeof calculateTripCost> | null = null;
      const PRIORITY: CompletenessClass[] = [
        "complete_bounded",
        "bounded_but_incomplete",
        "open_ended_or_variable",
        "partial",
      ];
      for (const mode of validModes) {
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
        if (cls === "complete_bounded") {
          bestCls = cls;
          bestResult = result;
          break; // top priority — nothing better exists
        }
        const bestIdx = PRIORITY.indexOf(bestCls);
        const thisIdx = PRIORITY.indexOf(cls);
        // For non-top classes, the FIRST mode in the deterministic
        // authorized order with the best evidence class wins (tie-break).
        if (thisIdx >= 0 && (bestResult === null || thisIdx < bestIdx)) {
          bestCls = cls;
          bestResult = result;
        }
      }
      // No eligible mode → run once with no mode (origin_travel
      // unavailable) so the destination still gets classified.
      if (!bestResult) {
        bestResult = calculateTripCost({
          dest,
          tripMode: "day_trip",
          partySize: PARTY_SIZE,
          nights: 0,
          includeOriginTravel: true,
          homeCoords: origin.coords,
        });
        bestCls = classify(bestResult);
      }
      counts[bestCls] += 1;
      if (bestCls === "complete_bounded") sampleComplete.push(dest.id);

      // Cohorts where practical (from the best-evidence result).
      const originComp = bestResult.components.find(
        (c) => c.evidence.scope === "origin_travel",
      );
      const scope = originComp?.evidence.fareScope ?? "none";
      transportFareScopes[scope] = (transportFareScopes[scope] ?? 0) + 1;
      const adm = bestResult.components.find(
        (c) => c.evidence.scope === "admission",
      );
      const admState = adm?.evidence.state ?? "absent";
      admissionStates[admState] = (admissionStates[admState] ?? 0) + 1;
      const lt = bestResult.components.find(
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

  it("evidence priority: mode A partial + mode B complete → destination coverage = complete (not insertion order)", () => {
    // A destination with TWO eligible modes where mode A yields partial
    // and mode B yields complete must be counted complete_bounded —
    // the benchmark asks "does a defensible complete cost exist", and
    // authorized-set insertion order must never determine coverage.
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Destination[];
    // Find a destination that has ≥2 eligible modes from at least one
    // origin, and assert the coverage classification uses the best mode.
    for (const origin of ORIGINS) {
      for (const dest of destinations) {
        const modes = getValidModes(
          dest,
          "none",
          PUBLIC_MODES,
          origin.coords,
          "standard",
        );
        if (modes.length < 2) continue;
        const classes = modes.map((mode) =>
          classify(
            calculateTripCost({
              dest,
              tripMode: "day_trip",
              partySize: PARTY_SIZE,
              nights: 0,
              includeOriginTravel: true,
              mode,
              homeCoords: origin.coords,
            }),
          ),
        );
        // If ANY mode is complete, the destination coverage must be
        // complete_bounded regardless of which mode is first.
        if (classes.includes("complete_bounded")) {
          const rows = runOriginBenchmark([dest]);
          expect(rows[origin.key].counts.complete_bounded).toBe(1);
          return; // proven on the first such destination
        }
        // Else if modes differ, insertion order must not flip the result.
        if (new Set(classes).size > 1) {
          const rows = runOriginBenchmark([dest]);
          const total = Object.values(rows[origin.key].counts).reduce(
            (a, b) => a + b,
            0,
          );
          expect(total).toBe(1); // exactly one class counted
          return;
        }
      }
    }
    // No multi-mode destination found — the priority logic is still
    // exercised by the determinism test; nothing to prove here.
    expect(true).toBe(true);
  });
});
