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
    expect(places).toHaveLength(863);
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
    ).toHaveLength(700);
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
    const place = getCanonicalPlaces().find((item) => !item.content.ja);
    expect(place).toBeTruthy();
    expect(getLocalizedPlace(place!, "ja").name).toBe(place!.content.en.name);
  });

  it("gates Japanese discovery to reviewed bilingual places", () => {
    const allPlaces = getCanonicalPlaces();
    const reviewMode = import.meta.env.VITE_EDITORIAL_REVIEW_MODE === "true";
    expect(getAvailablePlaces("en")).toHaveLength(863);
    expect(getAvailablePlaces("ja")).toHaveLength(reviewMode ? 863 : 630);
    expect(
      allPlaces.every((place) => isPlaceAvailableInLocale(place, "en")),
    ).toBe(true);
    if (!reviewMode) {
      expect(
        getAvailablePlaces("ja").every(
          (place) =>
            place.editorial.lifecycle === "published" &&
            Boolean(place.content.ja?.description),
        ),
      ).toBe(true);
    }
  });
});
