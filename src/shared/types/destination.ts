import type { CollectionMembership } from "./collection";
import type { TransportMode } from "../services/transport/types";

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
  // Experience ratings (new)
  family?: number;
  accessibility?: number;
  nature?: number;
  historyAndCulture?: number;
  walkability?: number;
  // Seasonal ratings (new)
  spring?: number;
  autumn?: number;
}

export const REQUIRED_RATING_KEYS = [
  "overall",
  "couple",
  "summer",
  "winter",
  "rain",
  "food",
  "photography",
  "relaxation",
  "value",
  "uniqueness",
] as const satisfies readonly (keyof Ratings)[];

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
  | "aquarium"
  // KAI-87: legacy kinds present in the catalogue (schema contract extended
  // to match data; report §A/M). Future migration to canonical kinds is an
  // owner decision; the validator enforces membership in this set.
  | "nature"
  | "historic_town"
  | "historic"
  | "natural"
  | "mixed"
  | "theme_park"
  | "memorial"
  | "monument"
  | "cruise"
  | "cemetery"
  | "cliff"
  | "rock_formation"
  | "amusement_park"
  | "cape"
  | "observation"
  | "event"
  | "entertainment"
  | "cultural";

/** A standalone place is a deliberate root: regional, multi-municipality, or island-wide. */
export type DestinationRole = "hub" | "poi" | "standalone";

export type PlaceType = "hub" | "destination";
export type EditorialLifecycle =
  "legacy" | "draft" | "in_review" | "approved" | "published";

export interface LocalizedPlaceContent {
  name: string;
  description: string;
  highlights: string[];
  notes?: string;
  reservation?: string;
  parking?: string;
  openingHours?: string;
}

export interface SourceReference {
  /**
   * A source records where a factual claim was checked. AI assistance may be
   * noted in an editorial change log, but is never a factual source itself.
   */
  type:
    | "official"
    | "government"
    | "tourism_board"
    | "wikipedia"
    | "editor_observation"
    | "calculated"
    | "manual";
  url: string;
  title: string;
  accessedAt: string;
}

export interface EditorialChange {
  changedAt: string;
  changedBy: string;
  summary: string;
  method: "manual" | "assisted";
}

export interface EditorialRecord {
  lifecycle: EditorialLifecycle;
  sources: SourceReference[];
  reviewedAt?: string;
  reviewedBy?: string;
  changeSummary?: string;
  freshness?: "current" | "review_due" | "stale" | "conflicting";
  checkedAt?: string;
  /** Source references keyed by canonical field path for volatile facts. */
  fieldSources?: Record<string, SourceReference[]>;
  changes?: EditorialChange[];
}

export type DestinationImportance = "major" | "notable" | "standard";
export type OfficialWebsiteRequirement =
  "required" | "recommended" | "optional" | "none";

export interface DestinationImageMetadata {
  source: string;
  license: string;
  attribution: string;
  sourceUrl: string;
}

/**
 * Runtime grouping metadata for a virtual group destination (e.g. a UNESCO
 * property represented by several curated members). Built on demand from
 * catalogue members; never persisted in destination data.
 */
export interface VirtualGroupMetadata {
  /** Stable group id, e.g. "unesco-property-688". */
  id: string;
  /** Localized display name for the current locale. */
  name: string;
  /** Id of the member whose record backs the group card (image, budget…). */
  primaryMemberId: string;
  /** Ids of all underlying curated member destinations. A group is visited
   *  when at least one member is visited. */
  memberIds: string[];
  /** i18n key of the badge label shown on the group card. */
  badgeKey: "ui.unescoBadge";
  /** Number of underlying curated member destinations. */
  placeCount: number;
  /** Card navigation target: a destination page (single member) or a
   *  collection listing surface (multiple members). */
  href: string;
}

export interface DestinationRelationships {
  parentDestinationId?: string;
  /** Regional access hub for places reachable only via a gateway (e.g. islands,
   *  remote mountain areas) rather than contained within a municipal hub. */
  gatewayHubId?: string;
  featuredDestinationIds?: string[];
  nearbyDestinationIds?: string[];
  relatedDestinationIds?: string[];
}

export interface Destination {
  id: string;
  /** Canonical official visitor information or booking website. */
  officialWebsite?: string;
  officialWebsiteRequirement?: OfficialWebsiteRequirement;
  name: string;
  nameJa?: string;
  /** Canonical municipality (city/ward/town) the destination is physically
   *  located in. A parentDestinationId is only valid when it refers to a hub
   *  with the same municipalityId. */
  municipalityId?: string;
  /** Canonical v2 place classification; role remains for legacy callers. */
  placeType?: PlaceType;
  content?: {
    en: LocalizedPlaceContent;
    ja?: LocalizedPlaceContent;
  };
  editorial?: EditorialRecord;
  kind?: DestinationKind;
  role?: DestinationRole;
  importance?: DestinationImportance;
  /** Stable intra-city grouping used for discovery and diversification. */
  areaId?: string;
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
    flight?: number;
    ferry?: number;
  };
  /**
   * Canonical transport zone for island destinations. Mainland destinations
   * derive their zone from prefecture metadata; island records must carry an
   * explicit assignment instead of relying on runtime name matching. The
   * literal "unknown" declares the record non-routable (e.g. a multi-island
   * aggregate with no single routable location).
   */
  transportZoneId?: string;
  /**
   * Destination-level local access constraint. Zone localModes means "this
   * mode exists somewhere in the zone"; when a destination is not reachable
   * by every zone-local mode (e.g. an island with no rail inside a rail
   * zone), localAccessModes narrows same-zone authorization to the modes
   * that actually reach this destination.
   */
  localAccessModes?: TransportMode[];
  /**
   * True when localAccessModes are route-known but their times/costs are
   * not estimated (no estimator or static transport option). Such modes are
   * never selectable; the UI shows "route known — time and cost
   * unavailable".
   */
  localAccessUnestimated?: boolean;
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
  /**
   * @deprecated Legacy compatibility field. Pre-KAI-50 imports used this
   * with inconsistent semantics: sometimes on-site time, sometimes a whole
   * trip from a fixed origin such as Tokyo/Yokohama. Planning never reads
   * it. Use `recommendedVisitHours` for visit duration and let the runtime
   * derive total trip duration from verified origin-aware travel. New
   * records should not populate this field; existing values are retained
   * for historical data compatibility only.
   */
  totalTripHours?: number;
  recommendedVisitHours?: {
    min: number;
    max: number;
  };
  travelBuffers?: {
    transferMinutes?: number;
    ferryMinutes?: number;
  };
  walkingMin: number;
  walkingIntensity?: "low" | "medium" | "high";
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
  ratingsSchemaVersion?: 2;
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
  weatherDependence?: "low" | "moderate" | "high";
  openingHoursMetadata?: {
    verifiedAt?: string;
    sourceUrl?: string;
    lastAdmission?: string;
    closedDays?: string;
  };
  verifiedAt?: string;
  ratingMetadata?: {
    rubricVersion: number;
    method: "assisted" | "manual" | "calculated";
    confidence: "low" | "medium" | "high";
  };
  tags: string[];
  reservation: string;
  reservationJa?: string;
  parking: string;
  parkingJa?: string;
  openingHours?: string;
  openingHoursJa?: string;
  businessHours?: string;
  notes: string;
  notesJa?: string;
  schemaVersion?: 2;
  imageMetadata?: DestinationImageMetadata;
  itinerary?: ItineraryStep[];
  itineraries?: ItineraryPlan[];

  /**
   * Recommended visit duration for planning.
   * E.g. "1-2 hours", "Half day", "Full day", "Weekend"
   */
  recommendedDuration?: "1-2 hours" | "Half day" | "Full day" | "Weekend";

  /** Mandatory: Destination content quality status */
  status: "verified" | "planned" | "beta" | "published";

  /** Mandatory: Travel estimate calibration confidence level */
  travelEstimate: {
    confidence: "high" | "medium" | "beta";
  };

  /** Mandatory: Curated collection memberships */
  collections: CollectionMembership[];
  /** Runtime virtual-group metadata for group destinations built from
   *  curated members (e.g. UNESCO property groups). Never persisted. */
  virtualGroup?: VirtualGroupMetadata;
  /** Editorial import date for QA ordering; not a visitor-facing claim. */
  addedAt?: string;
  /** Image is a temporary QA placeholder and must be replaced before editorial approval. */
  imageNeedsReview?: boolean;
}
