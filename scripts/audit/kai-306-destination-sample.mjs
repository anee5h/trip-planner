#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const manifestPath = path.join(
  repoRoot,
  "qa/kai-306/destination-sample-audit.json",
);
const reportPath = path.join(
  repoRoot,
  "qa/kai-306/destination-sample-audit.md",
);
const canonicalPath = "src/shared/data/destinations-index.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveInside(base, file) {
  const resolved = path.resolve(base, file);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository: ${file}`);
  }
  return resolved;
}

function getPath(value, segments, label) {
  let current = value;
  for (const segment of segments) {
    if (
      segment === "__proto__" ||
      segment === "prototype" ||
      segment === "constructor" ||
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      throw new Error(
        `Invalid/missing field path for ${label}: ${segments.join(".")}`,
      );
    }
    if (!Object.hasOwn(current, segment))
      return { present: false, value: undefined };
    current = current[segment];
  }
  return { present: true, value: current };
}

function setPath(value, segments, next, present, label) {
  if (!segments.length) throw new Error(`Empty field path for ${label}`);
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (
      segment === "__proto__" ||
      segment === "prototype" ||
      segment === "constructor" ||
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !Object.hasOwn(current, segment)
    ) {
      throw new Error(
        `Invalid parent path for ${label}: ${segments.join(".")}`,
      );
    }
    current = current[segment];
  }
  const finalSegment = segments.at(-1);
  if (
    finalSegment === "__proto__" ||
    finalSegment === "prototype" ||
    finalSegment === "constructor" ||
    current === null ||
    typeof current !== "object" ||
    Array.isArray(current)
  ) {
    throw new Error(`Invalid final path for ${label}: ${segments.join(".")}`);
  }
  if (present) current[finalSegment] = next;
  else delete current[finalSegment];
}

function validateManifest(manifest) {
  assert.equal(manifest.schemaVersion, 1, "Unsupported audit manifest version");
  assert.equal(manifest.ticket, "KAI-306");
  assert.equal(manifest.base.canonicalPath, canonicalPath);
  assert.equal(manifest.base.canonicalCount, 1130);
  assert.equal(manifest.base.uniqueCount, 1130);
  assert.equal(
    manifest.records.length,
    20,
    "Expected exactly 20 reviewed destinations",
  );

  const ids = manifest.records.map((record) => record.id);
  assert.equal(new Set(ids).size, 20, "Duplicate reviewed destination ID");
  assert.deepEqual(
    ids,
    manifest.sampleIds,
    "Sample order/IDs differ from the frozen list",
  );

  const sourceIds = new Set(manifest.sources.map((source) => source.id));
  assert.equal(
    sourceIds.size,
    manifest.sources.length,
    "Duplicate source reference ID",
  );
  const excludedIds = new Set(
    manifest.sourceAccess.excludedSources.map((source) => source.id),
  );
  for (const record of manifest.records) {
    assert.ok(
      ["PASS", "FAIL"].includes(record.outcomeBefore),
      `Invalid baseline result: ${record.id}`,
    );
    assert.ok(
      ["PASS", "FAIL"].includes(record.outcomeAfter),
      `Invalid final result: ${record.id}`,
    );
    assert.ok(
      record.sourceRefs.length > 0,
      `Missing source reference: ${record.id}`,
    );
    if (record.outcomeAfter === "FAIL") {
      assert.ok(
        record.unresolvedChecks?.length,
        `Missing failed checks: ${record.id}`,
      );
      assert.ok(
        record.fixLinks,
        `Missing fix path for failed row: ${record.id}`,
      );
    }
    for (const sourceId of record.sourceRefs) {
      assert.ok(
        sourceIds.has(sourceId),
        `Unknown source ${sourceId} for ${record.id}`,
      );
      assert.ok(
        !excludedIds.has(sourceId),
        `Excluded source used for ${record.id}`,
      );
    }
    for (const change of record.changes) {
      assert.ok(change.path.length > 0, `Empty change path for ${record.id}`);
      assert.ok(
        change.sourceRefs.length > 0,
        `Unsourced correction for ${record.id}`,
      );
      for (const sourceId of change.sourceRefs) {
        assert.ok(
          record.sourceRefs.includes(sourceId),
          `Change source not on row: ${record.id}`,
        );
        assert.ok(
          !excludedIds.has(sourceId),
          `Restricted source used for ${record.id}`,
        );
      }
      assert.notDeepEqual(
        change.before,
        change.after,
        `No-op change listed for ${record.id}`,
      );
    }
  }

  const changedIds = manifest.records
    .filter((record) => record.changes.length > 0)
    .map((record) => record.id);
  assert.deepEqual(
    changedIds,
    manifest.candidate.changedIds,
    "Changed-ID set mismatch",
  );
  assert.equal(changedIds.length, manifest.candidate.changedRecordCount);
  const changeCount = manifest.records.reduce(
    (sum, record) => sum + record.changes.length,
    0,
  );
  assert.equal(
    changeCount,
    manifest.candidate.fieldPathChangeCount,
    "Field-change count mismatch",
  );
  const expectedBefore = Object.fromEntries(
    ["PASS", "FAIL"].map((status) => [
      status,
      manifest.records.filter((record) => record.outcomeBefore === status)
        .length,
    ]),
  );
  const expectedAfter = Object.fromEntries(
    ["PASS", "FAIL"].map((status) => [
      status,
      manifest.records.filter((record) => record.outcomeAfter === status)
        .length,
    ]),
  );
  assert.deepEqual(manifest.scope.baselineResult, expectedBefore);
  assert.deepEqual(manifest.scope.finalResult, expectedAfter);
  assert.deepEqual(manifest.methodology.beforeResult, expectedBefore);
  assert.deepEqual(manifest.methodology.afterResult, expectedAfter);
  assert.ok(
    manifest.methodology.outcomeAdjudication.includes("manually adjudicated"),
  );
  assert.equal(manifest.scope.fullPlanningResult, "FAIL");
  assert.ok(
    manifest.runtimeProbe.routes.some((route) => route.result === "FAIL"),
  );
  const visual = manifest.runtimeProbe.visualComparison;
  assert.ok(["pending user review", "approved"].includes(visual.humanApproval));
  assert.equal(visual.contactSheets.length, visual.destinations.length);
  assert.equal(
    visual.matchedBeforeAfterScreenshots,
    visual.destinations.length * visual.viewports.length * 2,
  );
  for (const sheet of visual.contactSheets) {
    const image = readFileSync(resolveInside(repoRoot, sheet.path));
    assert.equal(
      image.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      `Invalid PNG: ${sheet.path}`,
    );
    assert.equal(
      image.readUInt32BE(16),
      sheet.width,
      `PNG width mismatch: ${sheet.path}`,
    );
    assert.equal(
      image.readUInt32BE(20),
      sheet.height,
      `PNG height mismatch: ${sheet.path}`,
    );
    assert.equal(
      sha256(image),
      sheet.sha256,
      `PNG hash mismatch: ${sheet.path}`,
    );
    assert.equal(
      image.length,
      sheet.bytes,
      `PNG byte length mismatch: ${sheet.path}`,
    );
  }
}

function loadBase(manifest) {
  const raw = execFileSync(
    "git",
    ["show", `${manifest.base.commit}:${canonicalPath}`],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  assert.equal(
    sha256(raw),
    manifest.base.canonicalSha256,
    "Frozen base hash changed",
  );
  const data = readJson(raw, "Frozen base catalogue");
  assert.ok(Array.isArray(data), "Frozen base catalogue is not an array");
  assert.equal(data.length, manifest.base.canonicalCount);
  const ids = data.map((record) => record.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "Frozen base contains duplicate IDs",
  );
  return { raw, data };
}

function applyCandidate(input, manifest) {
  assert.ok(Array.isArray(input), "Candidate input is not a catalogue array");
  assert.equal(
    input.length,
    manifest.base.canonicalCount,
    "Candidate population count changed",
  );
  const byId = new Map(input.map((record) => [record.id, record]));
  assert.equal(
    byId.size,
    input.length,
    "Candidate input contains duplicate IDs",
  );
  for (const record of manifest.records) {
    assert.ok(byId.has(record.id), `Candidate input is missing ${record.id}`);
  }

  let beforeCount = 0;
  let afterCount = 0;
  for (const record of manifest.records) {
    const target = byId.get(record.id);
    for (const change of record.changes) {
      const current = getPath(target, change.path, record.id);
      if (
        current.present === change.beforePresent &&
        (!change.beforePresent ||
          isDeepStrictEqual(current.value, change.before))
      )
        beforeCount++;
      else if (
        current.present === change.afterPresent &&
        (!change.afterPresent || isDeepStrictEqual(current.value, change.after))
      )
        afterCount++;
      else
        throw new Error(
          `State C: unexpected value at ${record.id}.${change.path.join(".")}`,
        );
    }
  }
  const changeCount = manifest.candidate.fieldPathChangeCount;
  if (beforeCount === changeCount) {
    const candidate = structuredClone(input);
    const candidateById = new Map(
      candidate.map((record) => [record.id, record]),
    );
    for (const record of manifest.records) {
      const target = candidateById.get(record.id);
      for (const change of record.changes) {
        setPath(
          target,
          change.path,
          change.after,
          change.afterPresent,
          record.id,
        );
      }
    }
    return { state: "A", candidate };
  }
  if (afterCount === changeCount) return { state: "B", candidate: input };
  throw new Error(
    `State C: mixed/partial candidate (${beforeCount} baseline, ${afterCount} applied)`,
  );
}

function routeObservation(route) {
  const pairs = [
    ["visibleDescriptionBefore", "visibleDescriptionAfter", "description"],
    ["visibleHighlightsBefore", "visibleHighlightsAfter", "highlights"],
    ["openingHoursBefore", "openingHoursAfter", "opening hours"],
    ["visibleOpeningHoursBefore", "visibleOpeningHoursAfter", "opening hours"],
    [
      "openingHoursStatusBefore",
      "openingHoursStatusAfter",
      "opening-hours status",
    ],
    ["visibleBudgetClaimBefore", "visibleBudgetClaimAfter", "budget claim"],
  ];
  const observations = [];
  for (const [beforeKey, afterKey, label] of pairs) {
    if (!Object.hasOwn(route, beforeKey) || !Object.hasOwn(route, afterKey)) {
      continue;
    }
    const before = route[beforeKey];
    const after = route[afterKey];
    const show = (value) =>
      typeof value === "string" ? `“${value}”` : JSON.stringify(value);
    observations.push(`${label}: ${show(before)} → ${show(after)}`);
  }
  if (Object.hasOwn(route, "visibleBudgetClaim")) {
    observations.push(
      `visible budget claim: “${route.visibleBudgetClaim}” (${route.auditBudgetState})`,
    );
  }
  return observations.length
    ? observations.join("; ")
    : "no before/after values captured";
}

function renderMarkdown(manifest) {
  const lines = [
    "# KAI-306: 20-Destination Sample Audit",
    "",
    `Checked: ${manifest.auditDate} · Base: \`${manifest.base.commit}\``,
    "",
    "## Result",
    "",
    `- Public-fact gate: **${manifest.scope.finalResult.PASS} PASS / ${manifest.scope.finalResult.FAIL} FAIL** after review (baseline: ${manifest.scope.baselineResult.PASS} PASS / ${manifest.scope.baselineResult.FAIL} FAIL).`,
    `- Canonical rows changed: **${manifest.candidate.changedRecordCount} / 20**; field paths changed: **${manifest.candidate.fieldPathChangeCount}**.`,
    `- Population: **${manifest.base.canonicalCount}** records, **${manifest.base.uniqueCount}** unique; ${manifest.summary.population.recommendationVisibleCount} visible / ${manifest.summary.population.recommendationHiddenCount} hidden.`,
    "",
    `**Gate definition:** ${manifest.methodology.gateDefinition}`,
    `**Outcome adjudication:** ${manifest.methodology.outcomeAdjudication}`,
    "",
    "This is not a full planning-readiness pass. See the separate evidence states below; unknown values remain unknown.",
    "",
    "## Planning and source coverage",
    "",
    `- KAI-87 sample states: budget ${JSON.stringify(manifest.summary.currentAudit.planning.budget)}; seasonality ${JSON.stringify(manifest.summary.currentAudit.planning.seasonality)}; logistics ${JSON.stringify(manifest.summary.currentAudit.planning.logistics)}; route evidence ${JSON.stringify(manifest.summary.currentAudit.derivedRouteEvidence)}.`,
    `- KAI-87 copy/provenance states: content ${JSON.stringify(manifest.summary.currentAudit.planning.content)}; provenance ${JSON.stringify(manifest.summary.currentAudit.planning.provenance)}. The remaining content-partial row is ${manifest.summary.currentAudit.contentPartialId}.`,
    `- Admission audit: incomplete estimates ${manifest.summary.currentAudit.admissionIncomplete} vs ${manifest.summary.baselineAudit.admissionIncomplete} at base; current admission states across the full catalogue ${JSON.stringify(manifest.summary.admissionPopulation.after)}. KAI-219 prose conflicts: ${manifest.summary.admissionPopulation.currentProseConflicts}.`,
    `- KAI-203: ${manifest.summary.kai203.generatedDetailCount} generated detail files synchronized; ${manifest.summary.kai203.structuralErrorCount} structural errors; the sample’s empty English-highlight overrides fell from ${manifest.summary.baselineAudit.emptyEnglishHighlightOverridesInSample.length} to ${manifest.summary.currentAudit.emptyEnglishHighlightOverridesInSample.length}.`,
    `- KAI-257: ${manifest.summary.kai257.totalDefects} top-sight/geographic relationship defects in its full-catalogue audit.`,
    `- Images: ${manifest.summary.images.heroUrlCount} distinct hero URLs / ${manifest.summary.images.destinationCount} destinations; ${manifest.summary.images.imageMetadataPresentCount} have metadata and ${manifest.summary.images.imageMetadataMissingCount} lack it. Visual subject and license-page verification were not performed (${manifest.summary.images.visualSubjectCheckedCount} / ${manifest.summary.images.sourcePageAndLicenseCheckedCount}).`,
    `- Coordinates: ${manifest.summary.coordinates.numericCoordinateCount} records contain numeric coordinates; exact map placement was not independently re-geocoded (${manifest.summary.coordinates.exactPositionRegeocodedCount}).`,
    manifest.summary.modelDerivation.changeCount
      ? `- Model derivation: ${manifest.summary.modelDerivation.changeCount} generated changes across ${manifest.summary.modelDerivation.models.join(", ")} for ${manifest.summary.modelDerivation.changedIds.join(", ")}; formulas were not changed.`
      : "- Model derivation: no generated model changes; `npm run check:destination-models` passes.",
    `- Full planning-readiness gate: **${manifest.scope.fullPlanningResult}**; one rendered detail claim remains unsupported (see local page probe).`,
    "- Source collection was one-time manual review. Robots/terms were not systematically assessed for all pages; this report authorizes no recurring collection.",
    "",
    "## Local detail-page probe",
    "",
    "These unauthenticated local renders are product-page observations, not production/provider checks.",
  ];

  for (const route of manifest.runtimeProbe.routes) {
    lines.push(
      `- \`${route.id}\` (${route.locale}): **${route.result}**. Observed values: ${routeObservation(route)}. ${route.finding}`,
    );
    if (route.reviewPath)
      lines.push(
        `  Review path: [${route.reviewPath}](../../${route.reviewPath}).`,
      );
  }

  lines.push(
    `- Matched screenshots: ${manifest.runtimeProbe.visualComparison.matchedBeforeAfterScreenshots} across ${manifest.runtimeProbe.visualComparison.destinations.join(", ")} at ${manifest.runtimeProbe.visualComparison.viewports.join(", ")}. ${manifest.runtimeProbe.visualComparison.agentVisualInspection} Human approval: **${manifest.runtimeProbe.visualComparison.humanApproval}**. ${manifest.runtimeProbe.visualComparison.imagesCommitted ? "Sheets are committed below." : "Sheets are included in the worktree pending user approval."}`,
    "",
    "## Per-destination results",
    "",
  );

  for (const sheet of manifest.runtimeProbe.visualComparison.contactSheets) {
    lines.push(`![${sheet.alt}](visual/${path.basename(sheet.path)})`, "");
  }

  for (const record of manifest.records) {
    const sourceLinks = record.sourceRefs
      .map((sourceId) => {
        const source = manifest.sources.find((item) => item.id === sourceId);
        return `[${sourceId}](${source.url})`;
      })
      .join(", ");
    lines.push(`### ${record.name} / ${record.id}`);
    lines.push("");
    lines.push(
      `- Result: **${record.outcomeBefore} → ${record.outcomeAfter}** for the defined public-fact gate.`,
    );
    lines.push(
      `- Kind: \`${record.kind}\`; admission: \`${record.admissionState}\`.`,
    );
    lines.push(
      `- Planner signals: budget \`${record.plannerAudit.budgetState}\`, seasonality \`${record.plannerAudit.seasonalityState}\`, logistics \`${record.plannerAudit.logisticsState}\`, route evidence \`${record.plannerAudit.routeEvidence}\`, content \`${record.plannerAudit.contentIntegrityState}\`, provenance \`${record.plannerAudit.provenanceState}\`.`,
    );
    lines.push(
      `- Coordinates: ${record.coordinates.numericLatLngPresent ? "numeric point present; not georeferenced" : "missing"}. Image: ${record.image.heroUrlPresent ? "URL present" : "missing"}; metadata ${record.image.imageMetadataPresent ? "present" : "missing"}; visual/source-page check not performed.`,
    );
    if (record.findingNotes.length) {
      lines.push(`- Findings/remediation: ${record.findingNotes.join(" ")}`);
    } else {
      lines.push(
        "- Findings: no unresolved contradiction remains in the reviewed public-fact fields.",
      );
    }
    if (record.unresolvedChecks?.length) {
      lines.push(
        `- Unresolved FAIL checks: ${record.unresolvedChecks.join(" ")}`,
      );
    }
    if (record.fixLinks) {
      lines.push(
        `- Fix: [canonical catalogue](../../src/shared/data/destinations-index.json) · [generated detail](../../public/data/destinations/${record.id}.json).`,
      );
    } else {
      lines.push("- Fix: not required.");
    }
    lines.push(`- Sources: ${sourceLinks}.`);
    lines.push("");
  }

  lines.push("## Deferred evidence / explicit limitations", "");
  lines.push(
    `- ${manifest.summary.currentAudit.planning.budget["unknown-critical"] ?? 0} sample budgets remain unknown-critical and ${manifest.summary.currentAudit.planning.budget.partial ?? 0} remain partial; they were not replaced with zero or a guessed amount.`,
  );
  lines.push(
    `- ${manifest.summary.currentAudit.planning.seasonality.unknown ?? 0} seasonality profiles remain unknown; no generic all-year values were added.`,
  );
  lines.push(
    `- ${manifest.summary.images.imageMetadataMissingCount} image-metadata records remain missing: ${manifest.summary.images.imageMetadataMissingIds.join(", ")}. All 20 image subjects/usage permissions remain visually unverified.`,
  );
  lines.push(
    `- One destination still has partial content integrity (${manifest.summary.currentAudit.contentPartialId}); one source-provenance record remains unknown (${manifest.summary.currentAudit.provenanceUnknownId}).`,
  );
  lines.push(
    "- Exact coordinate placement, real-page travel-time behavior, itinerary feasibility and destination-specific image matching were not tested in a browser in this data-only PR.",
  );
  lines.push(
    "- A source page that restricts reuse was excluded from the edited copy; see the `sourceAccess` record in the JSON manifest.",
  );
  lines.push("");
  lines.push("## Machine-readable evidence", "");
  lines.push(
    "The JSON beside this report contains the exact 20-ID list, source observations, access limitations, before/after field values, planner states, and fix paths. Reproduce/verify it with `npm run audit:kai-306`.",
  );
  lines.push("");
  const markdown = `${lines.join("\n")}\n`;
  return execFileSync(
    path.join(repoRoot, "node_modules/.bin/prettier"),
    ["--parser", "markdown"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: markdown,
      timeout: 30000,
    },
  );
}

function atomicWrite(target, bytes, { allowRepo = false } = {}) {
  const resolved = path.resolve(target);
  const relative = path.relative(repoRoot, resolved);
  const insideRepo = !relative.startsWith("..") && !path.isAbsolute(relative);
  if (insideRepo && !allowRepo)
    throw new Error("Refusing to write candidate output inside repository");
  if (existsSync(resolved))
    throw new Error(`Refusing to overwrite existing output: ${resolved}`);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const parent = realpathSync(path.dirname(resolved));
  const realRelative = path.relative(repoRoot, parent);
  const realInsideRepo =
    !realRelative.startsWith("..") && !path.isAbsolute(realRelative);
  if (realInsideRepo && !allowRepo)
    throw new Error("Refusing output through a repository symlink");
  const temp = path.join(
    parent,
    `.${path.basename(resolved)}.${randomUUID()}.tmp`,
  );
  let fd;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, resolved);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(temp);
    } catch {}
    throw error;
  }
}

function verifySnapshot(manifest) {
  validateManifest(manifest);
  const { data: base } = loadBase(manifest);
  const replay = applyCandidate(base, manifest);
  assert.equal(replay.state, "A", "Frozen base should be candidate state A");
  const currentRaw = readFileSync(
    resolveInside(repoRoot, canonicalPath),
    "utf8",
  );
  assert.equal(
    sha256(currentRaw),
    manifest.candidate.canonicalSha256,
    "Current canonical hash changed",
  );
  const current = readJson(currentRaw, "Current canonical catalogue");
  assert.deepEqual(
    replay.candidate,
    current,
    "Candidate manifest does not reproduce the current canonical catalogue",
  );
  return { currentRaw, current, rendered: renderMarkdown(manifest) };
}

function valueAfterReplay(input, manifest) {
  const result = applyCandidate(input, manifest);
  return `${stableJson(result.candidate)}`;
}

function main() {
  const manifest = readJson(
    readFileSync(manifestPath, "utf8"),
    "KAI-306 audit manifest",
  );
  const args = process.argv.slice(2);
  const mode = args.includes("--replay")
    ? "replay"
    : args.includes("--render")
      ? "render"
      : "check";

  if (mode === "replay") {
    const inputArg = args.indexOf("--input");
    const outputArg = args.indexOf("--output");
    if (outputArg < 0 || !args[outputArg + 1])
      throw new Error("--replay requires --output <temporary-path>");
    const { data: base } = loadBase(manifest);
    let input = base;
    let inputLabel = "frozen base";
    if (inputArg >= 0) {
      const inputPath = path.resolve(args[inputArg + 1]);
      const relative = path.relative(repoRoot, inputPath);
      if (!relative.startsWith("..") && !path.isAbsolute(relative))
        throw new Error("Replay input must be outside the repository");
      input = readJson(readFileSync(inputPath, "utf8"), "Replay input");
      inputLabel = inputPath;
    }
    const replay = applyCandidate(input, manifest);
    if (replay.state === "B" && inputArg < 0) {
      throw new Error(
        "State B requires --input with the already-applied candidate",
      );
    }
    const expected = applyCandidate(base, manifest).candidate;
    assert.deepEqual(
      replay.candidate,
      expected,
      "Replay input contains out-of-manifest changes",
    );
    const output = path.resolve(args[outputArg + 1]);
    atomicWrite(
      output,
      replay.state === "B"
        ? readFileSync(path.resolve(args[inputArg + 1]))
        : valueAfterReplay(input, manifest),
    );
    console.log(
      `KAI-306 replay state=${replay.state} input=${inputLabel} changedRecords=${manifest.candidate.changedRecordCount}`,
    );
    return;
  }

  const verified = verifySnapshot(manifest);
  if (mode === "render") {
    const renderedPath = resolveInside(
      repoRoot,
      "qa/kai-306/destination-sample-audit.md",
    );
    const temp = path.join(
      path.dirname(renderedPath),
      `.${path.basename(renderedPath)}.${randomUUID()}.tmp`,
    );
    mkdirSync(path.dirname(renderedPath), { recursive: true });
    writeFileSync(temp, verified.rendered, { flag: "wx" });
    renameSync(temp, renderedPath);
    console.log(
      `Rendered ${path.relative(repoRoot, renderedPath)} (${Buffer.byteLength(verified.rendered)} bytes).`,
    );
    return;
  }

  const committedReport = readFileSync(reportPath, "utf8");
  assert.equal(
    committedReport,
    verified.rendered,
    "Rendered audit report is stale; run --render and review the diff",
  );
  console.log(
    `KAI-306 audit verified: ${manifest.records.length} records; ${manifest.candidate.changedRecordCount} changed; ${manifest.candidate.fieldPathChangeCount} field paths; state=A; canonical SHA-256 ${sha256(verified.currentRaw)}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
