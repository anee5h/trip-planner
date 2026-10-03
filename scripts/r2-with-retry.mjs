#!/usr/bin/env node
/**
 * Run one Wrangler R2 command with bounded retries for transient provider and
 * network failures. Authentication, authorization, configuration, and
 * missing-bucket failures are deliberately terminal.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

export const MAX_ATTEMPTS = 5;
export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 30_000;

const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504, 522, 524]);
const HTTP_STATUS_PATTERN =
  /(?:\bHTTP(?:\/\d(?:\.\d)?)?\s*|-\s*|\bstatus(?:\s*code)?[:=\s]*)(\d{3})\b/gi;
const NON_RETRYABLE_PATTERN =
  /(?:\b(?:authentication|authorization)\b|\b(?:unauthori[sz]ed|forbidden|access denied|invalid credential|invalid token)\b|\b(?:missing|invalid|unknown)\s+(?:configuration|credential|token|account|bucket)\b|\b(?:bucket|object)\s+(?:not found|does not exist)\b|\bno such bucket\b)/i;
const NETWORK_FAILURE_PATTERN =
  /(?:failed to fetch|fetch failed|connection timed out|connect(?:ion)?\s+reset|socket hang up|(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT))/i;

/** Return the last HTTP-like status code in provider output, if any. */
export function extractHttpStatus(output) {
  const matches = [...output.matchAll(HTTP_STATUS_PATTERN)];
  return matches.length > 0 ? Number(matches.at(-1)[1]) : null;
}

/** Classify only transient R2/provider/network failures as retryable. */
export function isRetryableR2Failure(output) {
  if (NON_RETRYABLE_PATTERN.test(output)) return false;
  const status = extractHttpStatus(output);
  return (
    (status !== null && TRANSIENT_HTTP_STATUSES.has(status)) ||
    NETWORK_FAILURE_PATTERN.test(output)
  );
}

/** A missing history object is expected; a missing bucket is not. */
export function isMissingObjectFailure(output) {
  const status = extractHttpStatus(output);
  return (
    status === 404 &&
    !/(?:\bbucket\b.*(?:not found|does not exist)|no such bucket|missing bucket)/i.test(
      output,
    )
  );
}

/** Compute exponential backoff with injectable randomness for deterministic tests. */
export function getRetryDelayMs(attempt, random = Math.random) {
  const exponential = Math.min(
    MAX_DELAY_MS,
    BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = 0.5 + random() * 0.5;
  return Math.round(exponential * jitter);
}

function runCommand(command, args) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolveResult({
        code: null,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });
    child.on("close", (code, signal) => {
      resolveResult({ code, signal, stdout, stderr });
    });
  });
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function parseArguments(argv) {
  let allowMissingObject = false;
  let index = 0;
  while (index < argv.length && argv[index] !== "--") {
    if (argv[index] === "--allow-missing-object") {
      allowMissingObject = true;
      index += 1;
      continue;
    }
    throw new Error(`unknown wrapper option: ${argv[index]}`);
  }
  if (argv[index] === "--") index += 1;
  if (index >= argv.length) {
    throw new Error(
      "usage: r2-with-retry.mjs [--allow-missing-object] -- command [args... ]",
    );
  }
  return {
    allowMissingObject,
    command: argv[index],
    args: argv.slice(index + 1),
  };
}

async function main() {
  const { allowMissingObject, command, args } = parseArguments(
    process.argv.slice(2),
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await runCommand(command, args);
    if (result.code === 0) {
      printOutput(result);
      return 0;
    }

    const output = `${result.stdout}\n${result.stderr}`;
    if (allowMissingObject && isMissingObjectFailure(output)) {
      console.log(
        "ℹ️ R2 history object is absent; continuing without prior history.",
      );
      return 0;
    }

    const status = extractHttpStatus(output);
    if (attempt < MAX_ATTEMPTS && isRetryableR2Failure(output)) {
      const delayMs = getRetryDelayMs(attempt);
      const statusLabel =
        status === null ? "network failure" : `HTTP ${status}`;
      console.warn(
        `⚠️ transient R2 ${statusLabel}; retry ${attempt + 1}/${MAX_ATTEMPTS} in ${delayMs}ms`,
      );
      await new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs));
      continue;
    }

    console.error(
      `❌ R2 command failed after ${attempt} attempt${attempt === 1 ? "" : "s"}${status === null ? "" : ` (HTTP ${status})`}.`,
    );
    printOutput(result);
    return typeof result.code === "number" && result.code !== 0
      ? result.code
      : 1;
  }

  return 1;
}

const invokedAsScript =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(`❌ R2 retry wrapper configuration error: ${error.message}`);
    process.exit(1);
  });
}
