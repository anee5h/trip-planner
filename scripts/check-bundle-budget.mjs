#!/usr/bin/env node
/**
 * KAI-82: initial-load JS bundle budget gate.
 *
 * Measures the real cold-load graph for the homepage:
 *   1. bootstrap  — entry script + <link rel="modulepreload"> set from
 *                   dist/index.html (parsed order-independently; FAILS CLOSED
 *                   if no assets can be identified).
 *   2. home route — the transitive dynamic-import closure of the Home route
 *                   chunk (React.lazy routes are NOT in the static preload
 *                   set, so the static parser alone would miss route weight).
 *
 * Budgets:
 *   - total home cold-load gzip: catches re-importing a heavy library into
 *     the home graph (e.g. Leaflet re-add ≈ +44 KB gzip → fails).
 *   - largest single preloaded chunk gzip: catches a dependency ballooning
 *     the shared chunk that all routes pay for.
 *
 * Run after `npm run build`. Exits 1 on any violation or measurement failure.
 */
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const ASSETS = path.join(DIST, "assets");

// Budgets (KB), measured with node zlib level 6 on 2026-08-16 (KAI-82 head):
//   home cold-load 6,137 KB raw / 1,011 KB gzip (16 files, incl. Home route)
//   largest chunk  utils 746 KB gzip
// Margins are ~2.5% so that reintroducing Leaflet into the shared graph
// (+~43 KB gzip: utils → 789, home → 1,054) FAILS both budgets.
// TODO(kai-82 phase 2): remove destinations-index.json from the initial load
// and LOWER these budgets — the 6.5 MB index is the primary root cause.
const BUDGETS = {
  homeTotalGzipKb: 1030, // 1011 baseline; +43 KB leaflet → 1054 → FAIL
  largestChunkGzipKb: 765, // 746 baseline; +43 KB leaflet → 789 → FAIL
};

function readAssetsIndex() {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const urls = [];
  // Order-independent attribute parsing; fails closed if nothing matches.
  for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
    urls.push(m[1]);
  }
  for (const m of html.matchAll(
    /<link[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g,
  )) {
    if (!urls.includes(m[1])) urls.push(m[1]);
  }
  if (urls.length === 0) {
    console.error(
      "FAIL: no entry script or modulepreload assets found in dist/index.html",
    );
    process.exit(1);
  }
  return urls;
}

const chunkFiles = new Set(
  readdirSync(ASSETS).filter((f) => f.endsWith(".js")),
);

function loadChunk(url) {
  return readFileSync(path.join(ASSETS, path.basename(url)), "utf8");
}

/** Dynamic-import closure of a chunk (vite emits import("./x.js") /
 *  import(`./x.js`) for React.lazy routes). */
function routeClosure(entryUrl) {
  const seen = new Set();
  const queue = [path.basename(entryUrl)];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name) || !chunkFiles.has(name)) continue;
    seen.add(name);
    const content = loadChunk(name);
    for (const m of content.matchAll(/import\([`'"]([^`'"]+\.js)[`'"]\)/g)) {
      const ref = path.basename(m[1]);
      if (chunkFiles.has(ref)) queue.push(ref);
    }
  }
  return [...seen];
}

function sizeOf(url) {
  const buf = readFileSync(path.join(ASSETS, path.basename(url)));
  return { raw: buf.length, gzip: gzipSync(buf).length };
}

function main() {
  const bootstrap = readAssetsIndex();
  const homeChunks =
    chunkFiles.size > 0
      ? [...chunkFiles].find((f) => /^Home-/.test(f))
      : undefined;
  if (!homeChunks) {
    console.error("FAIL: could not locate the Home route chunk in dist/assets");
    process.exit(1);
  }
  const homeClosure = routeClosure(homeChunks);

  const allHome = new Set([...bootstrap, ...homeClosure]);
  let homeRaw = 0;
  let homeGzip = 0;
  let largestChunkGzip = 0;
  let largestChunkName = "";
  for (const url of allHome) {
    const { raw, gzip } = sizeOf(url);
    homeRaw += raw;
    homeGzip += gzip;
    if (gzip > largestChunkGzip) {
      largestChunkGzip = gzip;
      largestChunkName = path.basename(url);
    }
  }

  const fmt = (kb) => `${(kb / 1024).toFixed(0)} KB`;
  console.log(`bootstrap (preload set): ${bootstrap.length} files`);
  console.log(
    `home cold-load: ${allHome.size} files, ${fmt(homeRaw)} raw, ${fmt(homeGzip)} gzip`,
  );
  console.log(
    `largest home chunk: ${largestChunkName} ${fmt(largestChunkGzip)} gzip`,
  );
  console.log(
    `budgets: home gzip <= ${BUDGETS.homeTotalGzipKb} KB, ` +
      `largest chunk gzip <= ${BUDGETS.largestChunkGzipKb} KB`,
  );

  let fail = false;
  const homeGzipKb = homeGzip / 1024;
  const largestKb = largestChunkGzip / 1024;
  if (homeGzipKb > BUDGETS.homeTotalGzipKb) {
    console.error(
      `FAIL: home cold-load gzip ${fmt(homeGzip)} > budget ${BUDGETS.homeTotalGzipKb} KB`,
    );
    fail = true;
  }
  if (largestKb > BUDGETS.largestChunkGzipKb) {
    console.error(
      `FAIL: largest chunk gzip ${fmt(largestChunkGzip)} > budget ${BUDGETS.largestChunkGzipKb} KB`,
    );
    fail = true;
  }
  console.log(fail ? "❌ bundle budget exceeded" : "✅ bundle budget OK");
  process.exit(fail ? 1 : 0);
}

main();
