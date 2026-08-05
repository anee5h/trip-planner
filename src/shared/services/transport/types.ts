export type TransportMode =
  "train" | "shinkansen" | "car" | "my_car" | "bus" | "flight" | "ferry";

export interface Location {
  name?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface Airport {
  id: string;
  code: string;
  name: string;
  city: string;
  prefecture: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface FlightRoute {
  from: string;
  to: string;
  flightTime: [number, number];
  /**
   * null = no verified fare data. fareStatus must be "unverified" then, and
   * budget/UI must not present a fabricated flight cost.
   */
  fare: [number, number] | null;
  fareStatus?: "verified" | "unverified";
  /** Supports route existence. */
  sourceUrl?: string;
  /** Supports the fare range specifically, when fares are verified. */
  fareSourceUrl?: string;
  /** Applies to the specific fact asserted (route or fare). */
  checkedAt?: string;
}

export interface FerryPort {
  id: string;
  name: string;
  nameJa?: string;
  city: string;
  prefecture: string;
  zoneId: string;
  coordinates: { lat: number; lng: number };
}

export interface FerryRoute {
  fromPort: string;
  toPort: string;
  operator: string;
  passengerService: boolean;
  durationMinutes: [number, number];
  /** null = no verified fare data. */
  fare: [number, number] | null;
  fareStatus?: "verified" | "unverified";
  sourceUrl?: string;
  fareSourceUrl?: string;
  checkedAt?: string;
  notes?: string;
}

export interface TransportEstimate {
  mode: TransportMode;
  label: string;
  available: boolean;
  recommended: boolean;
  timeRange: [number, number]; // [min, max] in minutes
  costRange: [number, number]; // [min, max] in JPY
  /** True when no verified fare exists; costRange is then meaningless. */
  costUnavailable?: boolean;
  source: "calculated" | "dataset";
  details?: {
    departureAirportCode?: string;
    departureAirportName?: string;
    arrivalAirportCode?: string;
    arrivalAirportName?: string;
    originAccessTimeRange?: [number, number];
    destAccessTimeRange?: [number, number];
    departurePortName?: string;
    arrivalPortName?: string;
    operator?: string;
    ferryNotes?: string;
  };
}
