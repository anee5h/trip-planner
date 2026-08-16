#!/usr/bin/env node
/**
 * KAI-82: initial-load JS bundle budget gate.
 *
 * Parses dist/index.html for the entry script + modulepreload set (the
 * exact initial-load graph the browser downloads for the homepage), sums
 * raw and gzip sizes, and fails when over budget. Run after `npm run build`.
 *
 * Budgets live here on purpose: lowering them is a deliberate act that shows
 * up in PR review, and CI fails loudly when a PR regresses initial load.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const ROOT = process.cwd();
const INDEX = path.join(ROOT, "dist", "index.html");
const html = readFileSync(INDEX, "utf8");

const urls = [];
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  urls.push(m[1]);
}
for (const m of html.matchAll(
  /<link rel="modulepreload"[^>]+href="([^"]+)"/g,
)) {
  if (!urls.includes(m[1])) urls.push(m[1]);
}

let raw = 0;
let gzip = 0;
const missing = [];
for (const u of urls) {
  const file = path.join(ROOT, "dist", u.replace(/^\//, ""));
  try {
    const buf = readFileSync(file);
    raw += buf.length;
    gzip += gzipSync(buf).length;
  } catch {
    missing.push(u);
  }
}

// Budgets: KAI-82 baseline measured 2026-08-16 after ejecting Leaflet from
// shared utils (6,059 KB raw / 992 KB gzip initial load). Headroom guards
// against regressions (e.g. re-importing a heavy lib into the shared graph).
// TODO(kai-82 follow-up): slim destinations-index.json for the client and
// LOWER these budgets — the 6.5 MB index is now the dominant term.
const RAW_BUDGET_KB = 6600;
const GZIP_BUDGET_KB = 1050;

const rawKb = raw / 1024;
const gzipKb = gzip / 1024;
console.log(
  `initial JS: ${urls.length} files, ${rawKb.toFixed(0)} KB raw, ` +
    `${gzipKb.toFixed(0)} KB gzip`,
);
console.log(`budget: raw <= ${RAW_BUDGET_KB} KB, gzip <= ${GZIP_BUDGET_KB} KB`);

let fail = false;
if (missing.length > 0) {
  console.error("missing assets:", missing.join(", "));
  fail = true;
}
if (rawKb > RAW_BUDGET_KB) {
  console.error(
    `FAIL: raw ${rawKb.toFixed(0)} KB > budget ${RAW_BUDGET_KB} KB`,
  );
  fail = true;
}
if (gzipKb > GZIP_BUDGET_KB) {
  console.error(
    `FAIL: gzip ${gzipKb.toFixed(0)} KB > budget ${GZIP_BUDGET_KB} KB`,
  );
  fail = true;
}
console.log(fail ? "❌ bundle budget exceeded" : "✅ bundle budget OK");
process.exit(fail ? 1 : 0);
