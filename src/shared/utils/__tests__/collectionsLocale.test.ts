import { describe, expect, it } from "vitest";
import { getDestinationsForCollection } from "../collections";
import { isPlaceAvailableInLocale } from "@/shared/services/place/PlaceCatalog";

describe("localized collection membership", () => {
  it("does not return English-only places for Japanese collections", () => {
    const collectionIds = [
      "japan-observatories-towers",
      "core-cities-japan",
      "art-islands-japan",
    ];
    for (const collectionId of collectionIds) {
      expect(
        getDestinationsForCollection(collectionId, "ja").every((place) =>
          isPlaceAvailableInLocale(place, "ja"),
        ),
      ).toBe(true);
    }
  });
});
