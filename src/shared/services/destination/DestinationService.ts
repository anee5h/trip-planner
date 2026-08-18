import type { Destination } from "@/shared/types/destination";
import {
  getAvailablePlaces,
  getFullPlaces,
  isPlaceAvailableInLocale,
  loadDestinationsIndex,
  toCanonicalPlace,
} from "@/shared/services/place/PlaceCatalog";

/** Summary list (KAI-121 contract): synchronous, formally complete for
 *  first-paint / search / list surfaces. Full-data consumers must use
 *  getDestinationListAsync() or await the full index. */
export function getDestinationList(
  locale: "en" | "ja" = "en",
): Partial<Destination>[] {
  const list = getAvailablePlaces(locale) as Partial<Destination>[];
  return list.map((dest) => {
    if (dest.transportOptions?.car && !dest.transportOptions.my_car) {
      return {
        ...dest,
        transportOptions: {
          ...dest.transportOptions,
          my_car: dest.transportOptions.car,
        },
      };
    }
    return dest;
  });
}

/**
 * KAI-121 async full-catalogue list: awaits the full index, then returns
 * the complete destination records. Routes/features that genuinely need
 * full data (budget fields, transport metadata, editorial content) call
 * this. Safe to call repeatedly — the loader shares one promise.
 */
export async function getDestinationListAsync(
  locale: "en" | "ja" = "en",
): Promise<Partial<Destination>[]> {
  await loadDestinationsIndex();
  const full = getFullPlaces() as Partial<Destination>[];
  return full.filter((dest) =>
    isPlaceAvailableInLocale(dest as Destination, locale),
  );
}

/**
 * Loads a destination for the given locale. Public destinations are available
 * in both English and Japanese regardless of translation completeness.
 * Unknown IDs return null.
 */
export async function getDestination(
  id: string,
  locale: "en" | "ja",
): Promise<Destination | null> {
  const dest = await loadDestination(id);
  if (!dest) return null;
  if (!isPlaceAvailableInLocale(dest, locale)) return null;
  return dest;
}

/**
 * Ungated load for editorial review.
 */
export async function getDestinationForEditorialReview(
  id: string,
): Promise<Destination | null> {
  return loadDestination(id);
}

async function loadDestination(id: string): Promise<Destination | null> {
  try {
    const response = await fetch(`/data/destinations/${id}.json`);
    if (response.ok) {
      const dest = toCanonicalPlace(await response.json());
      if (dest.transportOptions?.car && !dest.transportOptions.my_car) {
        return {
          ...dest,
          transportOptions: {
            ...dest.transportOptions,
            my_car: dest.transportOptions.car,
          },
        };
      }
      return dest;
    }
  } catch (error) {
    // Fallback to the full index below.
  }

  // KAI-121 contract: NEVER return a lite-summary record pretending to be
  // a full Destination. If the per-destination fetch fails, await the FULL
  // catalogue and find the record there. If the full load also fails,
  // return null — callers handle the absence explicitly.
  try {
    await loadDestinationsIndex();
    const fullMatch = getFullPlaces().find((d) => d.id === id);
    if (fullMatch) {
      if (
        fullMatch.transportOptions?.car &&
        !fullMatch.transportOptions.my_car
      ) {
        return {
          ...fullMatch,
          transportOptions: {
            ...fullMatch.transportOptions,
            my_car: fullMatch.transportOptions.car,
          },
        };
      }
      return fullMatch;
    }
  } catch (error) {
    // Full index unavailable — do NOT fall back to summary (it is not a
    // complete Destination). Callers see null.
    return null;
  }

  return null;
}

export async function compareDestinations(
  ids: string[],
  locale: "en" | "ja",
): Promise<Destination[]> {
  const results = await Promise.all(
    ids.map((id) => getDestination(id, locale)),
  );
  return results.filter((d): d is Destination => d !== null);
}
