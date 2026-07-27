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
  fare: [number, number];
}

export interface TransportEstimate {
  mode: TransportMode;
  label: string;
  available: boolean;
  recommended: boolean;
  timeRange: [number, number]; // [min, max] in minutes
  costRange: [number, number]; // [min, max] in JPY
  source: "calculated" | "dataset";
  details?: {
    departureAirportCode?: string;
    departureAirportName?: string;
    arrivalAirportCode?: string;
    arrivalAirportName?: string;
    originAccessTimeRange?: [number, number];
    destAccessTimeRange?: [number, number];
  };
}
