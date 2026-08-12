/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import DestinationFilters from "../DestinationFilters";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "search.label": "Search",
        "search.clear": "Clear search",
        "destination.tripDuration": "Trip duration",
        "destination.durationOptions.shortOuting": "Short outing",
        "destination.durationOptions.halfDay": "Half day",
        "destination.durationOptions.fullDay": "Full day",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en" }),
}));

vi.mock("@/shared/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@/shared/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <button className={className}>{children}</button>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("../WhereLocationPicker", () => ({
  default: () => null,
}));

vi.mock("@/shared/components/travel/TravelDatePicker", () => ({
  default: () => null,
}));

type Props = React.ComponentProps<typeof DestinationFilters>;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderFilters(overrides: Partial<Props> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  const defaults: Props = {
    searchQuery: "",
    setSearchQuery: vi.fn(),
    selectedRegions: [],
    setSelectedRegions: vi.fn(),
    selectedPrefectures: [],
    setSelectedPrefectures: vi.fn(),
    selectedCollections: [],
    setSelectedCollections: vi.fn(),
    selectedCities: [],
    setSelectedCities: vi.fn(),
    selectedAreas: [],
    setSelectedAreas: vi.fn(),
    indoorMin: 0,
    setIndoorMin: vi.fn(),
    season: "any",
    setSeason: vi.fn(),
    date: "",
    setDate: vi.fn(),
    sortBy: "recommended",
    setSortBy: vi.fn(),
    carMode: "none",
    setCarMode: vi.fn(),
    publicModes: [],
    setPublicModes: vi.fn(),
    partySize: 2,
    setPartySize: vi.fn(),
    weather: "any",
    setWeather: vi.fn(),
    budgetTier: "standard",
    setBudgetTier: vi.fn(),
    vibe: "any",
    setVibe: vi.fn(),
    tripDuration: "any",
    setTripDuration: vi.fn(),
    tripMode: "any",
    setTripMode: vi.fn(),
    walkingIntensity: "all",
    setWalkingIntensity: vi.fn(),
    suitabilities: [],
    setSuitabilities: vi.fn(),
    interests: [],
    setInterests: vi.fn(),
    viewMode: "grid",
    setViewMode: vi.fn(),
    onReset: vi.fn(),
  };

  act(() => root!.render(<DestinationFilters {...defaults} {...overrides} />));
  return host;
}

function buttonByText(container: HTMLDivElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );
}

function buttonContainingText(container: HTMLDivElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

describe("DestinationFilters dark-mode states", () => {
  it("uses the selected treatment for collections", () => {
    const container = renderFilters({ selectedCollections: ["unesco-japan"] });
    const button = buttonByText(container, "1 Collection");

    expect(button?.className).toContain("dark:bg-emerald-500/20");
    expect(button?.className).toContain("dark:text-emerald-200");
    expect(button?.className).toContain("dark:ring-emerald-400/50");
  });

  it("keeps inactive Filters neutral and marks active Filters as selected", () => {
    const inactive = renderFilters();
    const inactiveButton = buttonByText(inactive, "Filters");

    expect(inactiveButton?.className).toContain(
      "dark:bg-[hsl(var(--surface-overlay))]",
    );
    expect(inactiveButton?.className).toContain(
      "dark:border-[hsl(var(--border-subtle))]",
    );

    root?.unmount();
    const active = renderFilters({ vibe: "nature" });
    const activeButton = buttonByText(active, "Filters1");

    expect(activeButton?.className).toContain("dark:bg-emerald-500/20");
    expect(activeButton?.className).toContain("dark:text-emerald-200");
    expect(activeButton?.className).toContain("dark:ring-emerald-400/50");
  });

  it("uses the selected treatment for Any transport and selected modes", () => {
    const container = renderFilters();
    const filtersButton = buttonContainingText(container, "Filters");
    act(() => filtersButton?.click());

    const anyTransport = buttonByText(container, "Any transport");
    expect(anyTransport?.className).toContain("dark:bg-emerald-500/20");
    expect(anyTransport?.className).toContain("dark:text-emerald-200");
    expect(anyTransport?.className).toContain("dark:ring-emerald-400/50");

    act(() => root?.unmount());
    const selected = renderFilters({ publicModes: ["train"] });
    const selectedFiltersButton = buttonContainingText(selected, "Filters");
    act(() => selectedFiltersButton?.click());

    const localTrains = buttonContainingText(selected, "Local trains");
    expect(localTrains?.className).toContain("dark:bg-emerald-500/20");
    expect(localTrains?.className).toContain("dark:text-emerald-200");
    expect(localTrains?.className).toContain("dark:ring-emerald-400/50");
  });
});
