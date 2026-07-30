export const TripStatus = {
  Draft: "draft",
  Planned: "planned",
  Completed: "completed",
  Cancelled: "cancelled",
} as const;

export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

export const TripStopType = {
  Destination: "destination",
  Custom: "custom",
} as const;

export type TripStopType = (typeof TripStopType)[keyof typeof TripStopType];

export interface TripStop {
  id: string;
  type: TripStopType;
  destinationId?: string;
  name: string;
  notes?: string;
  date?: string;
  arrivalTime?: string;
  departureTime?: string;
  estimatedCost?: number;
}

export interface Trip {
  id: string;
  userId: string;
  title: string;
  startDate?: string;
  endDate?: string;
  status: TripStatus;
  stops: TripStop[];
  journalNotes?: string;
  createdAt: string;
  updatedAt: string;
}
