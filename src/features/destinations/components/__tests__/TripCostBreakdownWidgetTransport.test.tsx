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
    t: (key: string, opts?: { components?: string; details?: string }) =>
      ({
        "planner.budgetEstimate.estimatedTripTotal": "Estimated trip total",
        "planner.budgetEstimate.onSiteEstimate":
          "On-site estimate — set an origin to include travel.",
        "planner.budgetEstimate.onSiteShort": "on-site only",
        "planner.budgetEstimate.includesEstimatedOrigin":
          "Includes estimated round-trip travel from your origin.",
        "planner.budgetEstimate.partialOriginUnavailable":
          "Partial estimate — origin travel cost unavailable.",
        "planner.budgetEstimate.tollsExcluded":
          "Car estimate — tolls excluded.",
        "planner.budgetEstimate.tollsExcludedSummary":
          "Partial estimate — car costs exclude tolls.",
        "planner.budgetEstimate.partialTotal": "Partial total",
        "planner.budgetEstimate.fullTripEstimate":
          "Includes travel, local transport, tickets, meals and accommodation where applicable.",
        "planner.budgetEstimate.knownSubtotal": "Known subtotal",
        "planner.budgetEstimate.unknownComponents":
          "Some components unknown — showing known subtotal only",
        "planner.budgetEstimate.missingComponents": `Missing: ${opts?.components ?? ""}`,
        "planner.budgetEstimate.costUnavailable": "Cost unavailable",
        "planner.budgetEstimate.partialTotalDetails": `Partial total — ${opts?.details ?? ""}`,
        "planner.budgetEstimate.originTravel": "Origin travel",
        "planner.budgetEstimate.localTransport": "Local transport",
        "planner.budgetEstimate.admissionTickets": "Admission / Tickets",
        "planner.budgetEstimate.meals": "Meals",
        "planner.budgetEstimate.accommodation": "Accommodation",
        "planner.budgetEstimate.admissionUnavailable":
          "Admission unavailable/not included",
      })[key] ?? key,
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
  tollsExcluded?: boolean;
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

// KAI-217B round-5: the widget's costs derive ENTIRELY from the engine's
// canonical components. Mock it deterministically to the scenario's
// canonical components (origin_travel / local_transport / admission —
// food/cafe excluded) so the transport-row presentation contract stays the
// focus.
vi.mock("@/shared/services/budget/tripEstimateEngine", () => ({
  calculateTripEstimate: () => {
    const s = scenario;
    const components: unknown[] = [];
    if (s.transport > 0 || s.transportAvailable) {
      components.push({
        cost: { kind: "bounded", min: s.transport, max: s.transport },
        evidence: {
          scope: "origin_travel",
          derivation: "model_estimate",
          ...(s.tollsExcluded ? { tollsExcluded: true } : {}),
        },
      });
    } else {
      components.push({
        cost: { kind: "unavailable", reason: "source_missing" },
        evidence: { scope: "origin_travel", derivation: "computed" },
      });
    }
    if (s.localTransit > 0) {
      components.push({
        cost: {
          kind: "bounded",
          min: s.localTransit,
          max: s.localTransit,
        },
        evidence: {
          scope: "local_transport",
          derivation: "model_estimate",
        },
      });
    } else {
      components.push({
        cost: { kind: "unavailable", reason: "source_missing" },
        evidence: { scope: "local_transport", derivation: "computed" },
      });
    }
    components.push({
      cost: { kind: "bounded", min: s.tickets, max: s.tickets },
      evidence: { scope: "admission", derivation: "source_fact" },
    });
    const total = s.transport + s.localTransit + s.tickets;
    return {
      completeness: "complete",
      total: { kind: "bounded", min: total, max: total },
      components,
    };
  },
  evaluateAffordability: () => "fits",
}));

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
  formatTravellerEstimateRange: ([min, max]: [number, number]) =>
    `¥${min.toLocaleString()} - ¥${max.toLocaleString()}`,
  getEstimatedBudgetRange: () => ({
    range: [5000, 8000] as [number, number],
    transportIncluded: true,
  }),
  getTransportCost: () => 0,
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
    findLowerCostAlternativeCandidates: () => [],
    selectLowerCostAlternatives: () => [],
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

function renderWidget(
  props: { homeCoords?: { lat: number; lng: number } } = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <TripCostBreakdownWidget
        destination={testDestination}
        locale="en"
        partySize={2}
        homeCoords={props.homeCoords}
        activeTransportMode="train"
        defaultExpanded={true}
      />,
    );
  });
  return host!;
}

const bodyText = (h: HTMLElement) => h.textContent ?? "";

describe("TripCostBreakdownWidget transport presentation (finishing pass)", () => {
  it("1. no origin, local transit known: shows an on-site estimate", () => {
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
    expect(text).toContain("Local transport");
    expect(text).toContain("¥2,000 - ¥2,000");
    expect(text).toContain("On-site estimate");
    expect(text).not.toContain("Origin travel");
    // KAI-217B: canonical total = transport + admission (food/cafe/parking
    // excluded) → 2000 + 1000 = 3000.
    expect(text).toContain("¥3,000 - ¥3,000");
    // The food/cafe rows must NOT render.
    expect(text).not.toContain("Food & Dining");
    expect(text).not.toContain("Café & Snacks");
  });

  it("2. origin and local transit both known: separate rows, no exclusion note", () => {
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
    expect(text).toContain("Origin travel");
    expect(text).toContain("¥800 - ¥800");
    expect(text).toContain("Local transport");
    expect(text).toContain("¥2,000 - ¥2,000");
    // KAI-217B: 800 + 2000 + 1000 = 3800.
    expect(text).toContain("¥3,800 - ¥3,800");
  });

  it("discloses when bounded car fuel/parking excludes tolls", () => {
    scenario = {
      transport: 2400,
      transportAvailable: true,
      localTransit: 0,
      tickets: 1000,
      food: [500, 800],
      cafe: 300,
      budgetAvailable: true,
      tollsExcluded: true,
    };
    const text = bodyText(
      renderWidget({ homeCoords: { lat: 35.6812, lng: 139.7671 } }),
    );
    expect(text).toContain("Origin travel");
    expect(text).toContain("Car estimate — tolls excluded.");
    expect(text).toContain("Partial estimate — car costs exclude tolls.");
    expect(text).not.toContain("origin travel cost unavailable");
  });
  it("shows a compact qualifier when bounded origin travel is modelled", () => {
    scenario = {
      transport: 800,
      transportAvailable: true,
      localTransit: 2000,
      tickets: 1000,
      food: [500, 800],
      cafe: 300,
      budgetAvailable: true,
    };
    const text = bodyText(
      renderWidget({ homeCoords: { lat: 35.6812, lng: 139.7671 } }),
    );
    expect(text).toContain(
      "Includes estimated round-trip travel from your origin.",
    );
    expect(text).not.toContain("origin transport excluded");
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
    // KAI-217B: canonical total = admission only = 1000.
    expect(text).toContain("¥1,000 - ¥1,000");
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
    // KAI-217B: category rows are transport 2800 + tickets 1500 ONLY
    // (food/cafe rows removed from canonical affordability).
    expect(text).toContain("¥800 - ¥800");
    expect(text).toContain("¥2,000 - ¥2,000");
    expect(text).toContain("¥1,500 - ¥1,500");
    expect(text).not.toContain("¥1,000 - ¥1,200");
    expect(text).not.toContain("¥400 - ¥400");
    // Total = 2800 + 1500 = 4300.
    expect(text).toContain("¥4,300 - ¥4,300");
  });
});
