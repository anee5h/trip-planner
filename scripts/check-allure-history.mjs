#!/usr/bin/env node
/**
 * KAI-126: deterministic Allure history + failure-fixture checks.
 *
 * 1. Controlled FAILING-report fixture: generate a report from a result
 *    with status "failed" + an attachment, and assert the generated report
 *    carries the failure (data/test-cases + widgets) and the attachment.
 * 2. Two-run HISTORY CONTINUITY: run A generates a report (history/ is
 *    written); run B restores run A's history/ into its result set, then
 *    generates — assert history-trend.json now contains 2 entries (A + B).
 *
 * This exercises the EXACT restore mechanism the publisher uses, locally
 * and deterministically. Real R2 persistence remains owner-side acceptance.
 *
 * Usage: node scripts/check-allure-history.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kai126-hist-"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function genResult(dir, { name, status, uuid, attachment }) {
  fs.mkdirSync(dir, { recursive: true });
  const id = uuid ?? crypto.randomUUID();
  const result = {
    uuid: id,
    historyId: id,
    name,
    fullName: `kai126.${name.replace(/\s+/g, "-")}`,
    status,
    stage: "finished",
    start: Date.now() - 1000,
    stop: Date.now(),
    labels: [
      { name: "playwrightProject", value: "chromium-desktop" },
      { name: "ciBin", value: "1" },
    ],
  };
  if (attachment) {
    const attachName = `${id}-attachment.txt`;
    fs.writeFileSync(path.join(dir, attachName), attachment.content);
    result.attachments = [
      { name: attachName, source: attachName, type: "text/plain" },
    ];
  }
  fs.writeFileSync(path.join(dir, `${id}-result.json`), JSON.stringify(result));
}

function generate(resultsDir, outDir) {
  execSync(
    `ALLURE_NO_ANALYTICS=1 npx allure generate "${resultsDir}" -o "${outDir}" --clean`,
    { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] },
  );
}

function main() {
  // ---- 1. Failed-test fixture + attachment ----
  const failResults = path.join(TMP, "fail-results");
  genResult(failResults, {
    name: "controlled failing test",
    status: "failed",
    uuid: "aaa-fail-0001",
    attachment: { content: "expected failure detail\nstack: at kai126.js:42" },
  });
  genResult(failResults, {
    name: "passing sibling",
    status: "passed",
    uuid: "bbb-pass-0002",
  });
  const failReport = path.join(TMP, "fail-report");
  generate(failResults, failReport);

  // The failing test's result JSON must be in data/test-cases with failed status.
  const testCaseFiles = fs.readdirSync(
    path.join(failReport, "data", "test-cases"),
  );
  assert(
    testCaseFiles.length >= 2,
    "failed report must contain test-case data",
  );
  const failedCase = testCaseFiles
    .map((f) =>
      JSON.parse(
        fs.readFileSync(path.join(failReport, "data", "test-cases", f), "utf8"),
      ),
    )
    .find((tc) => tc.status === "failed");
  assert(failedCase, "failed report must contain a status=failed test case");
  // The attachment FILE must be materialized in data/attachments (Allure
  // stores attachment metadata separately; the file is the ground truth).
  const attachDir = path.join(failReport, "data", "attachments");
  assert(
    fs.existsSync(attachDir) && fs.readdirSync(attachDir).length >= 1,
    "failed report must materialize the attachment in data/attachments",
  );
  // The widgets summary must reflect the failure (failed widget count >= 1).
  const summaryWidget = JSON.parse(
    fs.readFileSync(path.join(failReport, "widgets", "summary.json"), "utf8"),
  );
  assert(
    summaryWidget.statistic?.failed >= 1,
    `widgets summary must count >= 1 failed (got ${summaryWidget.statistic?.failed})`,
  );
  console.log(
    "  ✓ controlled failed-test fixture: failed case + attachment file + summary count present",
  );

  // ---- 2. Two-run history continuity ----
  const runA = path.join(TMP, "runA-results");
  genResult(runA, {
    name: "run A test",
    status: "passed",
    uuid: "ccc-runA-0003",
  });
  const reportA = path.join(TMP, "reportA");
  generate(runA, reportA);
  assert(
    fs.existsSync(path.join(reportA, "history", "history.json")),
    "run A report must produce history/history.json",
  );
  assert(
    fs.existsSync(path.join(reportA, "history", "history-trend.json")),
    "run A report must produce history/history-trend.json",
  );

  // Run B: restore run A's ENTIRE history/ into the new result set, then generate.
  const runB = path.join(TMP, "runB-results");
  genResult(runB, {
    name: "run B test",
    status: "passed",
    uuid: "ddd-runB-0004",
  });
  fs.mkdirSync(path.join(runB, "history"), { recursive: true });
  for (const hf of fs.readdirSync(path.join(reportA, "history"))) {
    fs.copyFileSync(
      path.join(reportA, "history", hf),
      path.join(runB, "history", hf),
    );
  }
  const reportB = path.join(TMP, "reportB");
  generate(runB, reportB);

  const trendB = JSON.parse(
    fs.readFileSync(
      path.join(reportB, "history", "history-trend.json"),
      "utf8",
    ),
  );
  assert(
    Array.isArray(trendB) && trendB.length >= 2,
    `history-trend after run B must contain >= 2 entries (got ${trendB?.length})`,
  );
  console.log(
    `  ✓ two-run history continuity: run A + run B -> ${trendB.length} trend entries`,
  );

  console.log("\n✅ KAI-126 history + failure-fixture checks ALL PASSED");
  fs.rmSync(TMP, { force: true, recursive: true });
}

main();
