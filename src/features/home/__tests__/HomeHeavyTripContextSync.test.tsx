/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeavyHome from "../HomeHeavy";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const homeMocks = vi.hoisted(() => ({
  tripContext: { partySize: 2 },
  updateTripContext: vi.fn(),
  applied: {
    partySize: 2,
    tripDuration: "fullDay",
    vibe: "any",
    budget: 30000,
    budgetTier: "standard",
    customBudgetCap: undefined,
    carMode: "none",
    publicModes: [],
  },
  planner: {
    partySize: 2,
    tripDuration: "fullDay",
    vibe: "any",
    budget: 30000,
    budgetTier: "standard",
    customBudgetCap: undefined,
    carMode: "none",
    publicModes: [],
  },
  forecastSelection: { type: "today" as const },
  currentTab: undefined,
  homeStation: "Tokyo Station",
  homeStationCoords: { lat: 35.6812, lng: 139.7671 },
  isVisited: () => false,
  recommendations: {
    recommendedDestinations: [] as unknown[],
    rouletteCandidates: [] as unknown[],
    rouletteExpansion: "exact" as const,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/shared/context/TripContext", () => ({
  useOptionalTripContext: () => ({
    tripContext: homeMocks.tripContext,
    updateTripContext: homeMocks.updateTripContext,
  }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStation: homeMocks.homeStation,
    homeStationCoords: homeMocks.homeStationCoords,
    homeStationTransportZoneId: undefined,
    isVisited: homeMocks.isVisited,
    favorites: [],
  }),
}));

vi.mock("@/shared/hooks/useCatalogue", () => ({
  useCatalogue: () => ({
    status: "ready",
    places: [],
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

vi.mock("@/shared/hooks/useRecentlyViewedDestinations", () => ({
  useRecentlyViewedDestinations: () => [],
}));

vi.mock("@/features/home/hooks/useTripPlannerState", () => ({
  useTripPlannerState: () => ({
    resolvedDraft: homeMocks.planner,
    resolvedApplied: homeMocks.applied,
    hasUserApplied: true,
  }),
}));

vi.mock("@/features/home/state/HomeDateStateContext", () => ({
  useHomeDateState: () => ({
    weatherContext: null,
    currentTab: homeMocks.currentTab,
    customDate: null,
    forecastSelection: homeMocks.forecastSelection,
  }),
}));

vi.mock("@/features/home/hooks/useTripRecommendations", () => ({
  useTripRecommendations: () => homeMocks.recommendations,
}));

vi.mock("@/features/home/components/RouletteModal", () => ({
  default: () => null,
}));
vi.mock("@/features/home/components/TopMatchesSection", () => ({
  default: () => null,
}));
vi.mock("@/features/home/components/BucketListRail", () => ({
  default: () => null,
}));
vi.mock("@/features/home/components/CollectionsRail", () => ({
  default: () => null,
}));
vi.mock("@/features/home/components/RecentlyViewedRail", () => ({
  default: () => null,
}));
vi.mock("@/features/home/components/DeferredDiscoveryRails", () => ({
  default: () => null,
}));
vi.mock("@/shared/components/ui/DeferredSection", () => ({
  DeferredSection: () => null,
}));

let host: HTMLDivElement;
let root: Root;
const onActionConsumed = vi.fn();

function renderHeavyHome() {
  act(() => {
    root.render(
      <HeavyHome pendingAction={null} onActionConsumed={onActionConsumed} />,
    );
  });
}

beforeEach(() => {
  homeMocks.tripContext = { partySize: 2 };
  homeMocks.updateTripContext.mockClear();
  homeMocks.applied = {
    partySize: 2,
    tripDuration: "fullDay",
    vibe: "any",
    budget: 30000,
    budgetTier: "standard",
    customBudgetCap: undefined,
    carMode: "none",
    publicModes: [],
  };
  homeMocks.planner = { ...homeMocks.applied };
  onActionConsumed.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("HeavyHome trip context sync", () => {
  it("omits childCount when the applied party is unchanged", () => {
    renderHeavyHome();

    expect(homeMocks.updateTripContext).toHaveBeenCalledTimes(1);
    expect(homeMocks.updateTripContext.mock.calls[0][0]).not.toHaveProperty(
      "childCount",
    );
  });

  it("writes a party change once while context catches up", () => {
    renderHeavyHome();
    homeMocks.updateTripContext.mockClear();

    homeMocks.applied = { ...homeMocks.applied, partySize: 3 };
    homeMocks.planner = { ...homeMocks.planner, partySize: 3 };
    renderHeavyHome();

    expect(homeMocks.updateTripContext).toHaveBeenCalledTimes(1);
    expect(homeMocks.updateTripContext.mock.calls[0][0]).toMatchObject({
      partySize: 3,
    });
    expect(homeMocks.updateTripContext.mock.calls[0][0]).not.toHaveProperty(
      "childCount",
    );

    homeMocks.tripContext = { partySize: 3 };
    renderHeavyHome();
    expect(homeMocks.updateTripContext).toHaveBeenCalledTimes(1);
  });
});
