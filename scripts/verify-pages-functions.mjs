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
 *   unknown slug                 -> 404, noindex
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
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const GA4_URL = "https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190";

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

function assertGa4DocumentShell(result, label) {
  const loaderCount = result.body.split(GA4_URL).length - 1;
  const initCount = result.body.split('src="/ga4-init.js"').length - 1;
  assert(
    loaderCount === 1 && initCount === 1,
    `${label} contains one static GA4 loader and one init reference (got ${loaderCount}/${initCount})`,
  );
}

function assertSecureHtml(result, label) {
  if (result.status === 200 && result.body.includes('<div id="root">')) {
    assertGa4DocumentShell(result, label);
  }
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

function assertReal404(result, label) {
  assert(result.status === 404, `${label} -> real 404 (got ${result.status})`);
  assert(
    !result.body.includes('<div id="root">') &&
      (result.robots?.includes("noindex") ||
        (result.body.includes('name="robots"') &&
          result.body.includes("noindex"))),
    `${label} does not return the SPA shell and is noindex`,
  );
  assertSecureHtml(result, label);
}

function normalizePolicy(value) {
  return value.replace(/\s+/g, " ").trim();
}

/** Synthetic JWT for the runtime endpoint tests (amr in UNIX SECONDS). */
function makeRuntimeJwt(amrSeconds) {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub: "runtime-test-user",
    role: "authenticated",
    amr: [{ method: "oauth", timestamp: amrSeconds, provider: "google" }],
  })}.ZmFrZS1zaWduYXR1cmU`;
}

// KAI-44: a local mock Supabase so the account-deletion endpoint can run
// END-TO-END in the real workerd runtime (binding SUPABASE_URL to it).
// This proves the Function's web-runtime-only JWT decoding (atob /
// TextDecoder) executes — a Node-only API like Buffer would crash here.
const mockSupabase = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body ? JSON.stringify(body) : "");
    };
    if (url.pathname === "/auth/v1/user")
      return send(200, { id: "runtime-test-user" });
    if (url.pathname === "/auth/v1/token")
      return send(200, { user: { id: "runtime-test-user" } });
    if (
      /\/rest\/v1\/(trips|user_data|feedback)\?/.test(
        `${url.pathname}${url.search}`,
      )
    ) {
      return send(204);
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) return send(204);
    return send(404, {});
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});
const MOCK_SUPABASE_URL = `http://127.0.0.1:${mockSupabase.address().port}`;

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
    "--binding",
    `SUPABASE_URL=${MOCK_SUPABASE_URL}`,
    "--binding",
    "SUPABASE_SERVICE_ROLE_KEY=fake-service-key",
    "--binding",
    "SUPABASE_PUBLISHABLE_KEY=fake-publishable-key",
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
  try {
    mockSupabase.close();
  } catch {
    // already closed
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
  // KAI-114: the RENDERED Japanese home carries the Katakana brand in the
  // title and the site-level WebSite entity — not just source constants.
  assert(
    jaHome.body.includes("メグルト"),
    "JA home shell renders the Katakana brand メグルト",
  );
  assert(
    jaHome.body.includes('"@type":"WebSite"') &&
      jaHome.body.includes('"alternateName":["メグルト","meguruto.app"]'),
    "JA home shell renders the WebSite entity with the Japanese alternateName",
  );

  const enHome = await fetchStatusAndRobots("/");
  assert(
    enHome.status === 200 &&
      enHome.body.includes('"@type":"WebSite"') &&
      enHome.body.includes('"name":"Meguruto"'),
    `EN home shell renders the WebSite entity (got ${enHome.status})`,
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

  // KAI-111/KAI-198: unknown public routes return REAL 404s, not soft-200
  // shells. Exact known routes are Function-owned; the static 404 page owns
  // arbitrary paths so scanner traffic does not consume a Function request.
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
    assertReal404(res, `unknown route ${path}`);
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

  for (const path of ["/qa", "/qa/unknown", "/ja/qa", "/ja/qa/unknown"]) {
    const res = await fetchStatusAndRobots(path);
    assert(
      res.status === 401 && res.robots === "noindex, nofollow",
      `protected QA route ${path} -> 401 + noindex (got ${res.status} ${res.robots})`,
    );
    assertSecureHtml(res, `protected QA ${path}`);
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
    "/ja/editorial",
    "/ja/compare",
  ]) {
    const res = await fetchStatusAndRobots(path);
    assert(
      res.robots?.startsWith("noindex"),
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
  assertReal404(malformed, "malformed destination id");

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

  // KAI-198: a top-level 404.html disables Pages' default SPA fallback for
  // excluded static families, so all hostile/static-looking misses are
  // cheap static 404s rather than catch-all Function requests.
  for (const path of [
    "/wp-admin",
    "/wp-login.php",
    "/.env",
    "/.git/config",
    "/phpmyadmin",
    "/server-status",
    "/random-uuid-garbage",
    "/assets/nonexistent.js",
    "/data/nonexistent.json",
    "/random-garbage.png",
  ]) {
    const missing = await fetchStatusAndRobots(path);
    assertReal404(missing, `hostile/static miss ${path}`);
  }

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
  assert(
    !routesConfig.include.includes("/*"),
    "_routes.json does not invoke Functions for every path",
  );
  assert(
    routesConfig.include.includes("/destinations/*") &&
      routesConfig.include.includes("/ja/destinations/*") &&
      routesConfig.include.includes("/api/feedback") &&
      routesConfig.include.includes("/api/errors") &&
      routesConfig.include.includes("/api/account/delete"),
    "_routes.json keeps destination, API, EN, and JA Function families",
  );
  assert(
    routesConfig.include.length + (routesConfig.exclude?.length ?? 0) <= 100,
    "_routes.json stays within Cloudflare's 100-rule limit",
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

  // KAI-46: source maps must not ship (vite default) — stack heads in
  // error_events reference minified frames by design.
  const sourceMaps = fs
    .readdirSync(DIST, { recursive: true })
    .filter((entry) => String(entry).endsWith(".map"));
  assert(
    sourceMaps.length === 0,
    `production build publishes no source maps (found: ${sourceMaps.join(", ") || "none"})`,
  );

  // KAI-44: real-runtime account-deletion contract against the mock
  // Supabase binding. The Function must decode the JWT with web
  // primitives only (atob/TextDecoder) — a Node-only API like Buffer
  // would crash the isolate here, which is exactly what this catches.
  const freshRuntimeToken = makeRuntimeJwt(Math.floor(Date.now() / 1000) - 60);
  const staleRuntimeToken = makeRuntimeJwt(
    Math.floor(Date.now() / 1000) - 3600,
  );
  const deletion = async (token, body) => {
    const res = await fetch(`${BASE}/api/account/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const runtimeOtpOk = await deletion(freshRuntimeToken, { reauthMode: "otp" });
  assert(
    runtimeOtpOk.status === 200 && runtimeOtpOk.json.ok === true,
    `runtime /api/account/delete otp fresh-amr -> 200 ok (got ${runtimeOtpOk.status} ${JSON.stringify(runtimeOtpOk.json)})`,
  );
  const runtimeOtpStale = await deletion(staleRuntimeToken, {
    reauthMode: "otp",
  });
  assert(
    runtimeOtpStale.status === 401 &&
      runtimeOtpStale.json.error === "reauth_required",
    `runtime /api/account/delete otp stale-amr -> 401 reauth_required before any DELETE (got ${runtimeOtpStale.status})`,
  );
  const runtimePw = await deletion(freshRuntimeToken, {
    reauthMode: "password",
    email: "u@example.com",
    password: "correct",
  });
  assert(
    runtimePw.status === 200 && runtimePw.json.ok === true,
    `runtime /api/account/delete password grant -> 200 ok (got ${runtimePw.status} ${JSON.stringify(runtimePw.json)})`,
  );

  // KAI-64: the PWA endpoints must be served as REAL static resources
  // (public/_routes.json excludes /sw.js, /manifest.webmanifest and
  // /icons/* from Functions — a Function-served response would break the
  // worker's MIME/scope contract or return the SPA shell).
  {
    const sw = await fetch(`${BASE}/sw.js`);
    assert(sw.status === 200, `runtime /sw.js -> 200 (got ${sw.status})`);
    assert(
      (sw.headers.get("content-type") ?? "").includes("javascript"),
      `runtime /sw.js content-type is javascript (got ${sw.headers.get("content-type")})`,
    );
    const swBody = await sw.text();
    assert(
      swBody.includes("meguruto-shell-") &&
        !swBody.includes("meguruto-shell-dev"),
      "runtime /sw.js is the fingerprint-injected production worker",
    );
    assert(
      swBody.includes("skipWaiting") && !swBody.includes("clients.claim"),
      "runtime /sw.js uses the open-tab-safe upgrade sequence (no clients.claim)",
    );
  }
  {
    const manifest = await fetch(`${BASE}/manifest.webmanifest`);
    assert(
      manifest.status === 200,
      `runtime /manifest.webmanifest -> 200 (got ${manifest.status})`,
    );
    assert(
      (manifest.headers.get("content-type") ?? "").includes("manifest"),
      `runtime /manifest.webmanifest content-type (got ${manifest.headers.get("content-type")})`,
    );
    const parsed = await manifest.json();
    assert(
      parsed.name === "Meguruto" && parsed.display === "standalone",
      "runtime /manifest.webmanifest is the real Meguruto manifest",
    );
  }
  for (const icon of [
    "/icons/meguruto-192.png",
    "/icons/meguruto-512.png",
    "/icons/meguruto-maskable-192.png",
    "/icons/meguruto-maskable-512.png",
  ]) {
    const res = await fetch(`${BASE}${icon}`);
    assert(res.status === 200, `runtime ${icon} -> 200 (got ${res.status})`);
    assert(
      (res.headers.get("content-type") ?? "").includes("image/png"),
      `runtime ${icon} content-type is image/png`,
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    assert(isPng, `runtime ${icon} is a real PNG (signature check)`);
  }

  console.log("Pages Function runtime verification complete.");
  // Respect exitCode recorded by any failed assert().
  exit();
} catch (error) {
  console.error(error.message);
  console.error(serverLog.slice(-2000));
  exit(1);
}
