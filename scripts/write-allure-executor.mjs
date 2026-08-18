#!/usr/bin/env node
/**
 * KAI-126: write allure-results/executor.json SAFELY.
 *
 * Never interpolate workflow-run/PR fields into shell source (a PR title is
 * attacker-controlled on a public repo and could inject shell code into the
 * privileged trusted-main publisher). All untrusted metadata arrives via
 * environment variables and is serialized with JSON.stringify — a value can
 * never become executable.
 *
 * Env:
 *   EXECUTOR_URL        workflow-run URL
 *   EXECUTOR_BUILD_NAME human build label (SAFE: composed from fixed pieces)
 *   EXECUTOR_BUILD_URL  workflow-run URL
 *   EXECUTOR_REPORT_NAME report name (fixed)
 *   EXECUTOR_REPORT_URL  https://meguruto.app/e2e
 *   EXECUTOR_BUILD_ORDER monotonic build order (number)
 *   OUTPUT_DIR          directory to write executor.json into (default ".")
 */
import fs from "node:fs";
import path from "node:path";

const get = (k, dflt = "") => process.env[k] ?? dflt;
const outDir = get("OUTPUT_DIR", ".");
const executor = {
  name: "GitHub Actions",
  type: "github",
  url: get("EXECUTOR_URL"),
  buildName: get("EXECUTOR_BUILD_NAME"),
  buildUrl: get("EXECUTOR_BUILD_URL"),
  reportName: get("EXECUTOR_REPORT_NAME", "Meguruto E2E Dashboard"),
  reportUrl: get("EXECUTOR_REPORT_URL", "https://meguruto.app/e2e"),
  buildOrder: Number(get("EXECUTOR_BUILD_ORDER", "0")),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "executor.json"),
  `${JSON.stringify(executor, null, 2)}\n`,
);
console.log(`executor.json written (buildOrder=${executor.buildOrder})`);
