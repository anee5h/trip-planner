/**
 * KAI-289 — ODPT provider contract.
 *
 * ODPT (Public Transportation Open Data Center) is introduced as a first-class
 * *evidence* provider behind Meguruto's existing canonical transport boundary.
 * Authoritative API contract: ODPT API Specification v4.16 (2026-09-03).
 *
 * Scope guard for this ticket: these types describe static ODPT facts
 * (station / railway / fare / exact datapoint). They deliberately do NOT
 * introduce a Journey, timetable, transfer or routing model — timetable-backed
 * journey evidence and journey-level station matching belong to KAI-290+.
 *
 * ODPT search responses are always arrays of objects, where `[]` is a
 * successful "no matching records" answer (§1.3.1). That is why results carry
 * an explicit `outcome` discriminator instead of a boolean.
 */

/** Provable origin of one ODPT fact. */
export interface OdptProvenance {
  readonly provider: "odpt";
  /** Stable ODPT-facing identity: `owl:sameAs`. */
  readonly providerId: string | null;
  /** ucode (`@id`), retained alongside `owl:sameAs` rather than replacing it. */
  readonly ucode: string | null;
  /** `dc:date` — provider data generation timestamp. */
  readonly generatedAt: string | null;
  /** `dct:issued` — fare or schedule revision date. */
  readonly issuedAt: string | null;
  /** `dct:valid` — provider data guarantee period. */
  readonly validUntil: string | null;
  /** When Meguruto fetched the record. */
  readonly fetchedAt: string;
  /** ODPT resource the record came from, e.g. `odpt:Station`. */
  readonly sourceResource: string;
  /**
   * Provider URL with the credential query parameter removed. Never contains
   * `acl:consumerKey`.
   */
  readonly sourceUrl: string;
  /**
   * Always `"unknown"`: ODPT silently truncates results at a system upper
   * limit, so a response is never evidence of complete provider coverage
   * (API v4.16 §1.3.1).
   */
  readonly coverage: "unknown";
}

export interface OdptStation {
  /** ODPT-facing stable identity (`owl:sameAs`), not the display name. */
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  /** `dc:title` (Japanese name). */
  readonly title: string | null;
  /** `odpt:stationTitle` multilingual name. */
  readonly stationTitle: Record<string, string> | null;
  readonly operator: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly railway: string | null;
  readonly railwayTitle: Record<string, string> | null;
  /** `odpt:stationCode`, e.g. `JY01`. */
  readonly stationCode: string | null;
  /** `geo:lat` / `geo:long` (WGS84), when the provider supplies them. */
  readonly coordinates: { readonly lat: number; readonly lng: number } | null;
  /**
   * Transfer evidence only — connecting lines/stations do not prove a
   * transfer duration or a feasible transfer.
   */
  readonly connectingRailway: readonly string[];
  readonly connectingStation: readonly string[];
  readonly date: string | null;
  readonly validUntil: string | null;
  readonly provenance: OdptProvenance;
}

export interface OdptStationOrderEntry {
  /** `odpt:index`. */
  readonly index: number | null;
  /** `odpt:station` — stable odpt:Station identity. */
  readonly station: string;
  readonly stationTitle: Record<string, string> | null;
}

export interface OdptRailway {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly title: string | null;
  readonly railwayTitle: Record<string, string> | null;
  readonly kana: string | null;
  readonly operator: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly lineCode: string | null;
  readonly color: string | null;
  /** Ascending direction of `odpt:stationOrder` (`odpt:RailDirection` id). */
  readonly ascendingRailDirection: string | null;
  readonly descendingRailDirection: string | null;
  /**
   * Provider station ordering, preserved exactly as supplied (never re-sorted)
   * with stable station identities.
   */
  readonly stationOrder: readonly OdptStationOrderEntry[];
  readonly date: string | null;
  readonly issuedAt: string | null;
  readonly validUntil: string | null;
  readonly provenance: OdptProvenance;
}

export interface OdptRailwayFare {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly operator: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly fromStation: string;
  readonly toStation: string;
  /** `odpt:ticketFare` — required by the specification on a fare record. */
  readonly ticketFare: number;
  /** `odpt:icCardFare` — null when the provider does not supply it. */
  readonly icCardFare: number | null;
  readonly childTicketFare: number | null;
  readonly childIcCardFare: number | null;
  /** Transit stations used for the fare calculation. */
  readonly viaStation: readonly string[];
  /** Transit lines used for the fare calculation. */
  readonly viaRailway: readonly string[];
  readonly ticketType: string | null;
  readonly paymentMethod: readonly string[];
  readonly date: string | null;
  /** `dct:issued` — fare revision date. */
  readonly issuedAt: string | null;
  readonly validUntil: string | null;
  readonly provenance: OdptProvenance;
}

/** Exactly one ODPT resource, acquired by ucode or one-to-one `owl:sameAs`. */
export interface OdptDatapoint {
  readonly id: string;
  /** `owl:sameAs` when the provider supplies it; a ucode-only resource has none. */
  readonly sameAs: string | null;
  readonly ucode: string | null;
  /** Declared `@type` of the acquired resource. */
  readonly type: string | null;
  readonly date: string | null;
  readonly validUntil: string | null;
  readonly provenance: OdptProvenance;
}

/** A calendar's service classification, as an ODPT identity (§2.3.1). Retained
 * raw on purpose: `odpt.Calendar:Specific.*` participates in precedence rules
 * that a weekday/saturday/holiday enum cannot express. */
export interface OdptCalendar {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly title: string | null;
  readonly calendarTitle: Record<string, string> | null;
  /** ISO8601 (YYYY-MM-DD) dates on which this calendar explicitly applies. */
  readonly day: readonly string[];
  /** ISO8601 validity period, `start/end`, when supplied. */
  readonly duration: string | null;
  /** True for `odpt.Calendar:Specific.*` — these outrank base calendars. */
  readonly isSpecific: boolean;
  readonly date: string | null;
  readonly provenance: OdptProvenance;
}

export interface OdptOperator {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly title: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly date: string | null;
  readonly provenance: OdptProvenance;
}

export interface OdptRailDirection {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly title: string | null;
  readonly railDirectionTitle: Record<string, string> | null;
  readonly date: string | null;
  readonly provenance: OdptProvenance;
}

export interface OdptTrainType {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly operator: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly title: string | null;
  readonly trainTypeTitle: Record<string, string> | null;
  readonly date: string | null;
  readonly provenance: OdptProvenance;
}

/**
 * One entry of `odpt:stationTimetableObject` (§3.3.6): a train's arrival and/or
 * departure at the owning station, with that train's wider service context.
 * This is not an end-to-end journey.
 */
export interface OdptStationTimetableObject {
  readonly arrivalTime: string | null;
  readonly departureTime: string | null;
  readonly originStation: readonly string[];
  readonly destinationStation: readonly string[];
  readonly viaStation: readonly string[];
  readonly viaRailway: readonly string[];
  readonly train: string | null;
  readonly trainNumber: string | null;
  readonly trainType: string | null;
  readonly trainName: readonly Record<string, string>[];
  readonly trainOwner: string | null;
  /** Documented as omitted when not the last service, so absence means false. */
  readonly isLast: boolean;
  readonly isOrigin: boolean;
  readonly platformNumber: string | null;
  readonly platformName: Record<string, string> | null;
  readonly carComposition: number | null;
  readonly note: Record<string, string> | null;
}

/**
 * Departure/arrival evidence at ONE station. Deliberately not a journey: the
 * specification's `odpt:stationTimetableObject` ordering is not a stop-by-stop
 * path, so a duration cannot be derived from this record alone.
 */
export interface OdptStationTimetable {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly operator: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly railway: string | null;
  readonly railwayTitle: Record<string, string> | null;
  readonly station: string | null;
  readonly stationTitle: Record<string, string> | null;
  readonly railDirection: string | null;
  readonly railDirectionTitle: Record<string, string> | null;
  readonly calendar: string | null;
  readonly objects: readonly OdptStationTimetableObject[];
  readonly objectCount: number;
  readonly note: Record<string, string> | null;
  readonly date: string | null;
  /** `dct:issued` — schedule revision date. */
  readonly issuedAt: string | null;
  readonly validUntil: string | null;
  readonly provenance: OdptProvenance;
}

/**
 * One entry of `odpt:trainTimetableObject` (§3.3.9): an ordered stop with its
 * arrival/departure station and time.
 */
export interface OdptTrainTimetableObject {
  readonly arrivalTime: string | null;
  readonly arrivalStation: string | null;
  readonly departureTime: string | null;
  readonly departureStation: string | null;
  readonly platformNumber: string | null;
  readonly platformName: Record<string, string> | null;
  readonly note: Record<string, string> | null;
}

/**
 * The stronger primitive for eventual journey reconstruction: ordered
 * stop-by-stop arrival/departure station/time pairs. Still NOT assembled into a
 * Journey here.
 */
export interface OdptTrainTimetable {
  readonly id: string;
  readonly sameAs: string;
  readonly ucode: string | null;
  readonly operator: string | null;
  readonly operatorTitle: Record<string, string> | null;
  readonly railway: string | null;
  readonly railwayTitle: Record<string, string> | null;
  readonly railDirection: string | null;
  readonly calendar: string | null;
  readonly train: string | null;
  readonly trainNumber: string;
  readonly trainType: string | null;
  readonly trainName: readonly Record<string, string>[];
  readonly trainOwner: string | null;
  readonly originStation: readonly string[];
  readonly destinationStation: readonly string[];
  readonly viaStation: readonly string[];
  readonly viaRailway: readonly string[];
  /**
   * Explicit split-service links. These are the ONLY evidence that two timetable
   * records continue the same train; matching numbers, names or times are not.
   */
  readonly previousTrainTimetable: readonly string[];
  readonly nextTrainTimetable: readonly string[];
  readonly objects: readonly OdptTrainTimetableObject[];
  readonly objectCount: number;
  /**
   * `true` — an extra fee applies, so a base RailwayFare is NOT the complete
   * price. `false` — known not to apply. `null` — not supplied, i.e. unknown.
   */
  readonly needExtraFee: boolean | null;
  readonly note: Record<string, string> | null;
  readonly date: string | null;
  readonly issuedAt: string | null;
  readonly validUntil: string | null;
  readonly provenance: OdptProvenance;
}

/**
 * A datapoint payload may be any data-dump type (§1.6). Known types are fully
 * normalized; an unmodelled `@type` returns the generic `OdptDatapoint`
 * envelope instead of being forced into a shape it does not have.
 */
export type OdptDatapointResource =
  | OdptStation
  | OdptRailway
  | OdptRailwayFare
  | OdptCalendar
  | OdptOperator
  | OdptRailDirection
  | OdptTrainType
  | OdptStationTimetable
  | OdptTrainTimetable
  | OdptDatapoint;

/** Allow-listed operations. There is no generic ODPT pass-through. */
export type OdptOperation =
  | "nearby_stations"
  | "station"
  | "railway"
  | "railway_fare"
  | "datapoint"
  // KAI-290 reference/enumeration resources
  | "calendar"
  | "operator"
  | "train_type"
  | "rail_direction"
  // KAI-290 timetable resources (always require a narrowing filter)
  | "station_timetable"
  | "train_timetable";

/**
 * `records` — a successful ODPT request; `records` may legitimately be empty.
 * `no_data` — documented HTTP 404 ("no applicable data").
 * `error`   — the request failed or the payload was not valid ODPT data.
 */
export type OdptOutcome = "records" | "no_data" | "error";

export type OdptErrorCode =
  | "invalid_request"
  | "provider_not_configured"
  | "provider_endpoint_not_allowed"
  | "provider_invalid_request"
  | "provider_authentication_error"
  | "provider_authorization_error"
  | "provider_method_not_allowed"
  | "provider_internal_error"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_response_too_large"
  | "malformed_provider_json"
  | "malformed_provider_record"
  | "invalid_provider_response"
  /** KAI-290: a timetable record without its required timetable-object list. */
  | "malformed_timetable_objects"
  /** KAI-290: a TrainTimetable record missing its required `odpt:trainNumber`. */
  | "timetable_without_train_number"
  /** KAI-290: a broad timetable/search query was rejected as unsafely wide. */
  | "unfiltered_search_not_allowed"
  /**
   * Server-side request-construction failure: an operation declared a query
   * input that has no documented ODPT parameter name. Fails closed without
   * issuing a provider request.
   */
  | "provider_request_config_error"
  | "network_error"
  | "rate_limited"
  | "method_not_allowed"
  | "no_applicable_data"
  /**
   * KAI-290 PR 2B: Meguruto's own provider-request budget refused this fetch.
   * Distinct from `no_data` (the provider answered "nothing matches"), from an
   * empty result (the provider answered successfully with `[]`), and from a
   * provider failure (the provider was never contacted).
   */
  | "budget_exhausted"
  /**
   * ODPT documents HTTP 402 (billing required) on exact datapoint acquisition.
   * Under Meguruto's hard-¥0 rule this is a terminal unsupported state: it is
   * never retried, never billed, and never presented as transport
   * unavailability.
   */
  | "billing_required";

export interface OdptResult<T> {
  readonly provider: "odpt";
  readonly operation: string;
  readonly outcome: OdptOutcome;
  /** Normalized records; empty for `no_data` and `error`. */
  readonly records: readonly T[];
  readonly recordCount: number;
  /** Present when `outcome` is not `records`. */
  readonly errorCode?: OdptErrorCode | string;
  /** Non-array success payload, reported by structural type only. */
  readonly retrievedAt: string;
  readonly sourceResource: string;
  /** Sanitized provider URL — never contains `acl:consumerKey`. */
  readonly sourceUrl: string;
  readonly normalization: string;
}

/**
 * Geographic station discovery. Returns ODPT station *candidates*; it does not
 * assert that a candidate is the correct origin/destination station for a
 * journey — that matching belongs to KAI-290.
 */
export interface OdptNearbyStationsInput {
  readonly lat: number;
  readonly lon: number;
  /** Metres. ODPT permits 0–4,000; the server boundary enforces the bound. */
  readonly radius: number;
}

export interface OdptStationQuery {
  readonly sameAs?: string;
  readonly title?: string;
  readonly operator?: string;
  readonly railway?: string;
  readonly stationCode?: string;
}

export interface OdptRailwayQuery {
  readonly sameAs?: string;
  readonly title?: string;
  readonly operator?: string;
  readonly lineCode?: string;
}

/** Fares are queried by station identity, never by station name. */
export interface OdptRailwayFareQuery {
  readonly fromStation: string;
  readonly toStation: string;
  readonly operator?: string;
}

export interface OdptDatapointQuery {
  /** ucode (`urn:ucode:_…`) or one-to-one `owl:sameAs` value. */
  readonly dataUri: string;
}

/** KAI-290: reference/enumeration queries. A filter is optional but narrows. */
export interface OdptCalendarQuery {
  readonly sameAs?: string;
}

export interface OdptOperatorQuery {
  readonly sameAs?: string;
}

export interface OdptTrainTypeQuery {
  readonly sameAs?: string;
  readonly operator?: string;
}

export interface OdptRailDirectionQuery {
  readonly sameAs?: string;
  readonly operator?: string;
}

/**
 * KAI-290: station timetable query. At least one narrowing filter is REQUIRED —
 * a broad timetable request is rejected rather than issued.
 */
export interface OdptStationTimetableQuery {
  readonly sameAs?: string;
  readonly station?: string;
  readonly railway?: string;
  readonly operator?: string;
  readonly railDirection?: string;
  readonly calendar?: string;
  /** `dc:date` — acquire the timetable for one specific date. */
  readonly date?: string;
}

/**
 * KAI-290: train timetable query. At least one narrowing filter is REQUIRED.
 * Note the specification does not document an `odpt:station` filter here.
 */
export interface OdptTrainTimetableQuery {
  readonly sameAs?: string;
  readonly trainNumber?: string;
  readonly railway?: string;
  readonly operator?: string;
  readonly trainType?: string;
  readonly train?: string;
  readonly calendar?: string;
}

export interface OdptProvider {
  nearbyStations(
    input: OdptNearbyStationsInput,
  ): Promise<OdptResult<OdptStation>>;
  station(input: OdptStationQuery): Promise<OdptResult<OdptStation>>;
  railway(input: OdptRailwayQuery): Promise<OdptResult<OdptRailway>>;
  railwayFare(
    input: OdptRailwayFareQuery,
  ): Promise<OdptResult<OdptRailwayFare>>;
  datapoint(
    input: OdptDatapointQuery,
  ): Promise<OdptResult<OdptDatapointResource>>;
  // KAI-290
  calendar(input?: OdptCalendarQuery): Promise<OdptResult<OdptCalendar>>;
  operator(input?: OdptOperatorQuery): Promise<OdptResult<OdptOperator>>;
  trainType(input: OdptTrainTypeQuery): Promise<OdptResult<OdptTrainType>>;
  railDirection(
    input: OdptRailDirectionQuery,
  ): Promise<OdptResult<OdptRailDirection>>;
  stationTimetable(
    input: OdptStationTimetableQuery,
  ): Promise<OdptResult<OdptStationTimetable>>;
  trainTimetable(
    input: OdptTrainTimetableQuery,
  ): Promise<OdptResult<OdptTrainTimetable>>;
}

/** Result discriminator helpers shared by consumers. */
export function isOdptFailure<T>(
  result: OdptResult<T>,
): result is OdptResult<T> & { outcome: "error" } {
  return result.outcome === "error";
}

/**
 * True only when the provider actually returned records. An empty successful
 * result and a 404 both mean "no evidence" — never "no transport exists".
 */
export function hasOdptRecords<T>(
  result: OdptResult<T>,
): result is OdptResult<T> & { outcome: "records"; records: readonly T[] } {
  return result.outcome === "records" && result.recordCount > 0;
}
