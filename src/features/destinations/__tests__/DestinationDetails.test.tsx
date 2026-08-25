/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DestinationDetails from "../DestinationDetails";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function flush(ms = 80): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ja" }));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: localeState.locale,
    setLocale: (l: "en" | "ja") => {
      localeState.locale = l;
    },
  }),
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

describe("DestinationDetails Japanese availability parity (KAI-93)", () => {
  beforeEach(() => {
    storeState.homeStationCoords = { lat: 35.6812, lng: 139.7671 };
    storeState.homeStationTransportZoneId = "mainland-honshu";
    localeState.locale = "ja";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders legacy destinations without exposing English editorial prose in Japanese", async () => {
    render("/destinations/abashiri-city");
    await act(async () => {
      await flush(80);
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("この場所はまだ日本語で利用できません");
    expect(text).not.toContain("Destination Not Found");

    // The audited Japanese name is available; unavailable Japanese prose is
    // omitted rather than silently falling back to the English description.
    expect(text).toContain("網走市");
    expect(text).not.toContain("Okhotsk coastal city famous for winter");
  });

  it("renders detail page for destinations with partial Japanese content (e.g. abukuma-cave-fukushima)", async () => {
    render("/destinations/abukuma-cave-fukushima");
    await act(async () => {
      await flush(80);
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("この場所はまだ日本語で利用できません");
    expect(text).not.toContain("Destination Not Found");

    // Shows Japanese name (nameJa) and falls back for English description
    expect(text).toContain("あぶくま洞");
  });

  it("renders detail page for bilingual reviewed destinations (e.g. asakusa-taito)", async () => {
    render("/destinations/asakusa-taito");
    await act(async () => {
      await flush(80);
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("この場所はまだ日本語で利用できません");
    expect(text).not.toContain("Destination Not Found");
    expect(text).toContain("浅草");
  });

  it("renders not found state for genuinely non-existent destinations in Japanese and English", async () => {
    // Japanese locale
    render("/destinations/non-existent-destination-id");
    await act(async () => {
      await flush(80);
    });

    let text = host.textContent ?? "";
    expect(text).toContain("目的地が見つかりません");
    expect(text).toContain("目的地一覧へ戻る");

    // English locale
    localeState.locale = "en";
    render("/destinations/non-existent-destination-id");
    await act(async () => {
      await flush(80);
    });

    text = host.textContent ?? "";
    expect(text).toContain("Destination Not Found");
    expect(text).toContain("Back to Destinations");
  });
});
