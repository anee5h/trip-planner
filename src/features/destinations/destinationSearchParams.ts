export const DEFAULT_DESTINATION_EXPLORER_STATE = {
  searchQuery: "",
  selectedRegions: [] as string[],
  selectedPrefectures: [] as string[],
  selectedCollections: [] as string[],
  maxBudget: 100000,
  sortBy: "recommended",
  carMode: "none",
  publicModes: ["train", "shinkansen", "bus", "flight"],
  partySize: 2,
  weather: "all",
  walkingIntensity: "all",
  suitabilities: [] as string[],
  interests: [] as string[],
  viewMode: "grid" as "grid" | "map",
  currentPage: 1,
};

export type DestinationExplorerState =
  typeof DEFAULT_DESTINATION_EXPLORER_STATE;

const parseNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function parseDestinationSearchParams(
  params: URLSearchParams,
): DestinationExplorerState {
  const defaults = DEFAULT_DESTINATION_EXPLORER_STATE;
  const view = params.get("view");

  return {
    searchQuery: params.get("q") ?? defaults.searchQuery,
    selectedRegions: params.getAll("region"),
    selectedPrefectures: params.getAll("prefecture"),
    selectedCollections: params.getAll("collection"),
    maxBudget: parseNumber(params.get("budget"), defaults.maxBudget),
    sortBy: params.get("sort") ?? defaults.sortBy,
    carMode: params.get("car") ?? defaults.carMode,
    publicModes: params.has("mode")
      ? params.getAll("mode")
      : defaults.publicModes,
    partySize: parseNumber(params.get("party"), defaults.partySize),
    weather: params.get("weather") ?? defaults.weather,
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
  params.set("budget", String(state.maxBudget));
  params.set("sort", state.sortBy);
  params.set("car", state.carMode);
  appendAll("mode", state.publicModes);
  params.set("party", String(state.partySize));
  params.set("weather", state.weather);
  params.set("walking", state.walkingIntensity);
  appendAll("suitability", state.suitabilities);
  appendAll("interest", state.interests);
  params.set("view", state.viewMode);
  params.set("page", String(state.currentPage));
  return params;
}
