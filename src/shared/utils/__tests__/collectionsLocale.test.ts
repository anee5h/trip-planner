import { describe, expect, it } from "vitest";
import {
  getCollectionDestinationGroups,
  getCollectionProgress,
  getDestinationsForCollection,
  getCollectionContent,
  getUNESCOPropertyGroupDestinations,
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
    expect(collections).toHaveLength(24);

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

  it("gives every UNESCO group a valid property id with matching members", () => {
    const groups = getCollectionDestinationGroups("unesco-japan", "en");

    for (const group of groups) {
      expect(group.propertyId).toMatch(/^\d+$/);
      for (const member of group.destinations) {
        const source = member.collections?.find(
          (m) => m.collectionId === "unesco-japan",
        )?.source;
        expect(source).toContain(`/en/list/${group.propertyId}/`);
      }
    }
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

  it("keeps a property visited once even when several components are visited", () => {
    expect(
      getCollectionProgress(
        "unesco-japan",
        ["ginkaku-ji", "kinkaku-ji", "nijo-castle-kyoto"],
        "en",
      ),
    ).toEqual({ total: 27, visited: 1, percent: 4 });
  });

  it("counts a second property when a different property is visited", () => {
    expect(
      getCollectionProgress(
        "unesco-japan",
        ["ginkaku-ji", "himeji-castle"],
        "en",
      ),
    ).toEqual({ total: 27, visited: 2, percent: 7 });
  });

  it("builds one virtual group destination per property with stable navigation", () => {
    const groups = getUNESCOPropertyGroupDestinations("en");
    expect(groups).toHaveLength(27);

    const kyoto = groups.find(
      (group) => group.virtualGroup?.id === "unesco-property-688",
    );
    const himeji = groups.find(
      (group) => group.virtualGroup?.id === "unesco-property-661",
    );
    const nara = groups.find(
      (group) => group.virtualGroup?.id === "unesco-property-870",
    );
    const kii = groups.find(
      (group) => group.virtualGroup?.id === "unesco-property-1142",
    );

    // Representative member: no property-level record exists for Kyoto, so
    // the strongest member is used; Nara and Kii use their property-level records.
    expect(kyoto?.virtualGroup).toMatchObject({
      badgeKey: "ui.unescoBadge",
      placeCount: 8,
      href: "/collections/unesco-japan?property=688",
    });
    expect(kyoto?.virtualGroup?.memberIds.sort()).toEqual(
      [
        "nijo-castle-kyoto",
        "kinkaku-ji",
        "byodoin-temple",
        "enryaku-ji-mount-hiei",
        "ginkaku-ji",
        "uji-tea-culture-center",
        "ninna-ji",
        "ryoan-ji",
      ].sort(),
    );
    expect(himeji?.virtualGroup?.memberIds).toEqual(["himeji-castle"]);
    expect(kyoto?.id).toBe("unesco-property-688");

    expect(himeji?.virtualGroup).toMatchObject({
      placeCount: 1,
      href: "/destinations/himeji-castle",
    });
    expect(nara?.virtualGroup?.href).toBe(
      "/collections/unesco-japan?property=870",
    );
    expect(kii?.virtualGroup?.href).toBe(
      "/collections/unesco-japan?property=1142",
    );
  });

  it("picks the property-level record as the group's representative image", () => {
    const groups = getUNESCOPropertyGroupDestinations("en");

    const kyoto = groups.find((g) => g.id === "unesco-property-688");
    const nara = groups.find((g) => g.id === "unesco-property-870");
    const kii = groups.find((g) => g.id === "unesco-property-1142");
    const himeji = groups.find((g) => g.id === "unesco-property-661");

    expect(nara?.virtualGroup?.primaryMemberId).toBe("nara-historic");
    expect(kii?.virtualGroup?.primaryMemberId).toBe(
      "kumano-kodo-koya-wakayama",
    );
    expect(himeji?.virtualGroup?.primaryMemberId).toBe("himeji-castle");
    expect(kyoto?.virtualGroup?.primaryMemberId).toBe("nijo-castle-kyoto");
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
