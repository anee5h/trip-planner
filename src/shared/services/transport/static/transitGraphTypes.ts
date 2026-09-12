/**
 * KAI-291B1 — normalized static transit graph contract.
 *
 * Provider-agnostic records that ODPT and GTFS/GTFS-JP imports both
 * target. This PR is NOT the router: the graph carries static topology only,
 * and nothing here connects to Journey/TripDuration/recommendation.
 *
 * Identity rule (load-bearing): provider identity stays explicit. Internal ids
 * are deterministic derivations of `provider + identityNamespace + entityKind
 * + exact provider identity` — never names, never coordinate buckets. The
 * namespace is the stable feed scope (`odpt` for the single ODPT feed, a feed
 * id for a GTFS feed): stable across refreshes, distinct from any snapshot or
 * version id. Two provider records that look like the same physical station
 * stay distinct unless a deterministic crosswalk explicitly proves equivalence
 * (that crosswalk is later work).
 *
 * Pure types only: no I/O, no clock, no randomness.
 */

/** Providers the normalized model accepts. */
export type TransitProvider = "odpt" | "gtfs" | "gtfs-jp";

/** How the source dataset was acquired. */
export type TransitSourceType = "fixture" | "data_dump" | "live_api";

/** Stop kinds the model distinguishes. */
export type TransitStopType = "station" | "bus_stop" | "platform";

/** Route modes represented by the supported provider adapters. */
export type TransitRouteMode = "rail" | "bus" | "ferry" | "tram" | "other";

/**
 * Compact provenance reference. Every normalized entity carries one: the
 * entity stays traceable to source evidence without duplicating the raw
 * provider record into every entity.
 */
export interface TransitProvenance {
  /** Normalizing provider, e.g. `odpt`. */
  readonly provider: TransitProvider;
  /**
   * Stable identity namespace / feed scope, e.g. `odpt` for the single ODPT
   * feed, or a GTFS feed id. Stable across refreshes of the same
   * logical dataset — NEVER a per-refresh snapshot id or timestamp — and
   * part of every internal id, so `stop_id=100` in feed A and feed B can
   * never collide.
   */
  readonly identityNamespace: string;
  /** Exact provider identity, e.g. `odpt.Station:TokyoMetro.Ginza.Ueno`. */
  readonly providerId: string;
  /** Raw resource family, e.g. `odpt:Station`. */
  readonly sourceResourceType: string;
  /** Dataset/version this entity was imported from. */
  readonly datasetId: string;
  /**
   * Check/retrieval timestamp SUPPLIED as explicit ingestion metadata.
   * Never `Date.now()`: identical inputs must produce identical bytes.
   * Observation metadata only — excluded from the content hash.
   */
  readonly retrievedAt: string;
  /** Explicit evidence-check timestamp; optional for legacy B1 records. */
  readonly checkedAt?: string;
}

/** One versioned source dataset the graph was built from. */
export interface TransitDatasetVersion {
  /** Provider that published the dataset. */
  readonly provider: TransitProvider;
  /** Caller-supplied dataset identity, e.g. `odpt-rail-fixture-v1`. */
  readonly datasetId: string;
  /** Acquisition kind for this static source import. */
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
  /** Small publisher identity from feed_info.txt, when supplied. */
  readonly publisher?: {
    readonly name: string;
    readonly url: string | null;
  };
  /** Normalized-contract version that produced this dataset. */
  readonly schemaVersion: string;
  /**
   * Declared source completeness (explicit ingestion metadata). A clean
   * subset import stays `fixture_subset`/`bounded_subset` no matter how
   * well it parses — only a validated completeness-oriented dump earns
   * `complete_provider_dump`.
   */
  readonly completeness: TransitDatasetCompleteness;
  /**
   * SHA-256 over the canonical serialization of the normalized SEMANTIC
   * content. Volatile observation metadata (retrievedAt, checkedAt,
   * per-refresh dataset id, source descriptor) is excluded: identical
   * provider content retrieved tomorrow hashes identically, which is what
   * makes B2 refresh/no-op detection possible. Stable identity scope and
   * provider identities stay represented.
   */
  readonly contentHash: string;
}

/** A normalized transit operator. */
export interface TransitOperator {
  /** Deterministic internal id, e.g. `odpt:operator:odpt:odpt.Operator:TokyoMetro`. */
  readonly id: string;
  readonly provider: TransitProvider;
  /** Exact provider identity, e.g. `odpt.Operator:TokyoMetro`. */
  readonly providerOperatorId: string;
  /** Localized display names, passed through open-ended (never constrained). */
  readonly names: Readonly<Record<string, string>>;
  readonly provenance: TransitProvenance;
}

/** A normalized stop (station, bus stop, or platform). */
export interface TransitStop {
  /**
   * E.g. `odpt:stop:odpt:odpt.Station:TokyoMetro.Ginza.Ueno`
   * (`provider:stop:identityNamespace:providerId`). The subtype lives in
   * `stopType`, never in the id namespace. The authoritative provider id is
   * the `providerStopId` field — never recover it by stripping prefixes.
   */
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
  /** Provider-specific stop semantics, when the source exposes them. */
  readonly sourceSemantics?: TransitStopSourceSemantics;
  readonly provenance: TransitProvenance;
}

/** A normalized route (one provider railway/line). */
export interface TransitRoute {
  /** E.g. `odpt:route:odpt:odpt.Railway:TokyoMetro.Ginza`. */
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
   * Provider-specific semantics that have no generic normalized form.
   * The generic core must never force a future provider to manufacture
   * ODPT concepts; each provider adds its own branch later.
   */
  readonly sourceSemantics: TransitRouteSourceSemantics;
  readonly provenance: TransitProvenance;
}

/** Provider-specific route semantics. Extended with a new branch per provider. */
export type TransitRouteSourceSemantics =
  | OdptRouteSourceSemantics
  | GtfsRouteSourceSemantics
  | GtfsJpRouteSourceSemantics;

/**
 * ODPT route semantics retained for later topology/timetable use
 * (`odpt:ascendingRailDirection` / `odpt:descendingRailDirection`).
 */
export interface OdptRouteSourceSemantics {
  readonly provider: "odpt";
  readonly ascendingDirectionId: string | null;
  readonly descendingDirectionId: string | null;
}

/** Compact evidence retained from one ordered GTFS route pattern. */
export interface GtfsRoutePatternSourceSemantics {
  readonly patternId: string;
  readonly tripIds: readonly string[];
  readonly serviceIds: readonly string[];
}

/** Standard GTFS route fields that have no generic normalized equivalent. */
export interface GtfsRouteSourceSemantics {
  readonly provider: "gtfs";
  readonly routeType: number;
  readonly agencyId: string | null;
  readonly shortName: string | null;
  readonly longName: string | null;
  readonly routeColor: string | null;
  readonly textColor: string | null;
  readonly patterns: readonly GtfsRoutePatternSourceSemantics[];
}

/** GTFS-JP route evidence, including its route update extension. */
export interface GtfsJpRouteSourceSemantics {
  readonly provider: "gtfs-jp";
  readonly routeType: number;
  readonly agencyId: string | null;
  readonly shortName: string | null;
  readonly longName: string | null;
  readonly routeColor: string | null;
  readonly textColor: string | null;
  readonly routeUpdateDate: string | null;
  readonly patterns: readonly GtfsRoutePatternSourceSemantics[];
}

/** Provider-specific stop fields needed to preserve GTFS location semantics. */
export type TransitStopSourceSemantics =
  GtfsStopSourceSemantics | GtfsJpStopSourceSemantics;

export interface GtfsStopSourceSemantics {
  readonly provider: "gtfs";
  readonly locationType: number;
  readonly parentStation: string | null;
  readonly platformCode: string | null;
}

export interface GtfsJpStopSourceSemantics {
  readonly provider: "gtfs-jp";
  readonly locationType: number;
  readonly parentStation: string | null;
  readonly platformCode: string | null;
}

/** One ordered membership of a stop in a route. */
export interface TransitRouteStop {
  readonly routeId: string;
  readonly stopId: string;
  /** Stable ordered-pattern discriminator for feeds with route variants. */
  readonly patternId?: string;
  /**
   * Provider ordering evidence (`odpt:index` / GTFS `stop_sequence`).
   * Uniqueness per route and optional pattern is validated on import; provider
   * order is preserved, never re-sorted.
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
  /** E.g. `odpt:calendar:odpt:odpt.Calendar:Weekday`. */
  readonly id: string;
  readonly provider: TransitProvider;
  /** Exact provider identity, e.g. `odpt.Calendar:SaturdayHoliday`. */
  readonly providerCalendarId: string;
  /**
   * Provider-specific calendar semantics. Raw values pass through verbatim
   * so later work can resolve base calendars, Specific-over-base precedence,
   * Holiday-over-Saturday precedence, and multiple Specifics merging.
   * Calendar "kind" is provider semantics (ODPT base/specific), NOT a
   * generic normalized concept — GTFS must never manufacture one.
   */
  readonly sourceSemantics: TransitCalendarSourceSemantics;
  readonly provenance: TransitProvenance;
}

/** Provider-specific calendar semantics. Extended per provider later. */
export type TransitCalendarSourceSemantics = OdptCalendarSourceSemantics;

/**
 * ODPT calendar semantics: base/specific kind plus raw `odpt:day` /
 * `odpt:duration`, verbatim.
 */
export interface OdptCalendarSourceSemantics {
  readonly provider: "odpt";
  readonly kind: "base" | "specific";
  readonly day: readonly string[];
  readonly duration: string | null;
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
  /** Reserved: fare metadata (KAI-291D). Unknown-safe, never defaulted. */
  readonly fares: readonly TransitFareMetadata[];
}

/**
 * How completely the source dataset covers its provider scope.
 * Supplied as explicit ingestion metadata — never inferred from a
 * successful parse, since a clean subset import is not full coverage.
 */
export type TransitDatasetCompleteness =
  "fixture_subset" | "bounded_subset" | "complete_provider_dump" | "unknown";

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
