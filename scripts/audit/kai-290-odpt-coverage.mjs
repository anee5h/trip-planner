#!/usr/bin/env node
/**
 * KAI-290 — ODPT per-operator coverage audit.
 *
 * Measures how completely each transit operator's timetable foundation data is
 * present in the ODPT feed, by calling ONLY the Meguruto production boundary
 * endpoint `POST https://meguruto.app/api/odpt`. It never contacts
 * `api.odpt.org` directly, never reads or stores a credential, and never stores
 * a raw provider response — only derived, credential-free coverage aggregates.
 *
 * Design guarantees (non-negotiable):
 *   EXPLICIT   — runs only when invoked as the CLI entry point; importing the
 *                module performs no I/O and no fetch (see the `isMain` guard).
 *   BOUNDED    — a hard, configurable maximum total provider requests
 *                (`--max-requests`, default 40, absolute ceiling 120). The
 *                runner stops issuing requests the moment the budget is spent.
 *   RATE-AWARE — strictly sequential with a delay between calls
 *                (`--delay`, default 400 ms); HTTP 429 is honoured by backing
 *                off once (capped) and then halting the remaining run.
 *   REPRODUCIBLE — deterministic ordering (operators sorted byte-order,
 *                records in provider order) and stable JSON key order.
 *   STOP/RERUN SAFE — idempotent; artifacts are written atomically via a temp
 *                file + rename, so an interrupted run never leaves a partial
 *                committed file.
 *
 * Usage:
 *   node scripts/audit/kai-290-odpt-coverage.mjs
 *   node scripts/audit/kai-290-odpt-coverage.mjs --operators=odpt.Operator:TokyoMetro
 *   node scripts/audit/kai-290-odpt-coverage.mjs --out=qa/kai-290/odpt-coverage.json --max-requests=20
 *
 * The pure helper functions below are exported for unit testing; see
 * `scripts/audit/__tests__/kai-290-coverage-tooling.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────────

/** The ONLY endpoint this tool may contact. */
export const BOUNDARY_URL = "https://meguruto.app/api/odpt";

export const DEFAULT_OPERATORS = Object.freeze([
  "odpt.Operator:JR-East",
  "odpt.Operator:Toei",
  "odpt.Operator:TokyoMetro",
]);

export const DEFAULT_MAX_REQUESTS = 40;
export const HARD_MAX_REQUESTS = 120;
export const DEFAULT_DELAY_MS = 400;
export const MAX_429_BACKOFF_MS = 30_000;
export const DEFAULT_OUT = "qa/kai-290/odpt-coverage.json";
export const DEFAULT_MAX_IDS = 500;
/**
 * Stations sampled per operator for StationTimetable coverage. One station is
 * too small a sample to say anything about an operator: live measurement showed
 * 12 JR-East probes across major hubs all empty, which a single probe could not
 * have established.
 */
export const DEFAULT_TIMETABLE_SAMPLE = 3;

/** Values ODPT has been observed to silently truncate at (lower bounds). */
const OPERATOR_ID_PATTERN = /^odpt\.Operator:[A-Za-z0-9._-]+$/;

/**
 * Provider-wide reference resources probed once, not per operator.
 *
 * These are finite, non-operator enumerations. `operator` is probed to confirm
 * the operation is actually deployed and answering, so a missing operation is
 * distinguishable from an operator with no data.
 */
export const REFERENCE_RESOURCE_PROBES = Object.freeze([
  {
    operation: "operator",
    body: { operation: "operator" },
    needsOperator: false,
  },
]);

// ── Pure helpers ─────────────────────────────────────────────────────────────

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when a URL/body fragment looks like it carries the ODPT consumer key.
 * Used to fail closed: a credential-bearing body is never parsed or committed.
 */
export function containsCredentialLike(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  return /acl:consumerKey/i.test(text) || /consumerKey/i.test(text);
}

/** Validates a single caller-supplied operator identity. */
export function isValidOperatorId(value) {
  return typeof value === "string" && OPERATOR_ID_PATTERN.test(value);
}

/**
 * Parses a comma-separated operator list into a de-duplicated, byte-order
 * sorted array. Invalid entries fail loudly rather than being silently dropped.
 */
export function parseOperatorList(raw) {
  const entries = String(raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    throw new Error(
      "--operators requires at least one odpt.Operator:... value",
    );
  }
  const invalid = entries.filter((entry) => !isValidOperatorId(entry));
  if (invalid.length > 0) {
    throw new Error(
      `invalid operator id(s): ${invalid.join(", ")} (expected odpt.Operator:...)`,
    );
  }
  return [...new Set(entries)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Parses CLI arguments. Returns a fully-resolved config so the runner never
 * re-parses argv. Unknown flags throw (fail loud, never silently ignore).
 */
export function parseArgs(argv) {
  const config = {
    help: false,
    operators: [...DEFAULT_OPERATORS].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
    out: DEFAULT_OUT,
    maxRequests: DEFAULT_MAX_REQUESTS,
    delayMs: DEFAULT_DELAY_MS,
    fare: true,
    timetable: true,
    timetableSample: DEFAULT_TIMETABLE_SAMPLE,
  };
  const unknown = [];
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      config.help = true;
      continue;
    }
    if (arg === "--no-fare") {
      config.fare = false;
      continue;
    }
    if (arg === "--no-timetable") {
      config.timetable = false;
      continue;
    }
    const match = /^--([a-z-]+)=(.*)$/s.exec(arg);
    if (!match) {
      unknown.push(arg);
      continue;
    }
    const [, key, value] = match;
    if (key === "operators") {
      config.operators = parseOperatorList(value);
    } else if (key === "out") {
      if (value.trim().length === 0) throw new Error("--out requires a path");
      config.out = value.trim();
    } else if (key === "max-requests") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--max-requests requires a positive integer");
      }
      config.maxRequests = Math.min(parsed, HARD_MAX_REQUESTS);
    } else if (key === "delay") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(
          "--delay requires a non-negative number of milliseconds",
        );
      }
      config.delayMs = parsed;
    } else if (key === "timetable-sample") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
        throw new Error("--timetable-sample requires an integer from 1 to 20");
      }
      config.timetableSample = parsed;
    } else {
      unknown.push(arg);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`unknown argument(s): ${unknown.join(", ")} (try --help)`);
  }
  return config;
}

/** Rounded filled/total ratio, or null when there is no denominator. */
export function safeRatio(numerator, denominator, digits = 4) {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round((numerator / denominator) * factor) / factor;
}

/** 0.75 → "75.0%", null → "n/a". */
export function formatRatio(ratio) {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "n/a";
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Round-number counts (100/200/500/1000…) are the signature of ODPT's silent
 * system-upper-limit truncation, so a count that lands on one is flagged.
 */
export function isSuspiciousRoundNumber(count) {
  return Number.isInteger(count) && count > 0 && count % 100 === 0;
}

/**
 * Truncation metadata for one count. Every ODPT broad-search count is a LOWER
 * BOUND (the provider truncates silently), never an exact total.
 */
export function truncationSignals(count, countsAreLowerBounds = true) {
  const isInteger = Number.isInteger(count);
  const suspicious = isInteger && isSuspiciousRoundNumber(count);
  return {
    count: isInteger ? count : null,
    countsAreLowerBounds: countsAreLowerBounds === true,
    isSuspiciousRoundNumber: suspicious,
    note: suspicious
      ? "round-number count — likely ODPT silent truncation, treat as a lower bound"
      : null,
  };
}

// ── Field specs ──────────────────────────────────────────────────────────────

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;
const isNonEmptyObject = (value) =>
  isRecord(value) && Object.keys(value).length > 0;
const isNonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const isValidCoordinates = (value) =>
  isRecord(value) && Number.isFinite(value.lat) && Number.isFinite(value.lng);

/** Normalized odpt:Station fields (order is the committed key order). */
export const STATION_FIELDS = Object.freeze([
  ["id", (r) => isNonEmptyString(r?.id)],
  ["sameAs", (r) => isNonEmptyString(r?.sameAs)],
  ["ucode", (r) => isNonEmptyString(r?.ucode)],
  ["title", (r) => isNonEmptyString(r?.title)],
  ["stationTitle", (r) => isNonEmptyObject(r?.stationTitle)],
  ["operator", (r) => isNonEmptyString(r?.operator)],
  ["operatorTitle", (r) => isNonEmptyObject(r?.operatorTitle)],
  ["railway", (r) => isNonEmptyString(r?.railway)],
  ["railwayTitle", (r) => isNonEmptyObject(r?.railwayTitle)],
  ["stationCode", (r) => isNonEmptyString(r?.stationCode)],
  ["coordinates", (r) => isValidCoordinates(r?.coordinates)],
  ["connectingRailway", (r) => isNonEmptyArray(r?.connectingRailway)],
  ["connectingStation", (r) => isNonEmptyArray(r?.connectingStation)],
  ["date", (r) => isNonEmptyString(r?.date)],
  ["validUntil", (r) => isNonEmptyString(r?.validUntil)],
  ["provenance", (r) => isNonEmptyObject(r?.provenance)],
]);

/** Normalized odpt:Railway fields. */
export const RAILWAY_FIELDS = Object.freeze([
  ["id", (r) => isNonEmptyString(r?.id)],
  ["sameAs", (r) => isNonEmptyString(r?.sameAs)],
  ["title", (r) => isNonEmptyString(r?.title)],
  ["railwayTitle", (r) => isNonEmptyObject(r?.railwayTitle)],
  ["operator", (r) => isNonEmptyString(r?.operator)],
  ["operatorTitle", (r) => isNonEmptyObject(r?.operatorTitle)],
  ["lineCode", (r) => isNonEmptyString(r?.lineCode)],
  ["color", (r) => isNonEmptyString(r?.color)],
  [
    "ascendingRailDirection",
    (r) => isNonEmptyString(r?.ascendingRailDirection),
  ],
  [
    "descendingRailDirection",
    (r) => isNonEmptyString(r?.descendingRailDirection),
  ],
  ["stationOrder", (r) => isNonEmptyArray(r?.stationOrder)],
  ["date", (r) => isNonEmptyString(r?.date)],
  ["validUntil", (r) => isNonEmptyString(r?.validUntil)],
  ["provenance", (r) => isNonEmptyObject(r?.provenance)],
]);

/** Normalized odpt:RailwayFare fields. */
export const FARE_FIELDS = Object.freeze([
  ["id", (r) => isNonEmptyString(r?.id)],
  ["sameAs", (r) => isNonEmptyString(r?.sameAs)],
  ["operator", (r) => isNonEmptyString(r?.operator)],
  ["fromStation", (r) => isNonEmptyString(r?.fromStation)],
  ["toStation", (r) => isNonEmptyString(r?.toStation)],
  ["ticketFare", (r) => Number.isFinite(r?.ticketFare)],
  ["icCardFare", (r) => Number.isFinite(r?.icCardFare)],
  ["childTicketFare", (r) => Number.isFinite(r?.childTicketFare)],
  ["childIcCardFare", (r) => Number.isFinite(r?.childIcCardFare)],
  ["viaStation", (r) => isNonEmptyArray(r?.viaStation)],
  ["viaRailway", (r) => isNonEmptyArray(r?.viaRailway)],
  ["ticketType", (r) => isNonEmptyString(r?.ticketType)],
  ["paymentMethod", (r) => isNonEmptyArray(r?.paymentMethod)],
  ["provenance", (r) => isNonEmptyObject(r?.provenance)],
]);

/** Multilingual title fields whose language keys the audit records. */
export const STATION_TITLE_FIELDS = Object.freeze([
  "stationTitle",
  "railwayTitle",
  "operatorTitle",
]);

export const RAILWAY_TITLE_FIELDS = Object.freeze([
  "railwayTitle",
  "operatorTitle",
]);

/**
 * Coarse classification of a single timetable probe result (KAI-290 PR 2).
 *
 * This exists because `recordCount === 0` is NOT the same claim as "the
 * provider has no data". A response can also fail the boundary's byte guard
 * (`provider_response_too_large`) or be rejected outright. Conflating those
 * would let the audit report JR-East as "no timetables" when the truth is
 * "we could not fetch it". Every consumer must branch on this classifier,
 * never on `recordCount` alone.
 */
export const PROBE_EMPTY = "empty";
export const PROBE_RECORDS = "records";
export const PROBE_TOO_LARGE = "too_large";
export const PROBE_ERROR = "error";
export const PROBE_UNAVAILABLE = "unavailable";
/** The response arrived but could not be read as a Meguruto boundary payload. */
export const PROBE_MALFORMED = "malformed";

export function classifyProbeResult(descriptor) {
  if (!isRecord(descriptor)) {
    return { state: PROBE_UNAVAILABLE, detail: "no_result" };
  }
  const { state } = descriptor;
  if (state === "invalid" || state === "http_error") {
    // A 200 whose body is not the expected envelope, or an unreadable status:
    // we learned nothing about provider coverage, so this is NOT evidence of
    // zero records.
    return {
      state: PROBE_MALFORMED,
      detail: descriptor.error ?? "unreadable_response",
      note: "response could not be read as a boundary payload; coverage unknown",
    };
  }
  if (state !== "available") {
    return {
      state: PROBE_UNAVAILABLE,
      detail: descriptor.reason ?? descriptor.error ?? state,
    };
  }
  const errorCode =
    typeof descriptor.errorCode === "string" ? descriptor.errorCode : null;
  if (descriptor.outcome === "error" || errorCode) {
    // The boundary failed closed. `provider_response_too_large` in particular
    // means the provider likely HAS data that we refused to read wholesale.
    return {
      state:
        errorCode === "provider_response_too_large"
          ? PROBE_TOO_LARGE
          : PROBE_ERROR,
      detail: errorCode ?? "provider_error",
      recordCount: descriptor.recordCount,
      // A large response tells us the *scoped* query was too broad; it does not
      // tell us the answer. Say so explicitly rather than implying emptiness.
      note:
        errorCode === "provider_response_too_large"
          ? "response exceeded the boundary byte guard; coverage unknown, not empty"
          : "provider returned an error outcome; coverage unknown",
    };
  }
  if (descriptor.outcome !== "records") {
    return {
      state: PROBE_ERROR,
      detail: `unexpected_outcome:${String(descriptor.outcome)}`,
    };
  }
  const rawCount = descriptor.recordCount;
  // `outcome: "records"` without a usable count is NOT "zero records". A
  // missing / null / stringified / negative count means we cannot read how many
  // records came back, so it is coverage-unknown, never evidence of absence.
  if (!Number.isInteger(rawCount) || rawCount < 0) {
    return {
      state: PROBE_MALFORMED,
      detail: `invalid_record_count:${JSON.stringify(rawCount ?? null)}`,
      note: "record count is missing or not a non-negative integer; coverage unknown",
    };
  }
  return {
    state: rawCount > 0 ? PROBE_RECORDS : PROBE_EMPTY,
    recordCount: rawCount,
    ...(rawCount === 0
      ? { note: "provider returned a successful zero-record result" }
      : {}),
  };
}

/** Result states that document *proven* provider coverage (either way). */
export function isConclusiveProbe(state) {
  return state === PROBE_RECORDS || state === PROBE_EMPTY;
}

/**
 * Builds the per-operator timetable coverage section from already-fetched probe
 * results. Pure: no fetching, so this is the unit under test.
 *
 * `stationTimetable` and `trainTimetable` are arrays of `{ scope, descriptor }`
 * because a single station/railway is too small a sample to support any claim
 * about an operator; the operator-level probes are single descriptors.
 */
export function buildTimetableSection({
  trainType,
  railDirection,
  stationTimetable = [],
  trainTimetable = [],
  trainIdentityProbe = null,
  sampleSize = null,
}) {
  const stationGroup = summarizeProbeGroup(
    stationTimetable,
    describeTimetableRecords,
  );
  const trainGroup = summarizeProbeGroup(
    trainTimetable,
    describeTimetableRecords,
  );
  const operatorProbes = {
    trainType: classifyProbeResult(trainType),
    railDirection: classifyProbeResult(railDirection),
  };
  const identityProbe = trainIdentityProbe
    ? summarizeTrainIdentityProbe(trainIdentityProbe)
    : null;
  const conclusive =
    Object.values(operatorProbes).filter((entry) =>
      isConclusiveProbe(entry.state),
    ).length +
    stationGroup.conclusiveCount +
    trainGroup.conclusiveCount +
    (identityProbe && isConclusiveProbe(identityProbe.state) ? 1 : 0);
  const total =
    Object.keys(operatorProbes).length +
    stationGroup.probeCount +
    trainGroup.probeCount +
    (identityProbe ? 1 : 0);
  return {
    trainType: operatorProbes.trainType,
    railDirection: operatorProbes.railDirection,
    stationTimetable: stationGroup,
    trainTimetable: trainGroup,
    /** Narrow by-train-identity probe — the candidate runtime direction. */
    trainIdentityProbe: identityProbe,
    sampleSize,
    conclusiveProbes: conclusive,
    totalProbes: total,
    /**
     * True only when every planned probe produced a conclusive answer. Any
     * `too_large`/`error`/`unavailable`/`malformed` leaves coverage explicitly
     * unknown.
     */
    coverageKnown: total > 0 && conclusive === total,
  };
}

/** Field counts + ratios for a record set, in declared (stable) field order. */
export function summarizeRecords(records, fields) {
  const list = Array.isArray(records) ? records : [];
  const total = list.length;
  const stats = {};
  for (const [name, predicate] of fields) {
    let filled = 0;
    for (const record of list) {
      let ok = false;
      try {
        ok = predicate(record) === true;
      } catch {
        ok = false;
      }
      if (ok) filled += 1;
    }
    stats[name] = { filled, total, ratio: safeRatio(filled, total) };
  }
  return stats;
}

/**
 * Classifies one boundary HTTP response into the audit's state machine:
 *   available     — the operation is deployed and answered (incl. zero matches)
 *   pending       — `unsupported_operation`: not deployed yet
 *   invalid       — our request body was rejected (a tool bug, not a data gap)
 *   rate_limited  — HTTP 429
 *   http_error    — any other non-200
 *   transport_error — fetch threw before a response arrived
 */
export function parseBoundaryResponse(status, body) {
  if (status === 429) {
    return { state: "rate_limited", httpStatus: 429, error: "rate_limited" };
  }
  if (status === 405) {
    return {
      state: "http_error",
      httpStatus: 405,
      error: "method_not_allowed",
    };
  }
  if (status === 200) {
    if (
      !isRecord(body) ||
      body.provider !== "odpt" ||
      typeof body.outcome !== "string"
    ) {
      return { state: "invalid", httpStatus: 200, error: "unexpected_body" };
    }
    const records = Array.isArray(body.records) ? body.records : [];
    const recordCount = Number.isInteger(body.recordCount)
      ? body.recordCount
      : records.length;
    return {
      state: "available",
      httpStatus: 200,
      outcome: body.outcome,
      errorCode: typeof body.errorCode === "string" ? body.errorCode : null,
      recordCount,
      records,
      retrievedAt:
        typeof body.retrievedAt === "string" ? body.retrievedAt : null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : "",
      normalization:
        typeof body.normalization === "string" ? body.normalization : null,
    };
  }
  if (status === 400) {
    const error =
      isRecord(body) && typeof body.error === "string" ? body.error : "unknown";
    if (error === "unsupported_operation") {
      return { state: "pending", httpStatus: 400, error };
    }
    return { state: "invalid", httpStatus: 400, error };
  }
  return {
    state: "http_error",
    httpStatus: Number.isInteger(status) ? status : null,
    error:
      isRecord(body) && typeof body.error === "string" ? body.error : "unknown",
  };
}

/**
 * Picks bounded probe scopes for the timetable pass (KAI-290 PR 2).
 *
 * Timetable endpoints cannot be queried operator-wide: live measurement showed
 * such responses exceed the boundary's byte guard (`provider_response_too_large`)
 * for operators that actually publish timetables. So the audit samples a small,
 * FIXED-SIZE set of stations and asks each sampled station's OWN railway for
 * train timetables, so every station/railway pair is coherent rather than two
 * unrelated records. `sampleSize` is recorded so the reader can see how much of
 * the operator was actually covered, and a scoped result is evidence about that
 * scope only — never a whole-operator claim.
 */
export function deriveTimetableScopes(
  { station, railway } = {},
  sampleSize = DEFAULT_TIMETABLE_SAMPLE,
) {
  const stationRecords =
    isRecord(station) && Array.isArray(station.records) ? station.records : [];
  const railwayRecords =
    isRecord(railway) && Array.isArray(railway.records) ? railway.records : [];

  const stations = [];
  for (const record of stationRecords) {
    if (stations.length >= sampleSize) break;
    if (typeof record?.id !== "string" || record.id.length === 0) continue;
    stations.push({
      id: record.id,
      title: typeof record.title === "string" ? record.title : null,
      railway:
        typeof record.railway === "string" && record.railway.length > 0
          ? record.railway
          : null,
    });
  }

  // Fall back to the operator's first railway when a sampled station carries no
  // railway reference, so train-timetable coverage is still probed at least once.
  const fallbackRailway =
    railwayRecords.find(
      (record) =>
        typeof record?.sameAs === "string" && record.sameAs.length > 0,
    )?.sameAs ?? null;

  const railways = [];
  for (const entry of stations) {
    const candidate = entry.railway ?? fallbackRailway;
    if (candidate && !railways.includes(candidate)) railways.push(candidate);
  }

  return {
    stations,
    railways,
    sampleSize,
    station: stations[0]?.id ?? null,
    stationName: stations[0]?.title ?? null,
    railway: railways[0] ?? null,
  };
}

/**
 * Aggregates a group of identically-shaped scoped probes into a compact summary
 * that keeps every non-conclusive state visible instead of collapsing it.
 */
export function summarizeProbeGroup(results, describeExtras = null) {
  const byState = {};
  let conclusive = 0;
  const entries = [];
  for (const { scope, descriptor } of results) {
    const classified = classifyProbeResult(descriptor);
    byState[classified.state] = (byState[classified.state] ?? 0) + 1;
    if (isConclusiveProbe(classified.state)) conclusive += 1;
    const extra =
      describeExtras && isConclusiveProbe(classified.state)
        ? (describeExtras(descriptor) ?? {})
        : {};
    entries.push({
      scope,
      state: classified.state,
      ...(isConclusiveProbe(classified.state)
        ? { recordCount: classified.recordCount }
        : {}),
      ...(classified.note ? { note: classified.note } : {}),
      ...(classified.detail ? { detail: classified.detail } : {}),
      ...extra,
    });
  }
  return {
    probeCount: entries.length,
    conclusiveCount: conclusive,
    coverageKnown: entries.length > 0 && conclusive === entries.length,
    byState,
    results: entries,
  };
}

/**
 * Describes a conclusive timetable probe by what it actually contains, so the
 * audit records *evidence shape* and not just a count. Object counts are read
 * from normalized records only; a non-conclusive probe contributes nothing.
 */
export function describeTimetableRecords(descriptor) {
  const records =
    isRecord(descriptor) && Array.isArray(descriptor.records)
      ? descriptor.records
      : [];
  if (records.length === 0) return {};
  let stopObjectCount = 0;
  const calendars = [];
  for (const record of records) {
    if (Array.isArray(record?.objects))
      stopObjectCount += record.objects.length;
    if (
      typeof record?.calendar === "string" &&
      record.calendar.length > 0 &&
      !calendars.includes(record.calendar)
    ) {
      calendars.push(record.calendar);
    }
  }
  return {
    stopObjectCount,
    ...(calendars.length > 0 ? { calendarsObserved: calendars.sort() } : {}),
  };
}

/**
 * Picks a train identity to probe TrainTimetable by, taken from a
 * StationTimetable record the provider itself returned.
 *
 * This is the runtime direction the audit is meant to validate: identify a
 * service narrowly, then fetch its TrainTimetable by exact identity. It is
 * derived from provider data rather than hard-coded, so the probe stays
 * reproducible on a fresh run.
 */
export function deriveTrainIdentityFromStationTimetable(records) {
  const list = Array.isArray(records) ? records : [];
  for (const record of list) {
    for (const object of Array.isArray(record?.objects) ? record.objects : []) {
      const train = object?.train;
      if (typeof train === "string" && train.length > 0) return train;
    }
  }
  return null;
}

/**
 * Summarises a narrow TrainTimetable-by-train-identity probe, capturing the
 * ordered stop evidence one record provides (origin, destination, stop count).
 */
export function summarizeTrainIdentityProbe({ trainIdentity, descriptor }) {
  const classified = classifyProbeResult(descriptor);
  const entry = {
    trainIdentity,
    state: classified.state,
    ...(classified.note ? { note: classified.note } : {}),
    ...(classified.detail ? { detail: classified.detail } : {}),
  };
  if (!isConclusiveProbe(classified.state)) return entry;
  entry.recordCount = classified.recordCount;
  const records = Array.isArray(descriptor?.records) ? descriptor.records : [];
  const first = records[0];
  if (isRecord(first)) {
    entry.trainNumber =
      typeof first.trainNumber === "string" ? first.trainNumber : null;
    entry.originStation = Array.isArray(first.originStation)
      ? first.originStation
      : [];
    entry.destinationStation = Array.isArray(first.destinationStation)
      ? first.destinationStation
      : [];
    entry.stopObjectCount = Array.isArray(first.objects)
      ? first.objects.length
      : 0;
    // Preserved tri-state: `true`, `false` and "not supplied" all differ.
    entry.needExtraFee =
      typeof first.needExtraFee === "boolean" ? first.needExtraFee : null;
    if (typeof first.calendar === "string") entry.calendar = first.calendar;
    if (typeof first.date === "string") entry.date = first.date;
    if (typeof first.validUntil === "string") {
      entry.validUntil = first.validUntil;
    }
  }
  return entry;
}

/**
 * Picks the first railway (provider order preserved) with at least two ordered
 * stations, so a fare probe can be issued against a real station pair.
 */
export function deriveFareProbe(railwayRecords) {
  const list = Array.isArray(railwayRecords) ? railwayRecords : [];
  for (const railway of list) {
    const order = Array.isArray(railway?.stationOrder)
      ? railway.stationOrder
      : [];
    const stations = order
      .map((entry) => (isNonEmptyString(entry?.station) ? entry.station : null))
      .filter((station) => station !== null);
    if (stations.length >= 2) {
      return {
        fromStation: stations[0],
        toStation: stations[1],
        railway: isNonEmptyString(railway?.id) ? railway.id : null,
      };
    }
  }
  return null;
}

/** Builds a coverage section from one boundary descriptor. */
export function coverageSection(
  descriptor,
  fields,
  { countsAreLowerBounds = true } = {},
) {
  const base = {
    state: descriptor?.state ?? "transport_error",
    httpStatus: descriptor?.httpStatus ?? null,
    outcome: descriptor?.outcome ?? null,
    errorCode: descriptor?.errorCode ?? null,
    error: descriptor?.error ?? null,
    recordCount: null,
    countsAreLowerBounds,
    truncation: null,
    fields: null,
  };
  if (!descriptor || descriptor.state === "skipped") {
    base.state = "skipped";
    base.skippedReason = descriptor?.reason ?? "budget_exhausted";
    return base;
  }
  if (descriptor.state === "available") {
    base.recordCount = descriptor.recordCount;
    base.truncation = truncationSignals(
      descriptor.recordCount,
      countsAreLowerBounds,
    );
    base.fields = summarizeRecords(descriptor.records, fields);
  }
  return base;
}

/** Collects station ids whose coordinates are missing, sorted, capped. */
export function missingCoordinateIds(records, cap = DEFAULT_MAX_IDS) {
  const list = Array.isArray(records) ? records : [];
  const missing = list
    .filter((record) => !isValidCoordinates(record?.coordinates))
    .map((record) => (isNonEmptyString(record?.id) ? record.id : null))
    .filter((id) => id !== null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    count: missing.length,
    truncated: missing.length > cap,
    ids: missing.slice(0, cap),
  };
}

/**
 * Aggregates the multilingual title keys actually observed on a record set.
 * ODPT documents these fields as "multilingual-support" without closing the
 * language set, so the audit reports what the provider really returned rather
 * than assuming {ja, en}.
 */
export function observedTitleLanguages(records, titleFields) {
  const list = Array.isArray(records) ? records : [];
  const counts = new Map();
  let recordsWithTitles = 0;
  for (const record of list) {
    let foundOnRecord = false;
    for (const field of titleFields) {
      const value = record?.[field];
      if (!isNonEmptyObject(value)) continue;
      for (const key of Object.keys(value)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        foundOnRecord = true;
      }
    }
    if (foundOnRecord) recordsWithTitles += 1;
  }
  return {
    languages: [...counts.entries()]
      .map(([language, count]) => ({ language, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.language < b.language ? -1 : a.language > b.language ? 1 : 0),
      ),
    distinctLanguageCount: counts.size,
    recordsWithTitles,
    recordsWithoutTitles: list.length - recordsWithTitles,
  };
}

/**
 * Samples provider freshness/revision timestamps so the pilot can reason about
 * cache TTLs from real `dc:date` / `dct:issued` / `dct:valid` values instead of
 * guessing.
 */
export function freshnessSample(records) {
  const list = Array.isArray(records) ? records : [];
  const collect = (field) =>
    [...new Set(list.map((record) => record?.[field]).filter(isNonEmptyString))]
      .filter((value) => value.length > 0)
      .sort();
  const generatedDates = collect("date");
  const validUntilDates = collect("validUntil");
  return {
    generatedAt: {
      distinct: generatedDates.length,
      earliest: generatedDates[0] ?? null,
      latest: generatedDates[generatedDates.length - 1] ?? null,
      example: generatedDates[0] ?? null,
    },
    validUntil: {
      distinct: validUntilDates.length,
      earliest: validUntilDates[0] ?? null,
      latest: validUntilDates[validUntilDates.length - 1] ?? null,
      example: validUntilDates[0] ?? null,
    },
  };
}

/**
 * Builds the per-operator section — pure: all inputs are already-fetched
 * descriptors, so this is the unit of test coverage for the audit shape.
 */
export function buildOperatorSection({
  operator,
  station,
  railway,
  fare,
  fareProbe,
  timetable = null,
}) {
  const stationSection = coverageSection(station, STATION_FIELDS, {
    countsAreLowerBounds: true,
  });
  const railwaySection = coverageSection(railway, RAILWAY_FIELDS, {
    countsAreLowerBounds: true,
  });
  // A fare lookup is keyed by an explicit station pair, so it is not truncated.
  const fareSection = coverageSection(fare, FARE_FIELDS, {
    countsAreLowerBounds: false,
  });
  fareSection.probe = fareProbe
    ? {
        fromStation: fareProbe.fromStation,
        toStation: fareProbe.toStation,
        railway: fareProbe.railway,
      }
    : null;

  const stationLanguages =
    stationSection.state === "available"
      ? observedTitleLanguages(station.records, STATION_TITLE_FIELDS)
      : null;
  const railwayLanguages =
    railwaySection.state === "available"
      ? observedTitleLanguages(railway.records, RAILWAY_TITLE_FIELDS)
      : null;

  return {
    operator,
    station: stationSection,
    railway: railwaySection,
    railwayFare: fareSection,
    /** KAI-290 PR 2: timetable/reference coverage, incl. unknown states. */
    timetable,
    /**
     * Multilingual title languages observed (API v4.16 documents these fields as
     * open-ended "multilingual-support").
     */
    multilingualTitles: {
      station: stationLanguages,
      railway: railwayLanguages,
      /** Union of every language key seen on this operator's records. */
      languages: [
        ...new Set([
          ...(stationLanguages?.languages ?? []).map((entry) => entry.language),
          ...(railwayLanguages?.languages ?? []).map((entry) => entry.language),
        ]),
      ].sort(),
    },
    /** Provider freshness/revision timestamps observed on this operator. */
    freshness: {
      station:
        stationSection.state === "available"
          ? freshnessSample(station.records)
          : null,
      railway:
        railwaySection.state === "available"
          ? freshnessSample(railway.records)
          : null,
    },
    missingCoordinateStationIds:
      stationSection.state === "available"
        ? missingCoordinateIds(station.records)
        : null,
  };
}

/** Findings derived purely from the assembled operator sections. */
export function deriveFindings(operators) {
  const findings = [];
  for (const section of operators) {
    const station = section.station;
    if (station.state !== "available") continue;
    const coordinates = station.fields?.coordinates;
    if (coordinates && coordinates.filled < coordinates.total) {
      findings.push({
        kind: "station_coordinates_missing",
        operator: section.operator,
        missing: coordinates.total - coordinates.filled,
        total: coordinates.total,
      });
    }
    if (station.truncation?.isSuspiciousRoundNumber) {
      findings.push({
        kind: "suspicious_round_number_station_count",
        operator: section.operator,
        count: station.recordCount,
      });
    }
    // A railway without station ordering cannot contribute stop sequencing,
    // which is exactly the kind of gap the pilot must be chosen around.
    const railway = section.railway;
    if (railway.state === "available") {
      const order = railway.fields?.stationOrder;
      if (order && order.filled < order.total) {
        findings.push({
          kind: "railway_station_order_missing",
          operator: section.operator,
          missing: order.total - order.filled,
          total: order.total,
        });
      }
      const lineCode = railway.fields?.lineCode;
      if (lineCode && lineCode.filled === 0) {
        findings.push({
          kind: "railway_line_code_absent",
          operator: section.operator,
          total: lineCode.total,
        });
      }
    }
    if (
      section.railway.state === "available" &&
      section.railway.truncation?.isSuspiciousRoundNumber
    ) {
      findings.push({
        kind: "suspicious_round_number_railway_count",
        operator: section.operator,
        count: section.railway.recordCount,
      });
    }
    const connectingStation = station.fields?.connectingStation;
    if (connectingStation && connectingStation.filled === 0) {
      findings.push({
        kind: "connecting_station_absent",
        operator: section.operator,
        total: connectingStation.total,
      });
    }

    // KAI-290 PR 2 timetable coverage. An unknown probe is reported as unknown,
    // never silently dropped — otherwise a fetch failure would read as "none".
    const operatorProbes = {
      trainType: section.timetable?.trainType,
      railDirection: section.timetable?.railDirection,
    };
    for (const [probeName, probe] of Object.entries(operatorProbes)) {
      if (!probe) continue;
      if (probe.state === PROBE_TOO_LARGE) {
        findings.push({
          kind: "timetable_coverage_unknown_too_large",
          operator: section.operator,
          probe: probeName,
          detail: probe.note,
        });
      } else if (probe.state === PROBE_ERROR) {
        findings.push({
          kind: "timetable_coverage_unknown_error",
          operator: section.operator,
          probe: probeName,
          detail: probe.detail ?? probe.note,
        });
      } else if (probe.state === PROBE_EMPTY) {
        findings.push({
          kind: "timetable_probe_empty",
          operator: section.operator,
          probe: probeName,
        });
      }
    }

    for (const [groupName, group] of Object.entries({
      stationTimetable: section.timetable?.stationTimetable,
      trainTimetable: section.timetable?.trainTimetable,
    })) {
      if (!group) continue;
      if (group.probeCount > 0 && group.conclusiveCount === group.probeCount) {
        const states = Object.keys(group.byState);
        // All-empty across a multi-station sample is a real, reportable gap;
        // a single probe could not support it.
        if (states.length === 1 && states[0] === PROBE_EMPTY) {
          findings.push({
            kind: "timetable_group_all_empty",
            operator: section.operator,
            probe: groupName,
            probes: group.probeCount,
          });
        }
      }
      for (const entry of group.results) {
        if (entry.state === PROBE_TOO_LARGE) {
          findings.push({
            kind: "timetable_coverage_unknown_too_large",
            operator: section.operator,
            probe: groupName,
            scope: entry.scope,
            detail: entry.note,
          });
        } else if (entry.state === PROBE_ERROR) {
          findings.push({
            kind: "timetable_coverage_unknown_error",
            operator: section.operator,
            probe: groupName,
            scope: entry.scope,
            detail: entry.detail,
          });
        } else if (entry.state === PROBE_MALFORMED) {
          findings.push({
            kind: "timetable_coverage_unknown_malformed",
            operator: section.operator,
            probe: groupName,
            scope: entry.scope,
            detail: entry.detail,
          });
        }
      }
    }

    if (section.timetable && section.timetable.coverageKnown === false) {
      findings.push({
        kind: "timetable_coverage_incomplete",
        operator: section.operator,
        conclusive: section.timetable.conclusiveProbes,
        total: section.timetable.totalProbes,
      });
    }
  }
  return findings;
}

/**
 * Resources required to derive schedule-backed journey evidence. An operator can
 * only be *conclusively excluded* when BOTH of these were actually probed and
 * every probe was conclusively empty.
 */
export const SCHEDULE_BEARING_RESOURCES = Object.freeze([
  "StationTimetable",
  "TrainTimetable",
]);

/** Every state a probe can carry once classified. */
const CLASSIFIED_PROBE_STATES = Object.freeze([
  PROBE_EMPTY,
  PROBE_RECORDS,
  PROBE_TOO_LARGE,
  PROBE_ERROR,
  PROBE_UNAVAILABLE,
  PROBE_MALFORMED,
]);

/**
 * Reduces a single probe to `records` / `empty` / `unknown` / `absent`.
 *
 * Accepts BOTH shapes on purpose: the timetable section stores *already
 * classified* probes (`trainType`, `railDirection`, `trainIdentityProbe`), while
 * a caller may also hand in a raw boundary descriptor. Re-classifying an
 * already-classified `{state: "empty"}` would read as "not available" and
 * wrongly downgrade real coverage to unknown, so the state is inspected first.
 */
export function describeProbeCoverage(descriptor) {
  if (!isRecord(descriptor)) return "absent";
  const { state } = descriptor;
  const classifiedState =
    typeof state === "string" && CLASSIFIED_PROBE_STATES.includes(state)
      ? state
      : classifyProbeResult(descriptor).state;
  if (!isConclusiveProbe(classifiedState)) return "unknown";
  return classifiedState === PROBE_RECORDS ? "records" : "empty";
}

/**
 * Reduces a group of scoped probes to a single coverage state.
 *
 * A group reads as `empty` only when it was actually probed AND every probe is
 * conclusively empty. A group that was never probed is `absent`; a group
 * containing any inconclusive probe (too_large / error / malformed /
 * unavailable / budget-skipped) is `unknown`. That distinction is the whole
 * point: failing to read a response must never be reported as absent data.
 */
export function describeGroupCoverage(group) {
  const probeCount = group?.probeCount ?? 0;
  if (probeCount === 0) return "absent";
  const byState = group?.byState ?? {};
  if ((byState[PROBE_RECORDS] ?? 0) > 0) return "records";
  const conclusive =
    (byState[PROBE_EMPTY] ?? 0) + (byState[PROBE_RECORDS] ?? 0);
  return conclusive === probeCount ? "empty" : "unknown";
}

/** Joins resource names as "A", "A or B", or "A, B, or C" for generated prose. */
export function joinWithOr(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} or ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, or ${list[list.length - 1]}`;
}

/**
 * Derives the timetable-pilot scope from measured coverage, so the artifact
 * states a *measured* conclusion rather than a hand-written assumption.
 *
 * Three-way by design. An operator is `excluded` only when the required
 * schedule-bearing probes were actually executed and conclusively empty; any
 * non-conclusive probe, missing scope, or un-run probe makes it `inconclusive`
 * instead. Wording is generated from the actual per-resource states, so a claim
 * is never made about a resource that returned records.
 *
 * Deliberately scoped to the audited corpus: ODPT search completeness is not
 * guaranteed, so this is observed zero coverage in our corpus, never a claim
 * about universal provider capability.
 */
export function derivePilotScope(operators) {
  const included = [];
  const excluded = [];
  const inconclusive = [];
  for (const section of operators) {
    const timetable = section.timetable;
    const shortName = section.operator.replace(/^odpt\.Operator:/, "");
    if (!timetable) {
      inconclusive.push({
        operator: section.operator,
        reason: "not_audited",
        blockingResources: { timetable: "absent" },
        note: "no timetable probes were run for this operator; nothing can be concluded either way",
      });
      continue;
    }

    const resourceCoverage = {
      TrainType: describeProbeCoverage(timetable.trainType),
      RailDirection: describeProbeCoverage(timetable.railDirection),
      StationTimetable: describeGroupCoverage(timetable.stationTimetable),
      TrainTimetable: describeGroupCoverage(timetable.trainTimetable),
    };
    const identityCoverage = describeProbeCoverage(
      timetable.trainIdentityProbe,
    );
    const evidence = {
      stationTimetableProbes: timetable.stationTimetable?.probeCount ?? 0,
      stationTimetableWithRecords:
        timetable.stationTimetable?.byState?.[PROBE_RECORDS] ?? 0,
      trainTimetableProbes: timetable.trainTimetable?.probeCount ?? 0,
      trainTimetableWithRecords:
        timetable.trainTimetable?.byState?.[PROBE_RECORDS] ?? 0,
      trainTypeState: timetable.trainType?.state ?? null,
      railDirectionState: timetable.railDirection?.state ?? null,
      trainIdentityProbeState: timetable.trainIdentityProbe?.state ?? null,
      resourceCoverage,
      trainIdentityProbeCoverage: identityCoverage,
    };

    // Only SCHEDULE-bearing evidence counts as usable for a timetable-backed
    // pilot. TrainType / RailDirection returning records does not enable a
    // journey, so it must not mark an operator as included.
    const hasScheduleEvidence =
      SCHEDULE_BEARING_RESOURCES.some(
        (resource) => resourceCoverage[resource] === "records",
      ) || identityCoverage === "records";
    if (hasScheduleEvidence) {
      included.push({
        operator: section.operator,
        reason: "usable_timetable_evidence_returned",
        evidence,
      });
      continue;
    }

    // Fail closed: anything that is not a conclusive, executed, empty result on
    // a schedule-bearing resource blocks a "no data" exclusion.
    const blockingResources = {};
    for (const resource of SCHEDULE_BEARING_RESOURCES) {
      if (resourceCoverage[resource] !== "empty") {
        blockingResources[resource] = resourceCoverage[resource];
      }
    }
    // An identity probe that was attempted but unreadable is also blocking.
    // `absent` is acceptable here only because it is a *consequence* of empty
    // station timetables (no train identity existed to derive), not a failed
    // read of a schedule-bearing resource.
    if (identityCoverage === "unknown") {
      blockingResources.TrainTimetableByIdentity = identityCoverage;
    }
    if (Object.keys(blockingResources).length > 0) {
      inconclusive.push({
        operator: section.operator,
        reason: "non_conclusive_schedule_evidence",
        blockingResources,
        note: "cannot conclusively exclude: the required schedule-bearing probes were not all executed with conclusive results",
        evidence,
      });
      continue;
    }

    // Conclusively excluded. Name ONLY the resources observed empty, so the
    // claim can never contradict a resource that returned records.
    const emptyResources = Object.keys(resourceCoverage).filter(
      (resource) => resourceCoverage[resource] === "empty",
    );
    const recordBearingResources = Object.keys(resourceCoverage).filter(
      (resource) => resourceCoverage[resource] === "records",
    );
    excluded.push({
      operator: section.operator,
      reason: "no_usable_timetable_data_in_audited_corpus",
      statement:
        `In the bounded authenticated production audit, no usable ${shortName} ` +
        `${joinWithOr(emptyResources)} data was returned across the sampled ` +
        `major stations and railways. ${shortName} therefore cannot participate ` +
        "in the current ODPT timetable-backed pilot.",
      emptyResources,
      recordBearingResources,
      evidence,
    });
  }
  return {
    included,
    excluded,
    inconclusive,
    /**
     * Static enrichment (geography, stop ordering, topology, canonical mapping)
     * is a separate concern and cannot substitute for schedule evidence.
     */
    staticEnrichmentNote:
      "Static enrichment may later supply station geography, stop ordering, topology " +
      "and canonical mapping, but it does NOT provide timetable-backed journey " +
      "duration while TrainTimetable/StationTimetable evidence is unavailable. " +
      "Verified schedule duration for such operators may require a different " +
      "authoritative source.",
    boundaryNote:
      "Broad StationTimetable queries and whole-railway TrainTimetable queries can " +
      "exceed the Meguruto boundary's 1 MB response guard; the boundary fails closed " +
      "with provider_response_too_large. The cap is not raised to normalise broad " +
      "runtime requests; narrow train-identity queries are the runtime direction.",
  };
}

/**
 * Assembles the committed artifact with a fixed, stable top-level key order.
 * `operators` are expected pre-sorted; arrays are never re-ordered here.
 */
export function buildCoverageArtifact({
  generatedAt,
  operators,
  referenceProbes,
  requestBudget,
  sourceUrlSample,
  checks,
  calendar = null,
}) {
  const sortedOperators = [...operators].sort((a, b) =>
    a.operator < b.operator ? -1 : a.operator > b.operator ? 1 : 0,
  );
  return {
    schemaVersion: 2,
    tool: "kai-290-odpt-coverage",
    generatedAt,
    boundaryUrl: BOUNDARY_URL,
    boundaryOnly: true,
    countsAreLowerBounds: true,
    requestBudget: {
      maxRequests: requestBudget.maxRequests,
      requestsMade: requestBudget.requestsMade,
      delayMs: requestBudget.delayMs,
      budgetExhausted: requestBudget.budgetExhausted === true,
      rateLimitHalted: requestBudget.rateLimitHalted === true,
    },
    sourceUrlSample: sourceUrlSample ?? null,
    /** KAI-290 PR 2: provider-wide Calendar reference probe. */
    calendar,
    /** KAI-290 PR 2: pilot scope derived from the measured coverage above. */
    pilotScope: derivePilotScope(sortedOperators),
    operators: sortedOperators,
    referenceProbes,
    findings: deriveFindings(sortedOperators),
    checks: {
      boundaryOnly: true,
      noCredentialLeak: checks?.noCredentialLeak === true,
      operatorCount: sortedOperators.length,
    },
  };
}

/** Byte-order comparator, used everywhere ordering must be deterministic. */
export function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic JSON serialiser: object keys are emitted in byte-order at every
 * level, arrays keep their (already deterministic) order. Used by the test to
 * prove stable key order.
 */
export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareStrings);
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Renders a GitHub-flavoured Markdown table formatted exactly the way Prettier
 * normalises it (column padding + `:---` alignment markers), so the generated
 * summary stays prettier-clean without a post-processing step.
 */
export function formatTable(headers, aligns, rows) {
  const widths = headers.map((header, index) => {
    let width = Math.max(String(header).length, 3);
    for (const row of rows) {
      width = Math.max(width, String(row[index] ?? "").length);
    }
    return width;
  });
  const alignCell = (text, width, align) => {
    const value = String(text ?? "");
    if (align === "right") return value.padStart(width, " ");
    if (align === "center") {
      const total = width - value.length;
      const left = Math.floor(total / 2);
      return " ".repeat(left) + value + " ".repeat(total - left);
    }
    return value.padEnd(width, " ");
  };
  const separator = widths.map((width, index) => {
    if (aligns[index] === "right") return `${"-".repeat(width - 1)}:`;
    if (aligns[index] === "center") return `:${"-".repeat(width - 2)}:`;
    return "-".repeat(width);
  });
  const renderRow = (cells) =>
    `| ${widths
      .map((width, index) => alignCell(cells[index], width, aligns[index]))
      .join(" | ")} |`;
  return [renderRow(headers), renderRow(separator), ...rows.map(renderRow)];
}

/** Human-readable summary. Pure; consumes only the artifact. */
export function renderMarkdown(artifact) {
  const lines = [];
  lines.push("# KAI-290 — ODPT operator coverage audit");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push(`Boundary: ${artifact.boundaryUrl} (the only endpoint contacted)`);
  lines.push(
    `Requests: ${artifact.requestBudget.requestsMade}/${artifact.requestBudget.maxRequests} ` +
      `(budget exhausted: ${artifact.requestBudget.budgetExhausted ? "yes" : "no"}, ` +
      `rate-limit halted: ${artifact.requestBudget.rateLimitHalted ? "yes" : "no"})`,
  );
  lines.push("");
  lines.push(
    "> ODPT silently truncates broad search results at a system upper limit, so every",
  );
  lines.push(
    "> `station` / `railway` count below is a LOWER BOUND, not an exact total.",
  );
  lines.push("");
  lines.push("## Per-operator coverage");
  lines.push("");
  const tableRows = artifact.operators.map((section) => {
    const station = section.station;
    const railway = section.railway;
    const stations =
      station.state === "available"
        ? String(station.recordCount)
        : station.state;
    const coords = station.fields?.coordinates;
    const coordsFilled =
      coords && station.state === "available"
        ? `${coords.filled}/${coords.total}`
        : "n/a";
    const coordRatio = coords ? formatRatio(coords.ratio) : "n/a";
    const railways =
      railway.state === "available"
        ? String(railway.recordCount)
        : railway.state;
    const order = railway.fields?.stationOrder;
    const orderFilled =
      order && railway.state === "available"
        ? `${order.filled}/${order.total}`
        : "n/a";
    return [
      section.operator,
      stations,
      coordsFilled,
      coordRatio,
      railways,
      orderFilled,
    ];
  });
  lines.push(
    ...formatTable(
      [
        "Operator",
        "Stations",
        "Station coords",
        "Coord coverage",
        "Railways",
        "Railway stationOrder",
      ],
      ["left", "right", "right", "right", "right", "right"],
      tableRows,
    ),
  );
  lines.push("");

  const gapFindings = artifact.findings.filter(
    (finding) => finding.kind === "station_coordinates_missing",
  );
  if (gapFindings.length > 0) {
    lines.push("## Station coordinate gap");
    lines.push("");
    for (const finding of gapFindings) {
      lines.push(
        `- ${finding.operator}: ${finding.total - finding.missing}/${finding.total} stations carry coordinates ` +
          `(${finding.missing} missing)`,
      );
    }
    lines.push("");
  }

  const roundFindings = artifact.findings.filter((finding) =>
    finding.kind.startsWith("suspicious_round_number"),
  );
  if (roundFindings.length > 0) {
    lines.push("## Truncation suspicions");
    lines.push("");
    for (const finding of roundFindings) {
      lines.push(
        `- ${finding.operator}: ${finding.kind.replace("suspicious_round_number_", "")} count is exactly ${finding.count} — likely truncated`,
      );
    }
    lines.push("");
  }

  // Detailed per-operator evidence: transfer metadata, fares, multilingual
  // titles and provider freshness. These decide which matching paths are safe.
  lines.push("## Per-operator evidence detail");
  lines.push("");
  for (const section of artifact.operators) {
    lines.push(`### ${section.operator}`);
    lines.push("");
    const station = section.station;
    const railway = section.railway;

    const connectingStation = station.fields?.connectingStation;
    const connectingRailway = station.fields?.connectingRailway;
    lines.push(
      `- connectingStation: ${connectingStation ? `${connectingStation.filled}/${connectingStation.total} (${formatRatio(connectingStation.ratio)})` : "n/a"}`,
    );
    lines.push(
      `- connectingRailway: ${connectingRailway ? `${connectingRailway.filled}/${connectingRailway.total} (${formatRatio(connectingRailway.ratio)})` : "n/a"}`,
    );
    lines.push(
      `- station stationCode: ${station.fields?.stationCode ? `${station.fields.stationCode.filled}/${station.fields.stationCode.total}` : "n/a"}`,
    );
    lines.push(
      `- railway lineCode: ${railway.fields?.lineCode ? `${railway.fields.lineCode.filled}/${railway.fields.lineCode.total}` : "n/a"}`,
    );
    lines.push(
      `- railway direction fields: ${railway.fields?.ascendingRailDirection ? `${railway.fields.ascendingRailDirection.filled}/${railway.fields.ascendingRailDirection.total}` : "n/a"}`,
    );
    const fare = section.railwayFare;
    lines.push(
      `- RailwayFare: ${fare.state === "available" ? `available (${fare.recordCount} record${fare.recordCount === 1 ? "" : "s"})` : fare.state}${fare.skippedReason ? ` — ${fare.skippedReason}` : ""}`,
    );
    if (fare.probe) {
      lines.push(
        `  - probe pair: ${fare.probe.fromStation} → ${fare.probe.toStation}`,
      );
    }

    const languages = section.multilingualTitles?.languages ?? [];
    lines.push(
      `- multilingual title languages observed (${languages.length}): ${languages.length > 0 ? languages.join(", ") : "none"}`,
    );

    const stationFreshness = section.freshness?.station;
    if (stationFreshness) {
      lines.push(
        `- station dc:date: latest ${stationFreshness.generatedAt.latest ?? "n/a"} (${stationFreshness.generatedAt.distinct} distinct)`,
      );
      lines.push(
        `- station dct:valid: latest ${stationFreshness.validUntil.latest ?? "n/a"}`,
      );
    }
    lines.push("");
  }

  // KAI-290 PR 2: timetable/reference coverage. States are explicit so a
  // non-conclusive probe can never be misread as "the provider has none".
  lines.push("## Timetable and reference coverage");
  lines.push("");
  lines.push(
    "Probe states: `records` / `empty` are conclusive provider answers; `too_large` (response exceeded the boundary byte guard) and `error` are **unknown**, not empty.",
  );
  lines.push("");
  if (artifact.calendar) {
    const cal = artifact.calendar;
    lines.push(
      `- \`calendar\` (provider-wide): **${cal.state}**${Number.isInteger(cal.recordCount) ? ` — ${cal.recordCount} record(s)` : ""}`,
    );
    lines.push("");
  }
  for (const section of artifact.operators) {
    if (!section.timetable) continue;
    lines.push(`### ${section.operator}`);
    lines.push("");
    const scope = section.timetable.scope ?? {};
    lines.push(
      `- probe scope (${section.timetable.sampleSize ?? "?"} station sample): ${(scope.stations ?? []).map((station) => `\`${station}\``).join(", ") || "n/a"}`,
    );
    lines.push(
      `- railways probed: ${(scope.railways ?? []).map((railway) => `\`${railway}\``).join(", ") || "n/a"}`,
    );
    lines.push(
      "- scoped results are evidence about those stations/railways only — **not** a whole-operator claim",
    );
    for (const name of ["trainType", "railDirection"]) {
      const probe = section.timetable[name];
      if (!probe) continue;
      const count = isConclusiveProbe(probe.state)
        ? ` — ${probe.recordCount} record(s)`
        : "";
      const note = probe.note ? ` (${probe.note})` : "";
      lines.push(`- ${name}: **${probe.state}**${count}${note}`);
    }
    for (const groupName of ["stationTimetable", "trainTimetable"]) {
      const group = section.timetable[groupName];
      if (!group) continue;
      const states = Object.entries(group.byState)
        .map(([state, count]) => `${state}×${count}`)
        .join(", ");
      lines.push(
        `- ${groupName}: ${group.probeCount} probe(s) — ${states}${group.coverageKnown ? "" : " — **coverage unknown**"}`,
      );
      for (const entry of group.results) {
        const label =
          entry.scope?.station ?? entry.scope?.railway ?? "unknown scope";
        const count = isConclusiveProbe(entry.state)
          ? ` — ${entry.recordCount} record(s)`
          : "";
        const stops = Number.isInteger(entry.stopObjectCount)
          ? `, ${entry.stopObjectCount} stop object(s)`
          : "";
        const calendars = Array.isArray(entry.calendarsObserved)
          ? `, calendars: ${entry.calendarsObserved.join(", ")}`
          : "";
        const note = entry.note ? ` (${entry.note})` : "";
        lines.push(
          `  - ${label}: **${entry.state}**${count}${stops}${calendars}${note}`,
        );
      }
    }
    const identity = section.timetable.trainIdentityProbe;
    if (identity) {
      lines.push(
        `- trainIdentityProbe (\`${identity.trainIdentity}\`): **${identity.state}**` +
          (isConclusiveProbe(identity.state)
            ? ` — ${identity.recordCount} record(s), ${identity.stopObjectCount} ordered stop object(s)` +
              (identity.originStation?.length
                ? `, ${identity.originStation.join("/")} → ${(identity.destinationStation ?? []).join("/")}`
                : "") +
              `, needExtraFee: ${identity.needExtraFee === null ? "not supplied" : identity.needExtraFee}`
            : ` (${identity.note ?? identity.detail ?? ""})`),
      );
    }
    lines.push(
      `- coverage conclusively known: ${section.timetable.coverageKnown ? "yes" : `no (${section.timetable.conclusiveProbes}/${section.timetable.totalProbes} conclusive)`}`,
    );
    lines.push("");
  }

  lines.push(
    "## Timetable-backed pilot scope (derived from the measurements above)",
  );
  lines.push("");
  const pilotScope = artifact.pilotScope ?? {};
  lines.push(
    `- **Included**: ${(pilotScope.included ?? []).map((entry) => `\`${entry.operator}\``).join(", ") || "(none)"}`,
  );
  for (const entry of pilotScope.excluded ?? []) {
    lines.push(`- **Excluded**: \`${entry.operator}\` — ${entry.reason}`);
    if (entry.statement) {
      lines.push("");
      lines.push(`  > ${entry.statement}`);
      lines.push("");
      lines.push(
        "  Scoped to the audited corpus on purpose. ODPT search completeness is not guaranteed, so this is **observed zero coverage in our audited corpus**, not a claim about universal provider capability.",
      );
    }
    if (
      Array.isArray(entry.recordBearingResources) &&
      entry.recordBearingResources.length > 0
    ) {
      lines.push(
        `  Note: ${entry.recordBearingResources.join(", ")} did return records; the exclusion above names only the resources observed empty.`,
      );
    }
  }
  for (const entry of pilotScope.inconclusive ?? []) {
    lines.push(
      `- **Inconclusive**: \`${entry.operator}\` — ${entry.reason}${
        entry.blockingResources
          ? ` (blocking: ${Object.entries(entry.blockingResources)
              .map(([resource, state]) => `${resource}=${state}`)
              .join(", ")})`
          : ""
      }`,
    );
    if (entry.note) lines.push(`  ${entry.note}`);
  }
  if (pilotScope.staticEnrichmentNote) {
    lines.push("");
    lines.push(`- ${pilotScope.staticEnrichmentNote}`);
  }
  if (pilotScope.boundaryNote) {
    lines.push(`- ${pilotScope.boundaryNote}`);
  }
  lines.push("");

  lines.push("## Provider-wide reference resources");
  lines.push("");
  if (
    !Array.isArray(artifact.referenceProbes) ||
    artifact.referenceProbes.length === 0
  ) {
    lines.push("- (none probed)");
  } else {
    for (const entry of artifact.referenceProbes) {
      const label =
        entry.state === "pending"
          ? "not available (operation not deployed)"
          : entry.state;
      lines.push(
        `- ${entry.operation} — ${label}${entry.evidence ? `: ${entry.evidence}` : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push(
    `- Boundary-only contact: ${artifact.checks.boundaryOnly ? "pass" : "fail"}`,
  );
  lines.push(
    `- No credential in any response: ${artifact.checks.noCredentialLeak ? "pass" : "fail"}`,
  );
  lines.push(`- Operators audited: ${artifact.checks.operatorCount}`);
  if (artifact.sourceUrlSample) {
    lines.push(
      `- Sample source URL (credential-free): ${artifact.sourceUrlSample}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

// ── Runtime (explicitly invoked only) ────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CredentialLeakError extends Error {
  constructor() {
    super("credential-like content detected in a boundary response; aborting");
    this.name = "CredentialLeakError";
  }
}

/** Sequential, budget-bounded, rate-aware boundary caller. */
class BoundaryRunner {
  constructor({ url, maxRequests, delayMs, fetchImpl }) {
    this.url = url;
    this.maxRequests = maxRequests;
    this.delayMs = delayMs;
    this.fetchImpl = fetchImpl;
    this.requestsMade = 0;
    this.budgetExhausted = false;
    this.rateLimitHalted = false;
  }

  async call(body) {
    if (this.requestsMade >= this.maxRequests) {
      this.budgetExhausted = true;
      return { state: "skipped", reason: "budget_exhausted" };
    }
    if (this.rateLimitHalted) {
      return { state: "skipped", reason: "rate_limited" };
    }
    let honouredBackoff = false;
    for (;;) {
      if (this.requestsMade > 0) await sleep(this.delayMs);
      this.requestsMade += 1;
      let status = null;
      let body_ = null;
      let text = "";
      let retryAfterSeconds = null;
      try {
        const response = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        status = response.status;
        retryAfterSeconds = parseRetryAfterSeconds(
          response.headers?.get?.("Retry-After"),
        );
        text = await response.text();
        if (containsCredentialLike(text)) throw new CredentialLeakError();
        try {
          body_ = text ? JSON.parse(text) : null;
        } catch {
          body_ = null;
        }
      } catch (error) {
        if (error instanceof CredentialLeakError) throw error;
        return {
          state: "transport_error",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (status === 429) {
        const parsed = parseBoundaryResponse(status, body_);
        parsed.retryAfterSeconds = retryAfterSeconds;
        if (!honouredBackoff && this.requestsMade < this.maxRequests) {
          honouredBackoff = true;
          const wait = Math.min(
            retryAfterSeconds && retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : this.delayMs,
            MAX_429_BACKOFF_MS,
          );
          await sleep(wait);
          continue;
        }
        this.rateLimitHalted = true;
        return parsed;
      }
      return parseBoundaryResponse(status, body_);
    }
  }
}

/** Parses a Retry-After header (seconds or HTTP-date) into seconds; 0 if absent. */
export function parseRetryAfterSeconds(headerValue) {
  if (typeof headerValue !== "string" || headerValue.trim().length === 0)
    return 0;
  const asNumber = Number(headerValue.trim());
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.floor(asNumber);
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return 0;
}

/** Converts one pending-operation probe result into a reported entry. */
export function buildPendingEntry(operation, descriptor) {
  const entry = { operation, state: descriptor.state };
  if (descriptor.state === "available") {
    entry.recordCount = descriptor.recordCount;
    entry.outcome = descriptor.outcome ?? null;
  } else if (descriptor.state === "pending") {
    entry.evidence = "unsupported_operation (HTTP 400) — pending deployment";
  } else if (descriptor.state === "invalid") {
    entry.evidence = `request rejected: ${descriptor.error}`;
  } else if (descriptor.state === "rate_limited") {
    entry.evidence = "rate limited (HTTP 429)";
  } else if (descriptor.state === "skipped") {
    entry.evidence = `skipped: ${descriptor.reason}`;
  } else {
    entry.evidence = `${descriptor.state}${descriptor.error ? `: ${descriptor.error}` : ""}`;
  }
  return entry;
}

function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, filePath);
}

function printHelp() {
  console.log(`KAI-290 ODPT per-operator coverage audit

Calls ONLY the Meguruto boundary ${BOUNDARY_URL}; never api.odpt.org,
never a credential. Writes a machine-readable JSON artifact plus a Markdown
summary, atomically.

Usage:
  node scripts/audit/kai-290-odpt-coverage.mjs [options]

Options:
  --operators=a,b,c     Operator ids to audit (default: ${DEFAULT_OPERATORS.join(", ")})
  --out=PATH            JSON artifact path (default: ${DEFAULT_OUT})
  --max-requests=N      Hard cap on total boundary requests (default ${DEFAULT_MAX_REQUESTS}, max ${HARD_MAX_REQUESTS})
  --delay=MS            Delay between sequential calls (default ${DEFAULT_DELAY_MS} ms)
  --no-fare             Skip the per-operator railway_fare probe
  --no-timetable        Skip the timetable/reference probes (calendar, train_type,
                        rail_direction, StationTimetable, TrainTimetable)
  -h, --help            Show this help
`);
}

/**
 * Serializes the artifact as Prettier-canonical JSON.
 *
 * Generated artifacts in this repository (including everything under `qa/`) are
 * covered by `npm run format:check`, so a committed audit artifact must be in
 * Prettier style to keep that gate meaningful. Prettier is an optional
 * devDependency here: when it is unavailable (production install, or the script
 * is run from a bare checkout) the script still emits valid, stable JSON rather
 * than failing the audit.
 */
async function serializeArtifact(artifact) {
  const plain = `${JSON.stringify(artifact, null, 2)}\n`;
  try {
    const prettier = await import("prettier");
    const config = (await prettier.resolveConfig(process.cwd())) ?? {};
    return await prettier.format(plain, { ...config, parser: "json" });
  } catch {
    return plain;
  }
}

async function main(argv) {
  let config;
  try {
    config = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (config.help) {
    printHelp();
    return 0;
  }

  const runner = new BoundaryRunner({
    url: BOUNDARY_URL,
    maxRequests: config.maxRequests,
    delayMs: config.delayMs,
    fetchImpl: fetch,
  });

  let noCredentialLeak = true;
  let sourceUrlSample = null;
  const operators = [];

  for (const operator of config.operators) {
    const station = await runner.call({ operation: "station", operator });
    if (
      station.state === "available" &&
      !sourceUrlSample &&
      station.sourceUrl
    ) {
      sourceUrlSample = station.sourceUrl;
    }
    const railway = await runner.call({ operation: "railway", operator });
    const fareProbe =
      config.fare && railway.state === "available"
        ? deriveFareProbe(railway.records)
        : null;
    let fare = {
      state: "skipped",
      reason: config.fare ? "no_fare_probe" : "fare_disabled",
    };
    if (fareProbe) {
      fare = await runner.call({
        operation: "railway_fare",
        fromStation: fareProbe.fromStation,
        toStation: fareProbe.toStation,
        operator,
      });
    }

    // KAI-290 PR 2: timetable/reference coverage. Every probe is scoped and
    // every non-conclusive outcome is preserved as `unknown`, never as "none".
    let timetable = null;
    if (config.timetable) {
      const scopes = deriveTimetableScopes(
        { station, railway },
        config.timetableSample,
      );
      const stationTimetable = [];
      for (const entry of scopes.stations) {
        stationTimetable.push({
          scope: { station: entry.id, stationName: entry.title },
          descriptor: await runner.call({
            operation: "station_timetable",
            station: entry.id,
          }),
        });
      }
      const trainTimetable = [];
      for (const railwayId of scopes.railways) {
        trainTimetable.push({
          scope: { railway: railwayId },
          descriptor: await runner.call({
            operation: "train_timetable",
            railway: railwayId,
          }),
        });
      }

      // Narrow by-identity probe. Whole-railway TrainTimetable can exceed the
      // boundary's byte guard, so derive ONE train identity from a
      // StationTimetable record the provider returned and query it exactly.
      // This is what the runtime is expected to do, so the audit measures it.
      let trainIdentityProbe = null;
      const sourceRecords = stationTimetable.find(
        (entry) =>
          entry.descriptor?.state === "available" &&
          Array.isArray(entry.descriptor.records) &&
          entry.descriptor.records.length > 0,
      )?.descriptor?.records;
      const trainIdentity =
        deriveTrainIdentityFromStationTimetable(sourceRecords);
      if (trainIdentity) {
        trainIdentityProbe = {
          trainIdentity,
          descriptor: await runner.call({
            operation: "train_timetable",
            train: trainIdentity,
          }),
        };
      }

      timetable = {
        ...buildTimetableSection({
          trainType: await runner.call({ operation: "train_type", operator }),
          railDirection: await runner.call({
            operation: "rail_direction",
            operator,
          }),
          stationTimetable,
          trainTimetable,
          trainIdentityProbe,
          sampleSize: scopes.sampleSize,
        }),
        scope: {
          stations: scopes.stations.map((entry) => entry.id),
          railways: scopes.railways,
        },
      };
    }

    operators.push(
      buildOperatorSection({
        operator,
        station,
        railway,
        fare,
        fareProbe,
        timetable,
      }),
    );
  }

  // Provider-wide reference data (Calendar is a finite, non-operator list).
  let calendarProbe = null;
  if (config.timetable) {
    const calendar = await runner.call({ operation: "calendar" });
    calendarProbe = {
      ...classifyProbeResult(calendar),
      ...(typeof calendar.sourceUrl === "string"
        ? { sourceUrl: calendar.sourceUrl }
        : {}),
      ...(calendar.retrievedAt ? { retrievedAt: calendar.retrievedAt } : {}),
    };
  }

  const referenceProbes = [];
  for (const probe of REFERENCE_RESOURCE_PROBES) {
    const body = probe.needsOperator
      ? { ...probe.body, operator: config.operators[0] }
      : probe.body;
    const result = await runner.call(body);
    referenceProbes.push(buildPendingEntry(probe.operation, result));
  }

  if (sourceUrlSample && containsCredentialLike(sourceUrlSample)) {
    noCredentialLeak = false;
  }

  const artifact = buildCoverageArtifact({
    generatedAt: new Date().toISOString(),
    operators,
    referenceProbes,
    calendar: calendarProbe,
    requestBudget: {
      maxRequests: config.maxRequests,
      requestsMade: runner.requestsMade,
      delayMs: config.delayMs,
      budgetExhausted: runner.budgetExhausted,
      rateLimitHalted: runner.rateLimitHalted,
    },
    sourceUrlSample,
    checks: { noCredentialLeak },
  });

  const jsonPath = path.resolve(process.cwd(), config.out);
  const markdownPath = jsonPath.replace(/\.json$/i, "") + ".md";
  await atomicWrite(jsonPath, await serializeArtifact(artifact));
  atomicWrite(markdownPath, renderMarkdown(artifact));

  console.log(
    `KAI-290 coverage audit: ${runner.requestsMade}/${config.maxRequests} requests, ` +
      `${operators.length} operator(s)`,
  );
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
      process.exitCode = 1;
    });
}
