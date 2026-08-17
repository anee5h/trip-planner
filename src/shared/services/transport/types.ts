import type { Season } from "@/shared/utils/season";

export type TransportMode =
  "train" | "shinkansen" | "car" | "my_car" | "bus" | "flight" | "ferry";

/**
 * Canonical temporal input for ferry availability. Production code must
 * never fall back to the system clock: an undefined context is evaluated
 * conservatively (seasonal routes unavailable, period fares unverified).
 */
export interface FerryTemporalContext {
  /** Exact planned travel date. */
  travelDate?: Date;
  /** Planned season fallback, evaluated conservatively. */
  season?: Season;
}

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
  /**
   * Annual operating periods (MM-DD, inclusive; may wrap a year boundary).
   * Absent = year-round. Routes with operatingPeriods are seasonal and must
   * not be presented as year-round availability.
   */
  operatingPeriods?: Array<{ from: string; to: string }>;
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
  /**
   * Optional allowed weekdays within the period (0=Sunday .. 6=Saturday,
   * JavaScript getDay() convention). Absent means every day of the week.
   * Periods with weekday constraints are date-precise: a season-only
   * context cannot confirm them and fails conservatively.
   */
  weekdays?: number[];
  /**
   * Optional explicit MM-DD exclusions within the period (e.g. a published
   * closure like the year-end break).
   */
  excludeDates?: string[];
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
  /**
   * Inclusive ISO date window during which the fare is published. Absent =
   * the fare is current until the next data refresh. Outside the window the
   * route stays available but the fare is not applied (costUnavailable).
   */
  fareValidFrom?: string;
  fareValidTo?: string;
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
