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

/** Values ODPT has been observed to silently truncate at (lower bounds). */
const OPERATOR_ID_PATTERN = /^odpt\.Operator:[A-Za-z0-9._-]+$/;

/**
 * Operations that ship in this PR but are not yet deployed. Each is probed once
 * so the audit reports "not available (pending deployment)" honestly instead of
 * treating a not-yet-shipped operation as a data gap. Timetable probes need a
 * narrowing filter (the boundary requires one); the first audited operator is
 * injected at runtime.
 */
export const PENDING_OPERATION_PROBES = Object.freeze([
  {
    operation: "calendar",
    body: { operation: "calendar" },
    needsOperator: false,
  },
  {
    operation: "operator",
    body: { operation: "operator" },
    needsOperator: false,
  },
  {
    operation: "train_type",
    body: { operation: "train_type" },
    needsOperator: false,
  },
  {
    operation: "rail_direction",
    body: { operation: "rail_direction" },
    needsOperator: false,
  },
  {
    operation: "station_timetable",
    body: { operation: "station_timetable" },
    needsOperator: true,
  },
  {
    operation: "train_timetable",
    body: { operation: "train_timetable" },
    needsOperator: true,
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
  }
  return findings;
}

/**
 * Assembles the committed artifact with a fixed, stable top-level key order.
 * `operators` are expected pre-sorted; arrays are never re-ordered here.
 */
export function buildCoverageArtifact({
  generatedAt,
  operators,
  pendingOperations,
  requestBudget,
  sourceUrlSample,
  checks,
}) {
  const sortedOperators = [...operators].sort((a, b) =>
    a.operator < b.operator ? -1 : a.operator > b.operator ? 1 : 0,
  );
  return {
    schemaVersion: 1,
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
    operators: sortedOperators,
    pendingOperations,
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

  lines.push("## Pending operations (not yet deployed)");
  lines.push("");
  if (artifact.pendingOperations.length === 0) {
    lines.push("- (none probed)");
  } else {
    for (const entry of artifact.pendingOperations) {
      const label =
        entry.state === "pending"
          ? "not available (pending deployment)"
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
    operators.push(
      buildOperatorSection({ operator, station, railway, fare, fareProbe }),
    );
  }

  const pendingOperations = [];
  for (const probe of PENDING_OPERATION_PROBES) {
    const body = probe.needsOperator
      ? { ...probe.body, operator: config.operators[0] }
      : probe.body;
    const result = await runner.call(body);
    pendingOperations.push(buildPendingEntry(probe.operation, result));
  }

  if (sourceUrlSample && containsCredentialLike(sourceUrlSample)) {
    noCredentialLeak = false;
  }

  const artifact = buildCoverageArtifact({
    generatedAt: new Date().toISOString(),
    operators,
    pendingOperations,
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
