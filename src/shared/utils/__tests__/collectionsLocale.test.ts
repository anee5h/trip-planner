import { describe, expect, it } from "vitest";
import {
  getDestinationsForCollection,
  getCollectionContent,
} from "../collections";
import { getCollections } from "@/shared/data/collections";
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

  it("provides authentic Japanese names and descriptions for all 25 collections", () => {
    const collections = getCollections();
    expect(collections).toHaveLength(25);

    for (const collection of collections) {
      const jaContent = getCollectionContent(collection, "ja");
      expect(jaContent.name).toBeTruthy();
      expect(jaContent.description).toBeTruthy();
      // Ensure Japanese name contains non-ASCII (Kanji/Katakana/Hiragana) characters
      expect(/[^\x00-\x7F]/.test(jaContent.name)).toBe(true);
    }
  });
});
