/**
 * KAI-63: Explore default state regression tests.
 *
 * Invariants:
 *   - Fresh Explore (no URL params) shows the full unfiltered catalogue.
 *   - A logged-in user's saved transport preferences must NOT silently reduce
 *     the unfiltered baseline.
 *   - Explicit URL mode params ARE honoured (user-chosen filter still works).
 *   - URL restoration cannot reapply invisible transport defaults.
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
  hasRestrictedTransportSelection,
} from "../destinationSearchParams";
import { ALL_PUBLIC_MODES } from "@/features/home/services/TransportResolver";

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

const localeMock = vi.hoisted(() => ({ language: "en" }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      const value: Record<string, string> = {
        "destination.tripAreas.summary": "{{areas}} areas · {{places}} places",
        "destination.tripAreas.show": "Show {{count}}",
        "destination.durationOptions.any": "Any",
        "destination.durationOptions.fullDay": "Day trip",
        "destination.durationOptions.2d1n": "2D1N",
        "ui.destinations":
          localeMock.language === "ja" ? "目的地" : "Destinations",
        "ui.destinationsDescription":
          localeMock.language === "ja"
            ? "日本全国の旅先を探してみましょう。地域・都道府県・コレクション・予算・興味でフィルタリングできます。"
            : "Find the perfect adventure across Japan.",
        "ui.gridView":
          localeMock.language === "ja"
            ? "グリッド表示に切り替え"
            : "Switch to grid view",
        "ui.mapView":
          localeMock.language === "ja"
            ? "マップ表示に切り替え"
            : "Switch to map view",
        "ui.grid": localeMock.language === "ja" ? "グリッド" : "Grid",
        "ui.map": localeMock.language === "ja" ? "マップ" : "Map",
        "ui.destinationsMatching":
          localeMock.language === "ja"
            ? "該当する目的地：{{count}}件"
            : "{{count}} destinations matching",
      };
      const str = value[key] ?? key;
      return options
        ? str.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
            String(options[name] ?? ""),
          )
        : str;
    },
    i18n: { language: localeMock.language },
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
  useLocale: () => ({ locale: localeMock.language, setLocale: vi.fn() }),
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
  localeMock.language = "en";
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
  // Parse count from the summary text in #results-grid span.
  // Format: "N destinations matching" or "N areas · M places" (weekend mode)
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
// Invariant 1: Default state is non-restrictive
// ---------------------------------------------------------------------------

describe("DEFAULT_DESTINATION_EXPLORER_STATE transport invariants", () => {
  it("default publicModes is empty — no transport filter", () => {
    expect(DEFAULT_DESTINATION_EXPLORER_STATE.publicModes).toEqual([]);
  });

  it("default carMode is none", () => {
    expect(DEFAULT_DESTINATION_EXPLORER_STATE.carMode).toBe("none");
  });

  it("default state does not trigger hasRestrictedTransportSelection", () => {
    expect(
      hasRestrictedTransportSelection(
        DEFAULT_DESTINATION_EXPLORER_STATE.carMode,
        DEFAULT_DESTINATION_EXPLORER_STATE.publicModes,
      ),
    ).toBe(false);
  });

  it("ALL_PUBLIC_MODES counts as a restricted selection — but Explore default must never reach this from preferences", () => {
    // When the user explicitly selects all modes via UI, that IS a restriction.
    // This test confirms the helper's polarity is correct.
    expect(hasRestrictedTransportSelection("none", ALL_PUBLIC_MODES)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: Fresh Explore (no-origin, no URL params) shows full catalogue
// ---------------------------------------------------------------------------

describe("Fresh Explore — no origin, no URL params", () => {
  it("renders the Japanese Explore chrome without keys or English leakage", async () => {
    localeMock.language = "ja";
    const container = await renderDestinations("/destinations");
    const text = container.textContent ?? "";

    expect(text).toContain("目的地");
    expect(text).toContain("日本全国の旅先を探してみましょう。");
    expect(text).toContain("グリッド");
    expect(text).toContain("マップ");
    expect(text).toMatch(/該当する目的地：\d+件/);
    expect(text).not.toMatch(
      /ui\.(?:destinations|destinationsDescription|grid|map)|Destinations|Find the perfect adventure|Switch to (?:grid|map) view|destinations matching|Top Rated|Highest Rated/i,
    );
    expect(
      container.querySelector('[aria-label="グリッド表示に切り替え"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="マップ表示に切り替え"]'),
    ).not.toBeNull();
  });

  it("shows the full eligible catalogue without a transport filter", async () => {
    const container = await renderDestinations("/destinations");
    const count = getResultCount(container);
    // Must be well above 410 (the broken-default count).
    // We use 600 as a conservative floor; catalogue may grow.
    expect(count).toBeGreaterThan(600);
    expect(count).toBeLessThanOrEqual(destinations.length);
  });

  it("URL does not contain specific transport mode params", async () => {
    const container = await renderDestinations("/destinations");
    const params = new URLSearchParams(getLocationSearch(container));
    const modes = params.getAll("mode");
    // Acceptable: no mode param, or mode=none. Never specific modes like train.
    const hasSpecificModes = modes.some((m) => m !== "none");
    expect(hasSpecificModes).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: Logged-in user with saved publicModes — must not filter Explore
// ---------------------------------------------------------------------------

describe("Logged-in user with saved transport preferences", () => {
  it("saved ALL_PUBLIC_MODES preference does not reduce fresh Explore count vs anonymous", async () => {
    authMock.user = null;
    const containerAnon = await renderDestinations("/destinations");
    const anonCount = getResultCount(containerAnon);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "none",
          publicModes: ALL_PUBLIC_MODES,
          partySize: 2,
        },
      },
    };
    const containerLoggedIn = await renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved restrictive publicModes: ['train'] preference does not reduce fresh Explore count vs anonymous", async () => {
    authMock.user = null;
    const containerAnon = await renderDestinations("/destinations");
    const anonCount = getResultCount(containerAnon);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "none",
          publicModes: ["train"],
          partySize: 2,
        },
      },
    };
    const containerLoggedIn = await renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved restrictive carMode: 'rental' preference does not reduce fresh Explore count vs anonymous", async () => {
    authMock.user = null;
    const containerAnon = await renderDestinations("/destinations");
    const anonCount = getResultCount(containerAnon);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "rental",
          publicModes: [],
          partySize: 2,
        },
      },
    };
    const containerLoggedIn = await renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved restrictive carMode: 'my_car' preference does not reduce fresh Explore count vs anonymous", async () => {
    authMock.user = null;
    const containerAnon = await renderDestinations("/destinations");
    const anonCount = getResultCount(containerAnon);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "my_car",
          publicModes: [],
          partySize: 2,
        },
      },
    };
    const containerLoggedIn = await renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved combination of restrictive carMode and publicModes preferences does not reduce fresh Explore count vs anonymous", async () => {
    authMock.user = null;
    const containerAnon = await renderDestinations("/destinations");
    const anonCount = getResultCount(containerAnon);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "rental",
          publicModes: ["train"],
          partySize: 2,
        },
      },
    };
    const containerLoggedIn = await renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("URL written for a logged-in user (no URL params) has no specific transport modes", async () => {
    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "rental",
          publicModes: ["train", "shinkansen", "bus", "flight", "ferry"],
          partySize: 2,
        },
      },
    };
    const container = await renderDestinations("/destinations");
    const params = new URLSearchParams(getLocationSearch(container));
    const modes = params.getAll("mode");
    const hasSpecificModes = modes.some((m) => m !== "none");
    expect(hasSpecificModes).toBe(false);
    expect(params.get("car")).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Invariant 4: Explicit URL mode param IS honoured (user chose a filter)
// ---------------------------------------------------------------------------

describe("Explicit URL transport filter", () => {
  it("mode=train in URL with an origin reduces the count vs unfiltered", async () => {
    const containerAll = await renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    // Set an origin so getValidModes can evaluate topology
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerTrain = await renderDestinations("/destinations?mode=train");
    const trainCount = getResultCount(containerTrain);

    expect(trainCount).toBeGreaterThan(0);
    expect(trainCount).toBeLessThan(allCount);
  }, 15000);

  it("car=rental in URL with an origin reduces the count vs unfiltered", async () => {
    const containerAll = await renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    // Set an origin so getValidModes can evaluate topology
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    // Mode empty but car=rental is a restricted selection
    const containerCar = await renderDestinations("/destinations?car=rental");
    const carCount = getResultCount(containerCar);

    expect(carCount).toBeGreaterThan(0);
    expect(carCount).toBeLessThan(allCount);
  }, 15000);

  it("D1: ferry-only URL creates no hidden restriction (shows the full catalogue)", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerAll = await renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerFerry = await renderDestinations("/destinations?mode=ferry");
    const ferryCount = getResultCount(containerFerry);

    // Ferry has no Explore chip; a ferry-only URL must not silently filter
    // the catalogue while the modal reads "Any transport".
    expect(ferryCount).toBe(allCount);
  }, 15000);

  it("D1: junk car value and legacy mode labels are rejected, not restrictive", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerAll = await renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerJunk = await renderDestinations(
      "/destinations?car=whatever&mode=local&mode=express",
    );
    const junkCount = getResultCount(containerJunk);

    expect(junkCount).toBe(allCount);
  }, 15000);

  it("D1: mixed URL keeps valid modes and drops ferry from the restriction", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerAll = await renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerMixed = await renderDestinations(
      "/destinations?mode=train&mode=shinkansen&mode=bus&mode=flight&mode=ferry",
    );
    const mixedCount = getResultCount(containerMixed);

    expect(mixedCount).toBeGreaterThan(0);
    expect(mixedCount).toBeLessThan(allCount);
  }, 15000);
});

describe("Clear/Reset Behavior (KAI-63)", () => {
  it("clearing filters restores the full catalogue state exactly like fresh Explore", async () => {
    // 1. Get baseline fresh Explore count (with origin so topology runs)
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerFresh = await renderDestinations("/destinations");
    const freshCount = getResultCount(containerFresh);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    // 2. Render with active URL filters
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerFiltered = await renderDestinations(
      "/destinations?budget=3&party=4&car=rental&mode=train",
    );
    const filteredCount = getResultCount(containerFiltered);
    // KAI-217B repair: the budget-tier filter is CANONICAL-ONLY (no
    // budgetMax fallback). The test's mocked catalogue has no destination
    // with a complete engine train cost from the fixture origin, so the
    // strict filter yields 0 — honest: a partial/incomplete engine result
    // never passes a strict tier filter. What matters is the Clear/Reset
    // contract: clearing restores the full fresh catalogue below.
    expect(filteredCount).toBeLessThan(freshCount);

    // 3. Click "Clear all"
    const clearBtn = Array.from(
      containerFiltered.querySelectorAll("button"),
    ).find(
      (btn) =>
        btn.textContent?.includes("Clear all") ||
        btn.textContent?.includes("すべてクリア"),
    );
    expect(clearBtn).not.toBeUndefined();
    act(() => {
      clearBtn?.click();
    });

    // 4. Assert count equals fresh Explore baseline
    const resetCount = getResultCount(containerFiltered);
    expect(resetCount).toBe(freshCount);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Invariant 5: URL restoration does not re-inject transport defaults
// ---------------------------------------------------------------------------

describe("URL state restoration — no invisible defaults", () => {
  it("URL with only car=none produces no specific transport modes in output", async () => {
    const container = await renderDestinations(
      "/destinations?car=none&sort=recommended",
    );
    const params = new URLSearchParams(getLocationSearch(container));
    const hasSpecificModes = params.getAll("mode").some((m) => m !== "none");
    expect(hasSpecificModes).toBe(false);
  });

  it("URL with duration=any+sort=recommended produces same count as blank URL", async () => {
    const containerBlank = await renderDestinations("/destinations");
    const blankCount = getResultCount(containerBlank);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerParams = await renderDestinations(
      "/destinations?sort=recommended&duration=any",
    );
    const paramsCount = getResultCount(containerParams);

    expect(paramsCount).toBe(blankCount);
  });
});

// ---------------------------------------------------------------------------
// KAI-63 D4: duration evidence must not gate mode eligibility
// ---------------------------------------------------------------------------

describe("D4: reachability and duration are independent (mode eligibility)", () => {
  function setYokohamaOrigin() {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";
  }

  it("does not recommend Kyoto from metadata-only train evidence", async () => {
    setYokohamaOrigin();

    // Kyoto's legacy number is not an authorization source. Without a
    // canonical origin-aware corridor, it remains unavailable for this
    // personalized query.
    const container = await renderDestinations(
      "/destinations?mode=train&q=kyoto",
    );
    const headings = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent ?? "",
    );

    expect(headings.some((text) => text.includes("Kyoto City"))).toBe(false);
  }, 15000);

  it("explicit Full-day duration still applies the duration gate", async () => {
    setYokohamaOrigin();

    const container = await renderDestinations(
      "/destinations?mode=train&duration=fullDay&q=kyoto",
    );
    const headings = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent ?? "",
    );

    // Same destination is excluded under the explicit day-trip contract.
    expect(headings.some((text) => text.includes("Kyoto City"))).toBe(false);
  }, 15000);

  it("mode=train with Any duration shows strictly more than the day-trip gate", async () => {
    setYokohamaOrigin();

    const containerAny = await renderDestinations("/destinations?mode=train");
    const anyCount = getResultCount(containerAny);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerDayTrip = await renderDestinations(
      "/destinations?mode=train&duration=fullDay",
    );
    const dayTripCount = getResultCount(containerDayTrip);

    expect(anyCount).toBeGreaterThan(0);
    expect(anyCount).toBeGreaterThan(dayTripCount);
  }, 30000);
});

// ---------------------------------------------------------------------------
// KAI-275: Personal-Car-only (car=my_car&mode=none) must stay car-only.
// ---------------------------------------------------------------------------

describe("KAI-275 Personal-Car-only Explore state", () => {
  it("card travel rows under car=my_car&mode=none never show train/bus/plane icons", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";
    const container = await renderDestinations(
      "/destinations?car=my_car&mode=none",
    );
    const count = getResultCount(container);
    expect(count).toBeGreaterThan(0);
    const rows = container.querySelectorAll(
      '[data-testid="destination-card-travel-time"]',
    );
    expect(rows.length).toBeGreaterThan(0);
    const iconClasses = Array.from(rows).flatMap((row) =>
      Array.from(row.querySelectorAll("svg")).map(
        (svg) => svg.getAttribute("class") ?? "",
      ),
    );
    // Personal-Car-only: no public-transport icon may appear anywhere.
    expect(iconClasses.some((c) => c.includes("lucide-train-front"))).toBe(
      false,
    );
    expect(iconClasses.some((c) => c.includes("lucide-bus"))).toBe(false);
    expect(iconClasses.some((c) => c.includes("lucide-plane"))).toBe(false);
    expect(iconClasses.some((c) => c.includes("lucide-map-pin"))).toBe(false);
    // Car icons must be present (eligible destinations show the car row).
    expect(iconClasses.some((c) => c.includes("lucide-car"))).toBe(true);
  }, 20000);

  it("direct Explore with no transport params stays Any (unrestricted baseline)", async () => {
    tripStoreMock.homeStationCoords = null;
    tripStoreMock.homeStationTransportZoneId = undefined;
    const container = await renderDestinations("/destinations");
    const count = getResultCount(container);
    expect(count).toBeGreaterThan(600);
  }, 20000);
});

// ---------------------------------------------------------------------------
// KAI-275 follow-up: restricted budget + Personal Car discovery must retain
// partial estimates (no complete total during discovery) instead of dropping
// every destination to zero results.
// ---------------------------------------------------------------------------

describe("KAI-275 follow-up Explore budget x Personal Car", () => {
  it("Personal Car + Standard budget returns non-zero results (partial subtotals retained)", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";
    const container = await renderDestinations(
      "/destinations?car=my_car&mode=none&budgetTier=standard&budget=50000",
    );
    const count = getResultCount(container);
    // Before the fix: 0 (every partial car estimate failed the total-only
    // filter). After: bounded on-site subtotals below the ceiling retain.
    expect(count).toBeGreaterThan(0);
  }, 20000);

  it("Personal Car + Economy tier behaves truthfully (keeps partials under the ceiling)", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";
    const container = await renderDestinations(
      "/destinations?car=my_car&mode=none&budgetTier=economy&budget=40000",
    );
    const count = getResultCount(container);
    expect(count).toBeGreaterThan(0);
  }, 20000);

  it("train-only + Standard budget keeps the existing complete-total behavior", async () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";
    const container = await renderDestinations(
      "/destinations?mode=train&budgetTier=standard&budget=50000",
    );
    const count = getResultCount(container);
    expect(count).toBeGreaterThan(0);
  }, 20000);
});
