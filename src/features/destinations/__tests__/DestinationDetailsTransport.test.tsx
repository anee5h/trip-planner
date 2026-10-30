/**
 * @vitest-environment jsdom
 *
 * Renders the production DestinationDetails component and proves transport
 * row semantics: mainland → Naha never shows Train/Shinkansen, Naha-local
 * shows local rail, and unavailable routes render the localized unavailable
 * state with no train-derived budget.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import DestinationDetails, {
  isDetailTransportModeAllowed,
} from "../DestinationDetails";
import { TripCostBreakdownWidget } from "../components/TripCostBreakdownWidget";
import { TripContextProvider } from "@/shared/context/TripContext";
import liteIndex from "@/shared/data/destinations-index.lite.json";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";
import type { CarRoundTripRoute } from "@/shared/services/transport/CarRouteProvider";
import type {
  AdmissionPriceSelection,
  Destination,
} from "@/shared/types/destination";
import type { TripDuration } from "@/shared/types/tripDuration";
import { selectionWithPartyComposition } from "@/shared/services/budget/admissionPricing";
import { calculateTripEstimateForVisit } from "@/shared/services/budget/tripEstimateEngine";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function flush(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ja" }));
const tripContextUpdates = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: localeState.locale, setLocale: vi.fn() }),
}));

vi.mock("@/shared/context/TripContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/shared/context/TripContext")>();
  return {
    ...actual,
    useOptionalTripContext: () => {
      const context = actual.useOptionalTripContext();
      return {
        ...context,
        updateTripContext: (patch: unknown) => {
          tripContextUpdates.calls.push(patch);
          context.updateTripContext(patch as never);
        },
      };
    },
  };
});

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const carRefinementState = vi.hoisted(() => ({
  routes: undefined as CarRoundTripRoute | undefined,
  status: "idle" as "idle" | "provider-backed",
  failureCode: undefined as string | undefined,
}));

vi.mock("../hooks/useDestinationCarRouteRefinement", () => ({
  useDestinationCarRouteRefinement: () => carRefinementState,
}));

const authState = vi.hoisted(() => ({
  user: null as {
    id: string;
    user_metadata: { preferences?: Record<string, unknown> };
  } | null,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock("@/shared/hooks/useWeather", () => ({
  useWeather: () => ({ forecast: null, currentWeather: null, loading: false }),
  useWeekendWeather: () => ({ forecast: null, loading: false }),
}));

vi.mock("@/shared/services/wikipedia/WikipediaService", () => ({
  WikipediaService: {
    fetchSummary: vi.fn(async () => null),
  },
}));

vi.mock("@/shared/hooks/useRecentlyViewedDestinations", () => ({
  addRecentlyViewedDestination: vi.fn(),
}));

vi.mock("@/features/trips/components/ItineraryPickerModal", () => ({
  ItineraryPickerModal: () => null,
}));

vi.mock("../components/MarkVisitedModal", () => ({
  MarkVisitedModal: () => null,
}));
vi.mock("../components/VisitedDateModal", () => ({
  VisitedDateModal: () => null,
}));
vi.mock("../components/DestinationPlanningSection", () => ({
  DestinationPlanningSection: (props: {
    destination?: Destination;
    locale?: "en" | "ja";
    homeCoords?: { lat: number; lng: number };
    selectedTransport?: string | null;
    partySize?: number;
    duration?: string;
    carRoute?: CarRoundTripRoute;
    carCostOptions?: Record<string, unknown>;
    travelDate?: string;
    childCount?: number;
    admissionSelection?: AdmissionPriceSelection;
    onPartySizeChange?: (partySize: number) => void;
    onChildCountChange?: (childCount: number | undefined) => void;
  }) => {
    planningState.selectedTransport = props.selectedTransport ?? null;
    planningState.partySize = props.partySize;
    planningState.duration = props.duration;
    planningState.carRoute = props.carRoute;
    planningState.carCostOptions = props.carCostOptions;
    planningState.travelDate = props.travelDate;
    planningState.childCount = props.childCount;
    planningState.admissionSelection = props.admissionSelection;
    planningState.changePartySize = props.onPartySizeChange;
    planningState.changeChildCount = props.onChildCountChange;
    if (!planningState.renderCostWidget || !props.destination) return null;
    return (
      <TripCostBreakdownWidget
        destination={props.destination}
        locale={props.locale ?? "en"}
        partySize={props.partySize}
        homeCoords={props.homeCoords}
        activeTransportMode={props.selectedTransport}
        duration={props.duration as TripDuration | undefined}
        visitDate={props.travelDate}
        admissionSelection={selectionWithPartyComposition(
          props.admissionSelection,
          props.partySize ?? 2,
          props.childCount,
        )}
      />
    );
  },
}));
vi.mock("../components/DestinationMap", () => ({ default: () => null }));
vi.mock(
  "@/features/recommendations/components/RecommendationFeedbackControl",
  () => ({ RecommendationFeedbackControl: () => null }),
);
vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: { trackCompare: vi.fn(), trackClick: vi.fn() },
}));
vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
}));

import destinationIndex from "@/shared/data/destinations-index.json";
const records = new Map<string, Record<string, unknown>>(
  (destinationIndex as Record<string, unknown>[]).map((d) => [String(d.id), d]),
);
let destinationRecordOverride:
  { id: string; previous: Record<string, unknown> } | undefined;
const nmwaAccessAnchor = {
  id: "nmwa-road-entrance",
  label: "NMWA road entrance",
  kind: "road_access_entrance" as const,
  coordinates: { lat: 35.7202, lng: 139.7767 },
  accessAnchorId: "nmwa-road-entrance",
  sourceUrls: ["https://example.com/nmwa-road"],
};
const providerCarRoute: CarRoundTripRoute = {
  outbound: {
    availability: "available",
    origin: { lat: 35.6812, lng: 139.7671 },
    destination: nmwaAccessAnchor,
    accessAnchor: nmwaAccessAnchor,
    provider: "fixture-route-provider",
    direction: "outbound",
    distanceKm: 12,
    durationMinutes: 35,
    toll: { state: "priced", amountJPY: 800, basis: "ETC" },
    confidence: "verified",
    completeness: "complete",
  },
  returnRoute: {
    availability: "available",
    origin: nmwaAccessAnchor.coordinates,
    destination: {
      id: "origin",
      label: "Trip origin",
      coordinates: { lat: 35.6812, lng: 139.7671 },
    },
    accessAnchor: nmwaAccessAnchor,
    provider: "fixture-route-provider",
    direction: "return",
    distanceKm: 12,
    durationMinutes: 35,
    toll: { state: "priced", amountJPY: 800, basis: "ETC" },
    confidence: "verified",
    completeness: "complete",
  },
};
const providerCarRouteUnknownToll: CarRoundTripRoute = {
  ...providerCarRoute,
  outbound: {
    ...providerCarRoute.outbound,
    toll: { state: "unknown", basis: "unspecified" },
  },
  returnRoute: {
    ...providerCarRoute.returnRoute,
    toll: { state: "unknown", basis: "unspecified" },
  },
};
const nmwaRecord = records.get("national-museum-western-art-tokyo");
if (nmwaRecord) {
  records.set("national-museum-western-art-tokyo", {
    ...nmwaRecord,
    carAccess: {
      state: "direct",
      eligibility: "eligible",
      anchors: [
        {
          id: "nmwa-road-entrance",
          label: "NMWA road entrance",
          kind: "road_access_entrance",
          coordinates: { lat: 35.7202, lng: 139.7767 },
          sourceUrls: ["https://example.com/nmwa-road"],
        },
      ],
      evidence: "catalogue_metadata",
      sourceUrls: ["https://example.com/nmwa-road"],
    },
  });
}

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // KAI-132: the lite catalogue is fetched at runtime — serve it from
    // the imported JSON so summary-dependent logic works in tests.
    if (url.endsWith("/data/destinations-index.lite.json")) {
      return {
        ok: true,
        json: async () => liteIndex,
      } as Response;
    }
    const match = url.match(/\/data\/destinations\/([^/]+)\.json$/);
    if (match && records.has(match[1])) {
      return { ok: true, json: async () => records.get(match[1]) } as Response;
    }
    return { ok: false, json: async () => null } as Response;
  }),
);

const storeState = vi.hoisted(() => ({
  homeStationCoords: { lat: 35.6812, lng: 139.7671 } as {
    lat: number;
    lng: number;
  } | null,
  homeStationTransportZoneId: undefined as string | undefined,
}));

const planningState = vi.hoisted(() => ({
  selectedTransport: null as string | null,
  partySize: undefined as number | undefined,
  duration: undefined as string | undefined,
  carRoute: undefined as CarRoundTripRoute | undefined,
  carCostOptions: undefined as Record<string, unknown> | undefined,
  travelDate: undefined as string | undefined,
  childCount: undefined as number | undefined,
  admissionSelection: undefined as AdmissionPriceSelection | undefined,
  changePartySize: undefined as ((partySize: number) => void) | undefined,
  changeChildCount: undefined as
    ((childCount: number | undefined) => void) | undefined,
  renderCostWidget: false,
}));

const NAKAYAMA = { lat: 35.514745, lng: 139.539692 };
const SHIN_YOKOHAMA = { lat: 35.5073, lng: 139.6172 };
const CHIBA = { lat: 35.6131, lng: 140.1133 };

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isVisited: () => false,
    getVisitCount: () => 0,
    homeStation: "Tokyo Station",
    homeStationCoords: storeState.homeStationCoords,
    homeStationTransportZoneId: storeState.homeStationTransportZoneId,
    getDestinationRating: () => null,
    isComparing: () => false,
    toggleCompare: vi.fn(),
    compareList: [],
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    canMutateProfile: true,
  }),
}));

let root: Root;
let host: HTMLDivElement;

function render(
  path = "/destinations/naha-city",
  state?: Record<string, unknown>,
) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: path, state: state ?? null }]}>
        <Routes>
          <Route path="/destinations/:id" element={<DestinationDetails />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

function renderWithTripContext(
  path = "/destinations/naha-city",
  state?: Record<string, unknown>,
) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: path, state: state ?? null }]}>
        <TripContextProvider>
          <Routes>
            <Route path="/destinations/:id" element={<DestinationDetails />} />
          </Routes>
        </TripContextProvider>
      </MemoryRouter>,
    );
  });
}

beforeAll(async () => {
  await loadLiteIndex();
});

beforeEach(() => {
  authState.user = null;
  storeState.homeStationCoords = { lat: 35.6812, lng: 139.7671 };
  storeState.homeStationTransportZoneId = "mainland-honshu";
  localeState.locale = "en";
  carRefinementState.routes = undefined;
  carRefinementState.status = "idle";
  carRefinementState.failureCode = undefined;
  planningState.selectedTransport = null;
  planningState.partySize = undefined;
  planningState.duration = undefined;
  planningState.carRoute = undefined;
  planningState.carCostOptions = undefined;
  planningState.travelDate = undefined;
  planningState.childCount = undefined;
  planningState.admissionSelection = undefined;
  planningState.changePartySize = undefined;
  planningState.changeChildCount = undefined;
  planningState.renderCostWidget = false;
  sessionStorage.clear();
  tripContextUpdates.calls.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (destinationRecordOverride) {
    records.set(
      destinationRecordOverride.id,
      destinationRecordOverride.previous,
    );
    destinationRecordOverride = undefined;
  }
});

describe("DestinationDetails transport rows", () => {
  it("keeps the detail header total on the widget's dated ticket and party context", async () => {
    const destinationId = "nago-pineapple-park";
    const previousRecord = records.get(destinationId)!;
    const destination = {
      ...previousRecord,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "weekday",
            category: "adult",
            min: 1000,
            max: 1000,
            dayType: "weekday",
          },
          {
            productId: "standard",
            variantId: "weekday",
            category: "child",
            min: 500,
            max: 500,
            dayType: "weekday",
          },
          {
            productId: "standard",
            variantId: "holiday",
            category: "adult",
            min: 3000,
            max: 3000,
            dayType: "holiday",
          },
          {
            productId: "standard",
            variantId: "holiday",
            category: "child",
            min: 1500,
            max: 1500,
            dayType: "holiday",
          },
        ],
      },
    } as unknown as Record<string, unknown>;
    records.set(destinationId, destination);
    destinationRecordOverride = { id: destinationId, previous: previousRecord };
    planningState.renderCostWidget = true;

    const expectedFor = (travelDate: string) =>
      calculateTripEstimateForVisit({
        dest: destination as unknown as Destination,
        mode: "flight",
        partySize: 2,
        childCount: 1,
        visitDate: travelDate,
        duration: "fullDay",
        includeOriginTravel: false,
      });
    const weekdayDate = "2026-11-24";
    const holidayDate = "2026-11-23";
    expect(expectedFor(weekdayDate).total).toBeDefined();
    expect(expectedFor(holidayDate).total).toBeDefined();
    expect(
      expectedFor(weekdayDate).components.find(
        (component) => component.evidence.scope === "admission",
      )?.cost,
    ).toEqual({ kind: "bounded", min: 1500, max: 1500 });
    expect(
      expectedFor(holidayDate).components.find(
        (component) => component.evidence.scope === "admission",
      )?.cost,
    ).toEqual({ kind: "bounded", min: 4500, max: 4500 });

    render(`/destinations/${destinationId}`, {
      publicModes: ["flight"],
      partySize: 2,
      childCount: 1,
      travelDate: weekdayDate,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });
    const weekdayWidgetTotal = host.querySelector(
      '[data-testid="trip-cost-total"]',
    )?.textContent;
    const weekdayModeTotal = host.querySelector(
      '[data-testid="mode-estimate-flight"]',
    )?.textContent;
    expect(weekdayWidgetTotal).toBeTruthy();
    expect(weekdayModeTotal).toContain(weekdayWidgetTotal);
    expect(planningState.travelDate).toBe(weekdayDate);
    expect(planningState.childCount).toBe(1);

    act(() => root.unmount());
    root = createRoot(host);
    planningState.travelDate = undefined;
    render(`/destinations/${destinationId}`, {
      publicModes: ["flight"],
      partySize: 2,
      childCount: 1,
      travelDate: holidayDate,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });
    const holidayWidgetTotal = host.querySelector(
      '[data-testid="trip-cost-total"]',
    )?.textContent;
    const holidayModeTotal = host.querySelector(
      '[data-testid="mode-estimate-flight"]',
    )?.textContent;
    expect(holidayWidgetTotal).toBeTruthy();
    expect(holidayWidgetTotal).not.toBe(weekdayWidgetTotal);
    expect(holidayModeTotal).toContain(holidayWidgetTotal);
    expect(planningState.travelDate).toBe(holidayDate);
    expect(planningState.childCount).toBe(1);
  });

  it("filters default detail modes by transport intent", () => {
    const publicModes = ["train", "shinkansen", "bus", "flight"];
    expect(
      isDetailTransportModeAllowed("train", null, publicModes, "none"),
    ).toBe(true);
    expect(isDetailTransportModeAllowed("car", null, publicModes, "none")).toBe(
      false,
    );
    expect(
      isDetailTransportModeAllowed("car", null, publicModes, "rental"),
    ).toBe(true);
    expect(isDetailTransportModeAllowed("car", [], publicModes, "rental")).toBe(
      false,
    );
    expect(
      isDetailTransportModeAllowed("ferry", ["train"], publicModes, "none"),
    ).toBe(true);
    expect(isDetailTransportModeAllowed("ferry", [], publicModes, "none")).toBe(
      false,
    );
    expect(
      isDetailTransportModeAllowed("ferry", ["my_car"], [], "my_car"),
    ).toBe(false);
    expect(isDetailTransportModeAllowed("ferry", ["car"], [], "rental")).toBe(
      false,
    );
  });

  it("migrates the stale destination-only session context to default train intent", async () => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({
        origin: {
          label: "Tokyo Station",
          coordinates: { lat: 35.6812, lng: 139.7671 },
          source: "default",
          transportZoneId: "mainland-honshu",
        },
        travelDate: null,
        dateSemantics: "any",
        duration: "halfDay",
        partySize: 2,
        publicModes: [],
        carMode: "none",
        budget: { kind: "cap", cap: 75000, tier: "standard" },
        destinationId: "roppongi-hills-tokyo-city-view",
      }),
    );
    storeState.homeStationTransportZoneId = undefined;
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view");
    await act(async () => {
      await flush(80);
    });

    expect(planningState.selectedTransport).toBe("train");
    expect(sessionStorage.getItem("meguruto-active-trip-context")).toBeNull();
  });

  it("keeps meaningful route context while retaining default public transport intent", async () => {
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view", {
      duration: "2d1n",
      partySize: 3,
      budget: { kind: "preset", preset: "standard" },
    });
    await act(async () => {
      await flush(80);
    });

    expect(planningState.selectedTransport).toBe("train");
    expect(planningState.partySize).toBe(3);
    expect(planningState.duration).toBe("2d1n");
  });

  it("keeps legacy party edits local when trip context is already explicit", async () => {
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view", {
      partySize: 2,
    });
    await act(async () => {
      await flush(80);
    });
    const storedContext = sessionStorage.getItem(
      "meguruto-active-trip-context",
    );
    expect(storedContext).not.toBeNull();
    tripContextUpdates.calls.length = 0;

    act(() => planningState.changePartySize?.(3));
    await act(async () => {
      await flush(80);
    });

    expect(planningState.partySize).toBe(2);
    expect(tripContextUpdates.calls).toEqual([]);
    expect(sessionStorage.getItem("meguruto-active-trip-context")).toBe(
      storedContext,
    );
  });

  it("updates shared trip context for party edits when ticket options exist", async () => {
    const destinationId = "roppongi-hills-tokyo-city-view";
    const previousRecord = records.get(destinationId)!;
    records.set(destinationId, {
      ...previousRecord,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_product",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
          {
            productId: "standard",
            variantId: "entry",
            category: "child",
            min: 500,
            max: 500,
          },
        ],
      },
    });
    destinationRecordOverride = {
      id: destinationId,
      previous: previousRecord,
    };
    renderWithTripContext(`/destinations/${destinationId}`, { partySize: 2 });
    await act(async () => {
      await flush(80);
    });

    act(() => planningState.changePartySize?.(3));
    await act(async () => {
      await flush(80);
    });
    expect(tripContextUpdates.calls).toContainEqual({
      partySize: 3,
      childCount: undefined,
    });

    act(() => planningState.changeChildCount?.(1));
    await act(async () => {
      await flush(80);
    });
    expect(tripContextUpdates.calls).toContainEqual({ childCount: 1 });
  });

  it("keeps ticket-option edits local until a trip context is explicit", async () => {
    const destinationId = "roppongi-hills-tokyo-city-view";
    const previousRecord = records.get(destinationId)!;
    records.set(destinationId, {
      ...previousRecord,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_product",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    });
    destinationRecordOverride = {
      id: destinationId,
      previous: previousRecord,
    };
    renderWithTripContext(`/destinations/${destinationId}`);
    await act(async () => {
      await flush(80);
    });
    tripContextUpdates.calls.length = 0;

    act(() => planningState.changePartySize?.(3));
    act(() => planningState.changeChildCount?.(1));
    await act(async () => {
      await flush(80);
    });

    expect(planningState.partySize).toBe(3);
    expect(planningState.childCount).toBe(1);
    expect(tripContextUpdates.calls).toEqual([]);
    expect(sessionStorage.getItem("meguruto-active-trip-context")).toBeNull();
  });

  it("uses a valid nav ticket split across the page", async () => {
    const destinationId = "roppongi-hills-tokyo-city-view";
    const previousRecord = records.get(destinationId)!;
    records.set(destinationId, {
      ...previousRecord,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_product",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
          {
            productId: "standard",
            variantId: "entry",
            category: "child",
            min: 500,
            max: 500,
          },
        ],
      },
    });
    destinationRecordOverride = {
      id: destinationId,
      previous: previousRecord,
    };

    render(`/destinations/${destinationId}`, {
      partySize: 3,
      admissionSelection: { adultCount: 2, childCount: 1 },
    });
    await act(async () => {
      await flush(80);
    });

    expect(planningState.childCount).toBe(1);
    expect(planningState.admissionSelection).toMatchObject({
      adultCount: 2,
      childCount: 1,
    });
  });

  it("removes nav-provided party composition when child count is cleared", async () => {
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view", {
      partySize: 2,
      childCount: 1,
      admissionSelection: {
        productId: "standard",
        adultCount: 1,
        childCount: 1,
      },
    });
    await act(async () => {
      await flush(80);
    });

    expect(planningState.admissionSelection).toEqual({
      productId: "standard",
      adultCount: 1,
      childCount: 1,
    });
    act(() => planningState.changeChildCount?.(undefined));
    await act(async () => {
      await flush(80);
    });

    expect(planningState.childCount).toBeUndefined();
    expect(planningState.admissionSelection).toEqual({
      productId: "standard",
    });
  });

  it("migrates a minimal stale destination-only session context", async () => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({ destinationId: "roppongi-hills-tokyo-city-view" }),
    );
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view");
    await act(async () => {
      await flush(80);
    });

    expect(planningState.selectedTransport).toBe("train");
    expect(sessionStorage.getItem("meguruto-active-trip-context")).toBeNull();
  });

  it("clears unsupported session context versions safely", async () => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({
        version: 2,
        explicit: true,
        context: {
          publicModes: ["train"],
          carMode: "none",
          destinationId: "roppongi-hills-tokyo-city-view",
        },
      }),
    );
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view");
    await act(async () => {
      await flush(80);
    });

    expect(planningState.selectedTransport).toBe("train");
    expect(sessionStorage.getItem("meguruto-active-trip-context")).toBeNull();
  });

  it("preserves a versioned explicit empty-mode context as deny-all", async () => {
    sessionStorage.setItem(
      "meguruto-active-trip-context",
      JSON.stringify({
        version: 1,
        explicit: true,
        explicitTransportIntent: true,
        context: {
          origin: {
            label: "Tokyo Station",
            coordinates: { lat: 35.6812, lng: 139.7671 },
            source: "station",
            transportZoneId: "mainland-honshu",
          },
          travelDate: null,
          dateSemantics: "any",
          duration: "halfDay",
          partySize: 2,
          publicModes: [],
          carMode: "none",
          budget: { kind: "preset", preset: "standard" },
          destinationId: "roppongi-hills-tokyo-city-view",
        },
      }),
    );
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view");
    await act(async () => {
      await flush(80);
    });

    expect(planningState.selectedTransport).toBeNull();
    expect(sessionStorage.getItem("meguruto-active-trip-context")).toContain(
      '"version":1',
    );
  });

  it("keeps train selected for Roppongi when travel time is unavailable", async () => {
    storeState.homeStationTransportZoneId = undefined;
    renderWithTripContext("/destinations/roppongi-hills-tokyo-city-view");
    await act(async () => {
      await flush(80);
    });

    expect(planningState.selectedTransport).toBe("train");
  });

  it.each([
    ["English", "en", "rental", "Rough estimate:", "Rough estimate"],
    ["Japanese", "ja", "my_car", "概算：", "概算"],
  ])(
    "keeps exactly one approximation label in the %s car row",
    async (
      _localeName,
      locale,
      carMode,
      formattedPrefix,
      approximationText,
    ) => {
      localeState.locale = locale as "en" | "ja";
      render("/destinations/national-museum-western-art-tokyo", {
        carMode,
        publicModes: [],
        partySize: 2,
        duration: "fullDay",
      });
      await act(async () => {
        await flush(80);
      });

      const estimate = Array.from(host.querySelectorAll(".font-semibold")).find(
        (element) => element.textContent?.includes(formattedPrefix),
      );
      expect(estimate?.textContent).toContain(formattedPrefix);
      expect(
        (
          estimate?.textContent?.match(
            new RegExp(approximationText as string, "g"),
          ) ?? []
        ).length,
      ).toBe(1);
    },
  );

  it("projects a provider-backed rental-car cost through the production seam", async () => {
    carRefinementState.routes = providerCarRoute;
    carRefinementState.status = "provider-backed";
    render("/destinations/national-museum-western-art-tokyo", {
      carMode: "rental",
      publicModes: [],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Rental Car");
    expect(text).not.toContain("Cost unavailable");
    expect(text).toContain("/ car, round trip");
  });

  it("projects a provider-backed personal-car cost through the production seam", async () => {
    carRefinementState.routes = providerCarRoute;
    carRefinementState.status = "provider-backed";
    render("/destinations/national-museum-western-art-tokyo", {
      carMode: "my_car",
      publicModes: [],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Personal Car");
    expect(text).not.toContain("Cost unavailable");
    expect(text).toContain("/ car, round trip");
  });

  it("renders a rental-car subtotal with unresolved toll in English", async () => {
    carRefinementState.routes = providerCarRouteUnknownToll;
    carRefinementState.status = "provider-backed";
    render("/destinations/national-museum-western-art-tokyo", {
      carMode: "rental",
      publicModes: [],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });

    expect(planningState.carRoute).toBe(providerCarRouteUnknownToll);
    expect(planningState.carCostOptions).toMatchObject({
      partySize: 2,
      duration: "fullDay",
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Rental Car");
    expect(text).toContain("(tolls excluded)");
    expect(text).toContain("/ car, round trip");
    expect(text).not.toContain("Cost unavailable");
    const partialCost = Array.from(host.querySelectorAll(".text-xs")).find(
      (element) => element.textContent?.includes("(tolls excluded)"),
    );
    expect(partialCost?.parentElement?.className).toContain("min-w-0");
  });

  it("renders a personal-car subtotal with unresolved toll in Japanese", async () => {
    carRefinementState.routes = providerCarRouteUnknownToll;
    carRefinementState.status = "provider-backed";
    localeState.locale = "ja";
    render("/destinations/national-museum-western-art-tokyo", {
      carMode: "my_car",
      publicModes: [],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });

    expect(planningState.carRoute).toBe(providerCarRouteUnknownToll);
    expect(planningState.carCostOptions).toMatchObject({ partySize: 2 });
    expect(planningState.carCostOptions).not.toHaveProperty("duration");
    const text = host.textContent ?? "";
    expect(text).toContain("マイカー");
    expect(text).toContain("（通行料は含まれません）");
    expect(text).toContain("／車・往復");
    expect(text).not.toContain("料金不明");
    const partialCost = Array.from(host.querySelectorAll(".text-xs")).find(
      (element) => element.textContent?.includes("（通行料は含まれません）"),
    );
    expect(partialCost?.parentElement?.className).toContain("min-w-0");
  });

  it("shows transport-only per-person cost instead of the whole-trip total", async () => {
    storeState.homeStationCoords = { lat: 35.6812, lng: 139.7671 };
    storeState.homeStationTransportZoneId = "mainland-honshu";
    render("/destinations/ueno-zoo", {
      carMode: "none",
      publicModes: ["train"],
      partySize: 4,
      duration: "2d1n",
    });
    await act(async () => {
      await flush(80);
    });

    const transportCost = Array.from(host.querySelectorAll("*"), (element) =>
      element.textContent?.trim(),
    ).find((text) => text === "est. ~¥600–2k / person, round trip");
    expect(transportCost).toBeDefined();
  });

  it("mainland origin → Naha renders no Train or Shinkansen row", async () => {
    render();
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
  });

  it("Naha-local origin → Naha renders the local rail row", async () => {
    storeState.homeStationCoords = { lat: 26.2124, lng: 127.6809 };
    storeState.homeStationTransportZoneId = "okinawa-main";
    render();
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Train");
  });

  it("unknown topology origin asserts no Train, no train-derived budget, and unavailable copy", async () => {
    storeState.homeStationCoords = { lat: 99.0, lng: 99.0 };
    storeState.homeStationTransportZoneId = "unknown";
    render();
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).toContain("Transport estimate unavailable");
  });

  it.each([
    ["Nakayama", NAKAYAMA],
    ["Shin-Yokohama", SHIN_YOKOHAMA],
    ["Chiba", CHIBA],
  ])(
    "%s shows the canonical estimated cost range (bounded despite partial evidence)",
    async (_originName, originCoords) => {
      storeState.homeStationCoords = originCoords;
      storeState.homeStationTransportZoneId = "mainland-honshu";
      render("/destinations/yokohama-city");
      await act(async () => {
        await flush(80);
      });
      const text = host.textContent ?? "";
      expect(text).toContain("Train");
      expect(text).toContain("est.");
      expect(text).toMatch(/¥[0-9.]+k–[0-9.]+k/);
    },
  );

  it("Tokyo uses the verified corridor for destination details", async () => {
    render("/destinations/seiko-museum-ginza");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("5–15 min");
    expect(text).not.toContain("Transport estimate unavailable");
  });

  it("no-route destination (Fukuoka → Ogasawara) renders unavailable copy", async () => {
    storeState.homeStationCoords = { lat: 33.5902, lng: 130.4017 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/ogasawara-islands-tokyo");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).toContain("Transport estimate unavailable");
  });

  it("Ogasawara from Tokyo shows ferry estimate, no train/flight", async () => {
    // August 2026 travel: the Ogasawara August fare window applies.
    render("/destinations/ogasawara-islands-tokyo", {
      travelDate: "2026-08-06",
    });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Ferry");
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).not.toContain("Flight");
    // KAI-217B round-3: the ferry corridor fare is corridor_only (access
    // legs not modeled) + required local transport is unavailable → the
    // The page-level legacy on-site budget card is intentionally removed;
    // Budget v2 remains covered by the planning widget.
    expect(text).not.toContain("On-site budget (transport excluded)");
  });

  it("Ogasawara from Fukuoka shows no ferry note, unavailable copy, and on-site budget", async () => {
    storeState.homeStationCoords = { lat: 33.5902, lng: 130.4017 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/ogasawara-islands-tokyo");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Transport estimate unavailable");
    expect(text).not.toContain("Ferry route available");
    expect(text).not.toContain("On-site budget (transport excluded)");
    expect(text).not.toContain("Local transport");
  });

  it("Ogasawara from Tokyo no longer shows on-site-only budget (ferry estimable)", async () => {
    render("/destinations/ogasawara-islands-tokyo", {
      travelDate: "2026-08-06",
    });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    // KAI-217B round-3: partial ferry access still must not resurrect the
    // removed page-level legacy budget card.
    expect(text).not.toContain("On-site budget (transport excluded)");
  });

  it("Japanese locale no longer shows on-site-only budget when ferry estimable", async () => {
    localeState.locale = "ja";
    render("/destinations/ogasawara-islands-tokyo", {
      travelDate: "2026-08-06",
    });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    // KAI-217B round-3: partial ferry access must not resurrect the removed
    // page-level legacy budget card in Japanese either.
    expect(text).not.toContain("現地予算（往復交通費を除く）");
  });

  it("Tomogashima ferry row follows the planned travel date (August)", async () => {
    storeState.homeStationCoords = { lat: 34.2261, lng: 135.1675 };
    storeState.homeStationTransportZoneId = "mainland-honshu";
    // August-planned trip: estimable ferry row with time/cost.
    render("/destinations/tomogashima-islands", { travelDate: "2026-08-06" });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Ferry");
    expect(text).not.toContain("time and cost unavailable");
  });

  it("Tomogashima ferry row follows the planned travel date (January)", async () => {
    storeState.homeStationCoords = { lat: 34.2261, lng: 135.1675 };
    storeState.homeStationTransportZoneId = "mainland-honshu";
    // Winter operation (Jan–Feb weekends/holidays) exists; a January 2027
    // trip is within the ¥2,800 fare window, so a full ferry estimate row
    // renders — not the route-known fallback.
    render("/destinations/tomogashima-islands", { travelDate: "2027-01-17" });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Ferry");
    expect(text).not.toContain("time and cost unavailable");
  });

  it("Kouri from Naha shows the verified highway-bus route, never Train", async () => {
    // KAI-63: Naha now participates in the verified naha⇔nago highway-bus
    // corridor, so Kouri (nago-side, ~13 km onward) gains a bounded
    // bus estimate instead of the route-known-but-unestimated copy. Rail
    // stays absent: Okinawa has no shinkansen and no intercity rail.
    storeState.homeStationCoords = { lat: 26.2124, lng: 127.6809 };
    storeState.homeStationTransportZoneId = "okinawa-main";
    render("/destinations/kouri-island-okinawa");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).toContain("Travel Time Bus");
    expect(text).toContain("est.");
    expect(text).not.toContain(
      "Intercity fare only; local access cost is not modeled",
    );
    expect(text).not.toContain("Local access available");
  });

  it("Sakurajima from Kagoshima shows Ferry, never Train", async () => {
    storeState.homeStationCoords = { lat: 31.5966, lng: 130.5571 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/sakurajima-volcano-kagoshima");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    // Same-zone ferry route (Kagoshima → Sakurajima) is now estimable.
    expect(text).toContain("Ferry");
  });

  it("Fukuoka → Ishigaki rendered UI shows an estimated Flight range", async () => {
    storeState.homeStationCoords = { lat: 33.5902, lng: 130.4017 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/ishigaki-city");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Flight");
    expect(text).toContain("est.");
    expect(text).not.toContain("On-site budget (transport excluded)");
    expect(text).not.toContain("Couple Budget");
    expect(text).not.toContain("Solo Budget");
    expect(text).not.toContain("Group Budget");
  });

  it("Fukuoka → Ishigaki rendered UI shows an estimated Flight range in Japanese", async () => {
    storeState.homeStationCoords = { lat: 33.5902, lng: 130.4017 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    localeState.locale = "ja";
    render("/destinations/ishigaki-city");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("飛行機");
    expect(text).toContain("目安");
    expect(text).not.toContain("現地予算（往復交通費を除く）");
    expect(text).not.toContain("カップル予算");
    expect(text).not.toContain("グループ予算");
  });
  it("Aoshima from Miyazaki retains legitimate Train access", async () => {
    storeState.homeStationCoords = { lat: 31.9077, lng: 131.4202 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/aoshima-island-miyazaki");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Train");
    expect(text).not.toContain("Shinkansen");
  });

  it("route-selected personal car is authoritative over saved public transport preferences", async () => {
    authState.user = {
      id: "saved-profile",
      user_metadata: {
        preferences: {
          carMode: "none",
          publicModes: ["train", "shinkansen", "bus"],
          partySize: 4,
        },
      },
    };
    render("/destinations/national-museum-western-art-tokyo", {
      carMode: "my_car",
      publicModes: [],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Personal Car");
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).not.toContain("Bus");
  });

  it("does not substitute public transport when selected personal car is unsupported", async () => {
    authState.user = {
      id: "saved-profile",
      user_metadata: {
        preferences: {
          carMode: "none",
          publicModes: ["train", "shinkansen", "bus"],
        },
      },
    };
    render("/destinations/seiko-museum-ginza", {
      carMode: "my_car",
      publicModes: [],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Transport estimate unavailable");
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).not.toContain("Bus");
  });

  it("renders only valid members of a mixed personal-car and train selection", async () => {
    render("/destinations/national-museum-western-art-tokyo", {
      carMode: "my_car",
      publicModes: ["train"],
      partySize: 2,
      duration: "fullDay",
    });
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Personal Car");
    expect(text).toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).not.toContain("Bus");
  });
});
