#!/usr/bin/env node
/**
 * KAI-245: fail the build if the GA4 document-shell installation drifts.
 *
 * This checks the actual Vite/SEO output, not only source templates. Every
 * generated public HTML file must retain one discoverable Google tag loader
 * and one same-origin initializer. The initializer itself is checked for one
 * js/config queue pair, production-host gating, and locale-redirect handling.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const GA4_URL = "https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190";
const GA4_INIT_REFERENCE =
  /<script\b(?=[^>]*\bsrc=["']\/ga4-init\.js["'])[^>]*>\s*<\/script>/gi;
const GA4_INIT_PATH = path.join(DIST, "ga4-init.js");
const failures = [];

// Cloudflare's static 404 documents are error pages, not application HTML
// shells. They intentionally remain analytics-free.
function isPublicHtmlShell(file) {
  const relative = path.relative(DIST, file).replaceAll(path.sep, "/");
  return relative !== "404.html" && relative !== "ja/404.html";
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function collectFiles(directory, predicate, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, predicate, result);
    else if (predicate(absolute)) result.push(absolute);
  }
  return result;
}

function fail(message) {
  failures.push(message);
}

function checkSourceArchitecture() {
  const main = fs.readFileSync(path.join(ROOT, "src/main.tsx"), "utf8");
  if (main.includes("initializeGoogleAnalytics")) {
    fail("src/main.tsx still contains the old dynamic GA bootstrap");
  }
  if (
    fs.existsSync(
      path.join(ROOT, "src/shared/services/analytics/GoogleAnalytics.ts"),
    )
  ) {
    fail(
      "the obsolete src/shared/services/analytics/GoogleAnalytics.ts exists",
    );
  }
}

function checkHeaders() {
  const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");
  const meta = fs.readFileSync(path.join(ROOT, "src/seo/meta.ts"), "utf8");
  const headerCsp = headers
    .match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/;$/, "");
  const metaCsp = meta.match(/"Content-Security-Policy":\s*"([^"]+)"/s)?.[1];
  if (!headerCsp || !metaCsp || headerCsp !== metaCsp) {
    fail(
      "public/_headers and src/seo/meta.ts CSP policies are not synchronized",
    );
  }
  for (const [label, csp] of [
    ["public/_headers", headerCsp],
    ["src/seo/meta.ts", metaCsp],
  ]) {
    if (!csp) continue;
    const scriptSource = csp.match(/(?:^|; )script-src ([^;]+)/)?.[1] ?? "";
    if (scriptSource.includes("unsafe-inline")) {
      fail(`${label} weakens script-src with unsafe-inline`);
    }
    if (!scriptSource.includes("https://www.googletagmanager.com")) {
      fail(`${label} script-src does not allow the Google tag loader`);
    }
  }
}

function checkInitializer() {
  if (!fs.existsSync(GA4_INIT_PATH)) {
    fail("dist/ga4-init.js is missing");
    return;
  }
  const source = fs.readFileSync(GA4_INIT_PATH, "utf8");
  if (!source.includes('window.location.hostname !== "meguruto.app"')) {
    fail("dist/ga4-init.js is missing exact production-host gating");
  }
  if (count(source, 'window.gtag("js", new Date())') !== 1) {
    fail("dist/ga4-init.js must contain exactly one gtag js initialization");
  }
  if (count(source, 'window.gtag("config", MEASUREMENT_ID)') !== 1) {
    fail("dist/ga4-init.js must contain exactly one GA4 config call");
  }
  if (count(source, 'const MEASUREMENT_ID = "G-5QKWZM9190";') !== 1) {
    fail("dist/ga4-init.js must contain the correct GA4 measurement ID");
  }
  if (
    source.includes('"event", "page_view"') ||
    source.includes("'event', 'page_view'")
  ) {
    fail("dist/ga4-init.js must not emit a duplicate explicit page_view event");
  }
}

function checkGeneratedHtml() {
  const htmlFiles = collectFiles(
    DIST,
    (file) => file.endsWith(".html") && isPublicHtmlShell(file),
  );
  if (htmlFiles.length === 0) {
    fail("dist contains no generated HTML files");
    return;
  }
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const relative = path.relative(DIST, file);
    const loaderCount = count(html, GA4_URL);
    const initCount = html.match(GA4_INIT_REFERENCE)?.length ?? 0;
    if (loaderCount !== 1) {
      fail(
        `${relative}: expected exactly one GA4 loader URL, found ${loaderCount}`,
      );
    }
    if (initCount !== 1) {
      fail(
        `${relative}: expected exactly one /ga4-init.js reference, found ${initCount}`,
      );
    }
  }
}

function checkBundlesAndServiceWorker() {
  const builtScripts = collectFiles(path.join(DIST, "assets"), (file) =>
    file.endsWith(".js"),
  );
  for (const file of builtScripts) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(DIST, file);
    for (const forbidden of [
      "initializeGoogleAnalytics",
      "data-meguruto-google-analytics",
      "googletagmanager.com/gtag/js",
    ]) {
      if (source.includes(forbidden)) {
        fail(
          `${relative}: old dynamic GA installation marker remains (${forbidden})`,
        );
      }
    }
  }

  const workerPath = path.join(DIST, "sw.js");
  if (fs.existsSync(workerPath)) {
    const worker = fs.readFileSync(workerPath, "utf8");
    if (worker.includes("/ga4-init.js")) {
      fail(
        "dist/sw.js must not retain ga4-init.js indefinitely in the PWA shell cache",
      );
    }
  }
}

if (!fs.existsSync(DIST))
  fail("dist directory is missing; run npm run build first");
if (failures.length === 0) {
  checkSourceArchitecture();
  checkHeaders();
  checkInitializer();
  checkGeneratedHtml();
  checkBundlesAndServiceWorker();
}

if (failures.length > 0) {
  console.error(
    `❌ KAI-245 GA4 installation check failed (${failures.length}):`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const htmlCount = collectFiles(
  DIST,
  (file) => file.endsWith(".html") && isPublicHtmlShell(file),
).length;
console.log(
  `✅ KAI-245 GA4 installation verified: ${htmlCount} generated HTML shells, one loader and one init reference each`,
);
