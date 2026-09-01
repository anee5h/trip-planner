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
import type { GeneratedPlanCostResult } from "@/shared/services/budget/GeneratedPlanCostService";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock heavy dependencies ───────────────────────────────────────────────────
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (key === "planner.stayAllowanceRow") {
        const count = opts?.count ?? 0;
        return `Stay allowance (${count} night${count === 1 ? "" : "s"})`;
      }
      return (
        (
          {
            "planner.stayAllowanceNote":
              "Inferred planning estimate, not a real hotel rate",
          } as Record<string, string>
        )[key] ?? key
      );
    },
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

// KAI-217B round-5: the widget's costs derive ENTIRELY from the engine's
// canonical components. Mock it deterministically: complete with bounded
// components (origin_travel 800, local_transport 3000, admission 3000,
// accommodation = allowance) so the rows + total are derived from the SAME
// source.
vi.mock("@/shared/services/budget/tripEstimateEngine", () => ({
  calculateTripEstimate: ({ duration }: { duration?: string }) => {
    const allowance =
      duration === "2d1n" ? 10000 : duration === "3d2n" ? 20000 : 0;
    const components = [
      {
        cost: { kind: "bounded", min: 800, max: 800 },
        evidence: {
          scope: "origin_travel",
          derivation: "model_estimate",
        },
      },
      {
        cost: { kind: "bounded", min: 3000, max: 3000 },
        evidence: {
          scope: "local_transport",
          derivation: "model_estimate",
        },
      },
      {
        cost: { kind: "bounded", min: 3000, max: 3000 },
        evidence: {
          scope: "admission",
          derivation: "source_fact",
          state: "verified_paid",
        },
      },
      {
        cost: { kind: "bounded", min: allowance, max: allowance },
        evidence: {
          scope: "accommodation",
          derivation: "model_estimate",
        },
      },
    ];
    return {
      completeness: "complete",
      total: {
        kind: "bounded",
        min: 800 + 3000 + 3000 + allowance,
        max: 800 + 3000 + 3000 + allowance,
      },
      components,
    };
  },
  evaluateAffordability: () => "fits",
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
  duration?: "shortOuting" | "halfDay" | "fullDay" | "2d1n" | "3d2n";
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
        duration={props.duration ?? "fullDay"}
      />,
    );
  });
  return host;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("TripCostBreakdownWidget canonical duration", () => {
  it("renders an inferred one-night allowance", () => {
    const container = renderWidget({ duration: "2d1n", defaultExpanded: true });
    expect(container.textContent).toContain("Stay allowance (1 night)");
    expect(container.textContent).not.toContain("User-set estimate");
  });

  it("omits accommodation for zero nights", () => {
    const container = renderWidget({
      duration: "fullDay",
      defaultExpanded: true,
    });
    expect(container.textContent).not.toContain("Stay allowance");
  });

  it("uses two inferred nights without multiplying by party size", () => {
    const container = renderWidget({
      duration: "3d2n",
      partySize: 4,
      defaultExpanded: true,
    });
    expect(container.textContent).toContain("Stay allowance (2 nights)");
    expect(container.textContent).toContain("¥20,000");
    expect(container.textContent).not.toContain("¥80,000");
  });

  it("partial generated plan: collapsed header says Known, expanded says Known subtotal NOT Total Party Cost (KAI-217B round-4)", () => {
    const partialPlan: GeneratedPlanCostResult = {
      originTransport: { min: 0, max: 0, source: "unknown", applicable: false },
      localTransit: { min: 0, max: 0, source: "unknown", applicable: false },
      admission: { min: 3000, max: 3000, source: "curated", applicable: true },
      meals: { min: 0, max: 0, source: "unknown", applicable: false },
      parking: { min: 0, max: 0, source: "unknown", applicable: false },
      completeness: "partial",
      knownSubtotal: [3000, 3000],
      hasNumericTotal: true,
      confidence: "estimated",
      estimateQuality: "estimated",
      assumptions: [],
    };
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
          hasGeneratedPlan
          planCostBreakdown={partialPlan}
          defaultExpanded={false}
        />,
      );
    });
    const collapsedText = host.textContent ?? "";
    expect(collapsedText).toContain("Known");
    // Click the expand toggle to show the expanded body.
    const toggleBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("breakdown"),
    );
    act(() => toggleBtn?.click());
    const expandedText = host.textContent ?? "";
    expect(expandedText).toContain("Known subtotal");
    expect(expandedText).not.toContain("Total Party Cost");
    expect(expandedText).not.toContain("Per Person Total");
  });

  it("expanded widget cannot disagree with the engine: legacy budgetBreakdown.transport NEVER displayed when engine local_transport is unavailable (KAI-217B round-5)", async () => {
    // The destination carries a numeric generic allowance.
    const legacyAllowanceDest = {
      ...testDestination,
      budgetBreakdown: { transport: 5000, tickets: 2000, food: 3000, cafe: 0 },
    } as unknown as Destination;
    // Override the engine mock to a PARTIAL result: local_transport
    // unavailable (no canonical fact), admission + origin bounded.
    const engineMock =
      (await import("@/shared/services/budget/tripEstimateEngine")) as unknown as {
        calculateTripEstimate: ReturnType<typeof vi.fn>;
      };
    engineMock.calculateTripEstimate = vi.fn().mockReturnValue({
      completeness: "partial",
      components: [
        {
          cost: { kind: "bounded", min: 800, max: 800 },
          evidence: { scope: "origin_travel", derivation: "model_estimate" },
        },
        {
          cost: { kind: "unavailable", reason: "source_missing" },
          evidence: { scope: "local_transport", derivation: "computed" },
        },
        {
          cost: { kind: "bounded", min: 2000, max: 2000 },
          evidence: { scope: "admission", derivation: "source_fact" },
        },
      ],
      knownSubtotal: [2800, 2800],
      missingComponents: [
        { scope: "local_transport", reason: "source_missing" },
      ],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <TripCostBreakdownWidget
          destination={legacyAllowanceDest}
          locale="en"
          partySize={2}
          activeTransportMode="train"
          defaultExpanded={true}
        />,
      );
    });
    const text = host.textContent ?? "";
    // The legacy ¥5,000 generic allowance must NEVER be displayed.
    expect(text).not.toContain("¥5,000");
    // The canonical known subtotal + explicit missing local transport ARE.
    expect(text).toContain("Known");
    expect(text).toContain("Missing: local transport");
  });

  // ── Round-6 regressions: component-level semantics ─────────────────────────
  async function renderWithEngine(engineResult: unknown) {
    const engineMock =
      (await import("@/shared/services/budget/tripEstimateEngine")) as unknown as {
        calculateTripEstimate: ReturnType<typeof vi.fn>;
      };
    engineMock.calculateTripEstimate = vi.fn().mockReturnValue(engineResult);
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
    return host.textContent ?? "";
  }

  it("A) partial trip: bounded admission shows its range, NOT Cost unavailable (KAI-217B round-6)", async () => {
    const text = await renderWithEngine({
      completeness: "partial",
      components: [
        {
          cost: { kind: "bounded", min: 2000, max: 2000 },
          evidence: { scope: "admission", derivation: "source_fact" },
        },
        {
          cost: { kind: "unavailable", reason: "source_missing" },
          evidence: { scope: "local_transport", derivation: "computed" },
        },
      ],
      knownSubtotal: [2000, 2000],
      missingComponents: [
        { scope: "local_transport", reason: "source_missing" },
      ],
    });
    // Header: Known ¥2,000. Admission row: ¥2,000. Missing: local transport.
    expect(text).toContain("Known");
    expect(text).toContain("¥2,000");
    expect(text).toContain("Missing: local transport");
    // The bounded admission must NOT be rendered as Cost unavailable.
    expect(text).not.toContain("Cost unavailable");
  });

  it("B) bounded [0,0] with verified_paid state must NOT show Free Admission (KAI-217B round-6)", async () => {
    const text = await renderWithEngine({
      completeness: "complete",
      components: [
        {
          cost: { kind: "bounded", min: 0, max: 0 },
          evidence: {
            scope: "admission",
            derivation: "source_fact",
            state: "verified_paid",
          },
        },
        {
          cost: { kind: "bounded", min: 1000, max: 1000 },
          evidence: {
            scope: "local_transport",
            derivation: "model_estimate",
          },
        },
      ],
      total: { kind: "bounded", min: 1000, max: 1000 },
    });
    expect(text).not.toContain("Free Admission");
    expect(text).not.toContain("Free");
  });

  it("C) verified admission + model-estimated other component must NOT show Verified Fares (KAI-217B round-6)", async () => {
    const text = await renderWithEngine({
      completeness: "complete",
      components: [
        {
          cost: { kind: "bounded", min: 2000, max: 2000 },
          evidence: {
            scope: "admission",
            derivation: "source_fact",
            state: "verified_paid",
          },
        },
        {
          cost: { kind: "bounded", min: 1000, max: 1000 },
          evidence: {
            scope: "local_transport",
            derivation: "model_estimate",
          },
        },
      ],
      total: { kind: "bounded", min: 3000, max: 3000 },
    });
    expect(text).toContain("Estimated Fares");
    expect(text).not.toContain("Verified Fares");
  });

  it("D) partial result shows the Partial badge (KAI-217B round-6)", async () => {
    const text = await renderWithEngine({
      completeness: "partial",
      components: [
        {
          cost: { kind: "bounded", min: 2000, max: 2000 },
          evidence: { scope: "admission", derivation: "source_fact" },
        },
        {
          cost: { kind: "unavailable", reason: "source_missing" },
          evidence: { scope: "local_transport", derivation: "computed" },
        },
      ],
      knownSubtotal: [2000, 2000],
      missingComponents: [
        { scope: "local_transport", reason: "source_missing" },
      ],
    });
    expect(text).toContain("Partial");
    expect(text).not.toContain("Verified Fares");
  });
});

// ── KAI-219A FINAL repair: widget consumes generated-plan semanticState ──────
describe("TripCostBreakdownWidget generated-plan admission semantics", () => {
  function renderPlanWidget(plan: GeneratedPlanCostResult) {
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
          hasGeneratedPlan
          planCostBreakdown={plan}
          defaultExpanded
        />,
      );
    });
    return host.textContent ?? "";
  }

  function basePlan(
    admission: GeneratedPlanCostResult["admission"],
  ): GeneratedPlanCostResult {
    return {
      originTransport: { min: 0, max: 0, source: "unknown", applicable: false },
      localTransit: { min: 0, max: 0, source: "unknown", applicable: false },
      admission,
      meals: { min: 0, max: 0, source: "unknown", applicable: false },
      parking: { min: 0, max: 0, source: "unknown", applicable: false },
      completeness: "complete",
      knownSubtotal: [0, 0],
      hasNumericTotal: true,
      confidence: "verified",
      estimateQuality: "verified",
      assumptions: [],
    };
  }

  it("A) not_applicable admission → widget says Not applicable, NO overall ¥0, honest non-numeric summary", () => {
    const text = renderPlanWidget({
      ...basePlan({
        min: 0,
        max: 0,
        source: "curated",
        applicable: true,
        satisfied: true,
        knownNumeric: false,
        semanticState: "not_applicable",
      }),
      // KAI-219A final N/A guard: all-N/A complete plan has NO numeric
      // cost claim.
      hasNumericTotal: false,
    });
    expect(text).toContain("Not applicable");
    // The admission row is NOT a numeric range (no fake ¥0 admission row).
    // "Admission Tickets" is followed by "Not applicable", not a ¥ range.
    const admissionSection = text.slice(text.indexOf("Admission Tickets"));
    expect(admissionSection).toContain("Not applicable");
    expect(admissionSection).not.toMatch(/¥\d/);
    // No overall numeric total — the honest non-numeric summary shows.
    expect(text).toContain("No applicable priced components");
    // No overall ¥0 range in the header.
    expect(text).not.toMatch(/¥0 - ¥0/);
  });

  it("C) free + paid → widget shows the paid RANGE, NOT Free", () => {
    const text = renderPlanWidget(
      basePlan({
        min: 1500,
        max: 1500,
        source: "curated",
        applicable: true,
        satisfied: true,
        knownNumeric: true,
        semanticState: "paid",
      }),
    );
    expect(text).toContain("¥1,500");
    expect(text).not.toContain("Free");
  });

  it("verified_free semantic → widget says Free / 無料", () => {
    const text = renderPlanWidget(
      basePlan({
        min: 0,
        max: 0,
        source: "curated",
        applicable: true,
        satisfied: true,
        knownNumeric: true,
        semanticState: "verified_free",
      }),
    );
    expect(text).toContain("Free");
  });

  it("partial/mixed admission with known numeric → widget shows the known range, missing admission indicated separately", () => {
    const text = renderPlanWidget({
      ...basePlan({
        min: 1500,
        max: 1500,
        source: "unknown",
        applicable: false,
        satisfied: false,
        knownNumeric: true,
        semanticState: "open_ended_or_variable",
      }),
      // A mixed partial plan (paid + unavailable) is PARTIAL — the widget
      // renders the missing-admission label from planMissingComponents.
      completeness: "partial",
      knownSubtotal: [1500, 1500],
    });
    expect(text).toContain("¥1,500");
    expect(text).toContain("Missing:");
    expect(text).toContain("admission");
  });
});
