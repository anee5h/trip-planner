/**
 * KAI-57 — Tohoku recommendation QA audit.
 *
 * Deterministic audit of how the KAI-57 Tohoku expansion affects discovery
 * and recommendations, per the KAI-57 ticket Phase 17.
 *
 * Origins: Sendai, Tokyo, Yokohama, Osaka, Fukuoka, Sapporo.
 * Durations: short outing, half day, full day.
 *
 * Checks:
 *   - isolated POIs ranking above their destination hub (same municipality);
 *   - far-away Tohoku POIs appearing as absurd short outings / day trips
 *     (travel envelope violated);
 *   - missing travel evidence treated as fast travel;
 *   - duplicate destination cards in one result set;
 *   - one city monopolizing the Tohoku slice of results.
 *
 * Run: tsx scripts/qa/kai-57-recommendation-audit.ts
 */

import { JSDOM } from "jsdom";
import type { Destination } from "../../src/shared/types/destination";
import type {
  RecommendationContext,
  TripDuration,
} from "../../src/shared/services/recommendation/RecommendationContext";

const dom = new JSDOM("", { url: "http://localhost" });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: dom.window,
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: dom.window.document,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const { getDestinationList } =
  await import("../../src/shared/services/destination/DestinationService");
const { getRecommendations, getValidModes } =
  await import("../../src/shared/services/recommendation/RecommendationService");
const { deriveTripDates } =
  await import("../../src/shared/services/recommendation/TravelConditions");
const { resolveOriginTransportZone } =
  await import("../../src/shared/services/transport/TransportTopologyService");
const { getOriginAwareTransportEstimate } =
  await import("../../src/shared/services/transport/OriginAwareTransportService");

const ALL_PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const QA_TRAVEL_DATE = "2026-08-15";

interface OriginCase {
  label: string;
  coordinates: { lat: number; lng: number };
}

const ORIGINS: Record<string, OriginCase> = {
  sendai: { label: "Sendai Station", coordinates: { lat: 38.2601, lng: 140.882 } },
  tokyo: { label: "Tokyo Station", coordinates: { lat: 35.6812, lng: 139.7671 } },
  yokohama: { label: "Yokohama Station", coordinates: { lat: 35.4662, lng: 139.6227 } },
  osaka: { label: "Osaka Station", coordinates: { lat: 34.7025, lng: 135.4959 } },
  fukuoka: { label: "Hakata Station", coordinates: { lat: 33.5902, lng: 130.4207 } },
  sapporo: { label: "Sapporo Station", coordinates: { lat: 43.0687, lng: 141.3508 } },
};

const DURATIONS: TripDuration[] = ["shortOuting", "halfDay", "fullDay"];

const destinations = getDestinationList("en") as Destination[];
const byId = new Map(destinations.map((d) => [d.id, d]));

const TOHOKU_PREFECTURES = new Set([
  "Aomori",
  "Iwate",
  "Miyagi",
  "Akita",
  "Yamagata",
  "Fukushima",
]);

function contextFor(
  origin: OriginCase,
  tripDuration: TripDuration,
): RecommendationContext {
  return {
    vibe: "any",
    budget: 40000,
    budgetTier: "standard",
    carMode: "none",
    publicModes: [...ALL_PUBLIC_MODES],
    partySize: 2,
    destinationWeather: { preferred: "any" },
    visitedIds: [],
    homeStationCoords: origin.coordinates,
    originZoneId: resolveOriginTransportZone({
      coordinates: origin.coordinates,
      label: origin.label,
    }),
    travelDates: deriveTripDates(QA_TRAVEL_DATE, "day_trip"),
    tripDuration,
    tripMode: "day_trip",
  };
}

interface Finding {
  severity: "error" | "warning";
  scenario: string;
  check: string;
  detail: string;
}

const findings: Finding[] = [];
const summary: string[] = [];

function addFinding(
  severity: "error" | "warning",
  scenario: string,
  check: string,
  detail: string,
) {
  findings.push({ severity, scenario, check, detail });
}

for (const [originKey, origin] of Object.entries(ORIGINS)) {
  for (const duration of DURATIONS) {
    const scenario = `${originKey}/${duration}`;
    const context = contextFor(origin, duration);
    const results = getRecommendations(destinations, context);
    const tohokuResults = results.filter(
      (r) =>
        TOHOKU_PREFECTURES.has(byId.get(r.id)?.prefecture ?? "") ||
        byId.get(r.id)?.region === "Tohoku",
    );
    const top = results.slice(0, 15);

    // 1. duplicate cards
    const seen = new Set<string>();
    for (const r of results) {
      if (seen.has(r.id)) {
        addFinding("error", scenario, "duplicate-card", `id ${r.id} appears more than once`);
      }
      seen.add(r.id);
    }

    // 2. isolated POI above its hub (same municipality)
    for (const r of tohokuResults) {
      const dest = byId.get(r.id);
      if (!dest) continue;
      const parentId = dest.relationships?.parentDestinationId;
      if (!parentId) continue;
      const rank = results.findIndex((x) => x.id === r.id);
      const parentRank = results.findIndex((x) => x.id === parentId);
      if (parentRank === -1 && rank < 10) {
        addFinding(
          "warning",
          scenario,
          "isolated-poi-above-hub",
          `${r.id} ranks #${rank + 1} but its hub ${parentId} is not in the result set`,
        );
      } else if (parentRank !== -1 && rank < parentRank && rank < 8) {
        addFinding(
          "warning",
          scenario,
          "poi-above-hub",
          `${r.id} ranks #${rank + 1} above its hub ${parentId} (#${parentRank + 1})`,
        );
      }
    }

    // 3. far-away Tohoku POIs in short durations: use the origin-aware travel
    //    estimate; flag only when travel time exceeds the duration envelope.
    const DURATION_ENVELOPE_MIN: Record<string, number> = {
      shortOuting: 90,
      halfDay: 240,
      fullDay: 480,
    };
    const envelope = DURATION_ENVELOPE_MIN[duration];
    if (envelope) {
      for (const r of tohokuResults) {
        const dest = byId.get(r.id);
        if (!dest) continue;
        if (dest.municipalityId?.split(":")[0] === originKey) continue;
        const modes = getValidModes(
          dest,
          context.carMode,
          context.publicModes,
          context.homeStationCoords ?? undefined,
          context.budgetTier,
          context.originZoneId,
        );
        const estimate = getOriginAwareTransportEstimate(
          dest,
          {
            homeStationCoords: context.homeStationCoords,
            originZoneId: context.originZoneId,
          },
          modes,
        );
        if (!estimate) {
          // No origin-aware evidence at all — flag as possible fast-travel
          // fallback when the record ranks high in a short duration.
          const rank = results.findIndex((x) => x.id === r.id);
          if (rank < 8) {
            addFinding(
              "warning",
              scenario,
              "missing-travel-evidence",
              `${r.id} (${dest.prefecture}) ranks #${rank + 1} with no origin-aware travel estimate`,
            );
          }
          continue;
        }
        const minutes = estimate.travelDurationMinutes ?? Infinity;
        if (minutes > envelope) {
          addFinding(
            "warning",
            scenario,
            "travel-exceeds-envelope",
            `${r.id} (${dest.prefecture}) needs ~${minutes} min travel but appears in a ${duration} (envelope ${envelope} min)`,
          );
        }
      }
    }

    // 4. one municipality monopolizing the Tohoku slice
    const tohokuTop = tohokuResults.slice(0, 6);
    if (tohokuTop.length >= 4) {
      const muniCounts = new Map<string, number>();
      for (const r of tohokuTop) {
        const muni = byId.get(r.id)?.municipalityId ?? "unknown";
        muniCounts.set(muni, (muniCounts.get(muni) ?? 0) + 1);
      }
      for (const [muni, count] of muniCounts) {
        if (count >= Math.ceil(tohokuTop.length * 0.7)) {
          addFinding(
            "warning",
            scenario,
            "one-city-monopoly",
            `${muni} holds ${count}/${tohokuTop.length} of the top Tohoku results`,
          );
        }
      }
    }

    const tohokuSummary = tohokuResults
      .slice(0, 5)
      .map((r) => `${r.id}(${byId.get(r.id)?.prefecture ?? "?"})`)
      .join(", ");
    summary.push(
      `## ${scenario}\n- results=${results.length} tohokuTop=${tohokuResults.length}\n- topTohoku=${tohokuSummary || "none"}`,
    );
  }
}

const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");

console.log("# KAI-57 recommendation QA");
console.log(`catalogue=${destinations.length} findings=${findings.length} (${errors.length} errors, ${warnings.length} warnings)`);
console.log("");
for (const f of findings) {
  console.log(`[${f.severity}] ${f.scenario} ${f.check}: ${f.detail}`);
}
console.log("");
console.log(summary.join("\n"));
