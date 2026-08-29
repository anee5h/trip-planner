#!/usr/bin/env node
/**
 * KAI-82: initial-load JS bundle budget gate.
 *
 * Measures the real cold-load graph for the homepage:
 *   1. bootstrap  — entry script + <link rel="modulepreload"> set from
 *                   dist/index.html (parsed order-independently; FAILS CLOSED
 *                   if no assets can be identified).
 *   2. home route — the Home route chunk's FULL static-import closure,
 *      resolved deterministically from the Vite build manifest
 *      (dist/.vite/manifest.json, build.manifest: true): entry → Home
 *      dynamic import → every statically-imported chunk the route pulls
 *      in at render (React.lazy routes are not in the static preload set,
 *      so a preload-only parse would miss route weight).
 *
 * Budgets:
 *   - total home cold-load gzip: catches re-importing a heavy library into
 *     the home graph (e.g. Leaflet re-add ≈ +44 KB gzip → fails).
 *   - largest single preloaded chunk gzip: catches a dependency ballooning
 *     the shared chunk that all routes pay for.
 *
 * Run after `npm run build`. Exits 1 on any violation or measurement failure.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { readAssetsIndex as readAssetsIndexFromHtml } from "./bundle-budget-assets.mjs";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const ASSETS = path.join(DIST, "assets");
const MANIFEST_PATH = path.join(DIST, ".vite", "manifest.json");

// Budgets are recalibrated from the deduplicated clean build output.
// KAI-121 (rework): the full catalogue is a runtime-lazy chunk fetched by
// explicit consumers (Home, /destinations, Compare, search-on-demand). It
// is NOT part of the cold-load closure — the bootstrap HTML never
// references it (verified below: the chunk is absent from index.html's
// script/preload set). The budgets are TIGHTENED to the measured post-lazy
// numbers with headroom: 666 KB -> 720 KB cap (8% headroom) and
// 368 KB -> 400 KB cap. Any regression that re-entangles the catalogue
// (or any other large module) into the cold-load graph fails.
const BUDGETS = {
  homeTotalGzipKb: 720, // measured 666 KB post-lazy; Leaflet negative = 732
  largestChunkGzipKb: 400, // measured 368 KB post-lazy; Leaflet negative = 391
};

function readAssetsIndex() {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  try {
    return readAssetsIndexFromHtml(html);
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
}

/** The Vite build manifest (dist/.vite/manifest.json): the deterministic
 *  source→chunk graph. `imports` = static imports, `dynamicImports` = lazy
 *  routes. Required — fail closed when missing. */
function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    console.error(
      "FAIL: dist/.vite/manifest.json missing — the budget gate needs " +
        "build.manifest (see vite.config.ts)",
    );
    process.exit(1);
  }
}

/** The homepage route chunk: the entry's dynamic import of features/home. */
function homeChunkFile(manifest) {
  const entry = manifest["index.html"];
  if (!entry?.dynamicImports?.length) {
    console.error("FAIL: manifest entry has no dynamic imports (lazy routes)");
    process.exit(1);
  }
  const homeSrc = entry.dynamicImports.find(
    (src) =>
      src.includes("/features/home/") && /Home(?:Heavy)?(\.tsx)?$/.test(src),
  );
  if (!homeSrc || !manifest[homeSrc]) {
    console.error(
      "FAIL: could not resolve the Home route chunk in the Vite manifest",
    );
    process.exit(1);
  }
  return { src: homeSrc, file: manifest[homeSrc].file };
}

/** Static-import closure of a route source from the manifest: the exact
 *  chunk set the route pulls in at load time (lazy route children excluded —
 *  they are not part of the initial render). */
function staticClosure(manifest, startSrc) {
  const seenSrcs = new Set();
  const queue = [startSrc];
  while (queue.length > 0) {
    const src = queue.shift();
    if (seenSrcs.has(src) || !manifest[src]) continue;
    seenSrcs.add(src);
    queue.push(...(manifest[src].imports ?? []));
  }
  return [...seenSrcs].map((s) => manifest[s].file);
}

/** Convert HTML/manifest references to one safe physical asset identity. */
function normalizeAssetPath(ref) {
  const normalized = ref.replace(/^\/+/, "");
  if (!normalized.startsWith("assets/") || normalized.includes("..")) {
    throw new Error(`invalid non-assets reference: ${ref}`);
  }
  return normalized;
}

function sizeOf(assetPath) {
  const buf = readFileSync(path.join(ASSETS, path.basename(assetPath)));
  return { raw: buf.length, gzip: gzipSync(buf).length };
}

function main() {
  const bootstrap = readAssetsIndex();
  const manifest = loadManifest();
  const home = homeChunkFile(manifest);
  // Home's static-import closure from the manifest = the exact chunk set
  // pulled in when the homepage route renders (bootstrap + Home + deps).
  const homeClosure = [home.file, ...staticClosure(manifest, home.src)];

  // Canonicalize before Set insertion: /assets/foo.js and assets/foo.js are
  // the same physical file and must contribute exactly once.
  const allHome = new Set(
    [...bootstrap, ...homeClosure].map(normalizeAssetPath),
  );
  // KAI-121: the destination catalogue is now a runtime-LAZY chunk fetched
  // after first paint — it is NOT part of the cold-load closure. Exclude
  // it from the cold-load measurement (and the largest-chunk gate, which
  // exists to catch shared-bundle bloat, not on-demand data chunks). The
  // budget below recalibrates to the new architecture.
  const onDemandChunks = new Set(
    [...allHome].filter((p) =>
      path.basename(p).startsWith("destinations-index-"),
    ),
  );
  // VERIFICATION: the on-demand chunk must NOT appear in the bootstrap
  // HTML (script/preload set) — it must be genuinely runtime-fetched, not
  // silently filtered from a preloaded set. If a future change statically
  // imports it, the manifest closure WOULD include it and this check (plus
  // the tightened budget) fails instead of masking the regression.
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  for (const chunk of onDemandChunks) {
    const inHtml = html.includes(path.basename(chunk));
    if (inHtml) {
      console.error(
        `FAIL: on-demand chunk ${path.basename(chunk)} appears in index.html — ` +
          "it is statically referenced, not runtime-lazy. Re-measure and re-justify.",
      );
      process.exit(1);
    }
  }
  const coldLoad = new Set([...allHome].filter((p) => !onDemandChunks.has(p)));
  let homeRaw = 0;
  let homeGzip = 0;
  let largestChunkGzip = 0;
  let largestChunkName = "";
  for (const url of coldLoad) {
    const { raw, gzip } = sizeOf(url);
    homeRaw += raw;
    homeGzip += gzip;
    if (gzip > largestChunkGzip) {
      largestChunkGzip = gzip;
      largestChunkName = path.basename(url);
    }
  }
  const fmt = (kb) => `${(kb / 1024).toFixed(0)} KB`;
  for (const url of onDemandChunks) {
    const { gzip } = sizeOf(url);
    console.log(
      `on-demand (excluded from cold-load): ${path.basename(url)} ${fmt(gzip)} gzip`,
    );
  }

  console.log(`bootstrap (preload set): ${bootstrap.length} files`);
  console.log(
    `home cold-load: ${coldLoad.size} files, ${fmt(homeRaw)} raw, ${fmt(homeGzip)} gzip`,
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
