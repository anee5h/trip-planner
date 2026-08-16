#!/usr/bin/env node
/**
 * KAI-81: production security-header smoke check.
 *
 * Verifies the required browser/security policies are actually served on
 * production responses (home, a canonical destination, the JA mirror, a
 * catch-all SPA route, a real hashed static asset, and a 404 route) and
 * that they have not silently weakened. Fails closed with a clear message
 * on any violation.
 *
 * The hashed production asset is discovered from dist/index.html — the
 * caller (security-smoke workflow) builds first, so the local build's hash
 * matches the deployed artifact.
 *
 * Usage: node scripts/check-security-headers.mjs [baseUrl]
 * Default baseUrl: https://meguruto.app
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.argv[2] ?? "https://meguruto.app";

/**
 * Must stay byte-identical (modulo whitespace) to the policy served by
 * public/_headers and src/seo/meta.ts (SECURITY_HEADERS). Any weakening —
 * e.g. camera=(self), or a feature flipped back on — fails the check.
 * notifications= is deliberately absent: it is not a Permissions-Policy-
 * controlled feature per the W3C permissions registry.
 */
const EXPECTED_PERMISSIONS_POLICY =
  "camera=(), microphone=(), payment=(), usb=(), battery=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), display-capture=(), fullscreen=(), picture-in-picture=(), screen-wake-lock=(), serial=(), sync-xhr=(), xr-spatial-tracking=(), geolocation=(self), clipboard-read=(self), clipboard-write=(self)";

const REQUIRED = [
  [
    "strict-transport-security",
    (v) => v.includes("max-age=31536000") && v.includes("preload"),
    "HSTS with preload",
  ],
  ["x-frame-options", (v) => v === "DENY", "X-Frame-Options: DENY"],
  [
    "x-content-type-options",
    (v) => v === "nosniff",
    "X-Content-Type-Options: nosniff",
  ],
  [
    "referrer-policy",
    (v) => v.includes("strict-origin"),
    "Referrer-Policy strict-origin",
  ],
  [
    "cross-origin-opener-policy",
    (v) => v === "same-origin",
    "COOP same-origin",
  ],
  ["cross-origin-resource-policy", (v) => v === "same-site", "CORP same-site"],
  [
    "content-security-policy",
    (v) =>
      v.includes("frame-ancestors 'none'") &&
      v.includes("object-src 'none'") &&
      v.includes("base-uri 'none'") &&
      v.includes("default-src 'self'") &&
      v.includes("form-action 'self'") &&
      v.includes("upgrade-insecure-requests"),
    "CSP critical directives (incl. form-action 'self')",
  ],
  [
    "permissions-policy",
    (v) =>
      v.replace(/\s+/g, " ").trim() === EXPECTED_PERMISSIONS_POLICY &&
      !v.includes("notifications="),
    "Permissions-Policy matches the least-privilege contract",
  ],
];

/** Discovers the hashed entry asset (e.g. /assets/index-XXXX.js) from the
 *  production build so the smoke checks a real static asset URL. */
function discoverBuiltAsset() {
  const shellPath = path.join(process.cwd(), "dist", "index.html");
  if (!existsSync(shellPath)) {
    console.error(
      "FAIL: dist/index.html not found — run `npm run build` first (the security-smoke workflow builds before this step).",
    );
    process.exit(1);
  }
  const shell = readFileSync(shellPath, "utf8");
  const match = shell.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  if (!match) {
    console.error("FAIL: no module script found in dist/index.html");
    process.exit(1);
  }
  return match[1];
}

function assert(cond, message) {
  if (!cond) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

async function checkRoute(route, expectedStatus = 200) {
  const res = await fetch(`${BASE_URL}${route}`);
  assert(
    res.status === expectedStatus,
    `${route} -> ${expectedStatus} (got ${res.status})`,
  );
  for (const [header, test, label] of REQUIRED) {
    const value = res.headers.get(header);
    assert(
      value !== null && test(value),
      `${route}: ${label} (got ${value ?? "MISSING"})`,
    );
  }
  return res;
}

async function check() {
  const builtAsset = discoverBuiltAsset();

  // Home, canonical destination, JA mirror, and a catch-all SPA route
  // (exercises the KAI-111 Function path) — all must serve the full
  // required-header contract.
  const routes = [
    "/",
    "/destinations/abashiri-city",
    "/ja/",
    "/settings",
    builtAsset,
  ];
  for (const route of routes) {
    await checkRoute(route);
  }

  // Real 404 route (KAI-111): full required-header contract, not CSP alone.
  const notFound = await checkRoute("/this-path-does-not-exist-xyz", 404);
  assert(
    (notFound.headers.get("x-robots-tag") ?? "").includes("noindex"),
    `/unknown -> noindex (got ${notFound.headers.get("x-robots-tag")})`,
  );

  if (process.exitCode) {
    console.error("❌ security header smoke check FAILED");
    process.exit(1);
  }
  console.log(
    `✅ security headers OK on ${BASE_URL} (${routes.length} routes + 404 contract)`,
  );
}

check().catch((err) => {
  console.error(`❌ FAIL: ${err.message}`);
  process.exit(1);
});
