/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
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
        "home.transportModes.car": "Car",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const { authMock } = vi.hoisted(() => ({
  authMock: { user: null as unknown },
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user }),
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
  authMock.user = null;
});

function makeDefaults(): Props {
  return {
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
}

function renderFilters(overrides: Partial<Props> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(<DestinationFilters {...makeDefaults()} {...overrides} />),
  );
  return host;
}

/** Harness that keeps carMode state so toggles behave like the real page. */
function StatefulFilters({
  initialCarMode = "none",
  overrides = {},
}: {
  initialCarMode?: string;
  overrides?: Partial<Props>;
} = {}) {
  const [carMode, setCarMode] = useState(initialCarMode);
  return (
    <DestinationFilters
      {...makeDefaults()}
      carMode={carMode}
      setCarMode={setCarMode}
      {...overrides}
    />
  );
}

function renderStatefulFilters({
  initialCarMode = "none",
  overrides = {},
}: {
  initialCarMode?: string;
  overrides?: Partial<Props>;
} = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <StatefulFilters initialCarMode={initialCarMode} overrides={overrides} />,
    ),
  );
  return host;
}

function openFiltersModal(container: HTMLDivElement) {
  const filtersButton = buttonContainingText(container, "Filters");
  act(() => filtersButton?.click());
}

/** Buttons whose (checkmark-stripped) label is a car chip label. */
function carChipButtons(container: HTMLDivElement) {
  return Array.from(container.querySelectorAll("button")).filter((button) => {
    const text = button.textContent?.replace("✓", "").trim() ?? "";
    return text === "Car" || text === "Personal car" || text === "Rental car";
  });
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

describe("single Car transport chip (KAI-63)", () => {
  it("renders exactly one Car chip and no separate personal/rental chips", () => {
    const container = renderFilters();
    openFiltersModal(container);

    const chips = carChipButtons(container);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toContain("Car");
    expect(chips[0]?.textContent).not.toContain("Personal");
    expect(chips[0]?.textContent).not.toContain("Rental");
  });

  it("clicking the Car chip selects it and clicking again clears it", () => {
    const container = renderStatefulFilters();
    openFiltersModal(container);

    const carChip = carChipButtons(container)[0];
    expect(carChip?.className).not.toContain("dark:bg-emerald-500/20");
    expect(buttonByText(container, "Any transport")).toBeTruthy();

    act(() => carChip?.click());
    expect(carChip?.className).toContain("dark:bg-emerald-500/20");
    expect(buttonByText(container, "1 selected · Clear")).toBeTruthy();

    act(() => carChip?.click());
    expect(carChip?.className).not.toContain("dark:bg-emerald-500/20");
    expect(buttonByText(container, "Any transport")).toBeTruthy();
  });

  it("uses rental carMode when the user preference is rental", () => {
    authMock.user = {
      user_metadata: { preferences: { carOwnership: "rental" } },
    };
    const container = renderStatefulFilters();
    openFiltersModal(container);

    const carChip = carChipButtons(container)[0];
    act(() => carChip?.click());
    expect(carChip?.className).toContain("dark:bg-emerald-500/20");
    expect(buttonByText(container, "1 selected · Clear")).toBeTruthy();

    act(() => carChip?.click());
    expect(carChip?.className).not.toContain("dark:bg-emerald-500/20");
    expect(buttonByText(container, "Any transport")).toBeTruthy();
  });

  it("renders the Car chip selected for both internal car modes (e.g. car=rental URL)", () => {
    for (const carMode of ["rental", "my_car"] as const) {
      const container = renderFilters({ carMode });
      openFiltersModal(container);

      const chips = carChipButtons(container);
      expect(chips).toHaveLength(1);
      expect(chips[0]?.className).toContain("dark:bg-emerald-500/20");
      expect(chips[0]?.textContent).toContain("✓");
      expect(buttonByText(container, "1 selected · Clear")).toBeTruthy();

      root?.unmount();
      host?.remove();
      root = undefined;
      host = undefined;
    }
  });

  it("counts the Car chip once alongside public modes", () => {
    const container = renderFilters({
      carMode: "rental",
      publicModes: ["train"],
    });
    openFiltersModal(container);

    const chips = carChipButtons(container);
    expect(chips).toHaveLength(1);
    expect(buttonByText(container, "2 selected · Clear")).toBeTruthy();
  });
});
