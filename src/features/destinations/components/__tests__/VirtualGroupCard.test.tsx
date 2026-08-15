/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCollectionProgress,
  getUNESCOPropertyGroupDestinations,
} from "@/shared/utils/collections";
import DestinationCard from "../DestinationCard";

const testGlobals = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  visited: [] as string[],
  homeStationCoords: { lat: 35.6812, lng: 139.7671 },
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isVisited: (id: string) => state.visited.includes(id),
    isComparing: () => false,
    toggleCompare: vi.fn(),
    compareList: [],
    homeStationCoords: state.homeStationCoords,
    canMutateProfile: true,
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
vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: {
    trackCompare: vi.fn(),
    trackClick: vi.fn(),
  },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function render(destinationId: string) {
  const group = getUNESCOPropertyGroupDestinations("en").find(
    (candidate) => candidate.id === destinationId,
  );
  if (!group) throw new Error(`no virtual group ${destinationId}`);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <DestinationCard destination={group} />
      </MemoryRouter>,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  state.visited = [];
});

describe("virtual group visited semantics", () => {
  it("marks the Kyoto group unvisited when no member is visited", () => {
    state.visited = [];
    const host = render("unesco-property-688");

    expect(host.textContent).not.toContain("Already Visited");
  });

  it("marks the Kyoto group visited when one member is visited", () => {
    state.visited = ["ginkaku-ji"];
    const host = render("unesco-property-688");

    expect(host.textContent).toContain("Already Visited");
  });

  it("keeps the Kyoto group visited when more members are visited", () => {
    state.visited = ["ginkaku-ji", "kinkaku-ji", "nijo-castle-kyoto"];
    const host = render("unesco-property-688");

    expect(host.textContent).toContain("Already Visited");
  });

  it("marks the single-place Himeji group visited via its member", () => {
    state.visited = ["himeji-castle"];
    const host = render("unesco-property-661");

    expect(host.textContent).toContain("Already Visited");
  });

  it("agrees with collection progress (two properties visited)", () => {
    state.visited = ["ginkaku-ji", "himeji-castle"];

    expect(getCollectionProgress("unesco-japan", state.visited, "en")).toEqual({
      total: 27,
      visited: 2,
      percent: 7,
    });
  });
});

describe("virtual group inherited-metadata suppression", () => {
  it("does not present representative score or travel as group facts", () => {
    const host = render("unesco-property-688");

    expect(host.querySelector('[data-testid="meguruto-score"]')).toBeNull();
    expect(
      host.querySelector('[data-testid="destination-card-travel-time"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="destination-card-visit-duration"]'),
    ).toBeNull();
    expect(host.textContent).not.toContain("for 2");
    expect(host.querySelector(".lucide-map-pin")).toBeNull();
  });

  it("offers no itinerary, compare, or bucket-list actions on the group", () => {
    const host = render("unesco-property-688");

    expect(
      host.querySelector('button[aria-label="Add to Itinerary"]'),
    ).toBeNull();
    expect(
      host.querySelector('button[aria-label="Add to Compare"]'),
    ).toBeNull();
    expect(
      host.querySelector('button[aria-label="Mark destination as visited"]'),
    ).toBeNull();
  });

  it("links the multi-place group to its property listing", () => {
    const host = render("unesco-property-688");

    const explore = host.querySelector<HTMLAnchorElement>(
      'a[href="/collections/unesco-japan?property=688"]',
    );
    expect(explore).not.toBeNull();
    expect(host.textContent).toContain("ui.unescoBadge");
    expect(host.textContent).toContain("ui.places");
  });

  it("keeps normal destination facts for a single-place group", () => {
    const host = render("unesco-property-661");

    // himeji-castle carries no ratingMetadata: its raw score must not render
    // as authoritative (REC-002), but non-rating facts remain.
    const score = host.querySelector('[data-testid="meguruto-score"]');
    expect(score).toBeNull();
    expect(
      host.querySelector('[data-testid="destination-card-travel-time"]'),
    ).not.toBeNull();
    expect(
      host.querySelector<HTMLAnchorElement>(
        'a[href="/destinations/himeji-castle"]',
      ),
    ).not.toBeNull();
  });
});
