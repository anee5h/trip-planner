/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import Home from "../Home";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, number | string>) => {
      const label =
        {
          "home.dateTabs.today": "Today",
          "home.dateTabs.tomorrow": "Tomorrow",
          "home.tripModes.day_trip": "Day trip",
          "home.tripModes.weekend_2d1n": "Weekend · 2 days / 1 night",
          "home.weekendDates": "{{day1}} – {{day2}}",
          "home.day1Label": "Day 1",
          "home.day2Label": "Day 2",
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

const tripStoreMock = vi.hoisted(() => ({
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
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => tripStoreMock,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeEach(() => {
  // Real useWeatherContext → real fetchWeatherTabContext: serve a 10-day
  // Open-Meteo-shaped forecast starting today.
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(iso(d));
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({
        daily: {
          time: dates,
          weathercode: dates.map((_, i) => (i % 3 === 0 ? 0 : 61)),
          temperature_2m_max: dates.map((_, i) => 20 + i),
          temperature_2m_min: dates.map(() => 10),
        },
      }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

function renderHome(initialEntry = "/") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  let latestParams: URLSearchParams | undefined;
  let latestNavigate: ((delta: number) => void) | undefined;
  function UrlProbe() {
    const [params] = useSearchParams();
    latestParams = params;
    return null;
  }
  function NavProbe() {
    const navigate = useNavigate();
    latestNavigate = (delta: number) => navigate(delta);
    return null;
  }
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Home />
        <UrlProbe />
        <NavProbe />
      </MemoryRouter>,
    );
  });
  return {
    host,
    params: () => latestParams,
    navigate: (delta: number) => act(() => latestNavigate?.(delta)),
  };
}

async function waitForCondition(condition: () => boolean) {
  for (let i = 0; i < 50; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (condition()) return;
  }
  throw new Error("waitForCondition timed out");
}

function calendarCapsule(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.querySelector(".lucide-calendar"),
  ) as HTMLButtonElement;
  expect(button).toBeDefined();
  return button;
}

async function pickDate(host: HTMLElement, value: string) {
  // Open the picker unless it is already open.
  if (!host.querySelector("#any-future-date")) {
    act(() => calendarCapsule(host).click());
  }
  const input = host.querySelector("#any-future-date") as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Home arbitrary future dates", () => {
  it("selects an arbitrary future date and syncs date= to the URL", async () => {
    const { host, params } = renderHome();
    await waitForCondition(() => Boolean(params()?.get("date")) === false);

    act(() => calendarCapsule(host).click());
    const input = host.querySelector("#any-future-date") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.getAttribute("min")).toBe(iso(new Date()));

    await pickDate(host, "2030-06-15");

    await waitForCondition(() => params()?.get("date") === "2030-06-15");
    // The capsule shows the picked date, not a forecast-window date.
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jun 15") ?? false,
    );
    // No forecast weather icon is shown for the beyond-forecast date.
    expect(calendarCapsule(host).querySelector(".lucide-cloud")).toBeNull();
    expect(calendarCapsule(host).querySelector(".lucide-sun")).toBeNull();
  });

  it("restores dates across browser back and forward", async () => {
    const { host, params, navigate } = renderHome();
    await waitForCondition(() => Boolean(params()?.get("date")) === false);

    // Select date A, then date B — each deliberate selection pushes history.
    await pickDate(host, "2030-06-15");
    await waitForCondition(() => params()?.get("date") === "2030-06-15");
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jun 15") ?? false,
    );

    await pickDate(host, "2031-01-02");
    await waitForCondition(() => params()?.get("date") === "2031-01-02");
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jan 2") ?? false,
    );

    // Back: restores date A in URL, state and the visible capsule.
    navigate(-1);
    await waitForCondition(() => params()?.get("date") === "2030-06-15");
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jun 15") ?? false,
    );

    // Forward: restores date B.
    navigate(1);
    await waitForCondition(() => params()?.get("date") === "2031-01-02");
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jan 2") ?? false,
    );
  });

  it("restores the date from the URL on reload", async () => {
    const { host } = renderHome("/?date=2030-06-15");
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jun 15") ?? false,
    );
  });

  it("normalizes a past URL date away safely", async () => {
    const { host, params } = renderHome("/?date=2020-01-01");
    await waitForCondition(() => params()?.get("date") === null);
    expect(calendarCapsule(host).textContent).not.toContain("Jan 1");
  });

  it("shows the derived Day 2 for 2D1N in the picker", async () => {
    const { host } = renderHome("/?date=2030-06-15");
    await waitForCondition(
      () => calendarCapsule(host).textContent?.includes("Jun 15") ?? false,
    );

    const weekendToggle = Array.from(host.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.includes("Weekend") &&
        btn.getAttribute("role") === "radio",
    ) as HTMLButtonElement;
    act(() => weekendToggle.click());
    const applyBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      /home.find|home.view|home.update/.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    act(() => applyBtn.click());

    act(() => calendarCapsule(host).click());
    await waitForCondition(() =>
      Array.from(host.querySelectorAll("p")).some((p) =>
        p.textContent?.includes("Day 2"),
      ),
    );
    expect(
      Array.from(host.querySelectorAll("p")).some((p) =>
        p.textContent?.includes("Jun 16"),
      ),
    ).toBe(true);
  });
});
