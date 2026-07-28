import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { DestinationRelationshipService } from "../DestinationRelationshipService";

describe("DestinationRelationshipService", () => {
  it("includes reviewed contained places in a city hub's featured list", () => {
    const yokohama = (destinationsIndex as Destination[]).find(
      (destination) => destination.id === "yokohama-city",
    );

    expect(yokohama).toBeTruthy();
    const places = DestinationRelationshipService.getFeaturedChildDestinations(
      yokohama!,
    );

    expect(places).toHaveLength(13);
    expect(
      places.every(
        (place) => place.relationships?.parentDestinationId === "yokohama-city",
      ),
    ).toBe(true);
    expect(places.map((place) => place.id)).toContain("yokohama-cosmo-world");
  });

  it("finds only nearby city hubs within the requested radius", () => {
    const yokohama = (destinationsIndex as Destination[]).find(
      (destination) => destination.id === "yokohama-city",
    );
    const hubs = DestinationRelationshipService.getNearbyHubs(yokohama!, 50);

    expect(hubs.length).toBeGreaterThan(0);
    expect(hubs.every((hub) => hub.role === "hub")).toBe(true);
    expect(hubs).not.toContainEqual(yokohama);
  });
});
