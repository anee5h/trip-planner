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

const wikipediaMock = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
}));

const validWikipediaSummary = {
  extract:
    "A trustworthy destination article with enough detail for the summary card.",
  url: "https://en.wikipedia.org/wiki/Example_Destination",
  title: "Example Destination",
  language: "en" as const,
  confidence: "high" as const,
  matchMethod: "exact-title" as const,
};

vi.mock("@/shared/services/wikipedia/WikipediaService", () => ({
  WikipediaService: wikipediaMock,
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
import relationshipIndex from "@/shared/data/destination-relationships.json";
import {
  DestinationRelationshipService,
  resetRelationshipIndexForTests,
} from "@/shared/services/destination/DestinationRelationshipService";
const records = new Map(
  (destinationIndex as { id: string }[]).map((d) => [d.id, d]),
);

const relationshipLoadState = vi.hoisted(() => ({ shouldFail: false }));

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/data/destination-relationships.json")) {
      return {
        ok: !relationshipLoadState.shouldFail,
        status: relationshipLoadState.shouldFail ? 500 : 200,
        json: async () => relationshipIndex,
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
    relationshipLoadState.shouldFail = false;
    resetRelationshipIndexForTests();
    wikipediaMock.fetchSummary.mockReset();
    wikipediaMock.fetchSummary.mockResolvedValue(null);
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

  it("shows a safe unavailable state when no trusted Wikipedia article exists", async () => {
    render("/destinations/abashiri-city");
    await act(async () => {
      await flush(120);
    });

    const readMore = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("続きを読む"),
    );
    expect(readMore).toBeTruthy();
    await act(async () => {
      readMore?.click();
      await flush(40);
    });

    expect(host.textContent).toContain(
      "信頼できるWikipedia記事は見つかりませんでした。",
    );
    const unavailable = host.querySelector('[role="status"]');
    expect(unavailable).not.toBeNull();
    expect(unavailable?.className).toContain("border-l-2");
    expect(unavailable?.className).not.toContain("p-4");
    expect(
      host.querySelector(
        'button[data-testid="wikipedia-toggle"][aria-expanded="true"]',
      ),
    ).not.toBeNull();
  });

  it("keeps intentional Wikipedia spacing for a POI in collapsed and expanded states", async () => {
    localeState.locale = "en";
    wikipediaMock.fetchSummary.mockResolvedValue(validWikipediaSummary);
    render("/destinations/yokohama-landmark-tower-sky-garden");
    await act(async () => {
      await flush(120);
    });

    let toggle = host.querySelector<HTMLButtonElement>(
      'button[data-testid="wikipedia-toggle"]',
    );
    expect(toggle?.textContent).toContain("Read more");
    expect(toggle?.parentElement?.className).toContain("mt-5");

    await act(async () => {
      toggle?.click();
      await flush(40);
    });
    toggle = host.querySelector('button[data-testid="wikipedia-toggle"]');
    expect(toggle?.textContent).toContain("Show less");
    expect(toggle?.parentElement?.className).toContain("mt-5");
  });

  it("keeps intentional Wikipedia spacing for a hub in collapsed and expanded states", async () => {
    localeState.locale = "en";
    wikipediaMock.fetchSummary.mockResolvedValue(validWikipediaSummary);
    render("/destinations/otsu-city");
    await act(async () => {
      await flush(220);
    });

    let toggle = host.querySelector<HTMLButtonElement>(
      'button[data-testid="wikipedia-toggle"]',
    );
    expect(toggle?.textContent).toContain("Read more");
    expect(toggle?.parentElement?.className).toContain("mt-5");

    await act(async () => {
      toggle?.click();
      await flush(40);
    });
    toggle = host.querySelector('button[data-testid="wikipedia-toggle"]');
    expect(toggle?.textContent).toContain("Show less");
    expect(toggle?.parentElement?.className).toContain("mt-5");
  });

  it("does not repeat header location in the POI at-a-glance facts", async () => {
    localeState.locale = "en";
    render("/destinations/yokohama-landmark-tower-sky-garden");
    await act(async () => {
      await flush(120);
    });

    expect(host.textContent).toContain("Located In:");
    const atAGlance = host.querySelector(
      '[data-testid="destination-at-a-glance"]',
    );
    expect(atAGlance?.textContent).not.toContain("Located in");
    expect(atAGlance?.textContent).not.toContain("Yokohama City");
  });

  it("keeps a retry action for transient Wikipedia failures", async () => {
    localeState.locale = "en";
    wikipediaMock.fetchSummary.mockRejectedValueOnce(new Error("temporary"));
    render("/destinations/abashiri-city");
    await act(async () => {
      await flush(120);
    });

    const readMore = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Read more"),
    );
    expect(readMore).toBeTruthy();
    await act(async () => {
      readMore?.click();
      await flush(40);
    });

    expect(host.textContent).toContain(
      "Wikipedia could not be loaded. Please retry.",
    );
    expect(
      Array.from(host.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Retry"),
      ),
    ).toBe(true);
  });

  it("shows relationship load failure with a retry action", async () => {
    localeState.locale = "en";
    relationshipLoadState.shouldFail = true;
    resetRelationshipIndexForTests();
    DestinationRelationshipService.clearIndex();
    render("/destinations/otsu-city");
    await act(async () => {
      await flush(160);
    });

    expect(host.textContent).toContain(
      "Related destination information could not be loaded.",
    );
    const retry = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Retry"),
    );
    expect(retry).toBeTruthy();

    relationshipLoadState.shouldFail = false;
    await act(async () => {
      retry?.click();
      await flush(220);
    });
    expect(host.textContent).toContain("Explore by area");
  });

  it("renders Otsu's existing child and area relationship sections after planning", async () => {
    render("/destinations/otsu-city");
    await act(async () => {
      await flush(220);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("大津市の見どころ");
    expect(text).toContain("エリアから探す");
    expect(text).toContain("延暦寺");
    expect(text).toContain("【見どころ】大津市");
    expect(text).not.toContain("【見どころ】Otsu City");

    const sections = Array.from(host.querySelectorAll("[data-section]")).map(
      (section) => section.getAttribute("data-section"),
    );
    expect(sections.indexOf("overview")).toBeGreaterThanOrEqual(0);
    expect(sections.indexOf("plan-your-visit")).toBeGreaterThan(
      sections.indexOf("overview"),
    );
    expect(sections.indexOf("top-sights")).toBeGreaterThan(
      sections.indexOf("plan-your-visit"),
    );
    expect(sections.indexOf("before-you-go")).toBeGreaterThan(
      sections.indexOf("top-sights"),
    );
    expect(text).toContain("この街を計画");
  });

  it("falls back to Otsu's canonical English discovery and planning headings", async () => {
    localeState.locale = "en";
    render("/destinations/otsu-city");
    await act(async () => {
      await flush(220);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Top sights in Otsu City");
    expect(text).toContain("Top sights");
    expect(text).toContain("Explore by area");
    expect(text).toContain("Explore Otsu City");
    expect(text).toContain("Plan your visit");
    expect(text).not.toContain("大津市の見どころ");
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
