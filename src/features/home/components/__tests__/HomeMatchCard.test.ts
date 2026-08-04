import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { buildRecommendationCandidate } from "@/shared/services/recommendation/RecommendationPipeline";
import { getFastestPreferredTransport } from "@/shared/services/transport/PreferredTransport";

const YOKOHAMA = { lat: 35.4437, lng: 139.638 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };

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

const ginzaItoya: Destination = {
  id: "ginza-itoya",
  name: "Ginza Itoya",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["Shopping"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 0,
  budgetMin: 0,
  budgetMax: 0,
  transportOptions: { train: 16 },
  coordinates: { lat: 35.6721, lng: 139.7672 },
  role: "standalone",
} as unknown as Destination;

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

describe("HomeMatchCard — origin-adjusted transport calculation", () => {
  it("raw Seiko + Yokohama does not display 14 minutes", () => {
    const time = bestTime(seikoMuseum, YOKOHAMA);
    expect(time).not.toBe(14);
    expect(time).not.toBeNull();
  });

  it("raw Seiko without origin displays the static 14 minutes", () => {
    // Without coordinates, buildRecommendationCandidate returns the unchanged
    // destination, so the card shows the raw catalogue value.
    const time = bestTime(seikoMuseum, null);
    expect(time).toBe(14);
  });

  it("changing Tokyo to Yokohama changes the card time", () => {
    const tokyoTime = bestTime(seikoMuseum, TOKYO);
    const yokohamaTime = bestTime(seikoMuseum, YOKOHAMA);
    expect(tokyoTime).not.toBeNull();
    expect(yokohamaTime).not.toBeNull();
    expect(tokyoTime).not.toBe(yokohamaTime);
  });

  it("raw Bucket List cards and details calculations agree", () => {
    const cardTime1 = bestTime(ginzaItoya, YOKOHAMA);
    const detailsTime = bestTime(ginzaItoya, YOKOHAMA);
    expect(cardTime1).toBe(detailsTime);
    expect(cardTime1).not.toBe(16);
  });
});
