/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Destinations from "../Destinations";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: { lat: 35.514745, lng: 139.539692 },
  homeStationTransportZoneId: "mainland-honshu",
  originSource: "saved",
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
      const value =
        {
          "destination.tripAreas.summary":
            "{{areas}} areas · {{places}} places",
          "destination.tripAreas.show": "Show {{count}}",
          "destination.tripModes.any": "Any",
          "destination.tripModes.day_trip": "Day trip",
          "destination.tripModes.weekend_2d1n": "2D1N",
        }[key] ?? key;
      return options
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
            String(options[name] ?? ""),
          )
        : value;
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

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

beforeEach(() => {
  tripStoreMock.homeStationCoords = { lat: 35.514745, lng: 139.539692 };
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

function snapshot(container: HTMLDivElement) {
  return {
    summary: container.querySelector("#results-grid span")?.textContent ?? "",
    names: Array.from(container.querySelectorAll("h3"))
      .map((heading) => heading.textContent ?? "")
      .filter((name) => name !== "Trip preferences"),
    search:
      container.querySelector("[data-testid=location-search]")?.textContent ??
      "",
  };
}

async function clickExactButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.trim() === label ||
      (label === "Filters" && candidate.textContent?.startsWith(label)),
  );
  expect(button, `Expected button: ${label}`).toBeDefined();
  await act(async () => {
    button!.click();
  });
}

async function switchTripMode(container: HTMLDivElement, label: string) {
  await clickExactButton(container, "Filters");
  await clickExactButton(container, label);
}

describe("Explore Recommended Day Trip ranking", () => {
  it("applies Nakayama Day Trip + Any feasibility before sorting", () => {
    const container = renderDestinations(
      "/destinations?sort=recommended&tripMode=day_trip",
    );
    const names = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent ?? "",
    );

    expect(names).not.toContain("Abeno Harukas 300 (Osaka Skyline)");
    expect(
      names
        .slice(0, 5)
        .some((name) => /Yokohama|Kamakura|Kawasaki|Tokyo/i.test(name)),
    ).toBe(true);
  }, 30000);

  it("scores with live transport controls instead of saved preferences", () => {
    authMock.user = {
      user_metadata: {
        preferences: { carMode: "rental", publicModes: ["shinkansen"] },
      },
    };
    const container = renderDestinations(
      "/destinations?sort=recommended&tripMode=day_trip&mode=train&car=none",
    );
    const names = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent ?? "",
    );

    expect(names[0]).toBe("Harry Potter Studio");
    expect(names).not.toContain("Abeno Harukas 300 (Osaka Skyline)");
  }, 30000);

  it.each([
    ["day trip", "Day trip"],
    ["2D1N", "2D1N"],
  ])(
    "clears hidden Half-day state when switching from %s to Any",
    async (_label, intermediateMode) => {
      const transitioned = renderDestinations(
        "/destinations?sort=recommended&tripMode=day_trip&duration=halfDay",
      );

      if (intermediateMode === "2D1N") {
        await switchTripMode(transitioned, "2D1N");
      }
      await switchTripMode(transitioned, "Any");
      const transitionedSnapshot = snapshot(transitioned);

      expect(transitionedSnapshot.search).toContain("duration=any");
      expect(transitionedSnapshot.search).not.toContain("duration=halfDay");
      expect(transitionedSnapshot.search).not.toContain("tripMode=day_trip");

      act(() => root!.unmount());
      root = undefined;
      host?.remove();
      host = undefined;

      const cleanAny = renderDestinations("/destinations?sort=recommended");
      const cleanSnapshot = snapshot(cleanAny);

      expect(transitionedSnapshot.summary).toBe(cleanSnapshot.summary);
      expect(transitionedSnapshot.names).toEqual(cleanSnapshot.names);
    },
  );
});
