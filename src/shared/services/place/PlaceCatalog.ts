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
            reviewedBy: "TabiMap editorial",
            changeSummary: "Phase 1 bilingual hub review",
          }
        : { lifecycle: "legacy", sources: [] }),
  };
}

export function getCanonicalPlaces(): CanonicalPlace[] {
  return (destinationsIndex as Destination[]).map(toCanonicalPlace);
}

/**
 * Japanese discovery is editorially gated: a translated name alone is not
 * enough to make a place public in the Japanese catalogue.
 */
export function isPlaceAvailableInLocale(
  place: Destination,
  locale: "en" | "ja",
): boolean {
  if (locale === "en") return true;
  if (import.meta.env.VITE_EDITORIAL_REVIEW_MODE === "true") {
    return true;
  }
  const canonical = toCanonicalPlace(place);
  const japanese = canonical.content.ja;
  return Boolean(
    canonical.editorial.lifecycle === "published" &&
    japanese?.name &&
    japanese.description &&
    japanese.highlights.length > 0,
  );
}

export function getAvailablePlaces(locale: "en" | "ja"): CanonicalPlace[] {
  return getCanonicalPlaces().filter((place) =>
    isPlaceAvailableInLocale(place, locale),
  );
}

export function getLocalizedPlace(
  place: Destination,
  locale: "en" | "ja",
): Destination {
  const canonical = toCanonicalPlace(place);
  const content =
    locale === "ja"
      ? canonical.content.ja || canonical.content.en
      : canonical.content.en;
  return {
    ...canonical,
    name: content.name,
    description: content.description,
    highlights: content.highlights,
  };
}
