import type { CollectionMembership } from "./collection";

export interface ItineraryStep {
  time: string;
  activity: string;
}

export interface ItineraryPlan {
  name: string;
  description: string;
  steps: ItineraryStep[];
}

export interface Ratings {
  overall: number;
  couple: number;
  summer: number;
  winter: number;
  rain: number;
  food: number;
  photography: number;
  relaxation: number;
  value: number;
  uniqueness: number;
}

export type DestinationKind =
  | "city"
  | "ward"
  | "town"
  | "village"
  | "district"
  | "castle"
  | "palace"
  | "temple"
  | "shrine"
  | "museum"
  | "park"
  | "garden"
  | "mountain"
  | "lake"
  | "waterfall"
  | "island"
  | "beach"
  | "shopping"
  | "market"
  | "street"
  | "viewpoint"
  | "tower"
  | "bridge"
  | "station"
  | "onsen"
  | "zoo"
  | "aquarium";

export type DestinationRole = "hub" | "poi";

export type DestinationImportance = "major" | "notable" | "standard";

export interface DestinationRelationships {
  parentDestinationId?: string;
  featuredDestinationIds?: string[];
  nearbyDestinationIds?: string[];
  relatedDestinationIds?: string[];
}

export interface Destination {
  id: string;
  name: string;
  kind?: DestinationKind;
  role?: DestinationRole;
  importance?: DestinationImportance;
  aliases?: string[];
  relationships?: DestinationRelationships;
  prefecture: string;
  region: string;
  categories: string[];
  heroImage: string;
  description: string;
  highlights: string[];
  budgetRecommended: number;
  budgetMin: number;
  budgetMax: number;
  budgetBreakdown?: {
    transport: number;
    tickets: number;
    food: number;
    cafe: number;
  };
  transportOptions: {
    train?: number;
    car?: number;
    my_car?: number;
    shinkansen?: number;
    bus?: number;
  };
  /**
   * Optional: Explicit route fares for exact budget overrides.
   * - train, bus, shinkansen: One-way ticket fare per person (JPY).
   * - car, my_car: Round-trip total estimated vehicle cost per car (rental + gas + tolls, JPY).
   */
  transportFares?: {
    train?: number;
    shinkansen?: number;
    bus?: number;
    car?: number;
    my_car?: number;
  };
  totalTripHours: number;
  walkingMin: number;
  walkingSunMin: number;
  walkingShadeMin: number;
  indoorPercent: number;
  coordinates?: { lat: number; lng: number };
  comfort?: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  };
  ratings: Ratings;
  matchScore?: number;
  matchReasons?: string[];
  crowd: {
    weekday: number;
    weekend: number;
    holiday: number;
  };
  season: {
    spring: number;
    summer: number;
    autumn: number;
    winter: number;
  };
  bestMonths: number[];
  bestSeason?: string;
  weatherDependence?: string;
  tags: string[];
  reservation: string;
  parking: string;
  restaurants: string[];
  cafes: string[];
  notes: string;
  itinerary?: ItineraryStep[];
  itineraries?: ItineraryPlan[];

  /** Mandatory: Destination content quality status */
  status: "verified" | "planned";

  /** Mandatory: Travel estimate calibration confidence level */
  travelEstimate: {
    confidence: "high" | "medium" | "beta";
  };

  /** Mandatory: Curated collection memberships */
  collections: CollectionMembership[];
}
