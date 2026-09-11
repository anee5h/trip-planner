/**
 * KAI-291B2 — ODPT static dump refresh CLI (maintenance only).
 *
 *   npx tsx scripts/transit/refresh-odpt-static.ts [--audit] [--promote]
 *     [--offline-fixture] [--output-dir <dir>]
 *     [--approve-redirect-origin <origin>]...
 *
 * Default is AUDIT / DRY RUN: downloads, validates, normalizes and reports
 * without touching last-known-good. `--promote` additionally promotes a
 * passing candidate to the LOCAL ignored LKG store — never to any
 * production/public destination (no such destination exists in B2).
 *
 * Secret handling: the key comes ONLY from `process.env.ODPT_API_KEY`. There
 * is no `--key` flag, no key in argv/config/logs/manifests/errors. Without a
 * key (and without `--offline-fixture`) the CLI exits before any fetch.
 *
 * No arbitrary source URLs: the four dump families and the entry origin are
 * fixed; only exact redirect origins may be approved, and only explicitly.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_DUMP_REDIRECT_ORIGINS,
  DUMP_BYTE_CAPS,
  DUMP_DEFAULT_MAX_REDIRECTS,
  DUMP_DEFAULT_TIMEOUT_MS,
  DUMP_RESOURCE_ALLOWLIST,
  discoverDumpRedirect,
  downloadDumpResource,
  DumpDownloadError,
  type DumpDownloadRecord,
  type DumpResourceType,
} from "./odptDumpDownload";
import {
  buildSnapshotManifest,
  compareCandidate,
  decidePromotion,
  DumpPipelineError,
  extractPilotScope,
  freshnessStatus,
  LKG_STAGING_DIRNAME,
  loadAnchorStationIds,
  missingAnchorIdentities,
  missingRequiredPilotOperators,
  normalizePilotExtraction,
  promoteToLastKnownGood,
  readLastKnownGood,
  recordSuccessfulCheck,
  snapshotIdFor,
  validateDumpFamily,
  type LicenseStatus,
} from "./odptDumpPipeline";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..", "..");
const DEFAULT_STORE_DIR = join(REPO_ROOT, ".cache", "transit", "odpt");
const ANCHORS_PATH = join(
  REPO_ROOT,
  "qa",
  "kai-291",
  "destination-station-anchors.json",
);
const B1_FIXTURE_PATH = join(
  REPO_ROOT,
  "src",
  "shared",
  "services",
  "transport",
  "static",
  "__tests__",
  "fixtures",
  "odptRailTopologyFixture.json",
);

interface CliOptions {
  readonly audit: boolean;
  readonly promote: boolean;
  readonly offlineFixture: boolean;
  readonly discoverRedirectOrigin: boolean;
  readonly outputDir: string;
}

function usage(): string {
  return [
    "usage: refresh-odpt-static.ts [--audit] [--promote] [--offline-fixture]",
    "  [--discover-redirect-origin] [--output-dir <dir>]",
    "",
    "--audit (default): download + validate + report, LKG untouched.",
    "--promote: additionally promote a passing candidate to LOCAL ignored LKG.",
    "--offline-fixture: run the pipeline on the committed B1 fixture, no network.",
    "--discover-redirect-origin: ONE authenticated initial request for",
    "  odpt:Operator; report the sanitized redirect target WITHOUT following",
    "  it. Exactly 1 provider attempt. For controlled first-contact review.",
    "--output-dir: ignored local store root (default .cache/transit/odpt).",
    "",
    "Redirects for audit/promote follow ONLY the committed exact-origin",
    "allow-list (APPROVED_DUMP_REDIRECT_ORIGINS); no runtime override exists.",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  let promote = false;
  let offlineFixture = false;
  let discoverRedirectOrigin = false;
  let outputDir = DEFAULT_STORE_DIR;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--audit") continue;
    else if (arg === "--promote") promote = true;
    else if (arg === "--offline-fixture") offlineFixture = true;
    else if (arg === "--discover-redirect-origin")
      discoverRedirectOrigin = true;
    else if (arg === "--output-dir") {
      const next = argv[i + 1];
      if (next === undefined)
        throw new Error(`${usage()}\n--output-dir needs a value.`);
      outputDir = next;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`${usage()}\nunknown argument: ${arg}`);
    }
  }
  return {
    audit: true,
    promote,
    offlineFixture,
    discoverRedirectOrigin,
    outputDir,
  };
}

/** Refuses tracked in-repo output dirs: live data must stay ignored. */
function resolveStoreDir(outputDir: string): string {
  const resolved = isAbsolute(outputDir)
    ? outputDir
    : resolve(process.cwd(), outputDir);
  const relative = resolve(resolved);
  if (
    relative === REPO_ROOT ||
    relative.startsWith(`${REPO_ROOT}/`) ||
    relative.startsWith(`${REPO_ROOT}\\`)
  ) {
    if (!relative.startsWith(join(REPO_ROOT, ".cache"))) {
      throw new Error(
        `refusing output dir inside the tracked tree: ${resolved} ` +
          `(live ODPT data must stay in ignored storage such as .cache/).`,
      );
    }
  }
  return resolved;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== "string") return false;
  return import.meta.url === `file://${entry}`;
}

async function run(options: CliOptions): Promise<void> {
  const storeDir = resolveStoreDir(options.outputDir);
  mkdirSync(join(storeDir, LKG_STAGING_DIRNAME), { recursive: true });
  const nowIso = new Date().toISOString();
  const licenseStatus: LicenseStatus = "unknown";

  if (options.offlineFixture && options.promote) {
    throw new Error(
      "refusing --promote with --offline-fixture: LKG must come from live validated dumps, not fixture data.",
    );
  }
  if (options.discoverRedirectOrigin) {
    return runRedirectDiscovery();
  }

  let downloads: DumpDownloadRecord[] = [];
  let bodies = new Map<string, string>();
  if (options.offlineFixture) {
    const fixture = JSON.parse(readFileSync(B1_FIXTURE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    bodies = new Map(
      DUMP_RESOURCE_ALLOWLIST.filter(
        (family) => family !== "odpt:Calendar",
      ).map((family) => [
        family,
        JSON.stringify(fixture[familyKey(family)] ?? []),
      ]),
    );
    bodies.set("odpt:Calendar", JSON.stringify(fixture["calendars"] ?? []));
  } else {
    const apiKey = process.env.ODPT_API_KEY ?? "";
    if (apiKey.length === 0) {
      throw new DumpDownloadError(
        "provider_not_configured",
        "ODPT_API_KEY is absent; refusing to issue any dump request.",
      );
    }
    for (const rdfType of DUMP_RESOURCE_ALLOWLIST) {
      const record = await downloadDumpResource({
        rdfType,
        apiKey,
        approvedRedirectOrigins: APPROVED_DUMP_REDIRECT_ORIGINS,
        byteCap: DUMP_BYTE_CAPS[rdfType],
        timeoutMs: DUMP_DEFAULT_TIMEOUT_MS,
        maxRedirects: DUMP_DEFAULT_MAX_REDIRECTS,
        fetchImpl: fetch as never,
      });
      downloads.push(record);
      // Stage exactly the validated-capped bytes that were hashed above.
      const decoder = new TextDecoder();
      writeFileSync(
        join(
          storeDir,
          LKG_STAGING_DIRNAME,
          `${nowIso.replace(/[-:.]/g, "").toLowerCase()}.${rdfType}.raw.json`,
        ),
        record.bodyBytes,
      );
      bodies.set(rdfType, decoder.decode(record.bodyBytes));
    }
  }

  const families: Record<string, readonly Record<string, unknown>[]> = {};
  const rawCounts: Record<string, number> = {};
  for (const rdfType of DUMP_RESOURCE_ALLOWLIST) {
    const body = bodies.get(rdfType);
    if (body === undefined) {
      throw new DumpPipelineError(
        "invalid_json",
        `${rdfType}: no staged body available.`,
      );
    }
    const validated = validateDumpFamily(rdfType, body);
    families[rdfType] = validated.records;
    rawCounts[rdfType] = validated.records.length;
  }

  const extraction = extractPilotScope(families);
  const metadata = {
    datasetId: options.offlineFixture
      ? "odpt-offline-fixture-check"
      : `odpt-dump-${nowIso.replace(/[-:.]/g, "").toLowerCase()}`,
    identityNamespace: "odpt" as const,
    sourceDescriptor: options.offlineFixture
      ? "offline B1 fixture run (no network)"
      : "live ODPT data dump (local audit only)",
    sourceType: (options.offlineFixture ? "fixture" : "data_dump") as
      "fixture" | "data_dump",
    retrievedAt: nowIso,
    checkedAt: nowIso,
    completeness: (options.offlineFixture
      ? "fixture_subset"
      : "complete_provider_dump") as
      "fixture_subset" | "complete_provider_dump",
  };
  const { graph, coverage } = normalizePilotExtraction(extraction, metadata);

  const anchorIds = loadAnchorStationIds((path) =>
    readFileSync(join(REPO_ROOT, path), "utf8"),
  );
  const missingAnchors = missingAnchorIdentities(graph, anchorIds);
  const previous = readLastKnownGood(storeDir);
  const comparison = compareCandidate(graph, previous?.graph ?? null);

  const missingRequiredOperators = missingRequiredPilotOperators(graph);
  const decision = decidePromotion({
    missingAnchors,
    removedIdentities: comparison.removedIdentities,
    missingRequiredOperators,
    licenseStatus,
    completenessIsComplete: metadata.completeness === "complete_provider_dump",
  });

  const rawSha = downloads.length
    ? downloads.map((d) => d.rawSha256).join(":")
    : "offline-fixture";
  const snapshotId = options.offlineFixture
    ? `odpt-offline-${nowIso.replace(/[-:.]/g, "").toLowerCase()}`
    : snapshotIdFor(nowIso, downloads[0]?.rawSha256 ?? "offline");
  void rawSha;

  let promotionStatus:
    "candidate" | "promoted_local" | "requires_review" | "rejected" =
    decision.decision === "promote_local"
      ? "candidate"
      : decision.decision === "requires_review"
        ? "requires_review"
        : "rejected";
  let promotionReason = decision.reasons.join("; ");
  let semanticUnchanged = false;

  if (
    previous !== null &&
    previous.graph.datasetVersion.contentHash ===
      graph.datasetVersion.contentHash
  ) {
    // Raw bytes may have moved; semantics did not. No LKG churn.
    semanticUnchanged = true;
    promotionStatus = "candidate";
    promotionReason =
      "semantic contentHash unchanged vs LKG; snapshot retained";
  }

  const manifest = buildSnapshotManifest({
    snapshotId,
    checkedAt: nowIso,
    retrievedAt: nowIso,
    downloads,
    rawCounts,
    filteredCounts: extraction.filteredCounts,
    graph,
    coverage,
    licenseStatus,
    promotion: { status: promotionStatus, reason: promotionReason },
  });

  const stagingPath = join(
    storeDir,
    LKG_STAGING_DIRNAME,
    `${snapshotId}.manifest.json`,
  );
  writeFileSync(stagingPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (options.promote) {
    if (semanticUnchanged) {
      // The graph is untouched, but the successful check is recorded: the
      // operational LKG freshness reads the pointer's lastCheckedAt.
      const pointer = recordSuccessfulCheck({ storeDir, checkedAt: nowIso });
      process.stdout.write(
        `semantic unchanged vs LKG (${graph.datasetVersion.contentHash}); ` +
          `graph retained, lastCheckedAt=${pointer.lastCheckedAt}.\n`,
      );
    } else if (decision.decision !== "promote_local") {
      throw new DumpPipelineError(
        "promotion_refused",
        `promotion refused (${decision.decision}): ${decision.reasons.join("; ")}. LKG untouched.`,
      );
    } else {
      const pointer = promoteToLastKnownGood({
        storeDir,
        snapshotId,
        graph,
        manifest: {
          ...manifest,
          promotion: { status: "promoted_local", reason: promotionReason },
        },
        promotedAt: nowIso,
      });
      process.stdout.write(
        `promoted local LKG ${pointer.snapshotId} (${pointer.contentHash}).\n`,
      );
    }
  }

  const operational = readLastKnownGood(storeDir);
  const lines = [
    `snapshot=${snapshotId}`,
    `resources=${downloads.length} httpAttempts=${downloads.reduce((n, d) => n + d.httpAttempts, 0)}`,
    `rawCounts=${JSON.stringify(extraction.rawCounts)}`,
    `filtered=${JSON.stringify(extraction.filteredCounts)}`,
    `normalized=operators:${graph.operators.length} stops:${graph.stops.length} routes:${graph.routes.length} routeStops:${graph.routeStops.length} calendars:${graph.calendars.length}`,
    `anchorsPresent=${anchorIds.length - missingAnchors.length}/${anchorIds.length} missing=[${missingAnchors.join(",")}]`,
    `missingRequiredOperators=[${missingRequiredOperators.join(",")}]`,
    `semanticHash=${graph.datasetVersion.contentHash} unchanged=${semanticUnchanged}`,
    `coverage=${coverage.entries.map((e) => `${e.operator.split(":").at(-1)}:${e.topology}`).join(",")}`,
    `licence=${licenseStatus} productionPromotionAllowed=false`,
    `lkgFreshness=${operational === null ? "none" : freshnessStatus(operational.pointer.lastCheckedAt, Date.parse(nowIso))}`,
    `decision=${decision.decision} (${decision.reasons.join("; ")})`,
    `staged=${stagingPath}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Controlled first-contact discovery: ONE authenticated initial request for
 * odpt:Operator, reporting the sanitized redirect target WITHOUT following
 * it. Exactly 1 provider attempt. The observed origin goes to review; only
 * an explicitly approved origin ever enters the committed allow-list.
 */
async function runRedirectDiscovery(): Promise<void> {
  const apiKey = process.env.ODPT_API_KEY ?? "";
  if (apiKey.length === 0) {
    throw new DumpDownloadError(
      "provider_not_configured",
      "ODPT_API_KEY is absent; refusing to issue any dump request.",
    );
  }
  const discovery = await discoverDumpRedirect({
    rdfType: "odpt:Operator",
    apiKey,
    timeoutMs: DUMP_DEFAULT_TIMEOUT_MS,
    fetchImpl: fetch as never,
  });
  process.stdout.write(
    [
      `initialEndpoint=${discovery.initialEndpoint}`,
      `initialStatus=${discovery.initialStatus}`,
      `redirectTargetOrigin=${discovery.targetOrigin}`,
      `redirectHadQueryOrFragment=${discovery.hadSensitiveParts}`,
      "followed=false (discovery only; host goes to review)",
    ].join("\n") + "\n",
  );
}

function familyKey(rdfType: DumpResourceType): string {
  switch (rdfType) {
    case "odpt:Operator":
      return "operators";
    case "odpt:Station":
      return "stations";
    case "odpt:Railway":
      return "railways";
    case "odpt:Calendar":
      return "calendars";
  }
}

if (isMain()) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (
      error instanceof DumpDownloadError ||
      error instanceof DumpPipelineError
    ) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }
}
