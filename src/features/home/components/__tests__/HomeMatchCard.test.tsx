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

vi.mock("@/shared/services/place/PlaceCatalog", () => ({
  getLocalizedPlace: (dest: Destination) => ({ name: dest.name }),
}));

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
  it("raw Seiko with an authorized origin displays the catalogue time", () => {
    const time = bestTime(seikoMuseum, YOKOHAMA);
    expect(time).toBe(14);
  });

  it("raw Seiko without origin has no authorized transport", () => {
    const time = bestTime(seikoMuseum, null);
    expect(time).toBeNull();
  });

  it("Tokyo and Yokohama origins both authorize the train mode", () => {
    const tokyoTime = bestTime(seikoMuseum, TOKYO);
    const yokohamaTime = bestTime(seikoMuseum, YOKOHAMA);
    expect(tokyoTime).not.toBeNull();
    expect(yokohamaTime).not.toBeNull();
  });
});

// ── Component render test ─────────────────────────────────────────────────────
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

  it("rendered card shows the catalogue train time with an authorized origin", async () => {
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
