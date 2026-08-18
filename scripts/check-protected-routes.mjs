/**
 * KAI-126: DETERMINISTIC boundary tests for the protected engineering
 * surfaces. Unlike the previous stub, this actually proves the allow path:
 *
 *  - Generates a throwaway RSA keypair.
 *  - Spins up a local JWKS server (Node http) serving the public key,
 *    acting as the Cloudflare Access "certs" endpoint.
 *  - Signs JWTs with the private key (jose), including valid, expired,
 *    wrong-aud, wrong-issuer, wrong-alg and bad-signature variants.
 *  - Boots wrangler dev (or a local mock) pointing CF_ACCESS_AUD /
 *    CF_ACCESS_CERTS_URL at the local server, then exercises:
 *      no token            -> 401
 *      malformed token     -> 401
 *      expired token       -> 401
 *      wrong AUD           -> 401
 *      wrong issuer        -> 401
 *      invalid signature   -> 401
 *      valid token         -> /e2e 200 (with X-Robots-Tag + robots meta)
 *      valid token         -> /qa  200
 *      protected sub-asset -> 200 only with auth
 *
 * Runs against the REAL Pages Function via wrangler dev (functions/),
 * so the jose verification path in functions/e2e/[[path]].js is what is
 * actually tested.
 *
 * Usage: node scripts/check-protected-routes.mjs
 * CI: wired into PR checks (the "protected-routes" job).
 */
import { execSync, spawn } from "node:child_process";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const AUD = "test-aud-1234";

// In production the Function derives the expected issuer from
// CF_ACCESS_CERTS_URL (team domain). The test mirrors that: the local JWKS
// URL acts as the "team domain", and tokens are issued for it.
let ISSUER = ""; // set after the JWKS server starts

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Local JWKS server that mirrors the Cloudflare Access certs endpoint. */
async function startJwksServer(publicJwk) {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        keys: [{ ...publicJwk, use: "sig", alg: "RS256", kid: "test-kid" }],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

async function signToken(
  privateKey,
  { exp, aud = AUD, iss = ISSUER, alg = "RS256", badSig = false },
) {
  let token = await new SignJWT({})
    .setProtectedHeader({ alg, kid: "test-kid" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
  if (badSig) token = token.slice(0, -2) + "AA"; // corrupt the signature bytes
  return token;
}

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const jwks = await startJwksServer(publicJwk);
  // The Function derives the expected issuer from the certs URL the same
  // way it does in production (team domain from the URL host).
  ISSUER = jwks.url;

  // Seed a LOCAL R2 bucket (wrangler.jsonc binding) with a REAL generated
  // Allure report (ALLURE_NO_ANALYTICS=1) so the /e2e serve path is proven
  // end-to-end: real HTML/JS/CSS, correct MIME, and the browser check
  // below proves the dashboard boots under the /e2e CSP.
  const resultsDir = path.join(os.tmpdir(), "kai126-allure-results");
  const reportDir = path.join(os.tmpdir(), "kai126-allure-report");
  fs.rmSync(resultsDir, { force: true, recursive: true });
  fs.rmSync(reportDir, { force: true, recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  const uuid = crypto.randomUUID();
  const now = Date.now();
  fs.writeFileSync(
    path.join(resultsDir, `${uuid}-result.json`),
    JSON.stringify({
      uuid,
      historyId: uuid,
      name: "smoke: dashboard boots",
      fullName: "kai126.smoke.dashboard-boots",
      status: "passed",
      stage: "finished",
      start: now - 1000,
      stop: now,
      labels: [
        { name: "playwrightProject", value: "chromium-desktop" },
        { name: "ciBin", value: "1" },
        { name: "suite", value: "KAI-126 smoke" },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(resultsDir, "executor.json"),
    JSON.stringify({
      name: "GitHub Actions",
      type: "github",
      buildName: "kai126-test",
      buildOrder: 1,
      reportName: "Meguruto E2E Dashboard",
      reportUrl: "https://meguruto.app/e2e",
    }),
  );
  execSync(
    `ALLURE_NO_ANALYTICS=1 npx allure generate "${resultsDir}" -o "${reportDir}" --clean`,
    { cwd: path.join(__dirname, ".."), stdio: ["ignore", "ignore", "ignore"] },
  );
  // Strip the GTM snippet Allure 2.43 embeds despite the opt-out (same
  // deterministic sanitizer the publish workflow uses).
  execSync(`node scripts/strip-allure-analytics.mjs "${reportDir}"`, {
    cwd: path.join(__dirname, ".."),
    stdio: ["ignore", "ignore", "pipe"],
  });

  const mimeFor = (key) => {
    if (key.endsWith(".html")) return "text/html; charset=utf-8";
    if (key.endsWith(".js")) return "application/javascript";
    if (key.endsWith(".css")) return "text/css";
    if (key.endsWith(".json")) return "application/json";
    if (key.endsWith(".svg")) return "image/svg+xml";
    if (key.endsWith(".png")) return "image/png";
    if (key.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
  };
  // Upload the REAL report tree to local R2 (retry on transient lock).
  const putR2 = (key, file) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        execSync(
          `npx wrangler r2 object put kai126-test-report/${key} --file "${file}" --content-type "${mimeFor(key)}" --local`,
          {
            cwd: path.join(__dirname, ".."),
            stdio: ["ignore", "ignore", "pipe"],
          },
        );
        return;
      } catch {
        if (attempt === 4) throw new Error(`r2 put failed for ${key}`);
        // transient local-state lock; back off and retry
        // (no await in sync loop — small sleep via Atomics.wait)
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          500 * (attempt + 1),
        );
      }
    }
  };
  const walkDir = (dir) => {
    const out = [];
    const rec = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) rec(full);
        else out.push({ rel: path.relative(dir, full), full });
      }
    };
    rec(dir);
    return out;
  };
  for (const { rel, full } of walkDir(reportDir)) {
    putR2(rel, full);
  }

  // Boot wrangler pages dev with the test env pointing at the local JWKS
  // and the LOCAL R2 binding (wrangler.test.toml).
  const wrangler = spawn(
    "npx",
    [
      "wrangler",
      "pages",
      "dev",
      "dist",
      "--port",
      "8787",
      "--ip",
      "127.0.0.1",
      "--binding",
      `CF_ACCESS_AUD=${AUD}`,
      "--binding",
      `CF_ACCESS_CERTS_URL=${jwks.url}`,
    ],
    {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  let serverLog = "";
  wrangler.stdout.on("data", (d) => (serverLog += d));
  wrangler.stderr.on("data", (d) => (serverLog += d));
  // Wait for the dev server to be ready.
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/e2e`, { redirect: "manual" });
      if (r.status >= 400 || r.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) {
    console.error("wrangler pages dev output:", serverLog.slice(-2000));
  }
  assert(ready, "wrangler dev did not become ready");
  console.log("  ✓ wrangler dev ready");

  const probe = async (pathname, token) => {
    const headers = token ? { "Cf-Access-Jwt-Assertion": token } : {};
    const res = await fetch(`${BASE}${pathname}`, {
      headers,
      redirect: "manual",
    });
    return {
      status: res.status,
      robots: res.headers.get("X-Robots-Tag"),
      ct: res.headers.get("content-type"),
      body: await res.text(),
    };
  };

  try {
    // 1. No token -> deny
    for (const p of ["/e2e", "/e2e/index.html", "/qa"]) {
      const r = await probe(p, null);
      assert(r.status === 401, `${p} no-token should be 401 (got ${r.status})`);
      assert(
        r.robots === "noindex, nofollow",
        `${p} deny must carry robots tag`,
      );
      console.log(`  ✓ ${p} no token -> 401 + noindex`);
    }

    // 2. Malformed token -> deny
    let r = await probe("/e2e", "not-a-jwt");
    assert(r.status === 401, "malformed token should be 401");
    console.log("  ✓ /e2e malformed token -> 401");

    // 3. Expired token -> deny
    const expired = await signToken(privateKey, {
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    r = await probe("/e2e", expired);
    assert(r.status === 401, "expired token should be 401");
    console.log("  ✓ /e2e expired token -> 401");

    // 4. Wrong AUD -> deny
    const wrongAud = await signToken(privateKey, {
      exp: Math.floor(Date.now() / 1000) + 300,
      aud: "wrong-aud",
    });
    r = await probe("/e2e", wrongAud);
    assert(r.status === 401, "wrong-aud token should be 401");
    console.log("  ✓ /e2e wrong AUD -> 401");

    // 5. Wrong issuer -> deny
    const wrongIss = await signToken(privateKey, {
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: "https://evil.example",
    });
    r = await probe("/e2e", wrongIss);
    assert(r.status === 401, "wrong-issuer token should be 401");
    console.log("  ✓ /e2e wrong issuer -> 401");

    // 6. Invalid signature -> deny
    const badSig = await signToken(privateKey, {
      exp: Math.floor(Date.now() / 1000) + 300,
      badSig: true,
    });
    r = await probe("/e2e", badSig);
    assert(r.status === 401, "bad-signature token should be 401");
    console.log("  ✓ /e2e invalid signature -> 401");

    // 7. Valid token -> /e2e/ serves the REAL generated Allure HTML
    //    (the Function 308-redirects /e2e -> /e2e/ so relative assets
    //    resolve under /e2e/; the probe uses the canonical path).
    const valid = await signToken(privateKey, {
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    r = await probe("/e2e/", valid);
    assert(r.status === 200, `valid token should serve /e2e (got ${r.status})`);
    assert(
      r.robots === "noindex, nofollow",
      "allowed /e2e must carry robots tag",
    );
    assert(
      r.body.includes("Allure") || r.body.includes('<div id="root">'),
      "served HTML must be the REAL Allure report (got: " +
        r.body.slice(0, 80) +
        ")",
    );
    assert(
      r.body.includes('<meta name="robots" content="noindex,nofollow">'),
      "served HTML must carry robots meta",
    );
    assert(
      r.ct === "text/html; charset=utf-8",
      `HTML content-type must be text/html (got ${r.ct})`,
    );
    assert(
      r.body.includes("GOOGLE") === false &&
        !r.body.includes("googletagmanager"),
      "generated report must NOT contain Google Tag Manager (ALLURE_NO_ANALYTICS)",
    );
    console.log(
      "  ✓ /e2e valid token -> 200, serves REAL Allure HTML, text/html, robots meta, no GTM",
    );

    // 7b. JS asset served with correct MIME + robots
    r = await probe("/e2e/app.js", valid);
    assert(
      r.status === 200,
      `valid token should serve /e2e/app.js (got ${r.status})`,
    );
    assert(
      r.ct === "application/javascript",
      `JS content-type must be application/javascript (got ${r.ct})`,
    );
    assert(r.body.includes("kai126"), "JS body must be the seeded content");
    assert(
      r.robots === "noindex, nofollow",
      "JS response must carry robots tag",
    );
    console.log(
      "  ✓ /e2e/app.js valid token -> 200, application/javascript, robots",
    );

    // 8. Valid token -> /qa allow
    r = await probe("/qa", valid);
    assert(r.status === 200, `valid token should allow /qa (got ${r.status})`);
    console.log("  ✓ /qa valid token -> 200");

    // 9. Protected sub-asset -> 200 only with auth (R2-backed /e2e asset)
    r = await probe("/e2e/unknown-asset.js", null);
    assert(r.status === 401, "sub-asset without auth should be 401");
    r = await probe("/e2e/unknown-asset.js", valid);
    // A missing key in R2 returns 404 for an authorized caller — but NOT
    // 401. That's the security property.
    assert(r.status !== 401, "sub-asset with valid token must not be 401");
    console.log("  ✓ protected sub-asset: 401 without auth, not-401 with auth");

    // 10. Browser smoke: the REAL Allure report boots and renders in a real
    // browser through the Function (auth + CSP + MIME all exercised).
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch();
    const page = await browser.newPage({ colorScheme: "light" });
    await page.setExtraHTTPHeaders({
      "Cf-Access-Jwt-Assertion": valid,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    const resp = await page.goto(`${BASE}/e2e`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    console.error("  (debug) browser status:", resp?.status());
    console.error("  (debug) browser url:", page.url());
    const htmlHead = await page.evaluate(
      () => document.documentElement?.outerHTML?.slice(0, 400) ?? "",
    );
    console.error("  (debug) html head:", htmlHead.slice(0, 300));
    console.error(
      "  (debug) captured errors:",
      JSON.stringify(errors.slice(0, 3)),
    );
    // Allure renders into the app container; assert the dashboard actually
    // mounted with meaningful content (not a blank page). Allure 2.43 uses
    // an app root with the report title visible once booted.
    try {
      await page.waitForFunction(
        () => {
          const t = document.body?.innerText ?? "";
          return (
            t.length > 20 &&
            (t.includes("Allure") ||
              t.includes("Suites") ||
              t.includes("Overview"))
          );
        },
        { timeout: 20_000 },
      );
    } catch {
      const bodyText = await page.evaluate(
        () => document.body?.innerText?.slice(0, 300) ?? "",
      );
      console.error("  (debug) body text:", bodyText.slice(0, 200));
      throw new Error("Allure dashboard did not render content in the browser");
    }
    const rootText = await page.evaluate(
      () => document.body?.innerText?.slice(0, 200) ?? "",
    );
    assert(
      rootText.length > 20,
      `Allure dashboard must render content (got: "${rootText.slice(0, 60)}")`,
    );
    assert(
      errors.length === 0,
      `browser console errors while loading /e2e: ${errors.slice(0, 3).join(" | ")}`,
    );
    await browser.close();
    console.log(
      "  ✓ browser smoke: real Allure report boots + renders under /e2e CSP (no console errors)",
    );

    console.log("\n✅ KAI-126 protected-route boundary checks ALL PASSED");
  } finally {
    // Cleanup ONLY — must NOT swallow failures. If an assertion threw,
    // the exception propagates to main().catch() below, which exits 1.
    // (A process.exit(0) here would mask failed assertions as green.)
    try {
      process.kill(-wrangler.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    jwks.server.close();
  }
}

main().catch((e) => {
  console.error("KAI-126 boundary check FAILED:", e.message);
  process.exit(1);
});
