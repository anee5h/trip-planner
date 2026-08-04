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
 * Loads a published destination for the given locale, gating it through
 * isPlaceAvailableInLocale so unpublished Japanese records are not reachable
 * via a direct /destinations/:id route. The locale is mandatory: publication
 * safety is the default contract. Editorial callers that need an ungated copy
 * must use getDestinationForEditorialReview explicitly.
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
 * Explicitly ungated load for editorial review of unpublished records. Do not
 * use on public routes.
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
