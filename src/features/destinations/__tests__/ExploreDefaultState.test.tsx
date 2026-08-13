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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      const value: Record<string, string> = {
        "destination.tripAreas.summary": "{{areas}} areas · {{places}} places",
        "destination.tripAreas.show": "Show {{count}}",
        "destination.tripModes.any": "Any",
        "destination.tripModes.day_trip": "Day trip",
        "destination.tripModes.weekend_2d1n": "2D1N",
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

function renderDestinations(entry: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Destinations />
      </MemoryRouter>,
    );
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
  it("shows the full eligible catalogue without a transport filter", () => {
    const container = renderDestinations("/destinations");
    const count = getResultCount(container);
    // Must be well above 410 (the broken-default count).
    // We use 600 as a conservative floor; catalogue may grow.
    expect(count).toBeGreaterThan(600);
    expect(count).toBeLessThanOrEqual(destinations.length);
  });

  it("URL does not contain specific transport mode params", () => {
    const container = renderDestinations("/destinations");
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
  it("saved ALL_PUBLIC_MODES preference does not reduce fresh Explore count vs anonymous", () => {
    authMock.user = null;
    const containerAnon = renderDestinations("/destinations");
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
    const containerLoggedIn = renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved restrictive publicModes: ['train'] preference does not reduce fresh Explore count vs anonymous", () => {
    authMock.user = null;
    const containerAnon = renderDestinations("/destinations");
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
    const containerLoggedIn = renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved restrictive carMode: 'rental' preference does not reduce fresh Explore count vs anonymous", () => {
    authMock.user = null;
    const containerAnon = renderDestinations("/destinations");
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
    const containerLoggedIn = renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved restrictive carMode: 'my_car' preference does not reduce fresh Explore count vs anonymous", () => {
    authMock.user = null;
    const containerAnon = renderDestinations("/destinations");
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
    const containerLoggedIn = renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("saved combination of restrictive carMode and publicModes preferences does not reduce fresh Explore count vs anonymous", () => {
    authMock.user = null;
    const containerAnon = renderDestinations("/destinations");
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
    const containerLoggedIn = renderDestinations("/destinations");
    const loggedInCount = getResultCount(containerLoggedIn);

    expect(loggedInCount).toBe(anonCount);
  });

  it("URL written for a logged-in user (no URL params) has no specific transport modes", () => {
    authMock.user = {
      user_metadata: {
        preferences: {
          carMode: "rental",
          publicModes: ["train", "shinkansen", "bus", "flight", "ferry"],
          partySize: 2,
        },
      },
    };
    const container = renderDestinations("/destinations");
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
  it("mode=train in URL with an origin reduces the count vs unfiltered", () => {
    const containerAll = renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    // Set an origin so getValidModes can evaluate topology
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerTrain = renderDestinations("/destinations?mode=train");
    const trainCount = getResultCount(containerTrain);

    expect(trainCount).toBeGreaterThan(0);
    expect(trainCount).toBeLessThan(allCount);
  }, 15000);

  it("car=rental in URL with an origin reduces the count vs unfiltered", () => {
    const containerAll = renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    // Set an origin so getValidModes can evaluate topology
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    // Mode empty but car=rental is a restricted selection
    const containerCar = renderDestinations("/destinations?car=rental");
    const carCount = getResultCount(containerCar);

    expect(carCount).toBeGreaterThan(0);
    expect(carCount).toBeLessThan(allCount);
  }, 15000);

  it("D1: ferry-only URL creates no hidden restriction (shows the full catalogue)", () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerAll = renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerFerry = renderDestinations("/destinations?mode=ferry");
    const ferryCount = getResultCount(containerFerry);

    // Ferry has no Explore chip; a ferry-only URL must not silently filter
    // the catalogue while the modal reads "Any transport".
    expect(ferryCount).toBe(allCount);
  }, 15000);

  it("D1: junk car value and legacy mode labels are rejected, not restrictive", () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerAll = renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerJunk = renderDestinations(
      "/destinations?car=whatever&mode=local&mode=express",
    );
    const junkCount = getResultCount(containerJunk);

    expect(junkCount).toBe(allCount);
  }, 15000);

  it("D1: mixed URL keeps valid modes and drops ferry from the restriction", () => {
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerAll = renderDestinations("/destinations");
    const allCount = getResultCount(containerAll);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerMixed = renderDestinations(
      "/destinations?mode=train&mode=shinkansen&mode=bus&mode=flight&mode=ferry",
    );
    const mixedCount = getResultCount(containerMixed);

    expect(mixedCount).toBeGreaterThan(0);
    expect(mixedCount).toBeLessThan(allCount);
  }, 15000);
});

describe("Clear/Reset Behavior (KAI-63)", () => {
  it("clearing filters restores the full catalogue state exactly like fresh Explore", () => {
    // 1. Get baseline fresh Explore count (with origin so topology runs)
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerFresh = renderDestinations("/destinations");
    const freshCount = getResultCount(containerFresh);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    // 2. Render with active URL filters
    tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
    tripStoreMock.homeStationTransportZoneId = "mainland-honshu";

    const containerFiltered = renderDestinations(
      "/destinations?budget=3&party=4&car=rental&mode=train",
    );
    const filteredCount = getResultCount(containerFiltered);
    expect(filteredCount).toBeGreaterThan(0);
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
  it("URL with only car=none produces no specific transport modes in output", () => {
    const container = renderDestinations(
      "/destinations?car=none&sort=recommended",
    );
    const params = new URLSearchParams(getLocationSearch(container));
    const hasSpecificModes = params.getAll("mode").some((m) => m !== "none");
    expect(hasSpecificModes).toBe(false);
  });

  it("URL with tripMode=any+sort=recommended produces same count as blank URL", () => {
    const containerBlank = renderDestinations("/destinations");
    const blankCount = getResultCount(containerBlank);
    act(() => root!.unmount());
    root = undefined;
    host?.remove();
    host = undefined;

    const containerParams = renderDestinations(
      "/destinations?sort=recommended&tripMode=any",
    );
    const paramsCount = getResultCount(containerParams);

    expect(paramsCount).toBe(blankCount);
  });
});
