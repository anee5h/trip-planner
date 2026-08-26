/**
 * @vitest-environment jsdom
 *
 * Tests TripCostBreakdownWidget accommodation allowance rendering.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { TripCostBreakdownWidget } from "../TripCostBreakdownWidget";
import type { Destination } from "@/shared/types/destination";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock heavy dependencies ───────────────────────────────────────────────────
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "planner.stayAllowanceRow": "Stay allowance (1 night)",
        "planner.stayAllowanceNote": "User-set estimate, not a real hotel rate",
      })[key] ?? key,
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
  User: () => null,
  Sparkles: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  BedDouble: () => null,
  Frown: () => null,
}));

vi.mock("@/shared/services/budget/BudgetService", () => ({
  calculateItemizedTripCost: (
    _dest: Destination,
    options?: { accommodationAllowance?: number; partySize?: number },
  ) => {
    const allowance = options?.accommodationAllowance ?? 0;
    const partySize = options?.partySize ?? 2;
    return {
      transport: 800,
      transportAvailable: true,
      tickets: 3000,
      food: [2000, 4000] as [number, number],
      cafe: 600,
      parking: 0,
      perPersonRange: [
        Math.round((800 + 3000 + 2000 + 600 + allowance) / partySize),
        Math.round((800 + 3000 + 4000 + 600 + allowance) / partySize),
      ],
      partyRange: [
        800 + 3000 + 2000 + 600 + allowance,
        800 + 3000 + 4000 + 600 + allowance,
      ],
      isFreeTicket: false,
      confidence: "medium" as const,
      accommodationAllowance: allowance,
      durationKnown: true,
    };
  },
  formatLocalizedJPYRange: ([min, max]: [number, number]) =>
    `¥${min.toLocaleString()} - ¥${max.toLocaleString()}`,
  getEstimatedBudgetRange: () => ({
    range: [5000, 8000] as [number, number],
    transportIncluded: true,
  }),
  getTransportCost: () => 800,
  isFreeDestination: () => false,
  hasKnownBudgetRange: () => false,
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
  recommendationAnalytics: {
    trackPlanningToolEvent: vi.fn(),
  },
}));

vi.mock("@/shared/components/ui/card", () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  CardContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("@/shared/components/ui/badge", () => ({
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
}));

vi.mock("@/shared/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  ),
}));

// ── Test fixture ──────────────────────────────────────────────────────────────
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

// ── Render helper ─────────────────────────────────────────────────────────────
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

function renderWidget(props: {
  accommodationAllowance?: number;
  partySize?: number;
  activeTransportMode?: string;
  defaultExpanded?: boolean;
}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <TripCostBreakdownWidget
        destination={testDestination}
        locale="en"
        partySize={props.partySize ?? 2}
        activeTransportMode={props.activeTransportMode ?? "train"}
        defaultExpanded={props.defaultExpanded ?? false}
        accommodationAllowance={props.accommodationAllowance}
      />,
    );
  });
  return host;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("TripCostBreakdownWidget accommodation allowance", () => {
  it("renders accommodation allowance row when allowance > 0 and expanded", () => {
    const container = renderWidget({
      accommodationAllowance: 15000,
      defaultExpanded: true,
    });

    expect(container.textContent).toContain("Stay allowance (1 night)");
    expect(container.textContent).toContain("User-set estimate");
  });

  it("does not render accommodation allowance row when allowance is 0", () => {
    const container = renderWidget({
      accommodationAllowance: 0,
      defaultExpanded: true,
    });

    expect(container.textContent).not.toContain("Stay allowance (1 night)");
  });

  it("does not render accommodation allowance row when allowance is undefined", () => {
    const container = renderWidget({
      defaultExpanded: true,
    });

    expect(container.textContent).not.toContain("Stay allowance (1 night)");
  });

  it("renders allowance in party view mode", () => {
    const container = renderWidget({
      accommodationAllowance: 15000,
      defaultExpanded: true,
    });

    // In party view, the allowance should show as ¥15,000 (full amount)
    expect(container.textContent).toContain("¥15,000");
  });

  it("renders allowance divided in per-person view mode", () => {
    const container = renderWidget({
      accommodationAllowance: 15000,
      partySize: 2,
      defaultExpanded: true,
    });

    // Switch to per-person view
    const perPersonBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Per Person",
    );
    act(() => perPersonBtn?.click());

    // Allowance should be divided by partySize: 15000/2 = 7500
    expect(container.textContent).toContain("¥7,500");
  });

  it("party view shows full allowance amount", () => {
    const container = renderWidget({
      accommodationAllowance: 25000,
      partySize: 2,
      defaultExpanded: true,
    });

    // In party view (default), the allowance should show the full 25000
    expect(container.textContent).toContain("¥25,000");
  });
});
