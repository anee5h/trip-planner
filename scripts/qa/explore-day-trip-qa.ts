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
  getDayTripAvailableTimeHours,
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
  mode: string;
  evidence: string;
  oneWay: string;
  visit: string;
  total: string;
  catalogue: number;
  modeBudget: number;
  modeTransport: number;
  efficiency: number | null;
  modeTotal: number;
  final: number;
  distance: number;
};

type ScoreResult = ReturnType<
  (typeof import("@/shared/services/recommendation/RecommendationScorer"))["calculateScore"]
>;

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
  scoreResult: ScoreResult,
  rank: number,
): QaRow {
  const origin = context.homeStationCoords!;
  const mode = scoreResult.bestMode;
  const modeBreakdown = mode ? scoreResult.modeScoreBreakdown[mode] : undefined;
  const evidence = mode
    ? getDayTripTravelDurationEvidence(destination, context, [mode])
    : { evidence: "unknown" as const };
  const availableTimeHours =
    getDayTripAvailableTimeHours(context.tripDuration ?? "any") ?? 14;
  const estimate = estimateDayTripDuration(
    destination,
    { ...context, availableTimeHours },
    mode ? [mode] : [],
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
    mode: mode ?? "—",
    evidence: evidence.evidence,
    oneWay,
    visit,
    total: estimate ? `${estimate.representativeHours.toFixed(1)}h` : "—",
    catalogue: Number(
      (scoreResult.score - (modeBreakdown?.total ?? 0)).toFixed(1),
    ),
    modeBudget: Number((modeBreakdown?.budget ?? 0).toFixed(1)),
    modeTransport: Number((modeBreakdown?.transport ?? 0).toFixed(1)),
    efficiency:
      modeBreakdown?.travelEfficiency === undefined
        ? null
        : Number(modeBreakdown.travelEfficiency.toFixed(1)),
    modeTotal: Number((modeBreakdown?.total ?? 0).toFixed(1)),
    final: Number(scoreResult.score.toFixed(1)),
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
      const beforeScore = calculateScore(destination, {
        ...context,
        tripMode: undefined,
      });
      const scoreResult = before
        ? beforeScore
        : calculateScore(destination, context);
      return {
        destination,
        scoreResult,
      };
    })
    .sort(
      (a, b) =>
        b.scoreResult.score - a.scoreResult.score ||
        a.destination.id.localeCompare(b.destination.id),
    );

  return scored
    .slice(0, 10)
    .map(({ destination, scoreResult }, index) =>
      rowFor(destination, context, scoreResult, index + 1),
    );
}

function markdownRow(row: QaRow): string {
  return `| ${row.rank} | ${row.destination} | ${row.mode} | ${row.evidence} | ${row.oneWay} | ${row.visit} | ${row.total} | ${row.catalogue.toFixed(1)} | ${row.modeBudget.toFixed(1)} | ${row.modeTransport.toFixed(1)} | ${row.efficiency === null ? "—" : row.efficiency.toFixed(1)} | ${row.modeTotal.toFixed(1)} | ${row.final.toFixed(1)} |`;
}

function table(rows: QaRow[]): string {
  return [
    "| rank | destination | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(markdownRow),
  ].join("\n");
}

function breakdownRow(label: string, row: QaRow): string {
  return `| ${label} | ${row.mode} | ${row.evidence} | ${row.oneWay} | ${row.visit} | ${row.total} | ${row.catalogue.toFixed(1)} | ${row.modeBudget.toFixed(1)} | ${row.modeTransport.toFixed(1)} | ${row.efficiency === null ? "—" : row.efficiency.toFixed(1)} | ${row.modeTotal.toFixed(1)} | ${row.final.toFixed(1)} |`;
}

const output: string[] = [
  "# KAI-61 Explore Recommended QA",
  "",
  "Deterministic local catalogue output from the KAI-61 branch. All cases use `none` car mode, all public modes, party size 2, the Explorer's standard budget (40,000 JPY), and the listed origin coordinates.",
  "",
  "Travel efficiency: `-24 × (0.6 × travelShare + 0.4 × min(roundTripTravel / selectedEnvelope, 1))`. It uses travel burden only (not visit-duration utilization), is bounded and smooth, and is applied per usable transport mode after the shared feasibility gate. Envelopes: Short 4h, Half-day 7.5h, Full-day/Any 14h. The cap stays below the existing +25 explicit-interest boost.",
  "",
];

output.push(
  "## Formula calibration samples",
  "",
  "The cap is 24 points: it is large enough to separate a near route from a day-trip edge case, but remains below the existing +25 explicit-interest boost. The two inputs are travel-only: share of the resulting outing spent travelling and round-trip travel against the selected envelope.",
  "",
  "| origin | duration | destination | selected mode | evidence | one-way midpoint | travel hours | travel share | envelope share | catalogue | mode budget | mode transport | efficiency | final |",
  "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const sample of [
  {
    origin: "Nakayama / Yokohama",
    duration: "any" as const,
    id: "odawara-city",
  },
  {
    origin: "Nakayama / Yokohama",
    duration: "any" as const,
    id: "takachiho-gorge",
  },
  { origin: "Fukuoka", duration: "fullDay" as const, id: "fukuoka-city" },
  { origin: "Fukuoka", duration: "fullDay" as const, id: "beppu-city" },
  { origin: "Tokyo", duration: "fullDay" as const, id: "enoshima-island" },
] as const) {
  const origin = origins.find((candidate) => candidate.label === sample.origin);
  if (!origin || !reportOrigins.includes(origin)) continue;
  const destination = catalog.find((candidate) => candidate.id === sample.id);
  if (!destination) continue;
  const context = contextFor(origin, "day_trip", sample.duration);
  const result = calculateScore(destination, context);
  const efficiency = result.dayTripTravelEfficiency;
  const mode = result.bestMode ?? "—";
  const modeScore = mode === "—" ? undefined : result.modeScoreBreakdown[mode];
  const estimate = efficiency?.travelEstimate.timeRange;
  const oneWay = estimate
    ? `${estimate[0]}–${estimate[1]}m (${efficiency?.oneWayMinutes}m)`
    : "—";
  output.push(
    `| ${sample.origin} | ${sample.duration} | ${destination.name} | ${mode} | ${efficiency?.evidence ?? "unknown"} | ${oneWay} | ${efficiency?.travelHours.toFixed(1) ?? "—"} | ${efficiency?.travelShare.toFixed(2) ?? "—"} | ${efficiency?.travelEnvelopeShare.toFixed(2) ?? "—"} | ${(result.score - (modeScore?.total ?? 0)).toFixed(1)} | ${modeScore?.budget.toFixed(1) ?? "—"} | ${modeScore?.transport.toFixed(1) ?? "—"} | ${efficiency?.contribution.toFixed(1) ?? "—"} | ${result.score.toFixed(1)} |`,
  );
}
output.push("");
output.push(
  "## Transport coverage notes",
  "",
  "- Nakayama / Yokohama → Abeno Harukas has authorized train/shinkansen selections but no origin-aware evidence in the current registry. It is therefore excluded from personalized Day Trip results; the catalogue-only Any view remains unchanged.",
  "- Nakayama / Yokohama → Takachiho has a verified flight path (277–317 minutes one way; 12.2h conservative total outing for Day Trip Any). Its -18.5 efficiency contribution plus mode budget keeps it out of the generic top ten; no route is fabricated.",
  "- Fukuoka Full-day → Osaka City and Kyoto City have no usable origin-aware evidence for the selected matrix modes, so they are excluded as unknown rather than ranked from legacy transportOptions. This is a transport-coverage gap, not a scoring override.",
  "",
);

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
      const beforeContext = { ...context, tripMode: undefined };
      const before = calculateScore(abeno, beforeContext);
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
      const beforeDetail = rowFor(abeno, beforeContext, before, 0);
      const afterDetail = rowFor(abeno, context, after, 0);
      output.push(
        "#### Abeno Harukas breakdown",
        "",
        `Before rank: **${beforeRank}** · after rank: **${afterRank}** · authorized selected modes: ${modes.join(", ") || "none"}. After eligibility is governed by the shared Day Trip gate; unknown personalized travel is not selectable.`,
        "",
        "| state | selected mode | evidence | one-way range (midpoint) | visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        breakdownRow("before", beforeDetail),
        breakdownRow("after", afterDetail),
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
