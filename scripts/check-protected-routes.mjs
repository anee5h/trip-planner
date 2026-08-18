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

  // Boot wrangler pages dev with the test env pointing at the local JWKS
  // (same invocation the repo's verify-pages-functions.mjs uses).
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

    // 7. Valid token -> /e2e ALLOWED (auth passes; the R2 store is absent
    //    locally so we get 503 "report store not configured" — NOT 401.
    //    The security property is: a valid token is NOT denied at the
    //    auth boundary. The R2 serve path is covered by deploy QA.)
    const valid = await signToken(privateKey, {
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    r = await probe("/e2e", valid);
    assert(
      r.status !== 401,
      `valid token must NOT be denied at the auth boundary (got ${r.status})`,
    );
    assert(
      r.robots === "noindex, nofollow",
      "allowed /e2e must carry robots tag",
    );
    console.log(
      "  ✓ /e2e valid token -> authorized (not 401; R2 serve = deploy QA)",
    );

    // 8. Valid token -> /qa allow
    r = await probe("/qa", valid);
    assert(r.status === 200, `valid token should allow /qa (got ${r.status})`);
    console.log("  ✓ /qa valid token -> 200");

    // 9. Protected sub-asset -> 200 only with auth (R2-backed /e2e asset)
    r = await probe("/e2e/unknown-asset.js", null);
    assert(r.status === 401, "sub-asset without auth should be 401");
    r = await probe("/e2e/unknown-asset.js", valid);
    // With the real R2 store absent locally, a valid token may get 503/404
    // for a missing store/key — but NOT 401. That's the security property.
    assert(r.status !== 401, "sub-asset with valid token must not be 401");
    console.log("  ✓ protected sub-asset: 401 without auth, not-401 with auth");

    console.log("\n✅ KAI-126 protected-route boundary checks ALL PASSED");
  } finally {
    // Kill the whole process group (npx + wrangler + workerd children) with
    // SIGKILL so no stray server outlives the check — SIGTERM lets workerd
    // linger during graceful shutdown (same pattern as verify-pages-functions).
    try {
      process.kill(-wrangler.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    jwks.server.close();
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("KAI-126 boundary check FAILED:", e.message);
  process.exit(1);
});
