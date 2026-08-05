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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DestinationDetails from "../DestinationDetails";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function flush(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ja" }));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: localeState.locale, setLocale: vi.fn() }),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
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
  DestinationPlanningSection: () => null,
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
const records = new Map(
  (destinationIndex as { id: string }[]).map((d) => [d.id, d]),
);

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
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

function render(path = "/destinations/naha-city") {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/destinations/:id" element={<DestinationDetails />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  storeState.homeStationCoords = { lat: 35.6812, lng: 139.7671 };
  storeState.homeStationTransportZoneId = "mainland-honshu";
  localeState.locale = "en";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("DestinationDetails transport rows", () => {
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

  it("Ogasawara from Tokyo shows route-known ferry note, no flight, no generic origin transport cost", async () => {
    render("/destinations/ogasawara-islands-tokyo");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Ferry route available");
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).not.toContain("Flight");
    // No flight cost estimate may be rendered.
    expect(text).not.toContain("Flight (Air & Access)");
    // No selectable transport mode exists and no origin transport is
    // claimed: the budget card is the on-site budget.
    expect(text).toContain("On-site budget (transport excluded)");
    expect(text).not.toContain("Local transport");
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
    expect(text).toContain("On-site budget (transport excluded)");
    expect(text).not.toContain("Local transport");
  });

  it("Ogasawara from Tokyo never claims the total includes transport", async () => {
    render("/destinations/ogasawara-islands-tokyo");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("including transport");
    expect(text).not.toContain("交通・チケット・食事を含む");
  });

  it("Japanese locale also excludes transport from the budget copy", async () => {
    localeState.locale = "ja";
    render("/destinations/ogasawara-islands-tokyo");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("現地予算（往復交通費を除く）");
    expect(text).not.toContain("含む予想合計");
  });

  it("Kouri from Naha never displays Train and shows local-access copy", async () => {
    storeState.homeStationCoords = { lat: 26.2124, lng: 127.6809 };
    storeState.homeStationTransportZoneId = "okinawa-main";
    render("/destinations/kouri-island-okinawa");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).toContain("Local access available");
  });

  it("Sakurajima from Kagoshima never displays Train", async () => {
    storeState.homeStationCoords = { lat: 31.5966, lng: 130.5571 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/sakurajima-volcano-kagoshima");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Train");
    expect(text).not.toContain("Shinkansen");
    expect(text).toContain("Local access available");
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
});
