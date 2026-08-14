import type { Destination } from "@/shared/types/destination";
import {
  getCanonicalPlaces,
  getAvailablePlaces,
  isPlaceAvailableInLocale,
  toCanonicalPlace,
} from "@/shared/services/place/PlaceCatalog";

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
    // Fallback to index below
  }

  // Fallback to in-memory destinationsIndex
  const indexMatch = getCanonicalPlaces().find((d) => d.id === id);
  if (indexMatch) {
    if (
      indexMatch.transportOptions?.car &&
      !indexMatch.transportOptions.my_car
    ) {
      return {
        ...indexMatch,
        transportOptions: {
          ...indexMatch.transportOptions,
          my_car: indexMatch.transportOptions.car,
        },
      };
    }
    return indexMatch;
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
