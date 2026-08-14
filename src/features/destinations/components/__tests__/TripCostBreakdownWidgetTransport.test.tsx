/**
 * @vitest-environment jsdom
 *
 * Finishing-pass presentation contract: the widget's transport row and copy
 * must agree with the TOTAL. Origin-transport availability is separate from
 * the on-site/local-transit allowance — when origin transport is unavailable
 * but local transit is known, the row shows the allowance with an
 * origin-excluded note (previously the row was hidden while the total still
 * included local transit).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripCostBreakdownWidget } from "../TripCostBreakdownWidget";
import type { Destination } from "@/shared/types/destination";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/destinations" }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("lucide-react", () => ({
  JapaneseYen: () => "¥",
  Train: () => null,
  Car: () => null,
  Ticket: () => null,
  Utensils: () => null,
  Coffee: () => null,
  CheckCircle2: () => null,
  Users: () => null,
  Sparkles: () => null,
  Plane: () => null,
  RotateCcw: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  BedDouble: () => null,
  User: () => null,
}));

type Scenario = {
  transport: number;
  transportAvailable: boolean;
  localTransit: number;
  tickets: number;
  food: [number, number] | null;
  cafe: number;
  budgetAvailable: boolean;
};

let scenario: Scenario = {
  transport: 0,
  transportAvailable: false,
  localTransit: 0,
  tickets: 0,
  food: null,
  cafe: 0,
  budgetAvailable: true,
};

vi.mock("@/shared/services/budget/BudgetService", () => ({
  calculateItemizedTripCost: () => {
    const s = scenario;
    const minTotal =
      s.transport + s.localTransit + s.tickets + (s.food?.[0] ?? 0) + s.cafe;
    const maxTotal =
      s.transport + s.localTransit + s.tickets + (s.food?.[1] ?? 0) + s.cafe;
    return {
      transport: s.transport,
      transportAvailable: s.transportAvailable,
      localTransit: s.localTransit,
      tickets: s.tickets,
      food: s.food,
      cafe: s.cafe,
      parking: 0,
      perPersonRange: [Math.round(minTotal / 2), Math.round(maxTotal / 2)],
      partyRange: [minTotal, maxTotal],
      isFreeTicket: false,
      confidence: "estimated" as const,
      accommodationAllowance: 0,
      durationKnown: true,
      budgetAvailable: s.budgetAvailable,
    };
  },
  formatLocalizedJPYRange: ([min, max]: [number, number]) =>
    `¥${min.toLocaleString()} - ¥${max.toLocaleString()}`,
  getEstimatedBudgetRange: () => ({
    range: [5000, 8000] as [number, number],
    transportIncluded: true,
  }),
  getTransportCost: () => 0,
  isFreeDestination: () => false,
  ACCOMMODATION_ALLOWANCE_PRESETS: {
    economy: 8000,
    standard: 15000,
    comfortable: 25000,
  },
  MAX_ACCOMMODATION_ALLOWANCE: 500000,
  isValidAccommodationAllowance: () => true,
}));

vi.mock(
  "@/shared/services/recommendation/DestinationCombinationService",
  () => ({
    findNearbyCombinations: () => [],
  }),
);

vi.mock("@/shared/services/place/PlaceCatalog", () => ({
  getLocalizedPlace: (dest: Destination) => ({ name: dest.name }),
}));

vi.mock("@/shared/utils/placeLabels", () => ({
  formatPlaceName: (name: string) => name,
}));

vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: { trackPlanningToolEvent: vi.fn() },
}));

vi.mock("@/shared/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/shared/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const testDestination = {
  id: "test-dest",
  name: "Test Destination",
  budgetMin: 2000,
  budgetMax: 5000,
  budgetRecommended: 4000,
  totalTripHours: 4,
  categories: ["Park"],
  transportOptions: { train: 30 },
} as unknown as Destination;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderWidget() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <TripCostBreakdownWidget
        destination={testDestination}
        locale="en"
        partySize={2}
        activeTransportMode="train"
        defaultExpanded={true}
      />,
    );
  });
  return host!;
}

const bodyText = (h: HTMLElement) => h.textContent ?? "";

describe("TripCostBreakdownWidget transport presentation (finishing pass)", () => {
  it("1. origin unavailable, local transit known: shows the row + origin-excluded note", () => {
    scenario = {
      transport: 0,
      transportAvailable: false,
      localTransit: 2000,
      tickets: 1000,
      food: [500, 800],
      cafe: 300,
      budgetAvailable: true,
    };
    const h = renderWidget();
    const text = bodyText(h);
    // The local-transit allowance is part of the total and MUST be visible.
    expect(text).toContain("Transport");
    expect(text).toContain("¥2,000 - ¥2,000");
    expect(text).toContain("Origin transport not estimated");
    // Total includes local transit (2000 + 1000 + 500..800 + 300).
    expect(text).toContain("¥3,800 - ¥4,100");
  });

  it("2. origin and local transit both known: combined row, no exclusion note", () => {
    scenario = {
      transport: 800,
      transportAvailable: true,
      localTransit: 2000,
      tickets: 1000,
      food: [500, 800],
      cafe: 300,
      budgetAvailable: true,
    };
    const h = renderWidget();
    const text = bodyText(h);
    expect(text).toContain("¥2,800 - ¥2,800");
    expect(text).not.toContain("Origin transport not estimated");
    expect(text).toContain("¥4,600 - ¥4,900");
  });

  it("3. origin known, local transit not applicable: row shows origin only", () => {
    scenario = {
      transport: 800,
      transportAvailable: true,
      localTransit: 0,
      tickets: 1000,
      food: [500, 800],
      cafe: 300,
      budgetAvailable: true,
    };
    const h = renderWidget();
    const text = bodyText(h);
    expect(text).toContain("¥800 - ¥800");
    expect(text).not.toContain("Origin transport not estimated");
  });

  it("4. neither transport component known: no transport row", () => {
    scenario = {
      transport: 0,
      transportAvailable: false,
      localTransit: 0,
      tickets: 1000,
      food: [500, 800],
      cafe: 300,
      budgetAvailable: true,
    };
    const h = renderWidget();
    const text = bodyText(h);
    expect(text).not.toContain("Origin transport not estimated");
    // Tickets/food still rendered; total has no transport line.
    expect(text).toContain("¥1,800 - ¥2,100");
  });

  it("5. displayed category totals equal the displayed total", () => {
    scenario = {
      transport: 800,
      transportAvailable: true,
      localTransit: 2000,
      tickets: 1500,
      food: [1000, 1200],
      cafe: 400,
      budgetAvailable: true,
    };
    const h = renderWidget();
    const text = bodyText(h);
    // Category rows: transport 2800, tickets 1500, food 1000-1200, cafe 400.
    expect(text).toContain("¥2,800 - ¥2,800");
    expect(text).toContain("¥1,500 - ¥1,500");
    expect(text).toContain("¥1,000 - ¥1,200");
    expect(text).toContain("¥400 - ¥400");
    // Total = 2800 + 1500 + (1000..1200) + 400 = 5700..5900.
    expect(text).toContain("¥5,700 - ¥5,900");
  });
});
