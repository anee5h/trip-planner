#!/usr/bin/env node
/**
 * KAI-81/KAI-283: production security-header smoke check.
 *
 * Verifies the required browser/security policies on the deployment actually
 * serving production. The entry asset is discovered from production HTML, not
 * from this checkout's build, because Vite asset hashes are deployment data.
 * The deployed Vite manifest/version module also identifies the commit serving
 * the custom domain when the caller supplies EXPECTED_DEPLOYMENT_SHA.
 *
 * Usage: node scripts/check-security-headers.mjs [baseUrl]
 * Exit codes: 0 pass, 1 application/deployment failure, 2 Cloudflare challenge.
 */
import { pathToFileURL } from "node:url";

const BASE_URL = (process.argv[2] ?? "https://meguruto.app").replace(
  /\/+$/,
  "",
);
const EXPECTED_DEPLOYMENT_SHA =
  process.env.EXPECTED_DEPLOYMENT_SHA?.trim() || null;

export const FUNCTION_404_ROUTE = "/destinations/this-path-does-not-exist-xyz";
export const STATIC_404_ROUTE = "/this-path-does-not-exist-xyz";

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

/** Classifies only recognizable Cloudflare challenge responses as challenges. */
export function classifyResponse({ status, headers, body }) {
  if (status !== 403) return "application";

  const cfMitigated =
    headers.get("cf-mitigated")?.toLowerCase() === "challenge";
  const server = headers.get("server")?.toLowerCase() ?? "";
  const challengeBody = /just a moment|challenge-platform|cf-chl-/i.test(body);

  return cfMitigated || (server.includes("cloudflare") && challengeBody)
    ? "cloudflare-challenge"
    : "application";
}

/** Finds the actual entry module URL advertised by the live HTML shell. */
export function discoverAssetPath(html) {
  const match = html.match(
    /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/i,
  );
  if (!match) {
    throw new Error("production HTML has no module entry asset");
  }
  return new URL(match[1], `${BASE_URL}/`).pathname;
}

/** Finds the version module in a deployed Vite manifest. */
export function discoverVersionAssetPath(manifest) {
  const versionEntry = Object.values(manifest).find(
    (entry) => entry?.name === "version" && typeof entry.file === "string",
  );
  return versionEntry ? `/${versionEntry.file.replace(/^\/+/, "")}` : null;
}

/** Extracts the 40-character build commit baked into src/shared/utils/version.ts. */
export function extractCommitSha(versionModule) {
  return versionModule.match(/\b([0-9a-f]{40})\b/i)?.[1] ?? null;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

async function fetchProduction(route) {
  const response = await fetch(`${BASE_URL}${route}`, { redirect: "manual" });
  const body = await response.text();
  const classification = classifyResponse({
    status: response.status,
    headers: response.headers,
    body,
  });

  if (classification === "cloudflare-challenge") {
    const error = new Error(
      `Cloudflare challenge intercepted ${route} (HTTP ${response.status})`,
    );
    error.code = "cloudflare-challenge";
    error.route = route;
    throw error;
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}

async function discoverDeployment() {
  const shell = await fetchProduction("/");
  assert(shell.status === 200, `production shell -> 200 (got ${shell.status})`);
  const asset = discoverAssetPath(shell.body);

  const manifestResponse = await fetchProduction("/.vite/manifest.json");
  if (manifestResponse.status !== 200) {
    throw new Error(
      `deployed Vite manifest unavailable (HTTP ${manifestResponse.status})`,
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestResponse.body);
  } catch {
    throw new Error("deployed Vite manifest is not valid JSON");
  }

  const versionAsset = discoverVersionAssetPath(manifest);
  if (!versionAsset) {
    throw new Error("deployed Vite manifest has no version asset");
  }

  const versionResponse = await fetchProduction(versionAsset);
  if (versionResponse.status !== 200) {
    throw new Error(
      `deployed version asset ${versionAsset} -> 200 (got ${versionResponse.status})`,
    );
  }
  const commitSha = extractCommitSha(versionResponse.body);
  if (!commitSha) {
    throw new Error(`deployed version asset ${versionAsset} has no commit SHA`);
  }

  return { asset, versionAsset, commitSha };
}

async function checkRoute(route, expectedStatus = 200) {
  const result = await fetchProduction(route);
  assert(
    result.status === expectedStatus,
    `${route} -> ${expectedStatus} (got ${result.status})`,
  );
  for (const [header, test, label] of REQUIRED) {
    const value = result.headers.get(header);
    assert(
      value !== null && test(value),
      `${route}: ${label} (got ${value ?? "MISSING"})`,
    );
  }
  return result;
}

async function check() {
  const deployment = await discoverDeployment();
  console.log(`ℹ️ deployed entry asset: ${deployment.asset}`);
  console.log(`ℹ️ deployed version asset: ${deployment.versionAsset}`);
  console.log(`ℹ️ deployed commit: ${deployment.commitSha}`);

  if (
    EXPECTED_DEPLOYMENT_SHA &&
    deployment.commitSha !== EXPECTED_DEPLOYMENT_SHA
  ) {
    const error = new Error(
      `deployment drift: expected ${EXPECTED_DEPLOYMENT_SHA}, live ${deployment.commitSha}`,
    );
    error.code = "deployment-drift";
    throw error;
  }

  // Home, canonical destination, JA mirror, private SPA route, and the actual
  // deployed hashed asset. The asset comes from production HTML, not dist/.
  const routes = [
    "/",
    "/destinations/abashiri-city",
    "/ja/",
    "/settings",
    deployment.asset,
  ];
  for (const route of routes) {
    await checkRoute(route);
  }

  // Function-owned destination 404s carry the HTTP noindex contract. This is
  // intentionally distinct from arbitrary paths, which are cheap static 404s.
  const functionNotFound = await checkRoute(FUNCTION_404_ROUTE, 404);
  assert(
    functionNotFound.headers.get("x-robots-tag") === "noindex, follow",
    `${FUNCTION_404_ROUTE}: X-Robots-Tag noindex, follow (got ${functionNotFound.headers.get("x-robots-tag") ?? "MISSING"})`,
  );

  const jaFunctionNotFound = await checkRoute(
    "/ja/destinations/this-path-does-not-exist-xyz",
    404,
  );
  assert(
    jaFunctionNotFound.headers.get("x-robots-tag") === "noindex, follow",
    "/ja destination 404 preserves the HTTP noindex contract",
  );

  // Arbitrary paths bypass Functions by design (KAI-250) and are served by
  // the static locale-aware 404 document. Its noindex contract is body-level;
  // requiring X-Robots-Tag here would reintroduce the removed catch-all.
  const staticNotFound = await checkRoute(STATIC_404_ROUTE, 404);
  assert(
    /<meta[^>]+name="robots"[^>]+content="noindex, follow"/.test(
      staticNotFound.body,
    ),
    `${STATIC_404_ROUTE}: static 404 body is noindex, follow`,
  );

  if (process.exitCode) {
    console.error("❌ security header smoke check FAILED");
    process.exit(1);
  }
  console.log(
    `✅ security headers OK on ${BASE_URL} (${routes.length} routes + Function/static 404 contracts)`,
  );
}

const invokedAsScript =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  check().catch((error) => {
    if (error.code === "cloudflare-challenge") {
      console.error(`⚠️ CLOUDFLARE_CHALLENGE: ${error.message}`);
      console.error(
        "The edge challenge prevented application verification; this is not an application-header verdict.",
      );
      process.exit(2);
    }
    if (error.code === "deployment-drift") {
      console.error(`❌ DEPLOYMENT_DRIFT: ${error.message}`);
      process.exit(1);
    }
    console.error(`❌ FAIL: ${error.message}`);
    process.exit(1);
  });
}
