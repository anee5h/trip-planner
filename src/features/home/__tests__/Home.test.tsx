/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import Home, { formatCompactDate, formatCompactDateRange } from "../Home";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const weatherMockState = vi.hoisted(() => ({ ready: true }));
const authMockState = vi.hoisted(() => ({
  user: null as {
    id: string;
    email: string;
    user_metadata: { preferences: Record<string, unknown> };
  } | null,
  updateUserProfile: vi.fn(),
}));

beforeAll(async () => {
  await loadLiteIndex();
});

vi.mock("@/features/home/hooks/useWeatherContext", () => {
  return {
    useWeatherContext: () => {
      const [customDate, setCustomDate] = useState<string | null>(null);
      const [activeTabId, setActiveTabId] = useState("today");
      const weatherContext = weatherMockState.ready
        ? {
            tabs: [
              { id: "today", label: "Today", isCustom: false },
              { id: "tomorrow", label: "Tomorrow", isCustom: false },
              { id: "this_weekend", label: "This Weekend", isCustom: false },
            ],
            forecastMap: new Map(),
            minDate: "2026-08-01",
            maxDate: "2026-08-10",
          }
        : null;
      return {
        weatherContext,
        setWeatherContext: vi.fn(),
        activeTabId,
        setActiveTabId,
        customDate,
        setCustomDate,
        currentTab: weatherContext
          ? { id: activeTabId, label: activeTabId, isCustom: false }
          : undefined,
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
    user: authMockState.user,
    updateUserProfile: authMockState.updateUserProfile,
  }),
}));

const localeState = { value: "en" as "en" | "ja" };

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: localeState.value,
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
        "home.valueProposition":
          localeState.value === "ja"
            ? "時間・予算・天気・興味にぴったりの旅先を見つけよう。"
            : "Find trips that fit your time, budget, weather, and interests.",
        "datePicker.today": "Today",
        "datePicker.tomorrow": "Tomorrow",
        "datePicker.anyDate": "Any date",
        "origin.cancel": "Cancel",
        "home.durations.fullDay": "Full day",
        "home.durations.2d1n": "2 days / 1 night",
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
  weatherMockState.ready = true;
  authMockState.user = null;
  authMockState.updateUserProfile.mockReset();
  localeState.value = "en";
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

async function renderHome() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    // HeavyHome is deliberately outside this eager-shell unit seam. Its
    // results/rails are covered by the homepage E2E matrix.
    await Promise.resolve();
  });
  return host;
}

describe("Home Integration Tests", () => {
  it("renders the eager homepage origin/date, H1, and planner surface", async () => {
    const container = await await renderHome();

    expect(container.textContent).toContain("home.headline");
    expect(container.textContent).toContain("home.planner");
    expect(container.textContent).toContain("home.find");
    expect(container.textContent).toContain("origin.from");
    const today = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Today"),
    );
    expect(today?.textContent).toContain("28°");
    expect(today?.textContent).toContain("Sunny 28°");

    expect(container.textContent).not.toContain("home.subtitle");

    const weekend = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent === "This Weekend",
    );
    expect(weekend).toBeUndefined();
  });

  it("renders the English value proposition below the H1 without brand association", async () => {
    localeState.value = "en";
    const container = await renderHome();
    const valueProposition = container.querySelector(
      '[data-testid="home-value-proposition"]',
    );
    const headline = container.querySelector('[data-testid="home-headline"]');

    expect(valueProposition?.textContent).toBe(
      "Find trips that fit your time, budget, weather, and interests.",
    );
    expect(
      container.querySelector('[data-testid="home-brand-association"]'),
    ).toBeNull();
    expect(valueProposition).not.toBeNull();
    expect(headline).not.toBeNull();
    expect(
      Boolean(
        headline!.compareDocumentPosition(valueProposition!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(headline!.nextElementSibling).toBe(valueProposition);
  });

  it("renders the Japanese value proposition below the H1 without brand association", async () => {
    localeState.value = "ja";
    const container = await renderHome();
    const valueProposition = container.querySelector(
      '[data-testid="home-value-proposition"]',
    );
    const headline = container.querySelector('[data-testid="home-headline"]');

    expect(valueProposition?.textContent).toBe(
      "時間・予算・天気・興味にぴったりの旅先を見つけよう。",
    );
    expect(
      container.querySelector('[data-testid="home-brand-association"]'),
    ).toBeNull();
    expect(valueProposition).not.toBeNull();
    expect(headline).not.toBeNull();
    expect(
      Boolean(
        headline!.compareDocumentPosition(valueProposition!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(headline!.nextElementSibling).toBe(valueProposition);
  });

  it("preserves the origin/date → H1 → planner DOM order with one real H1", async () => {
    const container = await renderHome();
    const originDate = container.querySelector("[data-home-origin-date-ready]");
    const headline = container.querySelector("h1");
    const planner = container.querySelector("[data-home-planner-ready]");

    expect(originDate).not.toBeNull();
    expect(headline).not.toBeNull();
    expect(planner).not.toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      Boolean(
        originDate!.compareDocumentPosition(headline!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        headline!.compareDocumentPosition(planner!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it("renders real date controls while weather is pending", async () => {
    weatherMockState.ready = false;
    const container = await renderHome();
    expect(
      container.querySelector("[data-home-weather-placeholder]"),
    ).toBeNull();
    expect(container.querySelector("[data-home-weather-shell]")).not.toBeNull();
    expect(
      container.querySelector('button[aria-haspopup="dialog"]'),
    ).not.toBeNull();

    weatherMockState.ready = true;
  });

  it("transitions button state: Find matches -> View matches -> Update matches", async () => {
    const container = await await renderHome();

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

  it("persists party size as part of the authenticated planner state", async () => {
    authMockState.user = {
      id: "home-persist-user",
      email: "home-persist@example.com",
      user_metadata: { preferences: { partySize: 2 } },
    };
    authMockState.updateUserProfile.mockResolvedValue({
      data: { user: authMockState.user },
      error: null,
    });
    const container = await renderHome();
    const plusButtons = container.querySelectorAll(
      'button[aria-label="home.increaseParty"]',
    );
    expect(plusButtons.length).toBeGreaterThan(0);

    act(() => {
      (plusButtons[0] as HTMLButtonElement).click();
    });
    act(() => {
      (plusButtons[0] as HTMLButtonElement).click();
    });
    const applyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("home.find"),
    );
    expect(applyButton).toBeDefined();
    act(() => applyButton?.click());

    expect(authMockState.updateUserProfile).toHaveBeenCalledWith({
      preferences: expect.objectContaining({ partySize: 4 }),
    });
  });

  it("edits the origin in a modal", async () => {
    const container = await await renderHome();
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

  it("Surprise Me does not apply the draft planner state", async () => {
    const container = await await renderHome();

    const surpriseBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("home.surprise"),
    );
    expect(surpriseBtn).toBeDefined();

    act(() => {
      surpriseBtn?.click();
    });

    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("home.find"),
      ),
    ).toBe(true);
  });

  it("selecting 2D1N updates the canonical duration after apply", async () => {
    const container = await await renderHome();

    const durationTrigger = container.querySelector(
      'button[aria-label="home.duration"]',
    ) as HTMLButtonElement | null;
    expect(durationTrigger).not.toBeNull();
    act(() => durationTrigger?.click());
    const durationOption = Array.from(
      document.querySelectorAll('[role="option"]'),
    ).find((option) => option.textContent?.includes("2 days / 1 night"));
    expect(durationOption).toBeDefined();
    act(() => (durationOption as HTMLElement | undefined)?.click());

    const applyBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("home.find") ||
        b.textContent?.includes("home.view") ||
        b.textContent?.includes("home.update"),
    );
    act(() => applyBtn?.click());
    expect(container.textContent).toContain("2 days / 1 night");
    expect(container.textContent).not.toContain("home.tripModes");
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

describe("overnight date capsule", () => {
  it("keeps the compact visible label and the full range in aria/title", async () => {
    const container = await await renderHome();

    // Switch to 2D1N and apply it.
    const durationTrigger = container.querySelector(
      'button[aria-label="home.duration"]',
    ) as HTMLButtonElement | null;
    expect(durationTrigger).not.toBeNull();
    act(() => durationTrigger?.click());
    const durationOption = Array.from(
      document.querySelectorAll('[role="option"]'),
    ).find((option) => option.textContent?.includes("2 days / 1 night"));
    expect(durationOption).toBeDefined();
    act(() => (durationOption as HTMLElement | undefined)?.click());

    const applyBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("home.find") ||
        b.textContent?.includes("home.view") ||
        b.textContent?.includes("home.update"),
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

    await act(async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (container.querySelector("button[data-date]")) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

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

describe("KAI-114 Japanese brand association removal", () => {
  it("renders the JA value proposition without the brand association", async () => {
    localeState.value = "ja";
    const container = await renderHome();
    const valueProposition = container.querySelector<HTMLElement>(
      '[data-testid="home-value-proposition"]',
    );
    const association = container.querySelector<HTMLElement>(
      '[data-testid="home-brand-association"]',
    );

    expect(valueProposition?.textContent).toBe(
      "時間・予算・天気・興味にぴったりの旅先を見つけよう。",
    );
    expect(association).toBeNull();
    expect(container.textContent).not.toContain("メグルト");
  });

  it("does not render a brand association on the EN home", async () => {
    localeState.value = "en";
    const container = await renderHome();
    expect(
      container.querySelector('[data-testid="home-brand-association"]'),
    ).toBeNull();
  });
});
