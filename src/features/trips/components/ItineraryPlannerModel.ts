import type { TripStop } from "@/shared/types/trip";

export interface ItineraryStopGroup {
  key: string;
  date?: string;
  stops: Array<{ stop: TripStop; index: number }>;
}

export function groupItineraryStops(stops: TripStop[]): ItineraryStopGroup[] {
  return stops.reduce<ItineraryStopGroup[]>((groups, stop, index) => {
    const baseKey = stop.date ?? "unscheduled";
    const previous = groups[groups.length - 1];
    if (previous?.date === stop.date) {
      previous.stops.push({ stop, index });
    } else {
      const occurrence = groups.filter(
        (group) => group.date === stop.date,
      ).length;
      groups.push({
        key: occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`,
        date: stop.date,
        stops: [{ stop, index }],
      });
    }
    return groups;
  }, []);
}
