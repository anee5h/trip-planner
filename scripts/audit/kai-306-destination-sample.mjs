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
const followUpLedgerPath = path.join(
  repoRoot,
  "qa/kai-306/follow-up-ledger.json",
);
const followUpReportPath = path.join(repoRoot, "qa/kai-306/follow-up-audit.md");

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

function setPath(value, segments, next, present, label, parentKeys) {
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
  if (parentKeys) {
    assert.deepEqual(
      new Set(Object.keys(current)),
      new Set(parentKeys),
      `Parent key set mismatch for ${label}: ${segments.join(".")}`,
    );
    const values = new Map(Object.entries(current));
    for (const key of Object.keys(current)) delete current[key];
    for (const key of parentKeys) current[key] = values.get(key);
  }
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
  const committedImagesMatch = visual.contactSheets.every((sheet) => {
    try {
      const committed = execFileSync("git", ["show", `HEAD:${sheet.path}`], {
        cwd: repoRoot,
        maxBuffer: 16 * 1024 * 1024,
      });
      return sha256(committed) === sheet.sha256;
    } catch {
      return false;
    }
  });
  assert.equal(
    visual.imagesCommitted,
    committedImagesMatch,
    "Screenshot commit metadata does not match HEAD contents",
  );
  if (visual.humanApproval === "pending user review") {
    assert.ok(
      visual.contactSheets.every((sheet) => !/\bapproved\b/i.test(sheet.alt)),
      "Pending screenshots must not be labeled approved",
    );
  }
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

function readLedger() {
  if (!existsSync(followUpLedgerPath)) return null;
  return readJson(
    readFileSync(followUpLedgerPath, "utf8"),
    "KAI-306 follow-up ledger",
  );
}

/**
 * The October 8 candidate is a frozen historical artifact. Later reviewed
 * catalogue corrections are recorded as an append-only, hash-chained ledger
 * of field-path patches. Reversing that chain from the live catalogue must
 * reproduce the exact pinned candidate bytes; any unledgered change, edited
 * ledger value or broken chain link fails here instead of being tolerated.
 */
function reconstructPinnedCandidate(manifest, ledger) {
  const currentRaw = readFileSync(
    resolveInside(repoRoot, manifest.base.canonicalPath),
    "utf8",
  );
  const entries = ledger?.entries ?? [];
  if (!entries.length) return { raw: currentRaw, currentRaw };
  validateLedger(ledger, manifest);
  assert.equal(
    sha256(currentRaw),
    entries.at(-1).afterCanonicalSha256,
    "Current canonical hash is not the last follow-up ledger hash",
  );
  let data = readJson(currentRaw, "Current canonical catalogue");
  const byId = () => new Map(data.map((record) => [record.id, record]));
  for (const entry of [...entries].reverse()) {
    const index = byId();
    for (const record of [...entry.records].reverse()) {
      const target = index.get(record.id);
      assert.ok(target, `Follow-up ledger record missing: ${record.id}`);
      for (const change of record.changes) {
        if (!change.beforeParentKeys) continue;
        const parent = getPath(target, change.path.slice(0, -1), record.id);
        assert.deepEqual(
          Object.keys(parent.value),
          change.afterParentKeys,
          `Follow-up parent key order mismatch at ${record.id}.${change.path.join(".")}`,
        );
      }
      for (const change of [...record.changes].reverse()) {
        const current = getPath(target, change.path, record.id);
        assert.equal(
          current.present,
          change.afterPresent,
          `Follow-up presence mismatch at ${record.id}.${change.path.join(".")}`,
        );
        if (change.afterPresent) {
          assert.ok(
            isDeepStrictEqual(current.value, change.after),
            `Follow-up value mismatch at ${record.id}.${change.path.join(".")}`,
          );
        }
        setPath(
          target,
          change.path,
          change.before,
          change.beforePresent,
          record.id,
          change.beforeParentKeys,
        );
      }
    }
    assert.equal(
      sha256(stableJson(data)),
      entry.beforeCanonicalSha256,
      `Follow-up ${entry.id} does not reverse to its recorded prior hash`,
    );
  }
  return { raw: stableJson(data), currentRaw };
}

const LEDGER_OUTCOMES = ["PASS", "FAIL"];
const GENERATED_DETAIL_FIELDS = [
  "kind",
  "description",
  "highlights",
  "content",
  "businessHours",
  "openingHours",
  "openingHoursJa",
  "notes",
  "notesJa",
  "reservation",
  "reservationJa",
  "admission",
  "openingHoursMetadata",
];

function isIsoDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  );
}

function validateLedger(ledger, manifest) {
  assert.equal(ledger.schemaVersion, 1, "Unsupported follow-up ledger version");
  assert.equal(ledger.ticket, "KAI-306");
  assert.ok(Array.isArray(ledger.entries), "Follow-up entries missing");
  const cohort = new Set(manifest.sampleIds);
  let previousHash = manifest.candidate.canonicalSha256;
  ledger.entries.forEach((entry, position) => {
    const label = `follow-up ${entry.id}`;
    assert.equal(entry.sequence, position + 1, `${label}: sequence gap`);
    assert.ok(isIsoDate(entry.date), `${label}: invalid date`);
    assert.ok(isIsoDate(entry.sourceCheckedOn), `${label}: invalid check date`);
    assert.equal(
      entry.beforeCanonicalSha256,
      previousHash,
      `${label}: hash chain broken`,
    );
    assert.match(entry.afterCanonicalSha256, /^[0-9a-f]{64}$/);
    previousHash = entry.afterCanonicalSha256;
    assert.ok(entry.records?.length, `${label}: no records`);
    const seen = new Set();
    for (const record of entry.records) {
      assert.ok(
        cohort.has(record.id),
        `${label}: ${record.id} is outside the frozen 20-ID cohort`,
      );
      assert.ok(!seen.has(record.id), `${label}: duplicate ${record.id}`);
      seen.add(record.id);
      for (const key of [
        "originalFinding",
        "currentObservation",
        "adjudicationNote",
      ]) {
        assert.ok(
          typeof record[key] === "string" && record[key].trim(),
          `${label}: ${record.id} missing ${key}`,
        );
      }
      assert.ok(
        LEDGER_OUTCOMES.includes(record.outcomeBefore) &&
          LEDGER_OUTCOMES.includes(record.adjudicatedOutcome),
        `${label}: ${record.id} invalid outcome`,
      );
      assert.equal(
        record.adjudicationBasis,
        "manual",
        `${label}: ${record.id} outcomes are manual adjudications`,
      );
      assert.ok(record.correctedFields?.length, `${label}: ${record.id}`);
      assert.ok(record.sources?.length, `${label}: ${record.id} has no source`);
      for (const source of record.sources) {
        assert.match(source.url, /^https:\/\//, `${label}: ${record.id} URL`);
        assert.ok(isIsoDate(source.checkedOn), `${label}: ${record.id} date`);
        assert.ok(source.observation, `${label}: ${record.id} observation`);
      }
      assert.ok(record.changes?.length, `${label}: ${record.id} no changes`);
      for (const override of record.editorialOverrides ?? []) {
        assert.ok(
          override.file && override.field && override.rationale,
          `${label}: ${record.id} incomplete editorial override`,
        );
        assert.ok(
          Array.isArray(override.before) && Array.isArray(override.after),
          `${label}: ${record.id} invalid editorial override values`,
        );
      }
      for (const change of record.changes) {
        if (change.beforeParentKeys === undefined) {
          assert.equal(
            change.afterParentKeys,
            undefined,
            `${label}: ${record.id} incomplete parent key order`,
          );
          continue;
        }
        assert.ok(
          Array.isArray(change.beforeParentKeys) &&
            change.beforeParentKeys.every((key) => typeof key === "string") &&
            new Set(change.beforeParentKeys).size ===
              change.beforeParentKeys.length,
          `${label}: ${record.id} invalid before parent key order`,
        );
        assert.ok(
          Array.isArray(change.afterParentKeys) &&
            change.afterParentKeys.every((key) => typeof key === "string") &&
            new Set(change.afterParentKeys).size ===
              change.afterParentKeys.length,
          `${label}: ${record.id} invalid after parent key order`,
        );
      }
    }
  });
}

/** Ledgered corrections must be present in the generated detail files. */
function verifyFollowUps(ledger, manifest, current) {
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const entry of ledger.entries) {
    for (const record of entry.records) {
      const detailFile = resolveInside(
        repoRoot,
        `public/data/destinations/${record.id}.json`,
      );
      const detail = readJson(readFileSync(detailFile, "utf8"), detailFile);
      const canonical = byId.get(record.id);
      const fields = new Set(GENERATED_DETAIL_FIELDS);
      for (const change of record.changes) fields.add(change.path[0]);
      for (const field of fields) {
        const generatedField = GENERATED_DETAIL_FIELDS.includes(field);
        if (!generatedField && !Object.hasOwn(detail, field)) continue;
        assert.equal(
          Object.hasOwn(detail, field),
          Object.hasOwn(canonical, field),
          `Generated detail ${record.id}.${field} has stale field presence; run npm run sync-destination-details`,
        );
        if (!Object.hasOwn(canonical, field)) continue;
        assert.ok(
          isDeepStrictEqual(detail[field], canonical[field]),
          `Generated detail ${record.id}.${field} differs from canonical; run npm run sync-destination-details`,
        );
      }
    }
  }
}

function currentOutcomes(ledger, manifest) {
  const outcomes = new Map(
    manifest.records.map((record) => [record.id, record.outcomeAfter]),
  );
  for (const entry of ledger.entries) {
    for (const record of entry.records) {
      outcomes.set(record.id, record.adjudicatedOutcome);
    }
  }
  return outcomes;
}

function renderFollowUpMarkdown(ledger, manifest) {
  const outcomes = currentOutcomes(ledger, manifest);
  const pass = [...outcomes.values()].filter((o) => o === "PASS").length;
  const failing = [...outcomes]
    .filter(([, o]) => o === "FAIL")
    .map(([id]) => id);
  const lines = [
    "# KAI-306: Follow-up Audit Ledger",
    "",
    "This ledger is **append-only** and sits beside the frozen 2026-10-08 audit (`destination-sample-audit.json/.md`), which is unchanged. `npm run audit:kai-306` reverses every ledger patch from the live catalogue and requires the exact pinned October 8 candidate bytes, so the historical replay stays reproducible and no unledgered catalogue change passes silently.",
    "",
    "**Automated vs manual:** the script verifies the hash chain, the patch values, the 20-ID cohort and that generated detail files match canonical fields. It does **not** re-fetch sources. Each PASS/FAIL below is a manual adjudication against the cited source observation on the stated check date.",
    "",
    "## Current adjudicated state",
    "",
    `- Public-fact gate: **${pass} PASS / ${20 - pass} FAIL** (2026-10-08 frozen result: ${manifest.scope.finalResult.PASS} PASS / ${manifest.scope.finalResult.FAIL} FAIL).`,
    `- Still FAIL: ${failing.length ? failing.map((id) => `\`${id}\``).join(", ") : "none"}.`,
    "- KAI-306 is **not** complete: the 20-destination gate has not been independently reassessed.",
    "",
  ];
  for (const entry of ledger.entries) {
    lines.push(`## ${entry.sequence}. ${entry.title}`, "");
    lines.push(
      `- Date: ${entry.date} · sources checked: ${entry.sourceCheckedOn} · base \`${entry.baseCommit}\``,
      `- Related PR: ${entry.pr.url ? `[${entry.pr.label}](${entry.pr.url})` : entry.pr.label} (${entry.pr.status}).`,
      `- Canonical SHA-256: \`${entry.beforeCanonicalSha256.slice(0, 12)}\` → \`${entry.afterCanonicalSha256.slice(0, 12)}\`.`,
      "",
    );
    lines.push("**Automated validation**", "");
    for (const item of entry.validation.automated) lines.push(`- ${item}`);
    lines.push("", "**Manual review**", "");
    for (const item of entry.validation.manual) lines.push(`- ${item}`);
    lines.push("");
    for (const record of entry.records) {
      lines.push(
        `### ${record.id}: ${record.outcomeBefore} → ${record.adjudicatedOutcome}`,
        "",
        `- Original finding: ${record.originalFinding}`,
        `- Observation at check time: ${record.currentObservation}`,
        `- Corrected fields: ${record.correctedFields.map((f) => `\`${f}\``).join(", ")}.`,
      );
      for (const override of record.editorialOverrides ?? []) {
        lines.push(
          `- Application override (separate from canonical hash patches): \`${override.file}\` · \`${override.field}\` — ${JSON.stringify(override.before)} → ${JSON.stringify(override.after)}. ${override.rationale}`,
        );
      }
      for (const reconciliation of record.auditReconciliations ?? []) {
        lines.push(
          `- Audit-manifest follow-up: \`${reconciliation.file}\` · \`${reconciliation.currentPath}\` — ${JSON.stringify(reconciliation.before)} → ${JSON.stringify(reconciliation.after)}. ${reconciliation.rationale}`,
        );
      }
      lines.push(`- Adjudication (manual): ${record.adjudicationNote}`);
      for (const source of record.sources) {
        lines.push(
          `- Source (${source.checkedOn}): [${source.url}](${source.url}) — ${source.observation}`,
        );
      }
      for (const residual of record.residual ?? []) {
        lines.push(`- Residual: ${residual}`);
      }
      lines.push("");
    }
  }
  return execFileSync(
    path.join(repoRoot, "node_modules/.bin/prettier"),
    ["--parser", "markdown"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: `${lines.join("\n")}\n`,
      timeout: 30000,
    },
  );
}

function loadBase(manifest) {
  // Reverse the declared patch from the exact candidate; the full-file hash then
  // proves the frozen baseline without requiring its Git object in shallow CI.
  const candidateRaw = reconstructPinnedCandidate(manifest, readLedger()).raw;
  assert.equal(
    sha256(candidateRaw),
    manifest.candidate.canonicalSha256,
    "Pinned candidate hash changed",
  );
  const candidate = readJson(candidateRaw, "Pinned candidate catalogue");
  assert.ok(
    Array.isArray(candidate),
    "Pinned candidate catalogue is not an array",
  );
  assert.equal(candidate.length, manifest.base.canonicalCount);

  const data = structuredClone(candidate);
  const byId = new Map(data.map((record) => [record.id, record]));
  assert.equal(byId.size, data.length, "Pinned candidate has duplicate IDs");
  for (const record of [...manifest.records].reverse()) {
    const target = byId.get(record.id);
    assert.ok(target, `Pinned candidate is missing ${record.id}`);
    for (const change of [...record.changes].reverse()) {
      const current = getPath(target, change.path, record.id);
      assert.equal(
        current.present,
        change.afterPresent,
        `Candidate presence mismatch at ${record.id}.${change.path.join(".")}`,
      );
      if (change.afterPresent) {
        assert.ok(
          isDeepStrictEqual(current.value, change.after),
          `Candidate value mismatch at ${record.id}.${change.path.join(".")}`,
        );
      }
      setPath(
        target,
        change.path,
        change.before,
        change.beforePresent,
        record.id,
      );
    }
  }

  const raw = stableJson(data);
  assert.equal(
    sha256(raw),
    manifest.base.canonicalSha256,
    "Reconstructed frozen base hash changed",
  );
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
    ["visibleParkingBefore", "visibleParkingAfter", "parking"],
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
    `- Matched screenshots: ${manifest.runtimeProbe.visualComparison.matchedBeforeAfterScreenshots} across ${manifest.runtimeProbe.visualComparison.destinations.join(", ")} at ${manifest.runtimeProbe.visualComparison.viewports.join(", ")}. ${manifest.runtimeProbe.visualComparison.agentVisualInspection} Human approval: **${manifest.runtimeProbe.visualComparison.humanApproval}**. ${manifest.runtimeProbe.visualComparison.imagesCommitted ? "Sheets are committed below." : "Sheets are not yet committed."}`,
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
  const ledger = readLedger();
  const { data: base } = loadBase(manifest);
  const replay = applyCandidate(base, manifest);
  assert.equal(replay.state, "A", "Frozen base should be candidate state A");
  const pinned = reconstructPinnedCandidate(manifest, ledger);
  assert.equal(
    sha256(pinned.raw),
    manifest.candidate.canonicalSha256,
    "Pinned candidate hash changed",
  );
  const pinnedCandidate = readJson(pinned.raw, "Pinned candidate catalogue");
  assert.deepEqual(
    replay.candidate,
    pinnedCandidate,
    "Candidate manifest does not reproduce the pinned candidate catalogue",
  );
  const current = readJson(pinned.currentRaw, "Current canonical catalogue");
  if (ledger?.entries?.length) verifyFollowUps(ledger, manifest, current);
  return {
    currentRaw: pinned.currentRaw,
    current,
    ledger,
    rendered: renderMarkdown(manifest),
    renderedFollowUp: ledger?.entries?.length
      ? renderFollowUpMarkdown(ledger, manifest)
      : null,
  };
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
    if (verified.renderedFollowUp) {
      writeFileSync(followUpReportPath, verified.renderedFollowUp);
      console.log(
        `Rendered ${path.relative(repoRoot, followUpReportPath)} (${Buffer.byteLength(verified.renderedFollowUp)} bytes).`,
      );
    }
    return;
  }

  const committedReport = readFileSync(reportPath, "utf8");
  assert.equal(
    committedReport,
    verified.rendered,
    "Rendered audit report is stale; run --render and review the diff",
  );
  if (verified.renderedFollowUp) {
    assert.ok(
      existsSync(followUpReportPath),
      "Follow-up report missing; run --render",
    );
    assert.equal(
      readFileSync(followUpReportPath, "utf8"),
      verified.renderedFollowUp,
      "Rendered follow-up report is stale; run --render and review the diff",
    );
  }
  const followUps = verified.ledger?.entries?.length ?? 0;
  console.log(
    `KAI-306 audit verified: ${manifest.records.length} records; ${manifest.candidate.changedRecordCount} changed; ${manifest.candidate.fieldPathChangeCount} field paths; state=A; ${followUps} follow-up ledger entr${followUps === 1 ? "y" : "ies"}; canonical SHA-256 ${sha256(verified.currentRaw)}.`,
  );
  if (followUps) {
    const outcomes = currentOutcomes(verified.ledger, manifest);
    const pass = [...outcomes.values()].filter((o) => o === "PASS").length;
    console.log(
      `Adjudicated gate after follow-ups (manual, not recomputed): ${pass} PASS / ${20 - pass} FAIL.`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
