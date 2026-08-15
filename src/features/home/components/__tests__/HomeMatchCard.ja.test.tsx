/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import i18n from "@/i18n";
import HomeMatchCard from "../HomeMatchCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja" }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStationCoords: null,
    homeStationTransportZoneId: undefined,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock("@/shared/services/place/PlaceCatalog", () => ({
  getLocalizedPlace: () => ({ name: "姫路城" }),
}));

vi.mock("@/shared/services/recommendation/RecommendationScorer", () => ({
  getValidModes: vi.fn(() => ["train"]),
}));

vi.mock("@/shared/services/recommendation/TripDurationService", () => ({
  getDayTripTravelDurationEvidence: vi.fn(() => ({ estimate: null })),
}));

vi.mock("@/shared/components/ui/BucketListButton", () => ({
  BucketListButton: () => null,
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: () => null,
}));

const destination = {
  id: "himeji-castle",
  name: "Himeji Castle",
  prefecture: "Hyogo",
  categories: ["castle"],
  heroImage: "",
  description: "",
  coordinates: { lat: 34.8394, lng: 134.6939 },
  transportOptions: {},
} as unknown as Destination;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  await i18n.changeLanguage("en");
});

describe("HomeMatchCard Japanese busy-period rendering", () => {
  async function renderCard(cardDestination: Destination, travelDate: string) {
    await i18n.changeLanguage("ja");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <I18nextProvider i18n={i18n}>
          <HomeMatchCard
            destination={cardDestination}
            rank={1}
            travelDate={travelDate}
          />
        </I18nextProvider>,
      );
    });

    return host;
  }

  it("does not render generic holiday or weekend card cues", async () => {
    const card = await renderCard(destination, "2026-05-03");

    expect(
      card.querySelector('[aria-label*="混雑する可能性があります"]'),
    ).toBeNull();
  });

  it("renders Japanese advisory, evidence, source, and date text for a peak season", async () => {
    const card = await renderCard(
      { ...destination, id: "shinjuku-gyo-en" },
      "2026-03-20",
    );

    const cue = card.querySelector<HTMLElement>(
      '[aria-label*="混雑する可能性があります"]',
    );
    expect(cue).not.toBeNull();
    expect(cue?.getAttribute("aria-label")).toContain("根拠");
    expect(cue?.getAttribute("aria-label")).toContain("情報源");
    expect(cue?.getAttribute("aria-label")).toContain("3月");
    expect(cue?.getAttribute("aria-label")).not.toMatch(
      /Source|Evidence|Cabinet Office/,
    );
  });
});
