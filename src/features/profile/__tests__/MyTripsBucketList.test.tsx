/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyTrips from "../MyTrips";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  favorites: ["saved-1"],
  trips: [],
}));

const cataloguePlaces = vi.hoisted(() => [
  {
    id: "saved-1",
    name: "Himeji Castle",
    nameJa: "姫路城",
    prefecture: "Hyogo",
    municipalityId: "Himeji",
    kind: "castle",
    categories: ["heritage"],
    aliases: ["Himeji"],
  },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `saved-${index + 2}`,
    name: `Saved destination ${index + 2}`,
    nameJa: `保存先${index + 2}`,
    prefecture: "Tokyo",
    municipalityId: "Tokyo",
    kind: "park",
    categories: ["nature"],
    aliases: [],
  })),
]);

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    favorites: state.favorites,
    trips: state.trips,
    addTrip: vi.fn(),
    updateTrip: vi.fn(),
    deleteTrip: vi.fn(),
    addStopToTrip: vi.fn(),
    removeStopFromTrip: vi.fn(),
    reorderTripStops: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/useCatalogue", () => ({
  useCatalogue: () => ({
    places: cataloguePlaces,
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock("@/features/destinations/components/DestinationCard", () => ({
  default: ({
    destination,
    variant,
  }: {
    destination: { id: string };
    variant?: string;
  }) => (
    <article
      data-testid="destination-card"
      data-destination-id={destination.id}
      data-card-variant={variant}
    />
  ),
}));

vi.mock("@/features/trips/components/TripCard", () => ({
  default: () => null,
}));
vi.mock("@/features/trips/components/TripEditor", () => ({
  default: () => null,
}));
vi.mock("@/features/trips/components/TripDatesEditor", () => ({
  default: () => null,
}));
vi.mock("@/features/trips/TripDetails", () => ({
  default: () => null,
}));
vi.mock("@/shared/components/ui/ModalDialog", () => ({
  default: () => null,
}));
vi.mock("@/shared/components/ui/PageHeader", () => ({
  PageHeader: ({ title, compact }: { title: string; compact?: boolean }) => (
    <header data-testid="page-header" data-compact={String(compact)}>
      <h1>{title}</h1>
    </header>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "navigation.itineraries": "Itineraries",
        "navigation.bucketList": "Bucket List",
        "ui.bucketList": "Bucket list",
        "ui.savedDestinations": "SAVED DESTINATIONS",
        "ui.emptyBucketListHint": "Save destinations for later.",
        "ui.bucketListSearchLabel": "Search saved destinations",
        "ui.bucketListSearchPlaceholder": "Search saved places",
        "ui.clearBucketListSearch": "Clear saved destination search",
        "ui.bucketListSearchNoResults":
          "No saved destinations match your search.",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  state.favorites = ["saved-1"];
  state.trips = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/bucket-list"]}>
        <MyTrips />
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Bucket List destination-card density", () => {
  it("adds local saved-place search for large lists and preserves saved ordering when cleared", () => {
    state.favorites = cataloguePlaces.map((place) => place.id);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/bucket-list"]}>
          <MyTrips />
        </MemoryRouter>,
      );
    });

    const input = host.querySelector(
      'input[aria-label="Search saved destinations"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.placeholder).toBe("Search saved places");
    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(10);

    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "himeji");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector('[data-destination-id="saved-1"]'),
    ).not.toBeNull();

    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "姫路");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(1);

    act(() => {
      host
        .querySelector('button[aria-label="Clear saved destination search"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(10);
  });

  it("uses the shared saved card variant and compact page header", () => {
    expect(host.querySelector('[data-card-variant="saved"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-testid="page-header"]')
        ?.getAttribute("data-compact"),
    ).toBe("true");
  });
});
