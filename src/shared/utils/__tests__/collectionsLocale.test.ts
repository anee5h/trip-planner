import { describe, expect, it } from "vitest";
import {
  getCollectionDestinationGroups,
  getCollectionProgress,
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
      expect(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
          jaContent.name,
        ),
      ).toBe(true);
    }
  });
  it("groups UNESCO members into source-backed property groups", () => {
    const groups = getCollectionDestinationGroups("unesco-japan", "en");
    const memberCount = groups.reduce(
      (total, group) => total + group.destinations.length,
      0,
    );
    const kyoto = groups.find((group) => group.propertyId === "688");

    expect(groups).toHaveLength(27);
    expect(memberCount).toBe(44);
    expect(groups.every((group) => group.sourceUrl)).toBe(true);
    expect(kyoto?.name).toBe(
      "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)",
    );
    expect(kyoto?.destinations).toHaveLength(8);
  });

  it("counts a visited UNESCO component once for its property", () => {
    expect(getCollectionProgress("unesco-japan", ["ginkaku-ji"], "en")).toEqual(
      {
        total: 27,
        visited: 1,
        percent: 4,
      },
    );
  });

  it("localizes UNESCO property group labels", () => {
    const groups = getCollectionDestinationGroups("unesco-japan", "ja");
    const kyoto = groups.find((group) => group.propertyId === "688");

    expect(groups.length).toBeGreaterThan(0);
    expect(
      groups.every((group) =>
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
          group.name,
        ),
      ),
    ).toBe(true);
    expect(kyoto?.name).toBe("古都京都の文化財（京都市、宇治市、大津市）");
    expect(kyoto?.destinations).toHaveLength(8);
  });
});
