/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import Destinations from "../Destinations";
import { localizeDateConditionSummary } from "@/shared/utils/recommendationLabels";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const weatherMock = vi.hoisted(() => ({
  forecastMap: undefined as Map<string, unknown> | undefined,
}));

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: { lat: 35.6812, lng: 139.7671 },
  homeStationTransportZoneId: "zone-1",
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

function renderDestinations(entry = "/destinations") {
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

function dateFilterButton(
  container: HTMLElement,
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) => {
    const text = b.textContent ?? "";
    return (
      b.querySelector(".lucide-calendar-days") &&
      (text.includes("Date") || /^[A-Z][a-z]{2} \d{1,2}$/.test(text.trim()))
    );
  }) as HTMLButtonElement | undefined;
}

describe("Destinations date filter", () => {
  it("shows no date chip for ordinary any-date browsing", () => {
    const container = renderDestinations();
    expect(dateFilterButton(container)?.textContent).toContain("Date");
    expect(container.textContent).not.toContain("Typical conditions");
    expect(container.textContent).not.toContain("Forecast for");
  });

  it("restores a selected date from the URL with a seasonal label", () => {
    const container = renderDestinations(
      "/destinations?tripMode=weekend_2d1n&date=2030-06-15",
    );
    expect(dateFilterButton(container)?.textContent).toContain("Jun 15");
    // Real i18n resources render the date-level seasonal label.
    expect(container.textContent).toContain("Typical conditions for June");
  });

  it("labels a date inside the forecast window as a forecast", () => {
    weatherMock.forecastMap = new Map([
      ["2030-06-15", { date: "2030-06-15", desc: "Clear", icon: "sun" }],
      ["2030-06-16", { date: "2030-06-16", desc: "Cloudy", icon: "cloud" }],
    ]);
    const container = renderDestinations(
      "/destinations?tripMode=weekend_2d1n&date=2030-06-15",
    );
    expect(container.textContent).toContain("Forecast for Jun 15–Jun 16");
  });

  it("ignores past URL dates", () => {
    const container = renderDestinations("/destinations?date=2020-01-01");
    expect(dateFilterButton(container)?.textContent).toContain("Date");
    expect(container.textContent).not.toContain("Jan 1");
  });

  it("ignores invalid URL dates", () => {
    const container = renderDestinations("/destinations?date=not-a-date");
    expect(dateFilterButton(container)?.textContent).toContain("Date");
  });

  it("date input enforces today as the minimum", () => {
    renderDestinations("/destinations?date=2030-06-15");
    act(() => dateFilterButton(host!)?.click());
    const input = host!.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeDefined();
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(input.getAttribute("min")).toBe(todayIso);
  });
});

describe("Japanese date condition labels", () => {
  it("renders the same evidence distinction in JA", () => {
    expect(localizeDateConditionSummary(["2030-06-15"], undefined, "ja")).toBe(
      "6月の平年並みの気候",
    );
    expect(
      localizeDateConditionSummary(
        ["2030-06-15"],
        new Map([
          [
            "2030-06-15",
            {
              date: "2030-06-15",
              maxTemp: 25,
              minTemp: 15,
              weatherCode: 0,
              desc: "Clear",
              icon: "sun",
            } as never,
          ],
        ]),
        "ja",
      ),
    ).toBe("6/15の天気予報");
  });
});
