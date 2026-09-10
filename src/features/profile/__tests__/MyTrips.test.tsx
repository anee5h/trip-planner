/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { Trip } from "@/shared/types/trip";
import MyTrips from "../MyTrips";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  trips: [] as Trip[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "ui.addItinerary": "Add itinerary",
        "ui.editItinerary": "Edit itinerary",
        "ui.back": "Back",
        "ui.plannedTrips": "Planned",
        "ui.bucketList": "Bucket list",
        "ui.newItinerary": "New itinerary",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    favorites: [],
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
  useCatalogue: () => ({ places: [], error: null, retry: vi.fn() }),
}));

vi.mock("@/shared/components/ui/PageHeader", () => ({
  PageHeader: ({
    children,
    actions,
  }: {
    children: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div>
      <div>{children}</div>
      {actions}
    </div>
  ),
}));

vi.mock("@/features/destinations/components/DestinationCard", () => ({
  default: () => null,
}));

vi.mock("@/features/trips/components/TripCard", () => ({
  default: ({ trip, onSelect }: { trip: Trip; onSelect: () => void }) => (
    <button type="button" data-trip-card onClick={onSelect}>
      {trip.title}
    </button>
  ),
}));

vi.mock("@/features/trips/components/TripEditor", () => ({
  default: () => null,
}));

vi.mock("@/features/trips/components/TripDatesEditor", () => ({
  default: () => null,
}));

vi.mock("@/features/trips/TripDetails", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-trip-details>
      <button type="button" data-trip-back onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-location>{location.search}</output>;
}

let root: Root;
let host: HTMLDivElement;

function renderApp() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/my-trips?tripId=trip-1"]}>
        <MyTrips />
        <LocationProbe />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  state.trips = [
    {
      id: "trip-1",
      userId: "user-1",
      title: "Deep-linked trip",
      status: "planned",
      startDate: "2026-09-12",
      endDate: "2026-09-15",
      stops: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("MyTrips deep-link navigation", () => {
  it("clears tripId on Back and stays on the list after a later trips update", async () => {
    renderApp();
    expect(host.querySelector("[data-trip-details]")).not.toBeNull();

    act(() => {
      host.querySelector<HTMLButtonElement>("[data-trip-back]")!.click();
    });

    expect(host.querySelector("[data-trip-details]")).toBeNull();
    expect(host.querySelector("[data-location]")?.textContent).toBe("");

    state.trips = [...state.trips];
    renderApp();

    expect(host.querySelector("[data-trip-details]")).toBeNull();
    expect(host.querySelector("[data-trip-card]")).not.toBeNull();
  });
});
