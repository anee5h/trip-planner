/**
 * KAI-290 PR 2C — PURE ODPT direct-journey derivation (no I/O).
 *
 * This module is the load-bearing correctness seam for the first
 * timetable-backed Journey primitive. It turns ONE exact `odpt:TrainTimetable`
 * record — or an explicitly linked split chain of them — into a canonical
 * Journey, but only when a direct station-to-station service is *provable* from
 * the provider's own ordered stop sequence.
 *
 * Boundary with the rest of the app (deliberate, and asserted by tests):
 *
 * - It performs NO I/O and reads NO clock. Every derived value comes from its
 *   inputs, so a given input always yields the same output.
 * - It is NOT wired into any production transport path in this PR. It is a
 *   callable capability; a later PR benchmarks it and decides precedence.
 * - It reuses `odptChronology` (service-day chronology, split-pair validation)
 *   and the canonical Journey contract. It does not re-implement either.
 *
 * ─── What a "verified" duration means here ───────────────────────────────────
 *
 * `duration.minutes` is ON-TRAIN SCHEDULED TIME: the origin's scheduled
 * DEPARTURE to the destination's scheduled ARRIVAL, both read from the same
 * proven stop sequence.
 *
 * It deliberately does NOT include, and must never be presented as:
 *
 *   - home/POI access to or from either station,
 *   - waiting before the scheduled departure,
 *   - any transfer, walking or feeder leg,
 *   - disruption delay, crowding or ticket purchase.
 *
 * It is NOT a door-to-door travel time. This primitive proves exactly
 * `exact ODPT station -> exact ODPT station`; that is why the canonical Journey
 * it emits may carry `scope: "complete_journey"` — complete *for that
 * explicitly station-to-station contract*, not for a user's home-to-POI trip.
 *
 * ─── Why the checks are strict ───────────────────────────────────────────────
 *
 * 1. `odpt:StationTimetable` ordering is NOT a route. A StationTimetable lists
 *    many trains at ONE station, so subtracting its clock times would fabricate
 *    a path. Only `odpt:TrainTimetable` carries an ordered stop sequence, and
 *    only that sequence can prove an end-to-end duration.
 * 2. Exact ODPT station identities are compared — never names, never geographic
 *    proximity, never "similar-looking" ids.
 * 3. Duplicate/looping visits to the origin or destination can produce several
 *    plausible ordered pairs, and the record does not say which one is meant.
 *    That is `ambiguous_stop_pair`, not a guess. This primitive prefers "no
 *    verified Journey" to an invented one.
 * 4. A split continuation is joined ONLY through the provider's explicit
 *    `odpt:nextTrainTimetable` / `odpt:previousTrainTimetable` links AND the
 *    existing compatibility check. Matching train numbers, names, operators,
 *    railways, times or terminals are explicitly NOT evidence of continuation.
 */

import type {
  Journey,
  JourneyEndpoint,
  JourneyLeg,
  JourneyProvenance,
} from "@/shared/types/journey";
import { journeyHandoffCapabilityForMode } from "./JourneyHandoff";
import {
  buildServiceChronology,
  parseClockMinutes,
  validateSplitTimetablePair,
  type ServiceTimeInput,
} from "./odptChronology";
import type {
  OdptStation,
  OdptTrainTimetable,
  OdptTrainTimetableObject,
} from "./OdptProvider";

/**
 * Pilot operator set for the timetable-backed primitive, declared once.
 *
 * Measured basis (committed artifact `qa/kai-290/odpt-coverage.json`): in the
 * bounded authenticated production audit, TokyoMetro and Toei returned
 * StationTimetable / TrainTimetable records, while JR-East returned *successful
 * empty* results across every sampled station and railway. JR-East is therefore
 * outside this pilot and this module fails closed for it — it must never fall
 * through to another operator's data.
 *
 * This is a scope statement about the audited corpus, NOT a claim that JR-East
 * has no timetables anywhere.
 */
export const ODPT_TIMETABLE_PILOT_OPERATORS: readonly string[] = Object.freeze([
  "odpt.Operator:TokyoMetro",
  "odpt.Operator:Toei",
]);

/**
 * Widest permitted candidate-discovery window, in minutes.
 *
 * A bounded window is mandatory: scanning a whole service day would fan out
 * across an unbounded number of exact train lookups. Cross-midnight search
 * windows (e.g. 23:00 -> 01:00) are deliberately NOT supported in this PR —
 * how such a window should map across service dates is unspecified, so it fails
 * closed instead of being guessed. A *TrainTimetable* may still cross midnight;
 * that is a different concern, handled by `odptChronology`'s 23->0 rule.
 */
export const ODPT_DEPARTURE_WINDOW_MAX_MINUTES = 3 * 60;

/**
 * Longest split chain this primitive will join. The measured pilot case returns
 * at most two TrainTimetable records for one exact train identity; anything
 * longer is out of scope and fails closed rather than inviting graph traversal.
 */
export const ODPT_DIRECT_JOURNEY_MAX_CHAIN_RECORDS = 2;

/** `source` recorded on the derived Journey's duration and provenance. */
export const ODPT_DIRECT_JOURNEY_SOURCE = "odpt_train_timetable";

/**
 * The station subset this module needs: an already-resolved exact ODPT station
 * record. Station *resolution* is a separate, already-built concern
 * (`odptStationIdentity`); this module never guesses an identity from a name,
 * a coordinate or a fuzzy match.
 */
export type OdptDirectJourneyStation = Pick<
  OdptStation,
  "sameAs" | "id" | "operator" | "title" | "stationTitle" | "coordinates"
>;

export interface OdptDirectJourneyBuildInput {
  /**
   * Timetable records for ONE service, as returned for one exact train
   * identity. One record is the ordinary case; two records are a possible split
   * service and are joined only if the provider explicitly links them.
   */
  readonly records: readonly OdptTrainTimetable[];
  readonly originStation: OdptDirectJourneyStation;
  readonly destinationStation: OdptDirectJourneyStation;
  /** Echoed into evidence for auditability; validated when supplied. */
  readonly serviceDate?: string | null;
}

/** Why a timetable made NO direct-journey claim. Absence of proof, per record. */
export type OdptDirectJourneyNoMatchReason =
  /** The caller asked for a station-to-itself journey. */
  | "origin_equals_destination"
  /** No timetable records were supplied or returned. */
  | "timetable_records_empty"
  /** Records were supplied but carry no ordered stop objects. */
  | "timetable_objects_empty"
  /** The origin identity never appears as a departure station. */
  | "origin_stop_absent"
  /** The destination identity never appears as an arrival station. */
  | "destination_stop_absent"
  /** The origin stop is present but carries no departure time. */
  | "origin_departure_absent"
  /** The destination stop is present but carries no arrival time. */
  | "destination_arrival_absent"
  /** Both stops exist but the destination precedes the origin. */
  | "destination_before_origin"
  /** The sequence resolves, but yields zero or negative on-train time. */
  | "non_positive_duration";

/** Why the evidence could NOT safely settle the question. */
export type OdptDirectJourneyInconclusiveReason =
  /** A present clock time was not a usable `HH:MM` / `HH:MM:SS` value. */
  | "malformed_service_time"
  /** The stop sequence contains chronology the provider rule cannot explain. */
  | "invalid_chronology"
  /** Several plausible ordered origin/destination pairs exist. */
  | "ambiguous_stop_pair"
  /** More records than this primitive will join. */
  | "split_chain_too_long"
  /**
   * Multiple records for ONE train identity cannot be reconciled: either a
   * two-way-ambiguous split link set, or sibling records (e.g. calendar
   * variants) that prove the same pair with DIFFERENT scheduled times. Both
   * refuse rather than pick one, because the builder is given no calendar.
   */
  | "ambiguous_split_chain"
  /** Multiple records returned together without an explicit continuation link. */
  | "split_chain_not_linked"
  /** Explicitly linked records that fail the existing compatibility check. */
  | "split_chain_incompatible"
  /** A supplied `serviceDate` was not a real calendar date. */
  | "invalid_service_date";

/** ODPT-specific audit evidence. Kept OUT of the canonical Journey contract. */
export interface OdptDirectJourneyEvidence {
  readonly operator: string | null;
  readonly trainIdentity: string;
  readonly trainNumber: string | null;
  readonly trainType: string | null;
  readonly railway: string | null;
  readonly calendar: string | null;
  readonly railDirection: string | null;
  readonly serviceDate: string | null;
  /** Scheduled clock times actually used, `HH:MM` as supplied by the provider. */
  readonly scheduledDepartureTime: string;
  readonly scheduledArrivalTime: string;
  /** ODPT timetable record identities that contributed (1, or 2 when split). */
  readonly timetableRecordIds: readonly string[];
  /** Credential-free provider URLs only. */
  readonly sourceUrls: readonly string[];
  readonly retrievedAt: string;
  /** True only when the Journey required an explicitly linked split chain. */
  readonly splitContinuation: boolean;
}

export type OdptDirectJourneyBuildResult =
  | {
      readonly kind: "verified";
      readonly journey: Journey;
      readonly evidence: OdptDirectJourneyEvidence;
      readonly durationMinutes: number;
    }
  | {
      readonly kind: "no_match";
      readonly reason: OdptDirectJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: OdptDirectJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

const SERVICE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict Gregorian validation for `YYYY-MM-DD`.
 *
 * A shape check plus `Date.parse` is NOT enough: JS silently normalises
 * impossible dates (`2017-02-29` becomes 1 March), which would turn a bogus
 * provider period into a real date. Month, day existence and leap years are
 * therefore verified numerically.
 */
export function isRealCalendarDate(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const match = SERVICE_DATE_PATTERN.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [
    31,
    isLeap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

/**
 * True when `operator` may participate in the timetable-backed pilot.
 *
 * Callers must treat `false` as a hard stop, never as "try another operator".
 */
export function isTimetablePilotOperator(
  operator: string | null | undefined,
): boolean {
  return (
    typeof operator === "string" &&
    ODPT_TIMETABLE_PILOT_OPERATORS.includes(operator)
  );
}

/**
 * Defense-in-depth credential scrub for provider URLs.
 *
 * The `/api/odpt` boundary already strips `acl:consumerKey` before a result
 * reaches the browser; this second pass exists so a hand-built or leaked URL
 * can never reach the Journey evidence, and is asserted by tests. It is not a
 * replacement for the boundary.
 */
export function credentialFreeSourceUrl(
  value: string | null | undefined,
): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return (
    value
      .replace(/([?&])acl:consumerKey=[^&#]*/gi, "$1")
      // Removing a parameter can leave `?&`, `&&` or a dangling separator behind;
      // collapse those so the URL stays well formed and readable.
      .replace(/\?&/g, "?")
      .replace(/&&+/g, "&")
      .replace(/[?&]+$/, "")
  );
}

/** The provider's own human name for a station, when it supplied one. */
function stationName(station: OdptDirectJourneyStation): string | undefined {
  const title = station.title?.trim();
  if (title) return title;
  const localized = station.stationTitle ?? {};
  const ja = localized.ja?.trim();
  if (ja) return ja;
  const en = localized.en?.trim();
  if (en) return en;
  return undefined;
}

/**
 * Builds a canonical station endpoint from an exact ODPT identity.
 *
 * `anchorKey` is derived deterministically from the identity alone (not from
 * coordinates), so the same station always anchors the same way even though
 * coordinates are only attached when the provider actually supplied them. No
 * coordinate is ever invented.
 */
export function odptStationEndpoint(
  station: OdptDirectJourneyStation,
): JourneyEndpoint {
  const identity = station.sameAs;
  const name = stationName(station);
  return {
    kind: "station",
    id: identity,
    anchorKey: identity,
    ...(name !== undefined ? { name } : {}),
    // Coordinates only when the provider actually supplied them. Never invented.
    ...(station.coordinates ? { coordinates: station.coordinates } : {}),
  };
}

/** Public shape of one enumerated stop event, for tests and benchmarks. */
export interface OdptStopEvent {
  /** Index of the owning `odpt:trainTimetableObject`. */
  readonly objectIndex: number;
  readonly kind: "arrival" | "departure";
  /** Strictly the station field that owns this event's time. */
  readonly station: string | null;
  readonly time: string | null;
  /** Index into the sequence handed to `buildServiceChronology`. */
  readonly sequenceIndex: number;
}

/** One enumerated stop event of a train's ordered sequence. */
type StopEvent = OdptStopEvent;

/**
 * Enumerates stop events in the SAME order as
 * `trainTimetableStopSequence()` (arrival before departure, and only when a
 * time is present), while keeping the object index and the exact station field
 * that owns each time.
 *
 * Chronology itself is NOT re-implemented here: `sequence` is passed verbatim
 * to the existing `buildServiceChronology`, whose `events[i]` is guaranteed to
 * line up with `sequence[i]`. A test asserts this enumeration stays identical
 * to `trainTimetableStopSequence`, so the two cannot drift apart.
 */
export function enumerateStopEvents(
  objects: readonly OdptTrainTimetableObject[],
): {
  readonly events: readonly StopEvent[];
  readonly sequence: readonly ServiceTimeInput[];
} {
  const events: StopEvent[] = [];
  const sequence: ServiceTimeInput[] = [];
  objects.forEach((object, objectIndex) => {
    if (object.arrivalTime) {
      sequence.push({
        time: object.arrivalTime,
        kind: "arrival",
        station: object.arrivalStation ?? null,
      });
      events.push({
        objectIndex,
        kind: "arrival",
        station: object.arrivalStation ?? null,
        time: object.arrivalTime,
        sequenceIndex: sequence.length - 1,
      });
    }
    if (object.departureTime) {
      sequence.push({
        time: object.departureTime,
        kind: "departure",
        station: object.departureStation ?? object.arrivalStation ?? null,
      });
      events.push({
        objectIndex,
        kind: "departure",
        // Strict: a departure event belongs to `departureStation` only. The
        // sequence above keeps the chronology station label, but identity
        // matching here must not borrow the arrival station.
        station: object.departureStation ?? null,
        time: object.departureTime,
        sequenceIndex: sequence.length - 1,
      });
    }
  });
  return { events, sequence };
}

/** Concatenates the stop objects of an already-accepted chain, in order. */
function concatenatedObjects(
  records: readonly OdptTrainTimetable[],
): readonly OdptTrainTimetableObject[] {
  const objects: OdptTrainTimetableObject[] = [];
  for (const record of records) {
    for (const object of record.objects ?? []) objects.push(object);
  }
  return objects;
}

/**
 * Decides whether the supplied records may be joined into ONE service.
 *
 * Only called when NO single record already proved the pair, because an exact
 * train identity can legitimately return several records that are not
 * continuations of one another (see the measured calendar-variant case in the
 * fixtures). A join requires the provider's explicit
 * `odpt:nextTrainTimetable` / `odpt:previousTrainTimetable` link AND
 * `validateSplitTimetablePair()`'s identity+chronology compatibility.
 *
 * Records may be supplied in either order, so both orders are tried — and if
 * BOTH orders validate, the record does not uniquely establish the
 * continuation, which is ambiguous and fails closed.
 */
function resolveChain(
  records: readonly OdptTrainTimetable[],
):
  | { readonly kind: "joined"; readonly records: readonly OdptTrainTimetable[] }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "not_linked" }
  | { readonly kind: "incompatible"; readonly reasons: readonly string[] }
  | { readonly kind: "too_long" } {
  if (records.length > ODPT_DIRECT_JOURNEY_MAX_CHAIN_RECORDS) {
    return { kind: "too_long" };
  }

  const asGiven = validateSplitTimetablePair(records[0], records[1]);
  const reversed = validateSplitTimetablePair(records[1], records[0]);

  if (asGiven.compatible && reversed.compatible) return { kind: "ambiguous" };
  if (asGiven.compatible) return { kind: "joined", records };
  if (reversed.compatible) {
    return { kind: "joined", records: [records[1], records[0]] };
  }
  // The provider DID declare a continuation, but the pair does not pass the
  // existing compatibility check (cross-record chronology, or a join point that
  // moves backwards). That is unreadable evidence, not an absent one.
  if (asGiven.hasExplicitLink || reversed.hasExplicitLink) {
    return {
      kind: "incompatible",
      reasons: [...new Set([...asGiven.reasons, ...reversed.reasons])],
    };
  }
  // Neither order is an explicitly linked continuation. Two records that merely
  // arrived together are NOT evidence of one service — matching train numbers,
  // names, operators, railways, times or terminals never justify a join.
  return { kind: "not_linked" };
}

/** A proven stop pair within ONE ordered stop sequence. */
interface VerifiedPair {
  readonly durationMinutes: number;
  readonly scheduledDepartureTime: string;
  readonly scheduledArrivalTime: string;
}

type PairOutcome =
  | { readonly kind: "verified"; readonly pair: VerifiedPair }
  | {
      readonly kind: "no_match";
      readonly reason: OdptDirectJourneyNoMatchReason;
      readonly notes: readonly string[];
    }
  | {
      readonly kind: "inconclusive";
      readonly reason: OdptDirectJourneyInconclusiveReason;
      readonly notes: readonly string[];
    };

/**
 * Proves (or refuses) the exact origin -> destination pair inside ONE ordered
 * stop sequence.
 *
 * This is the whole correctness core: identity matching by exact ODPT id, a
 * unique ordered pair, chronology from the shared module, and a strictly
 * positive on-train duration. It NEVER picks among competing pairs.
 */
function deriveStopPair(
  objects: readonly OdptTrainTimetableObject[],
  originIdentity: string,
  destinationIdentity: string,
): PairOutcome {
  if (objects.length === 0) {
    return { kind: "no_match", reason: "timetable_objects_empty", notes: [] };
  }

  const { events, sequence } = enumerateStopEvents(objects);
  const chronology = buildServiceChronology(sequence);
  if (chronology.status === "invalid") {
    return {
      kind: "inconclusive",
      reason: "invalid_chronology",
      notes: chronology.errors,
    };
  }

  // ORIGIN: strictly a DEPARTURE event at the origin identity.
  const originEvents = events.filter(
    (event) => event.kind === "departure" && event.station === originIdentity,
  );
  // DESTINATION: strictly an ARRIVAL event at the destination identity.
  const destinationEvents = events.filter(
    (event) =>
      event.kind === "arrival" && event.station === destinationIdentity,
  );

  // Identity presence is independent of which event kind carries a time: a
  // station can appear in the sequence and still lack the exact event this
  // primitive requires. "This station is not served by this train" and "this
  // station is served but has no usable departure" are different facts, so they
  // are reported differently.
  const originIdentityPresent = objects.some(
    (object) =>
      object.arrivalStation === originIdentity ||
      object.departureStation === originIdentity,
  );
  const destinationIdentityPresent = objects.some(
    (object) =>
      object.arrivalStation === destinationIdentity ||
      object.departureStation === destinationIdentity,
  );

  // A present-but-unusable clock time cannot be treated as "absent": it is
  // evidence we failed to read, so it is inconclusive rather than a no-match.
  const malformed = [...originEvents, ...destinationEvents].some(
    (event) => parseClockMinutes(event.time) === null,
  );
  if (malformed) {
    return {
      kind: "inconclusive",
      reason: "malformed_service_time",
      notes: [],
    };
  }

  const usableOrigins = originEvents.filter(
    (event) => parseClockMinutes(event.time) !== null,
  );
  const usableDestinations = destinationEvents.filter(
    (event) => parseClockMinutes(event.time) !== null,
  );

  if (!originIdentityPresent) {
    return { kind: "no_match", reason: "origin_stop_absent", notes: [] };
  }
  if (usableOrigins.length === 0) {
    return { kind: "no_match", reason: "origin_departure_absent", notes: [] };
  }
  if (!destinationIdentityPresent) {
    return { kind: "no_match", reason: "destination_stop_absent", notes: [] };
  }
  if (usableDestinations.length === 0) {
    return {
      kind: "no_match",
      reason: "destination_arrival_absent",
      notes: [],
    };
  }

  // Every ordered pair whose origin precedes its destination is plausible. A
  // looping or duplicated visit produces more than one, and the record does not
  // say which is intended — so uniqueness must be proven, never assumed.
  const pairs: {
    readonly origin: StopEvent;
    readonly destination: StopEvent;
  }[] = [];
  for (const origin of usableOrigins) {
    for (const destination of usableDestinations) {
      if (origin.sequenceIndex < destination.sequenceIndex) {
        pairs.push({ origin, destination });
      }
    }
  }
  if (pairs.length === 0) {
    return { kind: "no_match", reason: "destination_before_origin", notes: [] };
  }
  if (pairs.length > 1) {
    return {
      kind: "inconclusive",
      reason: "ambiguous_stop_pair",
      notes: [`plausible_pairs:${pairs.length}`],
    };
  }

  const pair = pairs[0];
  // Service-day minutes come from the existing chronology (which owns the 23->0
  // rollover contract) rather than from a second "after midnight" heuristic.
  const originServiceMinutes =
    chronology.events[pair.origin.sequenceIndex]?.minutes ?? null;
  const destinationServiceMinutes =
    chronology.events[pair.destination.sequenceIndex]?.minutes ?? null;
  if (originServiceMinutes === null || destinationServiceMinutes === null) {
    return { kind: "inconclusive", reason: "invalid_chronology", notes: [] };
  }

  const durationMinutes = destinationServiceMinutes - originServiceMinutes;
  if (durationMinutes <= 0) {
    return { kind: "no_match", reason: "non_positive_duration", notes: [] };
  }

  return {
    kind: "verified",
    pair: {
      durationMinutes,
      scheduledDepartureTime: pair.origin.time ?? "",
      scheduledArrivalTime: pair.destination.time ?? "",
    },
  };
}

/** Deterministic agreement signature for one proven stop pair. */
function pairSignature(pair: VerifiedPair): string {
  return `${pair.durationMinutes}|${pair.scheduledDepartureTime}|${pair.scheduledArrivalTime}`;
}

/**
 * Derives a verified direct Journey from the TrainTimetable records returned for
 * ONE exact train identity.
 *
 * Pure: no I/O, no clock reads, no randomness.
 *
 * Two distinct shapes must be handled, and the order matters:
 *
 * 1. **Records evaluated INDEPENDENTLY first.** An exact train identity can
 *    legitimately return several records for the same service — the measured
 *    Toei case returns one record per calendar (`…535T.Weekday` and
 *    `…535T.SaturdayHoliday`), with NO split link between them. If one record
 *    alone proves the pair, that record is the journey. Treating multiple
 *    records as a mandatory chain would wrongly make every such service
 *    inconclusive.
 * 2. **An explicitly linked split chain**, only when no single record proves the
 *    pair. See `resolveChain`.
 *
 * Several independent records that prove the SAME pair with the SAME scheduled
 * times agree, so the duration is proven whichever one applies. Records that
 * disagree cannot be reconciled without guessing, and fail closed as
 * `ambiguous_split_chain`.
 */
export function buildDirectJourneyFromOdptTrainTimetable(
  input: OdptDirectJourneyBuildInput,
): OdptDirectJourneyBuildResult {
  const { originStation, destinationStation } = input;
  const records = input.records ?? [];

  const serviceDate =
    typeof input.serviceDate === "string" && input.serviceDate.trim().length > 0
      ? input.serviceDate.trim()
      : null;
  if (input.serviceDate != null && serviceDate === null) {
    return { kind: "inconclusive", reason: "invalid_service_date", notes: [] };
  }
  if (serviceDate !== null && !isRealCalendarDate(serviceDate)) {
    return { kind: "inconclusive", reason: "invalid_service_date", notes: [] };
  }

  // A station-to-itself request is a caller error, not a service fact.
  if (originStation.sameAs === destinationStation.sameAs) {
    return { kind: "no_match", reason: "origin_equals_destination", notes: [] };
  }

  if (records.length === 0) {
    return { kind: "no_match", reason: "timetable_records_empty", notes: [] };
  }

  // ── Pass 1: each record on its own ────────────────────────────────────────
  const independent = records.map((record) =>
    deriveStopPair(
      record.objects ?? [],
      originStation.sameAs,
      destinationStation.sameAs,
    ),
  );

  const proven: { readonly index: number; readonly pair: VerifiedPair }[] = [];
  independent.forEach((outcome, index) => {
    if (outcome.kind === "verified") proven.push({ index, pair: outcome.pair });
  });

  const firstInconclusive = independent.find(
    (outcome) => outcome.kind === "inconclusive",
  );
  const firstNoMatch = independent.find(
    (outcome) => outcome.kind === "no_match",
  );

  if (proven.length > 0) {
    const signatures = new Set(
      proven.map((entry) => pairSignature(entry.pair)),
    );
    if (signatures.size > 1) {
      // Several records claim the same pair with DIFFERENT scheduled times and
      // the evidence does not say which applies. Choosing one would be a guess.
      return {
        kind: "inconclusive",
        reason: "ambiguous_split_chain",
        notes: [`competing_records:${proven.length}`],
      };
    }
    const winner = proven[0];
    return assembleJourney({
      records,
      pair: winner.pair,
      serviceDate,
      splitContinuation: false,
      originStation,
      destinationStation,
    });
  }

  // ── Pass 2: an explicitly linked split chain ──────────────────────────────
  if (records.length >= 2) {
    const chain = resolveChain(records);
    if (chain.kind === "too_long") {
      return {
        kind: "inconclusive",
        reason: "split_chain_too_long",
        notes: [`records:${records.length}`],
      };
    }
    if (chain.kind === "ambiguous") {
      return {
        kind: "inconclusive",
        reason: "ambiguous_split_chain",
        notes: ["both_orders_explicitly_linked"],
      };
    }
    if (chain.kind === "incompatible") {
      return {
        kind: "inconclusive",
        reason: "split_chain_incompatible",
        notes: chain.reasons,
      };
    }
    if (chain.kind === "not_linked") {
      return {
        kind: "inconclusive",
        reason: "split_chain_not_linked",
        notes: [`records:${records.length}`],
      };
    }

    const joined = deriveStopPair(
      concatenatedObjects(chain.records),
      originStation.sameAs,
      destinationStation.sameAs,
    );
    if (joined.kind === "verified") {
      return assembleJourney({
        records: chain.records,
        pair: joined.pair,
        serviceDate,
        splitContinuation: true,
        originStation,
        destinationStation,
      });
    }
    return joined.kind === "inconclusive"
      ? {
          kind: "inconclusive",
          reason: joined.reason,
          notes: joined.notes,
        }
      : { kind: "no_match", reason: joined.reason, notes: joined.notes };
  }

  // ── Nothing proved the pair ───────────────────────────────────────────────
  // Unreadable evidence outranks an absence: we may not have read the record.
  if (
    firstInconclusive !== undefined &&
    firstInconclusive.kind === "inconclusive"
  ) {
    return {
      kind: "inconclusive",
      reason: firstInconclusive.reason,
      notes: firstInconclusive.notes,
    };
  }
  if (firstNoMatch !== undefined && firstNoMatch.kind === "no_match") {
    return {
      kind: "no_match",
      reason: firstNoMatch.reason,
      notes: firstNoMatch.notes,
    };
  }
  return { kind: "no_match", reason: "timetable_objects_empty", notes: [] };
}

/**
 * Builds the canonical Journey plus ODPT evidence for an already-proven pair.
 *
 * Kept separate from the proof so the derivation logic cannot be influenced by
 * presentation concerns.
 */
function assembleJourney(args: {
  readonly records: readonly OdptTrainTimetable[];
  readonly pair: VerifiedPair;
  readonly serviceDate: string | null;
  readonly splitContinuation: boolean;
  readonly originStation: OdptDirectJourneyStation;
  readonly destinationStation: OdptDirectJourneyStation;
}): OdptDirectJourneyBuildResult {
  const { records, pair, originStation, destinationStation } = args;

  const primary = records[0];
  const retrievedAt = records
    .map((record) => record.provenance?.fetchedAt ?? "")
    .filter((value) => value.length > 0)
    .sort()
    .at(-1);
  const sourceUrls = records
    .map((record) => credentialFreeSourceUrl(record.provenance?.sourceUrl))
    .filter((value) => value.length > 0);
  const timetableRecordIds = records.map((record) => record.sameAs);
  const checkedAt = retrievedAt ?? undefined;
  const primarySourceUrl = sourceUrls[0];

  const originEndpoint = odptStationEndpoint(originStation);
  const destinationEndpoint = odptStationEndpoint(destinationStation);

  const provenance: JourneyProvenance = {
    source: ODPT_DIRECT_JOURNEY_SOURCE,
    confidence: "high",
    duration: "verified",
    cost: "unknown",
    ...(primarySourceUrl !== undefined ? { sourceUrl: primarySourceUrl } : {}),
    ...(checkedAt !== undefined ? { checkedAt } : {}),
  };

  const duration = {
    minutes: [pair.durationMinutes, pair.durationMinutes] as readonly [
      number,
      number,
    ],
    evidence: "verified" as const,
    source: ODPT_DIRECT_JOURNEY_SOURCE,
    ...(primarySourceUrl !== undefined ? { sourceUrl: primarySourceUrl } : {}),
    ...(checkedAt !== undefined ? { checkedAt } : {}),
  };

  const leg: JourneyLeg = {
    mode: "train",
    direction: "one_way",
    origin: originEndpoint,
    destination: destinationEndpoint,
    duration,
    // FARE IS DELIBERATELY UNKNOWN in this PR: no RailwayFare call is made, and
    // `needExtraFee === false` is NOT a fare of zero. A verified timetable
    // duration is not a verified fare.
    cost: {
      currency: "JPY",
      representation: null,
      state: "unknown",
      evidence: "unknown",
      scope: "unknown",
      completeness: "unknown",
      basis: "unknown",
    },
    availability: "available",
    confidence: "high",
    provenance,
  };

  const journey: Journey = {
    kind: "journey",
    origin: originEndpoint,
    destination: destinationEndpoint,
    // Complete *for the explicit station-to-station contract* — not a claim
    // about a user's home-to-POI trip.
    scope: "complete_journey",
    directionality: "one_way",
    completeness: "complete",
    externalHandoff: journeyHandoffCapabilityForMode(
      "train",
      "complete",
      "available",
    ),
    legs: [leg],
    availability: "available",
    confidence: "high",
    provenance,
  };

  const evidence: OdptDirectJourneyEvidence = {
    operator: primary.operator ?? null,
    trainIdentity: primary.train ?? "",
    trainNumber: primary.trainNumber ?? null,
    trainType: primary.trainType ?? null,
    railway: primary.railway ?? null,
    calendar: primary.calendar ?? null,
    railDirection: primary.railDirection ?? null,
    serviceDate: args.serviceDate,
    scheduledDepartureTime: pair.scheduledDepartureTime,
    scheduledArrivalTime: pair.scheduledArrivalTime,
    timetableRecordIds,
    sourceUrls,
    retrievedAt: retrievedAt ?? "",
    splitContinuation: args.splitContinuation,
  };

  return {
    kind: "verified",
    journey,
    evidence,
    durationMinutes: pair.durationMinutes,
  };
}
