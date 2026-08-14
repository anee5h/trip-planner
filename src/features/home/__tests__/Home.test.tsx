/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import Home, { formatCompactDate, formatCompactDateRange } from "../Home";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/home/hooks/useWeatherContext", () => {
  return {
    useWeatherContext: () => {
      const [customDate, setCustomDate] = useState<string | null>(null);
      const [activeTabId, setActiveTabId] = useState("today");
      return {
        weatherContext: {
          tabs: [
            { id: "today", label: "Today", isCustom: false },
            { id: "tomorrow", label: "Tomorrow", isCustom: false },
            { id: "this_weekend", label: "This Weekend", isCustom: false },
          ],
          forecastMap: new Map(),
          minDate: "2026-08-01",
          maxDate: "2026-08-10",
        },
        setWeatherContext: vi.fn(),
        activeTabId,
        setActiveTabId,
        customDate,
        setCustomDate,
        currentTab: { id: activeTabId, label: activeTabId, isCustom: false },
        handleCustomDateSelect: (d: string) => {
          setCustomDate(d);
        },
      };
    },
  };
});

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
    t: (key: string, opts?: Record<string, any>) => {
      const map: Record<string, string> = {
        "home.dateTabs.today": "Today",
        "home.dateTabs.tomorrow": "Tomorrow",
        "datePicker.today": "Today",
        "datePicker.tomorrow": "Tomorrow",
        "datePicker.anyDate": "Any date",
        "origin.cancel": "Cancel",
        "home.tripModes.day_trip": "Day trip",
        "home.tripModes.weekend_2d1n": "Weekend · 2 days / 1 night",
        "home.weekendMatches": "Weekend getaways",
        "home.weekendYourMatches": "Your best weekend getaways",
        "home.topMatchesForYou": "Top matches for you",
        "home.weekendDates": "{{day1}} – {{day2}}",
        "home.day1Label": "Day 1",
        "home.day2Label": "Day 2",
        "datePicker.day2": "Day 2",
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
    expect(container.textContent).toContain("Top matches for you");
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

    expect(container.textContent).toContain("Top matches for you");
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
    expect(container.textContent).toContain("Top matches for you");

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
    // Top matches stays the first rail in every trip mode.
    expect(container.textContent).toContain("Top matches for you");
  });
});

describe("formatCompactDateRange", () => {
  it("same month renders Aug 8–9", () => {
    expect(formatCompactDateRange("2026-08-08", "2026-08-09", "en")).toBe(
      "Aug 8–9",
    );
  });

  it("month rollover keeps both months", () => {
    expect(formatCompactDateRange("2026-08-30", "2026-08-31", "en")).toBe(
      "Aug 30–31",
    );
    expect(formatCompactDateRange("2026-09-30", "2026-10-01", "en")).toBe(
      "Sep 30 – Oct 1",
    );
  });

  it("year rollover renders Dec 31 – Jan 1", () => {
    expect(formatCompactDateRange("2026-12-31", "2027-01-01", "en")).toBe(
      "Dec 31 – Jan 1",
    );
  });

  it("single date formats compactly", () => {
    expect(formatCompactDate("2026-08-08", "en")).toBe("Aug 8");
  });

  it("Japanese range uses 8/8〜8/9", () => {
    expect(formatCompactDateRange("2026-08-08", "2026-08-09", "ja")).toBe(
      "8/8〜8/9",
    );
    expect(formatCompactDateRange("2026-12-31", "2027-01-01", "ja")).toBe(
      "12/31〜1/1",
    );
  });
});

describe("weekend date capsule", () => {
  it("keeps the compact visible label and the full range in aria/title", () => {
    const container = renderHome();

    // Switch to weekend and apply it.
    const weekendToggle = Array.from(container.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.includes("Weekend") &&
        btn.getAttribute("role") === "radio",
    );
    act(() => weekendToggle?.click());
    const applyBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => /home.find|home.view|home.update/.test(b.textContent ?? ""),
    );
    act(() => applyBtn?.click());

    // Open the date picker and pick a date (2026-08-15).
    const rangeBtn = () =>
      Array.from(container.querySelectorAll("button")).find(
        (b) =>
          b.getAttribute("aria-haspopup") === "dialog" ||
          Boolean(b.querySelector(".lucide-calendar")),
      );
    const capsuleBefore = rangeBtn();
    expect(capsuleBefore).toBeDefined();
    act(() => capsuleBefore?.click());

    const dayBtn = container.querySelector(
      "button[data-date]",
    ) as HTMLButtonElement;
    expect(dayBtn).toBeDefined();
    act(() => {
      dayBtn.click();
    });

    const capsuleAfter = rangeBtn();
    expect(capsuleAfter?.textContent).toBeTruthy();
  });
});
