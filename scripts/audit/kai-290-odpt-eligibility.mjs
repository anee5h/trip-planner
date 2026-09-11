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

/**
 * How available an input is. `flow_dependent` exists because a service date IS
 * present in some product flows and absent in others: collapsing that into a
 * catalogue-wide boolean would either hide a real capability or overstate it.
 */
export const INPUT_AVAILABILITY = Object.freeze({
  AVAILABLE: "available",
  FLOW_DEPENDENT: "flow_dependent",
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

/**
 * Canonical-mapping fields a registry may use. Each must resolve to an explicit
 * ODPT station target to count as station evidence.
 */
export const CANONICAL_MAPPING_FIELDS = Object.freeze([
  "odptMapping",
  "canonicalMapping",
]);

/**
 * Keys inside a canonical mapping that can name the station target. Unrelated
 * mapping metadata (`operator`, `railway`, notes, …) is NOT station evidence.
 */
export const CANONICAL_MAPPING_STATION_KEYS = Object.freeze([
  "station",
  "stationId",
  "odptStationId",
  "arrivalStation",
  "arrivalStationId",
  "alternateStation",
  "alternateStationId",
  "sameAs",
  "id",
]);

/**
 * Extracts explicit ODPT STATION targets from a record's canonical mapping.
 *
 * A mapping is station evidence only when it names a usable station target. A
 * non-empty mapping that carries only, say, `{ operator: "odpt.Operator:Toei" }`
 * describes the operator, not the arrival station, so it must not promote the
 * record — that would let unrelated mapping metadata masquerade as an anchor.
 */
export function collectCanonicalMappingStationTargets(record) {
  if (!isPlainObject(record)) return [];
  const found = new Set();
  for (const field of CANONICAL_MAPPING_FIELDS) {
    const mapping = record[field];
    if (!isPlainObject(mapping)) continue;
    for (const key of CANONICAL_MAPPING_STATION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(mapping, key)) continue;
      for (const value of collectStrings(mapping[key])) {
        if (value.startsWith("odpt.Station:")) found.add(value);
      }
    }
  }
  return [...found].sort();
}

/** True when a record exposes a usable canonical STATION mapping. */
export function hasExplicitCanonicalMapping(record) {
  return collectCanonicalMappingStationTargets(record).length > 0;
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
  const mappingTargets = collectCanonicalMappingStationTargets(record);
  if (mappingTargets.length === 1) {
    return {
      status: DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE,
      identities: [],
      path: "explicit_canonical_mapping",
    };
  }
  if (mappingTargets.length > 1) {
    // Several competing station targets in the mapping: no rule chooses between
    // them, so this is ambiguous rather than a silent pick.
    return {
      status: DESTINATION_ANCHOR_STATUS.AMBIGUOUS,
      identities: mappingTargets,
      path: null,
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
/**
 * Normalizes the caller-supplied input availability into the model above.
 * Anything not explicitly declared is treated as UNAVAILABLE — an audit must not
 * infer a capability from silence.
 */
export function normalizeInputAvailability(value) {
  if (value === true) return INPUT_AVAILABILITY.AVAILABLE;
  if (value === false || value == null) return INPUT_AVAILABILITY.UNAVAILABLE;
  const allowed = new Set(Object.values(INPUT_AVAILABILITY));
  return allowed.has(value) ? value : INPUT_AVAILABILITY.UNAVAILABLE;
}

/** Builds the availability context consumed by `classifyEligibility`. */
export function buildEligibilityContext(options = {}) {
  return {
    originIdentity: normalizeInputAvailability(options.originIdentity),
    departureWindow: normalizeInputAvailability(options.departureWindow),
    serviceDate: normalizeInputAvailability(options.serviceDate),
  };
}

/**
 * Classifies ONE record's user-facing eligibility, owning the FULL precedence.
 *
 * This is the single source of eligibility truth: the cohort is derived from
 * these verdicts and is never recomputed anywhere else. Precedence, in order:
 *
 *   1. destination unavailable              -> destination_station_identity_missing
 *   2. destination ambiguous                -> destination_station_identity_ambiguous
 *   3. destination not yet exact            -> destination_station_identity_missing
 *      (a resolvable-only anchor keeps its truthful status but is not eligible)
 *   4. exact destination + no origin        -> origin_station_identity_missing
 *   5. exact destination + no departure     -> departure_time_input_absent
 *   6. exact destination + no usable date   -> service_date_context_absent
 *   7. all four satisfied                   -> eligible
 *
 * A `flow_dependent` input can satisfy a record ONLY when the caller evaluates it
 * for a flow in which the input exists (`eligibilityScope: "flow"`). That is how a
 * planner-originated view can be eligible while a direct-page-load view stays
 * blocked, without pretending either is universal.
 */
export function classifyEligibility(record, context = {}) {
  const anchor = classifyDestinationAnchor(record);
  const resolved = buildEligibilityContext(context);
  const scope = context.eligibilityScope === "flow" ? "flow" : "catalogue";

  if (anchor.status === DESTINATION_ANCHOR_STATUS.UNAVAILABLE) {
    return {
      eligible: false,
      blocker: "destination_station_identity_missing",
      anchor,
      context: resolved,
    };
  }
  if (anchor.status === DESTINATION_ANCHOR_STATUS.AMBIGUOUS) {
    return {
      eligible: false,
      blocker: "destination_station_identity_ambiguous",
      anchor,
      context: resolved,
    };
  }
  if (
    anchor.status === DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE
  ) {
    // Truthful status is preserved: the anchor is resolvable but NOT exact, and a
    // resolvable-only anchor can never be user-facing eligible in this PR.
    return {
      eligible: false,
      blocker: "destination_station_identity_missing",
      anchor,
      context: resolved,
    };
  }

  // From here the destination anchor IS exact; the remaining gates decide.
  if (resolved.originIdentity !== INPUT_AVAILABILITY.AVAILABLE) {
    return {
      eligible: false,
      blocker: "origin_station_identity_missing",
      anchor,
      context: resolved,
    };
  }
  if (resolved.departureWindow !== INPUT_AVAILABILITY.AVAILABLE) {
    return {
      eligible: false,
      blocker: "departure_time_input_absent",
      anchor,
      context: resolved,
    };
  }
  if (
    resolved.serviceDate === INPUT_AVAILABILITY.UNAVAILABLE ||
    (resolved.serviceDate === INPUT_AVAILABILITY.FLOW_DEPENDENT &&
      scope !== "flow")
  ) {
    // A flow-dependent date is NOT assumed present for every request.
    return {
      eligible: false,
      blocker: "service_date_context_absent",
      anchor,
      context: resolved,
    };
  }
  return { eligible: true, blocker: null, anchor, context: resolved };
}

/**
 * Builds the deterministic eligibility artifact from catalogue records.
 *
 * Pure: takes records, returns a report. No I/O, no clock, no randomness.
 */
export function buildEligibilityReport(records, options = {}) {
  const context = buildEligibilityContext(options);
  const scope = options.eligibilityScope === "flow" ? "flow" : "catalogue";

  const anchorCounts = {
    [DESTINATION_ANCHOR_STATUS.EXACT]: 0,
    [DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE]: 0,
    [DESTINATION_ANCHOR_STATUS.AMBIGUOUS]: 0,
    [DESTINATION_ANCHOR_STATUS.UNAVAILABLE]: 0,
  };
  const blockerCounts = Object.fromEntries(
    BLOCKER_REASONS.map((reason) => [reason, 0]),
  );

  // EVERY verdict comes from `classifyEligibility`. There is deliberately no
  // second eligibility calculation here: re-deriving the cohort with a parallel
  // condition is how the audit came to report `exact anchor => eligible` and a
  // separately-gated cohort count at the same time.
  const perRecord = records.map((record) => {
    const verdict = classifyEligibility(record, {
      ...context,
      eligibilityScope: scope,
    });
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
      eligible: verdict.eligible,
      blocker: verdict.blocker,
    };
  });

  const eligibleRecords = perRecord.filter((entry) => entry.eligible === true);

  return {
    totalCatalogueRecords: records.length,
    destinationAnchors: {
      exact: anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT],
      deterministicallyResolvable:
        anchorCounts[DESTINATION_ANCHOR_STATUS.DETERMINISTICALLY_RESOLVABLE],
      ambiguous: anchorCounts[DESTINATION_ANCHOR_STATUS.AMBIGUOUS],
      unavailable: anchorCounts[DESTINATION_ANCHOR_STATUS.UNAVAILABLE],
    },
    /**
     * Input availability, each with an explicit availability state AND a
     * classification. `serviceDate` is deliberately `flow_dependent`: it exists
     * deterministically in planner/trip-context flows but NOT on every
     * direct-navigation request, so a catalogue-wide boolean would either hide a
     * real capability or overstate it. `eligibleCohortScope` records which flow
     * the cohort below was evaluated for.
     */
    inputs: {
      originStationIdentity: {
        availability: context.originIdentity,
        available: context.originIdentity === INPUT_AVAILABILITY.AVAILABLE,
        classification:
          context.originIdentity === INPUT_AVAILABILITY.AVAILABLE
            ? "deterministically_resolvable"
            : "unavailable",
      },
      destinationStationIdentity: {
        availability:
          anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT] > 0
            ? INPUT_AVAILABILITY.AVAILABLE
            : INPUT_AVAILABILITY.UNAVAILABLE,
        available: anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT] > 0,
        classification:
          anchorCounts[DESTINATION_ANCHOR_STATUS.EXACT] > 0
            ? "exact"
            : "unavailable",
      },
      serviceDate: {
        availability: context.serviceDate,
        available: context.serviceDate === INPUT_AVAILABILITY.AVAILABLE,
        classification:
          context.serviceDate === INPUT_AVAILABILITY.UNAVAILABLE
            ? "unavailable"
            : "deterministically_resolvable",
        evidence:
          context.serviceDate === INPUT_AVAILABILITY.UNAVAILABLE
            ? null
            : "navState.travelDate|tripContext.travelDate",
        /** True when a date exists only in some product flows. */
        flowDependent:
          context.serviceDate === INPUT_AVAILABILITY.FLOW_DEPENDENT,
      },
      departureTimeInput: {
        availability: context.departureWindow,
        available: context.departureWindow === INPUT_AVAILABILITY.AVAILABLE,
        classification:
          context.departureWindow === INPUT_AVAILABILITY.AVAILABLE
            ? "deterministically_resolvable"
            : "unavailable",
      },
    },
    /** Which flow the cohort was evaluated for: `catalogue` | `flow`. */
    eligibleCohortScope: scope,
    blockers: blockerCounts,
    // Derived DIRECTLY from the per-record verdicts above — never recomputed.
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
    `- Current user-facing eligible cohort: **${report.userFacingEligibleCohort}** (scope: \`${report.eligibleCohortScope}\`)`,
    "",
    "## Input availability",
    "",
    "| Input | Availability | Available | Classification | Notes |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const [name, value] of Object.entries(report.inputs)) {
    const notes = [];
    if (value.flowDependent) {
      // A flow-dependent input is NOT universally available: say so rather than
      // collapsing it into a misleading catalogue-wide boolean. Pipes are escaped
      // because the evidence value itself is pipe-separated and would otherwise
      // break the table.
      const evidence = value.evidence
        ? ` (${String(value.evidence).replace(/\|/g, "\\|")})`
        : "";
      notes.push(`exists only in some flows${evidence}`);
    }
    lines.push(
      `| ${name} | ${value.availability} | ${value.available ? "yes" : "no"} | ` +
        `${value.classification} | ${notes.join("; ")} |`,
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
  lines.push(
    "",
    "Eligibility is decided per record by ONE precedence rule, and the cohort above",
    "is derived directly from those verdicts. Inputs that are absent on current main",
    "are declared as such rather than inferred, and a `flow_dependent` input can",
    "satisfy a record only when the evaluation is scoped to a flow that supplies it.",
    "",
  );
  return lines.join("\n");
}

/** Raised when the catalogue input cannot be understood. */
export class UnsupportedCatalogueShapeError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedCatalogueShapeError";
  }
}

/**
 * Reads the catalogue artifact. Explicit: called only by the CLI entry point.
 *
 * Fails LOUDLY on an unrecognized shape. An evidence audit that silently degrades
 * an unreadable input into "zero catalogue records" would report a confident
 * negative result derived from nothing, which is the same class of error as
 * turning a failed provider read into "the provider has none".
 */
export function loadCatalogueRecords(cwd = process.cwd()) {
  const absolute = resolve(cwd, CATALOGUE_PATH);
  const parsed = JSON.parse(readFileSync(absolute, "utf8"));

  const records = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.destinations)
      ? parsed.destinations
      : isPlainObject(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : null;

  if (records === null) {
    const shape = Array.isArray(parsed)
      ? "array"
      : isPlainObject(parsed)
        ? `object with keys [${Object.keys(parsed).slice(0, 8).join(", ")}]`
        : typeof parsed;
    throw new UnsupportedCatalogueShapeError(
      `Unsupported catalogue shape in ${CATALOGUE_PATH}: expected an array, or an ` +
        `object with a \`destinations\` or \`items\` array; received ${shape}. ` +
        `Refusing to continue rather than reporting zero catalogue records.`,
    );
  }
  if (records.length === 0) {
    // An empty catalogue would make every coverage claim vacuous. The exact count
    // is NOT asserted (it may legitimately change); emptiness is.
    throw new UnsupportedCatalogueShapeError(
      `Catalogue at ${CATALOGUE_PATH} is empty. An eligibility audit over zero ` +
        `records cannot support any coverage claim.`,
    );
  }
  return records;
}

const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${resolve(process.argv[1])}`;

if (isMain) {
  const records = loadCatalogueRecords();
  const report = buildEligibilityReport(records, {
    // Verified on current main by the audit documented in
    // docs/kai-290-odpt-2d-integration-readiness.md. Declared explicitly so the
    // report cannot silently claim eligibility it has not measured.
    originIdentity: "unavailable",
    departureWindow: "unavailable",
    serviceDate: "flow_dependent",
    eligibilityScope: "catalogue",
  });
  // Deterministic JSON: stable key order. `notableRecords` is already the
  // compact exception list, so the whole report is safe to print.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n\n`);
  process.stdout.write(renderEligibilityMarkdown(report));
}
