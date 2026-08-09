/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
        <Destinations />
      </MemoryRouter>,
    );
  });
  return host;
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
});
