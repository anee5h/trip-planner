import { describe, expect, it } from "vitest";
import type { TripStop } from "@/shared/types/trip";
import { groupItineraryStops } from "../ItineraryPlannerModel";

const stop = (id: string, name: string, date?: string): TripStop => ({
  id,
  name,
  type: "destination",
  destinationId: `${id}-destination`,
  date,
});

describe("groupItineraryStops", () => {
  it("returns no groups for an empty itinerary", () => {
    expect(groupItineraryStops([])).toEqual([]);
  });

  it("creates an unscheduled group for the first unscheduled stop", () => {
    expect(() =>
      groupItineraryStops([
        {
          id: "legacy-1",
          type: "custom",
          name: "Ginza",
        },
      ]),
    ).not.toThrow();

    const groups = groupItineraryStops([
      {
        id: "legacy-1",
        type: "custom",
        name: "Ginza",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("unscheduled");
    expect(groups[0].stops.map(({ stop: item }) => item.id)).toEqual([
      "legacy-1",
    ]);
  });

  it("groups consecutive unscheduled stops together", () => {
    const groups = groupItineraryStops([
      stop("a", "Ginza"),
      stop("b", "Shibuya City"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("unscheduled");
    expect(groups[0].stops.map(({ stop: item }) => item.name)).toEqual([
      "Ginza",
      "Shibuya City",
    ]);
  });

  it("keeps repeated unscheduled runs separate with unique keys", () => {
    const groups = groupItineraryStops([
      stop("a", "Ginza"),
      stop("b", "Shibuya City", "2026-08-08"),
      stop("c", "Ueno"),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "unscheduled",
      "2026-08-08",
      "unscheduled-1",
    ]);
  });

  it("keeps the existing first-dated-stop behavior", () => {
    const groups = groupItineraryStops([
      stop("a", "Ginza", "2026-08-08"),
      stop("b", "Shibuya City", "2026-08-08"),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["2026-08-08"]);
    expect(groups[0].stops.map(({ stop: item }) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("groups consecutive stop dates without changing itinerary order", () => {
    const groups = groupItineraryStops([
      stop("a", "Ginza", "2026-08-08"),
      stop("b", "Seiko Museum Ginza", "2026-08-08"),
      stop("c", "Ginza Itoya", "2026-08-09"),
      stop("d", "Shibuya City"),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "2026-08-08",
      "2026-08-09",
      "unscheduled",
    ]);
    expect(groups[0].stops.map(({ stop: item }) => item.name)).toEqual([
      "Ginza",
      "Seiko Museum Ginza",
    ]);
    expect(groups[1].stops[0].index).toBe(2);
  });

  it("does not merge non-consecutive dates", () => {
    const groups = groupItineraryStops([
      stop("a", "Ginza", "2026-08-08"),
      stop("b", "Shibuya City"),
      stop("c", "Ginza Itoya", "2026-08-08"),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "2026-08-08",
      "unscheduled",
      "2026-08-08-1",
    ]);
  });
});
