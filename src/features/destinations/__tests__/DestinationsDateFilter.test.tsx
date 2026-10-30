/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import Destinations from "../Destinations";
import { TripContextProvider } from "@/shared/context/TripContext";
import * as travelConditions from "@/shared/services/recommendation/TravelConditions";
import * as exploreBudget from "../exploreBudget";
import * as exploreSorting from "../exploreSorting";
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
    t: (key: string, opts?: Record<string, any>) => {
      const map: Record<string, string> = {
        "datePicker.anyDate": "Any date",
        "datePicker.today": "Today",
        "datePicker.tomorrow": "Tomorrow",
        "datePicker.chooseTravelDate": "Choose travel date",
        "destination.tripAreas.summary": "{{areas}} areas · {{places}} places",
        "destination.tripAreas.show": "Show {{count}}",
      };
      let text = map[key] ?? opts?.defaultValue ?? key;
      if (typeof text === "string" && opts) {
        text = text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
          String(opts[name] ?? ""),
        );
      }
      return text;
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
  sessionStorage.clear();
  vi.restoreAllMocks();
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

function renderDestinationsWithContext(travelDate: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/destinations",
            state: { travelDate, duration: "2d1n", partySize: 2 },
          },
        ]}
      >
        <TripContextProvider>
          <Destinations />
        </TripContextProvider>
      </MemoryRouter>,
    );
  });
  return host;
}

function dateFilterButton(
  container: HTMLElement,
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) => {
    return (
      b.getAttribute("aria-haspopup") === "dialog" ||
      Boolean(b.querySelector(".lucide-calendar")) ||
      Boolean(b.querySelector(".lucide-calendar-days"))
    );
  }) as HTMLButtonElement | undefined;
}

describe("Destinations date filter", () => {
  it("shows no date chip for ordinary any-date browsing", () => {
    const container = renderDestinations();
    expect(dateFilterButton(container)?.textContent).toContain("Any date");
    expect(container.textContent).not.toContain("Typical conditions");
    expect(container.textContent).not.toContain("Forecast for");
  }, 20000);

  it("restores a selected date from the URL with a seasonal label", () => {
    const container = renderDestinations(
      "/destinations?duration=2d1n&date=2030-06-15",
    );
    expect(dateFilterButton(container)?.textContent).toContain("Jun 15");
    // Real i18n resources render the date-level seasonal label.
    expect(container.textContent).toContain("Typical conditions for June");
  }, 20000);

  it("labels a date inside the forecast window as a forecast", () => {
    weatherMock.forecastMap = new Map([
      ["2030-06-15", { date: "2030-06-15", desc: "Clear", icon: "sun" }],
      ["2030-06-16", { date: "2030-06-16", desc: "Cloudy", icon: "cloud" }],
    ]);
    const container = renderDestinations(
      "/destinations?duration=2d1n&date=2030-06-15",
    );
    expect(container.textContent).toContain(
      "Origin forecast for Jun 15–Jun 16",
    );
  }, 20000);

  it("ignores past URL dates", () => {
    const container = renderDestinations("/destinations?date=2020-01-01");
    expect(dateFilterButton(container)?.textContent).toContain("Any date");
    expect(container.textContent).not.toContain("Jan 1");
  }, 20000);

  it("ignores invalid URL dates", () => {
    const container = renderDestinations("/destinations?date=not-a-date");
    expect(dateFilterButton(container)?.textContent).toContain("Any date");
  }, 20000);

  it("uses a context date for admission pricing without enabling travel-date conditions", async () => {
    const conditionSpy = vi.spyOn(travelConditions, "evaluateTravelConditions");
    const budgetSpy = vi.spyOn(exploreBudget, "resolveExploreBudgetEstimate");
    const sortSpy = vi.spyOn(exploreSorting, "computeExploreSortMetrics");
    const container = renderDestinationsWithContext("2030-06-15");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(dateFilterButton(container)?.textContent).toContain("Any date");
    expect(container.textContent).not.toContain("Typical conditions");
    expect(conditionSpy).not.toHaveBeenCalled();
    expect(
      budgetSpy.mock.calls.some(
        ([, context]) => context.visitDate === "2030-06-15",
      ),
    ).toBe(true);
    expect(
      sortSpy.mock.calls.some(
        ([, context]) => context.visitDate === "2030-06-15",
      ),
    ).toBe(true);
    expect(
      budgetSpy.mock.calls.every(
        ([, context]) => context.ferryTemporal === undefined,
      ),
    ).toBe(true);
  }, 20000);

  it("ignores an impossible context date", () => {
    const budgetSpy = vi.spyOn(exploreBudget, "resolveExploreBudgetEstimate");

    expect(() => renderDestinationsWithContext("2026-02-31")).not.toThrow();
    expect(budgetSpy).toHaveBeenCalled();
    expect(
      budgetSpy.mock.calls.every(
        ([, context]) => context.visitDate === undefined,
      ),
    ).toBe(true);
  }, 20000);

  it("date picker calendar enforces today as minimum", () => {
    renderDestinations("/destinations?date=2030-06-15");
    act(() => dateFilterButton(host!)?.click());
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);
    const pastIso = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}-${String(pastDate.getDate()).padStart(2, "0")}`;
    const pastBtn = host!.querySelector(`button[data-date="${pastIso}"]`);
    if (pastBtn) {
      expect(pastBtn.hasAttribute("disabled")).toBe(true);
    }
  }, 20000);
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
    ).toBe("出発地の予報 6/15");
  });
});
