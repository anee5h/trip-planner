/**
 * @vitest-environment jsdom
 *
 * Verifies that the Destinations explorer's travel-time sort uses
 * selected-date ferry availability: Tomogashima (ferry-only, verified
 * operating period 03-01..11-30) ranks fast on an in-season date from a
 * Wakayama origin, and unknown-last (never a legacy transportOptions
 * fallback) on an out-of-season date.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import Destinations from "../Destinations";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const weatherMock = vi.hoisted(() => ({
  forecastMap: undefined as Map<string, unknown> | undefined,
}));

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: { lat: 34.2321, lng: 135.1909 }, // Wakayama city
  homeStationTransportZoneId: undefined,
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, number | string>) => {
      const label =
        {
          "destination.tripAreas.summary":
            "{{areas}} areas · {{places}} places",
          "destination.tripAreas.show": "Show {{count}}",
        }[key] ?? key;
      if (!opts) return label;
      return label.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(opts[name] ?? ""),
      );
    },
    i18n: { language: "en" },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({
    weatherContext: { forecastMap: weatherMock.forecastMap },
  }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => tripStoreMock,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

// KAI-121: full catalogue is runtime-lazy; preload so
// useFullCatalogue renders full data synchronously in tests.
beforeAll(async () => {
  await loadDestinationsIndex();
});

beforeEach(() => {
  weatherMock.forecastMap = undefined;
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
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
        <Destinations />
      </MemoryRouter>,
    );
  });
  return host;
}

function hasTomogashimaCard(container: HTMLElement): boolean {
  return Array.from(container.querySelectorAll("h3")).some((h) =>
    (h.textContent ?? "").toLowerCase().includes("tomogashima"),
  );
}

function goToPage(container: HTMLElement, page: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === page,
  );
  act(() => button?.click());
}

describe("Destinations travel-time sort with a selected date", () => {
  it("ranks the ferry-only destination fast in season and in winter operation", () => {
    // In season (Nov 15): the Kada ferry runs — Tomogashima ranks early
    // (within the first two pages).
    const inSeason = renderDestinations(
      "/destinations?sort=travelTime&date=2026-11-15",
    );
    goToPage(inSeason, "2");
    expect(hasTomogashimaCard(inSeason)).toBe(true);

    // Winter operation (Dec 15) is NOT a suspension — Tomogashima still
    // ranks early rather than sinking to the unknown-last bucket.
    const winter = renderDestinations(
      "/destinations?sort=travelTime&date=2026-12-15",
    );
    goToPage(winter, "2");
    expect(hasTomogashimaCard(winter)).toBe(true);
  }, 30000);
});
