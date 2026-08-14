import { describe, expect, it } from "vitest";
import {
  EDITORIAL_PILOT_IDS,
  PHASE_ONE_COHORT_IDS,
  YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS,
} from "@/shared/data/editorialPilot";
import {
  getAvailablePlaces,
  getCanonicalPlaces,
  getLocalizedPlace,
  isPlaceAvailableInLocale,
} from "../PlaceCatalog";

describe("PlaceCatalog", () => {
  it("creates canonical records for the complete catalog", () => {
    const places = getCanonicalPlaces();
    expect(places).toHaveLength(978);
    expect(places.every((place) => place.placeType)).toBe(true);
    expect(places.every((place) => Array.isArray(place.tags))).toBe(true);
  });

  it("keeps official website links destination-only", () => {
    const places = getCanonicalPlaces();
    expect(places.filter((place) => place.placeType === "hub")).toHaveLength(
      163,
    );
    expect(
      places.filter((place) => place.placeType === "destination"),
    ).toHaveLength(815);
    expect(
      places
        .filter(
          (place) => place.placeType === "hub" && place.kind !== "district",
        )
        .every((place) => !place.officialWebsite),
    ).toBe(true);
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

  it("keeps every Phase 1 cohort hub published and bilingual", () => {
    const places = new Map(
      getCanonicalPlaces().map((place) => [place.id, place]),
    );
    expect(PHASE_ONE_COHORT_IDS).toHaveLength(50);
    for (const id of PHASE_ONE_COHORT_IDS) {
      const place = places.get(id);
      expect(place?.placeType).toBe("hub");
      expect(place?.editorial.lifecycle).toBe("published");
      expect(place?.editorial.sources.length).toBeGreaterThan(0);
      expect(place?.editorial.freshness).toBe("current");
      expect(place?.content.ja?.name).toBeTruthy();
      expect(place?.content.ja?.description).toBeTruthy();
    }
  });

  it("keeps the complete Yokohama vertical slice reviewed and contained", () => {
    const places = new Map(
      getCanonicalPlaces().map((place) => [place.id, place]),
    );
    expect(YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS).toHaveLength(14);
    for (const id of YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS) {
      const place = places.get(id);
      expect(place?.relationships?.parentDestinationId).toBe("yokohama-city");
      expect(place?.editorial.lifecycle).toBe("published");
      expect(place?.content.ja?.description).toBeTruthy();
    }
  });

  it("falls back to English when Japanese content is unavailable", () => {
    const place = getCanonicalPlaces().find(
      (item) => !item.content.ja && !item.nameJa,
    );
    expect(place).toBeTruthy();
    const localized = getLocalizedPlace(place!, "ja");
    expect(localized.name).toBe(place!.content.en.name);
    expect(localized.description).toBe(place!.content.en.description);
    expect(localized.highlights).toEqual(place!.content.en.highlights);
  });

  it("provides identical destination availability in English and Japanese", () => {
    const allPlaces = getCanonicalPlaces();
    const enPlaces = getAvailablePlaces("en");
    const jaPlaces = getAvailablePlaces("ja");

    expect(enPlaces).toHaveLength(978);
    expect(jaPlaces).toHaveLength(978);

    const enIds = enPlaces.map((place) => place.id).sort();
    const jaIds = jaPlaces.map((place) => place.id).sort();
    expect(jaIds).toEqual(enIds);

    expect(
      allPlaces.every((place) => isPlaceAvailableInLocale(place, "en")),
    ).toBe(true);
    expect(
      allPlaces.every((place) => isPlaceAvailableInLocale(place, "ja")),
    ).toBe(true);
  });

  it("retains full Japanese content when available", () => {
    const place = getCanonicalPlaces().find(
      (item) =>
        item.content.ja?.name &&
        item.content.ja.description &&
        item.content.ja.highlights.length > 0,
    );
    expect(place).toBeTruthy();
    const localized = getLocalizedPlace(place!, "ja");
    expect(localized.name).toBe(place!.content.ja!.name);
    expect(localized.description).toBe(place!.content.ja!.description);
    expect(localized.highlights).toEqual(place!.content.ja!.highlights);
  });

  it("performs safe per-field fallback for partial Japanese content", () => {
    // abukuma-cave-fukushima has Japanese name (nameJa) but English description & highlights
    const place = getCanonicalPlaces().find(
      (item) => item.id === "abukuma-cave-fukushima",
    );
    expect(place).toBeTruthy();
    const localized = getLocalizedPlace(place!, "ja");
    expect(localized.name).toBe("あぶくま洞");
    expect(localized.description).toBe(place!.content.en.description);
    expect(localized.highlights).toEqual(place!.content.en.highlights);
  });

  it("performs safe per-field fallback for places with no Japanese content", () => {
    // abashiri-city has no Japanese editorial content
    const place = getCanonicalPlaces().find(
      (item) => item.id === "abashiri-city",
    );
    expect(place).toBeTruthy();
    const localized = getLocalizedPlace(place!, "ja");
    expect(localized.name).toBe(place!.content.en.name);
    expect(localized.description).toBe(place!.content.en.description);
    expect(localized.highlights).toEqual(place!.content.en.highlights);
  });
});
