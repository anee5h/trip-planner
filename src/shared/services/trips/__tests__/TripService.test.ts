import { describe, it, expect } from "vitest";
import {
  validateTrip,
  addStopToTrip,
  removeStopFromTrip,
  reorderStops,
  duplicateTrip,
  buildSmartTripTitle,
} from "../TripService";
import type { Trip } from "@/shared/types/trip";

const mockTrip: Trip = {
  id: "trip-1",
  userId: "user-123",
  title: "Weekend Trip",
  startDate: "2026-10-01",
  endDate: "2026-10-03",
  status: "draft",
  stops: [
    {
      id: "stop-1",
      type: "destination",
      destinationId: "hakone",
      name: "Hakone Onsen",
    },
    { id: "stop-2", type: "custom", name: "Hakone Hotel" },
  ],
  createdAt: "2026-07-23T12:00:00Z",
  updatedAt: "2026-07-23T12:00:00Z",
};

describe("TripService Unit Tests", () => {
  it("validates trip titles and date bounds", () => {
    expect(validateTrip("")).toContain("Trip title is required.");
    expect(validateTrip("Trip", "2026-10-05", "2026-10-01")).toContain(
      "Start date cannot be after end date.",
    );
    expect(validateTrip("Trip", "2026-10-01", "2026-10-03")).toEqual([]);
  });

  it("appends new stop to trip itinerary list", () => {
    const next = addStopToTrip(mockTrip, {
      type: "custom",
      name: "Lake Ashi Cruising",
      notes: "Catch the sunset",
    });
    expect(next.stops.length).toBe(3);
    expect(next.stops[2].name).toBe("Lake Ashi Cruising");
    expect(next.stops[2].id).toBeDefined();
  });

  it("removes a stop from trip itinerary", () => {
    const next = removeStopFromTrip(mockTrip, "stop-1");
    expect(next.stops.length).toBe(1);
    expect(next.stops[0].id).toBe("stop-2");
  });

  it("shifts stop orders correctly", () => {
    const next = reorderStops(mockTrip, 0, 1);
    expect(next.stops[0].id).toBe("stop-2");
    expect(next.stops[1].id).toBe("stop-1");
  });

  it("covers four-stop reorder destinations in both directions", () => {
    const trip: Trip = {
      ...mockTrip,
      stops: [
        { id: "a", type: "custom", name: "A" },
        { id: "b", type: "custom", name: "B" },
        { id: "c", type: "custom", name: "C" },
        { id: "d", type: "custom", name: "D" },
      ],
    };

    expect(reorderStops(trip, 0, 1).stops.map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(reorderStops(trip, 1, 3).stops.map((item) => item.id)).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
    expect(reorderStops(trip, 3, 1).stops.map((item) => item.id)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(reorderStops(trip, 0, 3).stops.map((item) => item.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    expect(reorderStops(trip, 2, 0).stops.map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("does not move a stop across a date-group boundary", () => {
    const trip: Trip = {
      ...mockTrip,
      stops: [
        { id: "a", type: "custom", name: "A", date: "2026-08-08" },
        { id: "b", type: "custom", name: "B", date: "2026-08-08" },
        { id: "c", type: "custom", name: "C", date: "2026-08-09" },
      ],
    };

    expect(reorderStops(trip, 0, 2)).toBe(trip);
  });

  it("builds localized smart titles without replacing descriptive titles", () => {
    expect(
      buildSmartTripTitle({
        startDate: "2026-08-08",
        destinationName: "Kamakura",
        locale: "en",
      }),
    ).toBe("Trip to Kamakura — Aug 8, 2026");
    expect(
      buildSmartTripTitle({
        title: "Weekend in Hakone",
        startDate: "2026-09-19",
        endDate: "2026-09-20",
        locale: "ja",
      }),
    ).toBe("Weekend in Hakone");
    expect(
      buildSmartTripTitle({
        title: "0808",
        startDate: "2026-08-08",
        locale: "ja",
      }),
    ).toBe("旅行 · 2026年8月8日");
    expect(buildSmartTripTitle({ locale: "en" })).toBe("Untitled trip");
    expect(buildSmartTripTitle({ locale: "ja" })).toBe("名称未設定の旅");
  });

  it("duplicates trip items mapping new stop IDs", () => {
    const dup = duplicateTrip(mockTrip);
    expect(dup.title).toBe("Weekend Trip (Copy)");
    expect(dup.stops.length).toBe(2);
    expect(dup.stops[0].id).not.toBe("stop-1");
  });
});
