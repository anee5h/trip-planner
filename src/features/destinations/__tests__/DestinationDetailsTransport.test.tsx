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
import DestinationDetails from "../DestinationDetails";
import liteIndex from "@/shared/data/destinations-index.lite.json";
import { loadLiteIndex } from "@/shared/services/place/PlaceCatalog";

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

beforeAll(async () => {
  await loadLiteIndex();
});

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

  it.each([
    ["Nakayama", NAKAYAMA],
    ["Shin-Yokohama", SHIN_YOKOHAMA],
    ["Chiba", CHIBA],
  ])(
    "%s labels a bounded local fare estimate when no verified corridor exists",
    async (_originName, originCoords) => {
      storeState.homeStationCoords = originCoords;
      storeState.homeStationTransportZoneId = "mainland-honshu";
      render("/destinations/yokohama-city");
      await act(async () => {
        await flush(80);
      });
      const text = host.textContent ?? "";
      expect(text).toContain("Local fare estimate (bounded)");
      expect(text).toContain("~");
      expect(text).not.toContain("Route not verified");
    },
  );

  it("Tokyo uses the verified corridor for destination details", async () => {
    render("/destinations/seiko-museum-ginza");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("10m");
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
    // Ferry is now estimable: budget no longer says transport-excluded.
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
    expect(text).toContain("On-site budget (transport excluded)");
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
    // Transport is now included because ferry is estimable.
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
    // Ferry is estimable: transport-excluded copy is gone.
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
    expect(text).toContain(
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

  it("Fukuoka → Ishigaki rendered UI shows Flight, Cost unavailable, transport-excluded title, and no full-trip label in English", async () => {
    storeState.homeStationCoords = { lat: 33.5902, lng: 130.4017 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    render("/destinations/ishigaki-city");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Flight");
    expect(text).toContain("Cost unavailable");
    expect(text).toContain("On-site budget (transport excluded)");
    expect(text).not.toContain("Couple Budget");
    expect(text).not.toContain("Solo Budget");
    expect(text).not.toContain("Group Budget");
  });

  it("Fukuoka → Ishigaki rendered UI shows transport-excluded title and 料金不明 in Japanese", async () => {
    storeState.homeStationCoords = { lat: 33.5902, lng: 130.4017 };
    storeState.homeStationTransportZoneId = "mainland-kyushu";
    localeState.locale = "ja";
    render("/destinations/ishigaki-city");
    await act(async () => {
      await flush(80);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("飛行機");
    expect(text).toContain("料金不明");
    expect(text).toContain("現地予算（往復交通費を除く）");
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
});
