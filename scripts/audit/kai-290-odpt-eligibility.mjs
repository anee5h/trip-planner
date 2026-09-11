#!/usr/bin/env node
/**
 * KAI-290 — ODPT integration-readiness (eligibility) audit.
 *
 * Answers one question, deterministically and OFFLINE: how often could a
 * user-facing surface show a verified ODPT timetable duration, given the #390
 * primitive's contract (`exact ODPT station -> exact ODPT station`, plus a real
 * service date and a bounded departure window)?
 *
 * Design guarantees (non-negotiable):
 *   OFFLINE    — reads committed catalogue artifacts only. Issues NO network
 *                request, touches NO provider endpoint, reads NO credential.
 *   EXPLICIT   — runs only when invoked as the CLI entry point; importing the
 *                module performs no I/O (see the `isMain` guard), so its logic is
 *                unit-testable.
 *   REPRODUCIBLE — deterministic ordering and stable JSON key order, so re-runs
 *                are diffable.
 *   HONEST     — an ineligible record is classified by BLOCKING REASON, never
 *                counted as `eligible` on the strength of a name, a coordinate,
 *                or a municipality centroid.
 *
 * WHAT THIS IS NOT: it does not map stations, does not guess identities, and
 * does not modify the catalogue. It measures the gap and names its shape.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Catalogue artifact scanned for destination-side station anchors. */
export const CATALOGUE_PATH = "src/shared/data/destinations-index.json";

/**
 * Matches a genuine ODPT identity value (`odpt.Station:…`, `odpt.Railway:…`, …).
 * A bare word like "station" in a display string must never match.
 */
export const ODPT_IDENTITY_PATTERN =
  /odpt\.(Station|Railway|Operator|Train|RailDirection|TrainType)[.:]/;

/**
 * Fields that could in principle carry an arrival-station identity. None of these
 * exists on the current schema; they are listed so a FUTURE schema addition is
 * detected by this audit rather than silently missed.
 */
export const STATION_ANCHOR_FIELD_CANDIDATES = Object.freeze([
  "arrivalStationId",
  "arrivalStationIds",
  "alternateArrivalStationId",
  "alternateStationId",
  "arrivalStation",
  "odptStationId",
  "odptId",
  "sameAs",
  // Note: `nearestStation` (free text) and `nearestStationId` (a destination id)
  // are deliberately ABSENT — neither is an ODPT station anchor.
]);

/**
 * Evidence paths that would make a destination station anchor
 * `deterministically_resolvable` rather than `unavailable`. Each requires an
 * EXPLICIT, exact identity reference — never a name, distance or centroid.
 */
export const DETERMINISTIC_ANCHOR_PATHS = Object.freeze([
  "explicit_odpt_station_id",
  "explicit_canonical_mapping",
  "linked_station_record_with_identity",
]);

/** Per-record destination-side classification. */
export const DESTINATION_ANCHOR_STATUS = Object.freeze({
  /** Carries an exact ODPT identity usable as the arrival station. */
  EXACT: "exact",
  /** Not exact itself, but an explicit mapping reference makes it resolvable. */
  DETERMINISTICALLY_RESOLVABLE: "deterministically_resolvable",
  /** More than one plausible exact anchor, with no rule to choose. */
  AMBIGUOUS: "ambiguous",
  /** No exact identity evidence of any kind. The honest default. */
  UNAVAILABLE: "unavailable",
});

/** Blocking reasons, in the precedence order the audit reports them. */
export const BLOCKER_REASONS = Object.freeze([
  "destination_station_identity_missing",
  "destination_station_identity_ambiguous",
  "origin_station_identity_missing",
  "departure_time_input_absent",
  "service_date_context_absent",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively collects every string value under `value`. */
function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out);
    return out;
  }
  if (isPlainObject(value)) {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
  return out;
}

/** True when a record contains a genuine ODPT identity anywhere. */
export function containsOdptIdentity(record) {
  return collectStrings(record).some((value) =>
    ODPT_IDENTITY_PATTERN.test(value),
  );
}

/**
 * Collects exact ODPT station identities from fields that NAME a station anchor.
 *
 * Deliberately narrow, and deliberately NOT a blind recursive scan: an identity
 * string that merely appears somewhere inside a record (a note, a free-text
 * basis, a nested mapping) is evidence that a mapping EXISTS — not evidence about
 * which station this destination arrives at. Promoting such a value to `exact`
 * would let a mapping masquerade as an anchor, which is precisely the identity
 * corruption this audit must not commit.
 *
 * A display string such as `"Sendai Station (then express bus)"` is never an
 * identity either.
 */
export function collectStationIdentities(record) {
  if (!isPlainObject(record)) return [];
  const found = new Set();
  for (const field of STATION_ANCHOR_FIELD_CANDIDATES) {
    for (const candidate of collectStrings(record[field])) {
      if (candidate.startsWith("odpt.Station:")) found.add(candidate);
    }
  }
  return [...found].sort();
}

/**
 * Station identities present ANYWHERE in a record (diagnostic only).
 *
 * Reported so an audit can see that identity strings exist without a usable
 * anchor field, but it never promotes a record's classification.
 */
export function collectStationIdentitiesAnywhere(record) {
  if (!isPlainObject(record)) return [];
  const found = new Set();
  for (const value of collectStrings(record)) {
    if (value.startsWith("odpt.Station:")) found.add(value);
  }
  return [...found].sort();
}

/** True when a record exposes an explicit canonical-mapping reference. */
export function hasExplicitCanonicalMapping(record) {
  if (!isPlainObject(record)) return false;
  const odptMapping = record.odptMapping ?? record.canonicalMapping;
  return isPlainObject(odptMapping) && Object.keys(odptMapping).length > 0;
}

/**
 * Classifies ONE catalogue record's destination-side anchor availability.
 *
 * Fail-closed: the default is `unavailable`. Only explicit identity evidence
 * promotes a record, and several competing identities with no disambiguating rule
 * are `ambiguous` rather than a silent pick.
 */
export function classifyDestinationAnchor(record) {
  const identities = collectStationIdentities(record);
  if (identities.length === 1) {
    return {
      status: DESTINATION_ANCHOR_STATUS.EXACT,
      identities,
      path: "explicit_odpt_station_id",
    };
  }
  if (identities.length > 1) {
    return {
      status: DESTINATION_ANCHOR_STATUS.AMBIGUOUS,
      identities,
      path: null,
    };
  }
  if (hasExplicitCanonicalMapping(record)) {
    return {
      status: DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE,
      identities: [],
      path: "explicit_canonical_mapping",
    };
  }
  return {
    status: DESTINATION_ANCHOR_STATUS.UNAVAILABLE,
    identities: [],
    path: null,
    // Diagnostic: identity strings may exist without a usable anchor field. This
    // never promotes the status, but it explains WHY a record is unavailable.
    identitiesElsewhere: collectStationIdentitiesAnywhere(record),
  };
}

/**
 * Resolves the eligibility of one catalogue record into a blocker reason.
 *
 * The destination-side answer decides it here, because on current main the
 * origin side and the scheduling inputs are uniformly absent — the report states
 * that separately rather than pretending per-record variation exists.
 */
export function classifyEligibility(record) {
  const anchor = classifyDestinationAnchor(record);
  if (anchor.status === DESTINATION_ANCHOR_STATUS.EXACT) {
    return { eligible: true, blocker: null, anchor };
  }
  if (
    anchor.status === DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE
  ) {
    // Resolvable, but no origin identity or departure window exists yet, so it is
    // still not user-facing eligible. Blocked on the inputs, not on the anchor.
    return {
      eligible: false,
      blocker: "origin_station_identity_missing",
      anchor,
    };
  }
  if (anchor.status === DESTINATION_ANCHOR_STATUS.AMBIGUOUS) {
    return {
      eligible: false,
      blocker: "destination_station_identity_ambiguous",
      anchor,
    };
  }
  return {
    eligible: false,
    blocker: "destination_station_identity_missing",
    anchor,
  };
}

/**
 * Builds the deterministic eligibility artifact from catalogue records.
 *
 * Pure: takes records, returns a report. No I/O, no clock, no randomness.
 */
export function buildEligibilityReport(records, options = {}) {
  const originIdentityAvailable = options.originIdentityAvailable === true;
  const departureTimeInputAvailable =
    options.departureTimeInputAvailable === true;
  const serviceDateContextAvailable =
    options.serviceDateContextAvailable === true;

  const anchorCounts = {
    [DESTINATION_ANCHOR_STATUS.EXACT]: 0,
    [DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE]: 0,
    [DESTINATION_ANCHOR_STATUS.AMBIGUOUS]: 0,
    [DESTINATION_ANCHOR_STATUS.UNAVAILABLE]: 0,
  };
  const blockerCounts = Object.fromEntries(
    BLOCKER_REASONS.map((reason) => [reason, 0]),
  );

  const perRecord = records.map((record) => {
    const verdict = classifyEligibility(record);
    anchorCounts[verdict.anchor.status] += 1;
    if (verdict.blocker !== null) blockerCounts[verdict.blocker] += 1;
    return {
      id: isPlainObject(record) ? (record.id ?? null) : null,
      anchorStatus: verdict.anchor.status,
      anchorPath: verdict.anchor.path,
      identities: verdict.anchor.identities,
      ...(Array.isArray(verdict.anchor.identitiesElsewhere)
        ? { identitiesElsewhere: verdict.anchor.identitiesElsewhere }
        : {}),
      blocker: verdict.blocker,
    };
  });

  // A record is user-facing eligible only when EVERY input is satisfied: the
  // anchor is exact AND the origin identity, the departure window and a service
  // date all exist. Anything less is not shippable, so it is not counted here.
  const eligibleRecords = perRecord.filter(
    (entry) =>
      entry.anchorStatus === DESTINATION_ANCHOR_STATUS.EXACT &&
      originIdentityAvailable &&
      departureTimeInputAvailable &&
      serviceDateContextAvailable,
  );

  return {
    totalCatalogueRecords: records.length,
    destinationAnchors: {
      exact: anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT],
      deterministicallyResolvable:
        anchorCounts[DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE],
      ambiguous: anchorCounts[DESTINATION_ANCHOR_STATUS.AMBIGUOUS],
      unavailable: anchorCounts[DESTINATION_ANCHOR_STATUS.UNAVAILABLE],
    },
    inputs: {
      originStationIdentity: {
        available: originIdentityAvailable,
        classification: originIdentityAvailable
          ? "deterministically_resolvable"
          : "unavailable",
      },
      destinationStationIdentity: {
        available: anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT] > 0,
        classification:
          anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT] > 0
            ? "exact"
            : "unavailable",
      },
      serviceDate: {
        available: serviceDateContextAvailable,
        classification: serviceDateContextAvailable
          ? "deterministically_resolvable"
          : "unavailable",
      },
      departureTimeInput: {
        available: departureTimeInputAvailable,
        classification: departureTimeInputAvailable
          ? "deterministically_resolvable"
          : "unavailable",
      },
    },
    blockers: blockerCounts,
    userFacingEligibleCohort: eligibleRecords.length,
    eligibleRecordIds: eligibleRecords
      .map((entry) => entry.id)
      .filter(Boolean)
      .sort(),
    /**
     * Only records that are NOT uniformly `unavailable` are listed individually.
     * With an all-unavailable catalogue the full per-record dump would be ~1130
     * identical rows and would bury the signal; listing just the exceptions keeps
     * the artifact small and DIFFABLE, so a future eligible record shows up as an
     * explicit diff rather than being lost in bulk.
     */
    notableRecords: perRecord.filter(
      (entry) =>
        entry.anchorStatus !== DESTINATION_ANCHOR_STATUS.UNAVAILABLE ||
        (Array.isArray(entry.identitiesElsewhere) &&
          entry.identitiesElsewhere.length > 0),
    ),
  };
}

/** Renders the report as a stable, human-readable Markdown summary. */
export function renderEligibilityMarkdown(report) {
  const lines = [
    "# KAI-290 — ODPT integration-readiness (eligibility) coverage",
    "",
    "Deterministic OFFLINE audit. No network, no provider call, no credential.",
    "",
    `- Total catalogue records: **${report.totalCatalogueRecords}**`,
    `- Exact ODPT destination station identities: **${report.destinationAnchors.exact}**`,
    `- Deterministically resolvable destination identities: **${report.destinationAnchors.deterministicallyResolvable}**`,
    `- Ambiguous destination identities: **${report.destinationAnchors.ambiguous}**`,
    `- Unavailable destination identities: **${report.destinationAnchors.unavailable}**`,
    `- Current departure-time input: **${report.inputs.departureTimeInput.available ? "present" : "absent"}**`,
    `- Current user-facing eligible cohort: **${report.userFacingEligibleCohort}**`,
    "",
    "## Input availability",
    "",
    "| Input | Available | Classification |",
    "| --- | --- | --- |",
  ];
  for (const [name, value] of Object.entries(report.inputs)) {
    lines.push(
      `| ${name} | ${value.available ? "yes" : "no"} | ${value.classification} |`,
    );
  }
  lines.push(
    "",
    "## Blocking reasons",
    "",
    "| Reason | Records |",
    "| --- | --- |",
  );
  for (const reason of BLOCKER_REASONS) {
    lines.push(`| ${reason} | ${report.blockers[reason]} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Reads the catalogue artifact. Explicit: called only by the CLI entry point. */
export function loadCatalogueRecords(cwd = process.cwd()) {
  const absolute = resolve(cwd, CATALOGUE_PATH);
  const parsed = JSON.parse(readFileSync(absolute, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  return parsed.destinations ?? parsed.items ?? [];
}

const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${resolve(process.argv[1])}`;

if (isMain) {
  const records = loadCatalogueRecords();
  const report = buildEligibilityReport(records, {
    // Verified absent on current main by the audit documented in
    // docs/kai-290-odpt-2d-integration-readiness.md. Passed explicitly so the
    // report cannot silently claim eligibility it has not measured.
    originIdentityAvailable: false,
    departureTimeInputAvailable: false,
    serviceDateContextAvailable: false,
  });
  // Deterministic JSON: stable key order. `notableRecords` is already the
  // compact exception list, so the whole report is safe to print.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n\n`);
  process.stdout.write(renderEligibilityMarkdown(report));
}
