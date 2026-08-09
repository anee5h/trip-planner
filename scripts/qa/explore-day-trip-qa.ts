import type {
  RecommendationContext,
  TripDuration,
  TripMode,
} from "@/shared/services/recommendation/RecommendationContext";
import type { Destination } from "@/shared/types/destination";

// The recommendation graph imports Leaflet through the shared distance helper.
// Keep this report runnable from vite-node without changing production modules.
const { JSDOM } = await import("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const { getDestinationList } =
  await import("@/shared/services/destination/DestinationService");
const { calculateScore, getValidModes } =
  await import("@/shared/services/recommendation/RecommendationScorer");
const {
  estimateDayTripDuration,
  getDayTripTravelDurationEvidence,
  matchesPersonalizedDayTripDuration,
} = await import("@/shared/services/recommendation/TripDurationService");
const { resolveOriginTransportZone } =
  await import("@/shared/services/transport/TransportTopologyService");

const ALL_PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const catalog = getDestinationList("en") as Destination[];
const origins = [
  {
    label: "Nakayama / Yokohama",
    coordinates: { lat: 35.514745, lng: 139.539692 },
  },
  { label: "Tokyo", coordinates: { lat: 35.6812, lng: 139.7671 } },
  { label: "Osaka", coordinates: { lat: 34.6937, lng: 135.5023 } },
  { label: "Fukuoka", coordinates: { lat: 33.5902, lng: 130.4017 } },
] as const;
const requestedOrigin = process.env.EXPLORE_QA_ORIGIN;
const reportOrigins = requestedOrigin
  ? origins.filter((origin) => origin.label === requestedOrigin)
  : origins;

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthRadiusKm = 6371;
  const latitude = ((b.lat - a.lat) * Math.PI) / 180;
  const longitude = ((b.lng - a.lng) * Math.PI) / 180;
  const originLatitude = (a.lat * Math.PI) / 180;
  const destinationLatitude = (b.lat * Math.PI) / 180;
  const haversine =
    Math.sin(latitude / 2) ** 2 +
    Math.sin(longitude / 2) ** 2 *
      Math.cos(originLatitude) *
      Math.cos(destinationLatitude);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}
const cases = [
  { label: "Any trip + Recommended", mode: undefined, duration: "any" },
  { label: "Day trip + Any", mode: "day_trip", duration: "any" },
  { label: "Day trip + Short", mode: "day_trip", duration: "shortOuting" },
  { label: "Day trip + Half-day", mode: "day_trip", duration: "halfDay" },
  { label: "Day trip + Full-day", mode: "day_trip", duration: "fullDay" },
] as const satisfies readonly {
  label: string;
  mode: TripMode | undefined;
  duration: TripDuration;
}[];

type QaRow = {
  rank: number;
  destination: string;
  id: string;
  evidence: string;
  oneWay: string;
  visit: string;
  total: string;
  base: number;
  efficiency: number | null;
  final: number;
  distance: number;
};

function contextFor(
  origin: (typeof origins)[number],
  mode: TripMode | undefined,
  duration: TripDuration,
): RecommendationContext {
  return {
    vibe: "any",
    weather: { preferred: "any" },
    budgetTier: "standard",
    budget: 40000,
    carMode: "none",
    publicModes: ALL_PUBLIC_MODES,
    partySize: 2,
    currentWeatherCondition: "",
    currentWeather: null,
    visitedIds: [],
    homeStationCoords: origin.coordinates,
    originZoneId: resolveOriginTransportZone({
      coordinates: origin.coordinates,
    }),
    userRatings: {},
    tripDuration: duration,
    tripMode: mode,
  };
}

function rowFor(
  destination: Destination,
  context: RecommendationContext,
  final: number,
  rank: number,
  efficiency: number | null,
): QaRow {
  const origin = context.homeStationCoords!;
  const modes = getValidModes(
    destination,
    context.carMode,
    context.publicModes,
    origin,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );
  const evidence = getDayTripTravelDurationEvidence(
    destination,
    context,
    modes,
  );
  const estimate = estimateDayTripDuration(
    destination,
    { ...context, availableTimeHours: 14 },
    modes,
  );
  const range = evidence.estimate?.timeRange;
  const oneWay = range
    ? `${range[0]}–${range[1]}m (${Math.round((range[0] + range[1]) / 2)}m)`
    : "—";
  const visit = destination.recommendedVisitHours
    ? `${destination.recommendedVisitHours.min}–${destination.recommendedVisitHours.max}h`
    : "—";
  const distance = destination.coordinates
    ? distanceKm(origin, destination.coordinates)
    : Number.POSITIVE_INFINITY;

  return {
    rank,
    destination: destination.name,
    id: destination.id,
    evidence: evidence.evidence,
    oneWay,
    visit,
    total: estimate ? `${estimate.representativeHours.toFixed(1)}h` : "—",
    base: Number((final - (efficiency ?? 0)).toFixed(1)),
    efficiency: efficiency === null ? null : Number(efficiency.toFixed(1)),
    final: Number(final.toFixed(1)),
    distance,
  };
}

function eligibleForExplore(
  destination: Destination,
  context: RecommendationContext,
  before: boolean,
): boolean {
  if (
    before &&
    context.tripMode === "day_trip" &&
    context.tripDuration === "any"
  ) {
    return true;
  }
  if (context.tripMode !== "day_trip") return true;
  const modes = getValidModes(
    destination,
    context.carMode,
    context.publicModes,
    context.homeStationCoords ?? undefined,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );
  return (
    modes.length > 0 &&
    matchesPersonalizedDayTripDuration(
      destination,
      context,
      modes,
      context.tripDuration ?? "any",
    )
  );
}

function buildRows(
  origin: (typeof origins)[number],
  mode: TripMode | undefined,
  duration: TripDuration,
  before: boolean,
): QaRow[] {
  const context = contextFor(origin, mode, duration);
  const candidates = catalog.filter((destination) =>
    eligibleForExplore(destination, context, before),
  );
  const scored = candidates
    .map((destination) => {
      const baseScore = calculateScore(destination, {
        ...context,
        tripMode: undefined,
      });
      const afterScore = before
        ? undefined
        : calculateScore(destination, context);
      return {
        destination,
        finalScore: afterScore?.score ?? baseScore.score,
        efficiency: afterScore?.dayTripTravelEfficiency?.contribution ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        a.destination.id.localeCompare(b.destination.id),
    );

  return scored
    .slice(0, 10)
    .map(({ destination, finalScore, efficiency }, index) =>
      rowFor(destination, context, finalScore, index + 1, efficiency),
    );
}

function markdownRow(row: QaRow): string {
  return `| ${row.rank} | ${row.destination} | ${row.evidence} | ${row.oneWay} | ${row.visit} | ${row.total} | ${row.base.toFixed(1)} | ${row.efficiency === null ? "—" : row.efficiency.toFixed(1)} | ${row.final.toFixed(1)} |`;
}

function table(rows: QaRow[]): string {
  return [
    "| rank | destination | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |",
    "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(markdownRow),
  ].join("\n");
}

const output: string[] = [
  "# KAI-61 Explore Recommended QA",
  "",
  "Deterministic local catalogue output from the KAI-61 branch. All cases use `none` car mode, all public modes, party size 2, the Explorer's standard budget (40,000 JPY), and the listed origin coordinates.",
  "",
  "Travel efficiency: `-18 × (0.55 × travelShare + 0.45 × min(totalOuting / 14h, 1))²`. It is smooth, capped at -18, and is applied only to verified or bounded-estimated Day Trip evidence after the shared feasibility gate.",
  "",
];

for (const origin of reportOrigins) {
  output.push(`## ${origin.label}`, "");
  for (const qaCase of cases) {
    output.push(`### ${qaCase.label}`, "");
    const beforeRows = buildRows(origin, qaCase.mode, qaCase.duration, true);
    const afterRows = buildRows(origin, qaCase.mode, qaCase.duration, false);
    output.push(
      "#### Before",
      "",
      table(beforeRows),
      "",
      "#### After",
      "",
      table(afterRows),
      "",
    );
    if (
      origin.label === "Nakayama / Yokohama" &&
      qaCase.label === "Day trip + Any"
    ) {
      const abeno = catalog.find(
        (destination) => destination.id === "abeno-harukas-300-osaka",
      )!;
      const beforeRank =
        beforeRows.find((row) => row.id === abeno.id)?.rank ?? "not in top 10";
      const afterRank =
        afterRows.find((row) => row.id === abeno.id)?.rank ?? "not eligible";
      const context = contextFor(origin, qaCase.mode, qaCase.duration);
      const base = calculateScore(abeno, { ...context, tripMode: undefined });
      const after = calculateScore(abeno, context);
      const modes = getValidModes(
        abeno,
        context.carMode,
        context.publicModes,
        context.homeStationCoords ?? undefined,
        context.budgetTier,
        context.originZoneId,
        context.ferryTemporal,
      );
      const evidence = getDayTripTravelDurationEvidence(abeno, context, modes);
      output.push(
        "#### Abeno Harukas breakdown",
        "",
        `Before rank: **${beforeRank}** · after rank: **${afterRank}** · modes: ${modes.join(", ") || "none"} · evidence: **${evidence.evidence}**`,
        "",
        `| base/catalogue | existing transport | travel efficiency | final score |`,
        `| ---: | ---: | ---: | ---: |`,
        `| ${base.score.toFixed(1)} | ${base.bestModeScore.toFixed(1)} | ${after.dayTripTravelEfficiency?.contribution.toFixed(1) ?? "—"} | ${after.score.toFixed(1)} |`,
        "",
      );
    }
  }
}

output.push("## Nearest-only over-correction check", "");
for (const origin of reportOrigins) {
  for (const qaCase of cases.filter((item) => item.mode === "day_trip")) {
    const rows = buildRows(origin, qaCase.mode, qaCase.duration, false);
    const distances = rows.map((row) => row.distance);
    const inversions = distances.reduce(
      (count, distance, index) =>
        count +
        distances.slice(index + 1).filter((other) => other < distance).length,
      0,
    );
    output.push(
      `- ${origin.label} · ${qaCase.label}: ${inversions} distance inversions in the top 10 (${inversions === 0 ? "review for nearest-only dominance" : "not nearest-only"}).`,
    );
  }
}

console.log(output.join("\n"));
