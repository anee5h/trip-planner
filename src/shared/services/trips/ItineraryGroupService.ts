import type { Destination } from "@/shared/types/destination";

export interface ItineraryItem {
  id: string;
  destinationId: string;
  destination: Destination;
  addedAt: string;
}

export interface ItineraryGroup {
  id: string;
  type: "destination_pair" | "generated_plan";
  title: string;
  destinationIds: string[];
  items: ItineraryItem[];
  estimatedDurationMinutes?: number;
  estimatedBudgetRange?: [number, number];
}

export function getCombinationKey(
  primaryId: string,
  secondaryId: string,
): string {
  return `combination:${[primaryId, secondaryId].sort().join(":")}`;
}
