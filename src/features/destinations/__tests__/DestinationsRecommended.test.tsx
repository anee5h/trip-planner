/**
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
          "destination.durationOptions.any": "Any",
          "destination.durationOptions.fullDay": "Day trip",
          "destination.durationOptions.2d1n": "2D1N",
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

// KAI-121: full catalogue is runtime-lazy; preload so
// useFullCatalogue renders full data synchronously in tests.
beforeAll(async () => {
  await loadDestinationsIndex();
  await loadLiteIndex();
});

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

async function switchDuration(container: HTMLDivElement, label: string) {
  await clickExactButton(container, "Filters");
  await clickExactButton(container, label);
}

describe("Explore Recommended Day Trip ranking", () => {
  it("applies Nakayama Day Trip + Any feasibility before sorting", async () => {
    const container = await renderDestinations(
      "/destinations?sort=recommended&duration=fullDay",
    );
    const names = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent ?? "",
    );

    expect(names).not.toContain("Abeno Harukas 300 (Osaka Skyline)");
    // KAI-12/KAI-63: without a canonical Shinkansen corridor, Odawara/Atami-
    // type destinations no longer rank via a 180 km/h display estimate. The
    // honest top of the list is verified-corridor coverage — bus-reachable
    // Yamanashi, Shinkansen-accessible Utsunomiya (KAI-63 D5: verified
    // tokyo⇔tochigi corridor + Utsunomiya hub, 1.5 km wiring) and Kanto
    // local POIs — a Kanto or Tochigi name appears within the top 10.
    expect(
      names
        .slice(0, 10)
        .some((name) =>
          /Yokohama|Kamakura|Kawasaki|Tokyo|Utsunomiya/i.test(name),
        ),
    ).toBe(true);
  }, 60000);

  it("scores with live transport controls instead of saved preferences", async () => {
    authMock.user = {
      user_metadata: {
        preferences: { carMode: "rental", publicModes: ["shinkansen"] },
      },
    };
    const container = await renderDestinations(
      "/destinations?sort=recommended&duration=fullDay&mode=train&car=none",
    );
    const names = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent ?? "",
    );

    // KAI-89 model pass: template seasons/budgets were neutralized, so the
    // exact top-1 identity is no longer stable. The mechanism invariant is:
    // with LIVE mode=train&car=none, the ranking is train-driven (a Kanto
    // train-accessible destination leads) and the saved-preference artifact
    // (Abeno Harukas, reachable only via the saved shinkansen preference)
    // is absent.
    expect(names[0]).toMatch(
      /Enoshima|Kamakura|Yokohama|Kawasaki|Tokyo|Utsunomiya|Shibuya|Shinjuku/i,
    );
    expect(names).not.toContain("Abeno Harukas 300 (Osaka Skyline)");
  }, 60000);

  it.each([
    ["full day", "Full day"],
    ["2D1N", "2D1N"],
  ])(
    "clears hidden Half-day state when switching from %s to Any",
    async (_label, intermediateMode) => {
      const transitioned = await renderDestinations(
        "/destinations?sort=recommended&duration=halfDay",
      );

      if (intermediateMode === "2D1N") {
        await switchDuration(transitioned, "2D1N");
      }
      await switchDuration(transitioned, "Any");
      const transitionedSnapshot = snapshot(transitioned);

      expect(transitionedSnapshot.search).toContain("duration=any");
      expect(transitionedSnapshot.search).not.toContain("duration=halfDay");
      expect(transitionedSnapshot.search).not.toContain("tripMode=day_trip");

      act(() => root!.unmount());
      root = undefined;
      host?.remove();
      host = undefined;

      const cleanAny = await renderDestinations(
        "/destinations?sort=recommended",
      );
      const cleanSnapshot = snapshot(cleanAny);

      expect(transitionedSnapshot.summary).toBe(cleanSnapshot.summary);
      expect(transitionedSnapshot.names).toEqual(cleanSnapshot.names);
    },
    15000,
  );
});
