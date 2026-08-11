/**
 * KAI-65: Destinations (Explore) search input regression tests.
 *
 * Invariants:
 *   - The filter search keeps its native `type="search"` semantics but opts
 *     into the scoped `no-native-search-cancel` class so the browser-native X
 *     is suppressed (the custom clear button is the single visible X).
 *   - The input font is zoom-safe on mobile (>= 16px below lg) and keeps its
 *     compact desktop size.
 *   - Exactly one X (clear) control exists inside the search field.
 *   - Clear empties the query and restores input focus.
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import Destinations from "../Destinations";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const EN: Record<string, string> = {
        "search.clear": "Clear search input",
      };
      return EN[key] ?? key;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({ weatherContext: { forecastMap: undefined } }),
}));

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: null as { lat: number; lng: number } | null,
  homeStationTransportZoneId: undefined as string | undefined,
  originSource: "none" as string,
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

vi.mock("@/shared/components/StationInput", () => ({
  default: () => null,
}));

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

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

function searchInput(): HTMLInputElement {
  const input = document.body.querySelector(
    'input[type="search"]',
  ) as HTMLInputElement | null;
  expect(input).toBeDefined();
  return input!;
}

describe("Destinations search input (KAI-65)", () => {
  it("keeps native type=search while opting into the scoped no-native-search-cancel class", () => {
    renderDestinations("/destinations?q=kyoto");

    const input = searchInput();
    expect(input.type).toBe("search");
    expect(input.className).toContain("no-native-search-cancel");
  });

  it("uses a zoom-safe mobile font (text-base) and keeps the compact desktop size (lg:text-xs)", () => {
    renderDestinations("/destinations");

    const input = searchInput();
    const className = input.className;
    // >= 16px below lg prevents iOS/iPadOS Safari focus zoom; the desktop
    // variant keeps the original compact look at lg+. `md:text-base` exists
    // to override the shared Input primitive's `md:text-sm` so tablets do not
    // fall below the zoom threshold.
    expect(className).toContain("text-base");
    expect(className).toContain("md:text-base");
    expect(className).toContain("lg:text-xs");
    // A bare sub-16px token (without a responsive prefix) would reintroduce
    // the zoom bug on phones.
    expect(className).not.toMatch(/(^|\s)text-(xs|sm)(\s|$)/);
  });

  it("shows exactly one X (the custom clear) inside the search field when query is non-empty", () => {
    renderDestinations("/destinations?q=kyoto");

    const input = searchInput();
    const field = input.closest("div.relative") as HTMLElement | null;
    expect(field).not.toBeNull();
    const xIcons = field!.querySelectorAll("svg.lucide-x");
    expect(xIcons.length).toBe(1);

    const clearBtn = field!.querySelector(
      'button[aria-label="Clear search input"]',
    );
    expect(clearBtn).not.toBeNull();
  });

  it("hides the clear control when query is empty", () => {
    renderDestinations("/destinations");

    const input = searchInput();
    const field = input.closest("div.relative") as HTMLElement | null;
    expect(field!.querySelectorAll("svg.lucide-x").length).toBe(0);
  });

  it("clear empties the query and restores input focus", () => {
    renderDestinations("/destinations?q=kyoto");

    const input = searchInput();
    const field = input.closest("div.relative") as HTMLElement | null;
    const clearBtn = field!.querySelector(
      'button[aria-label="Clear search input"]',
    ) as HTMLButtonElement | null;
    expect(clearBtn).not.toBeNull();

    input.focus();
    expect(document.activeElement).toBe(input);

    act(() => {
      clearBtn!.click();
    });

    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });
});
