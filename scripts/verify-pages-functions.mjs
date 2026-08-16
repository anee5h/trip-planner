#!/usr/bin/env node
/**
 * KAI-68: end-to-end verification of the deployed Pages Function bundle
 * against the production build (dist/).
 *
 * Boots the real Cloudflare Pages local runtime (`wrangler pages dev`),
 * which compiles functions/ with Cloudflare's own bundler and serves dist/
 * exactly as the edge will, then asserts the full routing contract:
 *
 *   published destination        -> 200, prerendered HTML, no noindex
 *   beta/verified destination    -> 200, prerendered HTML, no noindex (KAI-97:
 *                                  status is a quality signal, not an
 *                                  indexability gate)
 *   unknown slug                 -> 404, X-Robots-Tag: noindex
 *   malformed id                 -> 404
 *   private SPA route (/settings)-> 200 + noindex (from public/_headers)
 *   normal SPA routes, built module asset, sitemap, robots, manifest -> 200
 *
 * The built module asset is discovered from dist/index.html (not hardcoded)
 * so the gate survives future Vite output changes.
 *
 * Exit codes: 0 pass, 1 fail (a failed assertion MUST make the script exit
 * non-zero — assert() records process.exitCode and the final exit() call
 * respects it instead of forcing 0). Requires `npm run build` first (dist/).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const PORT = 8799 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

/** Finds the Vite-built entry module URL (e.g. /assets/index-XXXX.js) from
 *  dist/index.html so the check does not depend on a hashed filename. */
function discoverBuiltAsset() {
  const shellPath = path.join(DIST, "index.html");
  if (!fs.existsSync(shellPath)) {
    throw new Error(
      `dist/index.html not found — run "npm run build" before this check.`,
    );
  }
  const shell = fs.readFileSync(shellPath, "utf8");
  const match = shell.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  if (!match) {
    throw new Error(
      `No module script found in dist/index.html — cannot verify the built asset.`,
    );
  }
  return match[1];
}

function fetchStatusAndRobots(path) {
  return new Promise((resolve, reject) => {
    fetch(`${BASE}${path}`, { redirect: "manual" })
      .then(async (res) => {
        const body = await res.text();
        resolve({
          status: res.status,
          robots: res.headers.get("x-robots-tag") ?? null,
          csp: res.headers.get("content-security-policy") ?? null,
          frame: res.headers.get("x-frame-options") ?? null,
          permissionsPolicy: res.headers.get("permissions-policy") ?? null,
          lang: body.match(/<html[^>]+lang="([^"]+)"/)?.[1] ?? null,
          location: res.headers.get("location") ?? null,
          body,
        });
      })
      .catch(reject);
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/robots.txt`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler pages dev did not become ready in time");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

function assertSecureHtml(result, label) {
  assert(
    result.csp?.includes("default-src 'self'") && result.frame === "DENY",
    `${label} preserves CSP + X-Frame-Options`,
  );
  // KAI-81: Function-served HTML must carry the same least-privilege
  // Permissions-Policy as the static layer (_headers). notifications= is
  // deliberately absent — it is not a Permissions-Policy-controlled feature.
  assert(
    result.permissionsPolicy?.includes("camera=()") &&
      result.permissionsPolicy?.includes("geolocation=(self)") &&
      result.permissionsPolicy?.includes("clipboard-write=(self)") &&
      !result.permissionsPolicy?.includes("notifications="),
    `${label} serves the least-privilege Permissions-Policy`,
  );
}

function normalizePolicy(value) {
  return value.replace(/\s+/g, " ").trim();
}

const server = spawn(
  "npx",
  [
    "wrangler",
    "pages",
    "dev",
    "dist",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
  ],
  { stdio: ["ignore", "pipe", "pipe"], detached: true },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

// Kill the whole process group (npx + wrangler + workerd children) with
// SIGKILL so no stray server outlives the check — SIGTERM lets workerd
// linger during graceful shutdown.
const exit = (code) => {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // already gone
  }
  // Prefer the explicit code; otherwise respect exitCode recorded by any
  // failed assert(). Never force 0 over a failed assertion.
  process.exit(code ?? process.exitCode ?? 0);
};
server.on("exit", () => {
  // If we already decided, exit; otherwise the server died unexpectedly.
  if (process.exitCode === undefined) {
    console.error(serverLog.slice(-2000));
    process.exit(1);
  }
});

try {
  const builtAsset = discoverBuiltAsset();
  console.log(`built module asset: ${builtAsset}`);

  await waitForServer(30_000);

  const published = await fetchStatusAndRobots(
    "/destinations/tokyo-station-chiyoda",
  );
  assert(
    published.status === 200 && published.robots === null,
    `published destination -> 200 prerendered HTML without noindex (got ${published.status})`,
  );
  assert(
    published.body.includes("Tokyo Station") &&
      published.body.includes('rel="canonical"'),
    "published destination body contains destination-specific HTML",
  );
  assertSecureHtml(published, "published destination");

  const trailingSlash = await fetchStatusAndRobots(
    "/destinations/tokyo-station-chiyoda/",
  );
  assert(
    trailingSlash.status === 200,
    `trailing-slash destination URL -> 200 (got ${trailingSlash.status})`,
  );

  // KAI-101: the Japanese locale version (/ja/...) serves localized
  // prerendered metadata for share-preview crawlers.
  const jaPublished = await fetchStatusAndRobots(
    "/ja/destinations/tokyo-station-chiyoda",
  );
  assert(
    jaPublished.status === 200 && jaPublished.robots === null,
    `JA published destination -> 200 prerendered without noindex (got ${jaPublished.status} ${jaPublished.robots})`,
  );
  assert(
    jaPublished.body.includes("東京駅") &&
      jaPublished.body.includes('rel="canonical"') &&
      jaPublished.body.includes('content="ja_JP"') &&
      jaPublished.body.includes("/ja/destinations/tokyo-station-chiyoda"),
    "JA destination body carries Japanese metadata and canonical",
  );

  const jaPublishedSlash = await fetchStatusAndRobots(
    "/ja/destinations/tokyo-station-chiyoda/",
  );
  assert(
    jaPublishedSlash.status === 200 &&
      jaPublishedSlash.body.includes('content="ja_JP"'),
    `JA trailing-slash destination URL -> 200 with JA metadata (got ${jaPublishedSlash.status})`,
  );

  const jaBare = await fetchStatusAndRobots("/ja");
  assert(
    // Platform directory canonicalization: /ja -> /ja/ (308), which
    // browsers and share-preview crawlers follow to the JA metadata.
    jaBare.status === 308,
    `JA bare home URL -> 308 redirect to /ja/ (got ${jaBare.status})`,
  );

  const jaHome = await fetchStatusAndRobots("/ja/");
  assert(
    jaHome.status === 200 && jaHome.body.includes("og-ja.png"),
    `JA home shell -> 200 with the Japanese social card (got ${jaHome.status})`,
  );

  const jaUnknown = await fetchStatusAndRobots(
    "/ja/destinations/this-destination-does-not-exist",
  );
  assert(
    jaUnknown.status === 404 && jaUnknown.robots === "noindex, follow",
    `JA unknown destination slug -> 404 + noindex (got ${jaUnknown.status})`,
  );

  const jaPrivate = await fetchStatusAndRobots("/ja/settings");
  assert(
    jaPrivate.status === 200 && jaPrivate.robots === "noindex",
    `JA private SPA route /ja/settings -> 200 + noindex (got ${jaPrivate.status} ${jaPrivate.robots})`,
  );

  for (const id of ["abashiri-city", "fuji-5-lake"]) {
    const res = await fetchStatusAndRobots(`/destinations/${id}`);
    assert(
      res.status === 200 && res.robots === null,
      `canonical destination ${id} (non-published quality status) -> 200 prerendered without noindex (got ${res.status} ${res.robots})`,
    );
  }

  // KAI-111: unknown public routes return REAL 404s, not soft-200 shells.
  for (const path of [
    "/random-garbage-path",
    "/foo/bar/baz",
    "/ja/not-a-real-route",
    "/destinations/this-destination-does-not-exist",
    "/settings/nope",
    "/my-trips/123",
    "/terms/foo",
    "/collections/foo/bar",
    "/ja/settings/nope",
    "/ja/terms/foo",
  ]) {
    const res = await fetchStatusAndRobots(path);
    assert(
      res.status === 404 && res.robots === "noindex, follow",
      `unknown route ${path} -> real 404 + noindex (got ${res.status})`,
    );
    assertSecureHtml(res, `404 ${path}`);
    if (path.startsWith("/ja/")) {
      assert(
        res.lang === "ja" &&
          res.body.includes('href="/ja/"') &&
          res.body.includes("ページが見つかりません"),
        `JA 404 ${path} is locale-aware`,
      );
    }
  }

  for (const path of [
    "/",
    "/destinations",
    "/collections/example",
    "/compare",
    "/favorites",
    "/bucket-list",
    "/my-trips",
    "/passport",
    "/visited-map",
    "/profile",
    "/settings",
    "/help",
    "/qa",
    "/editorial",
    "/terms",
    "/privacy",
    "/cookies",
    "/ja/",
    "/ja/collections/example",
  ]) {
    const res = await fetchStatusAndRobots(path);
    assert(
      res.status === 200,
      `known SPA route ${path} -> 200 shell (got ${res.status})`,
    );
    assertSecureHtml(res, `SPA ${path}`);
  }

  for (const path of [
    "/settings",
    "/my-trips",
    "/bucket-list",
    "/passport",
    "/profile",
    "/favorites",
    "/visited-map",
    "/qa",
    "/editorial",
    "/compare",
    "/ja/settings",
    "/ja/my-trips",
    "/ja/favorites",
    "/ja/qa",
    "/ja/editorial",
    "/ja/compare",
  ]) {
    const res = await fetchStatusAndRobots(path);
    assert(
      res.robots === "noindex",
      `private SPA route ${path} -> noindex (got ${res.robots})`,
    );
  }

  const jaSettings = await fetchStatusAndRobots("/ja/settings");
  assertSecureHtml(jaSettings, "JA private SPA");

  const unknown = await fetchStatusAndRobots(
    "/destinations/this-destination-does-not-exist",
  );
  assert(
    unknown.status === 404 && unknown.robots === "noindex, follow",
    `unknown destination slug -> 404 + noindex (got ${unknown.status})`,
  );

  const malformed = await fetchStatusAndRobots("/destinations/UPPER-CASE");
  assert(
    malformed.status === 404,
    `malformed destination id -> 404 (got ${malformed.status})`,
  );

  const settings = await fetchStatusAndRobots("/settings");
  assert(
    settings.status === 200 && settings.robots === "noindex",
    `private SPA route /settings -> 200 + noindex (got ${settings.status} ${settings.robots})`,
  );

  for (const path of [
    "/destinations",
    builtAsset,
    "/sitemap.xml",
    "/robots.txt",
    "/data/kai68-public-destinations.json",
  ]) {
    const res = await fetchStatusAndRobots(path);
    assert(res.status === 200, `${path} -> 200 (got ${res.status})`);
  }

  // KAI-111: the `/* /index.html 200` SPA wildcard was removed from
  // public/_redirects so missing static/asset-like URLs 404 at the edge
  // instead of soft-200ing to the app shell. wrangler pages dev has a
  // built-in index.html fallback for static misses, so the excluded
  // families are asserted from the built output config below, while a
  // non-excluded asset-like URL is asserted end-to-end through the
  // catch-all Function.
  const missingAsset = await fetchStatusAndRobots("/random-garbage.png");
  assert(
    missingAsset.status === 404,
    `unknown asset-like URL /random-garbage.png -> real 404 (got ${missingAsset.status})`,
  );
  assertSecureHtml(missingAsset, "404 /random-garbage.png");

  const redirectsText = fs.readFileSync(path.join(DIST, "_redirects"), "utf8");
  const activeRedirectRules = redirectsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  assert(
    !activeRedirectRules.some(
      (l) =>
        l.startsWith("/* ") && l.includes("/index.html") && l.endsWith("200"),
    ),
    "public/_redirects contains no `/* /index.html 200` SPA wildcard",
  );

  const routesConfig = JSON.parse(
    fs.readFileSync(path.join(DIST, "_routes.json"), "utf8"),
  );
  const excludedRules = new Set(routesConfig.exclude ?? []);
  // Function-owned or config entries are intentionally not excluded.
  const functionOwnedEntries = new Set([
    "_headers",
    "_redirects",
    "_routes.json",
    "index.html",
    "ja",
    "destinations",
  ]);
  const staticFamilies = fs
    .readdirSync(DIST)
    .filter((entry) => !functionOwnedEntries.has(entry));
  const uncoveredFamilies = staticFamilies.filter(
    (entry) =>
      !excludedRules.has(`/${entry}`) && !excludedRules.has(`/${entry}/*`),
  );
  assert(
    uncoveredFamilies.length === 0,
    `_routes.json excludes every static family in the built output (uncovered: ${uncoveredFamilies.join(", ") || "none"})`,
  );
  assert(
    !excludedRules.has("/destinations/*"),
    "_routes.json does not exclude /destinations/* (destination Functions keep precedence)",
  );

  // KAI-81: the static layer (public/_headers) and Function responses
  // (SECURITY_HEADERS in src/seo/meta.ts) must serve the SAME
  // Permissions-Policy so the browser policy does not silently diverge
  // depending on which layer answered the request.
  const staticPolicy = (await fetchStatusAndRobots(builtAsset))
    .permissionsPolicy;
  const functionPolicy = (await fetchStatusAndRobots("/settings"))
    .permissionsPolicy;
  assert(
    staticPolicy !== null &&
      functionPolicy !== null &&
      normalizePolicy(staticPolicy) === normalizePolicy(functionPolicy),
    `static (_headers) and Function (SECURITY_HEADERS) Permissions-Policy agree (static: ${staticPolicy ?? "MISSING"}, function: ${functionPolicy ?? "MISSING"})`,
  );

  console.log("Pages Function runtime verification complete.");
  // Respect exitCode recorded by any failed assert().
  exit();
} catch (error) {
  console.error(error.message);
  console.error(serverLog.slice(-2000));
  exit(1);
}
