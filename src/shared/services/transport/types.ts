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

export type FerryFareBasis = "one-way" | "round-trip";

export interface FerryOperatingPeriod {
  /** Month-day (MM-DD) inclusive; may wrap a year boundary. */
  from: string;
  to: string;
}

export interface FerryService {
  id: string;
  fromPort: string;
  toPort: string;
  operator: string;
  serviceName?: string;
  vesselType: "ferry" | "jetfoil" | "highspeed";
  passengerService: boolean;
  /** True when the published service runs the reverse direction too. */
  bidirectional: boolean;
  durationMinutes: [number, number];
  /** null = no verified fare data. fareStatus must be "unverified" then. */
  fare: [number, number] | null;
  fareBasis: FerryFareBasis;
  fareStatus?: "verified" | "unverified";
  /** Supports route existence. */
  sourceUrl?: string;
  /** Supports the fare range specifically, when fares are verified. */
  fareSourceUrl?: string;
  /** Applies to the specific fact asserted (route or fare). */
  checkedAt?: string;
  /** Seasonal or reservation notes. */
  notes?: string;
  /** Annual operating periods; absent means year-round. */
  operatingPeriods?: FerryOperatingPeriod[];
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
    serviceName?: string;
    /** one-way: costRange is one-way; round-trip: costRange is round-trip. */
    ferryFareBasis?: FerryFareBasis;
    ferryNotes?: string;
  };
}
