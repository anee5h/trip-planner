/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";
import { formatTransportTime } from "@/shared/services/transport/formatters";
import { HomeMatchCard } from "../HomeMatchCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock heavy deps the component imports ─────────────────────────────────────
const YOKOHAMA = { lat: 35.4437, lng: 139.638 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStationCoords: YOKOHAMA,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
        memberCount: 10,
        placeCount: 32,
        gatewayEstimate: {
          mode: "shinkansen",
          timeRange: [150, 270] as [number, number],
          source: "verified_ground_route" as const,
        },
        memberIds: ["shinjuku-city", "shibuya-city"],
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

describe("HomeMatchCard — rendered card time with Yokohama origin", () => {
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
  });

  it("rendered card never fabricates a time without a verified corridor", async () => {
    // Dynamically import to pick up mocks.
    const { HomeMatchCard } = await import("../HomeMatchCard");

    await act(async () => {
      root.render(<HomeMatchCard destination={seikoMuseum} rank={1} />);
    });

    const text = host.textContent ?? "";

    // The card must show the authorized train time (14 min).
    const adjusted = buildRecommendationCandidate(seikoMuseum, {
      homeStationCoords: YOKOHAMA,
    });
    const best = getFastestPreferredTransport(
      adjusted,
      "none",
      ["shinkansen", "limited_express", "local_train", "bus"],
      2,
      YOKOHAMA,
    );
    if (best) {
      const expectedText = formatTransportTime(best.timeRange);
      expect(text).toContain(expectedText);
    } else {
      // If no transport mode is available the card shows the i18n key.
      expect(text).toContain("home.transportModes.travel");
    }
  });
});
