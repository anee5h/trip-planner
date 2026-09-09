import type { TripStop } from "@/shared/types/trip";

export interface ItineraryStopGroup {
  key: string;
  date?: string;
  stops: Array<{ stop: TripStop; index: number }>;
}

export function groupItineraryStops(stops: TripStop[]): ItineraryStopGroup[] {
  return stops.reduce<ItineraryStopGroup[]>((groups, stop, index) => {
    const key = stop.date ?? "unscheduled";
    const previous = groups[groups.length - 1];
    if (previous?.key === key) {
      previous.stops.push({ stop, index });
    } else {
      groups.push({ key, date: stop.date, stops: [{ stop, index }] });
    }
    return groups;
  }, []);
}
