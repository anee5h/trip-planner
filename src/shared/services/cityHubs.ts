import cityHubsData from "@/shared/data/city-hubs.json";
import type { Destination } from "@/shared/types/destination";

export interface CityHubMeta {
  id: string;
  name: string;
  nameJa: string;
}

/**
 * KAI-132: city-hub options for the home-station selector (Settings +
 * onboarding). These are a SMALL dedicated metadata source (121 hub
 * cities, ~11 KB, statically imported) — they deliberately do NOT depend
 * on the runtime-lazy lite catalogue, so settings/account routes never
 * fetch /data/destinations-index.lite.json.
 *
 * Shape matches the Destination-lite fields the picker reads
 * (id, name, nameJa) for EN/JA labels + search.
 */
const CITY_HUBS: CityHubMeta[] = cityHubsData as CityHubMeta[];

/** All hub cities, sorted by EN name (stable for both locales). */
export function getCityHubs(): CityHubMeta[] {
  return CITY_HUBS;
}

/**
 * The hub list cast to the Destination shape the picker consumes (it
 * reads id/name/nameJa). EN/JA name selection is handled by the picker
 * via formatPlaceName.
 */
export function getCityHubsAsDestinations(): Destination[] {
  return CITY_HUBS.map((hub) => ({
    id: hub.id,
    name: hub.name,
    nameJa: hub.nameJa,
  })) as Destination[];
}
