import {
  BUDGET_TIER_LIMITS,
  partyProfileForSize,
  type BudgetTier,
  type PartyProfile,
} from "@/shared/types/planner";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";

export const DEFAULT_DESTINATION_EXPLORER_STATE = {
  searchQuery: "",
  selectedRegions: [] as string[],
  selectedPrefectures: [] as string[],
  selectedCollections: [] as string[],
  selectedCities: [] as string[],
  selectedAreas: [] as string[],
  indoorMin: 0,
  season: "any",
  maxBudget: BUDGET_TIER_LIMITS.standard,
  sortBy: "recommended",
  carMode: "none",
  publicModes: ["train", "shinkansen", "bus", "flight"],
  partySize: 2,
  partyProfile: "couple" as PartyProfile,
  weather: "any" as "any" | "rainy" | "hot" | "cold",
  budgetTier: "standard" as BudgetTier,
  vibe: "any",
  tripDuration: "any" as TripDuration,
  walkingIntensity: "all",
  suitabilities: [] as string[],
  interests: [] as string[],
  viewMode: "grid" as "grid" | "map",
  currentPage: 1,
};

export type DestinationExplorerState =
  typeof DEFAULT_DESTINATION_EXPLORER_STATE;

export function hasRestrictedTransportSelection(
  carMode: string,
  publicModes: string[],
) {
  const defaults = DEFAULT_DESTINATION_EXPLORER_STATE;
  return (
    carMode !== defaults.carMode ||
    publicModes.length !== defaults.publicModes.length ||
    defaults.publicModes.some((mode) => !publicModes.includes(mode))
  );
}

const parseNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function parseDestinationSearchParams(
  params: URLSearchParams,
): DestinationExplorerState {
  const defaults = DEFAULT_DESTINATION_EXPLORER_STATE;
  const view = params.get("view");
  const rawParty = params.get("party");
  const rawBudgetTier = params.get("budgetTier") ?? params.get("dining");
  const partyProfile: PartyProfile =
    rawParty === "solo" || rawParty === "group" || rawParty === "couple"
      ? rawParty
      : defaults.partyProfile;
  const legacyPartySize =
    rawParty && /^\d+$/.test(rawParty) ? parseNumber(rawParty, 0) : undefined;
  const partySize = params.has("partySize")
    ? parseNumber(params.get("partySize"), defaults.partySize)
    : legacyPartySize && legacyPartySize > 0
      ? legacyPartySize
      : partyProfile === "solo"
        ? 1
        : partyProfile === "group"
          ? 4
          : 2;

  return {
    searchQuery: params.get("q") ?? defaults.searchQuery,
    selectedRegions: params.getAll("region"),
    selectedPrefectures: params.getAll("prefecture"),
    selectedCollections: params.getAll("collection"),
    selectedCities: params.getAll("city"),
    selectedAreas: params.getAll("area"),
    indoorMin: Math.min(
      100,
      Math.max(0, parseNumber(params.get("indoor"), defaults.indoorMin)),
    ),
    season: params.get("season") ?? defaults.season,
    maxBudget: parseNumber(params.get("budget"), defaults.maxBudget),
    sortBy: params.get("sort") ?? defaults.sortBy,
    carMode: params.get("car") ?? defaults.carMode,
    publicModes:
      params.get("mode") === "none"
        ? []
        : params.has("mode")
          ? params.getAll("mode")
          : defaults.publicModes,
    partySize,
    partyProfile: partyProfileForSize(partySize),
    weather:
      params.get("weather") === "rainy" ||
      params.get("weather") === "hot" ||
      params.get("weather") === "cold"
        ? (params.get("weather") as "rainy" | "hot" | "cold")
        : defaults.weather,
    budgetTier:
      rawBudgetTier === "economy" ||
      rawBudgetTier === "standard" ||
      rawBudgetTier === "comfortable" ||
      rawBudgetTier === "luxury"
        ? rawBudgetTier
        : rawBudgetTier === "budget"
          ? "economy"
          : rawBudgetTier === "premium"
            ? "comfortable"
            : defaults.budgetTier,
    vibe: params.get("vibe") ?? defaults.vibe,
    tripDuration:
      params.get("duration") === "shortOuting" ||
      params.get("duration") === "halfDay" ||
      params.get("duration") === "fullDay" ||
      params.get("duration") === "weekend"
        ? (params.get("duration") as TripDuration)
        : params.get("duration") === "dayTrip"
          ? "fullDay"
          : defaults.tripDuration,
    walkingIntensity: params.get("walking") ?? defaults.walkingIntensity,
    suitabilities: params.getAll("suitability"),
    interests: params.getAll("interest"),
    viewMode: view === "map" ? "map" : "grid",
    currentPage: Math.max(
      1,
      Math.floor(parseNumber(params.get("page"), defaults.currentPage)),
    ),
  };
}

export function serializeDestinationSearchParams(
  state: DestinationExplorerState,
): URLSearchParams {
  const params = new URLSearchParams();
  const appendAll = (key: string, values: string[]) =>
    values.forEach((value) => params.append(key, value));

  if (state.searchQuery) params.set("q", state.searchQuery);
  appendAll("region", state.selectedRegions);
  appendAll("prefecture", state.selectedPrefectures);
  appendAll("collection", state.selectedCollections);
  appendAll("city", state.selectedCities);
  appendAll("area", state.selectedAreas);
  if (state.indoorMin > 0) params.set("indoor", String(state.indoorMin));
  if (state.season !== "any") params.set("season", state.season);
  params.set("budget", String(state.maxBudget));
  params.set("sort", state.sortBy);
  params.set("car", state.carMode);
  if (state.publicModes.length === 0) params.set("mode", "none");
  else appendAll("mode", state.publicModes);
  params.set("party", partyProfileForSize(state.partySize));
  params.set("partySize", String(state.partySize));
  if (state.weather !== "any") params.set("weather", state.weather);
  params.set("budgetTier", state.budgetTier);
  params.set("vibe", state.vibe);
  params.set("duration", state.tripDuration);
  params.set("walking", state.walkingIntensity);
  appendAll("suitability", state.suitabilities);
  appendAll("interest", state.interests);
  params.set("view", state.viewMode);
  params.set("page", String(state.currentPage));
  return params;
}

export function serializePlannerSearchParams(input: {
  vibe: string;
  partyProfile?: PartyProfile;
  partySize: number;
  weather?: "any" | "rainy" | "hot" | "cold";
  manualWeatherPreference?: "rainy" | "hot" | "cold";
  budgetTier: BudgetTier;
  tripDuration: TripDuration;
  budget: number;
  carMode: string;
  publicModes: string[];
}): string {
  const params = new URLSearchParams();
  if (input.vibe && input.vibe !== "any") params.set("vibe", input.vibe);
  params.set("party", partyProfileForSize(input.partySize));
  params.set("partySize", String(input.partySize));
  const weatherPref =
    input.manualWeatherPreference ??
    (input.weather && input.weather !== "any" ? input.weather : undefined);
  if (weatherPref) params.set("weather", weatherPref);
  params.set("budgetTier", input.budgetTier);
  if (input.tripDuration && input.tripDuration !== "any") {
    params.set("duration", input.tripDuration);
  }
  params.set("budget", String(input.budget));
  if (input.carMode && input.carMode !== "none") {
    params.set("car", input.carMode);
  }
  if (input.publicModes.length === 0) params.set("mode", "none");
  else input.publicModes.forEach((mode) => params.append("mode", mode));
  return params.toString();
}
