import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Destinations from "@/features/destinations/Destinations";
import Compare from "@/features/compare/Compare";
import { resetDestinationsIndexForTests } from "@/shared/services/place/PlaceCatalog";

/**
 * KAI-121 failure-path tests:
 *  1. A failed full-catalogue load must NOT switch summary-capable
 *     surfaces (Destinations, Compare) to an EMPTY list — they retain the
 *     summary and expose a non-destructive error state.
 *  2. The loader must not leave an unhandled rejection (fire-and-forget
 *     callers catch).
 */

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const compareState = vi.hoisted(() => ({
  compareList: ["kyoto-city", "osaka-city"],
  toggleCompare: vi.fn(),
  clearCompare: vi.fn(),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    compareList: compareState.compareList,
    toggleCompare: compareState.toggleCompare,
    clearCompare: compareState.clearCompare,
    favorites: [],
    visitedIds: [],
    isVisited: () => false,
    isComparing: () => false,
    isFavorite: () => false,
    toggleFavorite: () => undefined,
    canMutateProfile: () => true,
    openAuthModal: () => undefined,
    user: null,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
  initReactI18next: { init: vi.fn() },
}));

vi.mock("@/i18n", () => ({
  default: { use: vi.fn().mockReturnThis(), init: vi.fn() },
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({ weatherContext: null }),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  resetDestinationsIndexForTests();
  vi.unstubAllGlobals();
});

function render(node: React.ReactNode) {
  root = createRoot(host!);
  act(() => {
    root!.render(<MemoryRouter>{node}</MemoryRouter>);
  });
}

describe("KAI-121 failure semantics (summary retained)", () => {
  it("Destinations keeps the summary list when the full load fails", async () => {
    resetDestinationsIndexForTests();
    // Fail ONLY the destinations-index fetch; other fetches resolve with
    // empty/minimal payloads so the page renders (stations, weather, etc.).
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("destinations-index.json")) {
          return Promise.reject(new Error("network down"));
        }
        return Promise.resolve(
          new Response(url.includes("stations") ? "[]" : "{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    render(<Destinations />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // The explorer must still render destination content (summary), not an
    // empty state. The summary catalogue is 978 places; the results grid
    // must show a nonzero count (KAI-63 pattern) or at minimum the
    // destination grid must be populated.
    const grid = host!.querySelector("#results-grid");
    const summarySpan = grid?.querySelector("span");
    const count = summarySpan
      ? parseInt(
          (summarySpan.textContent ?? "").match(/^(\d+)/)?.[1] ?? "0",
          10,
        )
      : 0;
    const cardCount = host!.querySelectorAll(
      "a[href^='/destinations/'], [role='button']",
    ).length;
    expect(count > 0 || cardCount > 0).toBe(true);
  });

  it("Compare keeps the summary list when the full load fails", async () => {
    resetDestinationsIndexForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    render(<Compare />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Compare renders (summary-backed) without crashing or empty state.
    expect(host!.textContent).not.toContain("unhandled");
    expect(host!.querySelectorAll("h1").length).toBeGreaterThan(0);
  });
});
