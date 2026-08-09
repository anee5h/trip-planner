/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import {
  formatApproximateTransportTime,
  formatTransportTime,
} from "@/shared/services/transport/formatters";
import { getSafeDisplayEstimate } from "../../services/LocalDiscoveryDisplayEstimator";
import { HomeMatchCard } from "../HomeMatchCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock heavy deps the component imports ─────────────────────────────────────
const YOKOHAMA = { lat: 35.4437, lng: 139.638 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };
const NAKAYAMA = { lat: 35.514745, lng: 139.539692 };
const SHIN_YOKOHAMA = { lat: 35.5073, lng: 139.6172 };
const CHIBA = { lat: 35.6131, lng: 140.1133 };

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

let mockHomeStationCoords: { lat: number; lng: number } | null = YOKOHAMA;

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStationCoords: mockHomeStationCoords,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === "home.places" && options?.count !== undefined) {
        return `${options.count} ${options.count === 1 ? "place" : "places"}`;
      }
      return key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/shared/services/place/PlaceCatalog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/shared/services/place/PlaceCatalog")
    >();
  return {
    ...actual,
    // Keep origin resolution real (catalogue hubs); only localization is stubbed.
    getLocalizedPlace: (dest: Destination) => ({ name: dest.name }),
  };
});

vi.mock("@/shared/components/ui/BucketListButton", () => ({
  BucketListButton: () => null,
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: () => null,
}));

// ── Test data ─────────────────────────────────────────────────────────────────
const seikoMuseum: Destination = {
  id: "seiko-museum-ginza",
  name: "Seiko Museum Ginza",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["Museum"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { train: 14 },
  municipalityId: "Tokyo:chuo",
  coordinates: { lat: 35.6712, lng: 139.7645 },
  role: "standalone",
} as unknown as Destination;

// ── Service-level tests (fast, no DOM) ────────────────────────────────────────
function bestTime(
  destination: Destination,
  homeCoords: { lat: number; lng: number } | null,
): number | null {
  const adjusted = buildRecommendationCandidate(destination, {
    homeStationCoords: homeCoords,
  });
  const best = getFastestPreferredTransport(
    adjusted,
    "none",
    ["train"],
    2,
    homeCoords ?? undefined,
  );
  return best?.timeRange[0] ?? null;
}

describe("HomeMatchCard — origin-adjusted transport calculation (service level)", () => {
  it("Seiko from Tokyo resolves via the verified metro corridor", () => {
    // Tokyo:chiyoda → Tokyo:chuo train corridor [5, 15].
    const time = bestTime(seikoMuseum, TOKYO);
    expect(time).toBe(5);
  });

  it("raw Seiko without origin has no authorized transport", () => {
    const time = bestTime(seikoMuseum, null);
    expect(time).toBeNull();
  });

  it("Yokohama origin uses the bidirectional kanagawa corridor", () => {
    // tokyo ↔ kanagawa train corridor [50, 90].
    const yokohamaTime = bestTime(seikoMuseum, YOKOHAMA);
    expect(yokohamaTime).toBe(50);
  });
});

// ── Component render test ─────────────────────────────────────────────────────
describe("HomeMatchCard — Tokyo 23 Wards group card", () => {
  it("renders the group title, ward/place counts, and the filtered link", async () => {
    const groupDestination = {
      ...seikoMuseum,
      id: "tokyo-23-wards",
      name: "Tokyo 23 Wards",
      wardGroup: {
        memberCount: 2,
        wardCount: 2,
        placeCount: 32,
        gatewayEstimate: {
          mode: "shinkansen",
          timeRange: [150, 270] as [number, number],
          source: "verified_ground_route" as const,
          evidence: "verified" as const,
        },
        memberIds: ["shinjuku-city", "shibuya-city"],
        wardHubIds: ["shinjuku-city", "shibuya-city"],
        tripMode: "weekend_2d1n" as const,
      },
    };

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <HomeMatchCard
          destination={groupDestination as unknown as Destination}
          rank={1}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("destination.tokyoWardsGroup");
    expect(text).toContain("destination.tokyoWardsCount");
    const link = host.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "/destinations?city=shinjuku-city&city=shibuya-city&tripMode=weekend_2d1n",
    );
    act(() => root.unmount());
    host.remove();
  });
});

const yokohamaPOI: Destination = {
  id: "minato-mirai-yokohama",
  name: "Minato Mirai 21",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:yokohama",
  region: "Kanto",
  categories: ["Sightseeing"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { train: 25 },
  coordinates: { lat: 35.4578, lng: 139.6322 },
  role: "poi",
} as unknown as Destination;

const kamakuraPOI: Destination = {
  id: "kotoku-in",
  name: "Kotoku-in Great Buddha",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:kamakura",
  region: "Kanto",
  categories: ["Culture"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { train: 25 },
  coordinates: { lat: 35.3167, lng: 139.5361 },
  role: "poi",
} as unknown as Destination;

const ogasawaraPOI: Destination = {
  id: "ogasawara-islands",
  name: "Ogasawara Islands",
  prefecture: "Tokyo",
  municipalityId: "Tokyo:ogasawara",
  region: "Kanto",
  categories: ["Nature"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { ferry: 1440 },
  coordinates: { lat: 27.095, lng: 142.192 },
  role: "poi",
} as unknown as Destination;

const sakurajimaPOI: Destination = {
  id: "sakurajima",
  name: "Sakurajima",
  prefecture: "Kagoshima",
  municipalityId: "Kagoshima:kagoshima",
  region: "Kyushu",
  categories: ["Nature"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { car: 30, ferry: 15 },
  localAccessUnestimated: true,
  localAccessModes: ["car", "my_car", "bus"],
  coordinates: { lat: 31.5833, lng: 130.65 },
  role: "poi",
} as unknown as Destination;

const busOnlyYokohamaPOI: Destination = {
  id: "sankei-en",
  name: "Sankeien Garden",
  prefecture: "Kanagawa",
  municipalityId: "Kanagawa:yokohama",
  region: "Kanto",
  categories: ["Park"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { bus: 35 },
  localAccessModes: ["bus", "car"],
  coordinates: { lat: 35.4167, lng: 139.6639 },
  role: "poi",
} as unknown as Destination;

describe("HomeMatchCard — canonical travel-time truth", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    mockHomeStationCoords = YOKOHAMA;
  });

  it("renders verified cross-prefecture time when authorized corridor exists", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");

    await act(async () => {
      root.render(<HomeMatchCard destination={seikoMuseum} rank={1} />);
    });

    const text = host.textContent ?? "";
    const adjusted = buildRecommendationCandidate(seikoMuseum, {
      homeStationCoords: YOKOHAMA,
    });
    const best = getFastestPreferredTransport(
      adjusted,
      "none",
      ["train", "shinkansen", "bus"],
      2,
      YOKOHAMA,
    );
    expect(best).not.toBeNull();
    expect(text).toContain(formatTransportTime(best!.timeRange));
  });

  it.each([
    ["Nakayama", NAKAYAMA],
    ["Shin-Yokohama", SHIN_YOKOHAMA],
    ["Chiba", CHIBA],
  ])(
    "shows a bounded approximate travel time for %s when canonical travel is unknown",
    async (_originName, originCoords) => {
      const { HomeMatchCard } = await import("../HomeMatchCard");
      mockHomeStationCoords = originCoords;

      await act(async () => {
        root.render(<HomeMatchCard destination={yokohamaPOI} rank={1} />);
      });

      const text = host.textContent ?? "";
      expect(text).not.toMatch(/Est\.\s*\d+/);
      const estimate = getSafeDisplayEstimate(yokohamaPOI, {
        homeStationCoords: originCoords,
        publicModes: ["train"],
      });
      expect(estimate).not.toBeNull();
      expect(text).toContain(
        formatApproximateTransportTime(estimate!.timeRange),
      );
    },
  );

  it("shows a bounded coordinate-derived estimate for an authorized local route", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");

    await act(async () => {
      root.render(<HomeMatchCard destination={yokohamaPOI} rank={1} />);
    });

    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Est\.\s*\d+/);
    expect(text).toContain("~");
  });

  it("shows a bounded coordinate-derived estimate for an authorized mainland route", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");

    await act(async () => {
      root.render(<HomeMatchCard destination={kamakuraPOI} rank={1} />);
    });

    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Est\.\s*\d+/);
    expect(text).toContain("~");
  });

  it("allows an explicitly local discovery surface to show an approximate estimate", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");
    const localEstimate = getSafeDisplayEstimate(kamakuraPOI, {
      homeStationCoords: YOKOHAMA,
      publicModes: ["train"],
    });
    expect(localEstimate).not.toBeNull();

    await act(async () => {
      root.render(
        <HomeMatchCard
          destination={kamakuraPOI}
          rank={1}
          publicModes={["train"]}
          allowApproximateLocalDisplay
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain(
      formatApproximateTransportTime(localEstimate!.timeRange),
    );
    expect(text).toContain("~");
  });

  it("negative: does NOT fabricate local display estimate for cross-water island (Yokohama -> Ogasawara)", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");

    await act(async () => {
      root.render(
        <HomeMatchCard
          destination={ogasawaraPOI}
          rank={1}
          publicModes={["train"]}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Est\.\s*\d+/);
    expect(text).toContain("home.transportModes.travelUnavailable");
  });

  it("negative: does NOT fabricate local display estimate for localAccessUnestimated destination (Kagoshima -> Sakurajima with car)", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");

    mockHomeStationCoords = { lat: 31.5966, lng: 130.5571 }; // Kagoshima City

    await act(async () => {
      root.render(
        <HomeMatchCard
          destination={sakurajimaPOI}
          rank={1}
          carMode="my_car"
          publicModes={["train"]}
        />,
      );
    });

    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Est\.\s*\d+/);
    expect(text).toContain("home.transportModes.travelUnavailable");
  });

  it("shows an approximate bus duration when topology authorizes local bus access", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");

    await act(async () => {
      root.render(<HomeMatchCard destination={busOnlyYokohamaPOI} rank={1} />);
    });

    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Est\.\s*\d+/);
    expect(text).toContain("~");
  });

  it("recommendation leakage proof: canonical OriginAwareTransportService remains null for same-municipality without verified route", async () => {
    const { getOriginAwareTransportEstimate } =
      await import("@/shared/services/transport/OriginAwareTransportService");

    const canonicalEstimate = getOriginAwareTransportEstimate(
      yokohamaPOI,
      { homeStationCoords: YOKOHAMA },
      ["train"],
    );

    expect(canonicalEstimate).toBeNull();
  });

  it("shows the canonical strongest day-trip reason and existing estimated cost", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");
    const scored = {
      ...seikoMuseum,
      match: {
        confidence: 88,
        reasons: [
          {
            type: "Budget",
            code: "budgetWithin",
            title: "Within Budget",
            params: { cost: "¥8k–12k" },
          },
          {
            type: "Interest",
            code: "interestNature",
            title: "Nature Escape",
          },
        ],
      },
      estimatedCostRange: [8000, 12000],
    } as unknown as Destination;

    await act(async () => {
      root.render(<HomeMatchCard destination={scored} rank={1} />);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Nature Escape");
    expect(text).not.toContain("Within Budget");
    expect(text).toContain("¥8k–12k");
  });

  it("keeps weekend area capacity and transport-excluded warning visible", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");
    const scoredWeekend = {
      ...seikoMuseum,
      match: {
        confidence: 82,
        reasons: [
          {
            type: "Weekend",
            code: "weekendTravelAcceptable",
            title: "Manageable Journey",
          },
          {
            type: "Weekend",
            code: "weekendTripReady",
            title: "2-Day Trip Ready",
          },
          {
            type: "Transport",
            code: "weekendTransportExcluded",
            title: "Transport Excluded",
            description:
              "Transport cost unavailable; total excludes origin transport",
          },
        ],
      },
      weekend: {
        travelFit: {
          oneWayMinutes: 150,
        },
        capacity: { activityMinutes: 720 },
        weatherDays: [],
        estimatedCostTransportIncluded: false,
        placeCount: 4,
      },
      estimatedCostRange: [12000, 18000],
    } as unknown as Destination;

    await act(async () => {
      root.render(<HomeMatchCard destination={scoredWeekend} rank={1} />);
    });

    const text = host.textContent ?? "";
    expect(text).toContain("destination.tripAreas.plentyForTwoDays");
    expect(text).toContain("4 places");
    expect(text).toContain("Transport Excluded");
    expect(text).not.toContain(
      "recommendation.reasons.weekendTravelAcceptable.title",
    );
    expect(text).not.toContain("destination.tripAreas.travelBy");
    expect(text).toContain("¥12k–18k");
  });

  it("uses singular English copy for one weekend place", async () => {
    const { HomeMatchCard } = await import("../HomeMatchCard");
    const scoredWeekend = {
      ...seikoMuseum,
      weekend: {
        travelFit: { oneWayMinutes: 150 },
        capacity: { activityMinutes: 720 },
        weatherDays: [],
        estimatedCostTransportIncluded: true,
        placeCount: 1,
      },
    } as unknown as Destination;

    await act(async () => {
      root.render(<HomeMatchCard destination={scoredWeekend} rank={1} />);
    });

    expect(host.textContent).toContain("1 place");
    expect(host.textContent).not.toContain("1 places");
  });
});
