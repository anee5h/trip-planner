import fs from "node:fs";
import path from "node:path";
import { calculateTripCost } from "../../src/shared/services/budget/tripCostEngine";
import { getValidModes } from "../../src/shared/services/recommendation/RecommendationScorer";
import type { Destination } from "../../src/shared/types/destination";

const INDEX_PATH = path.resolve(
  import.meta.dirname,
  "../../src/shared/data/destinations-index.json",
);
const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const PARTY_SIZE = 2;
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

type Result = ReturnType<typeof calculateTripCost>;
const PRIORITY = ["complete", "partial", "unavailable"] as const;

function bestResult(
  dest: Destination,
  coords: { lat: number; lng: number },
): Result {
  const validModes = getValidModes(
    dest,
    "none",
    PUBLIC_MODES,
    coords,
    "standard",
  );
  let best: Result | undefined;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const mode of validModes) {
    const result = calculateTripCost({
      dest,
      tripMode: "day_trip",
      partySize: PARTY_SIZE,
      nights: 0,
      includeOriginTravel: true,
      mode: mode ?? undefined,
      homeCoords: coords,
    });
    const index = PRIORITY.indexOf(
      result.completeness as (typeof PRIORITY)[number],
    );
    if (!best || (index >= 0 && index < bestIndex)) {
      best = result;
      bestIndex = index >= 0 ? index : bestIndex;
    }
    if (result.completeness === "complete") return result;
  }
  return (
    best ??
    calculateTripCost({
      dest,
      tripMode: "day_trip",
      partySize: PARTY_SIZE,
      nights: 0,
      includeOriginTravel: true,
      homeCoords: coords,
    })
  );
}

function scopes(result: Result): Set<string> {
  return new Set(
    result.components
      .filter((component) => component.cost.kind === "unavailable")
      .map((component) => component.evidence.scope),
  );
}

function main(): void {
  const destinations = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf8"),
  ) as Destination[];
  const report: Record<string, unknown> = {};
  for (const origin of ORIGINS) {
    const counts = {
      whole_trip_unavailable: 0,
      origin_route_only: 0,
      local_transport_only: 0,
      both_origin_and_local_transport: 0,
      other_component_blocker: 0,
    };
    for (const destination of destinations) {
      const result = bestResult(destination, origin.coords);
      if (result.completeness !== "unavailable") continue;
      counts.whole_trip_unavailable += 1;
      const unavailable = scopes(result);
      const originUnavailable = unavailable.has("origin_travel");
      const localUnavailable = unavailable.has("local_transport");
      if (originUnavailable && localUnavailable) {
        counts.both_origin_and_local_transport += 1;
      } else if (originUnavailable) {
        counts.origin_route_only += 1;
      } else if (localUnavailable) {
        counts.local_transport_only += 1;
      } else {
        counts.other_component_blocker += 1;
      }
    }
    report[origin.key] = {
      origin: origin.label,
      total: destinations.length,
      counts,
    };
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) main();

export { bestResult, scopes };
