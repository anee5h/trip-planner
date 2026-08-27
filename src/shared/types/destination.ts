import type { CollectionMembership } from "./collection";
import type { TransportMode } from "../services/transport/types";
import type { ScoreMetadata } from "../services/recommendation/scoreRubric";

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

/**
 * KAI-214 budget-state taxonomy — VALUE STATE axis.
 *
 * Describes what a destination's on-site budget IS (the semantic truth),
 * independent of where the number came from (see BudgetProvenance).
 *
 * - verified_paid: a source-backed required/base admission price exists.
 * - verified_free: free/open access with EXPLICIT evidence (never inferred
 *   from 0, missing admission, tags, kind, or absent data).
 * - documented_estimate: a deterministic approved model provides a numeric
 *   estimate/range (distinct from source-backed pricing).
 * - variable_price: a single fixed price is not truthful because cost
 *   varies materially by date/product/activity/package/season/choice.
 * - not_applicable: a single admission/on-site price is not conceptually
 *   applicable (e.g. city/hub, district, certain public-space concepts).
 *   NEVER assigned automatically by category — must be explicit.
 * - unavailable: a budget could conceptually exist but Meguruto lacks
 *   evidence; MUST carry a reasonCode.
 * - legacy_unverified: temporary migration state (KAI-215 target: 0);
 *   always UNTRUSTED for consumption.
 */
export type BudgetValueState =
  | "verified_paid"
  | "verified_free"
  | "documented_estimate"
  | "variable_price"
  | "not_applicable"
  | "unavailable"
  | "legacy_unverified";

/**
 * KAI-214 budget-state taxonomy — PROVENANCE axis (orthogonal to state).
 * Where the value/state came from.
 */
export type BudgetProvenance =
  | "verified_source" // source-backed (manual review / calibration ledger)
  | "model" // deterministic approved model output
  | "legacy" // historical/template/formula generation
  | "transitional" // compatibility mapping from old method (KAI-214)
  | "none"; // no provenance at all

/**
 * KAI-214 budget-state taxonomy — REASON CODE axis.
 * Stable machine-readable reasons for non-numeric/non-complete states.
 * Small stable taxonomy; extend without breaking consumers.
 */
export type BudgetReasonCode =
  | "source_missing"
  | "price_variable_by_date"
  | "price_variable_by_product"
  | "optional_paid_experiences_only"
  | "free_area_with_optional_paid_components"
  | "no_single_admission_product"
  | "hub_budget_not_applicable"
  | "activity_specific_pricing"
  | "seasonal_pricing"
  | "legacy_provenance_unrecovered"
  | "insufficient_model_evidence"
  | "transitional_unclassified";

/**
 * KAI-214 normalized budget state — the full multi-axis semantic record
 * produced by normalizeBudgetState() (budgetState.ts). Runtime consumers
 * should ask semantic questions via helpers, never scattered field checks.
 */
export interface NormalizedBudgetState {
  state: BudgetValueState;
  provenance: BudgetProvenance;
  reasonCode?: BudgetReasonCode;
  trustLevel: "trusted" | "trusted_estimate" | "untrusted";
  /** true when a numeric range exists in storage (regardless of trust) */
  hasNumericRange: boolean;
  /** true when a breakdown exists in storage (regardless of trust) */
  hasBreakdown: boolean;
  /** the source method this was normalized from */
  sourceMethod: "model" | "manual" | "unknown" | "legacy" | "absent";
}

// ---- KAI-218A — scoped destination cost facts ----
//
// These are PERSISTED, destination-owned cost facts (admission / required
// local transport). They reuse the KAI-214 state/provenance/reasonCode
// taxonomy VERBATIM (no second trust system) and represent values with
// KAI-215-style shapes (bounded / open_ended / non-numeric). They are the
// forward replacement for the generic budgetMin/budgetRecommended/budgetMax
// + budgetBreakdown.{transport,food,cafe} fields (retirement path in
// DEPRECATION.md).

/** KAI-218A — destination cost value shapes (dependency-neutral twin of the
 *  KAI-215 CostRepresentation, kept local so destination.ts stays free of
 *  service-layer imports). */
export type DestinationCostFact =
  | { readonly kind: "bounded"; readonly min: number; readonly max: number }
  | { readonly kind: "open_ended"; readonly from: number }
  | { readonly kind: "variable" }
  | { readonly kind: "not_applicable" }
  | { readonly kind: "unavailable"; readonly reason?: BudgetReasonCode };

/** What the admission number/state covers, for honest scope reporting. */
export type AdmissionScope =
  | "general_entry"
  | "adult"
  | "combo_included"
  | "main_site_only"
  | "grounds_only"
  | "per_activity"
  | "open_area"
  | "whole_area";

/**
 * KAI-218A — ADMISSION cost fact.
 *
 * The on-site admission/entry-price truth for ONE destination. Deliberately
 * reuses the KAI-214 state/provenance/reasonCode taxonomy verbatim and
 * represents the value with DestinationCostFact shapes.
 *
 * Invariants (CI-enforced):
 *   - state === "verified_free"  ⇒ cost bounded [0,0] AND explicit free
 *     evidence in basis (freeEvidence.hasVerifiedFreeEvidence semantics).
 *   - state === "verified_paid"  ⇒ cost bounded [min,max] (min>=0,
 *     max>=min) AND provenance "verified_source" AND at least one
 *     sourceUrl + checkedAt.
 *   - state === "documented_estimate" ⇒ cost bounded/open_ended with
 *     provenance "model".
 *   - state === "variable_price" ⇒ cost open_ended (truthful lower bound
 *     only), variable, OR a VERIFIED OFFICIAL bounded range (e.g.
 *     ¥2,000–3,500 published by the attraction — variable ≠ necessarily
 *     open-ended). A bounded variable range additionally requires
 *     provenance "verified_source" + sourceUrl + checkedAt (never a
 *     fabricated/legacy bounded guess); reasonCode REQUIRED.
 *   - state === "not_applicable" ⇒ cost not_applicable; reasonCode
 *     REQUIRED (hub_budget_not_applicable / no_single_admission_product /
 *     free_area_with_optional_paid_components).
 *   - state === "unavailable" ⇒ cost unavailable; reasonCode REQUIRED.
 *   - legacy_unverified is NOT a forward admission state — legacy
 *     admission values are authored unavailable
 *     (legacy_provenance_unrecovered) or re-verified.
 *
 * Scaling: values are PER-PERSON; the engine multiplies by partySize.
 */
export interface AdmissionCostFact {
  readonly state: Exclude<BudgetValueState, "legacy_unverified">;
  readonly provenance: BudgetProvenance;
  readonly reasonCode?: BudgetReasonCode;
  readonly cost: DestinationCostFact;
  readonly scope: AdmissionScope;
  readonly basis?: string;
  readonly sourceUrls?: readonly string[];
  readonly checkedAt?: string;
  /**
   * KAI-218A: review cadence in months (default 12). A verified fact whose
   * checkedAt is older than reviewIntervalMonths is review-due — never
   * silently refreshed or discarded.
   */
  readonly reviewIntervalMonths?: number;
  /** Free + optional paid experiences: the OPTIONAL paid components, never
   *  folded into a bounded [0,0]. */
  readonly optionalPaidComponents?: readonly {
    readonly name: string;
    readonly price?: number;
    readonly sourceUrl?: string;
  }[];
}

/**
 * KAI-218A — REQUIRED LOCAL TRANSPORT cost fact.
 *
 * Replaces the semantic role of budgetBreakdown.transport (per-person
 * on-site transit allowance) in canonical affordability. NEVER a generic
 * city allowance: every value must be defensible from the record's own
 * evidence. Numeric fares carry an explicit fareBasis + coverage so the
 * engine scales them canonically and never lets a partial segment behave
 * as the complete required-local-transport component.
 */

/**
 * KAI-219A contract: how a numeric local-transport fare should be scaled.
 *   - one_way               → fare × 2 × partySize (out + back)
 *   - round_trip            → fare × partySize (fare already round-trip)
 *   - required_access_total → fare × partySize (fare IS the total required
 *     access cost for the trip)
 */
export type LocalTransportFareBasis =
  "one_way" | "round_trip" | "required_access_total";

/**
 * KAI-219A contract: how much of the required local access a fare covers.
 *   - all_required_access → the fare covers ALL required on-site access;
 *     may satisfy the local_transport required component.
 *   - segment_only        → the fare covers only a SEGMENT of the required
 *     access; the whole-trip local_transport component stays MISSING — a
 *     segment-only fare can never make a trip cost complete.
 */
export type LocalTransportCoverage = "all_required_access" | "segment_only";

export type LocalTransportAccess =
  | {
      /** Source-backed fare for the actual on-site movement. */
      readonly kind: "verified_required_access";
      readonly access: "rail" | "bus" | "ferry" | "mixed";
      /** Fare envelope [min,max] in the units of fareBasis (per-person). */
      readonly fare: readonly [number, number];
      /** How the fare should be scaled (one-way vs round-trip vs total). */
      readonly fareBasis: LocalTransportFareBasis;
      /** How much required access this fare covers. */
      readonly coverage: LocalTransportCoverage;
      /** Official/operator source URLs. REQUIRED. */
      readonly sourceUrls: readonly string[];
      readonly segmentNotes?: string;
      /**
       * Destination-specific evidence of the required access (which
       * station/stop serves THIS destination, which segments are required).
       * REQUIRED — prevents a generic city allowance from masquerading as a
       * verified fact.
       */
      readonly basis: string;
      readonly checkedAt?: string;
      readonly reviewIntervalMonths?: number;
    }
  | {
      /** KAI-204 bounded local rail envelope — a defensible bounded
       *  estimate, NOT a verified route fare. */
      readonly kind: "bounded_defensible_access";
      readonly access: "rail";
      readonly band: "≤5km" | "≤15km" | "≤30km" | "≤50km";
      readonly fare: readonly [number, number];
      /** How the fare should be scaled (one-way vs round-trip vs total). */
      readonly fareBasis: LocalTransportFareBasis;
      /** How much required access this fare covers. */
      readonly coverage: LocalTransportCoverage;
      readonly distanceKm: number;
      /** KAI-204 operator source URLs. REQUIRED. */
      readonly sourceUrls: readonly string[];
      readonly unmodelledKm?: number;
      readonly checkedAt?: string;
      readonly reviewIntervalMonths?: number;
    }
  | {
      /** Verified walking: practical, evidence-backed walking access. ¥0. */
      readonly kind: "verified_walking";
      /** Evidence that walking is PRACTICAL (grounds pedestrian-only,
       *  station adjacent, official site states walking access). REQUIRED. */
      readonly walkingEvidence: string;
      readonly walkingMinutes?: number;
      /** Official source supporting walking access. */
      readonly sourceUrls?: readonly string[];
      readonly checkedAt?: string;
      readonly reviewIntervalMonths?: number;
    }
  | {
      /** Local transport genuinely not needed (e.g. hub with an
       *  on-site-only plan). */
      readonly kind: "not_applicable";
      readonly reason: string;
    }
  | {
      /** Local transport cost cannot be established. NEVER ¥0, NEVER a
       *  generic city allowance. */
      readonly kind: "unavailable";
      readonly reason:
        | "no_on_site_evidence"
        | "untrusted_legacy_only"
        | "island_no_rail"
        | "corridor_only"
        | "distance_beyond_model"
        | "fare_not_found"
        | "other";
      readonly detail: string;
    };

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
  /**
   * Retained compatibility/group records can remain addressable without
   * competing with canonical recommendation choices. Omitted means eligible.
   */
  recommendationEligible?: boolean;
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
  /** Optional deterministic Wikipedia identity. Search is never used to
   * override these fields; a stale/invalid mapping fails closed. */
  wikipediaTitle?: string;
  wikipediaLanguage?: "en" | "ja";
  wikipediaUrl?: string;
  wikipediaPageId?: number;
  wikidataId?: string;
  relationships?: DestinationRelationships;
  prefecture: string;
  region: string;
  categories: string[];
  heroImage: string;
  description: string;
  highlights: string[];
  /**
   * Budget contract (KAI-89): values are PER-PERSON and OPTIONAL. Absence
   * is the explicit unknown state (budgetMetadata.method "unknown" — never
   * treat missing as free or zero; unknown must remain unknown in price
   * comparisons, ranking, and rendering). Consumers must require finite
   * known values before arithmetic.
   */
  budgetRecommended?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetBreakdown?: {
    transport: number;
    tickets: number;
    food: number;
    cafe: number;
  };
  /**
   * KAI-218A — explicit admission cost fact. When present, this is the
   * AUTHORITATIVE admission truth (the engine prefers it over
   * budgetBreakdown.tickets). budgetBreakdown.tickets degrades to a legacy
   * aggregate estimate.
   */
  admission?: AdmissionCostFact;
  /**
   * KAI-218A — explicit required-local-transport cost fact. When present,
   * this replaces budgetBreakdown.transport in canonical affordability.
   * NEVER a generic city allowance.
   */
  localTransport?: LocalTransportAccess;
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
  walkingMin?: number;
  walkingIntensity?: "low" | "medium" | "high";
  /** Sun/shade splits were batch-template artefacts and are removed as
   *  unsourced (KAI-89): absent = explicit unknown, never a default label. */
  walkingSunMin?: number;
  walkingShadeMin?: number;
  indoorPercent?: number;
  coordinates?: { lat: number; lng: number };
  comfort?: {
    heatTolerance: number;
    rainFriendly: number;
    /** Present only when a walking estimate exists (KAI-89: never
     *  manufactured from a default when walkingMin is unknown). */
    walkingIntensity?: number;
  };
  ratings: Ratings;
  ratingsSchemaVersion?: 2;
  matchScore?: number;
  matchReasons?: string[];
  /**
   * Crowd bands. OPTIONAL since KAI-89: zero runtime consumers exist, and a
   * kind-derived band would be manufactured evidence. Absent value +
   * crowdMetadata.method "unknown" is the explicit neutral state.
   */
  crowd?: {
    weekday: number;
    weekend: number;
    holiday: number;
  };
  /**
   * Experience-season suitability (0-10 per season). Optional since
   * KAI-89 model pass: records without a defensible seasonal signal carry
   * seasonMetadata.method "unknown" (an explicit neutral state, never a
   * fabricated vector). Consumers fall back to the neutral mid-point 5.
   */
  season?: {
    spring: number;
    summer: number;
    autumn: number;
    winter: number;
  };
  bestMonths?: number[];
  bestSeason?: string;
  /**
   * KAI-89 model provenance for derived season state (method "model") or the
   * explicit neutral state (method "unknown").
   */
  seasonMetadata?: {
    method: "manual" | "assisted" | "model" | "unknown";
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
  };
  /**
   * KAI-89 budget provenance: marks budgets derived by the model (method
   * "model") and template budgets deliberately returned to unknown (method
   * "unknown" — the explicit neutral state, not missing data; UNKNOWN IS
   * AUTHORITATIVE: unknown metadata implies no usable numeric budget, so
   * consumers treat it as unknown even if legacy numbers linger). method
   * "manual" marks accepted-debt budgets (verified ticket preserved with
   * legacy components — numbers remain usable, provenance states the fact).
   * KAI-204 phase 3: method "legacy" marks numeric budget values WITHOUT
   * recoverable provenance (historical/template/formula generations). The
   * numbers remain in storage for migration/debugging value but must NOT be
   * consumed as trusted by display, scoring, filtering, or planning —
   * consumers treat "legacy" exactly like "unknown" for trust purposes
   * (STORAGE is separated from TRUST at the semantic boundary).
   *
   * KAI-214 (budget-state taxonomy): `method` is the LEGACY single-axis
   * marker (backward compatible — all existing records keep working). The
   * new OPTIONAL additive fields `state` / `provenance` / `reasonCode`
   * express the permanent multi-axis contract for forward-authored data:
   *   - state: the VALUE state (verified_paid / verified_free /
   *     documented_estimate / variable_price / not_applicable /
   *     unavailable / legacy_unverified)
   *   - provenance: where the value came from (verified_source / model /
   *     legacy / transitional / none)
   *   - reasonCode: stable machine-readable reason for non-numeric states
   * When the new fields are absent, the runtime NORMALIZER derives them
   * deterministically from `method` + numeric fields (see
   * src/shared/services/budget/budgetState.ts). New production data should
   * author `state` explicitly; CI forbids new records that rely on the
   * transitional normalization path.
   */
  budgetMetadata?: {
    method: "model" | "manual" | "unknown" | "legacy";
    state?: BudgetValueState;
    provenance?: BudgetProvenance;
    reasonCode?: BudgetReasonCode;
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
  };
  /**
   * KAI-89 transport provenance: tags legacy static transportOptions minutes
   * as low-confidence fallback (never verified journey facts).
   */
  transportMetadata?: {
    method: "source-verified" | "calculated" | "legacy-fallback" | "unknown";
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
  };
  /**
   * KAI-89 walking provenance: method "model" marks model-derived minutes
   * (pace-converted or walk-share fill; unit is always MINUTES), method
   * "unknown" marks the explicit neutral state.
   */
  walkingMetadata?: {
    method: "manual" | "model" | "unknown";
    unit?: "minutes" | "metres";
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
  };
  /**
   * KAI-89 duration provenance: method "model" marks hub exploration
   * windows / POI kind-band visits derived by the duration model.
   */
  durationMetadata?: {
    method: "manual" | "model" | "unknown";
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
  };
  /**
   * KAI-89 comfort provenance: marks comfort vectors derived by the model
   * (method "model") vs manually reviewed. UI renders model values as
   * estimates, never facts.
   */
  comfortMetadata?: {
    method: "manual" | "model" | "unknown";
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
    /**
     * Field-level ownership (KAI-89): which comfort fields the model actually
     * derived. Absent = the whole vector is model output. FIX_CONTRADICTION
     * corrections derive ONLY walkingIntensity — heatTolerance/rainFriendly
     * remain legacy values, and the UI must not mark them estimated.
     */
    derivedFields?: Array<
      "heatTolerance" | "rainFriendly" | "walkingIntensity"
    >;
  };
  /**
   * KAI-89 crowd provenance: marks crowd band vectors derived by the model.
   * No runtime consumer scores crowd, so derived bands are presentation-only.
   */
  crowdMetadata?: {
    method: "manual" | "model" | "unknown";
    modelVersion?: string;
    confidence?: "high" | "medium" | "low" | "unknown";
    basis?: string;
  };
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
  /**
   * KAI-89 overall-destination score metadata (rubric v2). PERSISTED by the
   * deterministic generator for every record; runtime getScorePresentation
   * reads it (with a computed fallback that must agree — gated). ONE rubric
   * computes the value for verified AND estimated; the state is a
   * provenance/coverage label, never a different formula. States:
   *  - verified  → rubric value with editorial score provenance (date +
   *    authoritative sources, committed verification ledger);
   *  - estimated → rubric value with model provenance (sourceClass "model");
   *  - unavailable → evidence coverage below threshold; value null.
   * Distinct from the legacy ratings vector (ratings.*) and its
   * ratingMetadata confidence, which are a separate evidence family.
   */
  scoreMetadata?: ScoreMetadata;
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
