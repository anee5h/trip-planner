/**
 * KAI-31 temporary recommendation QA: Shikoku catalogue before/after.
 * Usage: npx vite-node scripts/qa/kai31-shikoku-qa.ts  (run in both worktrees)
 * Reports every Shikoku-region candidate in the top 25 for each origin×duration,
 * with travel evidence, so catalogue effects are visible.
 */
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
const { getDayTripTravelDurationEvidence, matchesPersonalizedDayTripDuration } =
  await import("@/shared/services/recommendation/TripDurationService");
const { resolveOriginTransportZone } =
  await import("@/shared/services/transport/TransportTopologyService");

const ALL_PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const catalog = getDestinationList("en");

const ORIGINS = [
  { label: "Takamatsu", coordinates: { lat: 34.3428, lng: 134.0465 } },
  { label: "Matsuyama", coordinates: { lat: 33.8392, lng: 132.7656 } },
  { label: "Kochi", coordinates: { lat: 33.5597, lng: 133.5311 } },
  { label: "Tokyo", coordinates: { lat: 35.6812, lng: 139.7671 } },
  { label: "Osaka", coordinates: { lat: 34.6937, lng: 135.5023 } },
];

const CASES = [
  { label: "Day Trip + Any", mode: "day_trip", duration: "any" },
  { label: "Day Trip + Half-day", mode: "day_trip", duration: "halfDay" },
  { label: "Day Trip + Full-day", mode: "day_trip", duration: "fullDay" },
  { label: "2D1N", mode: "weekend_2d1n", duration: "weekend" },
];

function contextFor(origin, mode, duration) {
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

function eligible(dest, ctx) {
  if (ctx.tripMode !== "day_trip") return true;
  const modes = getValidModes(
    dest,
    ctx.carMode,
    ctx.publicModes,
    ctx.homeStationCoords ?? undefined,
    ctx.budgetTier,
    ctx.originZoneId,
    ctx.ferryTemporal,
  );
  return (
    modes.length > 0 &&
    matchesPersonalizedDayTripDuration(
      dest,
      ctx,
      modes,
      ctx.tripDuration ?? "any",
    )
  );
}

function shikokuRows(origin, qcase) {
  const ctx = contextFor(origin, qcase.mode, qcase.duration);
  const scored = catalog
    .filter((d) => eligible(d, ctx))
    .map((d) => {
      const r = calculateScore(d, ctx);
      return { d, r };
    })
    .sort((a, b) => b.r.score - a.r.score || a.d.id.localeCompare(b.d.id));
  const ranked = scored.map((x, i) => ({ ...x, rank: i + 1 }));
  return ranked
    .filter((x) => x.d.region === "Shikoku" && x.rank <= 25)
    .map((x) => {
      const mode = x.r.bestMode;
      const evidence = mode
        ? getDayTripTravelDurationEvidence(x.d, ctx, [mode])
        : { evidence: "unknown" };
      const range = evidence.estimate?.timeRange;
      return {
        rank: x.rank,
        id: x.d.id,
        name: x.d.name,
        mode: mode ?? "—",
        evidence: evidence.evidence,
        oneWay: range ? `${range[0]}–${range[1]}m` : "—",
        score: x.r.score.toFixed(1),
      };
    });
}

console.log(`# KAI-31 Shikoku rec QA · ${catalog.length} destinations`);
console.log(
  "Shikoku total:",
  catalog.filter((d) => d.region === "Shikoku").length,
);
for (const origin of ORIGINS) {
  for (const qcase of CASES) {
    const rows = shikokuRows(origin, qcase);
    console.log(
      `\n## ${origin.label} · ${qcase.label} (${rows.length} Shikoku in top25)`,
    );
    for (const r of rows) {
      console.log(
        `  #${String(r.rank).padStart(2)} ${r.id.padEnd(34)} ${r.mode.padEnd(5)} ${r.evidence.padEnd(12)} oneWay=${r.oneWay.padEnd(10)} score=${r.score}`,
      );
    }
  }
}
