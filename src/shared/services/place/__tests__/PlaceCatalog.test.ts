import { beforeAll, describe, expect, it } from "vitest";
import {
  EDITORIAL_PILOT_IDS,
  PHASE_ONE_COHORT_IDS,
  YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS,
} from "@/shared/data/editorialPilot";
import {
  getAvailablePlaces,
  getFullPlaces,
  getLoadedLitePlaces,
  getLocalizedPlace,
  hasLoadedFullIndex,
  isPlaceAvailableInLocale,
  loadCatalogue,
  loadDestinationsIndex,
  loadLiteIndex,
  resetLiteIndexForTests,
} from "../PlaceCatalog";
import type { Destination } from "@/shared/types/destination";

// KAI-121/132: full-data assertions require the async full index (explicit
// contract). Summary (lite) assertions require the async lite loader too —
// the lite catalogue is a runtime asset, never a static inline.
beforeAll(async () => {
  await loadDestinationsIndex();
  await loadLiteIndex();
});

describe("PlaceCatalog", () => {
  it("loads either catalogue through one intent-based interface", async () => {
    const summary = await loadCatalogue("summary");
    const full = await loadCatalogue("full");

    expect(summary).toHaveLength(1007);
    expect(full).toHaveLength(1007);
    expect(summary[0].placeType).toBeTruthy();
    expect(full[0].content.en.name).toBeTruthy();
  });

  it("rejects an unknown catalogue intent", async () => {
    await expect(loadCatalogue("other" as never)).rejects.toThrow(
      /unsupported catalogue intent/,
    );
  });

  it("creates canonical records for the complete catalog (full index)", () => {
    const places = getFullPlaces();
    expect(places).toHaveLength(1007);
    expect(places.every((place) => place.placeType)).toBe(true);
    expect(places.every((place) => Array.isArray(place.tags))).toBe(true);
  });

  it("summary catalogue is complete for list surfaces (1007 records)", () => {
    const summary = getLoadedLitePlaces();
    expect(summary).toHaveLength(1007);
    expect(summary.every((place) => place.id)).toBe(true);
    expect(summary.every((place) => place.name)).toBe(true);
    expect(summary.every((place) => place.prefecture)).toBe(true);
    expect(summary.every((place) => place.placeType)).toBe(true);
  });

  it("getLoadedLitePlaces fails fast before the lite loader resolves", async () => {
    resetLiteIndexForTests();
    expect(() => getLoadedLitePlaces()).toThrow(/before loadLiteIndex/);
    // Restore for subsequent tests.
    await loadLiteIndex();
  });

  it("keeps official website links destination-only", () => {
    const places = getFullPlaces();
    expect(places.filter((place) => place.placeType === "hub")).toHaveLength(
      163,
    );
    expect(
      places.filter((place) => place.placeType === "destination"),
    ).toHaveLength(844);
    expect(
      places
        .filter(
          (place) => place.placeType === "hub" && place.kind !== "district",
        )
        .every((place) => !place.officialWebsite),
    ).toBe(true);
  });

  it("supplies reviewed bilingual content for every pilot hub", () => {
    const places = new Map(getFullPlaces().map((place) => [place.id, place]));
    for (const id of EDITORIAL_PILOT_IDS) {
      const place = places.get(id);
      expect(place?.editorial.lifecycle).toBe("published");
      expect(place?.content.ja?.description).toBeTruthy();
    }
  });

  it("keeps every Phase 1 cohort hub published and bilingual", () => {
    const places = new Map(getFullPlaces().map((place) => [place.id, place]));
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
    const places = new Map(getFullPlaces().map((place) => [place.id, place]));
    expect(YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS).toHaveLength(14);
    for (const id of YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS) {
      const place = places.get(id);
      expect(place?.relationships?.parentDestinationId).toBe("yokohama-city");
      expect(place?.editorial.lifecycle).toBe("published");
      expect(place?.content.ja?.description).toBeTruthy();
    }
  });

  it("falls back to English when Japanese content is unavailable", () => {
    const place = getFullPlaces().find(
      (item) => !item.content.ja && !item.nameJa,
    );
    expect(place).toBeTruthy();
    const localized = getLocalizedPlace(place!, "ja");
    expect(localized.name).toBe(place!.content.en.name);
    expect(localized.description).toBe(place!.content.en.description);
    expect(localized.highlights).toEqual(place!.content.en.highlights);
  });

  it("provides identical destination availability in English and Japanese", () => {
    const enPlaces = getAvailablePlaces("en");
    const jaPlaces = getAvailablePlaces("ja");

    expect(enPlaces).toHaveLength(1007);
    expect(jaPlaces).toHaveLength(1007);

    const enIds = enPlaces.map((place) => place.id).sort();
    const jaIds = jaPlaces.map((place) => place.id).sort();
    expect(jaIds).toEqual(enIds);

    expect(
      getFullPlaces().every((place) => isPlaceAvailableInLocale(place, "en")),
    ).toBe(true);
    expect(
      getFullPlaces().every((place) => isPlaceAvailableInLocale(place, "ja")),
    ).toBe(true);
  });

  it("retains full Japanese content when available", () => {
    const place = getFullPlaces().find(
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
    const place = getFullPlaces().find(
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
    const place = getFullPlaces().find((item) => item.id === "abashiri-city");
    expect(place).toBeTruthy();
    const localized = getLocalizedPlace(place!, "ja");
    expect(localized.name).toBe(place!.content.en.name);
    expect(localized.description).toBe(place!.content.en.description);
    expect(localized.highlights).toEqual(place!.content.en.highlights);
  });

  it("preserves intentionally empty English highlights without leaking legacy top-level highlights", () => {
    const basePlace = getFullPlaces()[0];
    const place: Destination = {
      ...basePlace,
      id: "test-place-empty-en-highlights",
      name: "Test Place",
      description: "Test description",
      highlights: ["Legacy Highlight 1", "Legacy Highlight 2"],
      content: {
        en: {
          name: "Test Place English",
          description: "English description",
          highlights: [],
        },
        ja: {
          name: "テスト場所",
          description: "日本語説明",
          highlights: ["日本語ハイライト1"],
        },
      },
    };

    const enLocalized = getLocalizedPlace(place, "en");
    expect(enLocalized.name).toBe("Test Place English");
    expect(enLocalized.description).toBe("English description");
    // Must remain strictly empty, never falling back to legacy top-level highlights
    expect(enLocalized.highlights).toEqual([]);

    const jaLocalized = getLocalizedPlace(place, "ja");
    expect(jaLocalized.name).toBe("テスト場所");
    expect(jaLocalized.description).toBe("日本語説明");
    expect(jaLocalized.highlights).toEqual(["日本語ハイライト1"]);
  });

  it("exposes hasLoadedFullIndex reflecting the async loader state", () => {
    // The beforeAll awaited the loader, so the full index is present.
    expect(hasLoadedFullIndex()).toBe(true);
  });
});
