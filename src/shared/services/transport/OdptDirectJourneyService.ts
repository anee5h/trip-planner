/**
 * KAI-290 PR 2C — ODPT direct-journey resolution (the I/O half).
 *
 * Companion to the PURE `odptDirectJourney` builder. This module owns the
 * bounded discovery conversation with the ODPT boundary; the builder owns
 * correctness. Separating them is deliberate: a reviewer can test the duration
 * proof with zero network, and the fan-out budget with zero provider.
 *
 * ─── The retrieval shape is measured, not assumed ────────────────────────────
 *
 * From the bounded authenticated production audit (artifact
 * `qa/kai-290/odpt-coverage.json` + `docs/kai-290-odpt-timetable-pilot-constraints.md`):
 *
 * - `odpt:StationTimetable` scoped to ONE station is usable, and is the
 *   DISCOVERY step: its stop objects carry `odpt:train` identities, which is how
 *   candidate trains are derived rather than hard-coded.
 * - An operator-wide StationTimetable and a whole-railway TrainTimetable both
 *   exceed the boundary's 1 MB guard and fail closed. Neither is a runtime
 *   strategy, and this module cannot express either.
 * - An EXACT train identity is the proven TrainTimetable shape, and it is the
 *   ONLY duration authority. One identity may legitimately return MORE than one
 *   record, and the measured Toei case showed what that means: several
 *   **CALENDAR VARIANTS of the SAME service** (`…535T.Weekday` and
 *   `…535T.SaturdayHoliday`), each with the same stops and span and **no
 *   `odpt:nextTrainTimetable` / `odpt:previousTrainTimetable` link between
 *   them**. It was NOT a split service. Split-continuation joining is therefore
 *   defensive and specification-driven rather than something measured, and it is
 *   only attempted after each record has been evaluated independently.
 *
 * `odpt:StationTimetable` ordering is NOT route ordering — it lists many trains
 * at a single station. It is used here for train identity, scheduled departure
 * time and service context ONLY. No duration is ever derived from it, and this
 * module never subtracts one station timetable's clock time from another's.
 *
 * ─── Station resolution is somebody else's job ───────────────────────────────
 *
 * Inputs are ALREADY-RESOLVED exact ODPT station records
 * (`odptStationIdentity`). This service will not accept a Destination, raw user
 * coordinates, a bare station name or a provider URL, and will not guess an
 * identity. Callers without exact identities get `inconclusive`.
 *
 * ─── Per-journey fan-out budget ──────────────────────────────────────────────
 *
 * One resolution may spend at most `ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET` (8)
 * LOGICAL ODPT boundary lookups: one narrow StationTimetable lookup plus at most
 * seven exact-train lookups. This is a different concern from PR 2B's
 * isolate-local provider-attempt budget, which protects shared provider traffic
 * at the server boundary; this one stops ONE journey resolution fanning out
 * across an unbounded number of trains. The counters here count provider METHOD
 * calls, so a server-side 503 retry (owned and accounted by PR 2B) never
 * changes them and is never retried by this client.
 *
 * ─── This PR ships capability, not precedence ────────────────────────────────
 *
 * Nothing in production calls this service. `JourneyService`,
 * `OriginAwareTransportService`, ranking, feasibility, budgets, cards, the
 * planner and the Recommended/Fastest/Cheapest surfaces are untouched, and no
 * existing estimate is replaced or downgraded. There is no transfer, walking or
 * feeder leg here, and no JR-East support.
 */

import type { Journey } from "@/shared/types/journey";
import type {
  OdptProvider,
  OdptStation,
  OdptStationTimetable,
  OdptTrainTimetable,
} from "./OdptProvider";
import {
  ODPT_DEPARTURE_WINDOW_MAX_MINUTES,
  buildDirectJourneyFromOdptTrainTimetable,
  isRealCalendarDate,
  isTimetablePilotOperator,
  type OdptDirectJourneyEvidence,
} from "./odptDirectJourney";
import { parseClockMinutes } from "./odptChronology";

/**
 * Total LOGICAL ODPT boundary lookups one resolution may spend: the narrow
 * StationTimetable discovery lookup plus at most seven exact-train lookups.
 * The eighth lookup is allowed; a ninth is never issued.
 */
export const ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET = 8;

/** Exact-train lookups available after the single discovery lookup. */
export const ODPT_DIRECT_JOURNEY_MAX_TRAIN_LOOKUPS =
  ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET - 1;

/** Bounded local departure window. Cross-midnight windows are out of scope. */
export interface OdptDirectJourneyDepartureWindow {
  /** Inclusive `HH:MM` start. */
  readonly start: string;
  /** Inclusive `HH:MM` end. */
  readonly end: string;
}

export interface ResolveOdptDirectJourneyInput {
  readonly provider: OdptProvider;
  /** Already-resolved exact ODPT station record. Never guessed here. */
  readonly originStation: OdptStation;
  readonly destinationStation: OdptStation;
  /** Service date, `YYYY-MM-DD`, real Gregorian date. */
  readonly serviceDate: string;
  readonly departureWindow: OdptDirectJourneyDepartureWindow;
}

/** Why the resolution could not safely settle the question. */
export type OdptDirectJourneyResolutionReason =
  | "invalid_service_date"
  | "invalid_departure_window"
  | "unusable_station_identity"
  | "origin_equals_destination"
  | "operator_outside_timetable_pilot"
  | "station_timetable_provider_error"
  | "station_timetable_response_too_large"
  | "station_timetable_budget_exhausted"
  | "station_timetable_budget_unavailable"
  | "train_timetable_provider_error"
  | "train_timetable_response_too_large"
  | "train_timetable_budget_exhausted"
  | "train_timetable_budget_unavailable"
  | "split_continuation_not_retrieved"
  | "journey_budget_exhausted"
  | "inspection_inconclusive"
  /**
   * A returned StationTimetable record does not belong to the exact station that
   * was requested. Request narrowing is not proof that the response was scoped.
   */
  | "station_timetable_scope_mismatch"
  /** An exact train identity carried a present-but-unreadable departure time. */
  | "station_timetable_departure_unreadable"
  /** One train identity appeared with conflicting discovery departure times. */
  | "ambiguous_discovery_departure"
  /** A returned TrainTimetable record contradicts the requested train identity. */
  | "train_timetable_scope_mismatch"
  /** A returned record's calendar contradicts the calendar queried for. */
  | "calendar_scope_mismatch"
  /**
   * The departure proven by the duration authority disagrees with the discovery
   * departure, or falls outside the requested window. The two must be the same
   * event, so a disagreement is uncertainty rather than a usable result.
   */
  | "departure_evidence_mismatch"
  /**
   * A returned TrainTimetable record contradicts the requested train identity,
   * or (with no requested identity) the response declared several.
   */
  | "train_timetable_scope_mismatch"
  /** A returned record's calendar contradicts the calendar queried for. */
  | "calendar_scope_mismatch"
  /**
   * A RELEVANT sibling record for the same exact train does not carry the
   * requested pair. With no calendar narrowing the builder cannot know which
   * variant applies, so a schedule claim true under one variant and false under
   * another is never reported as verified.
   */
  | "sibling_evidence_conflict"
  /**
   * A relevant sibling record could not be read (malformed times, invalid
   * chronology, ambiguous pair), so the variant that applies may be unread.
   */
  | "sibling_evidence_inconclusive";

/**
 * One proven direct journey plus its ODPT audit evidence. The canonical Journey
 * stays provider-neutral; everything ODPT-specific lives in `evidence`.
 */
export interface OdptDirectJourneyCandidate {
  readonly journey: Journey;
  readonly evidence: OdptDirectJourneyEvidence;
  /**
   * Scheduled departure at the origin, in service-day minutes. Used ONLY for
   * deterministic inspection/output ordering — NOT a ranking, and never a
   * "best train" selection criterion.
   */
  readonly scheduledDepartureMinutes: number;
}

/** Safe counters. No credential, no raw payload, no provider object. */
export interface OdptDirectJourneyDiagnostics {
  readonly stationTimetableLookups: number;
  readonly exactTrainLookups: number;
  /** `stationTimetableLookups + exactTrainLookups`; never exceeds the budget. */
  readonly logicalLookups: number;
  readonly candidatesDiscovered: number;
  readonly candidatesInspected: number;
  /**
   * Candidates that were safely settled: either proven, or conclusively shown
   * not to carry the pair. A provider method call that FAILED is not conclusive
   * evidence inspection, so it is counted as inconclusive instead.
   */
  readonly candidatesConclusive: number;
  /**
   * Candidates whose evidence could not be safely settled — provider failure,
   * oversized response, budget state, invalid chronology, ambiguous pair,
   * unretrieved split continuation, scope mismatch, departure disagreement, or
   * a discovery-level ambiguity for that identity.
   */
  readonly candidatesInconclusive: number;
  /** In-window StationTimetable objects that carried no exact train identity. */
  readonly candidatesWithoutTrainIdentity: number;
  /** True when the journey budget stopped inspection early. */
  readonly candidateLimitReached: boolean;
  /** Machine-readable reason codes accumulated during inspection. */
  readonly reasons: readonly string[];
}

/**
 * Discriminated resolution. `no_direct_service_evidence` means *the bounded
 * inspected evidence produced no proven direct Journey* — it is NEVER a claim
 * that no train service exists, because ODPT search completeness is not
 * guaranteed.
 */
export type OdptDirectJourneyResolution =
  | {
      readonly status: "resolved";
      readonly candidates: readonly OdptDirectJourneyCandidate[];
      /**
       * `partial` when the lookup cap stopped inspection before every
       * discovered candidate was checked. Reported, never hidden, and never
       * silently upgraded to `complete`.
       */
      readonly coverage: "complete" | "partial";
      readonly diagnostics: OdptDirectJourneyDiagnostics;
    }
  | {
      readonly status: "no_direct_service_evidence";
      readonly candidates: readonly [];
      readonly diagnostics: OdptDirectJourneyDiagnostics;
    }
  | {
      readonly status: "inconclusive";
      readonly reason: OdptDirectJourneyResolutionReason;
      readonly candidates: readonly [];
      readonly diagnostics: OdptDirectJourneyDiagnostics;
    };

interface MutableDiagnostics {
  stationTimetableLookups: number;
  exactTrainLookups: number;
  candidatesDiscovered: number;
  candidatesInspected: number;
  candidatesConclusive: number;
  candidatesInconclusive: number;
  candidatesWithoutTrainIdentity: number;
  candidateLimitReached: boolean;
  reasons: string[];
}

function freezeDiagnostics(
  state: MutableDiagnostics,
): OdptDirectJourneyDiagnostics {
  return {
    stationTimetableLookups: state.stationTimetableLookups,
    exactTrainLookups: state.exactTrainLookups,
    logicalLookups: state.stationTimetableLookups + state.exactTrainLookups,
    candidatesDiscovered: state.candidatesDiscovered,
    candidatesInspected: state.candidatesInspected,
    candidatesConclusive: state.candidatesConclusive,
    candidatesInconclusive: state.candidatesInconclusive,
    candidatesWithoutTrainIdentity: state.candidatesWithoutTrainIdentity,
    candidateLimitReached: state.candidateLimitReached,
    reasons: [...state.reasons],
  };
}

function inconclusive(
  reason: OdptDirectJourneyResolutionReason,
  state: MutableDiagnostics,
  notes: readonly string[] = [],
): OdptDirectJourneyResolution {
  for (const note of notes) state.reasons.push(note);
  return {
    status: "inconclusive",
    reason,
    candidates: [],
    diagnostics: freezeDiagnostics(state),
  };
}

function noDirectServiceEvidence(
  state: MutableDiagnostics,
): OdptDirectJourneyResolution {
  return {
    status: "no_direct_service_evidence",
    candidates: [],
    diagnostics: freezeDiagnostics(state),
  };
}

/** Maps a canonical ODPT error code onto an honest resolution reason. */
function reasonForFailure(
  errorCode: string | undefined,
  context: "station_timetable" | "train_timetable",
): OdptDirectJourneyResolutionReason {
  if (errorCode === "provider_response_too_large") {
    return context === "station_timetable"
      ? "station_timetable_response_too_large"
      : "train_timetable_response_too_large";
  }
  if (errorCode === "budget_exhausted") {
    return context === "station_timetable"
      ? "station_timetable_budget_exhausted"
      : "train_timetable_budget_exhausted";
  }
  if (errorCode === "budget_unavailable") {
    return context === "station_timetable"
      ? "station_timetable_budget_unavailable"
      : "train_timetable_budget_unavailable";
  }
  // provider_unavailable / provider_timeout / network_error / auth / malformed /
  // rate_limited and anything else: the provider path failed, so we learned
  // nothing about coverage.
  return context === "station_timetable"
    ? "station_timetable_provider_error"
    : "train_timetable_provider_error";
}

/** Strict resolver-input clock grammar: exactly two digits, colon, two digits. */
const STRICT_HH_MM = /^([0-9]{2}):([0-9]{2})$/;

/**
 * Parses the resolver's INPUT departure window, which the public contract
 * documents as strictly `HH:MM`.
 *
 * This is deliberately stricter than `parseClockMinutes`: the shared chronology
 * parser accepts the provider's own value shapes (`H:MM`, `HH:MM:SS`) because
 * those are what ODPT supplies, whereas a caller-facing window is a documented
 * `HH:MM` contract. Accepting a broader grammar here would mean accepting input
 * the docs promise to reject, and the two grammars should not be conflated.
 * Whitespace-padded values are rejected rather than trimmed, so the contract has
 * exactly one accepted form.
 */
export function parseDepartureWindowBound(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string") return null;
  const match = STRICT_HH_MM.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** One departure observed for a candidate in the discovery response. */
interface DiscoveryOccurrence {
  readonly departureMinutes: number;
  readonly calendar: string | null;
}

/** A discovered candidate train, before its exact timetable is inspected. */
interface DiscoveredCandidate {
  readonly trainIdentity: string;
  /** The single agreed discovery departure, or null when occurrences conflicted. */
  readonly departureMinutes: number | null;
  /**
   * The calendar to narrow the exact-train request with, or null when the
   * occurrences named several distinct calendars and choosing one would be
   * arbitrary.
   */
  readonly calendar: string | null;
  /** Every distinct calendar seen for this identity, deterministically ordered. */
  readonly calendars: readonly string[];
  /** Set when the identity's occurrences could not be reconciled. */
  readonly ambiguousReason: "ambiguous_discovery_departure" | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolves a direct, timetable-backed station-to-station journey.
 *
 * Never throws: every failure mode becomes a discriminated `inconclusive`
 * result. Never inspects more trains than the per-journey budget allows, and
 * never selects a "best" candidate — when several direct services are proven,
 * all of them are returned in deterministic scheduled-departure order.
 */
export async function resolveOdptDirectJourney(
  input: ResolveOdptDirectJourneyInput,
): Promise<OdptDirectJourneyResolution> {
  const state: MutableDiagnostics = {
    stationTimetableLookups: 0,
    exactTrainLookups: 0,
    candidatesDiscovered: 0,
    candidatesInspected: 0,
    candidatesConclusive: 0,
    candidatesInconclusive: 0,
    candidatesWithoutTrainIdentity: 0,
    candidateLimitReached: false,
    reasons: [],
  };

  // ── Strict input validation, before any provider call ─────────────────────
  if (!isRealCalendarDate(input.serviceDate)) {
    return inconclusive("invalid_service_date", state, [
      "service_date_not_a_real_calendar_date",
    ]);
  }
  const windowStart = parseDepartureWindowBound(input.departureWindow?.start);
  const windowEnd = parseDepartureWindowBound(input.departureWindow?.end);
  if (windowStart === null || windowEnd === null) {
    return inconclusive("invalid_departure_window", state, [
      "window_bounds_must_be_strict_hh_mm",
    ]);
  }
  if (windowStart > windowEnd) {
    // A cross-midnight search window (23:00 -> 01:00) is deliberately not
    // guessed at in this PR: how it maps onto service dates is unspecified.
    return inconclusive("invalid_departure_window", state, [
      "cross_midnight_window_not_supported",
    ]);
  }
  if (windowEnd - windowStart > ODPT_DEPARTURE_WINDOW_MAX_MINUTES) {
    return inconclusive("invalid_departure_window", state, [
      `window_exceeds_max_minutes:${ODPT_DEPARTURE_WINDOW_MAX_MINUTES}`,
    ]);
  }

  const originIdentity = input.originStation?.sameAs;
  const destinationIdentity = input.destinationStation?.sameAs;
  if (
    !isNonEmptyString(originIdentity) ||
    !isNonEmptyString(destinationIdentity)
  ) {
    return inconclusive("unusable_station_identity", state, [
      "exact_odpt_station_identity_required",
    ]);
  }
  if (originIdentity === destinationIdentity) {
    return inconclusive("origin_equals_destination", state, []);
  }

  // ── Pilot operator guard: hard scope, never a fallback ────────────────────
  if (
    !isTimetablePilotOperator(input.originStation.operator) ||
    !isTimetablePilotOperator(input.destinationStation.operator)
  ) {
    return inconclusive("operator_outside_timetable_pilot", state, [
      `origin_operator:${input.originStation.operator ?? "null"}`,
      `destination_operator:${input.destinationStation.operator ?? "null"}`,
    ]);
  }

  // ── Discovery: ONE narrow StationTimetable lookup at the exact origin ─────
  let stationTimetableRecords: readonly OdptStationTimetable[] = [];
  try {
    state.stationTimetableLookups += 1;
    const result = await input.provider.stationTimetable({
      station: originIdentity,
      date: input.serviceDate,
    });
    if (result.outcome === "error") {
      return inconclusive(
        reasonForFailure(result.errorCode, "station_timetable"),
        state,
        [`station_timetable_error:${result.errorCode ?? "unknown"}`],
      );
    }
    if (result.outcome === "no_data") {
      // Documented 404 — a successful "no applicable data" answer for this
      // scope. NOT proof that no direct transport exists.
      state.reasons.push("station_timetable_no_data");
      return noDirectServiceEvidence(state);
    }
    stationTimetableRecords = result.records ?? [];
  } catch {
    return inconclusive("station_timetable_provider_error", state, [
      "station_timetable_threw",
    ]);
  }

  // ── Response scope validation: the REQUEST does not scope the RESPONSE ─────
  // Sending `station: <exact id>` narrows the query; it does not by itself make
  // every returned record belong to that station. Discovery evidence feeds a
  // VERIFIED claim, so a record that identifies another station — or another
  // operator — must not be allowed to seed candidates.
  for (const record of stationTimetableRecords) {
    const recordStation = isNonEmptyString(record.station)
      ? record.station.trim()
      : null;
    if (recordStation === null) {
      // Without a station identity the record cannot be attributed to the
      // requested station, so it is not admissible discovery evidence.
      return inconclusive("station_timetable_scope_mismatch", state, [
        "record_station_absent",
      ]);
    }
    if (recordStation !== originIdentity) {
      return inconclusive("station_timetable_scope_mismatch", state, [
        `requested_station:${originIdentity}`,
        `returned_station:${recordStation}`,
      ]);
    }
    const recordOperator = isNonEmptyString(record.operator)
      ? record.operator.trim()
      : null;
    if (recordOperator === null) continue;
    if (!isTimetablePilotOperator(recordOperator)) {
      return inconclusive("operator_outside_timetable_pilot", state, [
        `station_timetable_operator:${recordOperator}`,
      ]);
    }
    const stationOperator = isNonEmptyString(input.originStation.operator)
      ? input.originStation.operator.trim()
      : null;
    if (stationOperator !== null && recordOperator !== stationOperator) {
      // Another pilot operator's station timetable must not seed candidates for
      // this station's journey.
      return inconclusive("station_timetable_scope_mismatch", state, [
        `record_operator:${recordOperator}`,
        `station_operator:${stationOperator}`,
      ]);
    }
  }

  // ── Local window filtering, preserving ALL per-identity context ────────────
  const occurrencesByTrain = new Map<string, DiscoveryOccurrence[]>();
  let discoveryUnreadable = false;

  for (const record of stationTimetableRecords) {
    const calendar = isNonEmptyString(record.calendar)
      ? record.calendar.trim()
      : null;
    for (const object of record.objects ?? []) {
      // An object without an exact train identity cannot produce a verified
      // candidate, and its station-level ordering proves nothing.
      if (!isNonEmptyString(object.train)) {
        state.candidatesWithoutTrainIdentity += 1;
        continue;
      }
      const trainIdentity = object.train.trim();
      const departureMinutes = parseClockMinutes(object.departureTime);
      if (departureMinutes === null) {
        // A genuinely ABSENT departure time simply is not a direct-departure
        // candidate. A PRESENT but unreadable one is different: we cannot tell
        // whether this exact train falls inside the requested window, so
        // treating it as "no candidate" would turn unreadable evidence into an
        // absence.
        if (isNonEmptyString(object.departureTime)) {
          discoveryUnreadable = true;
          state.reasons.push(
            `unreadable_discovery_departure:${trainIdentity}:${object.departureTime.trim()}`,
          );
        }
        continue;
      }
      // Bounded local window filter: a readable departure outside the requested
      // window is safely ignored, because we CAN place it in time.
      if (departureMinutes < windowStart || departureMinutes > windowEnd) {
        continue;
      }
      const existing = occurrencesByTrain.get(trainIdentity);
      if (existing === undefined) {
        occurrencesByTrain.set(trainIdentity, [{ departureMinutes, calendar }]);
      } else {
        existing.push({ departureMinutes, calendar });
      }
    }
  }

  // ── Candidate assembly: dedupe by identity, keep every occurrence ──────────
  const candidates: DiscoveredCandidate[] = [];
  for (const [trainIdentity, occurrences] of occurrencesByTrain) {
    const departures = [...new Set(occurrences.map((o) => o.departureMinutes))];
    const calendars = [
      ...new Set(
        occurrences
          .map((o) => o.calendar)
          .filter((value): value is string => value !== null),
      ),
    ].sort();

    if (departures.length > 1) {
      // One exact train cannot depart the same station at several times for one
      // service date; keeping the earliest occurrence would be a silent guess.
      state.reasons.push(
        `ambiguous_discovery_departure:${trainIdentity}:${departures
          .sort((left, right) => left - right)
          .join(",")}`,
      );
      candidates.push({
        trainIdentity,
        departureMinutes: null,
        calendar: null,
        calendars,
        ambiguousReason: "ambiguous_discovery_departure",
      });
      continue;
    }

    if (calendars.length > 1) {
      // The same departure appears under several distinct calendars (the
      // measured Toei shape). Retaining the first would arbitrarily pick a
      // variant, so ask WITHOUT a calendar filter — still narrowed by the exact
      // train identity — and let the builder reconcile what comes back.
      state.reasons.push(`multiple_discovery_calendars:${trainIdentity}`);
      candidates.push({
        trainIdentity,
        departureMinutes: departures[0],
        calendar: null,
        calendars,
        ambiguousReason: null,
      });
      continue;
    }

    candidates.push({
      trainIdentity,
      departureMinutes: departures[0],
      calendar: calendars[0] ?? null,
      calendars,
      ambiguousReason: null,
    });
  }

  candidates.sort(
    (left, right) =>
      (left.departureMinutes ?? Number.MAX_SAFE_INTEGER) -
        (right.departureMinutes ?? Number.MAX_SAFE_INTEGER) ||
      left.trainIdentity.localeCompare(right.trainIdentity),
  );
  state.candidatesDiscovered = candidates.length;

  if (candidates.length === 0) {
    if (discoveryUnreadable) {
      // Unreadable discovery evidence must never be reported as an absence.
      return inconclusive("station_timetable_departure_unreadable", state, []);
    }
    // Conclusive for this bounded scope: the origin's own timetable, filtered to
    // the requested window, yielded no exact train identity to inspect.
    return noDirectServiceEvidence(state);
  }

  // ── Inspection: exact TrainTimetable per candidate, inside the budget ─────
  const resolved: OdptDirectJourneyCandidate[] = [];
  let inconclusiveReason: OdptDirectJourneyResolutionReason | null = null;

  for (const candidate of candidates) {
    if (candidate.ambiguousReason !== null) {
      // Discovery could not reconcile this identity, and no lookup can settle a
      // conflict that exists in the discovery response itself.
      inconclusiveReason ??= candidate.ambiguousReason;
      state.candidatesInconclusive += 1;
      continue;
    }

    if (
      state.exactTrainLookups >= ODPT_DIRECT_JOURNEY_MAX_TRAIN_LOOKUPS ||
      state.stationTimetableLookups + state.exactTrainLookups >=
        ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET
    ) {
      state.candidateLimitReached = true;
      state.reasons.push("journey_budget_exhausted");
      break;
    }

    let records: readonly OdptTrainTimetable[] = [];
    try {
      state.exactTrainLookups += 1;
      state.candidatesInspected += 1;
      const result = await input.provider.trainTimetable({
        train: candidate.trainIdentity,
        ...(candidate.calendar !== null
          ? { calendar: candidate.calendar }
          : {}),
      });

      if (result.outcome === "error") {
        // too_large / provider error / budget states: the candidate is
        // inconclusive, NOT absent — we never read its evidence.
        inconclusiveReason ??= reasonForFailure(
          result.errorCode,
          "train_timetable",
        );
        state.candidatesInconclusive += 1;
        state.reasons.push(
          `train_timetable_error:${candidate.trainIdentity}:${result.errorCode ?? "unknown"}`,
        );
        continue;
      }
      if (result.outcome === "no_data") {
        // A documented 404 for an EXACT identity is a conclusive answer about
        // this train, unlike a failed or oversized response.
        state.candidatesConclusive += 1;
        state.reasons.push(
          `train_timetable_no_data:${candidate.trainIdentity}`,
        );
        continue;
      }
      records = result.records ?? [];
    } catch {
      inconclusiveReason ??= "train_timetable_provider_error";
      state.candidatesInconclusive += 1;
      state.reasons.push(`train_timetable_threw:${candidate.trainIdentity}`);
      continue;
    }

    if (records.length === 0) {
      // Successful empty answer for one exact identity: conclusive for it.
      state.candidatesConclusive += 1;
      state.reasons.push(`train_timetable_empty:${candidate.trainIdentity}`);
      continue;
    }

    // Fail closed rather than silently reading another operator's timetable.
    const foreignOperator = records.find(
      (record) =>
        isNonEmptyString(record.operator) &&
        !isTimetablePilotOperator(record.operator),
    );
    if (foreignOperator !== undefined) {
      return inconclusive("operator_outside_timetable_pilot", state, [
        `train_timetable_operator:${foreignOperator.operator ?? "null"}`,
      ]);
    }

    const build = buildDirectJourneyFromOdptTrainTimetable({
      records,
      originStation: input.originStation,
      destinationStation: input.destinationStation,
      serviceDate: input.serviceDate,
      // The requested identity scopes the response: a record for a different
      // train must not prove this candidate.
      expectedTrainIdentity: candidate.trainIdentity,
      // Only asserted when the request was actually narrowed by a calendar.
      expectedCalendar: candidate.calendar,
    });

    if (build.kind === "verified") {
      // StationTimetable is DISCOVERY evidence; TrainTimetable is the duration
      // authority. The proven departure must be the same event that selected
      // this train, and must still lie inside the requested window.
      const verifiedDepartureMinutes = parseClockMinutes(
        build.evidence.scheduledDepartureTime,
      );
      if (
        verifiedDepartureMinutes === null ||
        candidate.departureMinutes === null ||
        verifiedDepartureMinutes !== candidate.departureMinutes ||
        verifiedDepartureMinutes < windowStart ||
        verifiedDepartureMinutes > windowEnd
      ) {
        inconclusiveReason ??= "departure_evidence_mismatch";
        state.candidatesInconclusive += 1;
        state.reasons.push(
          `departure_evidence_mismatch:${candidate.trainIdentity}:` +
            `discovery=${candidate.departureMinutes ?? "null"}:` +
            `exact=${build.evidence.scheduledDepartureTime}`,
        );
        continue;
      }
      state.candidatesConclusive += 1;
      resolved.push({
        journey: build.journey,
        evidence: build.evidence,
        // The VERIFIED departure proven by the exact timetable — never the
        // conflicting discovery value.
        scheduledDepartureMinutes: verifiedDepartureMinutes,
      });
      continue;
    }

    if (build.kind === "inconclusive") {
      // Surface the build's own verdict where it names a distinct failure mode,
      // so the resolution reason is as specific as the evidence allows.
      if (build.reason === "train_timetable_scope_mismatch") {
        inconclusiveReason ??= "train_timetable_scope_mismatch";
      } else if (build.reason === "calendar_scope_mismatch") {
        inconclusiveReason ??= "calendar_scope_mismatch";
      } else if (build.reason === "sibling_evidence_conflict") {
        inconclusiveReason ??= "sibling_evidence_conflict";
      } else if (build.reason === "sibling_evidence_inconclusive") {
        inconclusiveReason ??= "sibling_evidence_inconclusive";
      } else {
        inconclusiveReason ??= "inspection_inconclusive";
      }
      state.candidatesInconclusive += 1;
      state.reasons.push(
        `train_timetable_inconclusive:${candidate.trainIdentity}:${build.reason}`,
      );
      continue;
    }

    // No match from these records. If the provider declared a continuation we
    // did not receive, evidence remains UNINSPECTED — inconclusive, not absent.
    if (declaresUnretrievedContinuation(records)) {
      inconclusiveReason ??= "split_continuation_not_retrieved";
      state.candidatesInconclusive += 1;
      state.reasons.push(
        `split_continuation_not_retrieved:${candidate.trainIdentity}`,
      );
      continue;
    }
    state.candidatesConclusive += 1;
    state.reasons.push(
      `train_timetable_no_match:${candidate.trainIdentity}:${build.reason}`,
    );
  }

  // ── Deterministic aggregation: never a winner ─────────────────────────────
  // `complete` requires that EVERY discovered candidate was conclusively
  // settled. Any unreadable candidate, any candidate the cap left uninspected,
  // and any discovery-level ambiguity all make the answer partial: a resolved
  // result must not imply we finished looking.
  const hasUnresolvedUncertainty =
    state.candidateLimitReached ||
    discoveryUnreadable ||
    state.candidatesInconclusive > 0;

  if (resolved.length > 0) {
    resolved.sort(
      (left, right) =>
        left.scheduledDepartureMinutes - right.scheduledDepartureMinutes ||
        left.evidence.trainIdentity.localeCompare(right.evidence.trainIdentity),
    );
    const allSettled =
      !hasUnresolvedUncertainty &&
      state.candidatesConclusive === state.candidatesDiscovered;
    return {
      status: "resolved",
      candidates: resolved,
      coverage: allSettled ? "complete" : "partial",
      diagnostics: freezeDiagnostics(state),
    };
  }

  if (state.candidateLimitReached) {
    // Uninspected evidence remains, so this can never read as an absence.
    return inconclusive("journey_budget_exhausted", state, []);
  }
  if (inconclusiveReason !== null) {
    return inconclusive(inconclusiveReason, state, []);
  }
  if (discoveryUnreadable) {
    return inconclusive("station_timetable_departure_unreadable", state, []);
  }
  // Every discovered candidate was safely inspected and none proved a direct
  // journey. Still not a claim that no direct train exists.
  return noDirectServiceEvidence(state);
}

/**
 * True when a returned record declares an `odpt:nextTrainTimetable` /
 * `odpt:previousTrainTimetable` continuation that is not among the records we
 * actually received. The provider's explicit link is the only continuation
 * evidence, so an unretrieved counterpart means the service may be split across
 * evidence we never read.
 */
function declaresUnretrievedContinuation(
  records: readonly OdptTrainTimetable[],
): boolean {
  const retrieved = new Set<string>();
  for (const record of records) {
    if (isNonEmptyString(record.id)) retrieved.add(record.id);
    if (isNonEmptyString(record.sameAs)) retrieved.add(record.sameAs);
  }
  return records.some((record) =>
    [
      ...(record.nextTrainTimetable ?? []),
      ...(record.previousTrainTimetable ?? []),
    ].some((link) => isNonEmptyString(link) && !retrieved.has(link)),
  );
}
