/**
 * KAI-291B1 — normalized static transit graph contract.
 *
 * Provider-agnostic records that later ODPT and GTFS/GTFS-JP imports both
 * target. This PR is NOT the router: the graph carries static topology only,
 * and nothing here connects to Journey/TripDuration/recommendation.
 *
 * Identity rule (load-bearing): provider identity stays explicit. Internal ids
 * are deterministic, namespaced derivations of `provider + exact provider
 * identity` — never names, never coordinate buckets. Two provider records that
 * look like the same physical station stay distinct unless a deterministic
 * crosswalk explicitly proves equivalence (that crosswalk is later work).
 *
 * Pure types only: no I/O, no clock, no randomness.
 */

/** Providers the normalized model accepts. `odpt` now; `gtfs`/`gtfs-jp` later. */
export type TransitProvider = "odpt" | "gtfs" | "gtfs-jp";

/** How the source dataset was acquired. B1 only produces `fixture`. */
export type TransitSourceType = "fixture" | "data_dump" | "live_api";

/** Stop kinds the model distinguishes. B1 imports stations only. */
export type TransitStopType = "station" | "bus_stop";

/** Route modes. B1 imports rail only. */
export type TransitRouteMode = "rail" | "bus" | "ferry" | "tram" | "other";

/**
 * Compact provenance reference. Every normalized entity carries one: the
 * entity stays traceable to source evidence without duplicating the raw
 * provider record into every entity.
 */
export interface TransitProvenance {
  /** Normalizing provider, e.g. `odpt`. */
  readonly provider: TransitProvider;
  /** Exact provider identity, e.g. `odpt.Station:TokyoMetro.Ginza.Ueno`. */
  readonly providerId: string;
  /** Raw resource family, e.g. `odpt:Station`. */
  readonly sourceResourceType: string;
  /** Dataset/version this entity was imported from. */
  readonly datasetId: string;
  /**
   * Check/retrieval timestamp SUPPLIED as explicit ingestion metadata.
   * Never `Date.now()`: identical inputs must produce identical bytes.
   */
  readonly retrievedAt: string;
}

/** One versioned source dataset the graph was built from. */
export interface TransitDatasetVersion {
  /** Provider that published the dataset. */
  readonly provider: TransitProvider;
  /** Caller-supplied dataset identity, e.g. `odpt-rail-fixture-v1`. */
  readonly datasetId: string;
  /** Acquisition kind. B1: `fixture` (contract validation, not a full import). */
  readonly sourceType: TransitSourceType;
  /**
   * Human/machine descriptor of the source, e.g. the fixture path plus its
   * scope label. Never a credential.
   */
  readonly sourceDescriptor: string;
  /** Explicit ingestion metadata: when the source was retrieved/checked. */
  readonly retrievedAt: string;
  readonly checkedAt: string;
  /** Provider-supplied issue/expiry, when the provider declares them. */
  readonly issuedAt: string | null;
  readonly validUntil: string | null;
  /** Normalized-contract version that produced this dataset. */
  readonly schemaVersion: string;
  /**
   * SHA-256 over the canonical serialization of the normalized entities.
   * Computed AFTER import; identical fixture bytes + identical explicit
   * metadata always yield the identical hash.
   */
  readonly contentHash: string;
}

/** A normalized transit operator. */
export interface TransitOperator {
  /** Deterministic internal id, e.g. `odpt:operator:odpt.Operator:TokyoMetro`. */
  readonly id: string;
  readonly provider: TransitProvider;
  /** Exact provider identity, e.g. `odpt.Operator:TokyoMetro`. */
  readonly providerOperatorId: string;
  /** Localized display names, passed through open-ended (never constrained). */
  readonly names: Readonly<Record<string, string>>;
  readonly provenance: TransitProvenance;
}

/** A normalized stop (station or bus stop). */
export interface TransitStop {
  /** E.g. `odpt:station:odpt.Station:TokyoMetro.Ginza.Ueno`. */
  readonly id: string;
  readonly provider: TransitProvider;
  /** Exact provider identity — the SAME string KAI-291A anchors carry. */
  readonly providerStopId: string;
  readonly stopType: TransitStopType;
  /**
   * Provider coordinates, or null when the provider record legitimately lacks
   * them. Coordinates are never invented.
   */
  readonly coordinates: { readonly lat: number; readonly lng: number } | null;
  /** Internal ids of the stop's operators. */
  readonly operatorIds: readonly string[];
  /** Localized display names, passed through open-ended. */
  readonly names: Readonly<Record<string, string>>;
  /** Provider station code (e.g. `G-16`), when supplied. Not identity. */
  readonly stationCode: string | null;
  readonly provenance: TransitProvenance;
}

/** A normalized route (one provider railway/line). */
export interface TransitRoute {
  /** E.g. `odpt:route:odpt.Railway:TokyoMetro.Ginza`. */
  readonly id: string;
  readonly provider: TransitProvider;
  /** Exact provider identity, e.g. `odpt.Railway:TokyoMetro.Ginza`. */
  readonly providerRouteId: string;
  /** Internal id of the owning operator. */
  readonly operatorId: string;
  readonly mode: TransitRouteMode;
  /** Localized display names, passed through open-ended. */
  readonly names: Readonly<Record<string, string>>;
  /**
   * Provider direction evidence retained for later topology use
   * (`odpt:ascendingRailDirection` / `odpt:descendingRailDirection`).
   */
  readonly ascendingDirectionId: string | null;
  readonly descendingDirectionId: string | null;
  readonly provenance: TransitProvenance;
}

/** One ordered membership of a stop in a route. */
export interface TransitRouteStop {
  readonly routeId: string;
  readonly stopId: string;
  /**
   * Provider ordering evidence (`odpt:index`). Uniqueness per route is
   * validated on import; provider order is preserved, never re-sorted.
   */
  readonly order: number;
  readonly provenance: TransitProvenance;
}

/**
 * A normalized service calendar.
 *
 * ODPT semantics are preserved, not flattened: exact provider identity and
 * the base/specific distinction survive, so later work can resolve base
 * calendars, `Specific.*`-over-base precedence, Holiday-over-Saturday
 * precedence, and multiple Specific calendars merging.
 */
export interface TransitServiceCalendar {
  /** E.g. `odpt:calendar:odpt.Calendar:Weekday`. */
  readonly id: string;
  readonly provider: TransitProvider;
  /** Exact provider identity, e.g. `odpt.Calendar:SaturdayHoliday`. */
  readonly providerCalendarId: string;
  /**
   * `specific` for `odpt.Calendar:Specific.*` (outranks base), else `base`.
   * Derived from provider identity by the provider's own naming convention.
   */
  readonly calendarKind: "base" | "specific";
  /** Raw `odpt:day` values, passed through verbatim. */
  readonly rawDay: readonly string[];
  /** Raw `odpt:duration` value, passed through verbatim. */
  readonly rawDuration: string | null;
  readonly provenance: TransitProvenance;
}

/** A provider-defined transfer. B1 imports none; the container is reserved. */
export interface TransitTransfer {
  readonly id: string;
  readonly provider: TransitProvider;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly provenance: TransitProvenance;
}

/**
 * Fare metadata. Unknown stays unknown: a missing fare is null, NEVER 0.
 * B1 imports no fares; the container is reserved for KAI-291D.
 */
export interface TransitFareMetadata {
  readonly id: string;
  readonly provider: TransitProvider;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly provenance: TransitProvenance;
}

/** The normalized static transit graph: topology + reserved future slots. */
export interface NormalizedTransitGraph {
  readonly datasetVersion: TransitDatasetVersion;
  readonly operators: readonly TransitOperator[];
  readonly stops: readonly TransitStop[];
  readonly routes: readonly TransitRoute[];
  /** Ordered route memberships; provider order preserved per route. */
  readonly routeStops: readonly TransitRouteStop[];
  readonly calendars: readonly TransitServiceCalendar[];
  /** Reserved: provider-defined transfers only (never proximity-inferred). */
  readonly transfers: readonly TransitTransfer[];
  /** Reserved: scheduled services / stop times (KAI-291D). */
  readonly scheduledServices: readonly unknown[];
  /** Reserved: fare metadata (KAI-291D). Unknown-safe, never defaulted. */
  readonly fares: readonly TransitFareMetadata[];
}

/** Coverage states for one provider/operator/mode scope. */
export type TransitCoverageState =
  | "imported"
  | "partial"
  | "unsupported"
  | "ambiguous_identity"
  | "missing_timetable"
  | "missing_fare"
  | "not_imported_in_this_slice"
  | "not_evaluated";

/** Machine-readable coverage for one scope of the normalized graph. */
export interface TransitCoverageEntry {
  readonly provider: TransitProvider;
  /** Exact provider operator identity. */
  readonly operator: string;
  readonly mode: TransitRouteMode;
  readonly topology: TransitCoverageState;
  readonly timetable: TransitCoverageState;
  readonly fare: TransitCoverageState;
  readonly realtime: TransitCoverageState;
  readonly datasetId: string;
  /** Machine-readable reason when a state is not `imported`. */
  readonly notes: readonly string[];
}

/** Coverage registry foundation: one entry per imported scope. */
export interface TransitCoverageReport {
  readonly datasetId: string;
  readonly schemaVersion: string;
  readonly entries: readonly TransitCoverageEntry[];
}
