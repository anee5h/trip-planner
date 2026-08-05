/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import Home from "../Home";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({
    weatherContext: {
      tabs: [
        { id: "today", label: "Today", isCustom: false },
        { id: "tomorrow", label: "Tomorrow", isCustom: false },
        { id: "this_weekend", label: "This Weekend", isCustom: false },
      ],
      forecastMap: {},
      minDate: "2026-08-01",
      maxDate: "2026-08-10",
    },
    setWeatherContext: vi.fn(),
    activeTabId: "today",
    setActiveTabId: vi.fn(),
    customDate: null,
    setCustomDate: vi.fn(),
    currentTab: { id: "today", label: "Today", isCustom: false },
    handleCustomDateSelect: vi.fn(),
  }),
}));

vi.mock("@/shared/services/weather/WeatherTabService", () => ({
  getTabWeatherSummary: () => ({
    dateLabel: "SATURDAY, AUG 1",
    temp: 28,
    desc: "Sunny",
  }),
  getNextCalendarDate: (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return `${y}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
  },
  getForecastDaysForRange: () => [
    { date: "2026-08-01", desc: "Sunny", maxTemp: 30 },
    { date: "2026-08-02", desc: "Cloudy", maxTemp: 28 },
  ],
}));

vi.mock(
  "@/shared/services/recommendation/RecommendationContext",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      normalizeWeatherDescription: (desc: string) =>
        desc.toLowerCase() === "sunny"
          ? ("clear" as const)
          : ("cloudy" as const),
    };
  },
);

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    favorites: [],
    isVisited: () => false,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    homeStation: "Tokyo Station",
    canMutateProfile: true,
    canSelectOrigin: true,
    isComparing: () => false,
    toggleCompare: vi.fn(),
    compareList: [],
  }),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "home.dateTabs.today": "Today",
        "home.dateTabs.tomorrow": "Tomorrow",
        "home.dateTabs.this_weekend": "This Weekend",
        "home.weatherConditions.sunny": "Sunny",
        "origin.cancel": "Cancel",
        "home.tripModes.day_trip": "Day trip",
        "home.tripModes.weekend_2d1n": "Weekend · 2 days / 1 night",
        "home.weekendMatches": "Weekend getaways",
        "home.weekendYourMatches": "Your best weekend getaways",
        "home.weekendDates": "{{day1}} – {{day2}}",
        "home.weekendNoResultsTitle": "No weekend-ready destinations found",
        "home.accommodationPresets.custom": "Custom",
        "home.weekendBadge": "2 days / 1 night",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderHome() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("Home Integration Tests", () => {
  it("renders homepage planner and top matches section", () => {
    const container = renderHome();

    expect(container.textContent).toContain("home.headline");
    expect(container.textContent).toContain("home.planner");
    expect(container.textContent).toContain("home.find");
    expect(container.textContent).toContain("home.topMatches");
    expect(container.textContent).toContain("origin.from");
    const today = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Today"),
    );
    expect(today?.textContent).toContain("28°");
    expect(today?.textContent).toContain("Sunny 28°");

    const subtitle = Array.from(container.querySelectorAll("p")).find(
      (node) => node.textContent === "home.subtitle",
    );
    expect(subtitle?.className).toContain("hidden");
    expect(subtitle?.className).toContain("sm:block");

    const weekend = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent === "This Weekend",
    );
    expect(weekend).toBeUndefined();
  });

  it("transitions button state: Find matches -> View matches -> Update matches", () => {
    const container = renderHome();

    // 1. Initial state: Find matches
    let primaryBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("home.find") ||
        b.textContent?.includes("home.view") ||
        b.textContent?.includes("home.update"),
    );
    expect(primaryBtn?.textContent).toContain("home.find");

    // 2. Click Find matches to apply initial planner state
    act(() => {
      primaryBtn?.click();
    });

    primaryBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("home.find") ||
        b.textContent?.includes("home.view") ||
        b.textContent?.includes("home.update"),
    );
    expect(primaryBtn?.textContent).toContain("home.view");

    // 3. Edit draft control (party size) -> button becomes Update matches
    const plusBtn = container.querySelector(
      'button[aria-label="home.increaseParty"]',
    ) as HTMLButtonElement;
    expect(plusBtn).toBeDefined();

    act(() => {
      plusBtn.click();
    });

    primaryBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("home.find") ||
        b.textContent?.includes("home.view") ||
        b.textContent?.includes("home.update"),
    );
    expect(primaryBtn?.textContent).toContain("home.update");
  });

  it("edits the origin in a modal", () => {
    const container = renderHome();
    const edit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "origin.edit",
    );

    act(() => edit?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const cancel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel",
    );
    act(() => cancel?.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Surprise Me opens modal without applying draft planner state to top matches", () => {
    const container = renderHome();

    const surpriseBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("home.surprise"),
    );
    expect(surpriseBtn).toBeDefined();

    act(() => {
      surpriseBtn?.click();
    });

    // Heading should still say "Top matches for today" because applyPlannerState was not called
    expect(container.textContent).toContain("home.topMatches");
  });

  it("weekend mode: toggling to Weekend changes heading after apply", () => {
    const container = renderHome();

    // Find and click the weekend toggle button
    const weekendToggle = Array.from(container.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.includes("Weekend") &&
        btn.getAttribute("role") === "radio",
    );
    expect(weekendToggle).toBeDefined();

    act(() => {
      weekendToggle?.click();
    });

    // The toggle should now show weekend mode
    // Default heading should still be day-trip since we haven't applied yet
    expect(container.textContent).toContain("home.topMatches");

    // Click Find/Apply to see if weekend heading appears
    const applyBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("home.find") ||
        b.textContent?.includes("home.view") ||
        b.textContent?.includes("home.update"),
    );
    act(() => {
      applyBtn?.click();
    });
    // After applying, the heading should show weekend user matches
    expect(container.textContent).toContain("Your best weekend getaways");
  });
});
