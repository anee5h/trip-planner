/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import DestinationDetails from "../DestinationDetails";
import destinationIndex from "@/shared/data/destinations-index.json";
import { WikipediaService } from "@/shared/services/wikipedia/WikipediaService";
import { getWikimediaResponsiveImage } from "@/shared/utils/wikimediaImages";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function flush(ms = 80): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const tripStoreState = vi.hoisted(() => ({
  homeStationCoords: { lat: 35.6812, lng: 139.7671 } as {
    lat: number;
    lng: number;
  } | null,
  homeStationTransportZoneId: undefined as string | undefined,
  savedHomeStation: "Tokyo",
  canMutateProfile: true,
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isVisited: () => false,
    getVisitCount: () => 0,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    canMutateProfile: tripStoreState.canMutateProfile,
    homeStation: "Tokyo Station",
    homeStationCoords: tripStoreState.homeStationCoords,
    homeStationTransportZoneId: tripStoreState.homeStationTransportZoneId,
    getDestinationRating: () => null,
    isComparing: () => false,
    toggleCompare: vi.fn(),
    compareList: [],
    visitedPrefectures: [],
    customRatings: {},
    savedHomeStation: tripStoreState.savedHomeStation,
    userPreferences: {
      budgetLevel: "medium",
      pacePreference: "moderate",
      activityPreferences: ["culture"],
      publicModes: ["train", "shinkansen", "bus"],
      carMode: "rental",
    },
  }),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "destination.wikipediaAttributionTooltip": `${opts?.source ?? "Wikipedia"}（${opts?.license ?? "CC BY-SA 4.0"}ライセンス）に基づく概要`,
        "destination.betaConfidenceDisclaimer":
          "この地域の移動目安時間は現在調整中です。実際の所要時間と若干異なる場合があります。",
        "destination.wikipediaLoading": "Wikipediaの概要を読み込み中…",
        "destination.wikipediaSummary": "Wikipedia概要",
        "destination.wikipediaUnavailable":
          "この目的地のWikipedia追加概要は見つかりませんでした。",
        "home.transportModes.train": "電車",
        "home.transportModes.shinkansen": "新幹線",
        "home.transportModes.bus": "バス",
        "home.transportModes.car": "レンタカー",
        "home.transportModes.my_car": "マイカー",
      };
      return jaMap[key] ?? opts?.defaultValue ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/hooks/useWeather", () => ({
  useWeather: () => ({ forecast: null, currentWeather: null, loading: false }),
  useWeekendWeather: () => ({ forecast: null, loading: false }),
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

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.restoreAllMocks();
});

describe("DestinationDetails Japanese Localization Regression", () => {
  it("renders localized beta confidence disclaimer when confidence is beta", async () => {
    const betaDest = Array.from(records.values()).find(
      (d: any) => d.travelEstimate?.confidence === "beta",
    ) ?? {
      ...records.get("kyoto-city")!,
      travelEstimate: { confidence: "beta" },
    };
    records.set("beta-test-dest", betaDest as any);

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/destinations/beta-test-dest"]}>
          <Routes>
            <Route path="/destinations/:id" element={<DestinationDetails />} />
          </Routes>
        </MemoryRouter>,
      );
      await flush(100);
    });

    const text = host.textContent ?? "";
    expect(text).toContain(
      "この地域の移動目安時間は現在調整中です。実際の所要時間と若干異なる場合があります。",
    );
    expect(text).not.toContain(
      "Travel estimates for this region are still being refined",
    );
  });

  it("renders localized Wikipedia summary trigger, summary container, and attribution tooltip in JA", async () => {
    vi.spyOn(WikipediaService, "fetchSummary").mockResolvedValue({
      extract: "京都は日本の古都です。",
      url: "https://ja.wikipedia.org/wiki/%E4%BA%AC%E9%83%BD",
      title: "京都",
      language: "ja",
      confidence: "high",
      matchMethod: "exact-title",
    });

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/destinations/kyoto-city"]}>
          <Routes>
            <Route path="/destinations/:id" element={<DestinationDetails />} />
          </Routes>
        </MemoryRouter>,
      );
      await flush(100);
    });

    // Initial trigger button is Japanese
    const toggleBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("続きを読む"),
    );
    expect(toggleBtn).not.toBeUndefined();

    // Click Wikipedia button
    await act(async () => {
      toggleBtn?.click();
      await flush(100);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Wikipedia概要");
    expect(text).not.toContain("Wikipedia Summary");

    // Attribution link has Japanese tooltip
    const wikiLink = host.querySelector(
      "a[title*='Wikipedia（CC BY-SA 4.0ライセンス）に基づく概要']",
    );
    expect(wikiLink).not.toBeNull();
  });

  it("renders the responsive Wikimedia hero contract in hydrated JA detail HTML", async () => {
    const heroImage = (records.get("kyoto-city") as any).heroImage as string;
    const attrs = getWikimediaResponsiveImage(heroImage);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/destinations/kyoto-city"]}>
          <Routes>
            <Route path="/destinations/:id" element={<DestinationDetails />} />
          </Routes>
        </MemoryRouter>,
      );
      await flush(100);
    });

    const image = host.querySelector("picture > img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe(attrs.src);
    expect(image?.getAttribute("srcset")).toBe(attrs.srcSet);
    expect(image?.getAttribute("sizes")).toBe(attrs.sizes);
    expect(image?.getAttribute("alt")).toBeTruthy();
    expect(host.querySelectorAll("picture > source")).toHaveLength(
      attrs.sources?.length ?? 0,
    );
  });
  it("renders the compact Japanese Wikipedia unavailable state", async () => {
    vi.spyOn(WikipediaService, "fetchSummary").mockResolvedValue(null);

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/destinations/kyoto-city"]}>
          <Routes>
            <Route path="/destinations/:id" element={<DestinationDetails />} />
          </Routes>
        </MemoryRouter>,
      );
      await flush(100);
    });

    const toggleBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("続きを読む"),
    );
    expect(toggleBtn).not.toBeUndefined();

    await act(async () => {
      toggleBtn?.click();
      await flush(100);
    });

    const text = host.textContent ?? "";
    expect(text).not.toContain("Wikipedia概要");
    expect(text).toContain("信頼できるWikipedia記事は見つかりませんでした。");
    expect(
      Array.from(host.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("続きを読む"),
      ),
    ).toBeUndefined();
    expect(
      host.querySelector(
        'button[data-testid="wikipedia-toggle"][aria-expanded="true"]',
      ),
    ).not.toBeNull();
  });
});
