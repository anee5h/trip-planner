/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import Home from "../Home";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, number | string>) => {
      const raw =
        {
          "home.dateTabs.today": "Today",
          "home.dateTabs.tomorrow": "Tomorrow",
          "datePicker.today": "Today",
          "datePicker.tomorrow": "Tomorrow",
          "datePicker.anyDate": "Any date",
          "home.tripModes.day_trip": "Day trip",
          "home.tripModes.weekend_2d1n": "Weekend · 2 days / 1 night",
          "home.weekendDates": "{{day1}} – {{day2}}",
          "home.day1Label": "Day 1",
          "home.day2Label": "Day 2",
          "datePicker.day2": "Day 2",
        }[key] ??
        opts?.defaultValue ??
        key;
      const str = String(raw);
      if (!opts) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
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
    const location = useLocation();
    latestParams = new URLSearchParams(location.search);
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

async function waitForCondition(condition: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (condition()) return;
    await act(async () => {
      await new Promise((res) => setTimeout(res, 10));
    });
  }
  if (condition()) return;
  throw new Error("waitForCondition timed out");
}

function calendarCapsule(
  container: HTMLElement,
): HTMLButtonElement | undefined {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) =>
      b.getAttribute("aria-haspopup") === "dialog" ||
      Boolean(b.querySelector(".lucide-calendar")),
  ) as HTMLButtonElement | undefined;
  return button;
}

async function pickDate(host: HTMLElement, value: string) {
  await waitForCondition(() => Boolean(calendarCapsule(host)));

  if (host.querySelector('[role="dialog"]')) {
    await act(async () => {
      await new Promise((res) => setTimeout(res, 50));
    });
  }

  if (!host.querySelector('[role="dialog"]')) {
    await act(async () => {
      calendarCapsule(host)?.click();
    });
    await waitForCondition(() =>
      Boolean(host.querySelector('[role="dialog"]')),
    );
  }

  await waitForCondition(() =>
    Boolean(host.querySelector(`button[data-date="${value}"]`)),
  );
  const dayBtn = host.querySelector(
    `button[data-date="${value}"]`,
  ) as HTMLButtonElement;
  if (!dayBtn) {
    throw new Error(`dayBtn not found for ${value}`);
  }
  await act(async () => {
    dayBtn.click();
    await new Promise((res) => setTimeout(res, 20));
  });
}

function formatMonthDayLabel(isoStr: string) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

describe("Home arbitrary future dates", () => {
  it("selects a future date via calendar and syncs date= to the URL", async () => {
    const { host, params } = renderHome();
    await waitForCondition(() => Boolean(params()?.get("date")) === false);
    await waitForCondition(() =>
      Boolean(host.querySelector('button[aria-haspopup="dialog"]')),
    );

    const tomorrowObj = new Date();
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowIso = iso(tomorrowObj);

    await pickDate(host, tomorrowIso);

    await waitForCondition(() => params()?.get("date") === tomorrowIso);
  });

  it("restores dates across browser back and forward", async () => {
    const { host, params, navigate } = renderHome();
    await waitForCondition(() => Boolean(params()?.get("date")) === false);
    await waitForCondition(() =>
      Boolean(host.querySelector('button[aria-haspopup="dialog"]')),
    );

    const d1 = new Date();
    d1.setDate(d1.getDate() + 1);
    const dateAIso = iso(d1);
    const labelA = formatMonthDayLabel(dateAIso);

    const d2 = new Date();
    d2.setDate(d2.getDate() + 8);
    const dateBIso = iso(d2);
    const labelB = formatMonthDayLabel(dateBIso);

    // 1 & 2. Select date A, verify URL and capsule A
    await pickDate(host, dateAIso);
    await waitForCondition(() => params()?.get("date") === dateAIso);
    await waitForCondition(
      () =>
        calendarCapsule(host)?.textContent?.includes(labelA) ||
        calendarCapsule(host)?.textContent?.includes("Tomorrow") ||
        false,
    );

    // 3 & 4. Select date B, verify URL and capsule B
    await pickDate(host, dateBIso);
    await waitForCondition(() => params()?.get("date") === dateBIso);
    await waitForCondition(
      () => calendarCapsule(host)?.textContent?.includes(labelB) ?? false,
    );

    // 5 & 6. Back: restores date A in URL, state and the visible capsule.
    await act(async () => {
      navigate(-1);
    });
    await waitForCondition(() => params()?.get("date") === dateAIso);
    await waitForCondition(
      () =>
        calendarCapsule(host)?.textContent?.includes(labelA) ||
        calendarCapsule(host)?.textContent?.includes("Tomorrow") ||
        false,
    );

    // 7 & 8. Forward: restores date B in URL, state and visible capsule.
    await act(async () => {
      navigate(1);
    });
    await waitForCondition(() => params()?.get("date") === dateBIso);
    await waitForCondition(
      () => calendarCapsule(host)?.textContent?.includes(labelB) ?? false,
    );
  });

  it("proves lastWrittenUrlRef does not block the first Back navigation after user selection", async () => {
    const { host, params, navigate } = renderHome();
    await waitForCondition(() => Boolean(params()?.get("date")) === false);

    const d = new Date();
    d.setDate(d.getDate() + 8);
    const dateIso = iso(d);
    const label = formatMonthDayLabel(dateIso);

    // Select date A
    await pickDate(host, dateIso);
    await waitForCondition(() => params()?.get("date") === dateIso);
    await waitForCondition(
      () => calendarCapsule(host)?.textContent?.includes(label) ?? false,
    );

    // First Back navigation immediately after selection
    await act(async () => {
      navigate(-1);
    });

    // Should restore to initial state (Today / no date param) without being blocked by lastWrittenUrlRef
    await waitForCondition(() => params()?.get("date") === null);
    await waitForCondition(
      () =>
        calendarCapsule(host)?.textContent?.includes("Select date") ?? false,
    );
  });

  it("restores the date from the URL on reload", async () => {
    const { host } = renderHome("/?date=2030-06-15");
    await waitForCondition(
      () => calendarCapsule(host)?.textContent?.includes("Jun 15") ?? false,
    );
  });

  it("normalizes a past URL date away safely", async () => {
    const { host, params } = renderHome("/?date=2020-01-01");
    await waitForCondition(() => params()?.get("date") === null);
    expect(calendarCapsule(host)?.textContent).not.toContain("Jan 1");
  });

  it("shows the derived Day 2 for 2D1N in the picker", async () => {
    const { host } = renderHome("/?date=2030-06-15");
    await waitForCondition(
      () => calendarCapsule(host)?.textContent?.includes("Jun 15") ?? false,
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

    act(() => calendarCapsule(host)?.click());
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
