import destinationsIndex from "../../data/destinations-index.json";
import { EDITORIAL_PILOT } from "../../data/editorialPilot";
import type {
  Destination,
  LocalizedPlaceContent,
} from "../../types/destination";

export type CanonicalPlace = Destination &
  Required<Pick<Destination, "placeType" | "content" | "editorial">>;

function englishContent(destination: Destination): LocalizedPlaceContent {
  return {
    name: destination.name,
    description: destination.description,
    highlights: destination.highlights || [],
  };
}

export function toCanonicalPlace(destination: Destination): CanonicalPlace {
  const pilot = EDITORIAL_PILOT[destination.id];
  const en =
    pilot?.en || destination.content?.en || englishContent(destination);
  const ja =
    pilot?.ja ||
    destination.content?.ja ||
    (destination.nameJa
      ? {
          name: destination.nameJa,
          description: destination.description,
          highlights: destination.highlights || [],
        }
      : undefined);
  const isReviewed = Boolean(pilot);
  return {
    ...destination,
    categories: destination.categories || [],
    tags: destination.tags || [],
    highlights: destination.highlights || [],
    collections: destination.collections || [],
    placeType:
      destination.placeType ||
      (destination.role === "hub" ? "hub" : "destination"),
    content: { en, ...(ja ? { ja } : {}) },
    editorial:
      destination.editorial ||
      (isReviewed
        ? {
            lifecycle: "published",
            sources: [pilot.source],
            reviewedAt: "2026-07-28",
            checkedAt: "2026-07-28",
            freshness: "current",
            reviewedBy: "Meguruto editorial",
            changeSummary: "Phase 1 bilingual hub review",
          }
        : { lifecycle: "legacy", sources: [] }),
  };
}

export function getCanonicalPlaces(): CanonicalPlace[] {
  return (destinationsIndex as Destination[]).map(toCanonicalPlace);
}

/**
 * Checks whether a destination is available in the requested locale.
 * Public destinations are equally accessible in English and Japanese;
 * translation/editorial completeness affects only display content, not availability.
 */
export function isPlaceAvailableInLocale(
  place: Destination,
  _locale: "en" | "ja" = "en",
): boolean {
  return Boolean(place);
}

export function getAvailablePlaces(
  locale: "en" | "ja" = "en",
): CanonicalPlace[] {
  return getCanonicalPlaces().filter((place) =>
    isPlaceAvailableInLocale(place, locale),
  );
}

/**
 * Returns a localized copy of the place for the specified locale.
 * Japanese rendering uses per-field fallback to English for any missing localized fields.
 */
export function getLocalizedPlace(
  place: Destination,
  locale: "en" | "ja" = "en",
): Destination {
  const canonical = toCanonicalPlace(place);
  if (locale === "en") {
    return {
      ...canonical,
      name: canonical.content.en.name,
      description: canonical.content.en.description,
      highlights: canonical.content.en.highlights,
    };
  }

  const ja = canonical.content.ja;
  const en = canonical.content.en;

  const name =
    ja?.name && ja.name.trim() !== ""
      ? ja.name
      : canonical.nameJa && canonical.nameJa.trim() !== ""
        ? canonical.nameJa
        : en.name;

  const description =
    ja?.description && ja.description.trim() !== ""
      ? ja.description
      : en.description;

  const highlights =
    ja?.highlights && ja.highlights.length > 0 ? ja.highlights : en.highlights;

  return {
    ...canonical,
    name,
    description,
    highlights,
  };
}
