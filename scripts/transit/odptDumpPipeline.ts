/**
 * KAI-291B2 — dump validation, pilot extraction, snapshot manifest and
 * last-known-good promotion.
 *
 * Pure pipeline stages plus small filesystem promotion. The only network
 * lives in `odptDumpDownload.ts`; this module consumes downloaded bytes.
 * The B1 `importOdptRailTopology()` is the normalization gate — nothing here
 * re-implements or weakens it.
 *
 * Node-only (scripts/transit). No browser, no runtime wiring. No credentials:
 * manifests and errors carry sanitized endpoints only.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  importOdptRailTopology,
  type OdptImportMetadata,
} from "../../src/shared/services/transport/static/odptRailTopologyImporter";
import type {
  NormalizedTransitGraph,
  TransitCoverageReport,
} from "../../src/shared/services/transport/static/transitGraphTypes";
import type { DumpDownloadRecord } from "./odptDumpDownload";

/** Pilot operators: exact identities, never derived. */
export const PILOT_OPERATORS = [
  "odpt.Operator:TokyoMetro",
  "odpt.Operator:Toei",
] as const;

/**
 * Required pilot operators missing from a candidate graph (each must exist
 * exactly once; the B1 importer already rejects duplicate identities, so
 * this checks exact presence). Checked against the candidate itself — never
 * inferred from anchor survival, and applied to first-LKG candidates too.
 */
export function missingRequiredPilotOperators(
  graph: NormalizedTransitGraph,
): string[] {
  const present = new Set(
    graph.operators.map((operator) => operator.providerOperatorId),
  );
  return (PILOT_OPERATORS as readonly string[]).filter(
    (required) => !present.has(required),
  );
}

export type DumpPipelineErrorCode =
  | "invalid_json"
  | "html_error_page"
  | "non_array_root"
  | "malformed_record"
  | "wrong_resource_type"
  | "missing_identity"
  | "duplicate_identity"
  | "extraction_reference"
  | "anchor_identity_missing"
  | "promotion_refused";

export class DumpPipelineError extends Error {
  readonly code: DumpPipelineErrorCode;
  constructor(code: DumpPipelineErrorCode, message: string) {
    super(`odpt-dump-pipeline[${code}]: ${message}`);
    this.name = "DumpPipelineError";
    this.code = code;
  }
}

/** Licence gate states. Default is `unknown`. */
export type LicenseStatus =
  "reviewed_allowed" | "local_audit_only" | "restricted" | "unknown";

/** Production/public promotion needs explicit post-review allow-listing. */
export function licenceAllowsProductionPromotion(
  status: LicenseStatus,
): boolean {
  return status === "reviewed_allowed";
}

/** Ignored local-audit LKG promotion (never a public artifact). */
export function licenceAllowsLocalSnapshot(status: LicenseStatus): boolean {
  return (
    status === "reviewed_allowed" ||
    status === "local_audit_only" ||
    status === "unknown"
  );
}

export interface ValidatedDumpFamily {
  readonly rdfType: string;
  readonly records: readonly Record<string, unknown>[];
}

export interface PilotCounts {
  readonly raw: number;
  readonly filtered: number;
}

/**
 * Validates one downloaded dump body BEFORE the B1 importer ever sees it.
 * Malformed records reject the candidate; nothing is silently dropped.
 */
export function validateDumpFamily(
  rdfType: string,
  bodyText: string,
): ValidatedDumpFamily {
  const trimmed = bodyText.trimStart();
  if (trimmed.length === 0) {
    throw new DumpPipelineError("invalid_json", `${rdfType}: empty body.`);
  }
  if (trimmed.startsWith("<")) {
    throw new DumpPipelineError(
      "html_error_page",
      `${rdfType}: body is an HTML page, not dump JSON.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new DumpPipelineError(
      "invalid_json",
      `${rdfType}: body is not valid JSON.`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new DumpPipelineError(
      "non_array_root",
      `${rdfType}: top level must be a JSON array.`,
    );
  }
  const seen = new Set<string>();
  for (const record of parsed) {
    if (
      typeof record !== "object" ||
      record === null ||
      Array.isArray(record)
    ) {
      throw new DumpPipelineError(
        "malformed_record",
        `${rdfType}: entry is not an object.`,
      );
    }
    const entry = record as Record<string, unknown>;
    if (entry["@type"] !== rdfType) {
      throw new DumpPipelineError(
        "wrong_resource_type",
        `${rdfType}: entry carries @type ${JSON.stringify(entry["@type"])}.`,
      );
    }
    const sameAs = entry["owl:sameAs"];
    if (typeof sameAs !== "string" || sameAs.length === 0) {
      throw new DumpPipelineError(
        "missing_identity",
        `${rdfType}: entry carries no owl:sameAs.`,
      );
    }
    if (seen.has(sameAs)) {
      throw new DumpPipelineError(
        "duplicate_identity",
        `${rdfType}: duplicate owl:sameAs ${sameAs}.`,
      );
    }
    seen.add(sameAs);
  }
  return {
    rdfType,
    records: parsed as readonly Record<string, unknown>[],
  };
}

export interface PilotExtraction {
  readonly operators: readonly Record<string, unknown>[];
  readonly stations: readonly Record<string, unknown>[];
  readonly railways: readonly Record<string, unknown>[];
  readonly calendars: readonly Record<string, unknown>[];
  readonly rawCounts: Record<string, number>;
  readonly filteredCounts: Record<string, number>;
}

function stringField(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Derives the B1 TokyoMetro + Toei pilot input from VALIDATED full dump
 * families. No further ODPT queries: an unknown reference rejects the
 * candidate. Calendars carry no operator ownership in ODPT and pass through
 * complete.
 */
export function extractPilotScope(
  families: Record<string, readonly Record<string, unknown>[]>,
): PilotExtraction {
  const operators = (families["odpt:Operator"] ?? []).filter((record) =>
    (PILOT_OPERATORS as readonly string[]).includes(
      stringField(record, "owl:sameAs") ?? "",
    ),
  );
  const railways = (families["odpt:Railway"] ?? []).filter((record) =>
    (PILOT_OPERATORS as readonly string[]).includes(
      stringField(record, "odpt:operator") ?? "",
    ),
  );
  const railwayIds = new Set(
    railways.map((record) => stringField(record, "owl:sameAs")),
  );
  const stations = (families["odpt:Station"] ?? []).filter((record) => {
    const operator = stringField(record, "odpt:operator");
    const railway = stringField(record, "odpt:railway");
    if (
      operator === null ||
      !(PILOT_OPERATORS as readonly string[]).includes(operator)
    ) {
      return false;
    }
    if (railway === null || !railwayIds.has(railway)) {
      throw new DumpPipelineError(
        "extraction_reference",
        `station ${stringField(record, "owl:sameAs") ?? "(unknown)"} references ` +
          `railway ${JSON.stringify(railway)} outside the extracted scope.`,
      );
    }
    return true;
  });
  const calendars = families["odpt:Calendar"] ?? [];
  const rawCounts: Record<string, number> = {};
  const filteredCounts: Record<string, number> = {};
  for (const family of [
    "odpt:Operator",
    "odpt:Station",
    "odpt:Railway",
    "odpt:Calendar",
  ]) {
    rawCounts[family] = (families[family] ?? []).length;
  }
  filteredCounts["odpt:Operator"] = operators.length;
  filteredCounts["odpt:Station"] = stations.length;
  filteredCounts["odpt:Railway"] = railways.length;
  filteredCounts["odpt:Calendar"] = calendars.length;
  return {
    operators,
    stations,
    railways,
    calendars,
    rawCounts,
    filteredCounts,
  };
}

export interface SnapshotResourceEvidence {
  readonly rdfType: string;
  readonly sanitizedSourceEndpoint: string;
  readonly initialStatus: number;
  readonly sanitizedFinalHost: string | null;
  readonly sanitizedFinalPath: string | null;
  readonly httpStatus: number;
  readonly contentType: string | null;
  readonly contentLengthHeader: number | null;
  readonly bytesDownloaded: number;
  readonly rawSha256: string;
  readonly recordCount: number;
}

export interface SnapshotManifest {
  readonly snapshotId: string;
  readonly provider: "odpt";
  readonly identityNamespace: "odpt";
  readonly checkedAt: string;
  readonly retrievedAt: string;
  readonly resources: readonly SnapshotResourceEvidence[];
  readonly pilotOperators: readonly string[];
  readonly rawCounts: Record<string, number>;
  readonly filteredCounts: Record<string, number>;
  readonly normalized: {
    readonly schemaVersion: string;
    readonly contentHash: string;
    readonly sourceType: string;
    readonly completeness: string;
    readonly operatorCount: number;
    readonly stopCount: number;
    readonly routeCount: number;
    readonly routeStopCount: number;
    readonly calendarCount: number;
  };
  readonly coverage: TransitCoverageReport;
  readonly licenseGate: {
    readonly licenseStatus: LicenseStatus;
    readonly productionPromotionAllowed: boolean;
    readonly localSnapshotAllowed: boolean;
  };
  readonly promotion: {
    readonly status:
      "candidate" | "promoted_local" | "requires_review" | "rejected";
    readonly reason: string;
  };
}

/** Last-known-good pointer: small atomic JSON file, never a symlink. */
export interface LastKnownGoodPointer {
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly promotedAt: string;
  /**
   * Last successful provider check (wall-clock at the acquisition boundary).
   * Freshness for the operational LKG reads THIS, not the retrievedAt frozen
   * inside the unchanged semantic snapshot.
   */
  readonly lastCheckedAt: string;
}

export function snapshotIdFor(retrievedAt: string, rawSha256: string): string {
  const compact = retrievedAt.replace(/[-:.]/g, "").toLowerCase();
  return `odpt-${compact}-${rawSha256.slice(0, 8)}`;
}

/**
 * KAI-291A continuity gate: every trusted anchor identity must exist in the
 * candidate graph. Returns the missing identities (empty = gate passes).
 * Destination ids are never consulted — exact providerStopId identity only.
 */
export function missingAnchorIdentities(
  graph: NormalizedTransitGraph,
  anchorStationIds: readonly string[],
): string[] {
  const stops = new Set(graph.stops.map((stop) => stop.providerStopId));
  return anchorStationIds.filter((id) => !stops.has(id));
}

/** Reads trusted anchor station identities from the committed KAI-291A artifact. */
export function loadAnchorStationIds(
  readFile: (path: string) => string,
): string[] {
  const parsed = JSON.parse(
    readFile("qa/kai-291/destination-station-anchors.json"),
  ) as {
    anchors?: { odptStationId?: unknown }[];
  };
  const anchors = Array.isArray(parsed.anchors) ? parsed.anchors : [];
  return anchors
    .map((anchor) => anchor.odptStationId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export interface CandidateComparison {
  readonly operatorDelta: number;
  readonly stopDelta: number;
  readonly routeDelta: number;
  readonly routeStopDelta: number;
  readonly calendarDelta: number;
  readonly addedIdentities: readonly string[];
  readonly removedIdentities: readonly string[];
  readonly semanticHashChanged: boolean;
}

function stopIdentities(graph: NormalizedTransitGraph): Set<string> {
  return new Set(graph.stops.map((stop) => stop.providerStopId));
}

/** Compares a candidate graph against the LKG graph for review. */
export function compareCandidate(
  candidate: NormalizedTransitGraph,
  lastKnownGood: NormalizedTransitGraph | null,
): CandidateComparison {
  if (lastKnownGood === null) {
    const added = [...stopIdentities(candidate)].sort();
    return {
      operatorDelta: candidate.operators.length,
      stopDelta: candidate.stops.length,
      routeDelta: candidate.routes.length,
      routeStopDelta: candidate.routeStops.length,
      calendarDelta: candidate.calendars.length,
      addedIdentities: added,
      removedIdentities: [],
      semanticHashChanged: true,
    };
  }
  const before = stopIdentities(lastKnownGood);
  const after = stopIdentities(candidate);
  return {
    operatorDelta: candidate.operators.length - lastKnownGood.operators.length,
    stopDelta: candidate.stops.length - lastKnownGood.stops.length,
    routeDelta: candidate.routes.length - lastKnownGood.routes.length,
    routeStopDelta:
      candidate.routeStops.length - lastKnownGood.routeStops.length,
    calendarDelta: candidate.calendars.length - lastKnownGood.calendars.length,
    addedIdentities: [...after].filter((id) => !before.has(id)).sort(),
    removedIdentities: [...before].filter((id) => !after.has(id)).sort(),
    semanticHashChanged:
      candidate.datasetVersion.contentHash !==
      lastKnownGood.datasetVersion.contentHash,
  };
}

export type PromotionDecision =
  | { readonly decision: "promote_local"; readonly reasons: readonly string[] }
  | {
      readonly decision: "requires_review";
      readonly reasons: readonly string[];
    }
  | { readonly decision: "reject"; readonly reasons: readonly string[] };

/**
 * Promotion policy. AUTO-promote (local ignored LKG only — never a public
 * artifact) requires every gate to pass AND no removals AND a licence that
 * permits at least local snapshots. Anything else is requires_review or
 * reject; the caller must leave existing LKG bytes untouched.
 */
export function decidePromotion(input: {
  readonly missingAnchors: readonly string[];
  readonly removedIdentities: readonly string[];
  readonly missingRequiredOperators: readonly string[];
  readonly licenseStatus: LicenseStatus;
  readonly completenessIsComplete: boolean;
}): PromotionDecision {
  const reasons: string[] = [];
  if (input.missingAnchors.length > 0) {
    return {
      decision: "requires_review",
      reasons: [
        `KAI-291A anchor identities absent: ${input.missingAnchors.join(", ")}`,
      ],
    };
  }
  if (input.removedIdentities.length > 0) {
    return {
      decision: "requires_review",
      reasons: [
        `previously imported station identities removed: ${input.removedIdentities.join(", ")}`,
      ],
    };
  }
  if (input.missingRequiredOperators.length > 0) {
    return {
      decision: "requires_review",
      reasons: [
        `required pilot operators absent: ${input.missingRequiredOperators.join(", ")}`,
      ],
    };
  }
  if (!licenceAllowsLocalSnapshot(input.licenseStatus)) {
    return {
      decision: "reject",
      reasons: [
        `licence status ${input.licenseStatus} forbids even local snapshots`,
      ],
    };
  }
  if (!input.completenessIsComplete) {
    reasons.push("source is not a validated complete dump");
    return { decision: "requires_review", reasons };
  }
  return { decision: "promote_local", reasons: ["all gates passed"] };
}

/** Pure freshness helper with an injected now. Policy: 7-day threshold. */
export function freshnessStatus(
  checkedAt: string | null,
  nowMs: number,
): "fresh" | "stale" | "unknown" {
  if (checkedAt === null) return "unknown";
  const checkedMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedMs) || checkedMs > nowMs) return "unknown";
  return nowMs - checkedMs <= 7 * 24 * 60 * 60 * 1000 ? "fresh" : "stale";
}

/** Builds the candidate manifest. No credential fields exist anywhere. */
export function buildSnapshotManifest(input: {
  readonly snapshotId: string;
  readonly checkedAt: string;
  readonly retrievedAt: string;
  readonly downloads: readonly DumpDownloadRecord[];
  readonly rawCounts: Record<string, number>;
  readonly filteredCounts: Record<string, number>;
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
  readonly licenseStatus: LicenseStatus;
  readonly promotion: SnapshotManifest["promotion"];
}): SnapshotManifest {
  const resources: SnapshotResourceEvidence[] = input.downloads.map(
    (download) => {
      const lastHop = download.hops[download.hops.length - 1] ?? null;
      return {
        rdfType: download.rdfType,
        sanitizedSourceEndpoint: download.initialEndpoint,
        initialStatus: download.initialStatus,
        sanitizedFinalHost: lastHop?.targetOrigin ?? null,
        sanitizedFinalPath: lastHop?.targetPath ?? null,
        httpStatus: download.finalStatus,
        contentType: download.contentType,
        contentLengthHeader: download.contentLengthHeader,
        bytesDownloaded: download.bytesDownloaded,
        rawSha256: download.rawSha256,
        recordCount: input.rawCounts[download.rdfType] ?? 0,
      };
    },
  );
  const graph = input.graph;
  return {
    snapshotId: input.snapshotId,
    provider: "odpt",
    identityNamespace: "odpt",
    checkedAt: input.checkedAt,
    retrievedAt: input.retrievedAt,
    resources,
    pilotOperators: [...PILOT_OPERATORS],
    rawCounts: input.rawCounts,
    filteredCounts: input.filteredCounts,
    normalized: {
      schemaVersion: graph.datasetVersion.schemaVersion,
      contentHash: graph.datasetVersion.contentHash,
      sourceType: graph.datasetVersion.sourceType,
      completeness: graph.datasetVersion.completeness,
      operatorCount: graph.operators.length,
      stopCount: graph.stops.length,
      routeCount: graph.routes.length,
      routeStopCount: graph.routeStops.length,
      calendarCount: graph.calendars.length,
    },
    coverage: input.coverage,
    licenseGate: {
      licenseStatus: input.licenseStatus,
      productionPromotionAllowed: licenceAllowsProductionPromotion(
        input.licenseStatus,
      ),
      localSnapshotAllowed: licenceAllowsLocalSnapshot(input.licenseStatus),
    },
    promotion: input.promotion,
  };
}

/** Runs the B1 importer as the normalization gate with dump metadata. */
export function normalizePilotExtraction(
  extraction: PilotExtraction,
  metadata: OdptImportMetadata,
): {
  readonly graph: NormalizedTransitGraph;
  readonly coverage: TransitCoverageReport;
} {
  return importOdptRailTopology(
    {
      operators: [...extraction.operators],
      stations: [...extraction.stations],
      railways: [...extraction.railways],
      calendars: [...extraction.calendars],
    },
    metadata,
  );
}

export const LKG_POINTER_FILENAME = "last-known-good.json";
export const LKG_STAGING_DIRNAME = "staging";
export const LKG_SNAPSHOTS_DIRNAME = "snapshots";

/**
 * Atomically promotes a candidate snapshot to last-known-good: writes graph
 * + manifest under their snapshot ids, then swaps the pointer via
 * write-tmp-and-rename. Callers must only reach here after every gate.
 * First promotion sets promotedAt and lastCheckedAt together.
 */
export function promoteToLastKnownGood(input: {
  readonly storeDir: string;
  readonly snapshotId: string;
  readonly graph: NormalizedTransitGraph;
  readonly manifest: SnapshotManifest;
  readonly promotedAt: string;
}): LastKnownGoodPointer {
  mkdirSync(join(input.storeDir, LKG_SNAPSHOTS_DIRNAME), { recursive: true });
  writeFileSync(
    join(
      input.storeDir,
      LKG_SNAPSHOTS_DIRNAME,
      `${input.snapshotId}.graph.json`,
    ),
    `${JSON.stringify(input.graph, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(
      input.storeDir,
      LKG_SNAPSHOTS_DIRNAME,
      `${input.snapshotId}.manifest.json`,
    ),
    `${JSON.stringify(input.manifest, null, 2)}\n`,
    "utf8",
  );
  const pointer: LastKnownGoodPointer = {
    snapshotId: input.snapshotId,
    contentHash: input.graph.datasetVersion.contentHash,
    promotedAt: input.promotedAt,
    lastCheckedAt: input.promotedAt,
  };
  writePointerAtomically(input.storeDir, pointer);
  return pointer;
}

function writePointerAtomically(
  storeDir: string,
  pointer: LastKnownGoodPointer,
): void {
  const pointerPath = join(storeDir, LKG_POINTER_FILENAME);
  const tmpPath = `${pointerPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  renameSync(tmpPath, pointerPath);
}

/**
 * Records a successful provider check that changed nothing semantically:
 * snapshotId, contentHash and promotedAt stay put, lastCheckedAt advances.
 * The graph bytes are never rewritten. Atomic; failures leave LKG untouched.
 */
export function recordSuccessfulCheck(input: {
  readonly storeDir: string;
  readonly checkedAt: string;
}): LastKnownGoodPointer {
  const existing = readLastKnownGood(input.storeDir);
  if (existing === null) {
    throw new DumpPipelineError(
      "promotion_refused",
      "no last-known-good exists; a first promotion is required before recording checks.",
    );
  }
  const pointer: LastKnownGoodPointer = {
    ...existing.pointer,
    lastCheckedAt: input.checkedAt,
  };
  writePointerAtomically(input.storeDir, pointer);
  return pointer;
}

/** Reads the LKG pointer and snapshot, or null when no LKG exists yet. */
export function readLastKnownGood(storeDir: string): {
  readonly pointer: LastKnownGoodPointer;
  readonly graph: NormalizedTransitGraph;
  readonly manifest: SnapshotManifest;
} | null {
  let pointerRaw: string;
  try {
    pointerRaw = readFileSync(join(storeDir, LKG_POINTER_FILENAME), "utf8");
  } catch {
    return null;
  }
  const pointer = JSON.parse(pointerRaw) as LastKnownGoodPointer;
  const normalizedPointer: LastKnownGoodPointer = {
    snapshotId: pointer.snapshotId,
    contentHash: pointer.contentHash,
    promotedAt: pointer.promotedAt,
    // Pointers written before lastCheckedAt existed predate any real LKG.
    lastCheckedAt: pointer.lastCheckedAt ?? pointer.promotedAt,
  };
  const graph = JSON.parse(
    readFileSync(
      join(storeDir, LKG_SNAPSHOTS_DIRNAME, `${pointer.snapshotId}.graph.json`),
      "utf8",
    ),
  ) as NormalizedTransitGraph;
  const manifest = JSON.parse(
    readFileSync(
      join(
        storeDir,
        LKG_SNAPSHOTS_DIRNAME,
        `${pointer.snapshotId}.manifest.json`,
      ),
      "utf8",
    ),
  ) as SnapshotManifest;
  return { pointer: normalizedPointer, graph, manifest };
}
