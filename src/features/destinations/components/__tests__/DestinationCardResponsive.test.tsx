/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinations from "@/shared/data/destinations-index.json";
import DestinationCard from "../DestinationCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ canMutateProfile: true, favorite: false }));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isVisited: () => false,
    isComparing: () => false,
    toggleCompare: vi.fn(),
    compareList: [],
    homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    canMutateProfile: state.canMutateProfile,
    isFavorite: () => state.favorite,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
}));

vi.mock("@/features/trips/components/ItineraryPickerModal", () => ({
  ItineraryPickerModal: () => null,
}));
vi.mock("../MarkVisitedModal", () => ({ MarkVisitedModal: () => null }));
vi.mock("../VisitedDateModal", () => ({ VisitedDateModal: () => null }));
vi.mock(
  "@/features/recommendations/components/RecommendationFeedbackControl",
  () => ({
    RecommendationFeedbackControl: () => (
      <div data-testid="feedback-control">feedback-control</div>
    ),
  }),
);
vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: {
    trackCompare: vi.fn(),
    trackClick: vi.fn(),
  },
}));

const destination = destinations.find(
  (candidate) => candidate.id === "hikone-castle-shiga",
) as Destination;

let root: Root;
let host: HTMLDivElement;

function render() {
  act(() =>
    root.render(
      <MemoryRouter>
        <DestinationCard destination={destination} />
      </MemoryRouter>,
    ),
  );
}

beforeEach(() => {
  state.canMutateProfile = true;
  state.favorite = false;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("DestinationCard responsive content", () => {
  it("keeps the score and core metadata while hiding duplicate mobile context", () => {
    render();

    expect(host.textContent).toContain(`⭐ ${destination.ratings.overall}`);
    expect(host.textContent).toContain("Low sun");
    expect(host.textContent).toContain("Explore");

    const mobileCost = Array.from(host.querySelectorAll("span")).find((node) =>
      node.textContent?.includes(" for 2"),
    );
    expect(mobileCost?.textContent).not.toContain("total");
    expect(host.textContent).not.toContain("total for 2");

    expect(host.textContent).not.toContain(
      `Couple ${destination.ratings.couple}/10`,
    );
    expect(host.querySelector('[data-testid="feedback-control"]')).toBeNull();
  });

  it("hides mobile labels without removing desktop items", () => {
    render();

    const collectionLinks = Array.from(
      host.querySelectorAll<HTMLAnchorElement>('a[href^="/collections/"]'),
    );
    expect(collectionLinks).toHaveLength(1);
    expect(collectionLinks[0].parentElement?.className).toContain("hidden");
    expect(collectionLinks[0].parentElement?.className).toContain("md:flex");

    const nationalTreasure = Array.from(host.querySelectorAll("span")).find(
      (node) => node.textContent === "National Treasure",
    );
    expect(nationalTreasure).toBeUndefined();

    const title = Array.from(host.querySelectorAll("h3")).find((node) =>
      node.textContent?.includes(destination.name),
    );
    expect(title?.className).toContain("line-clamp-2");
    expect(title?.className).toContain("min-h-10");
    expect(title?.getAttribute("title")).toBe(destination.name);

    const explore = Array.from(host.querySelectorAll("button")).find(
      (node) => node.textContent === "Explore",
    );
    expect(explore?.parentElement?.className).toContain("ml-auto");
    expect(explore?.className).toContain("min-h-11");
  });

  it("disables profile mutation controls without disabling navigation actions", () => {
    state.canMutateProfile = false;
    render();

    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Mark destination as visited"]',
      )?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Add to bucket list"]',
      )?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Add to Itinerary"]',
      )?.disabled,
    ).toBe(false);
    expect(host.querySelector('a[href*="hikone-castle-shiga"]')).not.toBeNull();
  });

  it("keeps the bucket-list bookmark on the image and other actions in the footer", () => {
    render();

    const bucketButton = host.querySelector(
      'button[aria-label="Add to bucket list"]',
    );
    expect(bucketButton?.querySelector(".lucide-bookmark")).not.toBeNull();
    expect(bucketButton?.parentElement?.className).toContain("absolute");
    expect(bucketButton?.className).toContain("items-center");
    expect(bucketButton?.className).toContain("justify-center");
    expect(bucketButton?.className).toContain("p-0");

    const visitedButtons = host.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Mark destination as visited"]',
    );
    expect(visitedButtons).toHaveLength(1);
    expect(visitedButtons[0].className).not.toContain("md:hidden");
    expect(visitedButtons[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("fills the bucket-list bookmark green when saved", () => {
    state.favorite = true;
    render();

    const bookmark = host.querySelector(
      'button[aria-label="Remove from bucket list"] .lucide-bookmark',
    );
    expect(bookmark?.getAttribute("class")).toContain("fill-current");
    expect(bookmark?.getAttribute("class")).toContain("text-emerald-500");
  });
});
