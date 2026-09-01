/**
 * KAI-91: Any budget option regression tests.
 *
 * Invariants:
 *   - No budget parameter defaults to Any.
 *   - Clear filters resets budget to Any.
 *   - Any bypasses affordability filtering.
 *   - budget=any survives reload / navigation.
 *   - Flexible and all other existing budget choices remain valid and unchanged.
 *   - Switching from a restrictive tier to Any restores otherwise valid results.
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  loadLiteIndex,
  loadDestinationsIndex,
} from "@/shared/services/place/PlaceCatalog";
import Destinations from "../Destinations";
import destinations from "@/shared/data/destinations-index.json";
import {
  DEFAULT_DESTINATION_EXPLORER_STATE,
  parseDestinationSearchParams,
  serializeDestinationSearchParams,
} from "../destinationSearchParams";

const recommendationEligibleDestinations = destinations.filter(
  (destination) => destination.recommendationEligible !== false,
);

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: null as { lat: number; lng: number } | null,
  homeStationTransportZoneId: undefined as string | undefined,
  originSource: "none" as string,
  destinationRatings: {},
  favorites: [],
  isVisited: () => false,
  isFavorite: () => false,
  isComparing: () => false,
  toggleCompare: vi.fn(),
  toggleFavorite: vi.fn(),
  compareList: [],
  canMutateProfile: true,
  addVisitedDate: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  user: null as unknown,
  loading: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      const value: Record<string, string> = {
        "destination.tripAreas.summary": "{{areas}} areas · {{places}} places",
        "destination.tripAreas.show": "Show {{count}}",
        "destination.durationOptions.any": "Any",
        "destination.durationOptions.fullDay": "Day trip",
        "destination.durationOptions.2d1n": "2D1N",
        "home.transportModes.car": "Car",
        "search.label": "Search",
        "search.clear": "Clear search",
        // KAI-49: Explore page i18n key — required for getResultCount to
        // parse the leading digit correctly under the test mock.
        "ui.destinationsMatching": "{{count}} destinations matching",
        "ui.noDestinationsFound": "No destinations match the selected filters.",
        "ui.noDestinationsFoundHint":
          "Try adjusting your search terms or clearing some filters.",
      };
      const str = value[key] ?? key;
      return options
        ? str.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
            String(options[name] ?? ""),
          )
        : str;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({ weatherContext: { forecastMap: undefined } }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => tripStoreMock,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock("@/shared/components/StationInput", () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

// KAI-121: full catalogue is runtime-lazy; preload so
// useFullCatalogue renders full data synchronously in tests.
beforeAll(async () => {
  await loadDestinationsIndex();
  await loadLiteIndex();
});

beforeEach(() => {
  tripStoreMock.homeStationCoords = null;
  tripStoreMock.homeStationTransportZoneId = undefined;
  authMock.user = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function renderDestinations(entry: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Destinations />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
  return host;
}

function getResultCount(container: HTMLDivElement): number {
  const summarySpan = container.querySelector("#results-grid span");
  if (!summarySpan) return 0;
  const text = summarySpan.textContent ?? "";
  const match = text.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getLocationSearch(container: HTMLDivElement): string {
  return (
    container.querySelector("[data-testid=location-search]")?.textContent ?? ""
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KAI-91: Any budget option", () => {
  it("defaults to Any when no budget parameter is present in URL", async () => {
    const parsed = parseDestinationSearchParams(new URLSearchParams(""));
    expect(parsed.budgetTier).toBe("any");
    expect(DEFAULT_DESTINATION_EXPLORER_STATE.budgetTier).toBe("any");

    const container = await renderDestinations("/destinations");
    const count = getResultCount(container);
    // The unfiltered recommendation surface excludes compatibility-only shells.
    expect(count).toBe(recommendationEligibleDestinations.length);

    // No active budget filter chip shown by default
    const budgetChip = Array.from(
      container.querySelectorAll(
        "[id^=active-filter-], [data-testid=active-chip]",
      ),
    ).find(
      (el) =>
        el.textContent?.includes("Budget") ||
        el.textContent?.includes("Standard"),
    );
    expect(budgetChip).toBeUndefined();
  });

  it("Clear filters resets budget to Any and restores unfiltered results", async () => {
    // Render with restrictive budget
    const container = await renderDestinations(
      "/destinations?budgetTier=economy",
    );
    const economyCount = getResultCount(container);

    // Click "Clear all"
    const clearBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Clear all"),
    );
    expect(clearBtn).not.toBeUndefined();

    act(() => {
      clearBtn?.click();
    });

    const resetCount = getResultCount(container);
    expect(resetCount).toBeGreaterThan(economyCount);

    const searchParams = new URLSearchParams(getLocationSearch(container));
    expect(searchParams.get("budgetTier")).toBe("any");
    expect(searchParams.get("budget")).toBe("any");
  });

  it("Any budget option bypasses affordability filtering entirely", async () => {
    const containerAny = await renderDestinations(
      "/destinations?budgetTier=any",
    );
    const anyCount = getResultCount(containerAny);

    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerEconomy = await renderDestinations(
      "/destinations?budgetTier=economy",
    );
    const economyCount = getResultCount(containerEconomy);

    expect(anyCount).toBeGreaterThan(economyCount);
    expect(anyCount).toBe(recommendationEligibleDestinations.length);
  });

  it("budget=any survives reload / navigation round-trip", () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("budget=any&vibe=food&party=solo"),
    );
    expect(parsed.budgetTier).toBe("any");
    expect(parsed.vibe).toBe("food");
    expect(parsed.partySize).toBe(1);

    const serialized = serializeDestinationSearchParams(parsed);
    expect(serialized.get("budget")).toBe("any");
    expect(serialized.get("budgetTier")).toBe("any");

    const reParsed = parseDestinationSearchParams(serialized);
    expect(reParsed.budgetTier).toBe("any");
    expect(reParsed.vibe).toBe("food");
    expect(reParsed.partySize).toBe(1);
  });

  it("retains Standard tier for numeric-only legacy budget URLs without budgetTier", async () => {
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("budget=45000"),
    );
    expect(parsed.budgetTier).toBe("standard");
    expect(parsed.maxBudget).toBe(45000);

    const container = await renderDestinations("/destinations?budget=45000");
    const count = getResultCount(container);
    // Under Standard, only destinations with estimated cost <= 40000 (standard tier) or maxBudget are allowed
    expect(count).toBeLessThanOrEqual(destinations.length);

    // Active chip shows Standard budget
    const removeStandardChipBtn = container.querySelector(
      "button[title*='Standard']",
    );
    expect(removeStandardChipBtn).not.toBeNull();
  });

  it("keeps Flexible and other existing budget choices valid and unchanged", () => {
    // Economy
    const econParsed = parseDestinationSearchParams(
      new URLSearchParams("budgetTier=economy"),
    );
    expect(econParsed.budgetTier).toBe("economy");
    expect(econParsed.maxBudget).toBe(20000);

    // Standard
    const stdParsed = parseDestinationSearchParams(
      new URLSearchParams("budgetTier=standard"),
    );
    expect(stdParsed.budgetTier).toBe("standard");
    expect(stdParsed.maxBudget).toBe(40000);

    // Comfort
    const comfParsed = parseDestinationSearchParams(
      new URLSearchParams("budgetTier=comfortable"),
    );
    expect(comfParsed.budgetTier).toBe("comfortable");
    expect(comfParsed.maxBudget).toBe(75000);

    // Flexible (luxury)
    const luxParsed = parseDestinationSearchParams(
      new URLSearchParams("budgetTier=luxury"),
    );
    expect(luxParsed.budgetTier).toBe("luxury");
    expect(luxParsed.maxBudget).toBe(150000);

    // Alias: flexible
    const flexParsed = parseDestinationSearchParams(
      new URLSearchParams("budgetTier=flexible"),
    );
    expect(flexParsed.budgetTier).toBe("luxury");
  });

  it("switching from a restrictive tier to Any restores otherwise valid results", async () => {
    const container = await renderDestinations(
      "/destinations?budgetTier=economy",
    );
    const economyCount = getResultCount(container);

    // Open filter modal
    const filterBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Filters"),
    );
    expect(filterBtn).not.toBeUndefined();
    act(() => {
      filterBtn?.click();
    });

    // Find and click the "Any" budget button
    const anyBudgetBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.includes("Any") &&
        btn.textContent?.includes("All price ranges"),
    );
    expect(anyBudgetBtn).not.toBeUndefined();
    act(() => {
      anyBudgetBtn?.click();
    });

    // Close modal / check count
    const restoredCount = getResultCount(container);
    expect(restoredCount).toBeGreaterThan(economyCount);
    expect(restoredCount).toBe(recommendationEligibleDestinations.length);
  });
});
