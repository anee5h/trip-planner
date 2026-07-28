import { describe, expect, it } from "vitest";
import { EDITORIAL_PILOT_IDS } from "@/shared/data/editorialPilot";
import { getCanonicalPlaces, getLocalizedPlace } from "../PlaceCatalog";

describe("PlaceCatalog", () => {
  it("creates canonical records for the complete catalog", () => {
    const places = getCanonicalPlaces();
    expect(places).toHaveLength(345);
    expect(places.every((place) => place.placeType)).toBe(true);
  });

  it("supplies reviewed bilingual content for every pilot hub", () => {
    const places = new Map(
      getCanonicalPlaces().map((place) => [place.id, place]),
    );
    for (const id of EDITORIAL_PILOT_IDS) {
      const place = places.get(id);
      expect(place?.editorial.lifecycle).toBe("published");
      expect(place?.content.ja?.description).toBeTruthy();
    }
  });

  it("falls back to English when Japanese content is unavailable", () => {
    const place = getCanonicalPlaces().find((item) => !item.content.ja);
    expect(place).toBeTruthy();
    expect(getLocalizedPlace(place!, "ja").name).toBe(place!.content.en.name);
  });
});
