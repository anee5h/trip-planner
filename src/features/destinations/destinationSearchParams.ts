import {
  BUDGET_TIER_LIMITS,
  partyProfileForSize,
  type BudgetTier,
  type BudgetFilter,
  type PartyProfile,
} from "@/shared/types/planner";
import type {
  TripDuration,
  TripMode,
} from "@/shared/services/recommendation/RecommendationContext";
import { MAX_ACCOMMODATION_ALLOWANCE } from "@/shared/services/budget/BudgetService";
import { normalizeTravelDateParam } from "@/shared/services/recommendation/TravelConditions";

/** "any" | BudgetTier, expressed via the canonical planner BudgetFilter. */

export const DEFAULT_DESTINATION_EXPLORER_STATE = {
  searchQuery: "",
  selectedRegions: [] as string[],
  selectedPrefectures: [] as string[],
  selectedCollections: [] as string[],
  selectedCities: [] as string[],
  selectedAreas: [] as string[],
  indoorMin: 0,
  season: "any",
  /** YYYY-MM-DD or "" (unset = any date browsing). */
  date: "",
  maxBudget: BUDGET_TIER_LIMITS.standard,
  sortBy: "recommended",
  carMode: "none",
  publicModes: [] as string[],
  partySize: 2,
  partyProfile: "couple" as PartyProfile,
  weather: "any" as "any" | "rainy" | "hot" | "cold",
  /** "any" = no budget restriction; a tier = party-aware, transport-inclusive
   *  trip-cost cap. The old "standard"-as-no-filter default is gone: a real
   *  tier must not double as the unselected state. */
  budgetTier: "any" as BudgetFilter,
  vibe: "any",
  tripDuration: "any" as TripDuration,
  walkingIntensity: "all",
  suitabilities: [] as string[],
  interests: [] as string[],
  viewMode: "grid" as "grid" | "map",
  currentPage: 1,
  tripMode: "any" as "any" | TripMode,
  accommodationAllowance: 15000,
};

export type DestinationExplorerState =
  typeof DEFAULT_DESTINATION_EXPLORER_STATE;

/**
 * Public-transport mode keys Explore can actually render as filter chips.
 * `ALL_PUBLIC_MODES` also contains "ferry", but Explore has no ferry chip
 * (KAI-63 D1): ferry rides the "any public transport" fallback and cannot be
 * selected or excluded here. URL `mode` values outside this set are rejected
 * at parse so a stale or hand-edited link can never activate a transport
 * restriction with zero visible chips while the modal still reads
 * "Any transport".
 */
export const EXPLORE_PUBLIC_MODE_KEYS = [
  "train",
  "shinkansen",
  "bus",
  "flight",
] as const;

/**
 * The only car-mode values Explore's single Car chip can activate: the chip
 * maps to the profile-preferred internal mode (KAI-63 D11). Values outside
 * this set are rejected at parse.
 */
export const EXPLORE_CAR_MODE_KEYS = ["none", "my_car", "rental"] as const;

const EXPOSED_SORT_KEYS = [
  "recommended",
  "travelTime",
  "budget",
  "walking",
  "nearest",
] as const;

function sanitizeSort(raw: string | null): string {
  return raw && (EXPOSED_SORT_KEYS as readonly string[]).includes(raw)
    ? raw
    : DEFAULT_DESTINATION_EXPLORER_STATE.sortBy;
}

function sanitizePublicModes(raw: string[]): string[] {
  const allowed = new Set<string>(EXPLORE_PUBLIC_MODE_KEYS);
  return raw.filter((mode) => allowed.has(mode));
}

function sanitizeCarMode(raw: string | null): string {
  return raw === "my_car" || raw === "rental" ? raw : "none";
}

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
  if (value === null) return fallback;
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

  const rawBudget = params.get("budget");
  let budgetTier: BudgetFilter = defaults.budgetTier;
  if (rawBudgetTier === "any" || rawBudget === "any") {
    budgetTier = "any";
  } else if (
    rawBudgetTier === "economy" ||
    rawBudgetTier === "standard" ||
    rawBudgetTier === "comfortable" ||
    rawBudgetTier === "luxury"
  ) {
    budgetTier = rawBudgetTier;
  } else if (rawBudgetTier === "budget") {
    budgetTier = "economy";
  } else if (rawBudgetTier === "premium") {
    budgetTier = "comfortable";
  } else if (rawBudgetTier === "flexible") {
    budgetTier = "luxury";
  } else if (rawBudget !== null && /^\d+$/.test(rawBudget)) {
    budgetTier = "standard";
  }

  const maxBudget =
    rawBudget !== null && /^\d+$/.test(rawBudget)
      ? parseNumber(rawBudget, defaults.maxBudget)
      : budgetTier === "any"
        ? defaults.maxBudget
        : BUDGET_TIER_LIMITS[budgetTier];

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
    date: normalizeTravelDateParam(params.get("date")) ?? "",
    maxBudget,
    // `overall` was briefly exposed before the KAI-89 beta score-hiding
    // decision. Keep old links working, but normalize them to Recommended so
    // the hidden overall score never controls ordering or UI state.
    sortBy: sanitizeSort(params.get("sort")),
    // KAI-63 D1: reject transport values Explore cannot render (ferry,
    // legacy chip labels like local/express, junk car values) so a URL can
    // never activate a restriction with no visible chips and an "Any
    // transport" label.
    carMode: sanitizeCarMode(params.get("car")),
    publicModes:
      params.get("mode") === "none"
        ? []
        : params.has("mode")
          ? sanitizePublicModes(params.getAll("mode"))
          : defaults.publicModes,
    partySize,
    partyProfile: partyProfileForSize(partySize),
    weather:
      params.get("weather") === "rainy" ||
      params.get("weather") === "hot" ||
      params.get("weather") === "cold"
        ? (params.get("weather") as "rainy" | "hot" | "cold")
        : defaults.weather,
    budgetTier,
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
    tripMode:
      params.get("tripMode") === "weekend_2d1n"
        ? "weekend_2d1n"
        : params.get("tripMode") === "day_trip"
          ? "day_trip"
          : "any",
    accommodationAllowance: (() => {
      const raw = params.get("stay");
      if (raw === null || !/^\d+$/.test(raw))
        return defaults.accommodationAllowance;
      const value = parseInt(raw, 10);
      if (value >= 0 && value <= MAX_ACCOMMODATION_ALLOWANCE) return value;
      return defaults.accommodationAllowance;
    })(),
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
  if (state.date) params.set("date", state.date);
  if (state.budgetTier === "any") {
    params.set("budget", "any");
  } else {
    params.set("budget", String(state.maxBudget));
  }
  params.set("sort", sanitizeSort(state.sortBy));
  params.set("car", sanitizeCarMode(state.carMode));
  const publicModes = sanitizePublicModes(state.publicModes);
  if (publicModes.length === 0) params.set("mode", "none");
  else appendAll("mode", publicModes);
  params.set("party", partyProfileForSize(state.partySize));
  params.set("partySize", String(state.partySize));
  if (state.weather !== "any") params.set("weather", state.weather);
  params.set("budgetTier", state.budgetTier);
  params.set("vibe", state.vibe);
  params.set("duration", state.tripDuration);
  if (state.tripMode === "weekend_2d1n") params.set("tripMode", "weekend_2d1n");
  else if (state.tripMode === "day_trip") params.set("tripMode", "day_trip");
  if (state.accommodationAllowance !== 15000)
    params.set("stay", String(state.accommodationAllowance));
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
  tripMode?: TripMode;
  accommodationAllowance?: number;
  /** YYYY-MM-DD planned travel date (omitted = today/no explicit date). */
  date?: string;
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
  if (input.date) params.set("date", input.date);
  if (input.tripMode === "weekend_2d1n") {
    params.set("tripMode", "weekend_2d1n");
    if (input.accommodationAllowance !== undefined) {
      params.set("stay", String(input.accommodationAllowance));
    }
  } else if (input.tripMode === "day_trip") {
    params.set("tripMode", "day_trip");
  }
  return params.toString();
}
