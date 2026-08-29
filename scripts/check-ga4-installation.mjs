#!/usr/bin/env node
/**
 * KAI-245: fail the build if the GA4 document-shell installation drifts.
 *
 * This checks the actual Vite/SEO output, not only source templates. Every
 * generated public HTML file must retain one discoverable Google tag loader
 * and one inline initializer. The initializer is validated and its exact
 * bytes are locked to the CSP hash in both header policy sources.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const GA4_URL = "https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190";
const GA4_MEASUREMENT_ID = "G-5QKWZM9190";
const GA4_INLINE_MARKER = "window.dataLayer = window.dataLayer || [];";
const SCRIPT_PATTERN = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const JS_INIT_PATTERN = /gtag\(\s*['"]js['"]\s*,\s*new Date\(\)\s*\)/g;
const CONFIG_PATTERN = /gtag\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
const failures = [];

// Cloudflare's static 404 documents are error pages, not application HTML
// shells. They intentionally remain analytics-free.
function isPublicHtmlShell(file) {
  const relative = path.relative(DIST, file).replaceAll(path.sep, "/");
  return relative !== "404.html" && relative !== "ja/404.html";
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

function extractInlineInitializers(html) {
  return [...html.matchAll(SCRIPT_PATTERN)]
    .map((match) => match[1] ?? "")
    .filter((body) => body.includes(GA4_INLINE_MARKER));
}

function hashInlineInitializer(source) {
  return createHash("sha256").update(source, "utf8").digest("base64");
}

function readCspSources() {
  const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");
  const meta = fs.readFileSync(path.join(ROOT, "src/seo/meta.ts"), "utf8");
  const headerCsp = headers
    .match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/;$/, "");
  const metaCsp = meta.match(/"Content-Security-Policy":\s*"([^"]+)"/s)?.[1];
  return { headerCsp, metaCsp };
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
  if (fs.existsSync(path.join(ROOT, "public/ga4-init.js"))) {
    fail("the obsolete public/ga4-init.js initializer still exists");
  }

  const routes = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public/_routes.json"), "utf8"),
  );
  if (routes.exclude?.includes("/ga4-init.js")) {
    fail("public/_routes.json still excludes the obsolete initializer");
  }
}

function checkHeaders(initializerHash) {
  const { headerCsp, metaCsp } = readCspSources();
  if (!headerCsp || !metaCsp || headerCsp !== metaCsp) {
    fail(
      "public/_headers and src/seo/meta.ts CSP policies are not synchronized",
    );
  }

  const expectedHash = `'sha256-${initializerHash}'`;
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
    const hashSources = scriptSource.match(/'sha256-[^']+'/g) ?? [];
    if (hashSources.length !== 1 || hashSources[0] !== expectedHash) {
      fail(
        `${label} script-src must contain exactly the inline initializer hash ${expectedHash}`,
      );
    }
  }
}

function checkInitializer(source) {
  if (!source.includes("function gtag(){dataLayer.push(arguments);}")) {
    fail(
      "inline GA4 initializer is missing Google's standard gtag queue function",
    );
  }
  if (source.match(JS_INIT_PATTERN)?.length !== 1) {
    fail(
      "inline GA4 initializer must contain exactly one gtag js initialization",
    );
  }

  const configs = [...source.matchAll(CONFIG_PATTERN)];
  if (configs.length !== 1) {
    fail("inline GA4 initializer must contain exactly one gtag config call");
  } else if (configs[0]?.[1] !== GA4_MEASUREMENT_ID) {
    fail(
      `inline GA4 initializer must configure ${GA4_MEASUREMENT_ID}, found ${configs[0]?.[1]}`,
    );
  }
  if (
    source.match(/window\.location\.hostname === ["']meguruto\.app["']/g)
      ?.length !== 1
  ) {
    fail("inline GA4 initializer is missing the exact production-host gate");
  }
  if (source.includes("page_view")) {
    fail(
      "inline GA4 initializer must not emit a duplicate explicit page_view event",
    );
  }
}

function checkGeneratedHtml() {
  const htmlFiles = collectFiles(
    DIST,
    (file) => file.endsWith(".html") && isPublicHtmlShell(file),
  );
  if (htmlFiles.length === 0) {
    fail("dist contains no generated HTML files");
    return null;
  }

  let initializerSource = null;
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const relative = path.relative(DIST, file);
    const loaderCount = html.split(GA4_URL).length - 1;
    const initializers = extractInlineInitializers(html);

    if (loaderCount !== 1) {
      fail(
        `${relative}: expected exactly one GA4 loader URL, found ${loaderCount}`,
      );
    }
    if (html.includes("/ga4-init.js")) {
      fail(`${relative}: obsolete external GA4 initializer reference remains`);
    }
    if (initializers.length !== 1) {
      fail(
        `${relative}: expected exactly one inline GA4 initializer, found ${initializers.length}`,
      );
      continue;
    }

    const [source] = initializers;
    if (initializerSource === null) initializerSource = source;
    else if (source !== initializerSource) {
      fail(`${relative}: inline GA4 initializer differs from the source shell`);
    }
  }

  if (initializerSource === null) return null;
  checkInitializer(initializerSource);
  return hashInlineInitializer(initializerSource);
}

function checkBundles() {
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
}

if (!fs.existsSync(DIST)) {
  fail("dist directory is missing; run npm run build first");
} else {
  checkSourceArchitecture();
  const initializerHash = checkGeneratedHtml();
  if (initializerHash) checkHeaders(initializerHash);
  else fail("could not compute the inline GA4 initializer CSP hash");
  checkBundles();
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
  `✅ KAI-245 GA4 installation verified: ${htmlCount} generated HTML shells, one loader and one CSP-hashed inline initializer each`,
);
