import type { Destination } from "@/shared/types/destination";
import {
  getCanonicalPlaces,
  toCanonicalPlace,
} from "@/shared/services/place/PlaceCatalog";

export function getDestinationList(): Partial<Destination>[] {
  const list = getCanonicalPlaces() as Partial<Destination>[];
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

export async function getDestination(id: string): Promise<Destination | null> {
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
): Promise<Destination[]> {
  const results = await Promise.all(ids.map(getDestination));
  return results.filter((d): d is Destination => d !== null);
}
