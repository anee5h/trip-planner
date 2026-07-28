import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { DestinationRelationshipService } from "../DestinationRelationshipService";

describe("DestinationRelationshipService", () => {
  it("shows contained places on a city hub page", () => {
    const yokohama = (destinationsIndex as Destination[]).find(
      (destination) => destination.id === "yokohama-city",
    );

    expect(yokohama).toBeTruthy();
    const places = DestinationRelationshipService.getNearbyDestinations(
      yokohama!,
    );

    expect(places).toHaveLength(4);
    expect(
      places.every(
        (place) => place.relationships?.parentDestinationId === "yokohama-city",
      ),
    ).toBe(true);
  });
});
