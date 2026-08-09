import { JSDOM } from "jsdom";
import type { Destination } from "../../src/shared/types/destination";
import type { BudgetTier } from "../../src/shared/types/planner";
import type {
  RecommendationContext,
  TripDuration,
  TripMode,
} from "../../src/shared/services/recommendation/RecommendationContext";
import type { PipelineRecommendation } from "../../src/shared/services/recommendation/RecommendationTypes";

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
const { getEstimatedBudgetRange } =
  await import("../../src/shared/services/budget/BudgetService");
const {
  getOriginAwareTransportEstimate,
}: {
  getOriginAwareTransportEstimate: typeof import("../../src/shared/services/transport/OriginAwareTransportService").getOriginAwareTransportEstimate;
} =
  await import("../../src/shared/services/transport/OriginAwareTransportService");
type OriginAwareTransportEstimate =
  import("../../src/shared/services/transport/OriginAwareTransportService").OriginAwareTransportEstimate;
type TravelDurationEstimate =
  import("../../src/shared/services/transport/OriginAwareTransportService").TravelDurationEstimate;
const {
  resolveOriginTransportZone,
  resolveDestinationTransportZone,
  ISLAND_ZONE_IDS,
} =
  await import("../../src/shared/services/transport/TransportTopologyService");
const { deriveTripDates } =
  await import("../../src/shared/services/recommendation/TravelConditions");
const {
  getVisitBand,
  estimateDayTripDuration,
  estimateTripDuration,
  getDayTripTravelDurationEvidence,
} =
  await import("../../src/shared/services/recommendation/TripDurationService");
const { getRecommendations, getValidModes } =
  await import("../../src/shared/services/recommendation/RecommendationService");
const { resolveOriginMunicipalityId } =
  await import("../../src/shared/services/recommendation/OriginAreaService");
const { classifyWeekendResultCandidate } =
  await import("../../src/shared/services/recommendation/WeekendAreaPolicy");

type OriginKey =
  | "nakayama"
  | "shinYokohama"
  | "yokohama"
  | "tokyo"
  | "chiba"
  | "omiya"
  | "sapporo"
  | "fukuoka"
  | "wakayama";

interface OriginCase {
  label: string;
  coordinates: { lat: number; lng: number };
}

const ORIGINS: Record<OriginKey, OriginCase> = {
  nakayama: {
    label: "Nakayama Station, Kanagawa",
    coordinates: { lat: 35.514745, lng: 139.539692 },
  },
  shinYokohama: {
    label: "Shin-Yokohama Station, Kanagawa",
    coordinates: { lat: 35.5073, lng: 139.6172 },
  },
  yokohama: {
    label: "Yokohama Station, Kanagawa",
    coordinates: { lat: 35.466195, lng: 139.622704 },
  },
  tokyo: {
    label: "Tokyo Station, Tokyo",
    coordinates: { lat: 35.6812, lng: 139.7671 },
  },
  chiba: {
    label: "Chiba Station, Chiba",
    coordinates: { lat: 35.6131, lng: 140.1133 },
  },
  omiya: {
    label: "Omiya Station, Saitama",
    coordinates: { lat: 35.9063, lng: 139.6239 },
  },
  sapporo: {
    label: "Sapporo Station, Hokkaido",
    coordinates: { lat: 43.0687, lng: 141.3508 },
  },
  fukuoka: {
    label: "Fukuoka Station, Fukuoka",
    coordinates: { lat: 33.5902, lng: 130.4017 },
  },
  wakayama: {
    label: "Wakayama Station, Wakayama",
    coordinates: { lat: 34.2321, lng: 135.1909 },
  },
};

const ALL_PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"];
const QA_TRAVEL_DATE = "2026-08-15";
const QA_FERRY_TEMPORAL = {
  travelDate: new Date(2026, 7, 15, 12, 0, 0),
};

type Check =
  | { kind: "visitBand"; band: Exclude<TripDuration, "any" | "weekend"> }
  | { kind: "allowedModes"; modes: string[] }
  | { kind: "visitedExcluded" }
  | { kind: "weekendReady" }
  | { kind: "knownBudgetWithin" }
  | { kind: "unknownBudgetNotFictional" }
  | { kind: "transportConsistent" }
  | { kind: "homeCanonicalDisplay"; origins: OriginKey[] }
  | { kind: "dayTripFeasibility"; availableHours: number }
  | { kind: "mainlandOriginFallback"; availableHours: number }
  | {
      kind: "personalizedDayTrip";
      availableHours: number;
      excludedIds: string[];
    }
  | { kind: "uiVisitRange" }
  | { kind: "islandTopology" }
  | { kind: "reasonConsistent" }
  | { kind: "diverse" }
  | { kind: "rankingDiffers"; otherScenarioId: string }
  | { kind: "manual" };

interface Scenario {
  id: string;
  title: string;
  origin: OriginKey;
  tripMode?: TripMode;
  tripDuration?: TripDuration;
  budget?: number;
  budgetTier?: BudgetTier;
  carMode?: string;
  publicModes?: string[];
  vibe?: string;
  visitedIds?: string[];
  preferredWeather?: "any" | "rainy" | "hot" | "cold";
  travelDate?: string;
  accommodationAllowance?: number;
  topResults?: number;
  expected: string;
  subsystem: string;
  check: Check;
}

interface ScenarioResult {
  scenario: Scenario;
  context: RecommendationContext;
  results: PipelineRecommendation[];
  status: "PASS" | "FAIL" | "REVIEW";
  severity: "P1" | "P2" | "P3" | "P4" | "none";
  notes: string[];
}

const scenarios: Scenario[] = [
  {
    id: "F01",
    title: "Short outing visit-time filter",
    origin: "nakayama",
    tripDuration: "shortOuting",
    expected: "Every result has a published short-outing visit band.",
    subsystem: "filter / visit duration",
    check: { kind: "visitBand", band: "shortOuting" },
  },
  {
    id: "F02",
    title: "Half-day visit-time filter",
    origin: "nakayama",
    tripDuration: "halfDay",
    expected: "Every result has a published half-day visit band.",
    subsystem: "filter / visit duration",
    check: { kind: "visitBand", band: "halfDay" },
  },
  {
    id: "F03",
    title: "Full-day visit-time filter",
    origin: "nakayama",
    tripDuration: "fullDay",
    expected: "Every result has a published full-day visit band.",
    subsystem: "filter / visit duration",
    check: { kind: "visitBand", band: "fullDay" },
  },
  {
    id: "F04",
    title: "Visited destination exclusion",
    origin: "nakayama",
    visitedIds: ["yokohama-city", "tokyo-tower-tokyo"],
    expected: "Visited IDs never appear in recommendations.",
    subsystem: "visited state",
    check: { kind: "visitedExcluded" },
  },
  {
    id: "F06",
    title: "Origin baseline from Nakayama",
    origin: "nakayama",
    expected: "Baseline for comparison with Tokyo origin.",
    subsystem: "origin / ranking",
    check: { kind: "manual" },
  },
  {
    id: "F05",
    title: "Origin change from Nakayama to Tokyo",
    origin: "tokyo",
    expected:
      "Origin-aware eligibility and ranking change when the origin changes.",
    subsystem: "origin / ranking",
    check: { kind: "rankingDiffers", otherScenarioId: "F06" },
  },
  {
    id: "F07",
    title: "Nature preference",
    origin: "nakayama",
    vibe: "nature",
    expected:
      "Nature-tagged or mountain destinations are promoted and mismatches are penalized.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "F08",
    title: "History preference",
    origin: "nakayama",
    vibe: "history",
    expected:
      "History, shrine, temple, or historic-tagged destinations are promoted.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "F09",
    title: "Art preference",
    origin: "nakayama",
    vibe: "art",
    expected: "Museum and art destinations are promoted.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "F10",
    title: "Food preference",
    origin: "nakayama",
    vibe: "food",
    expected:
      "Food ratings affect order without admitting destinations solely through text matching.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "F11",
    title: "Sea preference",
    origin: "nakayama",
    vibe: "sea",
    expected: "Coast, sea, or beach destinations are promoted.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "F12",
    title: "Theme-park preference",
    origin: "tokyo",
    vibe: "themepark",
    expected:
      "Theme-park destinations are promoted and mismatches are penalized.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "F13",
    title: "Short outing total-feasibility probe",
    origin: "tokyo",
    tripDuration: "shortOuting",
    expected:
      "Known candidates should not require more than the UI's four-hour short-outing envelope.",
    subsystem: "filter / day-trip feasibility",
    check: { kind: "dayTripFeasibility", availableHours: 4 },
  },
  {
    id: "F14",
    title: "Half-day total-feasibility probe",
    origin: "tokyo",
    tripDuration: "halfDay",
    expected:
      "Known candidates should not exceed the UI's seven-and-a-half-hour half-day envelope.",
    subsystem: "filter / day-trip feasibility",
    check: { kind: "dayTripFeasibility", availableHours: 7.5 },
  },
  {
    id: "F15",
    title: "Visit-time filter versus visible range labels",
    origin: "tokyo",
    tripDuration: "halfDay",
    expected:
      "The half-day filter should align with the visible 4–7.5h time-at-destination label.",
    subsystem: "filter / UI semantics",
    check: { kind: "uiVisitRange" },
  },
  {
    id: "C01",
    title: "Chiba personalized short outing",
    origin: "chiba",
    tripDuration: "shortOuting",
    publicModes: ALL_PUBLIC_MODES,
    topResults: 10,
    expected:
      "Short outings from Chiba retain candidates with verified or bounded estimated travel that fit four hours; distant Aomori, Yamagata, Akita, and Kyoto candidates do not survive.",
    subsystem: "filter / personalized day-trip feasibility",
    check: {
      kind: "personalizedDayTrip",
      availableHours: 4,
      excludedIds: ["aomori-city", "yamagata-city", "akita-city", "kyoto-city"],
    },
  },
  {
    id: "C02",
    title: "Chiba personalized half-day",
    origin: "chiba",
    tripDuration: "halfDay",
    publicModes: ALL_PUBLIC_MODES,
    topResults: 10,
    expected:
      "Half-day recommendations from Chiba exclude infeasible Lake Tazawa and Yamadera-style destinations and retain only verified or bounded estimated travel within seven-and-a-half hours.",
    subsystem: "filter / personalized day-trip feasibility",
    check: {
      kind: "personalizedDayTrip",
      availableHours: 7.5,
      excludedIds: ["lake-tazawa-akita", "yamadera-yamagata"],
    },
  },
  {
    id: "C03",
    title: "Chiba personalized full-day",
    origin: "chiba",
    tripDuration: "fullDay",
    publicModes: ALL_PUBLIC_MODES,
    topResults: 10,
    expected:
      "Full-day recommendations from Chiba remain populated with sensible reachable destinations using verified or bounded estimated travel rather than fabricated duration values.",
    subsystem: "filter / personalized day-trip feasibility",
    check: {
      kind: "personalizedDayTrip",
      availableHours: 14,
      excludedIds: [
        "aomori-city",
        "yamagata-city",
        "akita-city",
        "kyoto-city",
        "lake-tazawa-akita",
        "yamadera-yamagata",
      ],
    },
  },
  {
    id: "C04",
    title: "Nakayama primary rail survives sparse registry coverage",
    origin: "nakayama",
    tripDuration: "shortOuting",
    publicModes: ["train", "shinkansen", "bus"],
    topResults: 10,
    expected:
      "A configured mainland origin with nearby destinations keeps a non-empty primary rail even when the verified registry has no Nakayama corridor; only bounded estimated ground evidence may fill that gap.",
    subsystem: "filter / personalized day-trip fallback",
    check: { kind: "mainlandOriginFallback", availableHours: 4 },
  },
  {
    id: "C05",
    title: "Sapporo primary rail survives sparse regional registry coverage",
    origin: "sapporo",
    tripDuration: "shortOuting",
    publicModes: ["train", "bus"],
    topResults: 10,
    expected:
      "A configured Hokkaido origin keeps a non-empty local primary rail when the verified registry lacks the corridor; only bounded same-zone estimated ground evidence may fill that gap.",
    subsystem: "filter / personalized day-trip fallback",
    check: { kind: "mainlandOriginFallback", availableHours: 4 },
  },
  {
    id: "T01",
    title: "All public transport",
    origin: "nakayama",
    publicModes: ALL_PUBLIC_MODES,
    expected: "Every returned candidate uses one of the selected public modes.",
    subsystem: "transport eligibility",
    check: { kind: "allowedModes", modes: ALL_PUBLIC_MODES },
  },
  {
    id: "T02",
    title: "Train-only transport",
    origin: "nakayama",
    publicModes: ["train"],
    expected:
      "No shinkansen, ferry, flight, bus, or car-only result is returned.",
    subsystem: "transport eligibility",
    check: { kind: "allowedModes", modes: ["train"] },
  },
  {
    id: "T03",
    title: "Flight-only transport",
    origin: "tokyo",
    budget: 150000,
    budgetTier: "luxury",
    publicModes: ["flight"],
    expected: "Only destinations with verified flight access are returned.",
    subsystem: "transport eligibility",
    check: { kind: "allowedModes", modes: ["flight"] },
  },
  {
    id: "T04",
    title: "Ferry-only transport",
    origin: "tokyo",
    publicModes: ["ferry"],
    travelDate: QA_TRAVEL_DATE,
    expected:
      "Only destinations with verified passenger-ferry access are returned.",
    subsystem: "transport topology / ferry",
    check: { kind: "allowedModes", modes: ["ferry"] },
  },
  {
    id: "T05",
    title: "Personal-car-only transport",
    origin: "nakayama",
    carMode: "my_car",
    publicModes: [],
    expected:
      "Only destinations with authorized road access are returned; public modes are not substituted.",
    subsystem: "transport eligibility",
    check: { kind: "allowedModes", modes: ["my_car"] },
  },
  {
    id: "T06",
    title: "Island topology under public transport",
    origin: "tokyo",
    publicModes: ALL_PUBLIC_MODES,
    travelDate: QA_TRAVEL_DATE,
    expected:
      "Island destinations use verified ferry or flight access, never fabricated rail access.",
    subsystem: "transport topology / islands",
    check: { kind: "islandTopology" },
  },
  {
    id: "T07",
    title: "Sparse-registry suburban origin",
    origin: "omiya",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Unknown origin-aware durations remain unknown and do not fall back to catalogue minutes.",
    subsystem: "travel-time fallback",
    check: { kind: "unknownBudgetNotFictional" },
  },
  {
    id: "T08",
    title: "Ferry-only reachable island",
    origin: "wakayama",
    publicModes: ["ferry"],
    travelDate: QA_TRAVEL_DATE,
    expected:
      "A verified passenger ferry route remains eligible without rail substitution.",
    subsystem: "transport topology / ferry",
    check: { kind: "allowedModes", modes: ["ferry"] },
  },
  {
    id: "TR01",
    title: "Origin-aware travel consistency",
    origin: "nakayama",
    publicModes: ["train", "shinkansen"],
    expected:
      "Pipeline travel estimate and derived duration use the same verified origin-aware estimate.",
    subsystem: "travel time",
    check: { kind: "transportConsistent" },
  },
  {
    id: "TR02",
    title: "Car duration remains explicitly unknown",
    origin: "nakayama",
    carMode: "my_car",
    publicModes: [],
    expected:
      "No verified car duration is invented from distance or catalogue transport minutes.",
    subsystem: "travel-time fallback",
    check: { kind: "transportConsistent" },
  },
  {
    id: "TR03",
    title: "Home card canonical duration consistency",
    origin: "nakayama",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Home shows the same shared verified/estimated/unknown travel evidence as Explore across unsupported and locally estimated corridors.",
    subsystem: "travel time / cross-surface consistency",
    check: {
      kind: "homeCanonicalDisplay",
      origins: ["nakayama", "shinYokohama", "chiba", "tokyo"],
    },
  },
  {
    id: "TR04",
    title: "Shin-Yokohama origin coverage",
    origin: "shinYokohama",
    publicModes: ["train", "shinkansen"],
    expected:
      "A suburban major-station origin uses canonical durations where registry evidence exists and leaves unsupported corridors unknown.",
    subsystem: "origin / travel-time coverage",
    check: { kind: "transportConsistent" },
  },
  {
    id: "B01",
    title: "Economy budget gate",
    origin: "nakayama",
    budget: 20000,
    budgetTier: "economy",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Known complete verified estimates do not exceed the selected budget.",
    subsystem: "budget filtering",
    check: { kind: "knownBudgetWithin" },
  },
  {
    id: "B02",
    title: "Very-low budget adversarial case",
    origin: "yokohama",
    budget: 10000,
    budgetTier: "economy",
    publicModes: ["train"],
    expected:
      "Known expensive train trips are excluded; unknown fares remain explicitly unknown.",
    subsystem: "budget filtering",
    check: { kind: "knownBudgetWithin" },
  },
  {
    id: "B03",
    title: "Flight unknown-fare handling",
    origin: "fukuoka",
    budget: 20000,
    budgetTier: "economy",
    publicModes: ["flight"],
    expected:
      "Unverified flight fares never become a verified zero-cost or falsely cheap result.",
    subsystem: "budget / unknown fare",
    check: { kind: "unknownBudgetNotFictional" },
  },
  {
    id: "B04",
    title: "Luxury budget keeps authorized options",
    origin: "tokyo",
    budget: 150000,
    budgetTier: "luxury",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Luxury mode does not remove candidates solely because the verified estimate exceeds a lower tier.",
    subsystem: "budget filtering",
    check: { kind: "manual" },
  },
  {
    id: "W01",
    title: "Weekend from Nakayama",
    origin: "nakayama",
    tripMode: "weekend_2d1n",
    budget: 100000,
    budgetTier: "comfortable",
    publicModes: ALL_PUBLIC_MODES,
    travelDate: QA_TRAVEL_DATE,
    accommodationAllowance: 25000,
    expected:
      "Results are coherent trip areas with enough activity and eligible travel for 2D1N.",
    subsystem: "weekend feasibility",
    check: { kind: "weekendReady" },
  },
  {
    id: "W02",
    title: "Weekend from Tokyo",
    origin: "tokyo",
    tripMode: "weekend_2d1n",
    budget: 100000,
    budgetTier: "comfortable",
    publicModes: ALL_PUBLIC_MODES,
    travelDate: QA_TRAVEL_DATE,
    accommodationAllowance: 25000,
    expected:
      "Long-distance but practical weekend destinations rank above local destinations without exceeding the travel envelope.",
    subsystem: "weekend ranking",
    check: { kind: "weekendReady" },
  },
  {
    id: "E01",
    title: "Recommendation reason consistency",
    origin: "nakayama",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Displayed fast-train reasons report the actual train estimate used for that destination.",
    subsystem: "explanation consistency",
    check: { kind: "reasonConsistent" },
  },
  {
    id: "E02",
    title: "Top-result diversity",
    origin: "nakayama",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Top results do not contain direct parent/child duplicates and remain meaningfully varied.",
    subsystem: "ranking / diversity",
    check: { kind: "diverse" },
  },
  {
    id: "R02",
    title: "History comparison for ranking response",
    origin: "nakayama",
    vibe: "history",
    publicModes: ALL_PUBLIC_MODES,
    expected: "Comparison baseline for the preference-change test.",
    subsystem: "ranking / personalization",
    check: { kind: "manual" },
  },
  {
    id: "R01",
    title: "Nature versus history ranking response",
    origin: "nakayama",
    vibe: "nature",
    publicModes: ALL_PUBLIC_MODES,
    expected:
      "Changing one meaningful preference changes ranking in a plausible direction.",
    subsystem: "ranking / personalization",
    check: { kind: "rankingDiffers", otherScenarioId: "R02" },
  },
];

const destinations = getDestinationList("en") as Destination[];

function contextFor(scenario: Scenario): RecommendationContext {
  const origin = ORIGINS[scenario.origin];
  const tripMode = scenario.tripMode ?? "day_trip";
  const travelDates = scenario.travelDate
    ? deriveTripDates(scenario.travelDate, tripMode)
    : undefined;
  return {
    vibe: scenario.vibe ?? "any",
    budget: scenario.budget ?? 40000,
    budgetTier: scenario.budgetTier ?? "standard",
    carMode: scenario.carMode ?? "none",
    publicModes: scenario.publicModes ?? ALL_PUBLIC_MODES,
    partySize: 2,
    destinationWeather: { preferred: scenario.preferredWeather ?? "any" },
    visitedIds: scenario.visitedIds ?? [],
    homeStationCoords: origin.coordinates,
    originZoneId: resolveOriginTransportZone({
      coordinates: origin.coordinates,
      label: origin.label,
    }),
    ferryTemporal: scenario.travelDate ? QA_FERRY_TEMPORAL : undefined,
    travelDates,
    tripDuration: scenario.tripDuration ?? "any",
    tripMode,
    accommodationAllowance: scenario.accommodationAllowance,
  };
}

function modesFor(destination: Destination, context: RecommendationContext) {
  return getValidModes(
    destination,
    context.carMode,
    context.publicModes,
    context.homeStationCoords ?? undefined,
    context.budgetTier,
    context.originZoneId,
    context.ferryTemporal,
  );
}

function estimateFor(
  destination: Destination,
  context: RecommendationContext,
  modes: readonly string[],
): OriginAwareTransportEstimate | null {
  return getOriginAwareTransportEstimate(
    destination,
    {
      homeStationCoords: context.homeStationCoords,
      originZoneId: context.originZoneId,
      ferryTemporal: context.ferryTemporal,
    },
    modes,
  );
}

function sharedDayTripTransport(
  destination: Destination,
  context: RecommendationContext,
) {
  return getDayTripTravelDurationEvidence(
    destination,
    context,
    modesFor(destination, context),
  );
}

function estimateMatches(
  left: TravelDurationEstimate | undefined,
  right: TravelDurationEstimate | undefined,
) {
  return Boolean(
    left &&
    right &&
    left.mode === right.mode &&
    left.evidence === right.evidence &&
    left.timeRange[0] === right.timeRange[0] &&
    left.timeRange[1] === right.timeRange[1],
  );
}

function budgetUsesOnlyVerifiedTravel(
  result: PipelineRecommendation,
  context: RecommendationContext,
) {
  const estimated = result.transportEstimate?.evidence === "estimated";
  if (!estimated) return true;
  const modes = modesFor(result, context);
  return modes.every((mode) => {
    const budget = getEstimatedBudgetRange(
      result,
      mode,
      context.partySize,
      context.budgetTier,
      context.homeStationCoords ?? undefined,
      context.ferryTemporal,
    );
    return !budget.transportIncluded && !budget.durationIncluded;
  });
}

function reasonCodes(result: PipelineRecommendation) {
  return result.match.reasons
    .slice(0, 4)
    .map((reason) => reason.code)
    .join(",");
}

function formatEstimate(estimate: TravelDurationEstimate | null | undefined) {
  if (!estimate) return "unknown";
  return `${estimate.evidence ?? "verified"}:${estimate.mode}:${estimate.timeRange[0]}-${estimate.timeRange[1]}m`;
}

function formatBudget(result: PipelineRecommendation) {
  if (!result.estimatedCostRange) return "unknown";
  const suffix = result.estimatedCostTransportIncluded
    ? "verified"
    : "transport-unknown";
  return `¥${result.estimatedCostRange[0]}-${result.estimatedCostRange[1]} (${suffix})`;
}

function formatResult(
  result: PipelineRecommendation,
  context: RecommendationContext,
) {
  const estimate =
    result.transportEstimate ??
    estimateFor(result, context, modesFor(result, context));
  return [
    result.id,
    JSON.stringify(result.name),
    result.bestTransportMode ?? "unknown",
    formatEstimate(estimate),
    formatBudget(result),
    reasonCodes(result),
  ].join(" | ");
}

function validate(
  scenario: Scenario,
  results: PipelineRecommendation[],
  allScenarioResults: Map<string, ScenarioResult>,
): Pick<ScenarioResult, "status" | "severity" | "notes"> {
  const notes: string[] = [];
  const fail = (note: string, severity: ScenarioResult["severity"] = "P2") => {
    notes.push(note);
    return { status: "FAIL" as const, severity, notes };
  };

  switch (scenario.check.kind) {
    case "visitBand": {
      const mismatches = results.filter(
        (result) => getVisitBand(result) !== scenario.check.band,
      );
      if (mismatches.length > 0) {
        return fail(
          `${mismatches.length} results do not match ${scenario.check.band}: ${mismatches
            .slice(0, 5)
            .map(
              (result) => `${result.id}=${getVisitBand(result) ?? "unknown"}`,
            )
            .join(", ")}`,
        );
      }
      notes.push(
        `All ${results.length} results match the published visit band.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "allowedModes": {
      const invalid: string[] = [];
      for (const result of results) {
        const modes = modesFor(result, contextFor(scenario));
        const best = result.bestTransportMode;
        if (
          modes.some((mode) => !scenario.check.modes.includes(mode)) ||
          (best !== undefined && !scenario.check.modes.includes(best))
        ) {
          invalid.push(`${result.id}[${modes.join(",")}]`);
        }
      }
      if (invalid.length > 0) {
        return fail(
          `Unexpected transport modes: ${invalid.slice(0, 8).join(", ")}`,
          "P1",
        );
      }
      notes.push(
        `All returned candidates stay within ${scenario.check.modes.join(", ") || "the selected car path"}.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "visitedExcluded": {
      const visited = new Set(scenario.visitedIds ?? []);
      const leaked = results.filter((result) => visited.has(result.id));
      if (leaked.length > 0)
        return fail(
          `Visited IDs leaked: ${leaked.map((r) => r.id).join(", ")}`,
          "P1",
        );
      notes.push(
        `Excluded ${[...(scenario.visitedIds ?? [])].join(", ")} from ${results.length} results.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "weekendReady": {
      if (results.length === 0) {
        notes.push(
          "No weekend candidates survived; this is conservative for unknown travel but requires coverage review.",
        );
        return { status: "REVIEW", severity: "none", notes };
      }
      const invalid = results.filter(
        (result) =>
          !result.weekend ||
          !result.weekend.travelFit.eligible ||
          result.weekend.capacity.activityMinutes < 480,
      );
      if (invalid.length > 0) {
        return fail(
          `Weekend-ineligible result leaked: ${invalid
            .slice(0, 8)
            .map((r) => r.id)
            .join(", ")}`,
          "P1",
        );
      }
      const childResults = results.filter(
        (result) =>
          classifyWeekendResultCandidate(result, destinations).kind === "poi",
      );
      if (childResults.length > 0) {
        return fail(
          `Child POI returned as a weekend primary: ${childResults.map((r) => r.id).join(", ")}`,
          "P2",
        );
      }
      notes.push(
        `All ${results.length} results satisfy travel, capacity, and area gates.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "knownBudgetWithin": {
      const context = contextFor(scenario);
      const violations = results.filter((result) => {
        const modes = modesFor(result, context);
        const verified = modes
          .map((mode) =>
            getEstimatedBudgetRange(
              result,
              mode,
              context.partySize,
              context.budgetTier,
              context.homeStationCoords ?? undefined,
              context.ferryTemporal,
            ),
          )
          .filter(
            (estimate) =>
              estimate.transportIncluded &&
              estimate.durationIncluded &&
              estimate.range,
          );
        return (
          verified.length > 0 &&
          Math.min(...verified.map((estimate) => estimate.range![1])) >
            context.budget
        );
      });
      if (violations.length > 0) {
        return fail(
          `Known budget violations: ${violations
            .slice(0, 8)
            .map((r) => `${r.id}=${formatBudget(r)}`)
            .join(", ")}`,
          "P1",
        );
      }
      notes.push(
        `No returned result has a verified complete estimate above ¥${context.budget}.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "unknownBudgetNotFictional": {
      const suspicious = results.filter(
        (result) =>
          !result.estimatedCostTransportIncluded &&
          result.match.reasons.some((reason) =>
            ["budgetGreatValue", "budgetWithin"].includes(reason.code),
          ),
      );
      if (suspicious.length > 0) {
        return fail(
          `Transport-unknown results still receive an affordability reason: ${suspicious
            .slice(0, 8)
            .map((result) => `${result.id}=${formatBudget(result)}`)
            .join(", ")}`,
          "P1",
        );
      }
      const flagged = results.filter(
        (result) =>
          !result.estimatedCostTransportIncluded &&
          result.estimatedCostRange !== undefined,
      );
      notes.push(
        flagged.length > 0
          ? `${flagged.length} results retain an explicitly transport-unknown on-site range without an affordability reason.`
          : "Unknown transport cost is not exposed as a complete estimated range.",
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "transportConsistent": {
      const context = contextFor(scenario);
      const mismatches: string[] = [];
      for (const result of results.slice(0, 20)) {
        const modes = modesFor(result, context);
        const canonical = estimateFor(result, context, modes);
        const shared = getDayTripTravelDurationEvidence(result, context, modes);
        const derived = estimateTripDuration(result, context, modes);
        if (
          shared.estimate &&
          !estimateMatches(result.transportEstimate, shared.estimate)
        ) {
          mismatches.push(
            `${result.id}: pipeline ${formatEstimate(result.transportEstimate)} vs shared ${formatEstimate(shared.estimate)}`,
          );
        }
        if (shared.evidence === "unknown" && result.transportEstimate) {
          mismatches.push(`${result.id}: unknown travel received a duration`);
        }
        if (canonical === null) {
          if (derived) {
            mismatches.push(
              `${result.id}: strict duration unexpectedly ${derived.bestTravelMinutes ?? "known"}`,
            );
          }
          if (!budgetUsesOnlyVerifiedTravel(result, context)) {
            mismatches.push(
              `${result.id}: estimated travel entered budget data`,
            );
          }
          continue;
        }
        const canonicalMid = Math.round(
          (canonical.timeRange[0] + canonical.timeRange[1]) / 2,
        );
        if (
          !result.transportEstimate ||
          result.transportEstimate.evidence !== "verified"
        ) {
          mismatches.push(
            `${result.id}: pipeline ${formatEstimate(result.transportEstimate)} vs verified ${formatEstimate(canonical)}`,
          );
        }
        if (
          result.transportEstimate &&
          (result.transportEstimate.mode !== canonical.mode ||
            result.transportEstimate.timeRange[0] !== canonical.timeRange[0] ||
            result.transportEstimate.timeRange[1] !== canonical.timeRange[1])
        ) {
          mismatches.push(
            `${result.id}: pipeline ${formatEstimate(result.transportEstimate)} vs ${formatEstimate(canonical)}`,
          );
        }
        if (derived?.bestTravelMinutes !== canonicalMid) {
          mismatches.push(
            `${result.id}: strict duration ${derived?.bestTravelMinutes ?? "unknown"} vs ${canonicalMid}`,
          );
        }
        if (!budgetUsesOnlyVerifiedTravel(result, context)) {
          mismatches.push(`${result.id}: estimated travel entered budget data`);
        }
      }
      if (mismatches.length > 0)
        return fail(
          `Estimate mismatches: ${mismatches.slice(0, 8).join("; ")}`,
          "P2",
        );
      notes.push(
        "Pipeline transport estimates agree with the shared verified/estimated/unknown evidence; strict duration and budget checks remain canonical-only.",
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "homeCanonicalDisplay": {
      const mismatches: string[] = [];
      for (const origin of scenario.check.origins) {
        const originScenario = { ...scenario, origin };
        const context = contextFor(originScenario);
        const originResults =
          origin === scenario.origin
            ? results
            : getRecommendations(destinations, context);
        for (const result of originResults.slice(0, 20)) {
          const shared = sharedDayTripTransport(result, context);
          const card = result.transportEstimate;
          if (shared.estimate && !estimateMatches(card, shared.estimate)) {
            mismatches.push(
              `${origin}:${result.id} Home=${formatEstimate(card)} shared=${formatEstimate(shared.estimate)}`,
            );
          }
          if (shared.evidence === "unknown" && card) {
            mismatches.push(
              `${origin}:${result.id} Home=${formatEstimate(card)} shared=unknown`,
            );
          }
        }
      }
      if (mismatches.length > 0) {
        return fail(
          `Home transport state disagrees with canonical truth: ${mismatches
            .slice(0, 8)
            .join("; ")}`,
          "P2",
        );
      }
      notes.push(
        `Home transport state matches the shared verified/estimated/unknown day-trip evidence for ${scenario.check.origins.join(", ")}.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "dayTripFeasibility": {
      const context = contextFor(scenario);
      const unknown: string[] = [];
      const infeasible = results.flatMap((result) => {
        const modes = modesFor(result, context);
        const estimate = estimateDayTripDuration(
          result,
          { ...context, availableTimeHours: scenario.check.availableHours },
          modes,
        );
        if (!estimate) {
          unknown.push(result.id);
          return [];
        }
        if (estimate.totalRangeHours[0] <= scenario.check.availableHours) {
          return [];
        }
        return [`${result.id}=${estimate.totalRangeHours[0].toFixed(1)}h+`];
      });
      if (unknown.length > 0) {
        return fail(
          `Unknown travel leaked into day-trip feasibility: ${unknown
            .slice(0, 8)
            .join(", ")}`,
          "P1",
        );
      }
      if (infeasible.length > 0) {
        return fail(
          `${infeasible.length} known candidates exceed ${scenario.check.availableHours}h at minimum: ${infeasible
            .slice(0, 8)
            .join(", ")}`,
          "P1",
        );
      }
      notes.push(
        `No known candidate exceeds the ${scenario.check.availableHours}h minimum-feasibility envelope.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "personalizedDayTrip": {
      const context = contextFor(scenario);
      const unknown: string[] = [];
      const infeasible: string[] = [];
      for (const result of results) {
        const modes = modesFor(result, context);
        const estimate = estimateDayTripDuration(
          result,
          { ...context, availableTimeHours: scenario.check.availableHours },
          modes,
        );
        if (!estimate || estimate.travelEvidence === "unknown") {
          unknown.push(result.id);
          continue;
        }
        if (estimate.totalRangeHours[0] > scenario.check.availableHours) {
          infeasible.push(
            `${result.id}=${estimate.totalRangeHours[0].toFixed(1)}h+`,
          );
        }
      }
      const leaked = results.filter((result) =>
        scenario.check.excludedIds.includes(result.id),
      );
      if (unknown.length > 0) {
        return fail(
          `${unknown.length} retained results have unknown origin-aware duration evidence: ${unknown
            .slice(0, 8)
            .join(", ")}`,
          "P1",
        );
      }
      if (infeasible.length > 0) {
        return fail(
          `${infeasible.length} retained results exceed ${scenario.check.availableHours}h at minimum: ${infeasible
            .slice(0, 8)
            .join(", ")}`,
          "P1",
        );
      }
      if (leaked.length > 0) {
        return fail(
          `Known distant candidates leaked: ${leaked.map((result) => result.id).join(", ")}`,
          "P1",
        );
      }
      notes.push(
        `All ${results.length} retained results have verified or bounded estimated travel and fit the ${scenario.check.availableHours}h minimum-feasibility envelope; unknown travel is excluded rather than fabricated.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "mainlandOriginFallback": {
      const context = contextFor(scenario);
      if (results.length === 0) {
        return fail(
          "Configured mainland origin produced an empty primary recommendation rail.",
          "P1",
        );
      }
      const evidence = results.map((result) =>
        getDayTripTravelDurationEvidence(
          result,
          context,
          modesFor(result, context),
        ),
      );
      const unknown = results.filter(
        (_result, index) => evidence[index].evidence === "unknown",
      );
      const estimated = evidence.filter(
        (item) => item.evidence === "estimated",
      );
      const infeasible = results.filter((result) => {
        const estimate = estimateDayTripDuration(
          result,
          { ...context, availableTimeHours: scenario.check.availableHours },
          modesFor(result, context),
        );
        return (
          !estimate ||
          estimate.totalRangeHours[0] > scenario.check.availableHours
        );
      });
      if (unknown.length > 0) {
        return fail(
          `Unknown travel entered the fallback rail: ${unknown
            .slice(0, 8)
            .map((result) => result.id)
            .join(", ")}`,
          "P1",
        );
      }
      if (estimated.length === 0) {
        return fail(
          "Fallback rail has no bounded estimated evidence; the sparse-registry regression is not covered.",
          "P1",
        );
      }
      if (infeasible.length > 0) {
        return fail(
          `Fallback rail contains infeasible results: ${infeasible
            .slice(0, 8)
            .map((result) => result.id)
            .join(", ")}`,
          "P1",
        );
      }
      notes.push(
        `Primary rail has ${results.length} results, including ${estimated.length} bounded estimated local/ground durations, with no unknown or infeasible travel.`,
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "uiVisitRange": {
      const limits: Record<string, [number, number]> = {
        shortOuting: [0, 4],
        halfDay: [4, 7.5],
        fullDay: [7.5, 14],
      };
      const requested = scenario.tripDuration ?? "any";
      const [min, max] = limits[requested] ?? [0, Number.POSITIVE_INFINITY];
      const mismatches = results.flatMap((result) => {
        const visit = result.recommendedVisitHours;
        if (!visit) return [];
        const midpoint = (visit.min + visit.max) / 2;
        return midpoint >= min && midpoint < max
          ? []
          : [`${result.id}=${midpoint.toFixed(1)}h`];
      });
      if (mismatches.length > 0) {
        return fail(
          `${mismatches.length} results do not fit the visible ${min}-${max}h label: ${mismatches
            .slice(0, 8)
            .join(", ")}`,
          "P2",
        );
      }
      notes.push(`All results fit the visible ${min}-${max}h label.`);
      return { status: "PASS", severity: "none", notes };
    }
    case "islandTopology": {
      const context = contextFor(scenario);
      const invalid = results.filter((result) => {
        const zone = resolveDestinationTransportZone(result);
        if (!ISLAND_ZONE_IDS.has(zone)) return false;
        const modes = modesFor(result, context);
        const evidence = getDayTripTravelDurationEvidence(
          result,
          context,
          modes,
        );
        return (
          modes.some((mode) => !["ferry", "flight"].includes(mode)) ||
          evidence.evidence === "estimated"
        );
      });
      if (invalid.length > 0)
        return fail(
          `Island candidates expose mainland modes: ${invalid
            .slice(0, 8)
            .map((r) => r.id)
            .join(", ")}`,
          "P1",
        );
      notes.push(
        "No inspected island candidate is authorized through rail, bus, or car topology or receives an estimated duration.",
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "reasonConsistent": {
      const context = contextFor(scenario);
      const mismatches: string[] = [];
      for (const result of results) {
        const reason = result.match.reasons.find(
          (item) => item.code === "transportFastTrain",
        );
        if (!reason) continue;
        const train = estimateFor(result, context, ["train"]);
        const reported = reason.params?.minutes;
        const actual = train?.timeRange[0];
        if (actual === undefined || reported !== actual) {
          mismatches.push(
            `${result.id}: reason=${String(reported)} actual=${String(actual)}`,
          );
        }
      }
      if (mismatches.length > 0)
        return fail(
          `Fast-train explanation mismatches: ${mismatches.slice(0, 8).join("; ")}`,
          "P2",
        );
      notes.push(
        "Every emitted fast-train reason matches the verified train estimate, or no such reason was emitted.",
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "diverse": {
      const top = results.slice(0, 10);
      const conflicts: string[] = [];
      for (let index = 0; index < top.length; index += 1) {
        for (let other = index + 1; other < top.length; other += 1) {
          if (
            top[index].relationships?.parentDestinationId === top[other].id ||
            top[other].relationships?.parentDestinationId === top[index].id
          ) {
            conflicts.push(`${top[index].id}/${top[other].id}`);
          }
        }
      }
      if (conflicts.length > 0)
        return fail(
          `Direct parent/child duplicates in top 10: ${conflicts.join(", ")}`,
          "P2",
        );
      notes.push(
        "No direct parent/child duplicate appears in the top 10; broader regional diversity is recorded for manual review.",
      );
      return { status: "PASS", severity: "none", notes };
    }
    case "rankingDiffers": {
      const other = allScenarioResults.get(scenario.check.otherScenarioId);
      if (!other)
        return fail(
          `Comparison scenario ${scenario.check.otherScenarioId} was not available.`,
        );
      const left = results
        .slice(0, 10)
        .map((result) => result.id)
        .join(",");
      const right = other.results
        .slice(0, 10)
        .map((result) => result.id)
        .join(",");
      if (left === right)
        return fail(
          `Top 10 ranking did not change versus ${scenario.check.otherScenarioId}.`,
          "P2",
        );
      notes.push(
        `Top 10 differs from ${scenario.check.otherScenarioId}; relevance direction remains a manual judgment.`,
      );
      return { status: "REVIEW", severity: "none", notes };
    }
    case "manual":
      notes.push(
        "Automated output captured; relevance/order judgment required in the report.",
      );
      return { status: "REVIEW", severity: "none", notes };
  }
}

function printInputs(scenario: Scenario, context: RecommendationContext) {
  const originMunicipality = resolveOriginMunicipalityId(
    context.homeStationCoords ?? undefined,
    destinations,
  );
  return [
    `origin=${scenario.origin}(${ORIGINS[scenario.origin].label})`,
    `originMunicipality=${originMunicipality ?? "unknown"}`,
    `tripMode=${context.tripMode}`,
    `duration=${context.tripDuration ?? "any"}`,
    `budget=${context.budget}/${context.budgetTier}`,
    `car=${context.carMode}`,
    `public=${context.publicModes.join(",") || "none"}`,
    `vibe=${context.vibe ?? "any"}`,
    `visited=${context.visitedIds.join(",") || "none"}`,
    `date=${scenario.travelDate ?? "none"}`,
  ].join("; ");
}

const byId = new Map<string, ScenarioResult>();
const results: ScenarioResult[] = [];
const scenariosToRun = process.env.KAI55_SCENARIO
  ? scenarios.filter((scenario) => scenario.id === process.env.KAI55_SCENARIO)
  : scenarios;

for (const scenario of scenariosToRun) {
  const context = contextFor(scenario);
  const recommendations = getRecommendations(destinations, context);
  const validation = validate(scenario, recommendations, byId);
  const result: ScenarioResult = {
    scenario,
    context,
    results: recommendations,
    ...validation,
  };
  results.push(result);
  byId.set(scenario.id, result);
}

console.log(`# KAI-55 recommendation audit runner`);
console.log(`catalogue=${destinations.length} scenarios=${results.length}`);
console.log(
  `origin zones=${Object.entries(ORIGINS)
    .map(
      ([key, origin]) =>
        `${key}:${resolveOriginTransportZone({ coordinates: origin.coordinates, label: origin.label })}`,
    )
    .join(" ")}`,
);
console.log("");

for (const result of results) {
  const { scenario } = result;
  console.log(`## ${scenario.id} ${scenario.title}`);
  console.log(
    `status=${result.status} severity=${result.severity} subsystem=${scenario.subsystem}`,
  );
  console.log(`inputs=${printInputs(scenario, result.context)}`);
  console.log(`expected=${scenario.expected}`);
  console.log(`actualCount=${result.results.length}`);
  for (const recommendation of result.results.slice(
    0,
    scenario.topResults ?? 5,
  )) {
    console.log(`result=${formatResult(recommendation, result.context)}`);
  }
  console.log(`notes=${result.notes.join(" ")}`);
  console.log("");
}

const counts = results.reduce<Record<string, number>>((summary, result) => {
  summary[result.status] = (summary[result.status] ?? 0) + 1;
  return summary;
}, {});
console.log(`summary=${JSON.stringify(counts)}`);
