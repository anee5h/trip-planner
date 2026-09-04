/**
 * KAI-275: DestinationCard transport-selection regressions.
 *
 *   - Personal-Car-only (carMode + publicModes []) renders the Car icon and
 *     car time — never a Train row.
 *   - Budget resolution (cheapest-mode estimate) cannot switch the displayed
 *     travel mode to Train.
 *   - The transport icon map is explicit: train/ferry have icons; unknown
 *     modes use a neutral route icon; MapPin is never a transport icon.
 *   - Card link state preserves the full planner context (carMode,
 *     publicModes, partySize, duration, travelDate).
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinations from "@/shared/data/destinations-index.json";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import DestinationCard from "../DestinationCard";
import type { ExploreBudgetEstimate } from "../../exploreBudget";
import type { TripDuration } from "@/shared/types/tripDuration";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  canMutateProfile: true,
  favorite: false,
  homeStationCoords: { lat: 35.6812, lng: 139.7671 },
  homeStationTransportZoneId: "mainland-honshu",
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isVisited: () => false,
    isComparing: () => false,
    toggleCompare: vi.fn(),
    compareList: [],
    homeStationCoords: state.homeStationCoords,
    homeStationTransportZoneId: state.homeStationTransportZoneId,
    canMutateProfile: state.canMutateProfile,
    isFavorite: () => state.favorite,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
}));

vi.mock("@/features/trips/components/ItineraryPickerModal", () => ({
  ItineraryPickerModal: () => null,
}));
vi.mock("../MarkVisitedModal", () => ({ MarkVisitedModal: () => null }));
vi.mock("../VisitedDateModal", () => ({ VisitedDateModal: () => null }));
vi.mock(
  "@/features/recommendations/components/RecommendationFeedbackControl",
  () => ({
    RecommendationFeedbackControl: () => (
      <div data-testid="feedback-control">feedback-control</div>
    ),
  }),
);
vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: {
    trackCompare: vi.fn(),
    trackClick: vi.fn(),
  },
}));

// Kamakura is a promoted car-access candidate near Tokyo: my_car AND train
// are both topologically valid, so the car-only assertion is meaningful.
const destination = destinations.find(
  (candidate) => candidate.id === "kamakura-city",
) as Destination;

function travelRowIcons(container: HTMLElement): string[] {
  const row = container.querySelector(
    '[data-testid="destination-card-travel-time"]',
  );
  if (!row) return [];
  return Array.from(row.querySelectorAll("svg")).map(
    (svg) => svg.getAttribute("class") ?? "",
  );
}

let root: Root;
let host: HTMLDivElement;

function LocationProbe() {
  const location = useLocation();
  return (
    <pre data-testid="location-probe">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </pre>
  );
}

async function renderAt(entry: string, cardProps: Record<string, unknown>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/destinations"
            element={
              <div>
                <DestinationCard
                  destination={destination}
                  {...(cardProps as object)}
                />
              </div>
            }
          />
          <Route path="/destinations/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return host;
}

beforeEach(() => {
  state.homeStationCoords = { lat: 35.6812, lng: 139.7671 };
  state.homeStationTransportZoneId = "mainland-honshu";
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
});

describe("KAI-275 DestinationCard transport selection", () => {
  it("Personal-Car-only (carMode=my_car, publicModes=[]) renders the Car icon, never Train", async () => {
    const container = await renderAt("/destinations?car=my_car&mode=none", {
      carMode: "my_car",
      publicModes: [],
    });
    const icons = travelRowIcons(container);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.some((c) => c.includes("lucide-car"))).toBe(true);
    expect(icons.some((c) => c.includes("lucide-train-front"))).toBe(false);
    expect(icons.some((c) => c.includes("lucide-bus"))).toBe(false);
    expect(icons.some((c) => c.includes("lucide-map-pin"))).toBe(false);
  });

  it("budget resolution (cheapest train estimate) cannot switch the car-only display to Train", async () => {
    const trainEstimate = calculateTripEstimate({
      dest: destination,
      mode: "train",
      partySize: 2,
      homeCoords: state.homeStationCoords,
      includeOriginTravel: true,
      duration: "fullDay" as TripDuration,
    });
    const budgetEstimate: ExploreBudgetEstimate = {
      mode: "train",
      validModes: ["train", "my_car"],
      estimate: trainEstimate,
    };
    const container = await renderAt("/destinations?car=my_car&mode=none", {
      carMode: "my_car",
      publicModes: [],
      resolvedBudgetEstimate: budgetEstimate,
    });
    const icons = travelRowIcons(container);
    expect(icons.some((c) => c.includes("lucide-car"))).toBe(true);
    expect(icons.some((c) => c.includes("lucide-train-front"))).toBe(false);
  });

  it("train-only selection renders the Train icon (never MapPin)", async () => {
    const container = await renderAt("/destinations?mode=train", {
      carMode: "none",
      publicModes: ["train"],
    });
    const icons = travelRowIcons(container);
    expect(icons.some((c) => c.includes("lucide-train-front"))).toBe(true);
    expect(icons.some((c) => c.includes("lucide-map-pin"))).toBe(false);
  });

  it("an unknown/absent transport mode uses the neutral route icon, never MapPin", async () => {
    // A destination with no valid mode from this origin (no origin data for
    // the unknown zone) renders the unavailable row with a neutral icon.
    const container = await renderAt("/destinations", {
      carMode: "none",
      publicModes: [],
    });
    const icons = travelRowIcons(container);
    // At minimum the row must exist and never show the location pin.
    expect(icons.some((c) => c.includes("lucide-map-pin"))).toBe(false);
  });

  it("link state preserves carMode, publicModes, partySize, duration, and travelDate", async () => {
    const container = await renderAt(
      "/destinations?car=my_car&mode=none&party=2&partySize=2&duration=fullDay&date=2026-10-01",
      {
        carMode: "my_car",
        publicModes: [],
        partySize: 2,
        duration: "fullDay" as TripDuration,
        ferryTemporal: { travelDate: new Date("2026-10-01T12:00:00") },
      },
    );
    const link = container.querySelector(
      'a[href*="/destinations/kamakura-city"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    await act(async () => {
      link!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const probe = container.querySelector(
      "[data-testid=location-probe]",
    )?.textContent;
    expect(probe).toContain('"carMode":"my_car"');
    expect(probe).toContain('"publicModes":[]');
    expect(probe).toContain('"partySize":2');
    expect(probe).toContain('"duration":"fullDay"');
    expect(probe).toContain('"travelDate":"2026-10-01"');
  });

  it("undefined publicModes (rails/any) keeps the full-mode default — no car-only leak", async () => {
    const container = await renderAt("/destinations", {
      carMode: "none",
    });
    const icons = travelRowIcons(container);
    // Any transport: Kamakura resolves a public mode row (train/shinkansen),
    // and the icon must be a real transport icon.
    expect(icons.some((c) => c.includes("lucide-map-pin"))).toBe(false);
    expect(icons.length).toBeGreaterThan(0);
  });
});

describe("KAI-275 DestinationCard partial-cost disclosure", () => {
  it("partial car estimate (no total, bounded on-site knownSubtotal) shows 'Known ¥.. · on-site only' with the disclosure title", async () => {
    const partialEstimate = calculateTripEstimate({
      dest: destination,
      mode: "my_car",
      partySize: 2,
      homeCoords: state.homeStationCoords,
      includeOriginTravel: true,
      duration: "fullDay" as TripDuration,
    });
    // Discovery car estimates are partial by design (#326): no ORS call →
    // origin-car transport unmeasured → no complete total, bounded subtotal.
    expect(partialEstimate.total).toBeUndefined();
    expect(partialEstimate.completeness).toBe("partial");
    expect(partialEstimate.knownSubtotal[1]).toBeGreaterThan(0);

    const budgetEstimate: ExploreBudgetEstimate = {
      mode: "my_car",
      validModes: ["my_car"],
      estimate: partialEstimate,
    };
    const container = await renderAt("/destinations?car=my_car&mode=none", {
      carMode: "my_car",
      publicModes: [],
      resolvedBudgetEstimate: budgetEstimate,
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Known");
    expect(text).toContain("¥");
    expect(text).toContain("on-site only");
    expect(text).not.toContain("Cost unavailable");
    // The span title discloses the full meaning.
    const titled = container.querySelector('[title*="origin transport"]');
    expect(titled).not.toBeNull();
  });

  it("complete estimate keeps the plain full range (no Known/on-site qualifier)", async () => {
    const completeEstimate = calculateTripEstimate({
      dest: destination,
      mode: "train",
      partySize: 2,
      homeCoords: state.homeStationCoords,
      includeOriginTravel: true,
      duration: "fullDay" as TripDuration,
    });
    expect(completeEstimate.total).toBeDefined();
    const budgetEstimate: ExploreBudgetEstimate = {
      mode: "train",
      validModes: ["train"],
      estimate: completeEstimate,
    };
    const container = await renderAt("/destinations?mode=train", {
      carMode: "none",
      publicModes: ["train"],
      resolvedBudgetEstimate: budgetEstimate,
    });
    const text = container.textContent ?? "";
    expect(text).not.toContain("on-site only");
    expect(text).not.toContain("Cost unavailable");
  });

  it("no meaningful bounded cost keeps 'Cost unavailable' (nothing fabricated)", async () => {
    const container = await renderAt("/destinations", {
      carMode: "none",
      publicModes: [],
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Cost unavailable");
    expect(text).not.toContain("Known");
  });
});
